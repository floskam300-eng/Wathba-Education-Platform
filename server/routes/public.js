const express = require('express');
const pool = require('../db/connection');
const router = express.Router();

// Public landing page info — no auth required
router.get('/info', async (req, res) => {
  try {
    const teacher = await pool.query(
      'SELECT id, name, bio, classification, logo_url, photo_url, whatsapp_phone, created_at FROM teachers LIMIT 1'
    );
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM students WHERE deleted_at IS NULL) AS total_students,
        (SELECT COUNT(*) FROM courses   WHERE is_published = true) AS total_courses,
        (SELECT COUNT(*) FROM exams     WHERE is_published = true) AS total_exams,
        (SELECT COUNT(*) FROM exam_results) AS total_results
    `);
    const courses = await pool.query(
      'SELECT id, name, description, price, thumbnail_url, target_stage, created_at FROM courses WHERE is_published = true ORDER BY created_at DESC LIMIT 12'
    );
    res.json({
      teacher: teacher.rows[0] || null,
      stats: stats.rows[0],
      courses: courses.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Parent portal — lookup student results by parent phone number
router.get('/parent-lookup', async (req, res) => {
  const { phone } = req.query;
  if (!phone || phone.trim().length < 7) {
    return res.status(400).json({ error: 'رقم الهاتف غير صحيح' });
  }

  try {
    // Find student(s) with this parent_phone
    const studentRes = await pool.query(
      `SELECT id, name, phone, parent_phone, academic_stage, gender, points, created_at
       FROM students
       WHERE parent_phone = $1 AND deleted_at IS NULL`,
      [phone.trim()]
    );

    if (studentRes.rows.length === 0) {
      return res.status(404).json({ error: 'لم يتم العثور على طالب مرتبط بهذا الرقم' });
    }

    const student = studentRes.rows[0];
    const sid = student.id;

    // Enrolled courses
    const coursesRes = await pool.query(
      `SELECT c.id, c.name, c.description, c.thumbnail_url, c.target_stage, sce.enrollment_date, sce.status
       FROM student_course_enrollment sce
       JOIN courses c ON c.id = sce.course_id
       WHERE sce.student_id = $1
       ORDER BY sce.enrollment_date DESC`,
      [sid]
    );

    // Exam results
    const examsRes = await pool.query(
      `SELECT er.id, er.score, er.correct_count, er.wrong_count, er.unanswered_count,
              er.created_at, e.title AS exam_title, e.total_score, e.pass_score,
              c.name AS course_name
       FROM exam_results er
       JOIN exams e ON e.id = er.exam_id
       LEFT JOIN courses c ON c.id = e.course_id
       WHERE er.student_id = $1
       ORDER BY er.created_at DESC`,
      [sid]
    );

    // Video progress summary
    const videoProgressRes = await pool.query(
      `SELECT COUNT(DISTINCT vp.video_id) AS videos_started,
              COALESCE(SUM(vp.watched_minutes), 0) AS total_watched_minutes,
              COALESCE(AVG(vp.progress_percentage), 0) AS avg_progress
       FROM video_progress vp
       WHERE vp.student_id = $1`,
      [sid]
    );

    // Leaderboard rank
    const rankRes = await pool.query(
      `SELECT COUNT(*) + 1 AS rank
       FROM students
       WHERE points > $1 AND deleted_at IS NULL`,
      [student.points]
    );

    res.json({
      student: {
        name: student.name,
        academic_stage: student.academic_stage,
        gender: student.gender,
        points: student.points,
        created_at: student.created_at,
        rank: parseInt(rankRes.rows[0].rank),
      },
      courses: coursesRes.rows,
      exam_results: examsRes.rows,
      video_progress: videoProgressRes.rows[0],
    });
  } catch (err) {
    console.error('Parent lookup error:', err);
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
});

module.exports = router;
