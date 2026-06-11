const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('../db/connection');
const { authenticate, requireRole, invalidateStudentAuthCache } = require('../middleware/auth');
const { invalidateCache } = require('../lib/analyticsCache');
const { getPermissions } = require('../lib/permissionsCache');
const { validateStudent } = require('../middleware/validate');
const { logActivity, getActor, getIp } = require('../lib/activityLog');

const router = express.Router();
router.use(authenticate);

// Rate limiter for student creation — 30 per minute per IP
const addStudentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات إضافة طلاب كثيرة جداً، حاول مرة أخرى بعد دقيقة' },
});

const getTeacherId = (req) => {
  if (req.user.role === 'teacher') return req.user.id;
  return req.user.teacher_id;
};

// ── Stage → username prefix map ──
const STAGE_PREFIXES = {
  'الصف الأول الثانوي':   'H',
  'الصف الثاني الثانوي':  'N',
  'الصف الثالث الثانوي':  'T',
  'الصف الأول الإعدادي':  'A',
  'الصف الثاني الإعدادي': 'B',
  'الصف الثالث الإعدادي': 'C',
};

// Returns the next available username for a teacher + stage (e.g. H001, H002 …)
const generateUsername = async (teacherId, stage, dbPool) => {
  const prefix = STAGE_PREFIXES[stage] || 'S';
  // Fetch all usernames that match PREFIX followed by digits only
  const { rows } = await dbPool.query(
    `SELECT username FROM students
     WHERE teacher_id = $1 AND username ~ $2 AND deleted_at IS NULL`,
    [teacherId, `^${prefix}[0-9]+$`]
  );
  let maxNum = 0;
  for (const row of rows) {
    const n = parseInt(row.username.slice(prefix.length), 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;
  }
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
};

// ── Preview next username for a given stage ──
// GET /students/stages — distinct academic stages for this teacher
router.get('/stages', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      `SELECT DISTINCT academic_stage FROM students
       WHERE teacher_id=$1 AND deleted_at IS NULL AND academic_stage IS NOT NULL
       ORDER BY academic_stage`,
      [teacherId]
    );
    res.json({ stages: result.rows.map(r => r.academic_stage) });
  } catch (err) {
    console.error('[students/stages]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/next-username', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { stage } = req.query;
  if (!stage) return res.status(400).json({ error: 'stage is required' });
  try {
    const username = await generateUsername(teacherId, stage, pool);
    res.json({ username, prefix: STAGE_PREFIXES[stage] || 'S' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// M-1 fix: assistants must have can_view_analytics to list students (PII guard)
router.get('/', requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_view_analytics'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { search } = req.query;
  try {
    const params = [teacherId];
    let searchClause = '';
    if (search && search.trim()) {
      // Escape LIKE special characters so user input like "%" or "_" is treated
      // as literal characters rather than wildcards, preventing unintended
      // full-table scans or surprising match results.
      const escaped = search.trim()
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');
      params.push(`%${escaped}%`);
      searchClause = `AND (s.name ILIKE $2 ESCAPE '\\' OR s.username ILIKE $2 ESCAPE '\\' OR s.phone ILIKE $2 ESCAPE '\\')`;
    }
    const result = await pool.query(
      `SELECT s.id, s.username, s.name, s.phone, s.parent_phone, s.academic_stage,
              s.gender, s.teacher_id, s.points, s.created_at, s.deleted_at, s.fcm_token,
              COUNT(CASE WHEN sce.status = 'active' THEN sce.course_id END)::int as enrolled_courses
       FROM students s
       LEFT JOIN student_course_enrollment sce ON s.id = sce.student_id
       WHERE s.teacher_id = $1 AND s.deleted_at IS NULL ${searchClause}
       GROUP BY s.id ORDER BY s.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

const checkPermission = async (req, res, next, perm) => {
  if (req.user.role === 'teacher') return next();
  try {
    const perms = await getPermissions(req.user.id, pool);
    if (!perms) return res.status(403).json({ error: 'Access denied' });
    if (!perms[perm]) return res.status(403).json({ error: 'Access denied: missing permission' });
    next();
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

router.post('/', addStudentLimiter, requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_add_students'), validateStudent, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { name, phone, parent_phone, academic_stage, gender } = req.body;
    // Auto-generate 6-digit numeric password using crypto (not Math.random)
    const generatedPassword = String(100000 + crypto.randomInt(0, 900000));
    try {
      // Sanitize student name: trim, collapse whitespace, strip control characters
      const safeName = String(name || '').trim().replace(/[\x00-\x1f\x7f-\x9f]/g, '').slice(0, 100);
      if (!safeName) return res.status(400).json({ error: 'اسم الطالب مطلوب' });
      // Auto-generate username based on academic stage
      let username = await generateUsername(teacherId, academic_stage || '', pool);
      // Retry up to 5 times if race condition causes duplicate
      let retries = 0;
      while (retries < 5) {
        try {
          const hashed = await bcrypt.hash(generatedPassword, 10);
        const result = await pool.query(
          'INSERT INTO students (username,password,name,phone,parent_phone,academic_stage,gender,teacher_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
          [username, hashed, name, phone, parent_phone, academic_stage, gender, teacherId]
        );
        invalidateCache(teacherId);
        // Auto-enroll new student in teacher's published free courses
        // [BUG-FIX] Use ON CONFLICT DO UPDATE to reactivate any existing inactive enrollment
        let enrollWarning = null;
        try {
          await pool.query(
            `INSERT INTO student_course_enrollment (student_id, course_id, status)
             SELECT $1, c.id, 'active' FROM courses c
             WHERE c.teacher_id = $2 AND c.is_free = true AND c.is_published = true
               AND (c.target_stage IS NULL OR c.target_stage = '' OR c.target_stage = $3)
             ON CONFLICT (student_id, course_id) DO UPDATE SET status = 'active'`,
            [result.rows[0].id, teacherId, academic_stage || '']
          );
        } catch (enrollErr) {
          console.warn('[auto-enroll] Failed to enroll student in free courses:', enrollErr.message);
          enrollWarning = 'تعذّر التسجيل التلقائي في الكورسات المجانية';
        }
        const { password: _, plain_password: __, ...safe } = result.rows[0];
        logActivity({
          teacherId, actor: getActor(req), ip: getIp(req),
          action: 'add_student',
          entity: { type: 'student', id: safe.id, name: safe.name },
          details: { username: safe.username, academic_stage, gender },
        });
        return res.status(201).json({ ...safe, generated_password: generatedPassword, ...(enrollWarning ? { warning: enrollWarning } : {}) });
      } catch (err) {
        if (err.code === '23505') {
          retries++;
          username = await generateUsername(teacherId, academic_stage || '', pool);
        } else {
          throw err;
        }
      }
    }
    return res.status(409).json({ error: 'تعذّر توليد اسم مستخدم فريد، حاول مرة أخرى' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_edit_students'), validateStudent, async (req, res) => {
  const teacherId = getTeacherId(req);
  const studentId = parseInt(req.params.id, 10);
  if (isNaN(studentId) || studentId <= 0) return res.status(400).json({ error: 'Invalid student ID' });
  const { name, phone, parent_phone, academic_stage, gender, password } = req.body;
  try {
    let query, params;
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      query = 'UPDATE students SET name=$1,phone=$2,parent_phone=$3,academic_stage=$4,gender=$5,password=$6 WHERE id=$7 AND teacher_id=$8 RETURNING *';
      params = [name, phone, parent_phone, academic_stage, gender, hashed, studentId, teacherId];
    } else {
      query = 'UPDATE students SET name=$1,phone=$2,parent_phone=$3,academic_stage=$4,gender=$5 WHERE id=$6 AND teacher_id=$7 RETURNING *';
      params = [name, phone, parent_phone, academic_stage, gender, studentId, teacherId];
    }
    const result = await pool.query(query, params);
    if (!result.rows.length) return res.status(404).json({ error: 'Student not found' });
    invalidateCache(teacherId);
    const { password: _, plain_password: __, ...safe } = result.rows[0];
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'edit_student',
      entity: { type: 'student', id: safe.id, name: safe.name },
    });
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_delete_students'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const studentId = parseInt(req.params.id, 10);
  if (isNaN(studentId) || studentId <= 0) return res.status(400).json({ error: 'Invalid student ID' });
  try {
    const studentInfo = await pool.query(
      'SELECT name FROM students WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL',
      [studentId, teacherId]
    );
    const result = await pool.query(
      'UPDATE students SET deleted_at=NOW() WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL RETURNING id',
      [studentId, teacherId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Student not found' });
    // Cascade soft-delete: deactivate enrollments, mark devices as removed, remove active live viewer status
    await pool.query(
      "UPDATE student_course_enrollment SET status='inactive' WHERE student_id=$1",
      [req.params.id]
    ).catch(() => {});
    await pool.query(
      'DELETE FROM student_devices WHERE student_id=$1',
      [req.params.id]
    ).catch(() => {});
    await pool.query(
      'DELETE FROM exam_sessions WHERE student_id=$1',
      [req.params.id]
    ).catch(() => {});
      await pool.query(
        "UPDATE live_stream_viewers SET is_active=false, left_at=NOW() WHERE student_id=$1 AND is_active=true",
        [req.params.id]
      ).catch(() => {});
    // Clean up video progress and exam results on student deletion
    await pool.query(
      'DELETE FROM video_progress WHERE student_id=$1',
      [req.params.id]
    ).catch(() => {});
    await pool.query(
      'UPDATE exam_results SET is_latest=false WHERE student_id=$1',
      [req.params.id]
    ).catch(() => {});
    invalidateCache(teacherId);
    invalidateStudentAuthCache(studentId);
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'delete_student',
      entity: { type: 'student', id: studentId, name: studentInfo.rows[0]?.name },
    });
    res.json({ message: 'Student deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/results', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const studentId = parseInt(req.params.id, 10);
  if (isNaN(studentId) || studentId <= 0) return res.status(400).json({ error: 'Invalid student ID' });
  try {
    if (req.user.role === 'assistant') {
      const perms = await getPermissions(req.user.id, pool);
      if (!perms?.can_view_analytics) return res.status(403).json({ error: 'Access denied: missing permission' });
    }
    const studentCheck = await pool.query(
      'SELECT id FROM students WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL',
      [studentId, teacherId]
    );
    if (!studentCheck.rows.length) return res.status(404).json({ error: 'Student not found' });
    const result = await pool.query(
      `SELECT er.*, e.title as exam_title, e.total_score, e.pass_score
       FROM exam_results er
       JOIN exams e ON er.exam_id = e.id
       WHERE er.student_id = $1 AND e.teacher_id = $2
       ORDER BY er.created_at DESC`,
      [studentId, teacherId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Full student profile (for teacher/assistant analytics) ──
router.get('/:id/profile', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const studentId = parseInt(req.params.id, 10);
  if (isNaN(studentId) || studentId <= 0) return res.status(400).json({ error: 'Invalid student ID' });
  try {
    if (req.user.role === 'assistant') {
      const perms = await getPermissions(req.user.id, pool);
      if (!perms?.can_view_analytics) return res.status(403).json({ error: 'Access denied: missing permission' });
    }
    // Student basic info
    const studentRes = await pool.query(
      `SELECT id, name, username, phone, parent_phone, academic_stage, gender, points, created_at
       FROM students WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL`,
      [studentId, teacherId]
    );
    if (!studentRes.rows.length) return res.status(404).json({ error: 'Student not found' });

    const [coursesRes, examsRes, paymentsRes, badgesRes, videoProgressRes] = await Promise.all([
      // Enrolled courses + content counts + watched video count
      pool.query(`
        SELECT c.id, c.name, c.description, c.price, c.target_stage,
               sce.enrollment_date, sce.status,
               COUNT(DISTINCT v.id) as total_videos,
               COUNT(DISTINCT p.id) as total_pdfs,
               COUNT(DISTINCT CASE WHEN vp.progress_percentage >= 90 THEN vp.video_id END) as watched_videos,
               COALESCE(SUM(vp.watched_minutes), 0) as total_watched_minutes
        FROM student_course_enrollment sce
        JOIN courses c ON sce.course_id = c.id
        LEFT JOIN videos v ON v.course_id = c.id
        LEFT JOIN pdf_files p ON p.course_id = c.id
        LEFT JOIN video_progress vp ON vp.video_id = v.id AND vp.student_id = $1
        WHERE sce.student_id = $1
        GROUP BY c.id, sce.enrollment_date, sce.status
        ORDER BY sce.enrollment_date DESC
      `, [studentId]),

      // All exam results
      pool.query(`
        SELECT er.id, er.score, er.correct_count, er.wrong_count,
               er.unanswered_count, er.points_earned, er.created_at,
               e.title as exam_title, e.total_score, e.pass_score,
               c.name as course_name
        FROM exam_results er
        JOIN exams e ON er.exam_id = e.id
        LEFT JOIN courses c ON e.course_id = c.id
        WHERE er.student_id = $1
        ORDER BY er.created_at DESC
      `, [studentId]),

      // Payment history
      pool.query(`
        SELECT p.id, p.amount, p.method, p.payment_date, p.status,
               p.reference_number, p.notes,
               c.name as course_name
        FROM payments p
        LEFT JOIN courses c ON p.course_id = c.id
        WHERE p.student_id = $1
        ORDER BY p.payment_date DESC
      `, [studentId]),

      // Badges
      pool.query(`
        SELECT b.*, e.title as exam_title
        FROM badges b
        LEFT JOIN exams e ON b.exam_id = e.id
        WHERE b.student_id = $1
        ORDER BY b.earned_at DESC
      `, [studentId]),

      // Video progress summary
      pool.query(`
        SELECT vp.*, v.title as video_title, v.duration_minutes, c.name as course_name
        FROM video_progress vp
        JOIN videos v ON vp.video_id = v.id
        JOIN courses c ON v.course_id = c.id
        WHERE vp.student_id = $1
        ORDER BY vp.last_watched_at DESC
      `, [studentId]),
    ]);

    res.json({
      student: studentRes.rows[0],
      courses: coursesRes.rows,
      examResults: examsRes.rows,
      payments: paymentsRes.rows,
      badges: badgesRes.rows,
      videoProgress: videoProgressRes.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Full stats for the logged-in student themselves ──
router.get('/me/stats', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  try {
    const [studentRes, coursesRes, examsRes, paymentsRes, badgesRes, videoProgressRes, rankRes] = await Promise.all([
      pool.query(
        `SELECT id, name, username, phone, parent_phone, academic_stage, gender, points, created_at
         FROM students WHERE id=$1`, [studentId]
      ),
      pool.query(`
        SELECT c.id, c.name, c.description, c.price, c.target_stage,
               sce.enrollment_date, sce.status,
               COUNT(DISTINCT v.id)::int  AS total_videos,
               COUNT(DISTINCT pf.id)::int AS total_pdfs,
               COUNT(DISTINCT CASE WHEN vp.progress_percentage >= 90 THEN vp.video_id END)::int AS watched_videos,
               COALESCE(SUM(vp.watched_minutes),0)::int AS total_watched_minutes,
               COALESCE(AVG(vp.progress_percentage),0)::numeric(5,1) AS avg_progress
        FROM student_course_enrollment sce
        JOIN courses c ON sce.course_id = c.id
        LEFT JOIN videos v  ON v.course_id = c.id
        LEFT JOIN pdf_files pf ON pf.course_id = c.id
        LEFT JOIN video_progress vp ON vp.video_id = v.id AND vp.student_id = $1
        WHERE sce.student_id = $1
        GROUP BY c.id, sce.enrollment_date, sce.status
        ORDER BY sce.enrollment_date DESC
      `, [studentId]),
      pool.query(`
        SELECT er.id, er.score, er.correct_count, er.wrong_count,
               er.unanswered_count, er.points_earned, er.start_time, er.end_time, er.created_at,
               e.title AS exam_title, e.total_score, e.pass_score, e.badge_name, e.badge_color,
               c.name  AS course_name
        FROM exam_results er
        JOIN exams e ON er.exam_id = e.id
        LEFT JOIN courses c ON e.course_id = c.id
        WHERE er.student_id = $1
        ORDER BY er.created_at DESC
      `, [studentId]),
      pool.query(`
        SELECT p.id, p.amount, p.method, p.payment_date, p.status,
               p.reference_number, p.notes, c.name AS course_name, c.price AS course_price
        FROM payments p
        LEFT JOIN courses c ON p.course_id = c.id
        WHERE p.student_id = $1
        ORDER BY p.payment_date DESC
      `, [studentId]),
      pool.query(`
        SELECT b.*, e.title AS exam_title
        FROM badges b LEFT JOIN exams e ON b.exam_id = e.id
        WHERE b.student_id = $1 ORDER BY b.earned_at DESC
      `, [studentId]),
      pool.query(`
        SELECT vp.video_id, vp.watch_count, vp.watched_minutes, vp.progress_percentage, vp.last_watched_at,
               v.title AS video_title, v.duration_minutes, c.name AS course_name
        FROM video_progress vp
        JOIN videos v ON vp.video_id = v.id
        JOIN courses c ON v.course_id = c.id
        WHERE vp.student_id = $1
        ORDER BY vp.last_watched_at DESC
      `, [studentId]),
      pool.query(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN points > (SELECT points FROM students WHERE id=$1) THEN 1 ELSE 0 END) AS above
        FROM students WHERE teacher_id = (SELECT teacher_id FROM students WHERE id=$1)
          AND deleted_at IS NULL
      `, [studentId]),
    ]);

    if (!studentRes.rows.length) return res.status(404).json({ error: 'Student not found' });

    const student   = studentRes.rows[0];
    const exams     = examsRes.rows;
    const payments  = paymentsRes.rows;

    // Aggregate totals
    const totalPaid    = payments.filter(p => p.status === 'verified').reduce((s, p) => s + parseFloat(p.amount), 0);
    const totalPending = payments.filter(p => p.status === 'pending').reduce((s, p) => s + parseFloat(p.amount), 0);
    const passCount    = exams.filter(e => parseInt(e.score) >= parseInt(e.pass_score)).length;
    const avgScore     = exams.length ? Math.round(exams.reduce((s, e) => s + (e.score / e.total_score * 100), 0) / exams.length) : 0;
    const totalWatchedMinutes = videoProgressRes.rows.reduce((s, v) => s + v.watched_minutes, 0);

    // Rank among teacher's students by points (#1 = most points)
    const rankRow  = rankRes.rows[0];
    const myRank   = parseInt(rankRow.above) + 1;

    res.json({
      student,
      courses: coursesRes.rows,
      examResults: exams,
      payments,
      badges: badgesRes.rows,
      videoProgress: videoProgressRes.rows,
      summary: {
        totalPaid,
        totalPending,
        totalExams: exams.length,
        passCount,
        failCount: exams.length - passCount,
        avgScore,
        totalWatchedMinutes,
        totalCourses: coursesRes.rows.length,
        totalBadges: badgesRes.rows.length,
        rank: myRank,
        totalStudents: parseInt(rankRow.total),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/bulk', requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_add_students'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { students } = req.body;
  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: 'No students provided' });
  }
  const MAX_BULK = 200;
  if (students.length > MAX_BULK) {
    return res.status(400).json({ error: `الحد الأقصى للاستيراد الجماعي هو ${MAX_BULK} طالب في المرة الواحدة` });
  }

  const EGYPTIAN_PHONE_RE = /^01[0125][0-9]{8}$/;
  const results = { success: 0, failed: 0, errors: [], created: [] };
  const newStudentIds = [];

  // ── Phase 1: Parse all rows and hash passwords BEFORE opening a DB transaction.
  //    bcrypt is CPU-bound and can take 100-300ms per hash. Holding a pool connection
  //    open during this time (especially for 100-200 students) exhausts the pool.
  const prepared = [];
  for (const s of students) {
    const name           = (s['الاسم'] || s['name'] || '').toString().trim().replace(/[\x00-\x1f\x7f-\x9f<>]/g, '').slice(0, 100);
    const manualUsername = (s['اسم المستخدم'] || s['username'] || '').toString().trim().replace(/[\x00-\x1f\x7f-\x9f<>]/g, '');
    const manualPassword = (s['كلمة المرور'] || s['password'] || '').toString().trim();
    const rawPhone       = (s['الهاتف'] || s['phone'] || '').toString().trim();
    const rawParentPhone = (s['هاتف ولي الأمر'] || s['parent_phone'] || '').toString().trim();
    const cleanPhone       = rawPhone ? rawPhone.replace(/[\s\-]/g, '') : '';
    const cleanParentPhone = rawParentPhone ? rawParentPhone.replace(/[\s\-]/g, '') : '';
    const phone          = cleanPhone && EGYPTIAN_PHONE_RE.test(cleanPhone) ? cleanPhone : null;
    const parent_phone   = cleanParentPhone && EGYPTIAN_PHONE_RE.test(cleanParentPhone) ? cleanParentPhone : null;
    if (rawPhone && !phone)       results.errors.push(`${name || '?'}: رقم الهاتف "${rawPhone}" غير صحيح — تم تجاهله`);
    if (rawParentPhone && !parent_phone) results.errors.push(`${name || '?'}: هاتف ولي الأمر "${rawParentPhone}" غير صحيح — تم تجاهله`);
    const academic_stage = (s['المرحلة'] || s['academic_stage'] || '').toString().trim() || null;
    const gender         = (s['الجنس'] || s['gender'] || '').toString().trim() || null;

    if (!name) {
      results.failed++;
      results.errors.push(`(صف فارغ): الاسم مطلوب`);
      prepared.push(null);
      continue;
    }

    const finalPassword = manualPassword || String(100000 + crypto.randomInt(0, 900000));
    const hashed        = await bcrypt.hash(finalPassword, 12); // OUTSIDE transaction — intentional (increased from 10 to 12 rounds)
    prepared.push({ name, manualUsername, manualPassword, finalPassword, hashed, phone, parent_phone, academic_stage, gender });
  }

  // ── Phase 2: Open transaction and do all DB writes with pre-computed hashes
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const row of prepared) {
      if (!row) continue; // was a validation error in phase 1

      const { name, manualUsername, manualPassword, finalPassword, hashed, phone, parent_phone, academic_stage, gender } = row;

      try {
        let username = manualUsername || await generateUsername(teacherId, academic_stage || '', client);
        let retries = 0;
        while (retries < 5) {
          try {
            const insertRes = await client.query(
              'INSERT INTO students (username,password,name,phone,parent_phone,academic_stage,gender,teacher_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
              [username, hashed, name, phone, parent_phone, academic_stage, gender, teacherId]
            );
            newStudentIds.push(insertRes.rows[0].id);
            results.success++;
            if (!manualPassword || !manualUsername) {
              results.created.push({ name, username, generated_password: finalPassword });
            }
            break;
          } catch (err) {
            if (err.code === '23505' && !manualUsername) {
              retries++;
              username = await generateUsername(teacherId, academic_stage || '', client);
            } else {
              throw err;
            }
          }
        }
        if (retries >= 5) {
          results.failed++;
          results.errors.push(`${name}: تعذّر توليد اسم مستخدم فريد`);
        }
      } catch (err) {
        results.failed++;
        results.errors.push(`${name}: ${err.code === '23505' ? 'اسم المستخدم موجود مسبقاً' : 'خطأ في الحفظ'}`);
      }
    }

    await client.query('COMMIT');
    invalidateCache(teacherId);
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'bulk_import_students',
      entity: { type: 'student' },
      details: { count: results.success, failed: results.failed },
    });

    // Auto-enroll newly created students in the teacher's published free courses
    if (newStudentIds.length > 0) {
      pool.query(
        `INSERT INTO student_course_enrollment (student_id, course_id)
         SELECT s.id, c.id
         FROM students s
         JOIN courses c ON c.teacher_id = $1 AND c.is_free = true AND c.is_published = true
         WHERE s.id = ANY($2::int[])
           AND (c.target_stage IS NULL OR c.target_stage = '' OR c.target_stage = s.academic_stage)
         ON CONFLICT DO NOTHING`,
        [teacherId, newStudentIds]
      ).catch(e => console.warn('[bulk auto-enroll]', e.message));
    }

    res.json(results);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[bulk import]', err.message);
    res.status(500).json({ error: 'حدث خطأ غير متوقع — تم التراجع عن جميع التغييرات، لم يُحفظ أي طالب' });
  } finally {
    client.release();
  }
});

