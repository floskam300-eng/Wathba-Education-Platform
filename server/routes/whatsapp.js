const express = require('express');
const pool    = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { getPermissions }            = require('../lib/permissionsCache');
const wa = require('../lib/whatsapp');

const router = express.Router();
router.use(authenticate);

const getTeacherId = (req) =>
  req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;

const checkSendPerm = async (req, res, next) => {
  if (req.user.role === 'teacher') return next();
  try {
    const perms = await getPermissions(req.user.id, pool);
    if (!perms?.can_send_notifications)
      return res.status(403).json({ error: 'ليس لديك صلاحية إرسال رسائل واتساب' });
    next();
  } catch { res.status(500).json({ error: 'Server error' }); }
};

const teacherOnly = (req, res, next) => {
  if (req.user.role !== 'teacher')
    return res.status(403).json({ error: 'هذه العملية للمعلم فقط' });
  next();
};

// ── GET /api/whatsapp/status ─────────────────────────────────────────────────
router.get('/status', requireRole('teacher', 'assistant'), (req, res) => {
  const teacherId = getTeacherId(req);
  const { status, qrBase64 } = wa.getStatus(teacherId);
  res.json({ status, qrBase64, isTeacher: req.user.role === 'teacher' });
});

// ── POST /api/whatsapp/connect (teacher only) ────────────────────────────────
router.post('/connect', requireRole('teacher'), teacherOnly, async (req, res) => {
  try {
    await wa.initConnection(req.user.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/whatsapp/disconnect (teacher only) ─────────────────────────────
router.post('/disconnect', requireRole('teacher'), teacherOnly, (req, res) => {
  try {
    wa.disconnect(req.user.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/whatsapp/students ───────────────────────────────────────────────
router.get('/students', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.phone, s.parent_phone, s.academic_stage, s.points,
              COUNT(er.id)::int                     AS exam_count,
              COALESCE(AVG(er.score),0)::int         AS avg_score,
              COUNT(CASE WHEN er.score >= e.pass_score THEN 1 END)::int AS pass_count
       FROM students s
       LEFT JOIN exam_results er ON s.id = er.student_id
       LEFT JOIN exams e        ON er.exam_id = e.id
       WHERE s.teacher_id = $1 AND s.deleted_at IS NULL
       GROUP BY s.id ORDER BY s.name ASC`,
      [teacherId]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/whatsapp/send ──────────────────────────────────────────────────
router.post('/send', requireRole('teacher', 'assistant'), checkSendPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { recipients, message } = req.body;

  if (!message?.trim()) return res.status(400).json({ error: 'الرسالة مطلوبة' });
  if (!Array.isArray(recipients) || recipients.length === 0)
    return res.status(400).json({ error: 'اختر مستلماً واحداً على الأقل' });

  const { status } = wa.getStatus(teacherId);
  if (status !== 'connected')
    return res.status(400).json({ error: 'واتساب غير متصل — اطلب من المعلم ربط الواتساب أولاً' });

  const studentIds = [...new Set(recipients.map(r => r.student_id).filter(Boolean))];
  if (studentIds.length > 0) {
    const check = await pool.query(
      'SELECT id FROM students WHERE id = ANY($1) AND teacher_id = $2 AND deleted_at IS NULL',
      [studentIds, teacherId]
    );
    if (check.rows.length < studentIds.length)
      return res.status(400).json({ error: 'بعض الطلاب لا ينتمون لحسابك' });
  }

  const { rows: [log] } = await pool.query(
    `INSERT INTO whatsapp_send_log (teacher_id, message, total_count, status, send_type)
     VALUES ($1, $2, $3, 'sending', 'manual') RETURNING id`,
    [teacherId, message, recipients.length]
  );

  res.json({ ok: true, log_id: log.id, total: recipients.length });

  // Fire-and-forget bulk send with 4-second delay
  (async () => {
    let success = 0, failed = 0;
    for (const rec of recipients) {
      if (!rec.phone) { failed++; continue; }
      try {
        const msg = message
          .replace(/\{name\}/g,         rec.name          || '')
          .replace(/\{student_name\}/g, rec.student_name  || rec.name || '')
          .replace(/\{stage\}/g,        rec.academic_stage || '');
        await wa.sendMessage(teacherId, rec.phone, msg);
        success++;
      } catch (_) { failed++; }
      if (recipients.length > 1) await new Promise(r => setTimeout(r, 4000));
    }
    pool.query(
      `UPDATE whatsapp_send_log SET status='done', success_count=$1, fail_count=$2, finished_at=NOW()
       WHERE id=$3`,
      [success, failed, log.id]
    ).catch(() => {});
  })();
});

// ── GET /api/whatsapp/logs ───────────────────────────────────────────────────
router.get('/logs', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const { rows } = await pool.query(
      `SELECT l.*, s.name AS schedule_name
       FROM whatsapp_send_log l
       LEFT JOIN whatsapp_schedules s ON l.schedule_id = s.id
       WHERE l.teacher_id = $1
       ORDER BY l.created_at DESC LIMIT 50`,
      [teacherId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ── GET /api/whatsapp/schedules ──────────────────────────────────────────────
router.get('/schedules', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const { rows } = await pool.query(
      'SELECT * FROM whatsapp_schedules WHERE teacher_id=$1 ORDER BY created_at DESC',
      [teacherId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ── POST /api/whatsapp/schedules ─────────────────────────────────────────────
router.post('/schedules', requireRole('teacher', 'assistant'), checkSendPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { name, message, target_type = 'parents', stage_filter = 'all', interval_days, next_run_at, is_active = true } = req.body;
  if (!name?.trim() || !message?.trim())
    return res.status(400).json({ error: 'الاسم والرسالة مطلوبان' });
  if (!interval_days || interval_days < 1)
    return res.status(400).json({ error: 'يجب تحديد الفترة الزمنية' });
  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO whatsapp_schedules
         (teacher_id, name, message, target_type, stage_filter, interval_days, next_run_at, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [teacherId, name, message, target_type, stage_filter, interval_days, next_run_at || null, is_active]
    );
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ── PUT /api/whatsapp/schedules/:id ─────────────────────────────────────────
router.put('/schedules/:id', requireRole('teacher', 'assistant'), checkSendPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { name, message, target_type, stage_filter, interval_days, next_run_at, is_active } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE whatsapp_schedules
       SET name=$1, message=$2, target_type=$3, stage_filter=$4,
           interval_days=$5, next_run_at=$6, is_active=$7, updated_at=NOW()
       WHERE id=$8 AND teacher_id=$9 RETURNING *`,
      [name, message, target_type, stage_filter, interval_days, next_run_at || null, is_active, req.params.id, teacherId]
    );
    if (!rows.length) return res.status(404).json({ error: 'الجدول غير موجود' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ── DELETE /api/whatsapp/schedules/:id ───────────────────────────────────────
router.delete('/schedules/:id', requireRole('teacher', 'assistant'), checkSendPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    await pool.query('DELETE FROM whatsapp_schedules WHERE id=$1 AND teacher_id=$2', [req.params.id, teacherId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
