require('dotenv').config();
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const pool = require('./db/connection');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { addClient, removeClient } = require('./sse');
const { startScheduler } = require('./scheduler');
const { initFCM } = require('./lib/fcm');
const subdomainTenant = require('./middleware/subdomainTenant');
const { verifyFullToken, authenticate, requireRole } = require('./middleware/auth');
const { consumeSSETicket } = require('./routes/auth');

// Global unhandled rejection / uncaught exception guards
process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

const app = express();
app.set('trust proxy', 1);
app.use(compression({ threshold: 1024 }));

// [M-13] FIX: Enable a real CSP in production. In development (Vite HMR, eval)
// we still disable it — but in production the built bundle uses no unsafe constructs.
const isProd = process.env.NODE_ENV === 'production';
app.use(helmet({
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'", 'https://www.gstatic.com',
                       'https://www.youtube.com', 'https://s.ytimg.com',
                       'https://static.cloudflareinsights.com'],
      styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:        ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc:         ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc:     ["'self'", 'wss:', 'ws:', 'https:'],
      mediaSrc:       ["'self'", 'blob:', 'https:'],
      // YouTube embedded player iframes load from www.youtube.com and
      // www.youtube-nocookie.com; both must be whitelisted in frame-src.
      frameSrc:       ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com'],
      objectSrc:      ["'none'"],
      upgradeInsecureRequests: [],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
}));
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : null;

// Wildcard subdomain matcher — allows *.wathba.site in addition to explicit origins
const WILDCARD_DOMAIN = process.env.WILDCARD_DOMAIN || null; // e.g. "wathba.site"

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (origin, cb) => {
        if (!origin) return cb(null, true); // same-origin / server-to-server
        // Check explicit list
        if (allowedOrigins?.length && allowedOrigins.includes(origin)) return cb(null, true);
        // Check wildcard domain  e.g. https://mr-ahmed.wathba.site
        if (WILDCARD_DOMAIN) {
          try {
            const host = new URL(origin).hostname;
            if (host === WILDCARD_DOMAIN || host.endsWith(`.${WILDCARD_DOMAIN}`)) {
              return cb(null, true);
            }
          } catch (_) {}
        }
        return cb(new Error('Not allowed by CORS'));
      }
    : true,
  credentials: true,
}));
app.use((req, res, next) => {
  if (req.is('multipart/form-data')) return next();
  // Import route may carry large JSON backups — allow up to 20 MB
  const limit = req.path === '/api/teachers/import' ? '20mb' : '5mb';
  express.json({ limit })(req, res, next);
});

// ── General API rate limiter (120 req/min per IP) ──────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'طلبات كثيرة جداً، حاول مرة أخرى بعد دقيقة' },
  // Skip rate-limiting for local test runner (localhost / 127.0.0.1 / ::1)
  skip: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  },
});
app.use('/api/', apiLimiter);

// ── [X3 fix] Protected uploads rate limiter (120 req/min per IP) ──────────
// The /api/ limiter above does NOT cover /uploads/* paths.  Without this, a
// valid-token attacker can hammer e.g. /uploads/pdfs/secret.pdf with a
// non-enrolled student token at unlimited speed — every request triggers a
// fresh DB query because denied results are intentionally not cached (S-2 fix).
// The skip logic mirrors apiLimiter so the test-runner is never throttled.
const uploadsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.UPLOADS_RATE_LIMIT || '600', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too Many Requests',
  skip: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  },
});

// ── [C-1 + C-2] Protected upload directories ─────────────────
//
// File-access cache — prevents N+1 DB queries for video range requests.
// Key: `${role}_${userId}:${fullPath}`, Value: { allowed: bool, at: ts }
const _fileAccessCache = new Map();
const FILE_ACCESS_TTL_MS = 5 * 60_000;
const FILE_ACCESS_MAX_SIZE = 20_000;
setInterval(() => {
  const cutoff = Date.now() - FILE_ACCESS_TTL_MS * 10;
  for (const [k, v] of _fileAccessCache.entries()) {
    if (v.at < cutoff) _fileAccessCache.delete(k);
  }
  if (_fileAccessCache.size > FILE_ACCESS_MAX_SIZE) {
    const sorted = [..._fileAccessCache.entries()].sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
    for (const [k] of sorted.slice(0, sorted.length - FILE_ACCESS_MAX_SIZE)) {
      _fileAccessCache.delete(k);
    }
  }
}, 5 * 60_000).unref();

