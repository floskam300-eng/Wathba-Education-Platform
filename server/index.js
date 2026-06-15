require('dotenv').config();
const express = require('express');
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
const { verifyFullToken } = require('./middleware/auth');
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

// [M-13] FIX: Enable a real CSP in production. In development (Vite HMR, eval)
// we still disable it — but in production the built bundle uses no unsafe constructs.
const isProd = process.env.NODE_ENV === 'production';
app.use(helmet({
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'", 'https://www.gstatic.com'],
      styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:        ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc:         ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc:     ["'self'", 'wss:', 'ws:', 'https:'],
      mediaSrc:       ["'self'", 'blob:', 'https:'],
      frameSrc:       ["'self'"],
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

// ── [C-1 + C-2] Protected upload directories ─────────────────
//
// File-access cache — prevents N+1 DB queries for video range requests.
// Key: `${role}_${userId}:${fullPath}`, Value: { allowed: bool, at: ts }
const _fileAccessCache = new Map();
const FILE_ACCESS_TTL_MS = 60_000;
const FILE_ACCESS_MAX_SIZE = 10_000;
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
  const cacheKey = `${decoded.role}_${decoded.id}:${fullPath}`;
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
        const e = await pool.query(
          `SELECT 1 FROM student_course_enrollment
            WHERE student_id=$1 AND course_id=$2 AND status='active'`,
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
        const e = await pool.query(
          `SELECT 1 FROM student_course_enrollment
            WHERE student_id=$1 AND course_id=$2 AND status='active'`,
          [decoded.id, course_id]
        );
        hasAccess = e.rows.length > 0;
      }

    } else if (fileType === 'question-image') {
      // First look in questions table (regular exam questions + group context images)
      const rq = await pool.query(
        `SELECT e.id AS exam_id, e.teacher_id, e.course_id, e.is_published
           FROM questions q
           JOIN exams e ON q.exam_id = e.id
          WHERE q.question_image_url = $1 OR q.group_context_image = $1
          LIMIT 1`,
        [fullPath]
      );

      let examId = null, teacherId = null, courseId = null, isPublished = false;

      if (rq.rows.length) {
        ({ exam_id: examId, teacher_id: teacherId, course_id: courseId,
           is_published: isPublished } = rq.rows[0]);
      } else {
        // Fall back to bank_questions (question bank images)
        const rb = await pool.query(
          `SELECT qb.teacher_id, qb.id AS bank_id
             FROM bank_questions bq
             JOIN question_banks qb ON bq.bank_id = qb.id
            WHERE bq.question_image_url = $1 OR bq.group_context_image = $1
            LIMIT 1`,
          [fullPath]
        );
        if (!rb.rows.length) return null;
        teacherId = rb.rows[0].teacher_id;
        const bankId = rb.rows[0].bank_id;

        // For student access: find any published exam that uses this bank
        if (decoded.role === 'student') {
          const re = await pool.query(
            `SELECT e.id, e.course_id, e.is_published
               FROM exams e
              WHERE e.bank_id = $1 AND e.is_published = true
              LIMIT 1`,
            [bankId]
          );
          if (re.rows.length) {
            examId     = re.rows[0].id;
            courseId   = re.rows[0].course_id;
            isPublished = re.rows[0].is_published;
          }
        }
      }

      if (decoded.role === 'teacher') {
        hasAccess = decoded.id === teacherId;
      } else if (decoded.role === 'assistant') {
        hasAccess = decoded.teacher_id === teacherId;
      } else if (decoded.role === 'student') {
        if (examId && courseId && isPublished) {
          // Course exam: active enrollment required
          const e = await pool.query(
            `SELECT 1 FROM student_course_enrollment
              WHERE student_id=$1 AND course_id=$2 AND status='active'`,
            [decoded.id, courseId]
          );
          hasAccess = e.rows.length > 0;
        } else if (examId) {
          // Standalone exam: student must have an active session OR completed result
          const sr = await pool.query(
            `SELECT 1 FROM exam_sessions WHERE student_id=$1 AND exam_id=$2
             UNION ALL
             SELECT 1 FROM exam_results  WHERE student_id=$1 AND exam_id=$2
             LIMIT 1`,
            [decoded.id, examId]
          );
          hasAccess = sr.rows.length > 0;
        }
      }
    }
  } catch (err) {
    console.error('[checkFileAccess]', err.message);
    return false;
  }

  _fileAccessCache.set(cacheKey, { allowed: hasAccess, at: Date.now() });
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
    return res.status(err.statusCode || 401).send('Unauthorized');
  }

  const filename = req.path.replace(/^\/+/, '');
  if (!filename || filename.includes('..')) {
    return res.status(403).send('Forbidden');
  }
  const fullPath = `${req.baseUrl}/${filename}`;

  const allowed = await checkFileAccess(decoded, fileType, fullPath);

  if (allowed === null) {
    // File not registered in DB — treat as Not Found regardless of disk state
    return res.status(404).send('Not Found');
  }
  if (!allowed) return res.status(403).send('Forbidden');

  req._uploadsAuthed = true;
  next();
};

