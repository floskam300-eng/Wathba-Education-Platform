const express = require('express');
const crypto = require('crypto');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendEvent, broadcastToTeacherStudents } = require('../sse');

const router = express.Router();
router.use(authenticate);

/* ──────────────────────────────────────────────────────────────
   LiveKit: generate a join token for teacher or student
────────────────────────────────────────────────────────────── */
router.post('/:streamId/livekit-token', authenticate, async (req, res) => {
  const { streamId } = req.params;
  const { id, role, name } = req.user;

  const apiKey    = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const serverUrl = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !serverUrl) {
    return res.status(503).json({
      error: 'LiveKit غير مهيأ — أضف LIVEKIT_URL و LIVEKIT_API_KEY و LIVEKIT_API_SECRET في متغيرات البيئة',
    });
  }

  try {
    const { rows } = await pool.query(
      "SELECT * FROM live_streams WHERE id=$1 AND status IN ('active','scheduled')",
      [streamId]
    );
    if (!rows.length) return res.status(404).json({ error: 'البث غير موجود' });

    const stream   = rows[0];
    const roomName = stream.room_id;

    if (role === 'teacher') {
      if (parseInt(stream.teacher_id) !== parseInt(id)) {
        return res.status(403).json({ error: 'Access denied: stream not yours' });
      }
    } else if (role === 'student') {
      const { rows: studentRows } = await pool.query(
        'SELECT teacher_id FROM students WHERE id=$1 AND deleted_at IS NULL',
        [id]
      );
      if (!studentRows.length || parseInt(studentRows[0].teacher_id) !== parseInt(stream.teacher_id)) {
        return res.status(403).json({ error: 'Access denied: stream not from your teacher' });
      }
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { AccessToken } = require('livekit-server-sdk');

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
      const perm = permRows[0] || {};
      const canPublish = !!(perm.can_speak || perm.can_share_screen);
      at.addGrant({
        roomJoin:       true,
        room:           roomName,
        canPublish,
        canSubscribe:   true,
        canPublishData: false,
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
    // End any currently active stream first
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

  try {
    // End any existing active stream first
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
      // Note: JSON.stringify is intentional — pg sends it as text and PostgreSQL casts to JSONB
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

    await pool.query(
      "UPDATE live_stream_viewers SET is_active=false, left_at=NOW() WHERE stream_id=$1 AND is_active=true",
      [streamId]
    );

    const { rows: viewers } = await pool.query(
      'SELECT student_id FROM live_stream_viewers WHERE stream_id=$1',
      [streamId]
    );
    for (const { student_id } of viewers)
      sendEvent(`student_${student_id}`, 'live_ended', { streamId, message: 'انتهى البث المباشر' });

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
    const { rows: studentRows } = await pool.query(
      'SELECT teacher_id, academic_stage FROM students WHERE id=$1',
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
   Teacher: get active viewers list
────────────────────────────────────────────────────────────── */
router.get('/:streamId/viewers', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const { streamId } = req.params;

  try {
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
    res.json({ viewers: rows });
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
  const { raised } = req.body;

  if (typeof raised !== 'boolean' && raised !== 0 && raised !== 1 && raised !== 'true' && raised !== 'false')
    return res.status(400).json({ error: 'قيمة غير صحيحة لحقل raised' });

  try {
    const { rows } = await pool.query(
      'SELECT teacher_id, hand_raise_enabled FROM live_streams WHERE id=$1',
      [streamId]
    );
    if (!rows.length) return res.status(404).json({ error: 'البث غير موجود' });

    const viewerCheck = await pool.query(
      'SELECT 1 FROM live_stream_viewers WHERE stream_id=$1 AND student_id=$2 AND is_active=true',
      [streamId, studentId]
    );
    if (!viewerCheck.rows.length)
      return res.status(403).json({ error: 'يجب الانضمام للبث أولاً قبل رفع اليد' });

    if (raised && rows[0].hand_raise_enabled === false) {
      return res.status(403).json({ error: 'رفع اليد معطل في هذا البث' });
    }

    if (raised) {
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
      studentId, studentName: req.user.name, raised: !!raised, streamId: parseInt(streamId),
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
      'SELECT id, title FROM live_streams WHERE id=$1 AND teacher_id=$2 AND status=\'active\'',
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
      'SELECT id FROM live_streams WHERE id=$1 AND teacher_id=$2 AND status=\'active\'',
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
────────────────────────────────────────────────────────────── */
router.post('/:streamId/mute-all', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const { streamId } = req.params;

  try {
    const { rows: streamRows } = await pool.query(
      'SELECT id FROM live_streams WHERE id=$1 AND teacher_id=$2 AND status=\'active\'',
      [streamId, teacherId]
    );
    if (!streamRows.length) return res.status(403).json({ error: 'غير مصرح' });

    const { rows: activeViewers } = await pool.query(
      'SELECT student_id FROM live_stream_viewers WHERE stream_id=$1 AND is_active=true AND can_speak=true',
      [streamId]
    );

    await pool.query(
      'UPDATE live_stream_viewers SET can_speak=false WHERE stream_id=$1 AND is_active=true',
      [streamId]
    );

    for (const { student_id } of activeViewers) {
      const cur = await pool.query(
        'SELECT can_share_screen FROM live_stream_viewers WHERE stream_id=$1 AND student_id=$2',
        [streamId, student_id]
      );
      sendEvent(`student_${student_id}`, 'live_permission_update', {
        streamId: parseInt(streamId),
        can_speak: false,
        can_share_screen: cur.rows[0]?.can_share_screen || false,
      });
    }

    res.json({ success: true, mutedCount: activeViewers.length });
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
      'UPDATE live_streams SET is_locked=$1 WHERE id=$2 AND teacher_id=$3 AND status=\'active\'',
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
      'SELECT can_speak, can_share_screen FROM live_stream_viewers WHERE stream_id=$1 AND student_id=$2 AND is_active=true',
      [streamId, studentId]
    );
    res.json(rows[0] || { can_speak: false, can_share_screen: false });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Teacher: award points to a student during live
────────────────────────────────────────────────────────────── */
router.post('/:streamId/award-points', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const { streamId } = req.params;
  const { studentId, points, reason } = req.body;

  if (!studentId || !points || points <= 0)
    return res.status(400).json({ error: 'بيانات غير صحيحة' });

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
────────────────────────────────────────────────────────────── */
router.get('/:streamId/chat', requireRole('teacher', 'student'), async (req, res) => {
  const { streamId } = req.params;
  const { since } = req.query;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    // Verify the requester is allowed to see this stream's chat
    if (userRole === 'student') {
      const access = await pool.query(
        `SELECT ls.id FROM live_streams ls
         JOIN students s ON s.teacher_id = ls.teacher_id
         WHERE ls.id=$1 AND s.id=$2 AND s.deleted_at IS NULL AND ls.status='active'`,
        [streamId, userId]
      );
      if (!access.rows.length) return res.status(403).json({ error: 'Access denied' });
    } else if (userRole === 'teacher') {
      const access = await pool.query('SELECT id FROM live_streams WHERE id=$1 AND teacher_id=$2', [streamId, userId]);
      if (!access.rows.length) return res.status(403).json({ error: 'Access denied' });
    }

    let q = 'SELECT * FROM live_chat_messages WHERE stream_id=$1';
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
────────────────────────────────────────────────────────────── */
router.post('/:streamId/chat', requireRole('teacher', 'student'), async (req, res) => {
  const { streamId } = req.params;
  const { message } = req.body;
  const senderId = req.user.id;
  const senderType = req.user.role;
  const senderName = req.user.name;

  if (!message?.trim()) return res.status(400).json({ error: 'الرسالة فارغة' });
  if (message.trim().length > 500) return res.status(400).json({ error: 'الرسالة طويلة جداً (500 حرف كحد أقصى)' });

  try {
    const { rows: streamRows } = await pool.query(
      "SELECT teacher_id, chat_enabled FROM live_streams WHERE id=$1 AND status='active'",
      [streamId]
    );
    if (!streamRows.length) return res.status(404).json({ error: 'البث غير موجود أو انتهى' });

    // Students must be active viewers of this stream (verified join + access check)
    if (senderType === 'student') {
      const viewer = await pool.query(
        'SELECT 1 FROM live_stream_viewers WHERE stream_id=$1 AND student_id=$2 AND is_active=true',
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
    sendEvent(`teacher_${teacherId}`, 'live_chat', msg);

    const { rows: viewers } = await pool.query(
      'SELECT student_id FROM live_stream_viewers WHERE stream_id=$1 AND is_active=true',
      [streamId]
    );
    for (const { student_id } of viewers)
      sendEvent(`student_${student_id}`, 'live_chat', msg);

    res.json({ success: true, message: msg });
  } catch (err) {
    console.error('[live/chat]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ──────────────────────────────────────────────────────────────
   Teacher: toggle chat on / off
────────────────────────────────────────────────────────────── */
router.post('/:streamId/chat-toggle', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const { streamId } = req.params;
  const { enabled } = req.body;

  try {
    await pool.query(
      'UPDATE live_streams SET chat_enabled=$1 WHERE id=$2 AND teacher_id=$3',
      [!!enabled, streamId, teacherId]
    );

    const { rows: viewers } = await pool.query(
      'SELECT student_id FROM live_stream_viewers WHERE stream_id=$1 AND is_active=true',
      [streamId]
    );
    for (const { student_id } of viewers)
      sendEvent(`student_${student_id}`, 'live_chat_toggle', { enabled: !!enabled, streamId: parseInt(streamId) });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
