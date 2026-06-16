const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/connection');
const { authenticate, requireRole, invalidateAssistantAuthCache } = require('../middleware/auth');
const { validateAssistant } = require('../middleware/validate');
const { invalidatePermissions } = require('../lib/permissionsCache');
const { logActivity, getActor, getIp } = require('../lib/activityLog');
const { getCached, setCache } = require('../lib/analyticsCache');

const router = express.Router();
router.use(authenticate);

router.get('/', requireRole('teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id,username,name,phone,can_add_students,can_edit_students,can_delete_students,can_manage_exams,can_view_analytics,can_manage_payments,can_manage_courses,can_send_notifications,can_manage_recitations,created_at FROM assistants WHERE teacher_id=$1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireRole('teacher'), validateAssistant, async (req, res) => {
  const { username, password, name, phone, can_add_students, can_edit_students, can_delete_students, can_manage_exams, can_view_analytics, can_manage_payments, can_manage_courses, can_send_notifications, can_manage_recitations } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO assistants (username,password,name,phone,teacher_id,can_add_students,can_edit_students,can_delete_students,can_manage_exams,can_view_analytics,can_manage_payments,can_manage_courses,can_send_notifications,can_manage_recitations)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id,username,name,phone,can_add_students,can_edit_students,can_delete_students,can_manage_exams,can_view_analytics,can_manage_payments,can_manage_courses,can_send_notifications,can_manage_recitations`,
      [username, hashed, name, phone, req.user.id, can_add_students ?? true, can_edit_students ?? true, can_delete_students ?? false, can_manage_exams ?? true, can_view_analytics ?? true, can_manage_payments ?? false, can_manage_courses ?? false, can_send_notifications ?? false, can_manage_recitations ?? false]
    );
    logActivity({
      teacherId: req.user.id, actor: getActor(req), ip: getIp(req),
      action: 'create_assistant',
      entity: { type: 'assistant', id: result.rows[0].id, name },
      details: { username },
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/permissions', requireRole('teacher'), async (req, res) => {
  const { can_add_students, can_edit_students, can_delete_students, can_manage_exams, can_view_analytics, can_manage_payments, can_manage_courses, can_send_notifications, can_manage_recitations } = req.body;
  try {
    const oldPerms = await pool.query(
      'SELECT name,can_add_students,can_edit_students,can_delete_students,can_manage_exams,can_view_analytics,can_manage_payments,can_manage_courses,can_send_notifications,can_manage_recitations FROM assistants WHERE id=$1 AND teacher_id=$2',
      [req.params.id, req.user.id]
    );
    const result = await pool.query(
      'UPDATE assistants SET can_add_students=$1,can_edit_students=$2,can_delete_students=$3,can_manage_exams=$4,can_view_analytics=$5,can_manage_payments=$6,can_manage_courses=$7,can_send_notifications=$8,can_manage_recitations=$9 WHERE id=$10 AND teacher_id=$11 RETURNING id,username,name,can_add_students,can_edit_students,can_delete_students,can_manage_exams,can_view_analytics,can_manage_payments,can_manage_courses,can_send_notifications,can_manage_recitations',
      [can_add_students, can_edit_students, can_delete_students, can_manage_exams, can_view_analytics, can_manage_payments ?? false, can_manage_courses ?? false, can_send_notifications ?? false, can_manage_recitations ?? false, req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Assistant not found' });
    invalidatePermissions(parseInt(req.params.id));
    const PERM_LABELS = {
      can_add_students: 'إضافة طلاب', can_edit_students: 'تعديل طلاب',
      can_delete_students: 'حذف طلاب', can_manage_exams: 'إدارة اختبارات',
      can_view_analytics: 'عرض تحليلات', can_manage_payments: 'إدارة مدفوعات',
      can_manage_courses: 'إدارة كورسات', can_send_notifications: 'إرسال إشعارات',
      can_manage_recitations: 'إدارة التسميع',
    };
    const PERM_KEYS = Object.keys(PERM_LABELS);
    const old = oldPerms.rows[0] || {};
    const granted = PERM_KEYS.filter(k => !old[k] && result.rows[0][k]).map(k => PERM_LABELS[k]);
    const revoked = PERM_KEYS.filter(k => old[k] && !result.rows[0][k]).map(k => PERM_LABELS[k]);
    logActivity({
      teacherId: req.user.id, actor: getActor(req), ip: getIp(req),
      action: 'edit_assistant_perms',
      entity: { type: 'assistant', id: result.rows[0].id, name: result.rows[0].name },
      details: { granted: granted.length ? granted : undefined, revoked: revoked.length ? revoked : undefined },
    });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireRole('teacher'), async (req, res) => {
  const assistantId = parseInt(req.params.id, 10);
  if (isNaN(assistantId) || assistantId <= 0) return res.status(400).json({ error: 'Invalid assistant ID' });
  try {
    const aInfo = await pool.query('SELECT name FROM assistants WHERE id=$1 AND teacher_id=$2', [assistantId, req.user.id]);
    const result = await pool.query('DELETE FROM assistants WHERE id=$1 AND teacher_id=$2 RETURNING id', [assistantId, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Assistant not found' });
    invalidatePermissions(assistantId);
    invalidateAssistantAuthCache(assistantId);
    logActivity({
      teacherId: req.user.id, actor: getActor(req), ip: getIp(req),
      action: 'delete_assistant',
      entity: { type: 'assistant', id: assistantId, name: aInfo.rows[0]?.name },
    });
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

    const cacheKey = `t${teacherId}_asst_analytics`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const [examResults, topStudents, recentResults, stageStats, totalStudentsRes] = await Promise.all([
      pool.query(`
        SELECT e.id, e.title, e.total_score,
               ROUND(AVG(er.score::numeric / NULLIF(e.total_score,0) * 100), 1) AS avg_pct,
               ROUND(MAX(er.score::numeric / NULLIF(e.total_score,0) * 100), 1) AS max_pct,
               ROUND(MIN(er.score::numeric / NULLIF(e.total_score,0) * 100), 1) AS min_pct,
               COUNT(er.id) as attempt_count
        FROM exam_results er
        JOIN exams e ON er.exam_id = e.id
        WHERE e.teacher_id = $1 AND er.is_latest = true
        GROUP BY e.id, e.title, e.total_score
        ORDER BY attempt_count DESC LIMIT 10
      `, [teacherId]),
      pool.query(`
        SELECT s.id, s.name, s.username, s.points, s.academic_stage, s.gender,
               COUNT(er.id) as exams_taken,
               COALESCE(ROUND(AVG(er.score::numeric / NULLIF(e.total_score,0) * 100), 1), 0) as avg_score
        FROM students s
        LEFT JOIN exam_results er ON s.id = er.student_id AND er.is_latest = true
        LEFT JOIN exams e ON er.exam_id = e.id
        WHERE s.teacher_id = $1 AND s.deleted_at IS NULL
        GROUP BY s.id, s.name, s.username, s.points, s.academic_stage, s.gender
        ORDER BY s.points DESC LIMIT 50
      `, [teacherId]),
      pool.query(`
        SELECT er.id, er.score, er.correct_count, er.wrong_count,
               er.unanswered_count, er.created_at,
               s.name as student_name, s.academic_stage,
               e.title as exam_title, e.total_score, e.pass_score
        FROM exam_results er
        JOIN students s ON er.student_id = s.id
        JOIN exams e ON er.exam_id = e.id
        WHERE e.teacher_id = $1 AND er.is_latest = true
        ORDER BY er.created_at DESC LIMIT 100
      `, [teacherId]),
      pool.query(`
        SELECT s.academic_stage, COUNT(s.id)::int as student_count,
               COALESCE(ROUND(AVG(er.score::numeric / NULLIF(e.total_score,0) * 100), 1), 0) as avg_score
        FROM students s
        LEFT JOIN exam_results er ON s.id = er.student_id AND er.is_latest = true
        LEFT JOIN exams e ON er.exam_id = e.id
        WHERE s.teacher_id = $1 AND s.deleted_at IS NULL
        GROUP BY s.academic_stage
        ORDER BY student_count DESC
      `, [teacherId]),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM students WHERE teacher_id = $1 AND deleted_at IS NULL`,
        [teacherId]
      ),
    ]);

    const result = {
      examResults: examResults.rows,
      topStudents: topStudents.rows,
      recentResults: recentResults.rows,
      stageStats: stageStats.rows,
      totalStudents: totalStudentsRes.rows[0].count,
    };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/course-stats', requireRole('teacher', 'assistant'), checkAnalyticsPerm, async (req, res) => {
  try {
    let teacherId;
    if (req.user.role === 'teacher') {
      teacherId = req.user.id;
    } else {
      const aRes = await pool.query('SELECT teacher_id FROM assistants WHERE id=$1', [req.user.id]);
      if (!aRes.rows.length) return res.status(404).json({ error: 'Assistant not found' });
      teacherId = aRes.rows[0].teacher_id;
    }
    // BUG-2 FIX: share teacher's cache key so assistant + teacher hit the same cached result
    const cacheKey = `t${teacherId}_coursestats`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);
    const result = await pool.query(`
      SELECT c.id, c.name, c.target_stage,
             COUNT(DISTINCT sce.student_id)::int AS enrolled_count,
             COUNT(DISTINCT v.id)::int            AS total_videos,
             -- BUG-4/5 FIX: join vp per enrolled student only; compute true engagement
             -- (sum of all student-video progress / total possible combinations)
             -- so students who never watched count as 0%, not excluded from AVG
             CASE
               WHEN COUNT(DISTINCT sce.student_id) > 0 AND COUNT(DISTINCT v.id) > 0
               THEN ROUND(
                 SUM(COALESCE(vp.progress_percentage, 0))::numeric
                 / (COUNT(DISTINCT sce.student_id)::numeric * COUNT(DISTINCT v.id)::numeric)
               , 0)::int
               ELSE 0
             END AS avg_progress,
             COUNT(DISTINCT CASE WHEN vp.progress_percentage >= 80 THEN vp.student_id END)::int AS active_students
      FROM courses c
      LEFT JOIN student_course_enrollment sce ON c.id = sce.course_id AND sce.status = 'active'
      LEFT JOIN videos v  ON v.course_id = c.id
      LEFT JOIN video_progress vp ON v.id = vp.video_id AND vp.student_id = sce.student_id
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

module.exports = router;
