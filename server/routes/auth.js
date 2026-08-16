const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('../db/connection');
const { generateToken, authenticate, blacklistToken, invalidateStudentAuthCache, extractJti } = require('../middleware/auth');
const { logActivity, getIp } = require('../lib/activityLog');
const { pushSessionKicked, broadcastToTeacherAndAssistants } = require('../sse');

const router = express.Router();

// ── H-8: Short-lived SSE ticket store (one-time use, 30s TTL) ──────────────
const _sseTickets = new Map();
// Has .unref() so it does not prevent process exit
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

// ── Humanize Android model codes to user-friendly names ────────────────────
function humanizeModel(model) {
  if (!model) return '';
  const m = String(model).replace(/["']/g, '').trim();
  const upper = m.toUpperCase();

  // Samsung Galaxy Series
  if (/^SM-([A-Z0-9]+)/i.test(upper)) {
    if (/^SM-S92/i.test(upper)) return `Samsung Galaxy S24 (${m})`;
    if (/^SM-S91/i.test(upper)) return `Samsung Galaxy S23 (${m})`;
    if (/^SM-S90/i.test(upper)) return `Samsung Galaxy S22 (${m})`;
    if (/^SM-G99/i.test(upper)) return `Samsung Galaxy S21 (${m})`;
    if (/^SM-G98/i.test(upper)) return `Samsung Galaxy S20 (${m})`;
    if (/^SM-G97/i.test(upper)) return `Samsung Galaxy S10 (${m})`;
    if (/^SM-A55/i.test(upper)) return `Samsung Galaxy A55 (${m})`;
    if (/^SM-A54/i.test(upper)) return `Samsung Galaxy A54 (${m})`;
    if (/^SM-A53/i.test(upper)) return `Samsung Galaxy A53 (${m})`;
    if (/^SM-A52/i.test(upper)) return `Samsung Galaxy A52 (${m})`;
    if (/^SM-A51/i.test(upper)) return `Samsung Galaxy A51 (${m})`;
    if (/^SM-A50/i.test(upper)) return `Samsung Galaxy A50 (${m})`;
    if (/^SM-A35/i.test(upper)) return `Samsung Galaxy A35 (${m})`;
    if (/^SM-A34/i.test(upper)) return `Samsung Galaxy A34 (${m})`;
    if (/^SM-A33/i.test(upper)) return `Samsung Galaxy A33 (${m})`;
    if (/^SM-A32/i.test(upper)) return `Samsung Galaxy A32 (${m})`;
    if (/^SM-A31/i.test(upper)) return `Samsung Galaxy A31 (${m})`;
    if (/^SM-A30/i.test(upper)) return `Samsung Galaxy A30 (${m})`;
    if (/^SM-A25/i.test(upper)) return `Samsung Galaxy A25 (${m})`;
    if (/^SM-A24/i.test(upper)) return `Samsung Galaxy A24 (${m})`;
    if (/^SM-A23/i.test(upper)) return `Samsung Galaxy A23 (${m})`;
    if (/^SM-A22/i.test(upper)) return `Samsung Galaxy A22 (${m})`;
    if (/^SM-A21/i.test(upper)) return `Samsung Galaxy A21 (${m})`;
    if (/^SM-A20/i.test(upper)) return `Samsung Galaxy A20 (${m})`;
    if (/^SM-A15/i.test(upper)) return `Samsung Galaxy A15 (${m})`;
    if (/^SM-A14/i.test(upper)) return `Samsung Galaxy A14 (${m})`;
    if (/^SM-A13/i.test(upper)) return `Samsung Galaxy A13 (${m})`;
    if (/^SM-A12/i.test(upper)) return `Samsung Galaxy A12 (${m})`;
    if (/^SM-A11/i.test(upper)) return `Samsung Galaxy A11 (${m})`;
    if (/^SM-A10/i.test(upper)) return `Samsung Galaxy A10 (${m})`;
    if (/^SM-A05/i.test(upper)) return `Samsung Galaxy A05 (${m})`;
    if (/^SM-A04/i.test(upper)) return `Samsung Galaxy A04 (${m})`;
    if (/^SM-A03/i.test(upper)) return `Samsung Galaxy A03 (${m})`;
    if (/^SM-A/i.test(upper)) return `Samsung Galaxy A (${m})`;
    if (/^SM-M/i.test(upper)) return `Samsung Galaxy M (${m})`;
    if (/^SM-F/i.test(upper)) return `Samsung Galaxy Z (${m})`;
    if (/^SM-N/i.test(upper)) return `Samsung Galaxy Note (${m})`;
    if (/^SM-[TX]/i.test(upper)) return `Samsung Galaxy Tab (${m})`;
    return `Samsung (${m})`;
  }

  // Xiaomi / Redmi / POCO
  if (/^2[0-9]{3}[0-9A-Z]+/i.test(upper) || /^M2[0-9]+/i.test(upper) || /REDMI|XIAOMI|POCO/i.test(upper)) {
    if (/23129RAA4G|23124RA7EO/i.test(upper)) return `Redmi Note 13 (${m})`;
    if (/2312DRA50G/i.test(upper)) return `Redmi Note 13 Pro (${m})`;
    if (/23117RA68G/i.test(upper)) return `Redmi Note 13 Pro+ (${m})`;
    if (/22101316G|22101316UG/i.test(upper)) return `Redmi Note 12 (${m})`;
    if (/22101316UCP/i.test(upper)) return `Redmi Note 12 Pro (${m})`;
    if (/2201117TG|2201117TY/i.test(upper)) return `Redmi Note 11 (${m})`;
    if (/2201116SG/i.test(upper)) return `Redmi Note 11 Pro (${m})`;
    if (/2311DRK48G/i.test(upper)) return `POCO X6 Pro (${m})`;
    if (/23122PCD1G/i.test(upper)) return `POCO X6 (${m})`;
    if (/23049PCD8G/i.test(upper)) return `POCO F5 (${m})`;
    if (/23053RN02Y|23053RN02L/i.test(upper)) return `Redmi 12 (${m})`;
    if (/23108RN04Y/i.test(upper)) return `Redmi 13C (${m})`;
    if (/2404ARN45A/i.test(upper)) return `Redmi 13 (${m})`;
    if (/23028RN4BG|23028RNCAG/i.test(upper)) return `Redmi 12C (${m})`;
    if (/POCO/i.test(upper)) return `POCO (${m})`;
    if (/REDMI/i.test(upper)) return `Redmi (${m})`;
    return `Xiaomi (${m})`;
  }

  // Realme
  if (/^RMX[0-9]+/i.test(upper)) {
    if (/^RMX3636|^RMX3630/i.test(upper)) return `Realme 11 4G (${m})`;
    if (/^RMX3740|^RMX3741/i.test(upper)) return `Realme 11 5G (${m})`;
    if (/^RMX3771|^RMX3770/i.test(upper)) return `Realme 11 Pro 5G (${m})`;
    if (/^RMX3780/i.test(upper)) return `Realme 11 Pro+ 5G (${m})`;
    if (/^RMX3840|^RMX3841/i.test(upper)) return `Realme 12 Pro+ 5G (${m})`;
    if (/^RMX3842/i.test(upper)) return `Realme 12 Pro 5G (${m})`;
    if (/^RMX3890/i.test(upper)) return `Realme 12+ / C65 (${m})`;
    if (/^RMX3830/i.test(upper)) return `Realme C67 (${m})`;
    if (/^RMX3760|^RMX3761/i.test(upper)) return `Realme C53 (${m})`;
    if (/^RMX3710/i.test(upper)) return `Realme C55 (${m})`;
    if (/^RMX3511/i.test(upper)) return `Realme C35 (${m})`;
    if (/^RMX3261|^RMX3263/i.test(upper)) return `Realme C21Y (${m})`;
    if (/^RMX3612|^RMX3611/i.test(upper)) return `Realme 10 Pro (${m})`;
    if (/^RMX3363|^RMX3360/i.test(upper)) return `Realme GT Master (${m})`;
    if (/^RMX3392|^RMX3393/i.test(upper)) return `Realme 9 Pro+ (${m})`;
    if (/^RMX3085|^RMX3081/i.test(upper)) return `Realme 8 / 8 Pro (${m})`;
    return `Realme (${m})`;
  }

  // Oppo
  if (/^CPH[0-9]+/i.test(upper)) {
    if (/^CPH2579/i.test(upper)) return `Oppo Reno 11 5G (${m})`;
    if (/^CPH2607/i.test(upper)) return `Oppo Reno 11F 5G (${m})`;
    if (/^CPH2525|^CPH2527/i.test(upper)) return `Oppo Reno 10 5G (${m})`;
    if (/^CPH2523/i.test(upper)) return `Oppo Reno 10 Pro+ (${m})`;
    if (/^CPH2457/i.test(upper)) return `Oppo Reno 8T 5G (${m})`;
    if (/^CPH2481/i.test(upper)) return `Oppo Reno 8T 4G (${m})`;
    if (/^CPH2359/i.test(upper)) return `Oppo Reno 8 5G (${m})`;
    if (/^CPH2371/i.test(upper)) return `Oppo Reno 7 5G (${m})`;
    if (/^CPH2569/i.test(upper)) return `Oppo A79 5G (${m})`;
    if (/^CPH2577/i.test(upper)) return `Oppo A58 (${m})`;
    if (/^CPH2565/i.test(upper)) return `Oppo A38 (${m})`;
    if (/^CPH2477/i.test(upper)) return `Oppo A78 (${m})`;
    if (/^CPH2387/i.test(upper)) return `Oppo A57 (${m})`;
    if (/^CPH2269/i.test(upper)) return `Oppo A16 (${m})`;
    if (/^CPH2185/i.test(upper)) return `Oppo A15 (${m})`;
    return `Oppo (${m})`;
  }

  // OnePlus
  if (/^NE[0-9]+|^KB[0-9]+|^IN[0-9]+|^GM[0-9]+/i.test(upper)) {
    return `OnePlus (${m})`;
  }

  // Infinix
  if (/^X[0-9]{3,}/i.test(upper)) {
    if (/^X6837/i.test(upper)) return `Infinix Hot 40 Pro (${m})`;
    if (/^X6836/i.test(upper)) return `Infinix Hot 40 (${m})`;
    if (/^X6831/i.test(upper)) return `Infinix Hot 30 (${m})`;
    if (/^X6850/i.test(upper)) return `Infinix Note 40 Pro (${m})`;
    if (/^X6711/i.test(upper)) return `Infinix Note 30 (${m})`;
    if (/^X6525/i.test(upper)) return `Infinix Smart 8 (${m})`;
    if (/^X6515/i.test(upper)) return `Infinix Smart 7 (${m})`;
    return `Infinix (${m})`;
  }

  // Tecno
  if (/^[A-Z]{2}[0-9]+/i.test(upper) && !/^SM-/i.test(upper)) {
    if (/^KJ6/i.test(upper)) return `Tecno Spark 20 (${m})`;
    if (/^KJ5/i.test(upper)) return `Tecno Spark 20C (${m})`;
    if (/^KL7/i.test(upper)) return `Tecno Camon 30 (${m})`;
    if (/^CK6/i.test(upper)) return `Tecno Camon 20 (${m})`;
    return `Tecno (${m})`;
  }

  // Vivo
  if (/^V[0-9]{4}/i.test(upper)) return `Vivo (${m})`;

  // Huawei / Honor
  if (/^ALN|^VOG|^HMA|^CLT|^ELS|^ANA|^NOH|^JAD/i.test(upper)) return `Huawei (${m})`;
  if (/^LGE|^ELT|^ANY/i.test(upper)) return `Honor (${m})`;

  // Google Pixel
  if (/PIXEL/i.test(upper)) return m;

  return m;
}

// ── Parse a readable device name with high precision ───────────────────────
function parseDeviceName(userAgent, clientProvidedName, headers = {}) {
  // If the client provided a detailed, sanitized device name, clean and use it!
  if (clientProvidedName && typeof clientProvidedName === 'string') {
    const clean = clientProvidedName
      .replace(/<[^>]*>?/gm, '') // Strip HTML tags to prevent XSS
      .replace(/[\x00-\x1F\x7F]/g, '') // Strip control characters
      .replace(/["'`<>]/g, '') // Strip quotes and angle brackets
      .trim();
    if (clean.length >= 3 && clean.length <= 250) {
      return clean;
    }
  }

  if (!userAgent && !headers['sec-ch-ua-platform']) return 'جهاز غير معروف';
  const ua = userAgent || '';

  let os = 'غير معروف';
  let browser = 'متصفح';
  let model = '';

  // 1. Check Client Hints headers if sent by browser
  const chPlatform = headers['sec-ch-ua-platform'] ? String(headers['sec-ch-ua-platform']).replace(/["']/g, '') : '';
  const chPlatformVersion = headers['sec-ch-ua-platform-version'] ? String(headers['sec-ch-ua-platform-version']).replace(/["']/g, '') : '';
  const chModel = headers['sec-ch-ua-model'] ? String(headers['sec-ch-ua-model']).replace(/["']/g, '') : '';
  const chMobile = headers['sec-ch-ua-mobile'] === '?1';

  // 2. Resolve OS
  if (/Android/i.test(ua) || chPlatform.toLowerCase() === 'android') {
    let androidVer = '';
    if (chPlatformVersion) {
      const major = parseInt(chPlatformVersion.split('.')[0], 10);
      if (!isNaN(major) && major > 0) androidVer = `${major}`;
    }
    if (!androidVer) {
      const m = ua.match(/Android ([0-9.]+)/i);
      androidVer = m ? m[1] : '';
    }
    os = androidVer ? `Android ${androidVer}` : 'Android';
  } else if (/iPhone/i.test(ua)) {
    const m = ua.match(/OS ([0-9_]+)/i);
    os = m ? `iOS ${m[1].replace(/_/g, '.')}` : 'iPhone';
  } else if (/iPad/i.test(ua)) {
    const m = ua.match(/OS ([0-9_]+)/i);
    os = m ? `iPadOS ${m[1].replace(/_/g, '.')}` : 'iPad';
  } else if (/Mac OS/i.test(ua) || chPlatform.toLowerCase() === 'macos') {
    os = 'macOS';
  } else if (/Windows NT 10/i.test(ua) || (chPlatform.toLowerCase() === 'windows' && chPlatformVersion)) {
    if (chPlatformVersion) {
      const major = parseInt(chPlatformVersion.split('.')[0], 10);
      os = (!isNaN(major) && major >= 13) ? 'Windows 11' : 'Windows 10';
    } else {
      os = 'Windows 10/11';
    }
  } else if (/Windows NT 6\.3/i.test(ua)) {
    os = 'Windows 8.1';
  } else if (/Windows/i.test(ua)) {
    os = 'Windows';
  } else if (/Linux/i.test(ua) || chPlatform.toLowerCase() === 'linux') {
    // If mobile hint or Android indicators present, mark as mobile desktop mode
    if (chMobile || /Mobile|Phone|Tablet/i.test(ua)) {
      os = 'Android (وضع كمبيوتر)';
    } else {
      os = 'Linux';
    }
  }

  // 3. Resolve Model
  if (chModel) {
    model = humanizeModel(chModel);
  } else {
    const m = ua.match(/;\s*([A-Za-z0-9\-\s_]+)\s+Build\//i);
    if (m && m[1] && !/Linux|Android/i.test(m[1])) {
      model = humanizeModel(m[1].trim());
    }
  }

  // 4. Resolve Browser
  if (/SamsungBrowser\/([0-9.]+)/i.test(ua))   browser = 'Samsung Internet';
  else if (/MiuiBrowser\/([0-9.]+)/i.test(ua)) browser = 'Mi Browser';
  else if (/Edg\/|EdgA\/|EdgiOS\//i.test(ua))  browser = 'Edge';
  else if (/OPR\/|OPT\/|Opera/i.test(ua))      browser = 'Opera';
  else if (/WhatsApp\//i.test(ua))             browser = 'WhatsApp';
  else if (/FB_IAB|FBAN|FBAV|Instagram/i.test(ua)) browser = 'Facebook/Instagram';
  else if (/Firefox\/|FxiOS\//i.test(ua))      browser = 'Firefox';
  else if (/Chrome\/|CriOS\//i.test(ua))       browser = 'Chrome';
  else if (/Safari\//i.test(ua))               browser = 'Safari';

  const parts = [];
  if (model) parts.push(model);
  parts.push(os);
  parts.push(browser);

  return parts.join(' — ');
}

// ── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  // Instruct browsers to send high-entropy client hints on future requests
  res.setHeader('Accept-CH', 'Sec-CH-UA-Model, Sec-CH-UA-Platform-Version, Sec-CH-UA-Full-Version-List, Sec-CH-UA-Mobile');

  const { username, password, role, device_id, device_origin, device_name } = req.body;
  // [H-3] Mutable session-wide flag set inside the student device-check
  // transaction. The Login page uses it to decide whether to show the
  // DeviceWarningModal ("first time on this device") — so the warning is
  // only surfaced when it is actually new, not on every successful login.
  const loginMeta = { is_new_device: false };

  console.log(`[LOGIN] attempt: user="${username}" role="${role || 'auto'}" device_id="${device_id ? device_id.slice(0,12)+'...' : 'MISSING'}" device_name="${device_name || 'AUTO'}" tenant_id="${req.tenantTeacherId || 'none'}"`);

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
    console.log(`[LOGIN] rejected: tenant slug attempted but not resolved`);
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
      console.log(`[LOGIN] checking role="${r}" for user="${username}"`);
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
        if (!slugTeacherId) { console.log(`[LOGIN] student skip: no tenant`); continue; }
        // R-4 OPT: explicit columns instead of SELECT * — avoids pulling large JSONB/array
        // fields on every login. Includes all fields the auth flow + safeUser response needs.
        result = await pool.query(
          `SELECT id, username, password, name, phone, parent_phone, academic_stage,
                  gender, points, teacher_id, is_suspended,
                  created_at, fcm_token
           FROM students
           WHERE username = $1 AND deleted_at IS NULL AND teacher_id = $2`,
          [username, slugTeacherId]
        );
      } else continue;

      console.log(`[LOGIN] role="${r}" found=${result.rows.length} rows`);
      if (result.rows.length === 0) continue;

      const user  = result.rows[0];
      console.log(`[LOGIN] verifying password for user id=${user.id} role="${r}"`);
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        console.log(`[LOGIN] password mismatch for user id=${user.id}`);
        recordFailure(attemptKey);
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
      }

      clearAttempts(attemptKey);
      console.log(`[LOGIN] password OK for user id=${user.id} role="${r}"`);

      // ── Student-specific: device limit enforcement ─────────────────────
      if (r === 'student') {
        console.log(`[LOGIN] student device check: is_suspended=${user.is_suspended} device_id="${device_id ? device_id.slice(0,12)+'...' : 'MISSING'}"`);

        // Block if account is manually suspended by teacher
        if (user.is_suspended) {
          console.log(`[LOGIN] student id=${user.id} is suspended`);
          return res.status(403).json({
            error: 'تم إيقاف حسابك مؤقتاً من قِبل المدرس. يرجى التواصل معه لإعادة التفعيل.',
            account_suspended: true,
          });
        }

        // H-7 fix: device_id is mandatory for student logins.
        // Without this guard, API callers could omit device_id entirely and
        // bypass the device-limit check that protects account sharing.
        if (!device_id) {
          console.log(`[LOGIN] student id=${user.id} missing device_id`);
          return res.status(400).json({
            error: 'device_id مطلوب — يرجى تسجيل الدخول من خلال تطبيق وثبة أو المتصفح الرسمي',
            code: 'DEVICE_ID_REQUIRED',
          });
        }

        // Track device
        if (device_id) {
          const ip         = getIp(req);
          const ua         = req.headers['user-agent'] || '';
          const deviceName = parseDeviceName(ua, device_name, req.headers);

          console.log(`[LOGIN] acquiring DB connection for device transaction... (device: "${deviceName}")`);
          // Use a transaction + SELECT FOR UPDATE to prevent race conditions
          // when two concurrent logins from different unknown devices happen
          // simultaneously (without the lock, both could slip under the limit).
          const client = await pool.connect();
          console.log(`[LOGIN] DB connection acquired, starting transaction`);
          try {
            await client.query('BEGIN');

            // Lock the student row for the duration of the device check
            const lockRes = await client.query(
              'SELECT id, is_suspended FROM students WHERE id = $1 FOR UPDATE',
              [user.id]
            );
            console.log(`[LOGIN] lock acquired for student id=${user.id}`);

            // Re-check suspension inside the transaction (manual suspension by teacher)
            if (lockRes.rows[0]?.is_suspended) {
              await client.query('ROLLBACK');
              return res.status(403).json({
                error: 'تم إيقاف حسابك مؤقتاً من قِبل المدرس. يرجى التواصل معه لإعادة التفعيل.',
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
            console.log(`[LOGIN] student id=${user.id} known_devices=${knownIds.length} is_known=${isKnown}`);

            if (!isKnown) {
              // 1-device policy (matches the warning shown at login:
              // "حسابك مسجّل على جهاز واحد فقط").
              // If a device slot is already taken and this is a brand-new
              // device_id, block immediately, alert the teacher, AND
              // increment the failure counter. After 3 blocked attempts the
              // account is auto-suspended and the teacher is notified. This
              // makes the security warning deterministic rather than
              // dependent on the teacher manually checking the dashboard.
              if (knownIds.length >= 1) {
                console.log(`[LOGIN] NEW_DEVICE_BLOCKED for student id=${user.id}: inserting device_alert`);
                // 2nd (new) device → alert teacher; do NOT suspend on the first hit.
                // [BUG FIX] Split INSERT...SELECT...WHERE NOT EXISTS into two separate
                // queries to avoid "inconsistent types deduced for parameter $3" error
                // that occurs when the same placeholder is used in both the SELECT list
                // and the WHERE subquery in a single parameterized statement.
                const alertExists = await client.query(
                  `SELECT 1 FROM device_alerts
                   WHERE student_id = $1 AND device_id = $2 AND status = 'pending'`,
                  [user.id, device_id]
                );
                if (alertExists.rows.length === 0) {
                  await client.query(
                    `INSERT INTO device_alerts
                       (teacher_id, student_id, alert_type, device_id, device_name, ip_address, status)
                     VALUES ($1, $2, 'device_limit_exceeded', $3, $4, $5, 'pending')`,
                    [user.teacher_id, user.id, device_id, deviceName, ip]
                  );
                  console.log(`[LOGIN] device_alert inserted for student id=${user.id}`);
                } else {
                  console.log(`[LOGIN] device_alert already exists for student id=${user.id}, skipping insert`);
                }

                // [H-2] Increment the failure counter so that a student cannot
                // keep trying new devices forever. After 3 blocked attempts
                // the account is auto-suspended (handled below).
                const counterRes = await client.query(
                  `UPDATE students
                     SET failed_device_attempts = COALESCE(failed_device_attempts, 0) + 1
                   WHERE id = $1
                   RETURNING failed_device_attempts`,
                  [user.id]
                );
                const attemptCount = counterRes.rows[0]?.failed_device_attempts || 0;
                console.log(`[LOGIN] student id=${user.id} failed_device_attempts=${attemptCount}`);

                let autoSuspended = false;
                if (attemptCount >= 3) {
                  // Auto-suspend + flush auth cache so subsequent requests fail.
                  await client.query(
                    'UPDATE students SET is_suspended = true WHERE id = $1',
                    [user.id]
                  );
                  await client.query(
                    `INSERT INTO device_alerts
                       (teacher_id, student_id, alert_type, device_id, device_name, ip_address, status)
                     VALUES ($1, $2, 'auto_suspended', $3, $4, $5, 'pending')`,
                    [user.teacher_id, user.id, device_id, deviceName, ip]
                  );
                  autoSuspended = true;
                  console.log(`[LOGIN] AUTO-SUSPENDED student id=${user.id} after ${attemptCount} blocked attempts`);
                  invalidateStudentAuthCache(user.id);
                }

                await client.query('COMMIT');
                console.log(`[LOGIN] NEW_DEVICE_BLOCKED committed for student id=${user.id}`);

                // Real-time instant notification via SSE to teacher and assistants
                setImmediate(() => {
                  broadcastToTeacherAndAssistants(pool, user.teacher_id, 'device_alert', {
                    student_id: user.id,
                    student_name: user.name,
                    student_username: user.username,
                    device_name: deviceName,
                    ip_address: ip,
                    alert_type: autoSuspended ? 'auto_suspended' : 'device_limit_exceeded',
                    created_at: new Date().toISOString(),
                  }).catch(e => console.error('[SSE] device_alert broadcast error:', e.message));
                });

                return res.status(403).json({
                  error: autoSuspended
                    ? 'تم رصد محاولات متكررة من أجهزة مختلفة. تم إيقاف حسابك تلقائياً — يرجى التواصل مع المدرس لإعادة التفعيل.'
                    : 'تم رصد محاولة دخول من جهاز جديد. تم إشعار المدرس — يمكنك الاستمرار من جهازك الأصلي، أو تواصل مع المدرس للسماح لك بتسجيل جهاز جديد.',
                  code: autoSuspended ? 'STUDENT_AUTO_SUSPENDED' : 'NEW_DEVICE_BLOCKED',
                  failed_device_attempts: attemptCount,
                  auto_suspended: autoSuspended,
                });
              }
              // No registered device yet → register this one as the primary device
              console.log(`[LOGIN] registering first device for student id=${user.id}`);
              // [H-4] device_origin is informational only — never used as a
              // dedup key for the 1-device quota. Same phone in Chrome and as
              // a PWA still counts as ONE device.
              const safeOrigin = ['browser','pwa_ios','pwa_android','twa','unknown'].includes(device_origin)
                ? device_origin : 'browser';
              await client.query(
                `INSERT INTO student_devices (student_id, device_id, device_name, user_agent, ip_address, device_origin)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (student_id, device_id) DO UPDATE
                   SET last_seen = NOW(),
                       device_name = EXCLUDED.device_name,
                       device_origin = EXCLUDED.device_origin,
                       ip_address = EXCLUDED.ip_address,
                       user_agent = EXCLUDED.user_agent`,
                [user.id, device_id, deviceName, ua, ip, safeOrigin]
              );
              // [H-2] First-time registration wipes the failure counter.
              await client.query(
                'UPDATE students SET failed_device_attempts = 0 WHERE id = $1',
                [user.id]
              );
              // [H-3] Surface "first time on this device" only when at least one
              // device slot was previously empty. If the student replaces an
              // existing registration we keep the warning since they explicitly
              // lost the previous slot.
              loginMeta.is_new_device = true;
            } else {
              // Known device → update last_seen, device_name, ip_address, and device_origin
              // so existing devices automatically upgrade to richer names, and reset the failure counter.
              console.log(`[LOGIN] known device — updating last_seen and device_name for student id=${user.id}`);
              const safeOrigin = ['browser','pwa_ios','pwa_android','twa','unknown'].includes(device_origin)
                ? device_origin : 'browser';
              await client.query(
                `UPDATE student_devices
                    SET last_seen = NOW(),
                        device_origin = $3,
                        device_name = COALESCE(NULLIF($4, ''), device_name),
                        ip_address = $5,
                        user_agent = $6
                  WHERE student_id = $1 AND device_id = $2`,
                [user.id, device_id, safeOrigin, deviceName, ip, ua]
              );
              await client.query(
                'UPDATE students SET failed_device_attempts = 0 WHERE id = $1',
                [user.id]
              );
            }

            // [Phase 2] Enforce single-active-session policy. Any prior active session
            // must be marked kicked so the student is only ever logged in on one session at a time.
            const otherSessions = await client.query(
              `SELECT id, jti, last_active_at
                 FROM student_active_sessions
                WHERE student_id = $1
                  AND kicked_at IS NULL`,
              [user.id]
            );
            let recentlyActiveCount = 0;
            for (const sess of otherSessions.rows) {
              await client.query(
                `UPDATE student_active_sessions
                    SET kicked_at = NOW(),
                        kicked_reason = 'new_login_replaced_session'
                  WHERE id = $1`,
                [sess.id]
              );
              if (sess.last_active_at && (Date.now() - new Date(sess.last_active_at).getTime() < 10 * 60 * 1000)) {
                recentlyActiveCount++;
              }
              console.log(`[LOGIN] KICKED prior session jti=${sess.jti.slice(0,8)}... for student id=${user.id}`);
            }
            if (recentlyActiveCount > 0) {
              // Push the SSE force_logout event so any live tab signs out instantly
              setImmediate(() => pushSessionKicked(
                user.id,
                'new_login_replaced_session',
                'تم تسجيل الدخول من جهاز آخر — تم إنهاء هذه الجلسة.'
              ));
            }

            await client.query('COMMIT');
            console.log(`[LOGIN] device transaction committed for student id=${user.id}`);
          } catch (txErr) {
            console.error(`[LOGIN] TRANSACTION ERROR for student id=${user.id}:`, txErr.message, txErr.stack);
            await client.query('ROLLBACK');
            throw txErr;
          } finally {
            client.release();
            console.log(`[LOGIN] DB connection released for student id=${user.id}`);
          }
        }
      }
      // ──────────────────────────────────────────────────────────────────────

      console.log(`[LOGIN] building JWT payload for user id=${user.id} role="${r}"`);
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

      if (r === 'student') {
        const jti = extractJti(token);
        if (jti) {
          const ip = getIp(req);
          const ua = req.headers['user-agent'] || '';
          const safeOrigin = ['browser','pwa_ios','pwa_android','twa','unknown'].includes(device_origin)
            ? device_origin : 'browser';
          await pool.query(
            `INSERT INTO student_active_sessions
               (student_id, jti, device_id, device_origin, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (jti) DO UPDATE
               SET last_active_at = NOW(),
                   device_origin  = EXCLUDED.device_origin,
                   device_id      = EXCLUDED.device_id`,
            [user.id, jti, device_id || null, safeOrigin, ip, ua]
          );
          console.log(`[LOGIN] student id=${user.id} active_session registered jti=${jti.slice(0,8)}...`);
        }
      }

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
      } else if (r === 'student') {
        logActivity({
          teacherId: user.teacher_id,
          actor: { type: 'student', id: user.id, name: user.name || user.username },
          ip: getIp(req),
          action: 'login_student',
          entity: { type: 'student', id: user.id, name: user.name || user.username },
          details: device_id ? { device_id: device_id.slice(0, 16) + '...' } : null,
        });
      }

      // [M-16] FIX: Include force_password_change flag so the frontend can redirect
      // the teacher to change their default seed password on first login.
      const forceChange = r === 'teacher' ? (user.force_password_change === true) : false;

      console.log(`[LOGIN] SUCCESS user id=${user.id} role="${r}"`);
      return res.json({
        token,
        user: { ...safeUser, role: r, teacher_slug: payload.teacher_slug },
        force_password_change: forceChange,
        // [H-3] Only true when the student logged in from a previously-unregistered
        // device. Drives whether the Login page shows the orange DeviceWarningModal.
        is_new_device: loginMeta.is_new_device,
      });
    }

    console.log(`[LOGIN] no matching user found for username="${username}"`);
    recordFailure(attemptKey);
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  } catch (err) {
    console.error(`[LOGIN] UNHANDLED ERROR for username="${username}":`, err.message);
    console.error(`[LOGIN] Stack:`, err.stack);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', authenticate, (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    const expiresAt = (req.user.exp || 0) * 1000 || Date.now() + 7 * 24 * 60 * 60 * 1000;
    blacklistToken(token, expiresAt);
  }
  // [Phase 2] Mark the live session row as voluntarily ended so it doesn't
  // count against the student's "active device" tally.
  if (req.user?.role === 'student' && req.user?.jti) {
    pool.query(
      `UPDATE student_active_sessions
          SET kicked_at = NOW(),
              kicked_reason = 'student_logout'
        WHERE jti = $1 AND kicked_at IS NULL`,
      [req.user.jti]
    ).catch((e) => console.warn('[LOGOUT] failed to mark session kicked:', e.message));
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

// ── [L-3] POST /api/auth/refresh — sliding-window token rotation ────────────
// Re-issues a fresh 7-day token and immediately blacklists the old one.
// The client should call this when the stored token is within 24 h of expiry.
// This approach limits the stolen-token validity window from up to 7 days to
// at most the refresh interval the legitimate user uses (typically < 1 day).
router.post('/refresh', authenticate, (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const now   = Math.floor(Date.now() / 1000);
  const exp   = req.user.exp || 0;
  const ttlLeft = exp - now; // seconds remaining

  // Only rotate if token will expire within 24 hours (86 400 s).
  // Returns refreshed:false for tokens with plenty of time left so the client
  // can call this endpoint proactively without flooding the blacklist.
  if (ttlLeft > 86_400) {
    return res.json({ refreshed: false, expires_in: ttlLeft });
  }

  // Blacklist the old token (fire-and-forget DB write)
  if (token) {
    blacklistToken(token, exp * 1000);
  }

  // Strip JWT-internal fields before re-signing
  const { jti: _jti, iat: _iat, exp: _exp, ...payload } = req.user;
  const newToken = generateToken(payload);

  if (req.user.role === 'student' && req.user.jti) {
    const newJti = extractJti(newToken);
    if (newJti) {
      pool.query(
        `UPDATE student_active_sessions
            SET jti = $1, last_active_at = NOW()
          WHERE jti = $2 AND kicked_at IS NULL`,
        [newJti, req.user.jti]
      ).catch((e) => console.warn('[REFRESH] failed to update active session jti:', e.message));
    }
  }

  res.json({ refreshed: true, token: newToken, expires_in: 7 * 24 * 3600 });
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
