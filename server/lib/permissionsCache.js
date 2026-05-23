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
  const r = await pool.query('SELECT * FROM assistants WHERE id=$1', [assistantId]);
  if (!r.rows.length) return null;
  const perms = r.rows[0];
  _permCache.set(assistantId, { perms, ts: Date.now() });
  return perms;
}

function invalidatePermissions(assistantId) {
  _permCache.delete(assistantId);
}

module.exports = { getPermissions, invalidatePermissions };
