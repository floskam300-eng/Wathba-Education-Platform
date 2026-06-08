const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const pool   = require('../db/connection');

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Server will not start.');
  process.exit(1);
}

const JWT_SECRET   = process.env.JWT_SECRET;
const CACHE_TTL_MS = 30_000;
const MAX_CACHE_SIZE = 5_000;

const _studentCache   = new Map();
const _assistantCache = new Map();
const _teacherCache   = new Map();

// Revoked tokens — maps SHA-256(token) → expiresAt (ms)
const _tokenBlacklist = new Map();

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// On startup: load unexpired revoked tokens from DB into memory
(async () => {
  try {
    const res = await pool.query(
      'SELECT token_hash, expires_at FROM revoked_tokens WHERE expires_at > NOW()'
    );
    for (const row of res.rows) {
      _tokenBlacklist.set(row.token_hash, new Date(row.expires_at).getTime());
    }
    if (res.rows.length) {
      console.log(`[auth] Loaded ${res.rows.length} revoked token(s) from DB`);
    }
  } catch (e) {
    console.warn('[auth] Could not load revoked tokens from DB (table may not exist yet):', e.message);
  }
})();

function _evictOldest(cache) {
  if (cache.size <= MAX_CACHE_SIZE) return;
  const sorted = [...cache.entries()].sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
  for (const [k] of sorted.slice(0, Math.floor(cache.size / 2))) cache.delete(k);
}

