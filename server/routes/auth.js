const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const pool = require('../db/connection');
const { generateToken, authenticate } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');

const router = express.Router();
router.use(resolveTenant);

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
    const tenantId = req.tenant?.id || null;
    const checks = role
      ? [role]
      : ['teacher', 'assistant', 'student'];

    for (const r of checks) {
      let table = '';
      if (r === 'teacher') table = 'teachers';
      else if (r === 'assistant') table = 'assistants';
      else if (r === 'student') table = 'students';
      else continue;

      let whereClause, queryParams;
      if (r === 'teacher') {
        whereClause = 'WHERE username = $1';
        queryParams = [username];
      } else if (r === 'student') {
        if (tenantId) {
          whereClause = 'WHERE username = $1 AND deleted_at IS NULL AND teacher_id = $2';
          queryParams = [username, tenantId];
        } else {
          whereClause = 'WHERE username = $1 AND deleted_at IS NULL';
          queryParams = [username];
        }
      } else {
        if (tenantId) {
          whereClause = 'WHERE username = $1 AND teacher_id = $2';
          queryParams = [username, tenantId];
        } else {
          whereClause = 'WHERE username = $1';
          queryParams = [username];
        }
      }

      const result = await pool.query(`SELECT * FROM ${table} ${whereClause}`, queryParams);
      if (result.rows.length === 0) continue;

      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.password);
      // Username found but wrong password — stop immediately, don't try other tables
      // (prevents role-confusion attacks with shared usernames)
      if (!valid) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

      const payload = { id: user.id, role: r, username: user.username, name: user.name };
      if (r === 'assistant') payload.teacher_id = user.teacher_id;
      if (r === 'student') payload.teacher_id = user.teacher_id;

      const token = generateToken(payload);
      const { password: _, plain_password: __, fcm_token: ___, ...safeUser } = user;
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
    const { password: _, plain_password: __, fcm_token: ___, ...safeUser } = result.rows[0];
    res.json({ ...safeUser, role });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
