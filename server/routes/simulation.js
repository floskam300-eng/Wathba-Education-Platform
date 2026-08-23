const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db/connection');
const { authenticate, generateToken } = require('../middleware/auth');
const { logActivity, getActor, getIp } = require('../lib/activityLog');

const router = express.Router();
router.use(authenticate);

const ALL_SYSTEM_STAGES = [
  'الصف الأول الابتدائي',
  'الصف الثاني الابتدائي',
  'الصف الثالث الابتدائي',
  'الصف الرابع الابتدائي',
  'الصف الخامس الابتدائي',
  'الصف السادس الابتدائي',
  'الصف الأول الإعدادي',
  'الصف الثاني الإعدادي',
  'الصف الثالث الإعدادي',
  'الصف الأول الثانوي عام',
  'الصف الأول الثانوي بكالوريا',
  'الصف الثاني الثانوي عام',
  'الصف الثاني الثانوي بكالوريا',
  'الصف الثالث الثانوي',
];

// Helper to extract teacher id
const getTeacherId = (req) => {
  if (req.user.role === 'teacher') return req.user.id;
  if (req.user.simulated_by_teacher_id) return req.user.simulated_by_teacher_id;
  if (req.user.teacher_id) return req.user.teacher_id;
  return null;
};

// ── GET /stages: returns all available stages for simulation
router.get('/stages', async (req, res) => {
  const teacherId = getTeacherId(req);
  if (!teacherId) return res.status(403).json({ error: 'Access denied' });

  try {
    // 1. Get stages currently present in teacher's courses or students
    const [coursesStages, studentsStages] = await Promise.all([
      pool.query(
        `SELECT DISTINCT target_stage FROM courses
         WHERE teacher_id = $1 AND target_stage IS NOT NULL AND target_stage != ''`,
        [teacherId]
      ),
      pool.query(
        `SELECT DISTINCT academic_stage FROM students
         WHERE teacher_id = $1 AND deleted_at IS NULL AND academic_stage IS NOT NULL AND academic_stage != '' AND is_simulation IS NOT TRUE`,
        [teacherId]
      ),
    ]);

    const activeStagesSet = new Set();
    coursesStages.rows.forEach(r => r.target_stage && activeStagesSet.add(r.target_stage));
    studentsStages.rows.forEach(r => r.academic_stage && activeStagesSet.add(r.academic_stage));

    // Priority stages: teacher's active stages first, then rest of system stages
    const teacherStages = Array.from(activeStagesSet);
    const otherStages = ALL_SYSTEM_STAGES.filter(s => !activeStagesSet.has(s));
    const combinedStages = [...teacherStages, ...otherStages];

    res.json({
      teacherStages,
      allStages: combinedStages,
      defaultStage: teacherStages[0] || ALL_SYSTEM_STAGES[9], // e.g. 1st sec general
    });
  } catch (err) {
    console.error('[simulation/stages]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /start: starts or resumes simulation session
router.post('/start', async (req, res) => {
  if (req.user.role !== 'teacher' && req.user.role !== 'assistant') {
    return res.status(403).json({ error: 'Access denied: only teachers can start simulation' });
  }

  const teacherId = req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;
  const { academic_stage, auto_enroll = true, reset_data = false, destination = '/student' } = req.body;
  const stage = academic_stage || 'الصف الأول الثانوي عام';

  try {
    // 1. Get teacher info
    const teacherRes = await pool.query('SELECT id, name, slug FROM teachers WHERE id = $1', [teacherId]);
    if (!teacherRes.rows.length) return res.status(404).json({ error: 'Teacher not found' });
    const teacher = teacherRes.rows[0];

    // 2. Find or create simulation student for this teacher
    let simStudent = null;
    const existing = await pool.query(
      'SELECT * FROM students WHERE teacher_id = $1 AND is_simulation = true LIMIT 1',
      [teacherId]
    );

    if (existing.rows.length > 0) {
      simStudent = existing.rows[0];
      // Update stage & name
      const upd = await pool.query(
        `UPDATE students
         SET academic_stage = $1, name = $2, deleted_at = NULL, is_suspended = false
         WHERE id = $3
         RETURNING *`,
        [stage, `طالب تجريبي (${stage})`, simStudent.id]
      );
      simStudent = upd.rows[0];
    } else {
      // Create new sandbox student
      const uname = `sim_${teacherId}_${crypto.randomBytes(3).toString('hex')}`;
      const dummyPassword = crypto.randomBytes(8).toString('hex');
      const hashed = await bcrypt.hash(dummyPassword, 10);
      const ins = await pool.query(
        `INSERT INTO students (username, password, plain_password, name, academic_stage, teacher_id, is_simulation, points, gender)
         VALUES ($1, $2, $3, $4, $5, $6, true, 100, 'ذكر')
         RETURNING *`,
        [uname, hashed, dummyPassword, `طالب تجريبي (${stage})`, stage, teacherId]
      );
      simStudent = ins.rows[0];
    }

    // 3. Reset test data if requested
    if (reset_data) {
      await Promise.all([
        pool.query('DELETE FROM exam_results WHERE student_id = $1', [simStudent.id]),
        pool.query('DELETE FROM exam_sessions WHERE student_id = $1', [simStudent.id]),
        pool.query('DELETE FROM recitation_results WHERE student_id = $1', [simStudent.id]),
        pool.query('DELETE FROM recitation_sessions WHERE student_id = $1', [simStudent.id]),
        pool.query('DELETE FROM video_progress WHERE student_id = $1', [simStudent.id]),
        pool.query('DELETE FROM student_course_enrollment WHERE student_id = $1', [simStudent.id]),
        pool.query('DELETE FROM course_enrollment_requests WHERE student_id = $1', [simStudent.id]),
        pool.query('DELETE FROM exam_retry_requests WHERE student_id = $1', [simStudent.id]),
      ]);
    }

    // 4. Auto enroll in courses matching this stage if enabled
    if (auto_enroll) {
      await pool.query(
        `INSERT INTO student_course_enrollment (student_id, course_id, status, enrollment_date)
         SELECT $1, id, 'active', NOW()
         FROM courses
         WHERE teacher_id = $2
           AND is_published = true
           AND (target_stage = $3 OR target_stage IS NULL OR target_stage = '')
         ON CONFLICT (student_id, course_id) DO UPDATE SET status = 'active'`,
        [simStudent.id, teacherId, stage]
      );
    }

    // 5. Generate Simulation JWT
    const token = generateToken({
      id: simStudent.id,
      role: 'student',
      is_simulation: true,
      simulated_by_teacher_id: teacherId,
      teacher_id: teacherId,
      name: simStudent.name,
      username: simStudent.username,
      academic_stage: stage,
      teacher_slug: teacher.slug,
      points: simStudent.points || 100,
    });

    logActivity({
      teacherId,
      actor: getActor(req),
      action: 'simulation_start',
      entity: { type: 'simulation', name: stage },
      details: { academic_stage: stage, auto_enroll, reset_data },
      ip: getIp(req),
    });

    res.json({
      success: true,
      token,
      user: {
        id: simStudent.id,
        role: 'student',
        is_simulation: true,
        name: simStudent.name,
        username: simStudent.username,
        academic_stage: stage,
        teacher_id: teacherId,
        teacher_slug: teacher.slug,
        points: simStudent.points || 100,
      },
      simulated_stage: stage,
      destination,
    });
  } catch (err) {
    console.error('[simulation/start]', err);
    res.status(500).json({ error: 'Failed to start simulation' });
  }
});

// ── POST /switch-stage: switch stage while in simulation
router.post('/switch-stage', async (req, res) => {
  const isSimulationStudent = req.user.role === 'student' && req.user.is_simulation;
  const isTeacher = req.user.role === 'teacher' || req.user.role === 'assistant';

  if (!isSimulationStudent && !isTeacher) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const teacherId = getTeacherId(req);
  const { academic_stage, auto_enroll = true } = req.body;
  if (!academic_stage) return res.status(400).json({ error: 'academic_stage is required' });

  try {
    const teacherRes = await pool.query('SELECT slug FROM teachers WHERE id = $1', [teacherId]);
    const teacherSlug = teacherRes.rows[0]?.slug || req.user.teacher_slug;

    // Get simulation student
    const studentId = isSimulationStudent ? req.user.id : (
      await pool.query('SELECT id FROM students WHERE teacher_id = $1 AND is_simulation = true LIMIT 1', [teacherId])
    ).rows[0]?.id;

    if (!studentId) return res.status(404).json({ error: 'Simulation student not found' });

    // Update academic_stage
    const upd = await pool.query(
      `UPDATE students
       SET academic_stage = $1, name = $2
       WHERE id = $3
       RETURNING *`,
      [academic_stage, `طالب تجريبي (${academic_stage})`, studentId]
    );
    const simStudent = upd.rows[0];

    // Auto-enroll in new stage courses
    if (auto_enroll) {
      await pool.query(
        `INSERT INTO student_course_enrollment (student_id, course_id, status, enrollment_date)
         SELECT $1, id, 'active', NOW()
         FROM courses
         WHERE teacher_id = $2
           AND is_published = true
           AND (target_stage = $3 OR target_stage IS NULL OR target_stage = '')
         ON CONFLICT (student_id, course_id) DO UPDATE SET status = 'active'`,
        [studentId, teacherId, academic_stage]
      );
    }

    const token = generateToken({
      id: simStudent.id,
      role: 'student',
      is_simulation: true,
      simulated_by_teacher_id: teacherId,
      teacher_id: teacherId,
      name: simStudent.name,
      username: simStudent.username,
      academic_stage: academic_stage,
      teacher_slug: teacherSlug,
      points: simStudent.points || 100,
    });

    res.json({
      success: true,
      token,
      user: {
        id: simStudent.id,
        role: 'student',
        is_simulation: true,
        name: simStudent.name,
        username: simStudent.username,
        academic_stage: academic_stage,
        teacher_id: teacherId,
        teacher_slug: teacherSlug,
        points: simStudent.points || 100,
      },
      simulated_stage: academic_stage,
    });
  } catch (err) {
    console.error('[simulation/switch-stage]', err);
    res.status(500).json({ error: 'Failed to switch stage' });
  }
});

// ── POST /reset: resets test attempts and video progress for simulation student
router.post('/reset', async (req, res) => {
  const isSimulationStudent = req.user.role === 'student' && req.user.is_simulation;
  const isTeacher = req.user.role === 'teacher' || req.user.role === 'assistant';

  if (!isSimulationStudent && !isTeacher) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const teacherId = getTeacherId(req);
  const studentId = isSimulationStudent ? req.user.id : (
    await pool.query('SELECT id FROM students WHERE teacher_id = $1 AND is_simulation = true LIMIT 1', [teacherId])
  ).rows[0]?.id;

  if (!studentId) return res.status(404).json({ error: 'Simulation student not found' });

  try {
    await Promise.all([
      pool.query('DELETE FROM exam_results WHERE student_id = $1', [studentId]),
      pool.query('DELETE FROM exam_sessions WHERE student_id = $1', [studentId]),
      pool.query('DELETE FROM recitation_results WHERE student_id = $1', [studentId]),
      pool.query('DELETE FROM recitation_sessions WHERE student_id = $1', [studentId]),
      pool.query('DELETE FROM video_progress WHERE student_id = $1', [studentId]),
      pool.query('DELETE FROM student_course_enrollment WHERE student_id = $1', [studentId]),
      pool.query('DELETE FROM course_enrollment_requests WHERE student_id = $1', [studentId]),
      pool.query('DELETE FROM exam_retry_requests WHERE student_id = $1', [studentId]),
      pool.query('UPDATE students SET points = 100 WHERE id = $1', [studentId]),
    ]);

    // Re-enroll in current stage courses
    const stageRes = await pool.query('SELECT academic_stage FROM students WHERE id = $1', [studentId]);
    const currentStage = stageRes.rows[0]?.academic_stage;
    if (currentStage) {
      await pool.query(
        `INSERT INTO student_course_enrollment (student_id, course_id, status, enrollment_date)
         SELECT $1, id, 'active', NOW()
         FROM courses
         WHERE teacher_id = $2
           AND is_published = true
           AND (target_stage = $3 OR target_stage IS NULL OR target_stage = '')
         ON CONFLICT (student_id, course_id) DO UPDATE SET status = 'active'`,
        [studentId, teacherId, currentStage]
      );
    }

    res.json({
      success: true,
      message: 'تم إعادة ضبط جميع بيانات وتجارب المعاينة بنجاح',
    });
  } catch (err) {
    console.error('[simulation/reset]', err);
    res.status(500).json({ error: 'Failed to reset simulation progress' });
  }
});

module.exports = router;