/**
 * [C-1] Check ownership / enrollment for a protected file.
 * Returns true  → allow, false → 403 Forbidden,
 *         null  → file not registered in DB (pass through; static → 404).
 */
const checkFileAccess = async (decoded, fileType, fullPath) => {
  // [S-3 fix] include teacher_id in cache key for assistants.
  // Without this, two assistant tokens with the same id but different teacher_id
  // values would share a cache entry, allowing cross-teacher access after a cache hit.
  const cacheKey = decoded.role === 'assistant'
    ? `assistant_${decoded.id}_${decoded.teacher_id ?? 'none'}:${fullPath}`
    : `${decoded.role}_${decoded.id}:${fullPath}`;
  const cached = _fileAccessCache.get(cacheKey);
  if (cached && Date.now() - cached.at < FILE_ACCESS_TTL_MS) return cached.allowed;

  let hasAccess = false;
  try {
    if (fileType === 'video') {
      const r = await pool.query(
        `SELECT v.course_id, c.teacher_id, c.is_published
           FROM videos v
           JOIN courses c ON v.course_id = c.id
          WHERE v.file_path_or_url = $1
          LIMIT 1`,
        [fullPath]
      );
      if (!r.rows.length) return null;
      const { course_id, teacher_id, is_published } = r.rows[0];
      if (decoded.role === 'teacher') {
        hasAccess = decoded.id === teacher_id;
      } else if (decoded.role === 'assistant') {
        hasAccess = decoded.teacher_id === teacher_id;
      } else if (decoded.role === 'student' && is_published) {
        // [S-1 fix] also require student is not suspended
        const e = await pool.query(
          `SELECT 1
             FROM student_course_enrollment sce
             JOIN students s ON s.id = sce.student_id
            WHERE sce.student_id=$1 AND sce.course_id=$2
              AND sce.status='active' AND s.is_suspended = false`,
          [decoded.id, course_id]
        );
        hasAccess = e.rows.length > 0;
      }

    } else if (fileType === 'pdf') {
      const r = await pool.query(
        `SELECT p.course_id, c.teacher_id, c.is_published
           FROM pdf_files p
           JOIN courses c ON p.course_id = c.id
          WHERE p.file_url = $1
          LIMIT 1`,
        [fullPath]
      );
      if (!r.rows.length) return null;
      const { course_id, teacher_id, is_published } = r.rows[0];
      if (decoded.role === 'teacher') {
        hasAccess = decoded.id === teacher_id;
      } else if (decoded.role === 'assistant') {
        hasAccess = decoded.teacher_id === teacher_id;
      } else if (decoded.role === 'student' && is_published) {
        // [S-1 fix] also require student is not suspended
        const e = await pool.query(
          `SELECT 1
             FROM student_course_enrollment sce
             JOIN students s ON s.id = sce.student_id
            WHERE sce.student_id=$1 AND sce.course_id=$2
              AND sce.status='active' AND s.is_suspended = false`,
          [decoded.id, course_id]
        );
        hasAccess = e.rows.length > 0;
      }

    } else if (fileType === 'question-image') {
      // First look in questions table (regular exam questions + group context images).
      // [X12/X13 fix] LEFT JOIN courses so we can also check courses.is_published.
      // COALESCE(c.is_published, TRUE) returns TRUE for standalone exams (no
      // course_id → no JOIN match) so the standalone branch is not broken.
      const rq = await pool.query(
        `SELECT e.id AS exam_id, e.teacher_id, e.course_id,
                e.is_published                  AS exam_published,
                COALESCE(c.is_published, TRUE)  AS course_published
           FROM questions q
           JOIN exams e ON q.exam_id = e.id
           LEFT JOIN courses c ON e.course_id = c.id
          WHERE q.question_image_url = $1
          LIMIT 1`,
        [fullPath]
      );

      let examId = null, teacherId = null, courseId = null;
      let isPublished = false, coursePublished = true;

      if (rq.rows.length) {
        examId          = rq.rows[0].exam_id;
        teacherId       = rq.rows[0].teacher_id;
        courseId        = rq.rows[0].course_id;         // null for standalone exams
        isPublished     = rq.rows[0].exam_published;
        coursePublished = rq.rows[0].course_published;  // TRUE for standalone via COALESCE
      } else {
        // Fall back to bank_questions (question bank images)
        const rb = await pool.query(
          `SELECT qb.teacher_id, qb.id AS bank_id
             FROM bank_questions bq
             JOIN question_banks qb ON bq.bank_id = qb.id
            WHERE bq.question_image_url = $1
            LIMIT 1`,
          [fullPath]
        );
        if (rb.rows.length) {
          teacherId = rb.rows[0].teacher_id;
          const bankId = rb.rows[0].bank_id;

          // For student access: find any published exam that uses this bank.
          // [X13 fix] Also join courses to capture courses.is_published.
          if (decoded.role === 'student') {
            const re = await pool.query(
              `SELECT e.id, e.course_id,
                      e.is_published                  AS exam_published,
                      COALESCE(c.is_published, TRUE)  AS course_published
                 FROM exams e
                 LEFT JOIN courses c ON e.course_id = c.id
                WHERE e.bank_id = $1 AND e.is_published = true
                LIMIT 1`,
              [bankId]
            );
            if (re.rows.length) {
              examId          = re.rows[0].id;
              courseId        = re.rows[0].course_id;
              isPublished     = re.rows[0].exam_published;
              coursePublished = re.rows[0].course_published;
            }
          }
        } else {
          // Final fallback: recitation_questions (recitation question images).
          // These are not linked to exams so we grant access based on teacher ownership
          // + recitation published status + student tenant membership.
          const rrq = await pool.query(
            `SELECT r.teacher_id, r.is_published
               FROM recitation_questions rq
               JOIN recitations r ON rq.recitation_id = r.id
              WHERE rq.question_image_url = $1
              LIMIT 1`,
            [fullPath]
          );
          if (!rrq.rows.length) return null;
          teacherId = rrq.rows[0].teacher_id;
          // Students: grant access when recitation is published + they belong to teacher + not suspended
          if (decoded.role === 'student' && rrq.rows[0].is_published) {
            const sr = await pool.query(
              `SELECT 1 FROM students WHERE id=$1 AND teacher_id=$2 AND is_suspended=false`,
              [decoded.id, teacherId]
            );
            hasAccess = sr.rows.length > 0;
          }
          // Teachers + assistants: handled by the common role guard below
        }
      }

      if (decoded.role === 'teacher') {
        hasAccess = decoded.id === teacherId;
      } else if (decoded.role === 'assistant') {
        hasAccess = decoded.teacher_id === teacherId;
      } else if (decoded.role === 'student') {
        if (examId && isPublished) {
          if (courseId && coursePublished) {
            // [X13 fix] Course exam — require BOTH the exam AND the hosting course
            // to be published.  Previously only e.is_published was checked, so a
            // student enrolled in an unpublished course could still access question
            // images even though PDFs and videos of the same course were blocked.
            const e = await pool.query(
              `SELECT 1
                 FROM student_course_enrollment sce
                 JOIN students s ON s.id = sce.student_id
                WHERE sce.student_id=$1 AND sce.course_id=$2
                  AND sce.status='active' AND s.is_suspended = false`,
              [decoded.id, courseId]
            );
            hasAccess = e.rows.length > 0;
          } else if (!courseId) {
            // [X12 fix] Standalone exam (courseId === null).  The old guard was
            // `else if (examId)` with NO isPublished check — a student with a
            // stale session from a previously-published exam could access images
            // even after the teacher unpublished it.  Now `isPublished` is verified
            // (and coursePublished is TRUE via COALESCE so it does not block here).
            const sr = await pool.query(
              `SELECT 1
                 FROM students st
                WHERE st.id = $1
                  AND st.is_suspended = false
                  AND EXISTS (
                    SELECT 1 FROM exam_sessions WHERE student_id = $1 AND exam_id = $2
                    UNION ALL
                    SELECT 1 FROM exam_results  WHERE student_id = $1 AND exam_id = $2
                  )`,
              [decoded.id, examId]
            );
            hasAccess = sr.rows.length > 0;
          }
          // else: course exam with unpublished course → hasAccess stays false ✓
        }
        // else: exam doesn't exist or isn't published → hasAccess stays false ✓
      }
    }
  } catch (err) {
    // [X4 fix] Re-throw DB errors instead of silently returning false.
    // Previously, any DB failure looked like "access denied" to the caller
    // (both returned false → 403 Forbidden).  Callers now catch this and
    // return 503 Service Unavailable, which is semantically correct and
    // easier to distinguish in logs and monitoring.
    console.error('[checkFileAccess]', err.message);
    throw err;
  }

  // [S-2 fix] only cache positive (allowed) results.
  // Denied results must NOT be cached — a newly-enrolled or un-suspended student
  // would otherwise receive a false 403 for up to FILE_ACCESS_TTL_MS (60s).
  if (hasAccess) {
    _fileAccessCache.set(cacheKey, { allowed: true, at: Date.now() });
  }
  return hasAccess;
};