setInterval(() => {
  const now    = Date.now();
  const cutoff = CACHE_TTL_MS * 10;
  for (const [k, e] of _studentCache.entries())  if (now - e.at > cutoff) _studentCache.delete(k);
  for (const [k, e] of _assistantCache.entries()) if (now - e.at > cutoff) _assistantCache.delete(k);
  for (const [k, e] of _teacherCache.entries())   if (now - e.at > cutoff) _teacherCache.delete(k);
  for (const [h, exp] of _tokenBlacklist.entries()) if (now > exp) _tokenBlacklist.delete(h);
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

  // Check hashed token against blacklist (memory-fast, DB-persistent)
  if (_tokenBlacklist.has(hashToken(token))) {
    return res.status(401).json({ error: 'Token has been revoked' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

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

    if (decoded.role === 'student') {
      const now    = Date.now();
      const cached = _studentCache.get(decoded.id);
      if (!cached || now - cached.at > CACHE_TTL_MS) {
        const check = await pool.query(
          'SELECT id, is_suspended FROM students WHERE id = $1 AND deleted_at IS NULL',
          [decoded.id]
        );
        const row       = check.rows[0];
        const suspended = !!(row?.is_suspended);
        const valid     = check.rows.length > 0 && !suspended;
        // [L-1] FIX: store suspension reason in cache so cache-hit path returns
        // 403 account_suspended instead of generic 401
        _studentCache.set(decoded.id, { valid, suspended, at: now });
        if (!valid) {
          if (suspended) {
            return res.status(403).json({
              error: 'تم إيقاف حسابك مؤقتاً. يرجى التواصل مع المدرس لإعادة التفعيل.',
              account_suspended: true,
            });
          }
          return res.status(401).json({ error: 'الحساب غير نشط أو تم حذفه' });
        }
      } else if (!cached.valid) {
        // [L-1] FIX: use cached suspension flag instead of always returning 401
        if (cached.suspended) {
          return res.status(403).json({
            error: 'تم إيقاف حسابك مؤقتاً. يرجى التواصل مع المدرس لإعادة التفعيل.',
            account_suspended: true,
          });
        }
        return res.status(401).json({ error: 'الحساب غير نشط أو تم حذفه' });
      }
    }

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

const generateToken = (payload) => jwt.sign(
  { ...payload, jti: crypto.randomBytes(8).toString('hex') },
  JWT_SECRET,
  { expiresIn: '7d' }
);

// Revoke a token: store hash in memory immediately, persist to DB (fire-and-forget)
const blacklistToken = (token, expiresAt) => {
  const hash = hashToken(token);
  const exp  = expiresAt || Date.now() + 7 * 24 * 60 * 60 * 1000;
  _tokenBlacklist.set(hash, exp);
  pool.query(
    'INSERT INTO revoked_tokens (token_hash, expires_at) VALUES ($1, $2) ON CONFLICT (token_hash) DO NOTHING',
    [hash, new Date(exp).toISOString()]
  ).catch(e => console.warn('[auth] Failed to persist revoked token to DB:', e.message));
};

/**
 * [C-2] Full token validation for use outside the authenticate middleware
 * (e.g. SSE endpoint, static-file upload guards).
 * Checks: blacklist → JWT signature → account status (reuses same in-memory caches).
 * @param {string} token - raw JWT string
 * @returns {Promise<Object>} decoded JWT payload
 * @throws {{ message: string, statusCode: number }}
 */
const verifyFullToken = async (token) => {
  if (!token) {
    throw Object.assign(new Error('No token provided'), { statusCode: 401 });
  }

  // [C-2] Blacklist check — catches revoked/logged-out tokens
  if (_tokenBlacklist.has(hashToken(token))) {
    throw Object.assign(new Error('Token has been revoked'), { statusCode: 401 });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    throw Object.assign(new Error('Invalid or expired token'), { statusCode: 401 });
  }

  const now = Date.now();

  if (decoded.role === 'teacher') {
    const cached = _teacherCache.get(decoded.id);
    if (!cached || now - cached.at > CACHE_TTL_MS) {
      const r = await pool.query('SELECT id FROM teachers WHERE id = $1', [decoded.id]);
      const valid = r.rows.length > 0;
      _teacherCache.set(decoded.id, { valid, at: now });
      if (!valid) throw Object.assign(new Error('الحساب غير نشط أو تم حذفه'), { statusCode: 401 });
    } else if (!cached.valid) {
      throw Object.assign(new Error('الحساب غير نشط أو تم حذفه'), { statusCode: 401 });
    }
  }

  if (decoded.role === 'student') {
    const cached = _studentCache.get(decoded.id);
    if (!cached || now - cached.at > CACHE_TTL_MS) {
      const r = await pool.query(
        'SELECT id, is_suspended FROM students WHERE id = $1 AND deleted_at IS NULL',
        [decoded.id]
      );
      const row       = r.rows[0];
      const suspended = !!(row?.is_suspended);
      const valid     = !!row && !suspended;
      // [L-1] FIX: persist suspension reason so cache-hit path can return
      // correct status code and account_suspended flag
      _studentCache.set(decoded.id, { valid, suspended, at: now });
      if (!valid) {
        const code = suspended ? 403 : 401;
        throw Object.assign(
          new Error(suspended ? 'تم إيقاف الحساب مؤقتاً' : 'الحساب غير نشط أو تم حذفه'),
          { statusCode: code, account_suspended: suspended }
        );
      }
    } else if (!cached.valid) {
      // [L-1] FIX: use cached.suspended instead of always throwing 403 generic
      const suspended = cached.suspended || false;
      throw Object.assign(
        new Error(suspended ? 'تم إيقاف الحساب مؤقتاً' : 'الحساب غير نشط أو تم حذفه'),
        { statusCode: suspended ? 403 : 401, account_suspended: suspended }
      );
    }
  }

  if (decoded.role === 'assistant') {
    const cached = _assistantCache.get(decoded.id);
    if (!cached || now - cached.at > CACHE_TTL_MS) {
      const r = await pool.query('SELECT id FROM assistants WHERE id = $1', [decoded.id]);
      const valid = r.rows.length > 0;
      _assistantCache.set(decoded.id, { valid, at: now });
      if (!valid) throw Object.assign(new Error('الحساب غير نشط أو تم حذفه'), { statusCode: 401 });
    } else if (!cached.valid) {
      throw Object.assign(new Error('الحساب غير نشط أو تم حذفه'), { statusCode: 401 });
    }
  }

  return decoded;
};

module.exports = {
  authenticate,
  requireRole,
  generateToken,
  blacklistToken,
  verifyFullToken,
  invalidateStudentAuthCache,
  invalidateAssistantAuthCache,
  invalidateTeacherAuthCache,
};
