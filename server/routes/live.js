const express = require('express');
const crypto  = require('crypto');
const pool    = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendEvent, broadcastToTeacherStudents } = require('../sse');

/* ── LiveKit SDK — loaded once at module level (not per-request) ── */
let AccessToken;
try {
  ({ AccessToken } = require('livekit-server-sdk'));
} catch (_) {
  AccessToken = null;
}

/* ── Leave tickets (one-time, 30 s TTL) ────────────────────────── */
const leaveTicketMap = new Map();

const router = express.Router();
router.use(authenticate);

/* ══════════════════════════════════════════════════════════════════
   INPUT VALIDATION HELPERS
   FIX: validate URL params as positive integers before hitting DB.
   Returns null on invalid input — callers return 400 immediately.
   Upper bound = PostgreSQL INTEGER max (SERIAL type) = 2^31-1.
   Rejects floats with fractional part, negatives, zero, overflow.
══════════════════════════════════════════════════════════════════ */
const PG_INT_MAX = 2_147_483_647; // PostgreSQL INTEGER / SERIAL max

function parseId(val) {
  const n = parseInt(val, 10);
  if (!Number.isFinite(n) || n <= 0 || n > PG_INT_MAX) return null;
  // Reject if the string representation contains non-numeric chars after parsing
  // (e.g. "1; DROP" → parseInt gives 1 which is valid — acceptable here since
  //  the value goes into a parameterized query, never interpolated into SQL)
  return n;
}

/* ══════════════════════════════════════════════════════════════════
   RATE LIMITERS
══════════════════════════════════════════════════════════════════ */

/* ── Chat: max 5 msgs / 5 s per student ─────────────────────────── */
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

/* ── LiveKit token: max 10 tokens / 60 s per student per stream ─── */
const tokenRateMap = new Map();
const TOKEN_MAX    = 10;
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

/* ── Hand-raise: max 10 toggles / 30 s per student per stream ──────
   FIX: prevents hand-raise flood that fills teacher SSE queue + DB
────────────────────────────────────────────────────────────────── */
const handRateMap = new Map();
const HAND_MAX    = 10;
const HAND_WIN_MS = 30000;

function handRateCheck(userId, streamId) {
  const key = `${userId}:${streamId}`;
  const now = Date.now();
  const rec = handRateMap.get(key);
  if (!rec || now > rec.resetAt) {
    handRateMap.set(key, { count: 1, resetAt: now + HAND_WIN_MS });
    return true;
  }
  if (rec.count >= HAND_MAX) return false;
  rec.count++;
  return true;
}

/* ── Cleanup stale rate-limit entries every 2 minutes ───────────── */
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of chatRateMap)  { if (now > v.resetAt) chatRateMap.delete(k);  }
  for (const [k, v] of tokenRateMap) { if (now > v.resetAt) tokenRateMap.delete(k); }
  for (const [k, v] of handRateMap)  { if (now > v.resetAt) handRateMap.delete(k);  }
}, 120_000).unref();

/* ══════════════════════════════════════════════════════════════════
   IN-MEMORY VIEWER CACHE
   Eliminates DB query on every chat message fan-out.
   Kept consistent by join / leave / kick / end endpoints.
   On server restart, cache is cold and warms on first access.
   Map: streamId (string) → Set<studentId (number)>

   FIX: added _warming Set to prevent concurrent DB warmups for
   the same stream (race condition: two simultaneous cache misses
   both query DB and both overwrite each other's result).
══════════════════════════════════════════════════════════════════ */
const viewerCache = new Map();
const _warming    = new Set();   // streams currently being warmed from DB

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
  _warming.delete(String(streamId));
}

/** Returns active viewer IDs — cache-first, DB fallback on cold start */
async function getActiveViewerIds(streamId) {
  const key = String(streamId);
  if (viewerCache.has(key)) {
    return [...viewerCache.get(key)];
  }
  // FIX: if another request is already warming this stream, wait briefly
  // instead of firing another DB query
  if (_warming.has(key)) {
    await new Promise(r => setTimeout(r, 80));
    if (viewerCache.has(key)) return [...viewerCache.get(key)];
  }
  _warming.add(key);
  try {
    const { rows } = await pool.query(
      'SELECT student_id FROM live_stream_viewers WHERE stream_id=$1 AND is_active=true',
      [streamId]
    );
    const ids = rows.map(r => Number(r.student_id));
    viewerCache.set(key, new Set(ids));
    return ids;
  } finally {
    _warming.delete(key);
  }
}

