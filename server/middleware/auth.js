const jwt = require('jsonwebtoken');
const pool = require('../db/connection');

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Server will not start.');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;

// Simple TTL cache — avoids a DB query on every student request
// Entry: { valid: boolean, at: number (ms) }
const _studentCache = new Map();
const CACHE_TTL_MS = 30_000; // 30 seconds

// Purge stale/expired entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of _studentCache.entries()) {
    if (now - entry.at > CACHE_TTL_MS * 10) {
      _studentCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // For students: verify the account hasn't been soft-deleted since token was issued
    if (decoded.role === 'student') {
      const now = Date.now();
      const cached = _studentCache.get(decoded.id);
      if (!cached || now - cached.at > CACHE_TTL_MS) {
        const check = await pool.query(
          'SELECT id FROM students WHERE id=$1 AND deleted_at IS NULL',
          [decoded.id]
        );
        const valid = check.rows.length > 0;
        _studentCache.set(decoded.id, { valid, at: now });
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

// Expose cache invalidation so delete endpoint can immediately block the token
const invalidateStudentAuthCache = (studentId) => {
  _studentCache.set(studentId, { valid: false, at: Date.now() });
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};

const generateToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

module.exports = { authenticate, requireRole, generateToken, invalidateStudentAuthCache };
