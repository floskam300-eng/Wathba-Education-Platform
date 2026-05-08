const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
function getCached(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return null; }
  return entry.data;
}
function setCache(key, data) { _cache.set(key, { data, ts: Date.now() }); }
function invalidateCache(teacherId) {
  for (const k of _cache.keys()) {
    if (k.startsWith(`t${teacherId}_`)) _cache.delete(k);
  }
}

router.get('/dashboard', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  try {
    const [students, courses, exams, assistants, payments] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM students WHERE teacher_id = $1', [teacherId]),
      pool.query('SELECT COUNT(*) FROM courses WHERE teacher_id = $1', [teacherId]),
      pool.query('SELECT COUNT(*) FROM exams WHERE teacher_id = $1', [teacherId]),
      pool.query('SELECT COUNT(*) FROM assistants WHERE teacher_id = $1', [teacherId]),
      pool.query("SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status='verified' AND student_id IN (SELECT id FROM students WHERE teacher_id=$1)", [teacherId]),
    ]);
    res.json({
      totalStudents: parseInt(students.rows[0].count),
      totalCourses: parseInt(courses.rows[0].count),
      totalExams: parseInt(exams.rows[0].count),
      totalAssistants: parseInt(assistants.rows[0].count),
      totalRevenue: parseFloat(payments.rows[0].total),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/profile', requireRole('teacher'), async (req, res) => {
  const { name, bio, classification, logo_url, photo_url, whatsapp_phone } = req.body;
  try {
    const result = await pool.query(
      'UPDATE teachers SET name=$1, bio=$2, classification=$3, logo_url=$4, photo_url=$5, whatsapp_phone=$6 WHERE id=$7 RETURNING *',
      [name, bio, classification, logo_url, photo_url, whatsapp_phone, req.user.id]
    );
    const { password: _, ...safe } = result.rows[0];
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/analytics', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const cacheKey = `t${teacherId}_analytics`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const examResults = await pool.query(`
      SELECT e.title, AVG(er.score) as avg_score, COUNT(er.id) as attempt_count,
             MAX(er.score) as max_score, MIN(er.score) as min_score
      FROM exam_results er
      JOIN exams e ON er.exam_id = e.id
      WHERE e.teacher_id = $1
      GROUP BY e.id, e.title
      ORDER BY attempt_count DESC LIMIT 10
    `, [teacherId]);

    const topStudents = await pool.query(`
      SELECT s.id, s.name, s.points, s.academic_stage,
             COUNT(er.id) as exams_taken, COALESCE(AVG(er.score), 0) as avg_score
      FROM students s
      LEFT JOIN exam_results er ON s.id = er.student_id
      WHERE s.teacher_id = $1
      GROUP BY s.id, s.name, s.points, s.academic_stage
      ORDER BY s.points DESC LIMIT 20
    `, [teacherId]);

    const recentResults = await pool.query(`
      SELECT er.id, er.student_id, er.score, er.correct_count, er.wrong_count,
             er.unanswered_count, er.created_at,
             s.name as student_name, s.academic_stage,
             e.title as exam_title, e.total_score, e.pass_score
      FROM exam_results er
      JOIN students s ON er.student_id = s.id
      JOIN exams e ON er.exam_id = e.id
      WHERE e.teacher_id = $1
      ORDER BY er.created_at DESC LIMIT 30
    `, [teacherId]);

    const result = { examResults: examResults.rows, topStudents: topStudents.rows, recentResults: recentResults.rows };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/analytics/trend', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const cacheKey = `t${teacherId}_trend`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const result = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', er.created_at), 'YYYY-MM') AS month,
        TO_CHAR(DATE_TRUNC('month', er.created_at), 'Mon YY')  AS label,
        ROUND(AVG(er.score::numeric / NULLIF(e.total_score,0) * 100), 1) AS avg_pct,
        COUNT(er.id)::int                                        AS exam_count,
        COUNT(DISTINCT er.student_id)::int                       AS student_count,
        COUNT(CASE WHEN er.score >= e.pass_score THEN 1 END)::int AS pass_count
      FROM exam_results er
      JOIN exams e ON er.exam_id = e.id
      WHERE e.teacher_id = $1
        AND er.created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', er.created_at)
      ORDER BY DATE_TRUNC('month', er.created_at) ASC
    `, [teacherId]);
    setCache(cacheKey, result.rows);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/course-stats', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const cacheKey = `t${teacherId}_coursestats`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const result = await pool.query(`
      SELECT c.id, c.name, c.target_stage,
             COUNT(DISTINCT sce.student_id)::int AS enrolled_count,
             COUNT(DISTINCT v.id)::int            AS total_videos,
             COALESCE(ROUND(AVG(vp.progress_percentage)::numeric, 0), 0)::int AS avg_progress,
             COUNT(DISTINCT CASE WHEN vp.progress_percentage >= 80 THEN vp.student_id END)::int AS active_students
      FROM courses c
      LEFT JOIN student_course_enrollment sce ON c.id = sce.course_id
      LEFT JOIN videos v  ON v.course_id = c.id
      LEFT JOIN video_progress vp ON v.id = vp.video_id
      WHERE c.teacher_id = $1
      GROUP BY c.id, c.name, c.target_stage
      ORDER BY enrolled_count DESC
    `, [teacherId]);
    setCache(cacheKey, result.rows);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Full data export ──
router.get('/export', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  try {
    const [teacher, students, courses, exams, questions, results, payments, enrollments, videoProgress] = await Promise.all([
      pool.query('SELECT id,username,name,bio,classification,logo_url,photo_url,whatsapp_phone,created_at FROM teachers WHERE id=$1', [teacherId]),
      pool.query('SELECT id,username,name,phone,parent_phone,academic_stage,gender,points,created_at FROM students WHERE teacher_id=$1 ORDER BY name', [teacherId]),
      pool.query('SELECT * FROM courses WHERE teacher_id=$1 ORDER BY created_at', [teacherId]),
      pool.query('SELECT * FROM exams WHERE teacher_id=$1 ORDER BY created_at', [teacherId]),
      pool.query('SELECT q.* FROM questions q JOIN exams e ON q.exam_id=e.id WHERE e.teacher_id=$1 ORDER BY q.exam_id, q.id', [teacherId]),
      pool.query(`SELECT er.id, er.student_id, er.exam_id, er.score, er.correct_count, er.wrong_count,
                         er.unanswered_count, er.points_earned, er.start_time, er.end_time, er.created_at,
                         s.name as student_name, e.title as exam_title
                  FROM exam_results er
                  JOIN students s ON er.student_id=s.id
                  JOIN exams e ON er.exam_id=e.id
                  WHERE e.teacher_id=$1 ORDER BY er.created_at DESC`, [teacherId]),
      pool.query(`SELECT p.*, s.name as student_name, c.name as course_name
                  FROM payments p
                  JOIN students s ON p.student_id=s.id
                  LEFT JOIN courses c ON p.course_id=c.id
                  WHERE s.teacher_id=$1 ORDER BY p.payment_date DESC`, [teacherId]),
      pool.query(`SELECT sce.*, s.name as student_name, c.name as course_name
                  FROM student_course_enrollment sce
                  JOIN students s ON sce.student_id=s.id
                  JOIN courses c ON sce.course_id=c.id
                  WHERE s.teacher_id=$1`, [teacherId]),
      pool.query(`SELECT vp.*, s.name as student_name, v.title as video_title
                  FROM video_progress vp
                  JOIN students s ON vp.student_id=s.id
                  JOIN videos v ON vp.video_id=v.id
                  WHERE s.teacher_id=$1`, [teacherId]),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      teacher: teacher.rows[0],
      students: students.rows,
      courses: courses.rows,
      exams: exams.rows,
      questions: questions.rows,
      exam_results: results.rows,
      payments: payments.rows,
      enrollments: enrollments.rows,
      video_progress: videoProgress.rows,
      summary: {
        total_students: students.rows.length,
        total_courses: courses.rows.length,
        total_exams: exams.rows.length,
        total_questions: questions.rows.length,
        total_results: results.rows.length,
        total_payments: payments.rows.length,
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="wathba-backup-${new Date().toISOString().slice(0,10)}.json"`);
    res.json(exportData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
