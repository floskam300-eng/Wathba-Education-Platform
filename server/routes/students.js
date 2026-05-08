const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const getTeacherId = (req) => {
  if (req.user.role === 'teacher') return req.user.id;
  return req.user.teacher_id;
};

router.get('/', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      `SELECT s.*, COUNT(sce.course_id) as enrolled_courses
       FROM students s
       LEFT JOIN student_course_enrollment sce ON s.id = sce.student_id
       WHERE s.teacher_id = $1
       GROUP BY s.id ORDER BY s.created_at DESC`,
      [teacherId]
    );
    res.json(result.rows.map(({ password: _, ...s }) => s));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

const checkPermission = async (req, res, next, perm) => {
  if (req.user.role === 'teacher') return next();
  try {
    const result = await pool.query('SELECT * FROM assistants WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(403).json({ error: 'Access denied' });
    if (!result.rows[0][perm]) return res.status(403).json({ error: 'Access denied: missing permission' });
    next();
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

router.post('/', requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_add_students'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { username, password, name, phone, parent_phone, academic_stage, gender } = req.body;
  if (!username || !password || !name) return res.status(400).json({ error: 'Username, password and name are required' });
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO students (username,password,name,phone,parent_phone,academic_stage,gender,teacher_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [username, hashed, name, phone, parent_phone, academic_stage, gender, teacherId]
    );
    const { password: _, ...safe } = result.rows[0];
    res.status(201).json(safe);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_edit_students'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { name, phone, parent_phone, academic_stage, gender, password } = req.body;
  try {
    let query, params;
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      query = 'UPDATE students SET name=$1,phone=$2,parent_phone=$3,academic_stage=$4,gender=$5,password=$6 WHERE id=$7 AND teacher_id=$8 RETURNING *';
      params = [name, phone, parent_phone, academic_stage, gender, hashed, req.params.id, teacherId];
    } else {
      query = 'UPDATE students SET name=$1,phone=$2,parent_phone=$3,academic_stage=$4,gender=$5 WHERE id=$6 AND teacher_id=$7 RETURNING *';
      params = [name, phone, parent_phone, academic_stage, gender, req.params.id, teacherId];
    }
    const result = await pool.query(query, params);
    if (!result.rows.length) return res.status(404).json({ error: 'Student not found' });
    const { password: _, ...safe } = result.rows[0];
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_delete_students'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query('DELETE FROM students WHERE id=$1 AND teacher_id=$2 RETURNING id', [req.params.id, teacherId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Student not found' });
    res.json({ message: 'Student deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/results', requireRole('teacher', 'assistant'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT er.*, e.title as exam_title, e.total_score, e.pass_score
       FROM exam_results er JOIN exams e ON er.exam_id = e.id
       WHERE er.student_id = $1 ORDER BY er.created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Full student profile (for teacher/assistant analytics) ──
router.get('/:id/profile', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const studentId = req.params.id;
  try {
    // Student basic info
    const studentRes = await pool.query(
      `SELECT id, name, username, phone, parent_phone, academic_stage, gender, points, created_at
       FROM students WHERE id=$1 AND teacher_id=$2`,
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
               COUNT(DISTINCT vp.video_id) as watched_videos,
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
               COUNT(DISTINCT vp.video_id)::int AS watched_videos,
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
               SUM(CASE WHEN points > $2 THEN 1 ELSE 0 END) AS above
        FROM students WHERE teacher_id = (SELECT teacher_id FROM students WHERE id=$1)
      `, [studentId, 0]),
    ]);

    if (!studentRes.rows.length) return res.status(404).json({ error: 'Student not found' });

    const student   = studentRes.rows[0];
    const exams     = examsRes.rows;
    const payments  = paymentsRes.rows;

    // Aggregate totals
    const totalPaid    = payments.filter(p => p.status === 'completed' || p.status === 'verified').reduce((s, p) => s + parseFloat(p.amount), 0);
    const totalPending = payments.filter(p => p.status === 'pending').reduce((s, p) => s + parseFloat(p.amount), 0);
    const passCount    = exams.filter(e => e.score >= e.pass_score).length;
    const avgScore     = exams.length ? Math.round(exams.reduce((s, e) => s + (e.score / e.total_score * 100), 0) / exams.length) : 0;
    const totalWatchedMinutes = videoProgressRes.rows.reduce((s, v) => s + v.watched_minutes, 0);

    // Rank among teacher's students by points
    const rankRow  = rankRes.rows[0];
    const myRank   = parseInt(rankRow.total) - parseInt(rankRow.above);

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

router.get('/me/dashboard', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  try {
    const [enrollments, results, progress, badges] = await Promise.all([
      pool.query('SELECT sce.*, c.name, c.description, c.thumbnail_url FROM student_course_enrollment sce JOIN courses c ON sce.course_id=c.id WHERE sce.student_id=$1', [studentId]),
      pool.query('SELECT er.*, e.title as exam_title, e.total_score, e.pass_score FROM exam_results er JOIN exams e ON er.exam_id=e.id WHERE er.student_id=$1 ORDER BY er.created_at DESC LIMIT 5', [studentId]),
      pool.query('SELECT vp.*, v.title FROM video_progress vp JOIN videos v ON vp.video_id=v.id WHERE vp.student_id=$1', [studentId]),
      pool.query('SELECT * FROM badges WHERE student_id=$1 ORDER BY earned_at DESC', [studentId]),
    ]);
    const student = await pool.query('SELECT id,name,points,academic_stage,gender FROM students WHERE id=$1', [studentId]);
    res.json({ student: student.rows[0], enrollments: enrollments.rows, recentResults: results.rows, videoProgress: progress.rows, badges: badges.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
