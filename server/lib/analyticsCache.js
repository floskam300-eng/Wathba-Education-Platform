// ── Analytics Cache — nested Map for O(1) per-teacher invalidation ──
// Structure: _cache.get(teacherId) -> Map<key, {data, ts}>
const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function _teacherMap(teacherId) {
  let m = _cache.get(teacherId);
  if (!m) { m = new Map(); _cache.set(teacherId, m); }
  return m;
}

function _tidFromKey(key) {
  const m = key.match(/^t(\d+)_/);
  return m ? parseInt(m[1], 10) : null;
}

function getCached(key) {
  const tid = _tidFromKey(key);
  if (tid === null) return null;
  const m = _cache.get(tid);
  if (!m) return null;
  const entry = m.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { m.delete(key); return null; }
  return entry.data;
}

function setCache(key, data) {
  const tid = _tidFromKey(key);
  if (tid === null) return;
  _teacherMap(tid).set(key, { data, ts: Date.now() });
}

// O(1): drops entire teacher namespace at once instead of iterating all keys
function invalidateCache(teacherId) {
  _cache.delete(teacherId);
}

module.exports = { getCached, setCache, invalidateCache };