/**
 * [C-1 + C-2] Middleware factory for protected upload directories.
 *   C-2: validates token against blacklist + account status via verifyFullToken
 *   C-1: enforces ownership/enrollment check per file type
 */
const makeProtectedUploadsMiddleware = (fileType) => async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;

  let decoded;
  try {
    decoded = await verifyFullToken(token);
  } catch (err) {
    // [A-1 fix] Send a response body that matches the HTTP status code.
    // verifyFullToken throws 403 for suspended students — sending 'Unauthorized'
    // on a 403 is semantically wrong; use 'Forbidden' instead.
    const status = err.statusCode || 401;
    const body   = status === 403 ? 'Forbidden' : 'Unauthorized';
    return res.status(status).send(body);
  }

  const filename = req.path.replace(/^\/+/, '');
  if (!filename || filename.includes('..')) {
    return res.status(403).send('Forbidden');
  }
  const fullPath = `${req.baseUrl}/${filename}`;

  // [X4 fix] checkFileAccess now re-throws on DB errors (instead of returning
  // false) so we can distinguish a genuine "access denied" (false → 403) from
  // a database outage (thrown error → 503 Service Unavailable).
  let allowed;
  try {
    allowed = await checkFileAccess(decoded, fileType, fullPath);
  } catch (err) {
    console.error('[makeProtectedUploadsMiddleware] checkFileAccess DB error:', err.message);
    return res.status(503).send('Service Unavailable');
  }

  if (allowed === null) {
    // File not registered in DB — treat as Not Found regardless of disk state
    return res.status(404).send('Not Found');
  }
  if (!allowed) return res.status(403).send('Forbidden');

  req._uploadsAuthed = true;
  next();
};