// ── Save video progress ──
router.post('/me/video-progress', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  const { video_id, watched_minutes, watch_count_increment, last_position, actual_watched_seconds } = req.body;
  if (!video_id) return res.status(400).json({ error: 'video_id required' });
  try {
    // Verify the video belongs to a course the student is actively enrolled in
    const ownershipCheck = await pool.query(
      `SELECT v.id, v.duration_minutes FROM videos v
       JOIN student_course_enrollment sce ON v.course_id = sce.course_id
       WHERE v.id = $1 AND sce.student_id = $2 AND sce.status = 'active'`,
      [video_id, studentId]
    );
    if (!ownershipCheck.rows.length) {
      return res.status(403).json({ error: 'Access denied: video not in your enrolled courses' });
    }
    const durationMinutes = parseFloat(ownershipCheck.rows[0]?.duration_minutes) || 0;
    const safeWatchedSeconds = Math.max(0, Math.min(actual_watched_seconds || 0, 86400));
    // BUG-12: cap watched_minutes at actual video duration — prevents inflated watch-time from malicious clients
    const safeWatchedMinutes = durationMinutes > 0
      ? Math.max(0, Math.min(watched_minutes || 0, durationMinutes))
      : Math.max(0, watched_minutes || 0);

    // Compute progress server-side: use actual_watched_seconds if duration is known
    let serverProgress = 0;
    if (durationMinutes > 0 && safeWatchedSeconds > 0) {
      serverProgress = Math.min(100, (safeWatchedSeconds / (durationMinutes * 60)) * 100);
    } else if (durationMinutes > 0 && safeWatchedMinutes > 0) {
      serverProgress = Math.min(100, (safeWatchedMinutes / durationMinutes) * 100);
    } else {
      // duration_minutes not set (URL videos without duration) — use client-provided value capped at 100
      const clientProgress = parseFloat(req.body.progress_percentage) || 0;
      serverProgress = Math.min(100, Math.max(0, clientProgress));
    }

    await pool.query(
      `INSERT INTO video_progress (student_id, video_id, watch_count, watched_minutes, progress_percentage, last_watched_at, last_position, actual_watched_seconds)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)
       ON CONFLICT (student_id, video_id) DO UPDATE SET
         watch_count = CASE WHEN $3 > 0 THEN video_progress.watch_count + $3 ELSE video_progress.watch_count END,
         watched_minutes = GREATEST(video_progress.watched_minutes, $4),
         progress_percentage = GREATEST(video_progress.progress_percentage, $5),
         last_watched_at = NOW(),
         last_position = $6,
         actual_watched_seconds = video_progress.actual_watched_seconds + $7`,
      [studentId, video_id, watch_count_increment || 0, safeWatchedMinutes, serverProgress, last_position || 0, safeWatchedSeconds]
    );

    // ── Award course completion points if all videos watched (race-safe) ──
    try {
      const courseRow = await pool.query('SELECT course_id FROM videos WHERE id=$1', [video_id]);
      if (courseRow.rows.length && courseRow.rows[0].course_id) {
        const courseId = courseRow.rows[0].course_id;
        const [courseRes, videosRes] = await Promise.all([
          pool.query('SELECT points_on_complete FROM courses WHERE id=$1', [courseId]),
          pool.query('SELECT id, duration_minutes FROM videos WHERE course_id=$1', [courseId]),
        ]);
        const pointsOnComplete = courseRes.rows[0]?.points_on_complete || 0;
        // [M-10] FIX: only award completion points if ALL videos have known duration_minutes > 0.
        // URL videos without duration let the client send a fake 100% progress,
        // which would otherwise trigger bogus completion rewards.
        const allHaveDuration = videosRes.rows.every(v => parseFloat(v.duration_minutes) > 0);
        if (pointsOnComplete > 0 && videosRes.rows.length > 0 && allHaveDuration) {
          const doneRes = await pool.query(
            'SELECT COUNT(*) FROM video_progress WHERE student_id=$1 AND video_id = ANY($2) AND progress_percentage >= 90',
            [studentId, videosRes.rows.map(v => v.id)]
          );
          if (parseInt(doneRes.rows[0].count) >= videosRes.rows.length) {
            // Atomic: INSERT only if not exists, then UPDATE only if INSERT actually inserted
            const insertRes = await pool.query(
              'INSERT INTO course_completion_points (student_id, course_id, points_awarded) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',
              [studentId, courseId, pointsOnComplete]
            );
            if (insertRes.rows.length > 0) {
              await pool.query('UPDATE students SET points = points + $1 WHERE id=$2', [pointsOnComplete, studentId]);
            }
          }
        }
      }
    } catch (completionErr) {
      console.error('[video-progress completion]', completionErr.message);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me/dashboard', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  try {
    const [enrollments, results, progress, badges, student, totalExamsRes] = await Promise.all([
      pool.query('SELECT sce.*, c.name, c.description, c.thumbnail_url FROM student_course_enrollment sce JOIN courses c ON sce.course_id=c.id WHERE sce.student_id=$1 AND c.is_published=true', [studentId]),
      pool.query('SELECT er.*, e.title as exam_title, e.total_score, e.pass_score FROM exam_results er JOIN exams e ON er.exam_id=e.id WHERE er.student_id=$1 AND er.is_latest=true ORDER BY er.created_at DESC LIMIT 5', [studentId]),
      pool.query('SELECT vp.*, v.title FROM video_progress vp JOIN videos v ON vp.video_id=v.id WHERE vp.student_id=$1', [studentId]),
      pool.query('SELECT * FROM badges WHERE student_id=$1 ORDER BY earned_at DESC', [studentId]),
      pool.query('SELECT id,name,points,academic_stage,gender FROM students WHERE id=$1', [studentId]),
      pool.query('SELECT COUNT(*)::int AS count FROM exam_results WHERE student_id=$1 AND is_latest=true', [studentId]),
    ]);
    res.json({ student: student.rows[0], enrollments: enrollments.rows, recentResults: results.rows, videoProgress: progress.rows, badges: badges.rows, totalExams: totalExamsRes.rows[0].count });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me/notifications', requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, message, type, is_read, sent_at
       FROM notification_log
       WHERE student_id = $1
       ORDER BY sent_at DESC LIMIT 30`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/me/notifications/:id/read', requireRole('student'), async (req, res) => {
  try {
    await pool.query(
      'UPDATE notification_log SET is_read=true WHERE id=$1 AND student_id=$2',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/me/notifications/read-all', requireRole('student'), async (req, res) => {
  try {
    await pool.query(
      "UPDATE notification_log SET is_read=true WHERE student_id=$1 AND source='platform' AND is_read=false",
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/attendance/:courseId', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { courseId } = req.params;
  try {
    const courseCheck = await pool.query(
      'SELECT id, name FROM courses WHERE id=$1 AND teacher_id=$2',
      [courseId, teacherId]
    );
    if (!courseCheck.rows.length) return res.status(403).json({ error: 'Access denied' });

    const [students, videos, progress] = await Promise.all([
      // BUG-17 FIX: exclude soft-deleted students from attendance view
      pool.query(
        `SELECT s.id, s.name, s.academic_stage
         FROM students s
         JOIN student_course_enrollment sce ON s.id = sce.student_id
         WHERE sce.course_id = $1 AND s.deleted_at IS NULL
         ORDER BY s.name`,
        [courseId]
      ),
      pool.query(
        `SELECT id, title, duration_minutes, sort_order
         FROM videos WHERE course_id=$1 ORDER BY sort_order, id`,
        [courseId]
      ),
      pool.query(
        `SELECT vp.student_id, vp.video_id, vp.progress_percentage, vp.watched_minutes,
                vp.watch_count, COALESCE(vp.actual_watched_seconds, 0) AS actual_watched_seconds
         FROM video_progress vp
         JOIN videos v ON vp.video_id = v.id
         WHERE v.course_id = $1`,
        [courseId]
      ),
    ]);

    const progressMap = {};
    progress.rows.forEach(p => {
      if (!progressMap[p.student_id]) progressMap[p.student_id] = {};
      progressMap[p.student_id][p.video_id] = {
        progress_percentage: parseFloat(p.progress_percentage),
        watched_minutes: p.watched_minutes,
        watch_count: p.watch_count,
        actual_watched_seconds: parseInt(p.actual_watched_seconds) || 0,
      };
    });

    res.json({
      course: courseCheck.rows[0],
      students: students.rows,
      videos: videos.rows,
      progressMap,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// DEVICE-SECURITY ROUTES
// IMPORTANT: literal-path routes (/device-alerts/…) come BEFORE parameterised
// routes (/:id/…) so Express doesn't accidentally swallow them.
// ════════════════════════════════════════════════════════════════════════════

// ── GET /students/device-alerts ──────────────────────────────────────────────
router.get('/device-alerts', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    // Assistants need can_view_analytics to see security alerts
    if (req.user.role === 'assistant') {
      const perms = await getPermissions(req.user.id, pool);
      if (!perms?.can_view_analytics) return res.status(403).json({ error: 'Access denied: missing permission' });
    }
    const result = await pool.query(
      `SELECT da.*, s.name AS student_name, s.username AS student_username,
              s.academic_stage, s.is_suspended
       FROM device_alerts da
       JOIN students s ON s.id = da.student_id
       WHERE da.teacher_id = $1
       ORDER BY da.created_at DESC`,
      [teacherId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /students/device-alerts/:alertId/action ─────────────────────────────
// MUST be before POST /:id/… routes to avoid Express path ambiguity
router.post('/device-alerts/:alertId/action', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const alertId   = parseInt(req.params.alertId, 10);
  if (isNaN(alertId)) return res.status(400).json({ error: 'Invalid alert ID' });

  const { action } = req.body;
  if (!['reactivate', 'reactivate_reset_devices', 'dismiss'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }
  // Assistants need can_edit_students to act on alerts
  if (req.user.role === 'assistant') {
    try {
      const perms = await getPermissions(req.user.id, pool);
      if (!perms?.can_edit_students) return res.status(403).json({ error: 'Access denied: missing permission' });
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  }
  try {
    const alertRes = await pool.query(
      'SELECT * FROM device_alerts WHERE id=$1 AND teacher_id=$2',
      [alertId, teacherId]
    );
    if (!alertRes.rows.length) return res.status(403).json({ error: 'Access denied' });
    const alert = alertRes.rows[0];

    if (action === 'reactivate') {
      await pool.query('UPDATE students SET is_suspended=false WHERE id=$1', [alert.student_id]);
      await pool.query(
        "UPDATE device_alerts SET status='reactivated', resolved_at=NOW() WHERE id=$1",
        [alertId]
      );
      // Invalidate auth cache so student can immediately access the app
      invalidateStudentAuthCache(alert.student_id);
    } else if (action === 'reactivate_reset_devices') {
      await pool.query('UPDATE students SET is_suspended=false WHERE id=$1', [alert.student_id]);
      await pool.query('DELETE FROM student_devices WHERE student_id=$1', [alert.student_id]);
      await pool.query(
        "UPDATE device_alerts SET status='reactivated', resolved_at=NOW() WHERE id=$1",
        [alertId]
      );
      invalidateStudentAuthCache(alert.student_id);
    } else if (action === 'dismiss') {
      await pool.query(
        "UPDATE device_alerts SET status='dismissed', resolved_at=NOW() WHERE id=$1",
        [alertId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /students/:id/devices ────────────────────────────────────────────────
router.get('/:id/devices', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const studentId = parseInt(req.params.id, 10);
  if (isNaN(studentId)) return res.status(400).json({ error: 'Invalid student ID' });
  try {
    // Assistants need can_view_analytics
    if (req.user.role === 'assistant') {
      const perms = await getPermissions(req.user.id, pool);
      if (!perms?.can_view_analytics) return res.status(403).json({ error: 'Access denied: missing permission' });
    }
    const check = await pool.query(
      'SELECT id FROM students WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL',
      [studentId, teacherId]
    );
    if (!check.rows.length) return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(
      'SELECT id, device_id, device_name, ip_address, first_seen, last_seen FROM student_devices WHERE student_id=$1 ORDER BY last_seen DESC',
      [studentId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /students/:id/suspend ───────────────────────────────────────────────
router.post('/:id/suspend',
  requireRole('teacher', 'assistant'),
  (req, res, next) => checkPermission(req, res, next, 'can_edit_students'),
  async (req, res) => {
    const teacherId = getTeacherId(req);
    const studentId = parseInt(req.params.id, 10);
    if (isNaN(studentId)) return res.status(400).json({ error: 'Invalid student ID' });

    const { action } = req.body;
    if (!['suspend', 'reactivate', 'reactivate_reset_devices'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }
    try {
      const check = await pool.query(
        'SELECT id, name FROM students WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL',
        [studentId, teacherId]
      );
      if (!check.rows.length) return res.status(403).json({ error: 'Access denied' });

      if (action === 'suspend') {
        await pool.query('UPDATE students SET is_suspended=true WHERE id=$1', [studentId]);
        // Immediately block the student's active sessions
        invalidateStudentAuthCache(studentId);
      } else if (action === 'reactivate') {
        await pool.query('UPDATE students SET is_suspended=false WHERE id=$1', [studentId]);
        await pool.query(
          "UPDATE device_alerts SET status='reactivated', resolved_at=NOW() WHERE student_id=$1 AND status='pending'",
          [studentId]
        );
        invalidateStudentAuthCache(studentId);
      } else if (action === 'reactivate_reset_devices') {
        await pool.query('UPDATE students SET is_suspended=false WHERE id=$1', [studentId]);
        await pool.query('DELETE FROM student_devices WHERE student_id=$1', [studentId]);
        await pool.query(
          "UPDATE device_alerts SET status='reactivated', resolved_at=NOW() WHERE student_id=$1 AND status='pending'",
          [studentId]
        );
        invalidateStudentAuthCache(studentId);
      }

      logActivity({
        teacherId,
        actor: getActor(req),
        ip: getIp(req),
        action: action === 'suspend' ? 'suspend_student' : 'reactivate_student',
        entity: { type: 'student', id: studentId, name: check.rows[0].name },
      });

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
