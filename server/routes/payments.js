const express = require('express');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const getTeacherId = (req) => req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;

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

router.get('/', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      `SELECT p.*, s.name as student_name, s.phone as student_phone, c.name as course_name
       FROM payments p JOIN students s ON p.student_id=s.id
       LEFT JOIN courses c ON p.course_id=c.id
       WHERE s.teacher_id=$1 ORDER BY p.payment_date DESC`,
      [teacherId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_manage_payments'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { student_id, course_id, amount, method, reference_number, notes } = req.body;
  try {
    const studentCheck = await pool.query('SELECT id FROM students WHERE id=$1 AND teacher_id=$2', [student_id, teacherId]);
    if (!studentCheck.rows.length) {
      return res.status(403).json({ error: 'Access denied: student not yours' });
    }
    if (course_id) {
      const courseCheck = await pool.query('SELECT id FROM courses WHERE id=$1 AND teacher_id=$2', [course_id, teacherId]);
      if (!courseCheck.rows.length) {
        return res.status(403).json({ error: 'Access denied: course not yours' });
      }
    }
    const result = await pool.query(
      'INSERT INTO payments (student_id,course_id,amount,method,reference_number,notes,status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [student_id, course_id, amount, method, reference_number, notes, 'pending']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/verify', requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_manage_payments'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { status } = req.body;
  try {
    const paymentRes = await pool.query(
      `SELECT p.*, s.teacher_id as student_teacher_id
       FROM payments p JOIN students s ON p.student_id=s.id
       WHERE p.id=$1`,
      [req.params.id]
    );
    if (!paymentRes.rows.length) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    if (parseInt(paymentRes.rows[0].student_teacher_id) !== parseInt(teacherId)) {
      return res.status(403).json({ error: 'Access denied: payment not yours' });
    }

    const result = await pool.query(
      'UPDATE payments SET status=$1, verified_by=$2, verified_at=NOW() WHERE id=$3 RETURNING *',
      [status, req.user.role === 'assistant' ? req.user.id : null, req.params.id]
    );

    if (status === 'verified' && result.rows[0].course_id) {
      await pool.query(
        'INSERT INTO student_course_enrollment (student_id,course_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [result.rows[0].student_id, result.rows[0].course_id]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/leaderboard', requireRole('teacher', 'assistant', 'student'), async (req, res) => {
  let teacherId;
  try {
    if (req.user.role === 'student') {
      const r = await pool.query('SELECT teacher_id FROM students WHERE id=$1', [req.user.id]);
      if (!r.rows.length) return res.status(404).json({ error: 'Student not found' });
      teacherId = r.rows[0].teacher_id;
    } else {
      teacherId = getTeacherId(req);
    }

    const result = await pool.query(
      `SELECT s.id, s.name, s.points, s.academic_stage, s.gender,
              COUNT(DISTINCT er.exam_id) as exams_taken,
              COALESCE(AVG(er.score), 0) as avg_score,
              COUNT(DISTINCT b.id) as badge_count
       FROM students s
       LEFT JOIN exam_results er ON s.id=er.student_id
       LEFT JOIN badges b ON s.id=b.student_id
       WHERE s.teacher_id=$1
       GROUP BY s.id ORDER BY s.points DESC LIMIT 50`,
      [teacherId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