/* ══════════════════════════════════════════════════════════════════
   SSE FAN-OUT HELPER
   FIX: use setImmediate-batching so large fan-outs (100+ students)
   don't block the event loop. Groups sends in slices of 50.
══════════════════════════════════════════════════════════════════ */
function fanOut(ids, event, payload) {
  if (!ids.length) return;
  const BATCH = 50;
  let i = 0;
  function flush() {
    const slice = ids.slice(i, i + BATCH);
    for (const id of slice) sendEvent(`student_${id}`, event, payload);
    i += BATCH;
    if (i < ids.length) setImmediate(flush);
  }
  setImmediate(flush);
}

/* ══════════════════════════════════════════════════════════════════
   LiveKit token endpoint
══════════════════════════════════════════════════════════════════ */
router.post('/:streamId/livekit-token', async (req, res) => {
  const streamId = parseId(req.params.streamId);
  if (!streamId) return res.status(400).json({ error: 'معرّف البث غير صالح' });

  const { id, role, name } = req.user;

  const apiKey    = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const serverUrl = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !serverUrl) {
    return res.status(503).json({
      error: 'خدمة البث غير مهيأة — تواصل مع المسؤول لضبط LIVEKIT_URL و LIVEKIT_API_KEY و LIVEKIT_API_SECRET',
    });
  }

  if (!AccessToken) {
    return res.status(503).json({ error: 'مكتبة LiveKit غير متوفرة على الخادم' });
  }

  if (role === 'student' && !tokenRateCheck(id, streamId)) {
    return res.status(429).json({ error: 'طلبات كثيرة جداً — انتظر دقيقة وحاول مجدداً' });
  }

  try {
    const { rows } = await pool.query(
      "SELECT * FROM live_streams WHERE id=$1 AND status='active'",
      [streamId]
    );
    if (!rows.length) return res.status(404).json({ error: 'البث غير نشط أو انتهى' });

    const stream   = rows[0];
    const roomName = stream.room_id;

    if (role === 'teacher') {
      if (parseInt(stream.teacher_id) !== parseInt(id)) {
        return res.status(403).json({ error: 'هذا البث لا ينتمي إليك' });
      }
    } else if (role === 'student') {
      // [H-4] FIX: apply the full access-control stack (same as /join) before issuing a token

      // 1. Verify student belongs to this teacher + fetch academic_stage
      const { rows: studentRows } = await pool.query(
        'SELECT teacher_id, academic_stage FROM students WHERE id=$1 AND deleted_at IS NULL',
        [id]
      );
      if (!studentRows.length || parseInt(studentRows[0].teacher_id) !== parseInt(stream.teacher_id)) {
        return res.status(403).json({ error: 'هذا البث لا ينتمي لمعلمك' });
      }
      const { academic_stage } = studentRows[0];

      // 2. Locked stream — no new LiveKit tokens even for existing viewers
      if (stream.is_locked) {
        return res.status(403).json({ error: 'الغرفة مقفلة حالياً من قِبَل المعلم' });
      }

      // 3. Access rules (stages / specific) — re-check on every token request
      const _parseJsonb = (val) => {
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') { try { return JSON.parse(val); } catch (_) { return []; } }
        return [];
      };
      if (stream.access === 'stages') {
        const allowed = _parseJsonb(stream.allowed_stages).map(String);
        if (!allowed.includes(String(academic_stage || '')))
          return res.status(403).json({ error: 'هذا البث مخصص لمراحل دراسية أخرى' });
      } else if (stream.access === 'specific') {
        const allowed = _parseJsonb(stream.allowed_student_ids).map(Number);
        if (!allowed.includes(id))
          return res.status(403).json({ error: 'لم تُضَف إلى قائمة المشاركين في هذا البث' });
      }

      // 4. Kick check
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

    const at = new AccessToken(apiKey, apiSecret, {
      identity: `${role}_${id}`,
      name:     name || role,
      ttl:      '4h',
    });

    if (role === 'teacher') {
      at.addGrant({
        roomJoin:        true,
        room:            roomName,
        canPublish:      true,
        canSubscribe:    true,
        canPublishData:  true,
        roomAdmin:       true,
      });
    } else {
      const { rows: permRows } = await pool.query(
        'SELECT can_speak, can_share_screen FROM live_stream_viewers WHERE stream_id=$1 AND student_id=$2 AND is_active=true AND is_kicked=false',
        [streamId, id]
      );
      const perm       = permRows[0] || {};
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

/* ══════════════════════════════════════════════════════════════════
   Teacher: schedule a future live stream
══════════════════════════════════════════════════════════════════ */
router.post('/schedule', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const {
    title, description, access,
    allowed_stages, allowed_student_ids,
    chat_enabled, hand_raise_enabled, scheduled_at,
  } = req.body;

  if (!title?.trim())
    return res.status(400).json({ error: 'عنوان البث مطلوب' });
  if (title.trim().length > 200)
    return res.status(400).json({ error: 'عنوان البث طويل جداً (200 حرف كحد أقصى)' });
  if (description && description.length > 1000)
    return res.status(400).json({ error: 'وصف البث طويل جداً (1000 حرف كحد أقصى)' });
  if (access && !['all', 'stages', 'specific'].includes(access))
    return res.status(400).json({ error: 'قيمة access غير صالحة' });
  if (!scheduled_at)
    return res.status(400).json({ error: 'موعد البث مطلوب' });
  if (new Date(scheduled_at).getTime() <= Date.now())
    return res.status(400).json({ error: 'يجب أن يكون الموعد في المستقبل' });

  /* FIX: validate allowed_stages — must be non-empty strings, max 50 chars each */
  if (allowed_stages?.length) {
    if (!Array.isArray(allowed_stages) || allowed_stages.length > 20 ||
        !allowed_stages.every(s => typeof s === 'string' && s.trim().length > 0 && s.length <= 50))
      return res.status(400).json({ error: 'allowed_stages: قيم غير صالحة (حد أقصى 20 مرحلة، 50 حرف لكل مرحلة)' });
  }
  if (allowed_student_ids?.length) {
    if (!Array.isArray(allowed_student_ids) || allowed_student_ids.length > 500 ||
        !allowed_student_ids.every(id => Number.isInteger(Number(id)) && Number(id) > 0))
      return res.status(400).json({ error: 'allowed_student_ids يجب أن تكون أرقام صحيحة موجبة (حد أقصى 500)' });
  }

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

/* ══════════════════════════════════════════════════════════════════
   Teacher: get their scheduled (upcoming) streams
══════════════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════════════
   Teacher: start a scheduled stream now
══════════════════════════════════════════════════════════════════ */
router.post('/scheduled/:streamId/start', requireRole('teacher'), async (req, res) => {
  const streamId = parseId(req.params.streamId);
  if (!streamId) return res.status(400).json({ error: 'معرّف البث غير صالح' });

  const teacherId = req.user.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // FIX: advisory lock prevents two simultaneous "start scheduled" calls
    // from creating two active streams for the same teacher.
    await client.query('SELECT pg_advisory_xact_lock($1)', [teacherId]);

    const { rows: activeStreams } = await client.query(
      "SELECT id FROM live_streams WHERE teacher_id=$1 AND status='active'",
      [teacherId]
    );
    for (const active of activeStreams) {
      const viewerIds = await getActiveViewerIds(active.id);
      await client.query(
        "UPDATE live_stream_viewers SET is_active=false, left_at=NOW() WHERE stream_id=$1 AND is_active=true",
        [active.id]
      );
      vcClear(active.id);
      fanOut(viewerIds, 'live_ended', { streamId: active.id, message: 'انتهى البث المباشر' });
    }
    await client.query(
      "UPDATE live_streams SET status='ended', ended_at=NOW() WHERE teacher_id=$1 AND status='active'",
      [teacherId]
    );

    const result = await client.query(
      `UPDATE live_streams
       SET status='active', started_at=NOW()
       WHERE id=$1 AND teacher_id=$2 AND status='scheduled'
       RETURNING *`,
      [streamId, teacherId]
    );

    await client.query('COMMIT');

    if (!result.rows.length)
      return res.status(404).json({ error: 'البث المجدول غير موجود' });

    const stream = result.rows[0];
    const teacher = await pool.query('SELECT name FROM teachers WHERE id=$1', [teacherId]);
    const teacherName = teacher.rows[0]?.name || 'المعلم';

    const payload = { streamId: stream.id, title: stream.title, teacherName, roomId: stream.room_id };
    await broadcastToTeacherStudents(pool, teacherId, 'live_started', payload);

    res.json({ success: true, stream });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[live/scheduled/start]', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'يوجد بث نشط بالفعل — يُرجى إنهاؤه أولاً' });
    }
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

/* ══════════════════════════════════════════════════════════════════
   Teacher: cancel a scheduled stream
══════════════════════════════════════════════════════════════════ */
router.delete('/scheduled/:streamId', requireRole('teacher'), async (req, res) => {
  const streamId = parseId(req.params.streamId);
  if (!streamId) return res.status(400).json({ error: 'معرّف البث غير صالح' });

  const teacherId = req.user.id;

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

/* ══════════════════════════════════════════════════════════════════
   Teacher: start a new live stream (immediate)
══════════════════════════════════════════════════════════════════ */
router.post('/start', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const {
    title, description, access,
    allowed_stages, allowed_student_ids,
    chat_enabled, hand_raise_enabled,
  } = req.body;

  if (!title?.trim())
    return res.status(400).json({ error: 'عنوان البث مطلوب' });
  if (title.trim().length > 200)
    return res.status(400).json({ error: 'عنوان البث طويل جداً (200 حرف كحد أقصى)' });
  if (description && description.length > 1000)
    return res.status(400).json({ error: 'وصف البث طويل جداً (1000 حرف كحد أقصى)' });
  if (access && !['all', 'stages', 'specific'].includes(access))
    return res.status(400).json({ error: 'قيمة access غير صالحة' });

  /* FIX: validate allowed_stages content */
  if (allowed_stages?.length) {
    if (!Array.isArray(allowed_stages) || allowed_stages.length > 20 ||
        !allowed_stages.every(s => typeof s === 'string' && s.trim().length > 0 && s.length <= 50))
      return res.status(400).json({ error: 'allowed_stages: قيم غير صالحة (حد أقصى 20 مرحلة، 50 حرف لكل مرحلة)' });
  }
  if (allowed_student_ids?.length) {
    if (!Array.isArray(allowed_student_ids) || allowed_student_ids.length > 500 ||
        !allowed_student_ids.every(id => Number.isInteger(Number(id)) && Number(id) > 0))
      return res.status(400).json({ error: 'allowed_student_ids يجب أن تكون أرقام صحيحة موجبة (حد أقصى 500)' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // FIX: serialise concurrent start requests for the same teacher using an
    // advisory transaction lock (key = teacher_id).  This closes the race window
    // between "end active stream" and "insert new stream" so two simultaneous
    // POST /live/start calls can never create two active streams.
    await client.query('SELECT pg_advisory_xact_lock($1)', [teacherId]);

    const { rows: activeStreams } = await client.query(
      "SELECT id FROM live_streams WHERE teacher_id=$1 AND status='active'",
      [teacherId]
    );
    for (const active of activeStreams) {
      const viewerIds = await getActiveViewerIds(active.id);
      await client.query(
        "UPDATE live_stream_viewers SET is_active=false, left_at=NOW() WHERE stream_id=$1 AND is_active=true",
        [active.id]
      );
      vcClear(active.id);
      fanOut(viewerIds, 'live_ended', { streamId: active.id, message: 'انتهى البث المباشر' });
    }
    await client.query(
      "UPDATE live_streams SET status='ended', ended_at=NOW() WHERE teacher_id=$1 AND status='active'",
      [teacherId]
    );

    const roomId = `wathba-${teacherId}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

    const result = await client.query(
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

    await client.query('COMMIT');

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
    await client.query('ROLLBACK').catch(() => {});
    console.error('[live/start]', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'يوجد بث نشط بالفعل — يُرجى إنهاؤه أولاً' });
    }
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

/* ══════════════════════════════════════════════════════════════════
   Teacher: end a live stream
══════════════════════════════════════════════════════════════════ */
router.post('/:streamId/end', requireRole('teacher'), async (req, res) => {
  const streamId = parseId(req.params.streamId);
  if (!streamId) return res.status(400).json({ error: 'معرّف البث غير صالح' });

  const teacherId = req.user.id;

  try {
    const result = await pool.query(
      "UPDATE live_streams SET status='ended', ended_at=NOW() WHERE id=$1 AND teacher_id=$2 AND status='active' RETURNING *",
      [streamId, teacherId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'البث غير موجود أو انتهى بالفعل' });

    const activeViewers = await getActiveViewerIds(streamId);

    await pool.query(
      "UPDATE live_stream_viewers SET is_active=false, left_at=NOW() WHERE stream_id=$1 AND is_active=true",
      [streamId]
    );

    vcClear(streamId);

    fanOut(activeViewers, 'live_ended', { streamId, message: 'انتهى البث المباشر' });

    res.json({ success: true });
  } catch (err) {
    console.error('[live/end]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ══════════════════════════════════════════════════════════════════
   Teacher: get their active stream
══════════════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════════════
   Student: get available active streams from their teacher
   FIX: replaced correlated subquery for viewer_count with a single
   LEFT JOIN aggregate — avoids O(N) subqueries for N streams
══════════════════════════════════════════════════════════════════ */
router.get('/available', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;

  try {
    const { rows: studentRows } = await pool.query(
      'SELECT teacher_id, academic_stage FROM students WHERE id=$1 AND deleted_at IS NULL',
      [studentId]
    );
    if (!studentRows.length) return res.json({ streams: [] });

    const { teacher_id: teacherId, academic_stage } = studentRows[0];

    /* FIX: single aggregated query instead of per-row subquery */
    const { rows } = await pool.query(
      `SELECT ls.*,
              t.name AS teacher_name,
              COALESCE(vc.cnt, 0) AS viewer_count
       FROM live_streams ls
       JOIN teachers t ON t.id = ls.teacher_id
       LEFT JOIN (
         SELECT stream_id, COUNT(*) AS cnt
         FROM live_stream_viewers
         WHERE is_active = true
         GROUP BY stream_id
       ) vc ON vc.stream_id = ls.id
       WHERE ls.teacher_id = $1
         AND ls.status IN ('active','scheduled')
       ORDER BY
         CASE WHEN ls.status = 'active' THEN 0 ELSE 1 END ASC,
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

/* ══════════════════════════════════════════════════════════════════
   Student: join a stream
══════════════════════════════════════════════════════════════════ */
router.post('/:streamId/join', requireRole('student'), async (req, res) => {
  const streamId  = parseId(req.params.streamId);
  if (!streamId) return res.status(400).json({ error: 'معرّف البث غير صالح' });

  const studentId = req.user.id;

  const parseJsonbField = (val) => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') { try { return JSON.parse(val); } catch (_) { return []; } }
    return [];
  };

  try {
    const { rows } = await pool.query(
      `SELECT ls.*, s.academic_stage FROM live_streams ls
       JOIN students s ON s.teacher_id = ls.teacher_id
       WHERE ls.id=$1 AND ls.status='active' AND s.id=$2 AND s.deleted_at IS NULL`,
      [streamId, studentId]
    );
    if (!rows.length) return res.status(404).json({ error: 'البث غير موجود أو انتهى' });

    const stream = rows[0];

    if (stream.is_locked) {
      return res.status(403).json({ error: 'الغرفة مقفلة حالياً من قِبَل المعلم — انتظر حتى يفتحها' });
    }

    if (stream.access === 'stages') {
      const allowed = parseJsonbField(stream.allowed_stages).map(String);
      if (!allowed.includes(String(stream.academic_stage || '')))
        return res.status(403).json({ error: 'هذا البث مخصص لمراحل دراسية أخرى' });
    } else if (stream.access === 'specific') {
      const allowed = parseJsonbField(stream.allowed_student_ids).map(Number);
      if (!allowed.includes(studentId))
        return res.status(403).json({ error: 'لم تُضَف إلى قائمة المشاركين في هذا البث' });
    }

    const { rows: upsertRows } = await pool.query(
      `INSERT INTO live_stream_viewers (stream_id, student_id, is_active, joined_at)
       VALUES ($1,$2,true,NOW())
       ON CONFLICT (stream_id, student_id) DO UPDATE
         SET is_active  = CASE WHEN live_stream_viewers.is_kicked THEN live_stream_viewers.is_active ELSE true END,
             joined_at  = CASE WHEN live_stream_viewers.is_kicked THEN live_stream_viewers.joined_at ELSE NOW() END,
             left_at    = CASE WHEN live_stream_viewers.is_kicked THEN live_stream_viewers.left_at    ELSE NULL END
       RETURNING is_kicked`,
      [streamId, studentId]
    );
    if (upsertRows[0]?.is_kicked) {
      return res.status(403).json({ error: 'تم إخراجك من هذا البث ولا يمكنك الانضمام مجدداً' });
    }

    vcAdd(streamId, studentId);

    sendEvent(`teacher_${stream.teacher_id}`, 'live_viewer_update', {
      action: 'joined', studentId, studentName: req.user.name,
    });

    const leaveTicket = crypto.randomBytes(24).toString('hex');
    leaveTicketMap.set(leaveTicket, {
      studentId,
      name: req.user.name,
      streamId,
      expiresAt: Date.now() + 30000,
    });
    res.json({ success: true, stream, leaveTicket });
  } catch (err) {
    console.error('[live/join]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ══════════════════════════════════════════════════════════════════
   Student: leave a stream
   FIX: only call vcRemove when student was actually in the cache
══════════════════════════════════════════════════════════════════ */
// FIX: beacon-aware leave — uses a short-lived one-time ticket instead of a JWT
// in the URL (JWTs in URLs can leak through server logs).
// Normal requests continue to use the Authorization header.
const beaconAuth = async (req, res, next) => {
  const ticket = req.query.ticket;
  if (ticket && !req.headers.authorization) {
    const entry = leaveTicketMap.get(ticket);
    if (!entry) return res.status(401).json({ error: 'Invalid ticket' });
    if (Date.now() > entry.expiresAt) {
      leaveTicketMap.delete(ticket);
      return res.status(401).json({ error: 'Ticket expired' });
    }
    if (entry.streamId !== parseId(req.params.streamId)) {
      leaveTicketMap.delete(ticket);
      return res.status(401).json({ error: 'Ticket mismatch' });
    }
    leaveTicketMap.delete(ticket);
    req.user = { id: entry.studentId, name: entry.name, role: 'student' };
    return next();
  }
  return require('../middleware/auth').authenticate(req, res, next);
};

router.post('/:streamId/leave', beaconAuth, requireRole('student'), async (req, res) => {
  const streamId  = parseId(req.params.streamId);
  if (!streamId) return res.status(400).json({ error: 'معرّف البث غير صالح' });

  const studentId = req.user.id;

  try {
    const { rows } = await pool.query(
      'SELECT lsv.*, ls.teacher_id FROM live_stream_viewers lsv JOIN live_streams ls ON ls.id=lsv.stream_id WHERE lsv.stream_id=$1 AND lsv.student_id=$2 AND lsv.is_active=true',
      [streamId, studentId]
    );

    if (!rows.length) {
      /* Student wasn't actively watching — no-op (idempotent) */
      return res.json({ success: true });
    }

    await pool.query(
      "UPDATE live_stream_viewers SET is_active=false, left_at=NOW() WHERE stream_id=$1 AND student_id=$2",
      [streamId, studentId]
    );
    await pool.query(
      "UPDATE live_hand_raises SET is_active=false, lowered_at=NOW() WHERE stream_id=$1 AND student_id=$2 AND is_active=true",
      [streamId, studentId]
    );

    vcRemove(streamId, studentId);

    sendEvent(`teacher_${rows[0].teacher_id}`, 'live_viewer_update', {
      action: 'left', studentId, studentName: req.user.name,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[live/leave]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ══════════════════════════════════════════════════════════════════
   Teacher: get active viewers list (includes lock status)
══════════════════════════════════════════════════════════════════ */
router.get('/:streamId/viewers', requireRole('teacher'), async (req, res) => {
  const streamId = parseId(req.params.streamId);
  if (!streamId) return res.status(400).json({ error: 'معرّف البث غير صالح' });

  const teacherId = req.user.id;

  try {
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

/* ══════════════════════════════════════════════════════════════════
   Student: raise / lower hand
   FIX: added hand-raise rate limiting to prevent flood
   FIX: combined two SELECT queries into one (stream + viewer check)
══════════════════════════════════════════════════════════════════ */
router.post('/:streamId/hand-raise', requireRole('student'), async (req, res) => {
  const streamId  = parseId(req.params.streamId);
  if (!streamId) return res.status(400).json({ error: 'معرّف البث غير صالح' });

  const studentId = req.user.id;
  const { raised } = req.body;

  if (raised === undefined || raised === null)
    return res.status(400).json({ error: 'قيمة غير صحيحة لحقل raised' });

  const raisedBool = raised === true || raised === 1 || raised === 'true' || raised === '1';

  /* FIX: rate-limit hand-raise to prevent event flooding */
  if (!handRateCheck(studentId, streamId)) {
    return res.status(429).json({ error: 'الرجاء الانتظار قبل رفع اليد مجدداً' });
  }

  try {
    /* FIX: single query to get stream info + verify student is active viewer */
    const { rows } = await pool.query(
      `SELECT ls.teacher_id, ls.hand_raise_enabled,
              lsv.is_active AS viewer_active, lsv.is_kicked
       FROM live_streams ls
       LEFT JOIN live_stream_viewers lsv
         ON lsv.stream_id = ls.id AND lsv.student_id = $2
       WHERE ls.id = $1 AND ls.status = 'active'`,
      [streamId, studentId]
    );

    if (!rows.length) return res.status(404).json({ error: 'البث غير موجود أو انتهى' });

    const row = rows[0];
    if (!row.viewer_active || row.is_kicked)
      return res.status(403).json({ error: 'يجب الانضمام للبث أولاً قبل رفع اليد' });

    if (raisedBool && row.hand_raise_enabled === false) {
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

    sendEvent(`teacher_${row.teacher_id}`, 'live_hand_raise', {
      studentId, studentName: req.user.name, raised: raisedBool, streamId,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[live/hand-raise]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ══════════════════════════════════════════════════════════════════
   Teacher: kick a student from the stream
══════════════════════════════════════════════════════════════════ */
router.post('/:streamId/kick/:studentId', requireRole('teacher'), async (req, res) => {
  const streamId  = parseId(req.params.streamId);
  const studentId = parseId(req.params.studentId);
  if (!streamId || !studentId) return res.status(400).json({ error: 'معرّف غير صالح' });

  const teacherId = req.user.id;

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

    vcRemove(streamId, studentId);

    sendEvent(`student_${studentId}`, 'live_kicked', {
      streamId,
      message: 'تم إخراجك من البث من قِبَل المعلم',
    });

    sendEvent(`teacher_${teacherId}`, 'live_viewer_update', {
      action: 'kicked', studentId,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[live/kick]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ══════════════════════════════════════════════════════════════════
   Teacher: grant / revoke student mic & screen permissions
══════════════════════════════════════════════════════════════════ */
router.post('/:streamId/permissions/:studentId', requireRole('teacher'), async (req, res) => {
  const streamId  = parseId(req.params.streamId);
  const studentId = parseId(req.params.studentId);
  if (!streamId || !studentId) return res.status(400).json({ error: 'معرّف غير صالح' });

  const teacherId = req.user.id;
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
      streamId,
      can_speak:        !!can_speak,
      can_share_screen: !!can_share_screen,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[live/permissions]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ══════════════════════════════════════════════════════════════════
   Teacher: mute all students (revoke all can_speak)
══════════════════════════════════════════════════════════════════ */
router.post('/:streamId/mute-all', requireRole('teacher'), async (req, res) => {
  const streamId = parseId(req.params.streamId);
  if (!streamId) return res.status(400).json({ error: 'معرّف البث غير صالح' });

  const teacherId = req.user.id;

  try {
    const { rows: streamRows } = await pool.query(
      "SELECT id FROM live_streams WHERE id=$1 AND teacher_id=$2 AND status='active'",
      [streamId, teacherId]
    );
    if (!streamRows.length) return res.status(403).json({ error: 'غير مصرح' });

    const { rows: speakingViewers } = await pool.query(
      'SELECT student_id, can_share_screen FROM live_stream_viewers WHERE stream_id=$1 AND is_active=true AND can_speak=true',
      [streamId]
    );

    if (speakingViewers.length === 0) {
      return res.json({ success: true, mutedCount: 0 });
    }

    await pool.query(
      'UPDATE live_stream_viewers SET can_speak=false WHERE stream_id=$1 AND is_active=true',
      [streamId]
    );

    for (const { student_id, can_share_screen } of speakingViewers) {
      sendEvent(`student_${student_id}`, 'live_permission_update', {
        streamId,
        can_speak:        false,
        can_share_screen: !!can_share_screen,
      });
    }

    res.json({ success: true, mutedCount: speakingViewers.length });
  } catch (err) {
    console.error('[live/mute-all]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ══════════════════════════════════════════════════════════════════
   Teacher: lock / unlock the stream (no new joins)
══════════════════════════════════════════════════════════════════ */
router.post('/:streamId/lock', requireRole('teacher'), async (req, res) => {
  const streamId = parseId(req.params.streamId);
  if (!streamId) return res.status(400).json({ error: 'معرّف البث غير صالح' });

  const teacherId = req.user.id;
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

/* ══════════════════════════════════════════════════════════════════
   Student: get my permissions in a stream
══════════════════════════════════════════════════════════════════ */
router.get('/:streamId/my-permissions', requireRole('student'), async (req, res) => {
  const streamId  = parseId(req.params.streamId);
  if (!streamId) return res.status(400).json({ error: 'معرّف البث غير صالح' });

  const studentId = req.user.id;
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

/* ══════════════════════════════════════════════════════════════════
   Teacher: award points to a student during live
   FIX: verify student is actively watching the stream (not just
   any student belonging to the teacher)
   FIX: validate reason field length (max 200 chars)
══════════════════════════════════════════════════════════════════ */
router.post('/:streamId/award-points', requireRole('teacher'), async (req, res) => {
  const streamId = parseId(req.params.streamId);
  if (!streamId) return res.status(400).json({ error: 'معرّف البث غير صالح' });

  const teacherId = req.user.id;
  let { studentId, points, reason } = req.body;

  const studentIdParsed = parseId(studentId);
  if (!studentIdParsed) return res.status(400).json({ error: 'معرّف الطالب غير صالح' });

  points = parseInt(points, 10);
  if (!points || points < 1)
    return res.status(400).json({ error: 'بيانات غير صحيحة' });
  if (points > 1000)
    return res.status(400).json({ error: 'الحد الأقصى 1000 نقطة لكل منحة' });

  /* FIX: validate reason length */
  if (reason && typeof reason === 'string' && reason.length > 200) {
    return res.status(400).json({ error: 'سبب المنح طويل جداً (200 حرف كحد أقصى)' });
  }
  const safeReason = reason ? String(reason).trim().slice(0, 200) : null;

  try {
    const { rows: streamRows } = await pool.query(
      "SELECT title FROM live_streams WHERE id=$1 AND teacher_id=$2 AND status='active'",
      [streamId, teacherId]
    );
    if (!streamRows.length) return res.status(403).json({ error: 'غير مصرح أو البث غير نشط' });

    /* FIX: verify student IS actively watching this stream */
    const { rows: viewerCheck } = await pool.query(
      `SELECT s.name
       FROM live_stream_viewers lsv
       JOIN students s ON s.id = lsv.student_id
       WHERE lsv.stream_id=$1 AND lsv.student_id=$2
         AND lsv.is_active=true AND lsv.is_kicked=false
         AND s.teacher_id=$3`,
      [streamId, studentIdParsed, teacherId]
    );
    if (!viewerCheck.length)
      return res.status(404).json({ error: 'الطالب غير موجود في البث حالياً' });

    await pool.query('UPDATE students SET points=points+$1 WHERE id=$2', [points, studentIdParsed]);

    sendEvent(`student_${studentIdParsed}`, 'live_points_awarded', {
      points,
      studentName: viewerCheck[0].name,
      reason:      safeReason || 'منح نقاط أثناء البث المباشر',
      streamTitle: streamRows[0].title,
    });

    res.json({ success: true, pointsAwarded: points });
  } catch (err) {
    console.error('[live/award-points]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ══════════════════════════════════════════════════════════════════
   Both: get chat messages (supports ?since=<unix_ms>)
   FIX: consistent stream status check for both roles
══════════════════════════════════════════════════════════════════ */
router.get('/:streamId/chat', requireRole('teacher', 'student'), async (req, res) => {
  const streamId = parseId(req.params.streamId);
  if (!streamId) return res.status(400).json({ error: 'معرّف البث غير صالح' });

  const { since }  = req.query;
  const userId     = req.user.id;
  const userRole   = req.user.role;

  try {
    if (userRole === 'student') {
      // [H-5] FIX: require student to be an active (non-kicked) viewer.
      // Access rules (stages/specific) were enforced at /join time and the viewer
      // record was only created if they passed; requiring is_active=true here
      // guarantees they genuinely joined and have not left or been kicked.
      const access = await pool.query(
        `SELECT ls.id FROM live_streams ls
         JOIN students s ON s.id = $2 AND s.teacher_id = ls.teacher_id AND s.deleted_at IS NULL
         JOIN live_stream_viewers lsv
           ON lsv.stream_id = ls.id
           AND lsv.student_id = $2
           AND lsv.is_active  = true
           AND lsv.is_kicked  = false
         WHERE ls.id = $1 AND ls.status = 'active'`,
        [streamId, userId]
      );
      if (!access.rows.length) return res.status(403).json({ error: 'Access denied' });
    } else if (userRole === 'teacher') {
      const access = await pool.query('SELECT id FROM live_streams WHERE id=$1 AND teacher_id=$2', [streamId, userId]);
      if (!access.rows.length) return res.status(403).json({ error: 'Access denied' });
    }

    let q = 'SELECT id, stream_id, sender_id, sender_type, sender_name, message, sent_at FROM live_chat_messages WHERE stream_id=$1';
    const params = [streamId];
    const sinceMs = since ? parseInt(since, 10) : NaN;
    if (!isNaN(sinceMs) && sinceMs > 0) {
      q += ' AND sent_at > $2';
      params.push(new Date(sinceMs));
    }
    q += ' ORDER BY sent_at ASC LIMIT 200';
    const { rows } = await pool.query(q, params);
    res.json({ messages: rows });
  } catch (err) {
    console.error('[live/chat GET]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ══════════════════════════════════════════════════════════════════
   Both: send a chat message
   FIX: per-user rate limiting + fan-out uses batched helper
══════════════════════════════════════════════════════════════════ */
router.post('/:streamId/chat', requireRole('teacher', 'student'), async (req, res) => {
  const streamId = parseId(req.params.streamId);
  if (!streamId) return res.status(400).json({ error: 'معرّف البث غير صالح' });

  const { message }  = req.body;
  const senderId     = req.user.id;
  const senderType   = req.user.role;
  const senderName   = req.user.name;

  if (!message?.trim()) return res.status(400).json({ error: 'الرسالة فارغة' });
  if (message.trim().length > 500) return res.status(400).json({ error: 'الرسالة طويلة جداً (500 حرف كحد أقصى)' });

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

    /* FIX: use fanOut helper — non-blocking batched delivery to large audiences */
    const viewerIds = await getActiveViewerIds(streamId);
    sendEvent(`teacher_${teacherId}`, 'live_chat', msg);
    fanOut(viewerIds, 'live_chat', msg);

    res.json({ success: true, message: msg });
  } catch (err) {
    console.error('[live/chat POST]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ══════════════════════════════════════════════════════════════════
   Teacher: toggle chat on / off
══════════════════════════════════════════════════════════════════ */
router.post('/:streamId/chat-toggle', requireRole('teacher'), async (req, res) => {
  const streamId = parseId(req.params.streamId);
  if (!streamId) return res.status(400).json({ error: 'معرّف البث غير صالح' });

  const teacherId = req.user.id;
  const { enabled } = req.body;

  try {
    const { rowCount } = await pool.query(
      "UPDATE live_streams SET chat_enabled=$1 WHERE id=$2 AND teacher_id=$3 AND status='active'",
      [!!enabled, streamId, teacherId]
    );
    if (!rowCount) return res.status(404).json({ error: 'البث غير موجود أو انتهى' });

    const viewerIds = await getActiveViewerIds(streamId);
    fanOut(viewerIds, 'live_chat_toggle', { enabled: !!enabled, streamId });

    res.json({ success: true });
  } catch (err) {
    console.error('[live/chat-toggle]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
