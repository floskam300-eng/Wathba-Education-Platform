const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendEvent } = require('../sse');
const { sendFCMToStudents } = require('../lib/fcm');
const { getPermissions } = require('../lib/permissionsCache');

const router = express.Router();
router.use(authenticate);

// Rate limit bulk notification sends: max 10 per minute per IP to prevent
// spamming students with notifications or abusing FCM credits.
const sendNotifLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات إرسال كثيرة جداً، انتظر دقيقة ثم أعد المحاولة' },
});

const getTeacherId = (req) => req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;

// ── Permission guard: can_send_notifications (platform bulk notifications) ──
const checkNotifPermission = async (req, res, next) => {
  if (req.user.role === 'teacher') return next();
  try {
    const perms = await getPermissions(req.user.id, pool);
    if (!perms || !perms.can_send_notifications)
      return res.status(403).json({ error: 'Access denied: missing permission (can_send_notifications)' });
    next();
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
};


const TYPE_TITLES = {
  general:              'إشعار عام',
  exam_result:          'نتيجة اختبار',
  new_exam:             'اختبار جديد',
  new_course:           'كورس جديد',
  retry_approved:       'قبول إعادة اختبار',
  retry_rejected:       'رفض إعادة اختبار',
  enrollment_approved:  'قبول في كورس',
  enrollment_rejected:  'رفض طلب الانضمام',
  payment:              'إشعار دفع',
  badge:                'شارة جديدة',
  reminder:             'تذكير',
  announcement:         'إعلان هام',
};

// ── List students (for notifications) ──────────────────────────────
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

// ── Save student FCM token ───────────────────────────────────────────
router.post('/fcm-token', requireRole('student'), async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });
  try {
    await pool.query('UPDATE students SET fcm_token = $1 WHERE id = $2', [token, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});


// ── Send platform (in-app) notification to selected students ────────
const MAX_NOTIFICATION_STUDENTS = 500;

router.post('/platform', requireRole('teacher', 'assistant'), checkNotifPermission, sendNotifLimiter, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { student_ids, message, type = 'general', title } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'الرسالة مطلوبة' });
  if (!Array.isArray(student_ids) || student_ids.length === 0)
    return res.status(400).json({ error: 'اختر طالباً على الأقل' });
  if (student_ids.length > MAX_NOTIFICATION_STUDENTS)
    return res.status(400).json({ error: `الحد الأقصى ${MAX_NOTIFICATION_STUDENTS} طالب في المرة الواحدة` });

  try {
    const resolvedTitle = title || TYPE_TITLES[type] || 'إشعار جديد';

    // Fetch names in one query + verify students belong to this teacher
    const namesRes = await pool.query(
      'SELECT id, name FROM students WHERE id = ANY($1) AND teacher_id=$2 AND deleted_at IS NULL',
      [student_ids, teacherId]
    );
    const nameMap = Object.fromEntries(namesRes.rows.map(r => [r.id, r.name]));
    const validIds = namesRes.rows.map(r => r.id);

    if (validIds.length === 0) return res.status(400).json({ error: 'لا يوجد طلاب صالحون في القائمة' });

    // Build personalised messages per student
    const personalMsgs = validIds.map(sid => message.replace(/\{name\}/g, nameMap[sid] || ''));

    // Batch INSERT all notifications in one query using unnest
    const insertRes = await pool.query(
      `INSERT INTO notification_log
         (teacher_id, student_id, recipient_type, message, type, is_read, source, title)
       SELECT $1, unnest($2::int[]), 'student', unnest($3::text[]), $4, false, 'platform', $5
       RETURNING id, student_id, message, sent_at`,
      [teacherId, validIds, personalMsgs, type, resolvedTitle]
    );

    // Push real-time SSE events
    for (const row of insertRes.rows) {
      sendEvent(`student_${row.student_id}`, 'platform_notification', {
        id:      row.id,
        title:   resolvedTitle,
        message: row.message,
        type,
        sent_at: row.sent_at,
      });
    }

    const fcmBody = message.replace(/\{name\}/g, '').replace(/\s+/g, ' ').trim();
    sendFCMToStudents(pool, validIds, resolvedTitle, fcmBody, { type }).catch(() => {});
    res.status(201).json({ sent: validIds.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Get notification history (teacher/assistant) ────────────────────
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

// ── Student: get own platform notifications ─────────────────────────
router.get('/my', requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notification_log
       WHERE student_id = $1 AND source = 'platform'
       ORDER BY sent_at DESC LIMIT 50`,
      [req.user.id]
    );
    const unread = result.rows.filter(r => !r.is_read).length;
    res.json({ notifications: result.rows, unread });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Student: mark all notifications as read (must be before /:id/read) ──
router.patch('/my/read-all', requireRole('student'), async (req, res) => {
  try {
    await pool.query(
      `UPDATE notification_log SET is_read = true
       WHERE student_id = $1 AND source = 'platform' AND is_read = false`,
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Student: mark single notification as read ───────────────────────
router.patch('/my/:id/read', requireRole('student'), async (req, res) => {
  try {
    await pool.query(
      `UPDATE notification_log SET is_read = true WHERE id = $1 AND student_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
