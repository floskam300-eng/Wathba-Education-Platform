const express = require('express');
const crypto  = require('crypto');
const pool    = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendEvent, broadcastToTeacherStudents } = require('../sse');

const router = express.Router();
router.use(authenticate);

/* ── Chat rate limiter: max 5 msgs / 5 s per student ─────────
   In-memory map: key → { count, resetAt }
────────────────────────────────────────────────────────────── */
const chatRateMap = new Map();
const CHAT_MAX    = 5;
const CHAT_WIN_MS = 5000;

function chatRateCheck(userId) {
  const now = Date.now();
  const rec = chatRateMap.get(userId);
  if (!rec || now > rec.resetAt) {
    chatRateMap.set(userId, { count: 1, resetAt: now + CHAT_WIN_MS });
    return true;
  }
  if (rec.count >= CHAT_MAX) return false;
  rec.count++;
  return true;
}

/* ── LiveKit token rate limiter: max 5 tokens / 60 s ─────────
   Prevents token flooding (e.g. hammering /livekit-token)
────────────────────────────────────────────────────────────── */
const tokenRateMap = new Map();
const TOKEN_MAX    = 5;
const TOKEN_WIN_MS = 60000;

function tokenRateCheck(userId, streamId) {
  const key = `${userId}:${streamId}`;
  const now = Date.now();
  const rec = tokenRateMap.get(key);
  if (!rec || now > rec.resetAt) {
    tokenRateMap.set(key, { count: 1, resetAt: now + TOKEN_WIN_MS });
    return true;
  }
  if (rec.count >= TOKEN_MAX) return false;
  rec.count++;
  return true;
}

// Cleanup stale rate-limit entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of chatRateMap)  { if (now > v.resetAt) chatRateMap.delete(k);  }
  for (const [k, v] of tokenRateMap) { if (now > v.resetAt) tokenRateMap.delete(k); }
}, 120000);

/* ── In-memory viewer cache ───────────────────────────────────
   Eliminates DB query on every chat message fan-out.
   Kept consistent by join / leave / kick / end endpoints.
   On server restart, cache is cold and warms on first access.
   Map: streamId (string) → Set<studentId (number)>
────────────────────────────────────────────────────────────── */
const viewerCache = new Map();

function vcAdd(streamId, studentId) {
  const key = String(streamId);
  if (!viewerCache.has(key)) viewerCache.set(key, new Set());
  viewerCache.get(key).add(Number(studentId));
}

function vcRemove(streamId, studentId) {
  viewerCache.get(String(streamId))?.delete(Number(studentId));
}

function vcClear(streamId) {
  viewerCache.delete(String(streamId));
}

/** Returns active viewer IDs — cache-first, DB fallback on cold start */
async function getActiveViewerIds(streamId) {
  const key = String(streamId);
  if (viewerCache.has(key)) {
    return [...viewerCache.get(key)];
  }
  // Cache miss (server restart or first access) — warm from DB
  const { rows } = await pool.query(
    'SELECT student_id FROM live_stream_viewers WHERE stream_id=$1 AND is_active=true',
    [streamId]
  );
  const ids = rows.map(r => Number(r.student_id));
  viewerCache.set(key, new Set(ids));
  return ids;
}

