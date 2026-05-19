const express = require('express');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendEvent, broadcastToTeacherStudents } = require('../sse');

const router = express.Router();
router.use(authenticate);

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

    const roomId = `wathba-${teacherId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

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
       WHERE ls.teacher_id=$1 AND ls.status='active'
       ORDER BY ls.started_at DESC`,
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

  try {
    // Verify stream exists AND student belongs to the teacher who owns the stream
    const { rows } = await pool.query(
      `SELECT ls.* FROM live_streams ls
       JOIN students s ON s.teacher_id = ls.teacher_id
       WHERE ls.id=$1 AND ls.status='active' AND s.id=$2 AND s.deleted_at IS NULL`,
      [streamId, studentId]
    );
    if (!rows.length) return res.status(404).json({ error: 'البث غير موجود أو انتهى' });

    await pool.query(
      `INSERT INTO live_stream_viewers (stream_id, student_id, is_active, joined_at)
       VALUES ($1,$2,true,NOW())
       ON CONFLICT (stream_id, student_id)
       DO UPDATE SET is_active=true, joined_at=NOW(), left_at=NULL`,
      [streamId, studentId]
    );

    sendEvent(`teacher_${rows[0].teacher_id}`, 'live_viewer_update', {
      action: 'joined', studentId, studentName: req.user.name,
    });

    res.json({ success: true, stream: rows[0] });
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
router.get('/:streamId/chat', async (req, res) => {
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
router.post('/:streamId/chat', async (req, res) => {
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

    // Students must belong to the teacher who owns the stream
    if (senderType === 'student') {
      const belongs = await pool.query(
        'SELECT 1 FROM students WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL',
        [senderId, streamRows[0].teacher_id]
      );
      if (!belongs.rows.length) return res.status(403).json({ error: 'Access denied' });
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
