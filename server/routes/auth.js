const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const pool = require('../db/connection');
const { generateToken, authenticate } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'محاولات تسجيل دخول كثيرة، حاول مرة أخرى بعد 15 دقيقة' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const checks = role
      ? [role]
      : ['teacher', 'assistant', 'student'];

    for (const r of checks) {
      let table = '';
      if (r === 'teacher') table = 'teachers';
      else if (r === 'assistant') table = 'assistants';
      else if (r === 'student') table = 'students';
      else continue;

      const whereClause = r === 'student'
        ? `WHERE username = $1 AND deleted_at IS NULL`
        : `WHERE username = $1`;

      const result = await pool.query(`SELECT * FROM ${table} ${whereClause}`, [username]);
      if (result.rows.length === 0) continue;

      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) continue;

      const payload = { id: user.id, role: r, username: user.username, name: user.name };
      if (r === 'assistant') payload.teacher_id = user.teacher_id;
      if (r === 'student') payload.teacher_id = user.teacher_id;

      const token = generateToken(payload);
      const { password: _, plain_password: __, ...safeUser } = user;
      return res.json({ token, user: { ...safeUser, role: r } });
    }

    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const { id, role } = req.user;
    let table = role === 'teacher' ? 'teachers' : role === 'assistant' ? 'assistants' : 'students';
    const whereClause = role === 'student' ? 'WHERE id = $1 AND deleted_at IS NULL' : 'WHERE id = $1';
    const result = await pool.query(`SELECT * FROM ${table} ${whereClause}`, [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const { password: _, plain_password: __, ...safeUser } = result.rows[0];
    res.json({ ...safeUser, role });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
