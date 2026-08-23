const express = require('express');
const crypto = require('crypto');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { broadcastToTeacherAndAssistants } = require('../sse');
const { getIp } = require('../lib/activityLog');

const router = express.Router();
router.use(authenticate);

// Feature flag check for events/weekly run
router.use(async (req, res, next) => {
  const teacherId = req.tenantTeacherId || (req.user?.role === 'teacher' ? req.user.id : req.user?.teacher_id);
  if (!teacherId) return next();
  try {
    const { rows } = await pool.query(
      "SELECT features_enabled FROM teachers WHERE id = $1", [teacherId]
    );
    const features = rows[0]?.features_enabled || {};
    if (!features.stickman_run) {
      return res.status(403).json({ error: 'خاصية الفعاليات غير مفعلة لهذه المنصة' });
    }
    next();
  } catch (err) {
    console.error('[events route feature check error]:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Returns Monday 00:00:00 Cairo time expressed as a UTC Date
// Egypt = Africa/Cairo (UTC+2 winter / UTC+3 summer — Intl handles DST correctly)
const getWeekStart = () => {
  const now = new Date();
  const cairoDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(now);
  const [y, m, d] = cairoDateStr.split('-').map(Number);

  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun, 1=Mon, …
  const diffDays = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const targetMondayDate = new Date(Date.UTC(y, m - 1, d + diffDays));
  const mondayY = targetMondayDate.getUTCFullYear();
  const mondayM = targetMondayDate.getUTCMonth();
  const mondayD = targetMondayDate.getUTCDate();

  let utcGuess = new Date(Date.UTC(mondayY, mondayM, mondayD, 0, 0, 0));
  for (let i = 0; i < 3; i++) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(utcGuess);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const hourVal = +map.hour === 24 ? 0 : +map.hour;
    const cairoDate = new Date(Date.UTC(+map.year, +map.month - 1, +map.day, hourVal, +map.minute, +map.second));
    const targetDate = new Date(Date.UTC(mondayY, mondayM, mondayD, 0, 0, 0));
    const diffMs = targetDate.getTime() - cairoDate.getTime();
    if (diffMs === 0) break;
    utcGuess = new Date(utcGuess.getTime() + diffMs);
  }
  return utcGuess;
};

// ── Start game session — issues a one-time token to verify real play ──
router.post('/weekly-run/start', requireRole('student'), async (req, res) => {
  try {
    const weekStart = getWeekStart();
    // Check if already played this week
    const { rows: played } = await pool.query(
      `SELECT id FROM event_plays WHERE student_id=$1 AND event_id='weekly_run' AND played_at >= $2`,
      [req.user.id, weekStart.toISOString()]
    );
    if (played.length > 0) {
      return res.json({ success: false, message: 'already_played' });
    }
    // Return existing valid unused token if one already exists (prevents token flooding)
    const existingToken = await pool.query(
      `SELECT token FROM game_session_tokens
       WHERE student_id=$1 AND event_id='weekly_run'
         AND used_at IS NULL AND created_at > NOW() - INTERVAL '2 hours'
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (existingToken.rows.length > 0) {
      return res.json({ success: true, sessionToken: existingToken.rows[0].token });
    }
    // Clean up all old/used tokens for this student before issuing a new one
    await pool.query(
      `DELETE FROM game_session_tokens WHERE student_id=$1 AND event_id='weekly_run'`,
      [req.user.id]
    );
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO game_session_tokens (student_id, token, event_id) VALUES ($1, $2, 'weekly_run')`,
      [req.user.id, token]
    );
    res.json({ success: true, sessionToken: token });
  } catch (err) {
    console.error('[events /weekly-run/start]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/weekly-run/status', requireRole('student'), async (req, res) => {
  try {
    const weekStart = getWeekStart();
    const { rows } = await pool.query(
      `SELECT id, score, completed, played_at FROM event_plays
       WHERE student_id=$1 AND event_id='weekly_run' AND played_at >= $2
       ORDER BY played_at DESC LIMIT 1`,
      [req.user.id, weekStart.toISOString()]
    );
    res.json({
      played: rows.length > 0,
      record: rows[0] || null,
      weekStart: weekStart.toISOString(),
    });
  } catch (err) {
    console.error('[events /weekly-run/status]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/weekly-run/finish', requireRole('student'), async (req, res) => {
  const { sessionToken } = req.body;
  if (!sessionToken) {
    return res.status(400).json({ error: 'مطلوب رمز جلسة اللعبة — ابدأ اللعبة من الصفحة الرسمية' });
  }

  // Server-side validation: cap values to prevent cheating
  const MAX_BOSSES = 3;
  const MAX_POINTS_PER_BOSS = 200;
  const sanitizedBosses = Math.max(0, Math.min(MAX_BOSSES, parseInt(req.body.bossesDefeated) || 0));
  const maxAllowedPoints = sanitizedBosses * MAX_POINTS_PER_BOSS;
  const sanitizedPoints = Math.max(0, Math.min(maxAllowedPoints, parseInt(req.body.pointsEarned) || 0));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Validate session token — must exist, unused, belong to this student, and be < 2 hours old
    const tokenCheck = await client.query(
      `SELECT id FROM game_session_tokens
       WHERE token=$1 AND student_id=$2 AND event_id='weekly_run'
         AND used_at IS NULL AND created_at > NOW() - INTERVAL '2 hours'
       FOR UPDATE`,
      [sessionToken, req.user.id]
    );
    if (!tokenCheck.rows.length) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'رمز جلسة اللعبة غير صالح أو منتهي الصلاحية — ابدأ اللعبة من جديد' });
    }
    // Mark token as used
    await client.query(
      `UPDATE game_session_tokens SET used_at=NOW() WHERE id=$1`,
      [tokenCheck.rows[0].id]
    );

    const weekStart = getWeekStart();
    const existing = await client.query(
      `SELECT id FROM event_plays
       WHERE student_id=$1 AND event_id='weekly_run' AND played_at >= $2`,
      [req.user.id, weekStart.toISOString()]
    );
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.json({ success: false, message: 'already_played', pointsEarned: 0 });
    }
    await client.query(
      `INSERT INTO event_plays (student_id, event_id, score, completed)
       VALUES ($1,'weekly_run',$2,$3)`,
      [req.user.id, sanitizedPoints, sanitizedBosses === MAX_BOSSES]
    );
    if (sanitizedPoints > 0) {
      await client.query(
        'UPDATE students SET points = points + $1 WHERE id = $2',
        [sanitizedPoints, req.user.id]
      );
    }
    await client.query('COMMIT');
    const { rows } = await client.query(
      'SELECT points FROM students WHERE id=$1', [req.user.id]
    );
    res.json({
      success: true,
      pointsEarned: sanitizedPoints,
      newTotal: rows[0]?.points || 0,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[events /weekly-run/finish]', err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ── [L-5] POST /api/events/capture-attempt — server-side audit log ───────────
// Client-side anti-capture is trivially bypassed, but server-side logging makes
// violations auditable and visible to the teacher in the device alerts area.
// Rate-limited per student to max 1 log per 10 seconds (debounce repeated triggers).
const _captureLog = new Map(); // studentId → lastLoggedAt (ms)
const CAPTURE_LOG_TTL_MS = 10_000;

router.post('/capture-attempt', requireRole('student'), async (req, res) => {
  if (req.user?.is_simulation) {
    return res.json({ logged: false, reason: 'simulation' });
  }

  const studentId = req.user.id;
  const now = Date.now();
  const last = _captureLog.get(studentId) || 0;
  if (now - last < CAPTURE_LOG_TTL_MS) {
    return res.json({ logged: false, reason: 'debounced' });
  }
  _captureLog.set(studentId, now);

  const type = (req.body.type || 'unknown').toString().slice(0, 50);

  try {
    // Log to device_alerts table so teacher sees it in the students panel.
    // DB-level debounce: at most one pending capture_attempt alert per student
    // per 15-minute window, so repeated triggers never flood the alerts area
    // (the in-memory map alone doesn't survive restarts or multi-process runs).
    const ins = await pool.query(
      `INSERT INTO device_alerts
         (teacher_id, student_id, alert_type, device_name, ip_address, status)
       SELECT s.teacher_id, $1, 'capture_attempt', $2, $3, 'pending'
         FROM students s
        WHERE s.id = $1
          AND NOT EXISTS (
            SELECT 1 FROM device_alerts da
             WHERE da.student_id = $1
               AND da.alert_type = 'capture_attempt'
               AND da.status = 'pending'
               AND da.created_at > NOW() - INTERVAL '15 minutes'
          )
       RETURNING teacher_id`,
      [studentId, `محاولة نسخ: ${type}`, getIp(req) || '']
    );

    const teacherId = ins.rows[0]?.teacher_id;
    if (!teacherId) {
      // Suppressed by the debounce window — nothing new for the teacher to see.
      return res.json({ logged: false, reason: 'debounced' });
    }

    setImmediate(() => {
      broadcastToTeacherAndAssistants(pool, teacherId, 'device_alert', {
        student_id: studentId,
        student_name: req.user.name,
        student_username: req.user.username,
        device_name: `محاولة نسخ/تصوير: ${type}`,
        ip_address: getIp(req) || '',
        alert_type: 'capture_attempt',
        created_at: new Date().toISOString(),
      }).catch(e => console.error('[SSE] capture_attempt alert broadcast error:', e.message));
    });

    res.json({ logged: true });
  } catch (err) {
    console.error('[events /capture-attempt]', err.message);
    res.json({ logged: false });
  }
});

// Clean up stale _captureLog entries every hour to prevent memory leaks
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [studentId, ts] of _captureLog.entries()) {
    if (ts < cutoff) {
      _captureLog.delete(studentId);
    }
  }
}, 60 * 60 * 1000).unref();

module.exports = router;
