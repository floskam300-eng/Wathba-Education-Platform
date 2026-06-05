const express = require('express');
const pool    = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { getPermissions }            = require('../lib/permissionsCache');
const { logActivity, getActor, getIp } = require('../lib/activityLog');
const wa = require('../lib/whatsapp');

const router = express.Router();
router.use(authenticate);

// ── Anti-ban delay helper ─────────────────────────────────────────────────────
// Returns a random delay between 8 and 16 seconds to avoid WhatsApp pattern detection
const waSendDelay = () => new Promise(r => setTimeout(r, 8000 + Math.floor(Math.random() * 8000)));

// ── Active-send guard: blocks a new bulk send while one is already running ────
// Uses a presence-based check (not time-based) — cleared only when send finishes.
const activeSends = new Set(); // teacherIds with an active bulk send in progress
function checkActiveSend(teacherId) {
  if (activeSends.has(teacherId))
    return 'يوجد إرسال جارٍ بالفعل — انتظر حتى يكتمل قبل إرسال جديد';
  return null;
}

// ── Connect-request debounce: prevent rapid reconnect spam ───────────────────
const connectDebounce = new Map(); // teacherId → timestamp
const CONNECT_DEBOUNCE_MS = 10_000; // 10 seconds between connect attempts

// ── Helpers ──────────────────────────────────────────────────────────────────
const getTeacherId = (req) =>
  req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;

const ALLOWED_TARGETS = ['students', 'parents', 'both'];
const MAX_MESSAGE_LEN = 4096;
const MAX_STUDENTS    = 500;

