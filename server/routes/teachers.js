const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

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

    res.json({ examResults: examResults.rows, topStudents: topStudents.rows, recentResults: recentResults.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/course-stats', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
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
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
