const express = require('express');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { ACTION_LABELS } = require('../lib/activityLog');

const router = express.Router();
router.use(authenticate);

router.get('/', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  const {
    actor_type, action, entity_type,
    from, to,
    page = 1, limit = 50,
  } = req.query;

  try {
    const params = [teacherId];
    const conditions = ['teacher_id = $1'];

    if (actor_type) {
      params.push(actor_type);
      conditions.push(`actor_type = $${params.length}`);
    }
    if (action) {
      params.push(action);
      conditions.push(`action = $${params.length}`);
    }
    if (entity_type) {
      params.push(entity_type);
      conditions.push(`entity_type = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`created_at <= $${params.length}`);
    }

    const where = conditions.join(' AND ');

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM activity_logs WHERE ${where}`,
      params
    );
    const total = countRes.rows[0].total;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit));
    params.push(offset);

    const rows = await pool.query(
      `SELECT * FROM activity_logs
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      logs: rows.rows,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      action_labels: ACTION_LABELS,
    });
  } catch (err) {
    console.error('[activityLogs GET]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/clear', requireRole('teacher'), async (req, res) => {
  const teacherId = req.user.id;
  try {
    const { older_than_days = 90 } = req.query;
    const days = Math.max(1, parseInt(older_than_days));
    const result = await pool.query(
      `DELETE FROM activity_logs
       WHERE teacher_id = $1 AND created_at < NOW() - INTERVAL '1 day' * $2
       RETURNING id`,
      [teacherId, days]
    );
    res.json({ deleted: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