app.use('/uploads/pdfs',
        uploadsLimiter,
        makeProtectedUploadsMiddleware('pdf'),
        (req, res, next) => {
          res.setHeader('Content-Disposition', 'inline');
          // Use no-cache (not no-store) so the browser can store the PDF locally
          // and revalidate with ETag. On repeated opens the server returns 304 with
          // no body — the file loads from the browser cache instantly instead of
          // being re-downloaded from disk on every visit.  `private` ensures the
          // response is never stored in shared/proxy caches.
          res.setHeader('Cache-Control', 'private, no-cache');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          // [B-6 fix] prevent search-engine crawlers from indexing PDF URLs
          res.setHeader('X-Robots-Tag', 'noindex, nofollow');
          next();
        },
        express.static(path.join(__dirname, '../uploads/pdfs'), { etag: true, lastModified: true }));
app.use('/uploads/videos',
        uploadsLimiter,
        makeProtectedUploadsMiddleware('video'),
        express.static(path.join(__dirname, '../uploads/videos')));
app.use('/uploads/question-images',
        uploadsLimiter,
        makeProtectedUploadsMiddleware('question-image'),
        (req, res, next) => {
          // Allow browser to cache locally and revalidate with ETag (304 Not Modified)
          res.setHeader('Cache-Control', 'private, no-cache');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('X-Robots-Tag', 'noindex, nofollow');
          next();
        },
        express.static(path.join(__dirname, '../uploads/question-images'), { etag: true, lastModified: true }));

