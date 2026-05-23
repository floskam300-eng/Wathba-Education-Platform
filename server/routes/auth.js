const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const pool = require('../db/connection');
const { generateToken, authenticate } = require('../middleware/auth');
const { logActivity, getIp } = require('../lib/activityLog');

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
  const { username, password, role, slug } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    // Resolve teacher from slug (for tenant scoping)
    let slugTeacherId = null;
    let slugTeacherSlug = null;
    if (slug) {
      const tRes = await pool.query(
        'SELECT id, slug FROM teachers WHERE slug = $1',
        [slug]
      );
      if (tRes.rows.length === 0) {
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
      }
      slugTeacherId = tRes.rows[0].id;
      slugTeacherSlug = tRes.rows[0].slug;
    }

    const checks = role ? [role] : ['teacher', 'assistant', 'student'];

    for (const r of checks) {
      let result;

      if (r === 'teacher') {
        // Scope teacher login to the slug if provided
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

      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

      // Build payload with teacher_slug for all roles
      const payload = { id: user.id, role: r, username: user.username, name: user.name };

      if (r === 'teacher') {
        payload.teacher_slug = user.slug || slugTeacherSlug;
      } else {
        payload.teacher_id = user.teacher_id;
        // Fetch teacher slug for student/assistant
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

    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const { id, role } = req.user;

    let result;
    if (role === 'teacher') {
      const whereClause = 'WHERE id = $1';
      result = await pool.query(`SELECT * FROM teachers ${whereClause}`, [id]);
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

    // For teacher, ensure teacher_slug is included
    if (role === 'teacher') {
      safeUser.teacher_slug = safeUser.slug;
    }

    res.json({ ...safeUser, role });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
