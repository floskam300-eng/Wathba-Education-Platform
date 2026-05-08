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
        (SELECT COUNT(*) FROM students)  AS total_students,
        (SELECT COUNT(*) FROM courses)   AS total_courses,
        (SELECT COUNT(*) FROM exams)     AS total_exams,
        (SELECT COUNT(*) FROM exam_results) AS total_results
    `);
    const courses = await pool.query(
      'SELECT id, name, description, price, thumbnail_url, target_stage, created_at FROM courses ORDER BY created_at DESC LIMIT 12'
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

module.exports = router;