// ── PDF.js assets (cMaps + standard fonts) ───────────────────────────────────
// Served locally so SecurePdfViewer never has to hit an external CDN.
// These are static binary files that never change for a given pdfjs-dist version,
// so they can be cached aggressively in the browser.
const _pdfjsCmapDir      = path.join(__dirname, '../client/node_modules/pdfjs-dist/cmaps');
const _pdfjsFontsDir     = path.join(__dirname, '../client/node_modules/pdfjs-dist/standard_fonts');
const _pdfjsCacheHeader  = (req, res) => res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
app.use('/pdfjs/cmaps',
  (req, res, next) => { _pdfjsCacheHeader(req, res); next(); },
  express.static(_pdfjsCmapDir));
app.use('/pdfjs/standard_fonts',
  (req, res, next) => { _pdfjsCacheHeader(req, res); next(); },
  express.static(_pdfjsFontsDir));

// Images and thumbnails remain public (needed for login page / course cards)
// Safety guard: block direct access to protected subdirs through the general handler.
app.use('/uploads', (req, res, next) => {
  if (req._uploadsAuthed) return next();
  const normalized = req.path.replace(/\/+/g, '/');
  const protected_ = ['/pdfs/', '/videos/', '/question-images/'];
  if (protected_.some(p => normalized.startsWith(p) || normalized === p.slice(0, -1))) {
    return res.status(401).send('Unauthorized');
  }
  next();
}, express.static(path.join(__dirname, '../uploads')));

// ── [L-2] SSE-specific rate limiter: 10 connect attempts per IP per minute ──
const sseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'طلبات SSE كثيرة جداً، حاول بعد دقيقة' },
  skip: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  },
});

