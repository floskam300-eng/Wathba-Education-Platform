const express = require('express');
const crypto = require('crypto');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Returns Monday 00:00:00 Cairo time expressed as a UTC Date
// Egypt = Africa/Cairo (UTC+2 winter / UTC+3 summer — Intl handles DST correctly)
const getWeekStart = () => {
  const now = new Date();
  // Get the current date string in Cairo timezone (YYYY-MM-DD)
  const cairoDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  const [y, m, d] = cairoDateStr.split('-').map(Number);

  // Build a Date that represents midnight (00:00:00) on this Cairo date, in UTC
  const cairoMidnightUtc = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = cairoMidnightUtc.getUTCDay(); // 0=Sun, 1=Mon, …
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  cairoMidnightUtc.setUTCDate(cairoMidnightUtc.getUTCDate() + diff);
  return cairoMidnightUtc;
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
    // Clean up expired tokens for this student (older than 2 hours)
    await pool.query(
      `DELETE FROM game_session_tokens WHERE student_id=$1 AND event_id='weekly_run' AND created_at < NOW() - INTERVAL '2 hours'`,
      [req.user.id]
    );
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO game_session_tokens (student_id, token, event_id) VALUES ($1, $2, 'weekly_run')`,
      [req.user.id, token]
    );
    res.json({ success: true, sessionToken: token });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
