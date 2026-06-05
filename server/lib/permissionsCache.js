const _permCache = new Map();
const PERM_TTL = 5 * 60 * 1000;

// Periodic cleanup: actively remove expired entries every 10 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _permCache.entries()) {
    if (now - v.ts > PERM_TTL * 2) _permCache.delete(k);
  }
}, 10 * 60 * 1000).unref();

async function getPermissions(assistantId, pool) {
  const cached = _permCache.get(assistantId);
  if (cached && Date.now() - cached.ts < PERM_TTL) return cached.perms;
  const r = await pool.query(
    `SELECT id, teacher_id,
            can_add_students, can_edit_students, can_delete_students,
            can_manage_exams, can_view_analytics, can_send_reports,
            can_manage_payments, can_manage_courses, can_send_notifications
     FROM assistants WHERE id=$1`,
    [assistantId]
  );
  if (!r.rows.length) return null;
  const perms = r.rows[0];
  _permCache.set(assistantId, { perms, ts: Date.now() });
  return perms;
}

function invalidatePermissions(assistantId) {
  _permCache.delete(assistantId);
}

module.exports = { getPermissions, invalidatePermissions };