// API responses are user- and tenant-specific. Never let a browser, proxy, or
// an accidentally broad CDN rule reuse one student's response for another.
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// ── [C-2] SSE endpoint — H-8 fix: prefer short-lived ticket over raw JWT ──
app.get('/api/sse', sseLimiter, async (req, res) => {
  const ticket = req.query.ticket;
  const token  = req.query.token;

  let decoded;
  try {
    if (ticket) {
      // H-8: one-time SSE ticket (30s TTL) — JWT never appears in the URL
      decoded = consumeSSETicket(ticket);
      if (!decoded) return res.status(401).end();
    } else if (token) {
      // Legacy fallback: full JWT in query string (deprecated, kept for backward compat)
      decoded = await verifyFullToken(token);
    } else {
      return res.status(401).end();
    }
  } catch (err) {
    return res.status(err.statusCode || 401).end();
  }

  const key = `${decoded.role}_${decoded.id}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  addClient(key, res);
  res.write(`event: connected\ndata: ${JSON.stringify({ key })}\n\n`);

  let heartbeat;
  let _sseClean = false;
  const cleanup = () => {
    if (_sseClean) return;
    _sseClean = true;
    clearInterval(heartbeat);
    removeClient(key, res);
  };

  heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) { cleanup(); }
  }, 25000);

  req.on('close', cleanup);
  res.on('finish', cleanup);
});
// ─────────────────────────────────────────────────────────────

app.use('/api', subdomainTenant);
app.use('/api/admin', require('./routes/admin'));
app.use('/api/public', require('./routes/public'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/teachers', require('./routes/teachers'));
// Hard-coded route to bypass any Express router ordering mystery in students.js
app.delete('/api/students/import-model', subdomainTenant, authenticate, requireRole('teacher', 'assistant'), async (req, res) => {
  console.log('[index.js DELETE /api/students/import-model] teacherId intercept');
  const teacherId = req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;
  try {
    const result = await pool.query('DELETE FROM teacher_import_models WHERE teacher_id=$1 RETURNING id', [teacherId]);
    console.log('[index.js DELETE /api/students/import-model] حُذف', result.rowCount, 'صف');
    return res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    console.error('[index.js DELETE /api/students/import-model] خطأ:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});
app.use('/api/students', require('./routes/students'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/exams', require('./routes/exams'));
app.use('/api/assistants', require('./routes/assistants'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/question-banks', require('./routes/questionBanks'));
app.use('/api/live', require('./routes/live'));
app.use('/api/events', require('./routes/events'));
app.use('/api/activity-logs', require('./routes/activityLogs'));
app.use('/api/whatsapp',     require('./routes/whatsapp'));
app.use('/api/recitations', require('./routes/recitations'));
app.use('/api/archive',    require('./routes/archive'));
app.use('/api/attendance', require('./routes/attendance'));


app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', uptime: process.uptime() });
  } catch (e) {
    res.status(503).json({ status: 'db_error' });
  }
});

// ── In-memory cache for tenant branding (5-min TTL) ─────────────────────────
// Shared by /manifest.json and the SPA catch-all (iOS meta-tag injection).
// The cache lives in a separate module so admin routes can invalidate it
// immediately after creating or updating a teacher (no stale-manifest bug).
const { getBrandingCache, setBrandingCache } = require('./cache/tenantBranding');
async function getTenantBranding(slug) {
  if (!slug) return null;
  const cached = getBrandingCache(slug);
  if (cached) return cached;
  try {
    const r = await pool.query(
      'SELECT name, platform_name, pwa_name, logo_url, logo_wide_url FROM teachers WHERE slug=$1',
      [slug]
    );
    if (!r.rows.length) return null;
    const t = r.rows[0];
    const data = {
      appName:   t.platform_name || t.name || 'وثبة',
      shortName: t.pwa_name || t.platform_name || t.name || 'وثبة',
      logoUrl:   t.logo_url || t.logo_wide_url || null,
    };
    setBrandingCache(slug, data);
    return data;
  } catch (_) { return null; }
}

// ── Dynamic PWA manifest — must come BEFORE express.static so it takes
//    precedence over the static client/dist/manifest.json.
//    Each teacher subdomain gets its own `id`, `name`, `short_name`, and logo
//    so browsers treat them as distinct installable apps.
app.get('/manifest.json', subdomainTenant, async (req, res) => {
  const slug = req.tenantSlug || null;

  // Build absolute base URL — relative URLs cause some Android browsers to
  // fall back to the apex domain instead of the teacher subdomain.
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host  = req.get('host') || '';
  const base  = `${proto}://${host}`;

  const branding = await getTenantBranding(slug);

  const appName   = branding ? branding.appName   : 'وثبة - المنصة التعليمية';
  const shortName = branding ? branding.shortName : 'وثبة';
  const rawLogo   = branding ? branding.logoUrl   : null;

  // Resolve teacher logo to an absolute URL for the manifest icons array.
  const logoSrc = rawLogo
    ? (rawLogo.startsWith('http') ? rawLogo : `${base}${rawLogo.startsWith('/') ? '' : '/'}${rawLogo}`)
    : null;

  const icons = logoSrc
    ? [
        { src: logoSrc, sizes: '48x48',   type: 'image/png', purpose: 'any' },
        { src: logoSrc, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: logoSrc, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ]
    : [
        { src: `${base}/icon-48.png`,  sizes: '48x48',   type: 'image/png', purpose: 'any' },
        { src: `${base}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ];

  const iconSrc192 = logoSrc || `${base}/icon-192.png`;

  const manifest = {
    id:          `${base}/`,
    name:        appName,
    short_name:  shortName,
    description: `منصة ${appName} التعليمية`,
    start_url:   `${base}/`,          // root → PwaRootRedirect handles role-aware redirect
    scope:       `${base}/`,
    display:     'standalone',
    orientation: 'portrait',
    background_color: '#0F0E15',
    theme_color: '#f97316',
    lang: 'ar',
    dir: 'rtl',
    icons,
    categories: ['education'],
    screenshots: [],
    shortcuts: [
      { name: 'لوحتي',    short_name: 'لوحتي',  url: `${base}/student`,         icons: [{ src: iconSrc192, sizes: '192x192' }] },
      { name: 'كورساتي', short_name: 'كورسات', url: `${base}/student/courses`, icons: [{ src: iconSrc192, sizes: '192x192' }] },
    ],
  };

  res.set('Content-Type', 'application/manifest+json');
  res.set('Cache-Control', 'public, max-age=300');
  res.json(manifest);
});

// ── robots.txt (must come BEFORE the SPA catch-all, otherwise the React
//    app shell HTML is served for /robots.txt, producing 33 syntax errors
//    in Lighthouse's SEO audit and blocking legitimate crawlers.)
app.get('/robots.txt', (req, res) => {
  const wildcardDomain = process.env.WILDCARD_DOMAIN || 'wathba.site';
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(
    `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /uploads/\n\nSitemap: https://${wildcardDomain}/sitemap.xml\n`
  );
});

const clientDist = path.join(__dirname, '../client/dist');
if (process.env.NODE_ENV === 'production' || fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));

  // ── SPA catch-all: inject per-tenant branding into the HTML shell ──────────
  // iOS Safari completely ignores manifest.json and reads these HTML tags
  // directly to determine the app name and icon on the home screen:
  //   • <meta name="apple-mobile-web-app-title">  → home-screen label
  //   • <link rel="apple-touch-icon">             → home-screen icon
  //   • <title>                                   → shown in browser tab / share sheet
  // Without this injection every student gets the generic "وثبة" branding
  // regardless of which teacher's subdomain they are on.
  app.get('*', subdomainTenant, async (req, res) => {
    const indexPath = path.join(clientDist, 'index.html');
    if (!fs.existsSync(indexPath)) {
      return res.status(404).send('Client build not found. Run: cd client && npm run build');
    }

    const slug = req.tenantSlug || null;
    const branding = await getTenantBranding(slug);

    if (!branding) {
      // No tenant or no branding data — serve the static file as-is
      return res.sendFile(indexPath);
    }

    const { appName, shortName, logoUrl } = branding;
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host  = req.get('host') || '';
    const base  = `${proto}://${host}`;

    const resolvedLogo = logoUrl
      ? (logoUrl.startsWith('http') ? logoUrl : `${base}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`)
      : null;

    let html = fs.readFileSync(indexPath, 'utf8');

    // Replace <title>
    html = html.replace(
      /<title>[^<]*<\/title>/,
      `<title>${appName}</title>`
    );

    // Replace apple-mobile-web-app-title
    html = html.replace(
      /<meta name="apple-mobile-web-app-title"[^>]*>/,
      `<meta name="apple-mobile-web-app-title" content="${shortName}" />`
    );

    // Replace application-name
    html = html.replace(
      /<meta name="application-name"[^>]*>/,
      `<meta name="application-name" content="${shortName}" />`
    );

    // Replace description
    html = html.replace(
      /<meta name="description"[^>]*>/,
      `<meta name="description" content="منصة ${appName} التعليمية" />`
    );

    // Replace apple-touch-icon with teacher logo (if available)
    if (resolvedLogo) {
      html = html.replace(
        /<link rel="apple-touch-icon"[^>]*>/g,
        `<link rel="apple-touch-icon" sizes="192x192" href="${resolvedLogo}" />`
      );
    }

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store'); // must not cache; each subdomain differs
    res.send(html);
  });
}

