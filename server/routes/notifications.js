const express = require('express');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const getTeacherId = (req) => req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;

// ── List students with phones (for notifications) ──
router.get('/students', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      `SELECT s.id, s.name, s.phone, s.parent_phone, s.academic_stage,
              s.points,
              COUNT(er.id) as exam_count,
              COALESCE(AVG(er.score), 0)::int as avg_score
       FROM students s
       LEFT JOIN exam_results er ON s.id = er.student_id
       WHERE s.teacher_id = $1 AND s.deleted_at IS NULL
       GROUP BY s.id ORDER BY s.name ASC`,
      [teacherId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Log a notification sent ──
router.post('/log', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { student_id, recipient_phone, recipient_type, message } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO notification_log (teacher_id, student_id, recipient_phone, recipient_type, message) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [teacherId, student_id || null, recipient_phone, recipient_type || 'student', message]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Get notification history ──
router.get('/log', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      `SELECT nl.*, s.name as student_name
       FROM notification_log nl
       LEFT JOIN students s ON nl.student_id = s.id
       WHERE nl.teacher_id = $1
       ORDER BY nl.sent_at DESC LIMIT 100`,
      [teacherId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
