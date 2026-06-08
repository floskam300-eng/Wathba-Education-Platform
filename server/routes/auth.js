const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('../db/connection');
const { generateToken, authenticate, blacklistToken } = require('../middleware/auth');
const { logActivity, getIp } = require('../lib/activityLog');

const router = express.Router();

// ── H-8: Short-lived SSE ticket store (one-time use, 30s TTL) ──────────────
const _sseTickets = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [ticket, data] of _sseTickets.entries()) {
    if (now > data.expiresAt) _sseTickets.delete(ticket);
  }
}, 60_000).unref();

/**
 * Consume a one-time SSE ticket.
 * Returns the decoded user payload, or null if the ticket is invalid/expired.
 */
const consumeSSETicket = (ticket) => {
  if (!ticket) return null;
  const data = _sseTickets.get(ticket);
  if (!data) return null;
  if (Date.now() > data.expiresAt) { _sseTickets.delete(ticket); return null; }
  _sseTickets.delete(ticket); // one-time use
  return data.user;
};

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
const LOCKOUT_MS    = 60 * 1000;
const loginAttempts = new Map();

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

function checkLockout(key) {
  const entry = loginAttempts.get(key);
  if (!entry || !entry.lockedUntil) return null;
  if (Date.now() < entry.lockedUntil) {
    return Math.ceil((entry.lockedUntil - Date.now()) / 1000);
  }
  loginAttempts.delete(key);
  return null;
}

function recordFailure(key) {
  const now   = Date.now();
  const entry = loginAttempts.get(key) || { count: 0, firstAttempt: now, lockedUntil: null };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) entry.lockedUntil = now + LOCKOUT_MS;
  loginAttempts.set(key, entry);
}

function clearAttempts(key) {
  loginAttempts.delete(key);
}