app.use('/uploads/pdfs',            makeProtectedUploadsMiddleware('pdf'),
        express.static(path.join(__dirname, '../uploads/pdfs')));
app.use('/uploads/videos',          makeProtectedUploadsMiddleware('video'),
        express.static(path.join(__dirname, '../uploads/videos')));
app.use('/uploads/question-images', makeProtectedUploadsMiddleware('question-image'),
        express.static(path.join(__dirname, '../uploads/question-images')));

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
app.use('/api/public', require('./routes/public'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/teachers', require('./routes/teachers'));
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

// ── Dynamic PWA manifest — must come BEFORE express.static so it takes
//    precedence over the static client/dist/manifest.json.
//    Each teacher subdomain gets its own `id`, `name`, and `short_name` so
//    browsers treat them as distinct installable apps and allow multiple
//    installs from the same device (one per teacher).
app.get('/manifest.json', subdomainTenant, async (req, res) => {
  const slug = req.tenantSlug || null;
  let teacherName = 'وثبة';

  if (slug && req.tenantTeacherId) {
    try {
      const r = await pool.query('SELECT name FROM teachers WHERE id=$1', [req.tenantTeacherId]);
      if (r.rows.length) teacherName = r.rows[0].name;
    } catch (_) {}
  }

  // Build absolute base URL from the incoming request so that start_url and
  // scope resolve to the correct teacher subdomain, NOT the root domain.
  // Using relative "/" can cause some Android browsers to fall back to the
  // apex domain (wathba.site) instead of the subdomain (teacher.wathba.site).
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host  = req.get('host') || '';
  const base  = `${proto}://${host}`;

  const tenantId = slug || 'default';
  const manifest = {
    id: `${base}/`,                  // globally unique per origin
    name: slug ? `وثبة — ${teacherName}` : 'وثبة - المنصة التعليمية',
    short_name: slug ? teacherName : 'وثبة',
    description: 'منصة تعليمية متكاملة لمراكز الدروس الخصوصية في مصر',
    start_url: `${base}/`,           // absolute — always opens the teacher's subdomain
    scope: `${base}/`,               // absolute — locks the PWA to this origin
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0F0E15',
    theme_color: '#f97316',
    lang: 'ar',
    dir: 'rtl',
    icons: [
      { src: `${base}/icon-48.png`,  sizes: '48x48',   type: 'image/png', purpose: 'any' },
      { src: `${base}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    categories: ['education'],
    screenshots: [],
    shortcuts: [
      { name: 'لوحتي',    short_name: 'لوحتي',  url: `${base}/student`,         icons: [{ src: `${base}/icon-192.png`, sizes: '192x192' }] },
      { name: 'كورساتي', short_name: 'كورسات', url: `${base}/student/courses`, icons: [{ src: `${base}/icon-192.png`, sizes: '192x192' }] },
    ],
  };

  res.set('Content-Type', 'application/manifest+json');
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(manifest);
});

const clientDist = path.join(__dirname, '../client/dist');
if (process.env.NODE_ENV === 'production' || fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    const index = path.join(clientDist, 'index.html');
    if (fs.existsSync(index)) {
      res.sendFile(index);
    } else {
      res.status(404).send('Client build not found. Run: cd client && npm run build');
    }
  });
}

const initDB = async () => {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('Database schema initialized');

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
  } catch (err) {
    console.error('DB init error:', err.message);
  }
};

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, 'localhost', async () => {
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