const checkSendPerm = async (req, res, next) => {
  if (req.user.role === 'teacher') return next();
  try {
    const perms = await getPermissions(req.user.id, pool);
    if (!perms?.can_send_notifications)
      return res.status(403).json({ error: 'ليس لديك صلاحية إرسال رسائل واتساب' });
    next();
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
};

// ── GET /api/whatsapp/status ──────────────────────────────────────────────────
router.get('/status', requireRole('teacher', 'assistant'), (req, res) => {
  const teacherId = getTeacherId(req);
  const { status, qrBase64 } = wa.getStatus(teacherId);
  res.json({ status, qrBase64, isTeacher: req.user.role === 'teacher' });
});

// ── POST /api/whatsapp/connect (teacher only) ─────────────────────────────────
router.post('/connect', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  // Debounce: ignore if a connect was attempted within the last 10 seconds
  const lastConnect = connectDebounce.get(teacherId);
  if (lastConnect && Date.now() - lastConnect < CONNECT_DEBOUNCE_MS) {
    return res.status(429).json({ error: 'الرجاء الانتظار قبل محاولة الاتصال مرة أخرى' });
  }
  connectDebounce.set(teacherId, Date.now());
  try {
    await wa.initConnection(teacherId);
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'whatsapp_connect',
      entity: { type: 'whatsapp' },
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/whatsapp/disconnect (teacher only) ──────────────────────────────
router.post('/disconnect', requireRole('teacher'), (req, res) => {
  try {
    wa.disconnect(req.user.id);
    logActivity({
      teacherId: req.user.id, actor: getActor(req), ip: getIp(req),
      action: 'whatsapp_disconnect',
      entity: { type: 'whatsapp' },
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/whatsapp/students ────────────────────────────────────────────────
router.get('/students', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.phone, s.parent_phone, s.academic_stage, s.points,
              COUNT(er.id)::int                                              AS exam_count,
              COALESCE(AVG(er.score), 0)::int                                AS avg_score,
              COUNT(CASE WHEN er.score >= e.pass_score THEN 1 END)::int      AS pass_count
       FROM students s
       LEFT JOIN exam_results er ON s.id = er.student_id
       LEFT JOIN exams e         ON er.exam_id = e.id
       WHERE s.teacher_id = $1 AND s.deleted_at IS NULL
       GROUP BY s.id ORDER BY s.name ASC`,
      [teacherId]
    );
    res.json(rows);
  } catch (e) {
    console.error('[WA /students]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/whatsapp/send ───────────────────────────────────────────────────
// SECURITY: phones are always fetched from the DB — never trusted from client.
router.post('/send', requireRole('teacher', 'assistant'), checkSendPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { student_ids, message, target_type = 'parents' } = req.body;

  // ── Input validation ───────────────────────────────────────────────────────
  if (!message?.trim())
    return res.status(400).json({ error: 'الرسالة مطلوبة' });
  if (message.length > MAX_MESSAGE_LEN)
    return res.status(400).json({ error: `الرسالة طويلة جداً (الحد الأقصى ${MAX_MESSAGE_LEN} حرف)` });
  if (!ALLOWED_TARGETS.includes(target_type))
    return res.status(400).json({ error: 'نوع المستلم غير صالح' });
  if (!Array.isArray(student_ids) || student_ids.length === 0)
    return res.status(400).json({ error: 'اختر طالباً واحداً على الأقل' });
  if (student_ids.length > MAX_STUDENTS)
    return res.status(400).json({ error: `الحد الأقصى ${MAX_STUDENTS} طالب في المرة الواحدة` });
  if (!student_ids.every(id => Number.isInteger(id) && id > 0))
    return res.status(400).json({ error: 'معرّفات الطلاب غير صالحة' });

  // ── Guard: block if this teacher already has a bulk send in progress ─────────
  const activeErr = checkActiveSend(teacherId);
  if (activeErr) return res.status(429).json({ error: activeErr });

  const { status } = wa.getStatus(teacherId);
  if (status !== 'connected')
    return res.status(400).json({ error: 'واتساب غير متصل — اطلب من المعلم ربط الواتساب أولاً' });

  // ── Fetch phone numbers from DB — NEVER trust client-provided phones ────────
  let students;
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.phone, s.parent_phone, s.academic_stage,
              COALESCE(AVG(er.score), 0)::int AS avg_score,
              COUNT(er.id)::int               AS exam_count
       FROM students s
       LEFT JOIN exam_results er ON s.id = er.student_id
       WHERE s.id = ANY($1) AND s.teacher_id = $2 AND s.deleted_at IS NULL
       GROUP BY s.id`,
      [student_ids, teacherId]
    );
    students = rows;
  } catch (e) {
    console.error('[WA /send] DB error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }

  if (students.length === 0)
    return res.status(400).json({ error: 'لا يوجد طلاب صالحون' });

  // Build recipient list from DB data (phones are from DB, not from request)
  const recipients = [];
  for (const s of students) {
    if ((target_type === 'students' || target_type === 'both') && s.phone)
      recipients.push({ phone: s.phone, name: s.name, academic_stage: s.academic_stage, avg_score: s.avg_score, exam_count: s.exam_count });
    if ((target_type === 'parents'  || target_type === 'both') && s.parent_phone)
      recipients.push({ phone: s.parent_phone, name: s.name, academic_stage: s.academic_stage, avg_score: s.avg_score, exam_count: s.exam_count });
  }

  if (recipients.length === 0)
    return res.status(400).json({ error: 'لا يوجد أرقام مسجّلة للمستلمين المحددين' });

  // ── Create send log ────────────────────────────────────────────────────────
  let logId;
  try {
    const { rows: [log] } = await pool.query(
      `INSERT INTO whatsapp_send_log (teacher_id, message, total_count, status, send_type)
       VALUES ($1, $2, $3, 'sending', 'manual') RETURNING id`,
      [teacherId, message, recipients.length]
    );
    logId = log.id;
  } catch (e) {
    console.error('[WA /send] log insert error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }

  // ── Activity log ───────────────────────────────────────────────────────────
  logActivity({
    teacherId, actor: getActor(req), ip: getIp(req),
    action: 'whatsapp_send',
    entity: { type: 'whatsapp_message' },
    details: { target_type, student_count: students.length, recipient_count: recipients.length, log_id: logId },
  });

  // Mark teacher as having an active bulk send — blocks concurrent sends
  activeSends.add(teacherId);

  res.json({ ok: true, log_id: logId, total: recipients.length });

  // ── Fire-and-forget bulk send ───────────────────────────────────────────────
  (async () => {
    let success = 0, failed = 0;
    try {
      for (let i = 0; i < recipients.length; i++) {
        const rec = recipients[i];
        try {
          const msg = message
            .replace(/\{name\}/g,          rec.name           || '')
            .replace(/\{student_name\}/g,  rec.name           || '')
            .replace(/\{avg_score\}/g,     String(rec.avg_score  ?? 0))
            .replace(/\{exam_count\}/g,    String(rec.exam_count ?? 0))
            .replace(/\{stage\}/g,         rec.academic_stage || '');
          await wa.sendMessage(teacherId, rec.phone, msg);
          success++;
        } catch (_) { failed++; }
        // Random delay 8–16s between messages to avoid WhatsApp ban — skip after last message
        if (i < recipients.length - 1) await waSendDelay();
      }
    } finally {
      // Always release the lock — even if an unexpected error escapes the inner try
      activeSends.delete(teacherId);
      pool.query(
        `UPDATE whatsapp_send_log
         SET status='done', success_count=$1, fail_count=$2, finished_at=NOW()
         WHERE id=$3`,
        [success, failed, logId]
      ).catch(() => {});
    }
  })();
});

// ── GET /api/whatsapp/logs ────────────────────────────────────────────────────
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
  } catch (e) {
    console.error('[WA /logs]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/whatsapp/schedules ───────────────────────────────────────────────
router.get('/schedules', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const { rows } = await pool.query(
      'SELECT * FROM whatsapp_schedules WHERE teacher_id=$1 ORDER BY created_at DESC',
      [teacherId]
    );
    res.json(rows);
  } catch (e) {
    console.error('[WA /schedules GET]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/whatsapp/schedules ──────────────────────────────────────────────
router.post('/schedules', requireRole('teacher', 'assistant'), checkSendPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { name, message, target_type = 'parents', stage_filter = 'all', interval_days, next_run_at, is_active = true } = req.body;

  if (!name?.trim())    return res.status(400).json({ error: 'اسم الجدولة مطلوب' });
  if (!message?.trim()) return res.status(400).json({ error: 'نص الرسالة مطلوب' });
  if (name.length > 200)          return res.status(400).json({ error: 'الاسم طويل جداً (200 حرف كحد أقصى)' });
  if (message.length > MAX_MESSAGE_LEN) return res.status(400).json({ error: `الرسالة طويلة جداً (${MAX_MESSAGE_LEN} حرف كحد أقصى)` });
  if (!ALLOWED_TARGETS.includes(target_type))
    return res.status(400).json({ error: 'نوع المستلم غير صالح' });

  const days = parseInt(interval_days, 10);
  if (!days || days < 1 || days > 365)
    return res.status(400).json({ error: 'الفترة يجب أن تكون بين 1 و 365 يوم' });

  let parsedDate = null;
  if (next_run_at) {
    parsedDate = new Date(next_run_at);
    if (isNaN(parsedDate.getTime())) return res.status(400).json({ error: 'تاريخ البداية غير صالح' });
  }

  const safeStage = typeof stage_filter === 'string' && stage_filter.length <= 100 ? stage_filter.trim() : 'all';

  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO whatsapp_schedules
         (teacher_id, name, message, target_type, stage_filter, interval_days, next_run_at, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [teacherId, name.trim(), message.trim(), target_type, safeStage, days, parsedDate, is_active]
    );
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'whatsapp_schedule_create',
      entity: { type: 'whatsapp_schedule', id: row.id, name: row.name },
      details: { target_type, interval_days: days },
    });
    res.status(201).json(row);
  } catch (e) {
    console.error('[WA /schedules POST]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/whatsapp/schedules/:id ──────────────────────────────────────────
router.put('/schedules/:id', requireRole('teacher', 'assistant'), checkSendPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { name, message, target_type, stage_filter, interval_days, next_run_at, is_active } = req.body;

  if (!name?.trim())    return res.status(400).json({ error: 'اسم الجدولة مطلوب' });
  if (!message?.trim()) return res.status(400).json({ error: 'نص الرسالة مطلوب' });
  if (name.length > 200)          return res.status(400).json({ error: 'الاسم طويل جداً' });
  if (message.length > MAX_MESSAGE_LEN) return res.status(400).json({ error: 'الرسالة طويلة جداً' });
  if (!ALLOWED_TARGETS.includes(target_type))
    return res.status(400).json({ error: 'نوع المستلم غير صالح' });

  const days = parseInt(interval_days, 10);
  if (!days || days < 1 || days > 365)
    return res.status(400).json({ error: 'الفترة يجب أن تكون بين 1 و 365 يوم' });

  let parsedDate = null;
  if (next_run_at) {
    parsedDate = new Date(next_run_at);
    if (isNaN(parsedDate.getTime())) return res.status(400).json({ error: 'تاريخ البداية غير صالح' });
  }

  const safeStage = typeof stage_filter === 'string' && stage_filter.length <= 100 ? stage_filter.trim() : 'all';

  try {
    const { rows } = await pool.query(
      `UPDATE whatsapp_schedules
       SET name=$1, message=$2, target_type=$3, stage_filter=$4,
           interval_days=$5, next_run_at=$6, is_active=$7, updated_at=NOW()
       WHERE id=$8 AND teacher_id=$9 RETURNING *`,
      [name.trim(), message.trim(), target_type, safeStage, days, parsedDate, is_active, req.params.id, teacherId]
    );
    if (!rows.length) return res.status(404).json({ error: 'الجدولة غير موجودة أو لا تنتمي لحسابك' });
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'whatsapp_schedule_edit',
      entity: { type: 'whatsapp_schedule', id: rows[0].id, name: rows[0].name },
      details: { target_type, interval_days: days, is_active },
    });
    res.json(rows[0]);
  } catch (e) {
    console.error('[WA /schedules PUT]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/whatsapp/schedules/:id ────────────────────────────────────────
router.delete('/schedules/:id', requireRole('teacher', 'assistant'), checkSendPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const { rows } = await pool.query(
      'DELETE FROM whatsapp_schedules WHERE id=$1 AND teacher_id=$2 RETURNING name',
      [req.params.id, teacherId]
    );
    if (!rows.length) return res.status(404).json({ error: 'الجدولة غير موجودة أو لا تنتمي لحسابك' });
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'whatsapp_schedule_delete',
      entity: { type: 'whatsapp_schedule', id: req.params.id, name: rows[0].name },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[WA /schedules DELETE]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
