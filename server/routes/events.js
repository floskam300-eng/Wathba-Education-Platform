const express = require('express');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const getWeekStart = () => {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
};

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
  // Server-side validation: cap values to prevent cheating
  const MAX_BOSSES = 3;
  const MAX_POINTS_PER_BOSS = 200;
  const sanitizedBosses = Math.max(0, Math.min(MAX_BOSSES, parseInt(req.body.bossesDefeated) || 0));
  const maxAllowedPoints = sanitizedBosses * MAX_POINTS_PER_BOSS;
  const sanitizedPoints = Math.max(0, Math.min(maxAllowedPoints, parseInt(req.body.pointsEarned) || 0));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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