// ── Parse a readable device name from User-Agent ───────────────────────────
function parseDeviceName(userAgent) {
  if (!userAgent) return 'جهاز غير معروف';
  let os = 'غير معروف';
  let browser = 'غير معروف';
  if (/Windows NT 10/i.test(userAgent))      os = 'Windows 10/11';
  else if (/Windows NT 6\.3/i.test(userAgent)) os = 'Windows 8.1';
  else if (/Windows/i.test(userAgent))         os = 'Windows';
  else if (/Android/i.test(userAgent)) {
    const m = userAgent.match(/Android ([0-9.]+)/i);
    os = m ? `Android ${m[1]}` : 'Android';
  } else if (/iPhone/i.test(userAgent)) {
    const m = userAgent.match(/OS ([0-9_]+)/i);
    os = m ? `iOS ${m[1].replace(/_/g,'.')}` : 'iPhone';
  } else if (/iPad/i.test(userAgent)) os = 'iPad';
  else if (/Mac OS/i.test(userAgent))  os = 'Mac';
  else if (/Linux/i.test(userAgent))   os = 'Linux';

  if (/Edg\//i.test(userAgent))        browser = 'Edge';
  else if (/OPR\//i.test(userAgent))   browser = 'Opera';
  else if (/Chrome\//i.test(userAgent)) browser = 'Chrome';
  else if (/Firefox\//i.test(userAgent)) browser = 'Firefox';
  else if (/Safari\//i.test(userAgent))  browser = 'Safari';

  return `${os} — ${browser}`;
}

// ── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password, role, device_id } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // Tenant resolved by subdomainTenant middleware (from subdomain or X-Tenant-Slug header)
  const slugTeacherId   = req.tenantTeacherId || null;
  const slugTeacherSlug = req.tenantSlug || null;

  // If a slug was sent but didn't resolve to a real teacher → reject immediately.
  // Without this check, a missing tenant would silently fall back to a global
  // (cross-teacher) user search, which is a security bypass.
  if (req.tenantSlugAttempted && !slugTeacherId) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }

  const attemptKey = getAttemptKey(slugTeacherSlug, username);
  const lockedSecs = checkLockout(attemptKey);
  if (lockedSecs !== null) {
    return res.status(429).json({
      error: `تم تجميد الحساب مؤقتاً بسبب ${MAX_ATTEMPTS} محاولات فاشلة. حاول مرة أخرى بعد ${lockedSecs} ثانية`,
      locked_seconds: lockedSecs,
    });
  }

  try {

    const checks = role ? [role] : ['teacher', 'assistant', 'student'];

    for (const r of checks) {
      let result;

      if (r === 'teacher') {
        result = slugTeacherId
          ? await pool.query('SELECT * FROM teachers WHERE username = $1 AND id = $2', [username, slugTeacherId])
          : await pool.query('SELECT * FROM teachers WHERE username = $1', [username]);
      } else if (r === 'assistant') {
        // Assistants MUST belong to a specific tenant — no cross-tenant or main-domain login
        if (!slugTeacherId) continue;
        result = await pool.query('SELECT * FROM assistants WHERE username = $1 AND teacher_id = $2', [username, slugTeacherId]);
      } else if (r === 'student') {
        // Students MUST belong to a specific tenant — no cross-tenant or main-domain login
        if (!slugTeacherId) continue;
        result = await pool.query('SELECT * FROM students WHERE username = $1 AND deleted_at IS NULL AND teacher_id = $2', [username, slugTeacherId]);
      } else continue;

      if (result.rows.length === 0) continue;

      const user  = result.rows[0];
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        recordFailure(attemptKey);
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
      }

      clearAttempts(attemptKey);

      // ── Student-specific: device limit enforcement ─────────────────────
      if (r === 'student') {
        // Block if account is already suspended
        if (user.is_suspended) {
          return res.status(403).json({
            error: 'تم إيقاف حسابك مؤقتاً بسبب تسجيل الدخول من أكثر من جهازين. يرجى التواصل مع المدرس لإعادة التفعيل.',
            account_suspended: true,
          });
        }

        // H-7 fix: device_id is mandatory for student logins.
        // Without this guard, API callers could omit device_id entirely and
        // bypass the device-limit check that protects account sharing.
        if (!device_id) {
          return res.status(400).json({
            error: 'device_id مطلوب — يرجى تسجيل الدخول من خلال تطبيق وثبة أو المتصفح الرسمي',
            code: 'DEVICE_ID_REQUIRED',
          });
        }

        // Track device
        if (device_id) {
          const ip         = getIp(req);
          const ua         = req.headers['user-agent'] || '';
          const deviceName = parseDeviceName(ua);

          // Use a transaction + SELECT FOR UPDATE to prevent race conditions
          // when two concurrent logins from different unknown devices happen
          // simultaneously (without the lock, both could slip under the limit).
          const client = await pool.connect();
          try {
            await client.query('BEGIN');

            // Lock the student row for the duration of the device check
            const lockRes = await client.query(
              'SELECT id, is_suspended FROM students WHERE id = $1 FOR UPDATE',
              [user.id]
            );
            // Re-check suspension inside the transaction (another concurrent
            // login might have just suspended this account)
            if (lockRes.rows[0]?.is_suspended) {
              await client.query('ROLLBACK');
              return res.status(403).json({
                error: 'تم إيقاف حسابك مؤقتاً بسبب تسجيل الدخول من أكثر من جهازين. يرجى التواصل مع المدرس لإعادة التفعيل.',
                account_suspended: true,
              });
            }

            // Get current registered devices (inside the lock)
            const devicesRes = await client.query(
              'SELECT device_id FROM student_devices WHERE student_id = $1',
              [user.id]
            );
            const knownIds = devicesRes.rows.map(d => d.device_id);
            const isKnown  = knownIds.includes(device_id);

            if (!isKnown) {
              if (knownIds.length >= 2) {
                // 3rd device → suspend account + create alert (no duplicate alerts)
                await client.query(
                  'UPDATE students SET is_suspended = true WHERE id = $1',
                  [user.id]
                );
                // Only create alert if there is no pending alert for this student
                // already (prevents duplicate alerts from race-condition remnants)
                await client.query(
                  `INSERT INTO device_alerts
                     (teacher_id, student_id, alert_type, device_id, device_name, ip_address, status)
                   SELECT $1,$2,'device_limit_exceeded',$3,$4,$5,'pending'
                   WHERE NOT EXISTS (
                     SELECT 1 FROM device_alerts
                     WHERE student_id=$2 AND status='pending'
                   )`,
                  [user.teacher_id, user.id, device_id, deviceName, ip]
                );
                await client.query('COMMIT');
                // Immediately block any cached session for this student
                const { invalidateStudentAuthCache } = require('../middleware/auth');
                invalidateStudentAuthCache(user.id);
                return res.status(403).json({
                  error: 'تم إيقاف حسابك بسبب محاولة تسجيل الدخول من جهاز ثالث. تم إشعار المدرس — يرجى التواصل معه لإعادة التفعيل.',
                  account_suspended: true,
                });
              }
              // New device, still within limit → register it
              await client.query(
                `INSERT INTO student_devices (student_id, device_id, device_name, user_agent, ip_address)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (student_id, device_id) DO UPDATE
                   SET last_seen = NOW(), device_name = $3`,
                [user.id, device_id, deviceName, ua, ip]
              );
            } else {
              // Known device → just update last_seen
              await client.query(
                'UPDATE student_devices SET last_seen = NOW() WHERE student_id = $1 AND device_id = $2',
                [user.id, device_id]
              );
            }

            await client.query('COMMIT');
          } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
          } finally {
            client.release();
          }
        }
      }
      // ──────────────────────────────────────────────────────────────────────

      const payload = { id: user.id, role: r, username: user.username, name: user.name };

      if (r === 'teacher') {
        payload.teacher_slug = user.slug || slugTeacherSlug;
      } else {
        payload.teacher_id = user.teacher_id;
        const teacherRes = await pool.query('SELECT slug FROM teachers WHERE id = $1', [user.teacher_id]);
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

    recordFailure(attemptKey);
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/auth/logout — revoke current token immediately ────────────────
router.post('/logout', authenticate, (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    const expiresAt = (req.user.exp || 0) * 1000 || Date.now() + 7 * 24 * 60 * 60 * 1000;
    blacklistToken(token, expiresAt);
  }
  res.json({ success: true });
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

    const user = result.rows[0];

    // Block suspended students on token refresh too
    if (role === 'student' && user.is_suspended) {
      return res.status(403).json({
        error: 'تم إيقاف حسابك مؤقتاً. يرجى التواصل مع المدرس لإعادة التفعيل.',
        account_suspended: true,
      });
    }

    const { password: _, plain_password: __, fcm_token: ___, ...safeUser } = user;

    if (role === 'teacher') safeUser.teacher_slug = safeUser.slug;

    res.json({ ...safeUser, role });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── H-8: POST /api/auth/sse-ticket ─────────────────────────────────────────
// Issues a one-time, 30-second SSE ticket so the full JWT never appears in the
// EventSource URL (which would leak it into server logs + browser history).
router.post('/sse-ticket', authenticate, (req, res) => {
  const ticket = crypto.randomBytes(20).toString('hex');
  _sseTickets.set(ticket, {
    user: req.user,
    expiresAt: Date.now() + 30_000,
  });
  res.json({ ticket });
});

// ── H-8: POST /api/auth/media-token ────────────────────────────────────────
// Issues a short-lived JWT (15 min) for /uploads/* access.
// The client stores this in memory (not localStorage) and appends it to
// upload URLs instead of the long-lived session JWT.
router.post('/media-token', authenticate, (req, res) => {
  const jwt = require('jsonwebtoken');
  const payload = {
    id:          req.user.id,
    role:        req.user.role,
    username:    req.user.username,
    name:        req.user.name,
    teacher_id:  req.user.teacher_id,
    teacher_slug: req.user.teacher_slug,
    media_only:  true,
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
  res.json({ token });
});

module.exports = router;
// Attach SSE ticket helper so index.js can consume tickets without
// a separate module (avoids circular-require via auth middleware).
module.exports.consumeSSETicket = consumeSSETicket;
