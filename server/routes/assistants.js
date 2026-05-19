const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateAssistant } = require('../middleware/validate');
const { invalidatePermissions } = require('../lib/permissionsCache');

const router = express.Router();
router.use(authenticate);

router.get('/', requireRole('teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id,username,name,phone,can_add_students,can_edit_students,can_delete_students,can_manage_exams,can_view_analytics,can_send_reports,can_manage_payments,can_manage_courses,created_at FROM assistants WHERE teacher_id=$1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireRole('teacher'), validateAssistant, async (req, res) => {
  const { username, password, name, phone, can_add_students, can_edit_students, can_delete_students, can_manage_exams, can_view_analytics, can_send_reports, can_manage_payments, can_manage_courses } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO assistants (username,password,name,phone,teacher_id,can_add_students,can_edit_students,can_delete_students,can_manage_exams,can_view_analytics,can_send_reports,can_manage_payments,can_manage_courses)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id,username,name,phone,can_add_students,can_edit_students,can_delete_students,can_manage_exams,can_view_analytics,can_send_reports,can_manage_payments,can_manage_courses`,
      [username, hashed, name, phone, req.user.id, can_add_students ?? true, can_edit_students ?? true, can_delete_students ?? false, can_manage_exams ?? true, can_view_analytics ?? true, can_send_reports ?? true, can_manage_payments ?? false, can_manage_courses ?? false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/permissions', requireRole('teacher'), async (req, res) => {
  const { can_add_students, can_edit_students, can_delete_students, can_manage_exams, can_view_analytics, can_send_reports, can_manage_payments, can_manage_courses } = req.body;
  try {
    const result = await pool.query(
      'UPDATE assistants SET can_add_students=$1,can_edit_students=$2,can_delete_students=$3,can_manage_exams=$4,can_view_analytics=$5,can_send_reports=$6,can_manage_payments=$7,can_manage_courses=$8 WHERE id=$9 AND teacher_id=$10 RETURNING id,username,name,can_add_students,can_edit_students,can_delete_students,can_manage_exams,can_view_analytics,can_send_reports,can_manage_payments,can_manage_courses',
      [can_add_students, can_edit_students, can_delete_students, can_manage_exams, can_view_analytics, can_send_reports, can_manage_payments ?? false, can_manage_courses ?? false, req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Assistant not found' });
    invalidatePermissions(parseInt(req.params.id));
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireRole('teacher'), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM assistants WHERE id=$1 AND teacher_id=$2 RETURNING id', [req.params.id, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Assistant not found' });
    invalidatePermissions(parseInt(req.params.id));
    res.json({ message: 'Assistant deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

const checkAnalyticsPerm = async (req, res, next) => {
  if (req.user.role === 'teacher') return next();
  try {
    const r = await pool.query('SELECT can_view_analytics FROM assistants WHERE id=$1', [req.user.id]);
    if (!r.rows.length || !r.rows[0].can_view_analytics)
      return res.status(403).json({ error: 'Access denied: missing permission (can_view_analytics)' });
    next();
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
};

router.get('/analytics', requireRole('teacher', 'assistant'), checkAnalyticsPerm, async (req, res) => {
  try {
    let teacherId;
    if (req.user.role === 'teacher') {
      teacherId = req.user.id;
    } else {
      const aRes = await pool.query('SELECT teacher_id FROM assistants WHERE id=$1', [req.user.id]);
      if (!aRes.rows.length) return res.status(404).json({ error: 'Assistant not found' });
      teacherId = aRes.rows[0].teacher_id;
    }

    const [examResults, topStudents, recentResults, stageStats] = await Promise.all([
      pool.query(`
        SELECT e.title, AVG(er.score) as avg_score, COUNT(er.id) as attempt_count,
               MAX(er.score) as max_score, MIN(er.score) as min_score, e.total_score
        FROM exam_results er
        JOIN exams e ON er.exam_id = e.id
        WHERE e.teacher_id = $1
        GROUP BY e.id, e.title, e.total_score
        ORDER BY attempt_count DESC LIMIT 10
      `, [teacherId]),
      pool.query(`
        SELECT s.id, s.name, s.points, s.academic_stage,
               COUNT(er.id) as exams_taken, COALESCE(AVG(er.score), 0) as avg_score
        FROM students s
        LEFT JOIN exam_results er ON s.id = er.student_id
        WHERE s.teacher_id = $1
        GROUP BY s.id, s.name, s.points, s.academic_stage
        ORDER BY s.points DESC LIMIT 20
      `, [teacherId]),
      pool.query(`
        SELECT er.id, er.score, er.correct_count, er.wrong_count,
               er.unanswered_count, er.created_at,
               s.name as student_name, s.academic_stage,
               e.title as exam_title, e.total_score, e.pass_score
        FROM exam_results er
        JOIN students s ON er.student_id = s.id
        JOIN exams e ON er.exam_id = e.id
        WHERE e.teacher_id = $1
        ORDER BY er.created_at DESC LIMIT 30
        
      `, [teacherId]),
      pool.query(`
        SELECT s.academic_stage, COUNT(s.id) as student_count, COALESCE(AVG(er.score),0) as avg_score
        FROM students s
        LEFT JOIN exam_results er ON s.id = er.student_id
        WHERE s.teacher_id = $1
        GROUP BY s.academic_stage
        ORDER BY student_count DESC
      `, [teacherId]),
    ]);

    res.json({
      examResults: examResults.rows,
      topStudents: topStudents.rows,
      recentResults: recentResults.rows,
      stageStats: stageStats.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
