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
    from, to, search,
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
      conditions.push(`created_at >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      conditions.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`);
    }
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      params.push(term);
      const i1 = params.length;
      params.push(term);
      const i2 = params.length;
      conditions.push(`(actor_name ILIKE $${i1} OR entity_name ILIKE $${i2})`);
    }

    const where = conditions.join(' AND ');
    const safeLimit  = Math.min(Math.max(1, parseInt(limit)  || 50), 200);
    const safePage   = Math.max(1, parseInt(page) || 1);
    const offset     = (safePage - 1) * safeLimit;

    params.push(safeLimit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const rows = await pool.query(
      `SELECT
         id, teacher_id, actor_type, actor_id, actor_name, action,
         entity_type, entity_id, entity_name, details, ip_address, created_at,
         COUNT(*) OVER() AS total_count
       FROM activity_logs
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const total = rows.rows.length > 0 ? parseInt(rows.rows[0].total_count) : 0;
    const logs  = rows.rows.map(({ total_count, ...rest }) => rest);

    res.json({
      logs,
      total,
      page:  safePage,
      pages: Math.ceil(total / safeLimit),
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
    const { older_than_days = 90 } = req.body || {};
    const days = Math.max(1, parseInt(older_than_days) || 90);
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
