const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const pool = require('../db/connection');
const { generateToken, authenticate } = require('../middleware/auth');
const { logActivity, getIp } = require('../lib/activityLog');

const router = express.Router();

// ── IP-level rate limiter (outer defense) ──────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'محاولات تسجيل دخول كثيرة، حاول مرة أخرى بعد 15 دقيقة' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// ── Per-username brute-force protection (5 attempts → 60s lockout) ─────────
const MAX_ATTEMPTS  = 5;
const LOCKOUT_MS    = 60 * 1000; // 1 minute
const loginAttempts = new Map(); // key: `${slug|'_'}:${username}`

// Purge stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of loginAttempts.entries()) {
    const expiry = (val.lockedUntil || val.firstAttempt) + LOCKOUT_MS * 20;
    if (now > expiry) loginAttempts.delete(key);
  }
}, 10 * 60 * 1000).unref();

function getAttemptKey(slug, username) {
  return `${slug || '_'}:${(username || '').toLowerCase()}`;
}

// Returns remaining lockout seconds, or null if not locked
function checkLockout(key) {
  const entry = loginAttempts.get(key);
  if (!entry || !entry.lockedUntil) return null;
  if (Date.now() < entry.lockedUntil) {
    return Math.ceil((entry.lockedUntil - Date.now()) / 1000);
  }
  loginAttempts.delete(key); // expired — clear
  return null;
}

function recordFailure(key) {
  const now  = Date.now();
  const entry = loginAttempts.get(key) || { count: 0, firstAttempt: now, lockedUntil: null };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
  }
  loginAttempts.set(key, entry);
}

function clearAttempts(key) {
  loginAttempts.delete(key);
}

// ── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password, role, slug } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // Check per-username lockout BEFORE hitting the DB
  const attemptKey   = getAttemptKey(slug, username);
  const lockedSecs   = checkLockout(attemptKey);
  if (lockedSecs !== null) {
    return res.status(429).json({
      error: `تم تجميد الحساب مؤقتاً بسبب ${MAX_ATTEMPTS} محاولات فاشلة. حاول مرة أخرى بعد ${lockedSecs} ثانية`,
      locked_seconds: lockedSecs,
    });
  }

  try {
    // Resolve teacher from slug (for tenant scoping)
    let slugTeacherId   = null;
    let slugTeacherSlug = null;
    if (slug) {
      const tRes = await pool.query(
        'SELECT id, slug FROM teachers WHERE slug = $1',
        [slug]
      );
      if (tRes.rows.length === 0) {
        recordFailure(attemptKey);
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
      }
      slugTeacherId   = tRes.rows[0].id;
      slugTeacherSlug = tRes.rows[0].slug;
    }

    const checks = role ? [role] : ['teacher', 'assistant', 'student'];

    for (const r of checks) {
      let result;

      if (r === 'teacher') {
        if (slugTeacherId) {
          result = await pool.query(
            'SELECT * FROM teachers WHERE username = $1 AND id = $2',
            [username, slugTeacherId]
          );
        } else {
          result = await pool.query('SELECT * FROM teachers WHERE username = $1', [username]);
        }
      } else if (r === 'assistant') {
        if (slugTeacherId) {
          result = await pool.query(
            'SELECT * FROM assistants WHERE username = $1 AND teacher_id = $2',
            [username, slugTeacherId]
          );
        } else {
          result = await pool.query('SELECT * FROM assistants WHERE username = $1', [username]);
        }
      } else if (r === 'student') {
        if (slugTeacherId) {
          result = await pool.query(
            'SELECT * FROM students WHERE username = $1 AND deleted_at IS NULL AND teacher_id = $2',
            [username, slugTeacherId]
          );
        } else {
          result = await pool.query(
            'SELECT * FROM students WHERE username = $1 AND deleted_at IS NULL',
            [username]
          );
        }
      } else {
        continue;
      }

      if (result.rows.length === 0) continue;

      const user  = result.rows[0];
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        recordFailure(attemptKey);
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
      }

      // Successful login — clear lockout tracker
      clearAttempts(attemptKey);

      // Build payload with teacher_slug for all roles
      const payload = { id: user.id, role: r, username: user.username, name: user.name };

      if (r === 'teacher') {
        payload.teacher_slug = user.slug || slugTeacherSlug;
      } else {
        payload.teacher_id = user.teacher_id;
        const teacherRes = await pool.query(
          'SELECT slug FROM teachers WHERE id = $1',
          [user.teacher_id]
        );
        payload.teacher_slug = teacherRes.rows[0]?.slug || null;
      }

      const token = generateToken(payload);
      const { password: _, plain_password: __, fcm_token: ___, ...safeUser } = user;

      if (r === 'teacher') {
        logActivity({
          teacherId: user.id,
          actor: { type: 'teacher', id: user.id, name: user.name || user.username },
          ip: getIp(req),
          action: 'login_teacher',
          entity: { type: 'teacher', id: user.id, name: user.name || user.username },
        });
      } else if (r === 'assistant') {
        logActivity({
          teacherId: user.teacher_id,
          actor: { type: 'assistant', id: user.id, name: user.name || user.username },
          ip: getIp(req),
          action: 'login_assistant',
          entity: { type: 'assistant', id: user.id, name: user.name || user.username },
        });
      }

      return res.json({
        token,
        user: { ...safeUser, role: r, teacher_slug: payload.teacher_slug },
      });
    }

    // No matching user found
    recordFailure(attemptKey);
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    const { id, role } = req.user;

    let result;
    if (role === 'teacher') {
      result = await pool.query('SELECT * FROM teachers WHERE id = $1', [id]);
    } else if (role === 'assistant') {
      result = await pool.query(
        `SELECT a.*, t.slug as teacher_slug FROM assistants a
         LEFT JOIN teachers t ON t.id = a.teacher_id
         WHERE a.id = $1`,
        [id]
      );
    } else {
      result = await pool.query(
        `SELECT s.*, t.slug as teacher_slug FROM students s
         LEFT JOIN teachers t ON t.id = s.teacher_id
         WHERE s.id = $1 AND s.deleted_at IS NULL`,
        [id]
      );
    }

    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const { password: _, plain_password: __, fcm_token: ___, ...safeUser } = result.rows[0];

    if (role === 'teacher') {
      safeUser.teacher_slug = safeUser.slug;
    }

    res.json({ ...safeUser, role });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
