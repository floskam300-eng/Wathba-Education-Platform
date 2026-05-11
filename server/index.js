require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./db/connection');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { addClient, removeClient } = require('./sse');

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: '*' }));
app.use((req, res, next) => {
  if (req.is('multipart/form-data')) return next();
  express.json({ limit: '50mb' })(req, res, next);
});
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
    try { res.write(': heartbeat\n\n'); } catch (_) { clearInterval(heartbeat); }
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
        "INSERT INTO teachers (username,password,name,bio,classification,whatsapp_phone) VALUES($1,$2,$3,$4,$5,$6)",
        ['admin', hashed, 'المعلم الافتراضي', 'مرحباً بك في منصة وثبة التعليمية', 'مدرس رياضيات', '+201000000000']
      );
      console.log('Default teacher created: username=admin, password=admin123');
    }
  } catch (err) {
    console.error('DB init error:', err.message);
  }
};

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', async () => {
  await initDB();
  console.log(`WATHBA Server running on port ${PORT}`);
});
