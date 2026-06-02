const jwt = require('jsonwebtoken');
const pool = require('../db/connection');

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Server will not start.');
  process.exit(1);
}

const JWT_SECRET   = process.env.JWT_SECRET;
const CACHE_TTL_MS = 30_000; // 30 seconds
const MAX_CACHE_SIZE = 5_000; // max entries per cache before forced eviction

// Simple TTL cache — avoids a DB query on every request
// Entry: { valid: boolean, at: number (ms) }
const _studentCache   = new Map();
const _assistantCache = new Map();
const _teacherCache   = new Map();

// Revoked tokens — maps token string → expiresAt (ms)
const _tokenBlacklist = new Map();

// Evict oldest half of a Map when it exceeds MAX_CACHE_SIZE
function _evictOldest(cache) {
  if (cache.size <= MAX_CACHE_SIZE) return;
  const sorted = [...cache.entries()].sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
  for (const [k] of sorted.slice(0, Math.floor(cache.size / 2))) cache.delete(k);
}

// Purge stale entries every 5 minutes to prevent unbounded growth
setInterval(() => {
  const now    = Date.now();
  const cutoff = CACHE_TTL_MS * 10;
  for (const [k, e] of _studentCache.entries())  if (now - e.at > cutoff) _studentCache.delete(k);
  for (const [k, e] of _assistantCache.entries()) if (now - e.at > cutoff) _assistantCache.delete(k);
  for (const [k, e] of _teacherCache.entries())   if (now - e.at > cutoff) _teacherCache.delete(k);
  // Purge expired blacklist entries
  for (const [tok, exp] of _tokenBlacklist.entries()) if (now > exp) _tokenBlacklist.delete(tok);
  // Hard eviction if caches are oversized
  _evictOldest(_studentCache);
  _evictOldest(_assistantCache);
  _evictOldest(_teacherCache);
}, 5 * 60 * 1000).unref();

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  // Reject revoked tokens immediately (before cryptographic verification)
  if (_tokenBlacklist.has(token)) {
    return res.status(401).json({ error: 'Token has been revoked' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // ── Teacher: verify account still exists in DB ──────────────────────────
    if (decoded.role === 'teacher') {
      const now    = Date.now();
      const cached = _teacherCache.get(decoded.id);
      if (!cached || now - cached.at > CACHE_TTL_MS) {
        const check = await pool.query('SELECT id FROM teachers WHERE id = $1', [decoded.id]);
        const valid = check.rows.length > 0;
        _teacherCache.set(decoded.id, { valid, at: now });
        if (!valid) return res.status(401).json({ error: 'الحساب غير نشط أو تم حذفه' });
      } else if (!cached.valid) {
        return res.status(401).json({ error: 'الحساب غير نشط أو تم حذفه' });
      }
    }

    // ── Student: verify account hasn't been soft-deleted AND isn't suspended ─
    if (decoded.role === 'student') {
      const now    = Date.now();
      const cached = _studentCache.get(decoded.id);
      if (!cached || now - cached.at > CACHE_TTL_MS) {
        const check = await pool.query(
          'SELECT id, is_suspended FROM students WHERE id = $1 AND deleted_at IS NULL',
          [decoded.id]
        );
        // valid = exists AND not suspended
        const valid = check.rows.length > 0 && !check.rows[0]?.is_suspended;
        _studentCache.set(decoded.id, { valid, at: now });
        if (!valid) {
          const row = check.rows[0];
          if (row?.is_suspended) {
            return res.status(403).json({
              error: 'تم إيقاف حسابك مؤقتاً. يرجى التواصل مع المدرس لإعادة التفعيل.',
              account_suspended: true,
            });
          }
          return res.status(401).json({ error: 'الحساب غير نشط أو تم حذفه' });
        }
      } else if (!cached.valid) {
        return res.status(401).json({ error: 'الحساب غير نشط أو تم حذفه' });
      }
    }

    // ── Assistant: verify account still exists ──────────────────────────────
    if (decoded.role === 'assistant') {
      const now    = Date.now();
      const cached = _assistantCache.get(decoded.id);
      if (!cached || now - cached.at > CACHE_TTL_MS) {
        const check = await pool.query('SELECT id FROM assistants WHERE id = $1', [decoded.id]);
        const valid = check.rows.length > 0;
        _assistantCache.set(decoded.id, { valid, at: now });
        if (!valid) return res.status(401).json({ error: 'الحساب غير نشط أو تم حذفه' });
      } else if (!cached.valid) {
        return res.status(401).json({ error: 'الحساب غير نشط أو تم حذفه' });
      }
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Expose cache invalidation so delete endpoints can immediately block tokens
const invalidateStudentAuthCache = (studentId) => {
  _studentCache.set(studentId, { valid: false, at: Date.now() });
};

const invalidateAssistantAuthCache = (assistantId) => {
  _assistantCache.set(assistantId, { valid: false, at: Date.now() });
};

const invalidateTeacherAuthCache = (teacherId) => {
  _teacherCache.set(teacherId, { valid: false, at: Date.now() });
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};

const generateToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

// Add a token to the revocation blacklist (immediate logout)
const blacklistToken = (token, expiresAt) => {
  const exp = expiresAt || Date.now() + 7 * 24 * 60 * 60 * 1000;
  _tokenBlacklist.set(token, exp);
};

module.exports = {
  authenticate,
  requireRole,
  generateToken,
  blacklistToken,
  invalidateStudentAuthCache,
  invalidateAssistantAuthCache,
  invalidateTeacherAuthCache,
};