const initDB = async () => {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('Database schema initialized');

    // Migrations: add columns that may not exist in older deployments
    await pool.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS plain_password VARCHAR(255)');
    await pool.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP');

    // [recitation_locks] Drop the dead `ever_passed` column from
    // recitation_results and exam_results. The column was added in migrate.sql
    // but never written by any code path — both INSERT sites omit it and there
    // is no UPDATE … SET ever_passed = true anywhere. Readers silently fall
    // back to bool_or(passed) subqueries, so dropping is safe (no data loss).
    await pool.query('ALTER TABLE recitation_results DROP COLUMN IF EXISTS ever_passed');
    await pool.query('ALTER TABLE exam_results       DROP COLUMN IF EXISTS ever_passed');

    // Add indexes for optimization if not exists
    await pool.query('CREATE INDEX IF NOT EXISTS idx_live_streams_status ON live_streams(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_live_chat_stream_sent ON live_chat_messages(stream_id, sent_at)');

    const existing = await pool.query("SELECT id FROM teachers WHERE username='admin' LIMIT 1");
    if (existing.rows.length === 0) {
      const bcrypt = require('bcryptjs');
      const crypto = require('crypto');
      const defaultPassword = crypto.randomBytes(6).toString('hex');
      const hashed = await bcrypt.hash(defaultPassword, 10);
      await pool.query(
        "INSERT INTO teachers (username,password,name,bio,classification,whatsapp_phone,slug) VALUES($1,$2,$3,$4,$5,$6,$7)",
        ['admin', hashed, 'المعلم الافتراضي', 'مرحباً بك في منصة وثبة التعليمية', 'مدرس رياضيات', '+201000000000', 'admin']
      );
      console.log(`Default teacher created: username=admin — password written to ADMIN_INITIAL_PASSWORD env var`);
      console.warn('⚠️  SECURITY WARNING: Change the default admin password immediately via Settings!');
      process.env.ADMIN_INITIAL_PASSWORD = defaultPassword;
    } else {
      // Ensure existing admin teacher has a slug
      await pool.query(
        "UPDATE teachers SET slug = regexp_replace(lower(trim(username)), '[^a-z0-9]+', '-', 'g') WHERE slug IS NULL OR slug = ''"
      );
    }

    // ── Migration: set plain_password for students that have NULL (imported before feature was added) ──
    // Offload to background with yield delay so it doesn't block startup or choke event loop
    const runStudentPasswordMigration = async () => {
      const { rows: nullPwStudents } = await pool.query(
        "SELECT id FROM students WHERE (plain_password IS NULL OR plain_password = '') AND deleted_at IS NULL"
      );
      if (nullPwStudents.length > 0) {
        const bcryptjs = require('bcryptjs');
        const cryptoLib = require('crypto');
        console.log(`[Migration] Starting plain_password migration for ${nullPwStudents.length} student(s) in background...`);
        let fixedCount = 0;
        for (const s of nullPwStudents) {
          const pw = String(100000 + cryptoLib.randomInt(0, 900000));
          const hashed = await bcryptjs.hash(pw, 10);
          await pool.query('UPDATE students SET plain_password=$1, password=$2 WHERE id=$3', [pw, hashed, s.id]);
          fixedCount++;
          // Yield to event loop to process other HTTP/SSE requests
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        console.log(`[Migration] Finished setting plain_password for ${fixedCount} student(s)`);
      }
    };
    runStudentPasswordMigration().catch(migErr => {
      console.error('[Migration] plain_password fix error:', migErr.message);
    });
  } catch (err) {
    console.error('DB init error:', err.message);
  }
};

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, '0.0.0.0', async () => {
  await initDB();
  initFCM();
  startScheduler(pool);
  // Restore any previously active WhatsApp sessions after a short delay
  setTimeout(() => {
    require('./lib/whatsapp').restoreConnections().catch(() => {});
  }, 3000);
  console.log(`WATHBA Server running on port ${PORT}`);
});

// ── Graceful shutdown handler ──
const gracefulShutdown = async (signal) => {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  server.close(async () => {
    try {
      await pool.end();
      console.log('[shutdown] DB pool closed');
    } catch (e) {
      console.error('[shutdown] DB pool close error:', e.message);
    }
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[shutdown] Forced exit after timeout');
    process.exit(1);
  }, 15000);
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
