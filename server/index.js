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

// Global unhandled rejection / uncaught exception guards
process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

const app = express();
app.set('trust proxy', 1);

// Security headers (helmet) — configured to allow CDN fonts & inline styles needed by Vite
app.use(helmet({
  contentSecurityPolicy: false,  // Disabled: Vite / React inline scripts need it off in dev
  crossOriginEmbedderPolicy: false,
}));
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : null;
app.use(cors({
  origin: process.env.NODE_ENV === 'production' && allowedOrigins
    ? (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
      }
    : '*',
  credentials: true,
}));
app.use((req, res, next) => {
  if (req.is('multipart/form-data')) return next();
  express.json({ limit: '5mb' })(req, res, next);
});

// ── General API rate limiter (120 req/min per IP) ──────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'طلبات كثيرة جداً، حاول مرة أخرى بعد دقيقة' },
});
app.use('/api/', apiLimiter);

// ── Protected uploads: PDFs and videos require a valid JWT ─────
const uploadsAuthMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).send('Unauthorized');
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).send('Unauthorized');
  }
};
app.use('/uploads/pdfs',   uploadsAuthMiddleware, express.static(path.join(__dirname, '../uploads/pdfs')));
app.use('/uploads/videos', uploadsAuthMiddleware, express.static(path.join(__dirname, '../uploads/videos')));
// Images and thumbnails remain public (needed for login page / course cards)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── SSE endpoint ──────────────────────────────────────────────
app.get('/api/sse', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).end();

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (_) {
    return res.status(401).end();
  }

  const key = `${decoded.role}_${decoded.id}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  addClient(key, res);
  res.write(`event: connected\ndata: ${JSON.stringify({ key })}\n\n`);

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) {
      clearInterval(heartbeat);
      removeClient(key, res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(key, res);
  });
});
// ─────────────────────────────────────────────────────────────

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

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
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
      const hashed = await bcrypt.hash('admin123', 10);
      await pool.query(
        "INSERT INTO teachers (username,password,name,bio,classification,whatsapp_phone,slug) VALUES($1,$2,$3,$4,$5,$6,$7)",
        ['admin', hashed, 'المعلم الافتراضي', 'مرحباً بك في منصة وثبة التعليمية', 'مدرس رياضيات', '+201000000000', 'admin']
      );
      console.log('Default teacher created: username=admin, password=admin123');
      console.warn('⚠️  SECURITY WARNING: Change the default admin password immediately via Settings!');
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', async () => {
  await initDB();
  initFCM();
  startScheduler(pool);
  console.log(`WATHBA Server running on port ${PORT}`);
});