/* ──────────────────────────────────────────────────────────────
   LiveKit (Self-Hosted): generate a join token for teacher or student
   Supports: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
   All three must point to the self-hosted LiveKit VPS.
────────────────────────────────────────────────────────────── */
router.post('/:streamId/livekit-token', async (req, res) => {
  const { streamId } = req.params;
  const { id, role, name } = req.user;

  const apiKey    = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const serverUrl = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !serverUrl) {
    return res.status(503).json({
      error: 'خدمة البث غير مهيأة — تواصل مع المسؤول لضبط LIVEKIT_URL و LIVEKIT_API_KEY و LIVEKIT_API_SECRET',
    });
  }

  // Rate-limit token requests: max 5 per student per stream per minute
  if (role === 'student' && !tokenRateCheck(id, streamId)) {
    return res.status(429).json({ error: 'طلبات كثيرة جداً — انتظر دقيقة وحاول مجدداً' });
  }

  try {
    const { rows } = await pool.query(
      "SELECT * FROM live_streams WHERE id=$1 AND status IN ('active','scheduled')",
      [streamId]
    );
    if (!rows.length) return res.status(404).json({ error: 'البث غير موجود أو انتهى' });

    const stream   = rows[0];
    const roomName = stream.room_id;

    if (role === 'teacher') {
      if (parseInt(stream.teacher_id) !== parseInt(id)) {
        return res.status(403).json({ error: 'هذا البث لا ينتمي إليك' });
      }
    } else if (role === 'student') {
      // Verify student belongs to the teacher who owns this stream
      const { rows: studentRows } = await pool.query(
        'SELECT teacher_id FROM students WHERE id=$1 AND deleted_at IS NULL',
        [id]
      );
      if (!studentRows.length || parseInt(studentRows[0].teacher_id) !== parseInt(stream.teacher_id)) {
        return res.status(403).json({ error: 'هذا البث لا ينتمي لمعلمك' });
      }
      // Student must not be kicked
      const { rows: kickCheck } = await pool.query(
        'SELECT is_kicked FROM live_stream_viewers WHERE stream_id=$1 AND student_id=$2',
        [streamId, id]
      );
      if (kickCheck.length && kickCheck[0].is_kicked) {
        return res.status(403).json({ error: 'تم إخراجك من هذا البث' });
      }
    } else {
      return res.status(403).json({ error: 'غير مصرح' });
    }

    const { AccessToken } = require('livekit-server-sdk');

    const at = new AccessToken(apiKey, apiSecret, {
      identity: `${role}_${id}`,
      name:     name || role,
      ttl:      '4h',
    });

    if (role === 'teacher') {
      // Teacher: full publish rights — camera, mic, screen share
      at.addGrant({
        roomJoin:        true,
        room:            roomName,
        canPublish:      true,
        canSubscribe:    true,
        canPublishData:  true,
        roomAdmin:       true,
      });
    } else {
      // Student: subscribe always; publish only if teacher granted mic/screen permission
      const { rows: permRows } = await pool.query(
        'SELECT can_speak, can_share_screen FROM live_stream_viewers WHERE stream_id=$1 AND student_id=$2 AND is_active=true AND is_kicked=false',
        [streamId, id]
      );
      const perm      = permRows[0] || {};
      const canPublish = !!(perm.can_speak || perm.can_share_screen);
      at.addGrant({
        roomJoin:        true,
        room:            roomName,
        canPublish,
        canSubscribe:    true,
        canPublishData:  false,
      });
    }

    const token = await at.toJwt();
    res.json({ token, serverUrl, roomName });
  } catch (err) {
    console.error('[livekit-token]', err);
    res.status(500).json({ error: 'فشل في إنشاء رمز الدخول' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Teacher: schedule a future live stream
────────────────────────────────────────────────────────────── */
router.post('/schedule', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const {
    title, description, access,
    allowed_stages, allowed_student_ids,
    chat_enabled, hand_raise_enabled, scheduled_at,
  } = req.body;

  if (!title?.trim()) return res.status(400).json({ error: 'عنوان البث مطلوب' });
  if (title.trim().length > 200) return res.status(400).json({ error: 'عنوان البث طويل جداً (200 حرف كحد أقصى)' });
  if (description && description.length > 1000) return res.status(400).json({ error: 'وصف البث طويل جداً (1000 حرف كحد أقصى)' });
  if (access && !['all', 'stages', 'specific'].includes(access))
    return res.status(400).json({ error: 'قيمة access غير صالحة' });
  if (!scheduled_at) return res.status(400).json({ error: 'موعد البث مطلوب' });
  if (new Date(scheduled_at).getTime() <= Date.now())
    return res.status(400).json({ error: 'يجب أن يكون الموعد في المستقبل' });

  try {
    const roomId = `wathba-${teacherId}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
    const result = await pool.query(
      `INSERT INTO live_streams
         (teacher_id, room_id, title, description, access,
          allowed_stages, allowed_student_ids, chat_enabled, hand_raise_enabled,
          status, started_at, scheduled_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'scheduled',NULL,$10)
       RETURNING *`,
      [
        teacherId, roomId, title.trim(), description || '',
        access || 'all',
        JSON.stringify(allowed_stages || []),
        JSON.stringify(allowed_student_ids || []),
        chat_enabled !== false,
        hand_raise_enabled !== false,
        new Date(scheduled_at),
      ]
    );
    res.json({ success: true, stream: result.rows[0] });
  } catch (err) {
    console.error('[live/schedule]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Teacher: get their scheduled (upcoming) streams
────────────────────────────────────────────────────────────── */
router.get('/scheduled', requireRole('teacher'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM live_streams
       WHERE teacher_id=$1 AND status='scheduled'
       ORDER BY scheduled_at ASC`,
      [req.user.id]
    );
    res.json({ streams: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Teacher: start a scheduled stream now
────────────────────────────────────────────────────────────── */
router.post('/scheduled/:streamId/start', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const { streamId } = req.params;

  try {
    // Notify active viewers of any currently running stream before ending it
    const { rows: activeStreams } = await pool.query(
      "SELECT id FROM live_streams WHERE teacher_id=$1 AND status='active'",
      [teacherId]
    );
    for (const active of activeStreams) {
      const viewerIds = await getActiveViewerIds(active.id);
      await pool.query(
        "UPDATE live_stream_viewers SET is_active=false, left_at=NOW() WHERE stream_id=$1 AND is_active=true",
        [active.id]
      );
      vcClear(active.id);
      for (const student_id of viewerIds) {
        sendEvent(`student_${student_id}`, 'live_ended', {
          streamId: active.id,
          message: 'انتهى البث المباشر',
        });
      }
    }
    await pool.query(
      "UPDATE live_streams SET status='ended', ended_at=NOW() WHERE teacher_id=$1 AND status='active'",
      [teacherId]
    );

    const result = await pool.query(
      `UPDATE live_streams
       SET status='active', started_at=NOW()
       WHERE id=$1 AND teacher_id=$2 AND status='scheduled'
       RETURNING *`,
      [streamId, teacherId]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: 'البث المجدول غير موجود' });

    const stream = result.rows[0];
    const teacher = await pool.query('SELECT name FROM teachers WHERE id=$1', [teacherId]);
    const teacherName = teacher.rows[0]?.name || 'المعلم';

    const payload = { streamId: stream.id, title: stream.title, teacherName, roomId: stream.room_id };
    await broadcastToTeacherStudents(pool, teacherId, 'live_started', payload);

    res.json({ success: true, stream });
  } catch (err) {
    console.error('[live/scheduled/start]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Teacher: cancel a scheduled stream
────────────────────────────────────────────────────────────── */
router.delete('/scheduled/:streamId', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const { streamId } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM live_streams WHERE id=$1 AND teacher_id=$2 AND status='scheduled' RETURNING id",
      [streamId, teacherId]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: 'البث غير موجود' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Teacher: start a new live stream
────────────────────────────────────────────────────────────── */
router.post('/start', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const {
    title, description, access,
    allowed_stages, allowed_student_ids,
    chat_enabled, hand_raise_enabled,
  } = req.body;

  if (!title?.trim()) return res.status(400).json({ error: 'عنوان البث مطلوب' });
  if (title.trim().length > 200) return res.status(400).json({ error: 'عنوان البث طويل جداً (200 حرف كحد أقصى)' });
  if (description && description.length > 1000) return res.status(400).json({ error: 'وصف البث طويل جداً (1000 حرف كحد أقصى)' });
  if (access && !['all', 'stages', 'specific'].includes(access))
    return res.status(400).json({ error: 'قيمة access غير صالحة' });

  try {
    // Notify active viewers of any currently running stream before ending it
    const { rows: activeStreams } = await pool.query(
      "SELECT id FROM live_streams WHERE teacher_id=$1 AND status='active'",
      [teacherId]
    );
    for (const active of activeStreams) {
      const viewerIds = await getActiveViewerIds(active.id);
      await pool.query(
        "UPDATE live_stream_viewers SET is_active=false, left_at=NOW() WHERE stream_id=$1 AND is_active=true",
        [active.id]
      );
      vcClear(active.id);
      for (const student_id of viewerIds) {
        sendEvent(`student_${student_id}`, 'live_ended', {
          streamId: active.id,
          message: 'انتهى البث المباشر',
        });
      }
    }
    await pool.query(
      "UPDATE live_streams SET status='ended', ended_at=NOW() WHERE teacher_id=$1 AND status='active'",
      [teacherId]
    );

    const roomId = `wathba-${teacherId}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

    const result = await pool.query(
      `INSERT INTO live_streams
         (teacher_id, room_id, title, description, access,
          allowed_stages, allowed_student_ids, chat_enabled, hand_raise_enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        teacherId, roomId, title.trim(), description || '',
        access || 'all',
        JSON.stringify(allowed_stages || []),
        JSON.stringify(allowed_student_ids || []),
        chat_enabled !== false,
        hand_raise_enabled !== false,
      ]
    );

    const stream = result.rows[0];
    const teacher = await pool.query('SELECT name FROM teachers WHERE id=$1', [teacherId]);
    const teacherName = teacher.rows[0]?.name || 'المعلم';

    const payload = {
      streamId: stream.id, title: stream.title,
      teacherName, roomId: stream.room_id,
    };

    if (access === 'all') {
      await broadcastToTeacherStudents(pool, teacherId, 'live_started', payload);
    } else if (access === 'stages' && allowed_stages?.length) {
      const { rows } = await pool.query(
        'SELECT id FROM students WHERE teacher_id=$1 AND academic_stage=ANY($2) AND deleted_at IS NULL',
        [teacherId, allowed_stages]
      );
      for (const { id } of rows) sendEvent(`student_${id}`, 'live_started', payload);
    } else if (access === 'specific' && allowed_student_ids?.length) {
      const { rows: validStudents } = await pool.query(
        'SELECT id FROM students WHERE id = ANY($1) AND teacher_id=$2 AND deleted_at IS NULL',
        [allowed_student_ids, teacherId]
      );
      for (const { id } of validStudents)
        sendEvent(`student_${id}`, 'live_started', payload);
    }

    res.json({ success: true, stream });
  } catch (err) {
    console.error('[live/start]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Teacher: end a live stream
────────────────────────────────────────────────────────────── */
router.post('/:streamId/end', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const { streamId } = req.params;

  try {
    const result = await pool.query(
      "UPDATE live_streams SET status='ended', ended_at=NOW() WHERE id=$1 AND teacher_id=$2 AND status='active' RETURNING *",
      [streamId, teacherId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'البث غير موجود أو انتهى بالفعل' });

    // FIX: get active viewers BEFORE marking them inactive, and only active ones
    const activeViewers = await getActiveViewerIds(streamId);

    await pool.query(
      "UPDATE live_stream_viewers SET is_active=false, left_at=NOW() WHERE stream_id=$1 AND is_active=true",
      [streamId]
    );

    // Clear in-memory cache for ended stream
    vcClear(streamId);

    // Notify only viewers who were actively watching
    for (const student_id of activeViewers)
      sendEvent(`student_${student_id}`, 'live_ended', { streamId: parseInt(streamId), message: 'انتهى البث المباشر' });

    res.json({ success: true });
  } catch (err) {
    console.error('[live/end]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Teacher: get their active stream
────────────────────────────────────────────────────────────── */
router.get('/my-active', requireRole('teacher'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM live_streams WHERE teacher_id=$1 AND status='active' ORDER BY started_at DESC LIMIT 1",
      [req.user.id]
    );
    res.json({ stream: rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Student: get available active streams from their teacher
────────────────────────────────────────────────────────────── */
router.get('/available', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;

  try {
    // FIX: added deleted_at IS NULL check
    const { rows: studentRows } = await pool.query(
      'SELECT teacher_id, academic_stage FROM students WHERE id=$1 AND deleted_at IS NULL',
      [studentId]
    );
    if (!studentRows.length) return res.json({ streams: [] });

    const { teacher_id: teacherId, academic_stage } = studentRows[0];

    const { rows } = await pool.query(
      `SELECT ls.*, t.name as teacher_name,
         (SELECT COUNT(*) FROM live_stream_viewers WHERE stream_id=ls.id AND is_active=true) as viewer_count
       FROM live_streams ls
       JOIN teachers t ON t.id=ls.teacher_id
       WHERE ls.teacher_id=$1 AND ls.status IN ('active','scheduled')
       ORDER BY
         CASE WHEN ls.status='active' THEN 0 ELSE 1 END ASC,
         ls.scheduled_at ASC NULLS LAST,
         ls.started_at DESC`,
      [teacherId]
    );

    const parseJsonbField = (val) => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch (_) { return []; }
      }
      return [];
    };

    const accessible = rows.filter(s => {
      if (s.access === 'all') return true;
      if (s.access === 'stages') {
        const stages = parseJsonbField(s.allowed_stages);
        return stages.map(x => String(x).trim()).includes(String(academic_stage || '').trim());
      }
      if (s.access === 'specific') {
        const ids = parseJsonbField(s.allowed_student_ids).map(Number);
        return ids.includes(studentId);
      }
      return false;
    });

    res.json({ streams: accessible });
  } catch (err) {
    console.error('[live/available]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Student: join a stream
────────────────────────────────────────────────────────────── */
router.post('/:streamId/join', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  const { streamId } = req.params;

  const parseJsonbField = (val) => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') { try { return JSON.parse(val); } catch (_) { return []; } }
    return [];
  };

  try {
    // Verify stream exists AND student belongs to the teacher who owns the stream
    const { rows } = await pool.query(
      `SELECT ls.*, s.academic_stage FROM live_streams ls
       JOIN students s ON s.teacher_id = ls.teacher_id
       WHERE ls.id=$1 AND ls.status='active' AND s.id=$2 AND s.deleted_at IS NULL`,
      [streamId, studentId]
    );
    if (!rows.length) return res.status(404).json({ error: 'البث غير موجود أو انتهى' });

    const stream = rows[0];

    // Enforce room lock
    if (stream.is_locked) {
      return res.status(403).json({ error: 'الغرفة مقفلة حالياً من قِبَل المعلم — انتظر حتى يفتحها' });
    }

    // FIX: check if student was previously kicked — prevent rejoin
    const { rows: kickCheck } = await pool.query(
      'SELECT is_kicked FROM live_stream_viewers WHERE stream_id=$1 AND student_id=$2',
      [streamId, studentId]
    );
    if (kickCheck.length && kickCheck[0].is_kicked) {
      return res.status(403).json({ error: 'تم إخراجك من هذا البث ولا يمكنك الانضمام مجدداً' });
    }

    // Enforce per-stream access restrictions
    if (stream.access === 'stages') {
      const allowed = parseJsonbField(stream.allowed_stages).map(String);
      if (!allowed.includes(String(stream.academic_stage || '')))
        return res.status(403).json({ error: 'هذا البث مخصص لمراحل دراسية أخرى' });
    } else if (stream.access === 'specific') {
      const allowed = parseJsonbField(stream.allowed_student_ids).map(Number);
      if (!allowed.includes(studentId))
        return res.status(403).json({ error: 'لم تُضَف إلى قائمة المشاركين في هذا البث' });
    }

    await pool.query(
      `INSERT INTO live_stream_viewers (stream_id, student_id, is_active, joined_at)
       VALUES ($1,$2,true,NOW())
       ON CONFLICT (stream_id, student_id)
       DO UPDATE SET is_active=true, joined_at=NOW(), left_at=NULL`,
      [streamId, studentId]
    );

    // Keep in-memory cache consistent
    vcAdd(streamId, studentId);

    sendEvent(`teacher_${stream.teacher_id}`, 'live_viewer_update', {
      action: 'joined', studentId, studentName: req.user.name,
    });

    res.json({ success: true, stream });
  } catch (err) {
    console.error('[live/join]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Student: leave a stream
────────────────────────────────────────────────────────────── */
router.post('/:streamId/leave', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  const { streamId } = req.params;

  try {
    const { rows } = await pool.query(
      'SELECT lsv.*, ls.teacher_id FROM live_stream_viewers lsv JOIN live_streams ls ON ls.id=lsv.stream_id WHERE lsv.stream_id=$1 AND lsv.student_id=$2',
      [streamId, studentId]
    );
    await pool.query(
      "UPDATE live_stream_viewers SET is_active=false, left_at=NOW() WHERE stream_id=$1 AND student_id=$2",
      [streamId, studentId]
    );
    await pool.query(
      "UPDATE live_hand_raises SET is_active=false, lowered_at=NOW() WHERE stream_id=$1 AND student_id=$2 AND is_active=true",
      [streamId, studentId]
    );
    // Keep in-memory cache consistent
    vcRemove(streamId, studentId);
    if (rows.length) {
      sendEvent(`teacher_${rows[0].teacher_id}`, 'live_viewer_update', {
        action: 'left', studentId, studentName: req.user.name,
      });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Teacher: get active viewers list (includes lock status)
────────────────────────────────────────────────────────────── */
router.get('/:streamId/viewers', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const { streamId } = req.params;

  try {
    // FIX: also return stream lock state so the frontend can sync it
    const { rows: streamRows } = await pool.query(
      'SELECT is_locked FROM live_streams WHERE id=$1 AND teacher_id=$2',
      [streamId, teacherId]
    );
    if (!streamRows.length) return res.status(403).json({ error: 'غير مصرح' });

    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.academic_stage, s.points,
         lsv.joined_at,
         lsv.can_speak,
         lsv.can_share_screen,
         COALESCE(lhr.is_active, false) AS hand_raised,
         lhr.raised_at
       FROM live_stream_viewers lsv
       JOIN students s ON s.id=lsv.student_id
       LEFT JOIN live_hand_raises lhr
         ON lhr.stream_id=lsv.stream_id AND lhr.student_id=lsv.student_id AND lhr.is_active=true
       WHERE lsv.stream_id=$1 AND lsv.is_active=true
         AND EXISTS (SELECT 1 FROM live_streams WHERE id=$1 AND teacher_id=$2)
       ORDER BY lhr.raised_at DESC NULLS LAST, s.name ASC`,
      [streamId, teacherId]
    );
    res.json({ viewers: rows, is_locked: streamRows[0].is_locked });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Student: raise / lower hand
────────────────────────────────────────────────────────────── */
router.post('/:streamId/hand-raise', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  const { streamId } = req.params;
  const raised = req.body.raised;

  if (raised === undefined || raised === null)
    return res.status(400).json({ error: 'قيمة غير صحيحة لحقل raised' });

  const raisedBool = raised === true || raised === 1 || raised === 'true' || raised === '1';

  try {
    const { rows } = await pool.query(
      'SELECT teacher_id, hand_raise_enabled FROM live_streams WHERE id=$1 AND status=\'active\'',
      [streamId]
    );
    if (!rows.length) return res.status(404).json({ error: 'البث غير موجود أو انتهى' });

    const viewerCheck = await pool.query(
      'SELECT 1 FROM live_stream_viewers WHERE stream_id=$1 AND student_id=$2 AND is_active=true AND is_kicked=false',
      [streamId, studentId]
    );
    if (!viewerCheck.rows.length)
      return res.status(403).json({ error: 'يجب الانضمام للبث أولاً قبل رفع اليد' });

    if (raisedBool && rows[0].hand_raise_enabled === false) {
      return res.status(403).json({ error: 'رفع اليد معطل في هذا البث' });
    }

    if (raisedBool) {
      await pool.query(
        `INSERT INTO live_hand_raises (stream_id, student_id, is_active, raised_at)
         VALUES ($1,$2,true,NOW())
         ON CONFLICT (stream_id, student_id)
         DO UPDATE SET is_active=true, raised_at=NOW(), lowered_at=NULL`,
        [streamId, studentId]
      );
    } else {
      await pool.query(
        "UPDATE live_hand_raises SET is_active=false, lowered_at=NOW() WHERE stream_id=$1 AND student_id=$2",
        [streamId, studentId]
      );
    }

    sendEvent(`teacher_${rows[0].teacher_id}`, 'live_hand_raise', {
      studentId, studentName: req.user.name, raised: raisedBool, streamId: parseInt(streamId),
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Teacher: kick a student from the stream
────────────────────────────────────────────────────────────── */
router.post('/:streamId/kick/:studentId', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const { streamId, studentId } = req.params;

  try {
    const { rows: streamRows } = await pool.query(
      "SELECT id, title FROM live_streams WHERE id=$1 AND teacher_id=$2 AND status='active'",
      [streamId, teacherId]
    );
    if (!streamRows.length) return res.status(403).json({ error: 'غير مصرح أو البث غير نشط' });

    const { rowCount } = await pool.query(
      `UPDATE live_stream_viewers
         SET is_active=false, is_kicked=true, left_at=NOW(),
             can_speak=false, can_share_screen=false
       WHERE stream_id=$1 AND student_id=$2 AND is_active=true`,
      [streamId, studentId]
    );
    if (!rowCount) return res.status(404).json({ error: 'الطالب غير موجود في البث' });

    await pool.query(
      "UPDATE live_hand_raises SET is_active=false, lowered_at=NOW() WHERE stream_id=$1 AND student_id=$2 AND is_active=true",
      [streamId, studentId]
    );

    // Keep in-memory cache consistent
    vcRemove(streamId, studentId);

    sendEvent(`student_${studentId}`, 'live_kicked', {
      streamId: parseInt(streamId),
      message: 'تم إخراجك من البث من قِبَل المعلم',
    });

    sendEvent(`teacher_${teacherId}`, 'live_viewer_update', {
      action: 'kicked', studentId: parseInt(studentId),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[live/kick]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Teacher: grant / revoke student mic & screen permissions
────────────────────────────────────────────────────────────── */
router.post('/:streamId/permissions/:studentId', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const { streamId, studentId } = req.params;
  const { can_speak, can_share_screen } = req.body;

  try {
    const { rows: streamRows } = await pool.query(
      "SELECT id FROM live_streams WHERE id=$1 AND teacher_id=$2 AND status='active'",
      [streamId, teacherId]
    );
    if (!streamRows.length) return res.status(403).json({ error: 'غير مصرح أو البث غير نشط' });

    const { rowCount } = await pool.query(
      `UPDATE live_stream_viewers
         SET can_speak=$1, can_share_screen=$2
       WHERE stream_id=$3 AND student_id=$4 AND is_active=true`,
      [!!can_speak, !!can_share_screen, streamId, studentId]
    );
    if (!rowCount) return res.status(404).json({ error: 'الطالب غير موجود في البث' });

    sendEvent(`student_${studentId}`, 'live_permission_update', {
      streamId:         parseInt(streamId),
      can_speak:        !!can_speak,
      can_share_screen: !!can_share_screen,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[live/permissions]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Teacher: mute all students (revoke all can_speak)
   FIX: single query to get all viewers + their screen perms
        instead of N+1 queries
────────────────────────────────────────────────────────────── */
router.post('/:streamId/mute-all', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const { streamId } = req.params;

  try {
    const { rows: streamRows } = await pool.query(
      "SELECT id FROM live_streams WHERE id=$1 AND teacher_id=$2 AND status='active'",
      [streamId, teacherId]
    );
    if (!streamRows.length) return res.status(403).json({ error: 'غير مصرح' });

    // FIX: fetch all speaking viewers WITH their can_share_screen in one query
    const { rows: speakingViewers } = await pool.query(
      'SELECT student_id, can_share_screen FROM live_stream_viewers WHERE stream_id=$1 AND is_active=true AND can_speak=true',
      [streamId]
    );

    if (speakingViewers.length === 0) {
      return res.json({ success: true, mutedCount: 0 });
    }

    // Single bulk update
    await pool.query(
      'UPDATE live_stream_viewers SET can_speak=false WHERE stream_id=$1 AND is_active=true',
      [streamId]
    );

    // Send SSE events without extra DB queries — we already have can_share_screen
    for (const { student_id, can_share_screen } of speakingViewers) {
      sendEvent(`student_${student_id}`, 'live_permission_update', {
        streamId: parseInt(streamId),
        can_speak: false,
        can_share_screen: !!can_share_screen,
      });
    }

    res.json({ success: true, mutedCount: speakingViewers.length });
  } catch (err) {
    console.error('[live/mute-all]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Teacher: lock / unlock the stream (no new joins)
────────────────────────────────────────────────────────────── */
router.post('/:streamId/lock', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const { streamId } = req.params;
  const { locked } = req.body;

  try {
    const { rowCount } = await pool.query(
      "UPDATE live_streams SET is_locked=$1 WHERE id=$2 AND teacher_id=$3 AND status='active'",
      [!!locked, streamId, teacherId]
    );
    if (!rowCount) return res.status(404).json({ error: 'البث غير موجود' });
    res.json({ success: true, is_locked: !!locked });
  } catch (err) {
    console.error('[live/lock]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Student: get my permissions in a stream
────────────────────────────────────────────────────────────── */
router.get('/:streamId/my-permissions', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  const { streamId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT can_speak, can_share_screen FROM live_stream_viewers WHERE stream_id=$1 AND student_id=$2 AND is_active=true AND is_kicked=false',
      [streamId, studentId]
    );
    res.json(rows[0] || { can_speak: false, can_share_screen: false });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Teacher: award points to a student during live
   FIX: server-side max cap of 1000 points per award
────────────────────────────────────────────────────────────── */
router.post('/:streamId/award-points', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const { streamId } = req.params;
  let { studentId, points, reason } = req.body;

  points = parseInt(points);
  if (!studentId || !points || points < 1)
    return res.status(400).json({ error: 'بيانات غير صحيحة' });
  // FIX: server-side cap to prevent abuse
  if (points > 1000)
    return res.status(400).json({ error: 'الحد الأقصى 1000 نقطة لكل منحة' });

  try {
    const { rows: streamRows } = await pool.query(
      'SELECT title FROM live_streams WHERE id=$1 AND teacher_id=$2',
      [streamId, teacherId]
    );
    if (!streamRows.length) return res.status(403).json({ error: 'غير مصرح' });

    const { rows: studentRows } = await pool.query(
      'SELECT name FROM students WHERE id=$1 AND teacher_id=$2',
      [studentId, teacherId]
    );
    if (!studentRows.length) return res.status(404).json({ error: 'الطالب غير موجود' });

    await pool.query('UPDATE students SET points=points+$1 WHERE id=$2', [points, studentId]);

    sendEvent(`student_${studentId}`, 'live_points_awarded', {
      points, studentName: studentRows[0].name,
      reason: reason || 'منح نقاط أثناء البث المباشر',
      streamTitle: streamRows[0].title,
    });

    res.json({ success: true, pointsAwarded: points });
  } catch (err) {
    console.error('[live/award-points]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Both: get chat messages (supports ?since=<unix_ms>)
   FIX: consistent stream status check for both roles
────────────────────────────────────────────────────────────── */
router.get('/:streamId/chat', requireRole('teacher', 'student'), async (req, res) => {
  const { streamId } = req.params;
  const { since } = req.query;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    if (userRole === 'student') {
      const access = await pool.query(
        `SELECT ls.id FROM live_streams ls
         JOIN students s ON s.teacher_id = ls.teacher_id
         WHERE ls.id=$1 AND s.id=$2 AND s.deleted_at IS NULL AND ls.status='active'`,
        [streamId, userId]
      );
      if (!access.rows.length) return res.status(403).json({ error: 'Access denied' });
    } else if (userRole === 'teacher') {
      // FIX: allow teacher to read chat for active OR ended streams (for review)
      const access = await pool.query('SELECT id FROM live_streams WHERE id=$1 AND teacher_id=$2', [streamId, userId]);
      if (!access.rows.length) return res.status(403).json({ error: 'Access denied' });
    }

    let q = 'SELECT id, stream_id, sender_id, sender_type, sender_name, message, sent_at FROM live_chat_messages WHERE stream_id=$1';
    const params = [streamId];
    if (since) {
      q += ' AND sent_at > $2';
      params.push(new Date(parseInt(since)));
    }
    q += ' ORDER BY sent_at ASC LIMIT 200';
    const { rows } = await pool.query(q, params);
    res.json({ messages: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Both: send a chat message
   FIX: per-user rate limiting + fan-out uses helper function
────────────────────────────────────────────────────────────── */
router.post('/:streamId/chat', requireRole('teacher', 'student'), async (req, res) => {
  const { streamId } = req.params;
  const { message } = req.body;
  const senderId   = req.user.id;
  const senderType = req.user.role;
  const senderName = req.user.name;

  if (!message?.trim()) return res.status(400).json({ error: 'الرسالة فارغة' });
  if (message.trim().length > 500) return res.status(400).json({ error: 'الرسالة طويلة جداً (500 حرف كحد أقصى)' });

  // FIX: rate limit students (not teacher)
  if (senderType === 'student' && !chatRateCheck(senderId)) {
    return res.status(429).json({ error: 'إرسال سريع جداً — انتظر لحظة' });
  }

  try {
    const { rows: streamRows } = await pool.query(
      "SELECT teacher_id, chat_enabled FROM live_streams WHERE id=$1 AND status='active'",
      [streamId]
    );
    if (!streamRows.length) return res.status(404).json({ error: 'البث غير موجود أو انتهى' });

    if (senderType === 'student') {
      const viewer = await pool.query(
        'SELECT 1 FROM live_stream_viewers WHERE stream_id=$1 AND student_id=$2 AND is_active=true AND is_kicked=false',
        [streamId, senderId]
      );
      if (!viewer.rows.length) return res.status(403).json({ error: 'يجب الانضمام للبث أولاً قبل إرسال رسائل' });
    }

    if (senderType === 'student' && !streamRows[0].chat_enabled)
      return res.status(403).json({ error: 'الدردشة معطلة من قِبَل المعلم' });

    const { rows } = await pool.query(
      'INSERT INTO live_chat_messages (stream_id,sender_id,sender_type,sender_name,message) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [streamId, senderId, senderType, senderName, message.trim()]
    );
    const msg = rows[0];

    const teacherId = streamRows[0].teacher_id;

    // FIX: use helper to get viewer IDs in one query, then fan-out without extra queries
    const viewerIds = await getActiveViewerIds(streamId);
    sendEvent(`teacher_${teacherId}`, 'live_chat', msg);
    for (const vid of viewerIds)
      sendEvent(`student_${vid}`, 'live_chat', msg);

    res.json({ success: true, message: msg });
  } catch (err) {
    console.error('[live/chat]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Teacher: toggle chat on / off
   FIX: verify teacher owns the stream before toggling
────────────────────────────────────────────────────────────── */
router.post('/:streamId/chat-toggle', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const { streamId } = req.params;
  const { enabled } = req.body;

  try {
    const { rowCount } = await pool.query(
      "UPDATE live_streams SET chat_enabled=$1 WHERE id=$2 AND teacher_id=$3 AND status='active'",
      [!!enabled, streamId, teacherId]
    );
    if (!rowCount) return res.status(404).json({ error: 'البث غير موجود أو انتهى' });

    // FIX: use helper for fan-out
    const viewerIds = await getActiveViewerIds(streamId);
    for (const vid of viewerIds)
      sendEvent(`student_${vid}`, 'live_chat_toggle', { enabled: !!enabled, streamId: parseInt(streamId) });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
