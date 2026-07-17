const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const pool = require('../db/connection');
const { requireAdminAuth, ADMIN_JWT_SECRET, invalidateTeacherAuthCache } = require('../middleware/auth');
const { getTotalConnections } = require('../sse');
const { isValidImage, deleteFile } = require('../lib/validateFileMagic');
const { convertToWebp } = require('../lib/convertToWebp');

// R-2 OPT: simple TTL cache for platform stats — these are global aggregates
// that change slowly; 5-minute staleness is acceptable for the admin dashboard.
const _statsCache = { data: null, ts: 0 };
const _STATS_TTL  = 5 * 60 * 1000; // 5 minutes

// S1 FIX: Rate limiter for admin login — 10 attempts per 15 minutes per IP
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'عدد كبير من محاولات الدخول. يرجى الانتظار 15 دقيقة قبل المحاولة مجدداً' },
  skipSuccessfulRequests: true,
});

// S4 FIX: Rate limiter for admin image uploads — 30 uploads per 10 minutes per IP
const adminUploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تجاوزت الحد المسموح به لرفع الصور. يرجى الانتظار قليلاً' },
});

const router = express.Router();

// Ensure uploads/admin directory exists
const adminUploadDir = path.join(__dirname, '../../uploads/admin');
if (!fs.existsSync(adminUploadDir)) {
  fs.mkdirSync(adminUploadDir, { recursive: true });
}

// Multer Storage Configuration for Admin Uploads
// S3/P-upload FIX: use crypto.randomBytes for filename — avoids low-entropy Math.random()
const adminStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, adminUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `admin_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const uploadAdminImage = multer({
  storage: adminStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('يُسمح برفع الصور فقط'));
    }
  },
});

// Helper: Calculate Teacher Stats (students count, courses count, exams count, storage usage)
// B6 FIX: run all count queries in parallel with Promise.all instead of sequentially
async function getTeacherStats(teacherId, includeStorage = false) {
  const [studentRes, courseRes, examRes] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM students WHERE teacher_id = $1 AND deleted_at IS NULL', [teacherId]),
    pool.query('SELECT COUNT(*) FROM courses WHERE teacher_id = $1', [teacherId]),
    pool.query('SELECT COUNT(*) FROM exams WHERE teacher_id = $1', [teacherId]),
  ]);

  let totalBytes = 0;

  if (includeStorage) {
    // Query files to compute storage
    const videosRes = await pool.query(
      'SELECT file_path_or_url FROM videos v JOIN courses c ON v.course_id = c.id WHERE c.teacher_id = $1',
      [teacherId]
    );
    const pdfsRes = await pool.query(
      'SELECT file_url FROM pdf_files p JOIN courses c ON p.course_id = c.id WHERE c.teacher_id = $1',
      [teacherId]
    );
    const teacherRes = await pool.query(
      'SELECT logo_url, photo_url, hero_image_url FROM teachers WHERE id = $1',
      [teacherId]
    );
    const teamRes = await pool.query(
      'SELECT photo_url FROM teacher_team_members WHERE teacher_id = $1',
      [teacherId]
    );

    const filePaths = [];

    // Collect all potential local file paths
    for (const row of videosRes.rows) if (row.file_path_or_url) filePaths.push(row.file_path_or_url);
    for (const row of pdfsRes.rows) if (row.file_url) filePaths.push(row.file_url);
    if (teacherRes.rows.length) {
      const t = teacherRes.rows[0];
      if (t.logo_url) filePaths.push(t.logo_url);
      if (t.photo_url) filePaths.push(t.photo_url);
      if (t.hero_image_url) filePaths.push(t.hero_image_url);
    }
    for (const row of teamRes.rows) if (row.photo_url) filePaths.push(row.photo_url);

    // Concurrently compute storage size asynchronously to avoid event loop block
    const fsPromises = fs.promises;
    const statPromises = filePaths.map(async (fp) => {
      if (fp.startsWith('/uploads/') || fp.startsWith('uploads/')) {
        const cleanPath = fp.startsWith('/') ? fp.slice(1) : fp;
        const absPath = path.join(__dirname, '../..', cleanPath);
        try {
          const stat = await fsPromises.stat(absPath);
          return stat.size;
        } catch (_) {
          return 0;
        }
      }
      return 0;
    });

    const sizes = await Promise.all(statPromises);
    totalBytes = sizes.reduce((sum, size) => sum + size, 0);
  }

  return {
    total_students: parseInt(studentRes.rows[0].count, 10),
    total_courses: parseInt(courseRes.rows[0].count, 10),
    total_exams: parseInt(examRes.rows[0].count, 10),
    storage_bytes: totalBytes,
  };
}

/* ══════════════════════════════════════════════════════════════════
   1. Auth Routes
   ══════════════════════════════════════════════════════════════════ */

// Admin Login — S1 FIX: rate-limited
router.post('/auth/login', adminLoginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, username, password_hash, name, role, is_active FROM platform_admins WHERE username = $1',
      [username.trim().toLowerCase()]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    const admin = rows[0];
    if (!admin.is_active) {
      return res.status(403).json({ error: 'هذا الحساب موقوف حالياً' });
    }
    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    // S3 FIX: include jti to guarantee uniqueness even on same-second logins
    const token = jwt.sign(
      { id: admin.id, username: admin.username, name: admin.name, role: admin.role,
        jti: crypto.randomBytes(16).toString('hex') },
      ADMIN_JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      admin: { id: admin.id, username: admin.username, name: admin.name, role: admin.role },
    });
  } catch (err) {
    console.error('Admin login error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin Profile
router.get('/auth/me', requireAdminAuth, async (req, res) => {
  res.json({ admin: req.admin });
});

// Admin Logout
router.post('/auth/logout', (req, res) => {
  // Client discards JWT token, returns simple success
  res.json({ success: true });
});

/* ══════════════════════════════════════════════════════════════════
   2. Teachers Management
   ══════════════════════════════════════════════════════════════════ */

// List Teachers with their current package, active students and basic stats (no storage check on list)
router.get('/teachers', requireAdminAuth, async (req, res) => {
  try {
    const { rows: teachers } = await pool.query(
      `SELECT 
          t.id, t.username, t.name, t.classification, t.whatsapp_phone, t.logo_url, t.photo_url, t.slug,
          t.is_platform_suspended, t.platform_suspended_at, t.platform_suspended_reason,
          t.features_enabled, t.hero_image_url, t.background_color, t.created_at,
          (SELECT COUNT(*)::int FROM students WHERE teacher_id = t.id AND deleted_at IS NULL) AS total_students,
          (SELECT COUNT(*)::int FROM courses WHERE teacher_id = t.id) AS total_courses,
          (SELECT COUNT(*)::int FROM exams WHERE teacher_id = t.id) AS total_exams,
          ts.id AS sub_id,
          ts.start_date AS sub_start_date,
          ts.end_date AS sub_end_date,
          ts.price_override AS sub_price_override,
          sp.name AS plan_name,
          sp.max_students AS plan_max_students
       FROM teachers t
       LEFT JOIN LATERAL (
          SELECT id, plan_id, start_date, end_date, price_override
            FROM teacher_subscriptions
           WHERE teacher_id = t.id AND status = 'active'
           ORDER BY start_date DESC
           LIMIT 1
       ) ts ON true
       LEFT JOIN subscription_plans sp ON ts.plan_id = sp.id
       ORDER BY t.created_at DESC`
    );

    const result = teachers.map((t) => ({
      id: t.id,
      username: t.username,
      name: t.name,
      classification: t.classification,
      whatsapp_phone: t.whatsapp_phone,
      logo_url: t.logo_url,
      photo_url: t.photo_url,
      slug: t.slug,
      is_platform_suspended: t.is_platform_suspended,
      platform_suspended_at: t.platform_suspended_at,
      platform_suspended_reason: t.platform_suspended_reason,
      features_enabled: t.features_enabled,
      hero_image_url: t.hero_image_url,
      background_color: t.background_color,
      created_at: t.created_at,
      stats: {
        total_students: t.total_students,
        total_courses: t.total_courses,
        total_exams: t.total_exams,
        storage_bytes: 0, // avoided on list view for event-loop health
      },
      active_subscription: t.sub_id ? {
        id: t.sub_id,
        start_date: t.sub_start_date,
        end_date: t.sub_end_date,
        price_override: t.sub_price_override,
        plan_name: t.plan_name,
        max_students: t.plan_max_students,
      } : null,
    }));

    res.json({ teachers: result });
  } catch (err) {
    console.error('Get teachers error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get Teacher Details
router.get('/teachers/:id', requireAdminAuth, async (req, res) => {
  const teacherId = parseInt(req.params.id, 10);
  if (isNaN(teacherId)) return res.status(400).json({ error: 'معرّف غير صحيح' });
  try {
    const { rows } = await pool.query(
      `SELECT id, username, name, classification, whatsapp_phone, logo_url, photo_url, slug,
              is_platform_suspended, platform_suspended_at, platform_suspended_reason,
              features_enabled, hero_image_url, background_color, created_at
         FROM teachers
        WHERE id = $1`,
      [teacherId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'المدرس غير موجود' });
    const teacher = rows[0];

    const stats = await getTeacherStats(teacherId, true);

    // Get subscription history
    const subsRes = await pool.query(
      `SELECT ts.id, ts.plan_id, ts.billing_type, ts.price_override, ts.start_date, ts.end_date, ts.status, ts.notes,
              sp.name AS plan_name, sp.price AS plan_price
         FROM teacher_subscriptions ts
         JOIN subscription_plans sp ON ts.plan_id = sp.id
        WHERE ts.teacher_id = $1
        ORDER BY ts.start_date DESC`,
      [teacherId]
    );

    // Get payment history
    const paymentsRes = await pool.query(
      `SELECT sp.id, sp.amount, sp.currency, sp.paid_at, sp.period_start, sp.period_end, sp.payment_method, sp.notes,
              plan.name AS plan_name
         FROM subscription_payments sp
         JOIN teacher_subscriptions ts ON sp.subscription_id = ts.id
         JOIN subscription_plans plan ON ts.plan_id = plan.id
        WHERE sp.teacher_id = $1
        ORDER BY sp.paid_at DESC`,
      [teacherId]
    );

    res.json({
      teacher,
      stats,
      subscriptions: subsRes.rows,
      payments: paymentsRes.rows,
    });
  } catch (err) {
    console.error('Get teacher details error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create New Teacher (Platform Setup / Subdomain automatic creation via slug)
router.post('/teachers', requireAdminAuth, async (req, res) => {
  const { username, password, name, classification, whatsapp_phone, logo_url, hero_image_url, background_color, bio, plan_ids, force_password_change } = req.body;

  // Accept plan_ids array (multi-plan support); also accept legacy plan_id for backwards compat
  const rawPlanId = req.body.plan_id;
  const planIdsArray = Array.isArray(plan_ids) && plan_ids.length > 0
    ? plan_ids.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id) && id > 0)
    : rawPlanId ? [parseInt(rawPlanId, 10)].filter((id) => !isNaN(id) && id > 0)
    : [];

  if (!username || !password || !name || planIdsArray.length === 0) {
    return res.status(400).json({ error: 'الاسم واسم المستخدم وكلمة المرور واشتراك باقة واحدة على الأقل مطلوبين' });
  }

  const slug = username.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (!slug) return res.status(400).json({ error: 'اسم المستخدم يجب أن يحتوي على حروف أو أرقام إنجليزية ليكون رابطاً صالحاً' });

  // BUG-5 FIX: DNS label max length is 63 characters
  if (slug.length > 63) return res.status(400).json({ error: 'اسم المستخدم طويل جداً (الحد الأقصى 63 حرفاً)' });

  // BUG-4 FIX: Minimum password length
  if (password.length < 8) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });

  // Check if reserved subdomain
  const RESERVED_SUBDOMAINS = ['dashboard', 'admin', 'api', 'www', 'mail', 'app', 'static', 'cdn', 'assets'];
  if (RESERVED_SUBDOMAINS.includes(slug)) {
    return res.status(400).json({ error: 'اسم المستخدم محجوز لنظام المنصة ولا يمكن استخدامه' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if username/slug exists — return 409 Conflict (not 400) to match HTTP semantics
    const checkUser = await client.query('SELECT id FROM teachers WHERE username = $1 OR slug = $2', [username.trim().toLowerCase(), slug]);
    if (checkUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'اسم المستخدم أو الرابط الفرعي مستخدم بالفعل' });
    }

    // Validate all requested plan IDs exist
    const placeholders = planIdsArray.map((_, i) => `${i + 1}`).join(', ');
    const plansCheck = await client.query(
      `SELECT id, price, billing_type, category FROM subscription_plans WHERE id IN (${placeholders}) AND is_active = true`,
      planIdsArray
    );
    if (plansCheck.rows.length !== planIdsArray.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'إحدى الباقات المحددة غير موجودة أو غير مفعلة' });
    }

    const hashed = await bcrypt.hash(password, 10);

    // Insert Teacher — BUG-6 FIX: honour force_password_change flag from admin
    const shouldForceChange = force_password_change === true || force_password_change === 'true';
    const teacherRes = await client.query(
      `INSERT INTO teachers (username, password, name, classification, whatsapp_phone, logo_url, hero_image_url, background_color, bio, slug, features_enabled, force_password_change)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [
        username.trim().toLowerCase(),
        hashed,
        name.trim(),
        classification ? classification.trim() : null,
        whatsapp_phone ? whatsapp_phone.trim() : null,
        logo_url || null,
        hero_image_url || null,
        background_color || '#000000',
        bio || '',
        slug,
        JSON.stringify({ live_streaming: true, stickman_run: true }),
        shouldForceChange,
      ]
    );
    const newTeacherId = teacherRes.rows[0].id;

    // Create one teacher_subscription row per selected plan
    for (const plan of plansCheck.rows) {
      await client.query(
        `INSERT INTO teacher_subscriptions (teacher_id, plan_id, billing_type, price_override, start_date, end_date, status, created_by)
         VALUES ($1, $2, $3::varchar, $4, CURRENT_DATE,
                 CASE WHEN $3::varchar = 'monthly' THEN CURRENT_DATE + INTERVAL '1 month'
                      WHEN $3::varchar = 'annual'  THEN CURRENT_DATE + INTERVAL '1 year'
                      ELSE NULL END, 'active', $5)`,
        [newTeacherId, plan.id, plan.billing_type, plan.price, req.admin.id]
      );
    }

    // BUG-1 FIX: COMMIT first, THEN invalidate cache.
    // Invalidating before COMMIT means a concurrent request could query DB
    // before the row lands, cache null for 30 s, and appear as "not found".
    await client.query('COMMIT');

    const subdomainTenant = require('../middleware/subdomainTenant');
    if (subdomainTenant && typeof subdomainTenant.invalidateCache === 'function') {
      subdomainTenant.invalidateCache(slug);
    }

    // B4 FIX: invalidate stats cache when a teacher is created
    _statsCache.ts = 0;

    res.status(201).json({ success: true, teacherId: newTeacherId, slug });
  } catch (err) {
    await client.query('ROLLBACK');
    // BUG-2 FIX: 23505 = unique_violation — return 409 instead of generic 500
    if (err.code === '23505') {
      return res.status(409).json({ error: 'اسم المستخدم أو الرابط الفرعي مستخدم بالفعل' });
    }
    console.error('Create teacher error:', err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Update Teacher Details
router.put('/teachers/:id', requireAdminAuth, async (req, res) => {
  const teacherId = parseInt(req.params.id, 10);
  if (isNaN(teacherId)) return res.status(400).json({ error: 'معرّف غير صحيح' });

  const { name, classification, whatsapp_phone, logo_url, hero_image_url, background_color, bio } = req.body;
  if (!name) return res.status(400).json({ error: 'الاسم بالكامل مطلوب' });

  try {
    const { rowCount } = await pool.query(
      `UPDATE teachers
          SET name = $1, classification = $2, whatsapp_phone = $3, logo_url = $4,
              hero_image_url = $5, background_color = $6, bio = $7
        WHERE id = $8`,
      [
        name.trim(),
        classification ? classification.trim() : null,
        whatsapp_phone ? whatsapp_phone.trim() : null,
        logo_url || null,
        hero_image_url || null,
        background_color || '#000000',
        bio || '',
        teacherId,
      ]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'المدرس غير موجود' });
    res.json({ success: true });
  } catch (err) {
    console.error('Update teacher error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete Teacher (Cascades to all teacher tables on DB)
router.delete('/teachers/:id', requireAdminAuth, async (req, res) => {
  const teacherId = parseInt(req.params.id, 10);
  if (isNaN(teacherId)) return res.status(400).json({ error: 'معرّف غير صحيح' });

  try {
    const check = await pool.query('SELECT slug FROM teachers WHERE id = $1', [teacherId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'المدرس غير موجود' });

    const slug = check.rows[0].slug;

    await pool.query('DELETE FROM teachers WHERE id = $1', [teacherId]);

    // Clean resolved tenant cache
    const subdomainTenant = require('../middleware/subdomainTenant');
    if (subdomainTenant && typeof subdomainTenant.invalidateCache === 'function') {
      subdomainTenant.invalidateCache(slug);
    }

    // B4 FIX: invalidate stats cache when a teacher is deleted
    _statsCache.ts = 0;

    res.json({ success: true });
  } catch (err) {
    console.error('Delete teacher error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle Platform Suspension for Teacher — B4 FIX: invalidate stats cache
router.post('/teachers/:id/suspend', requireAdminAuth, async (req, res) => {
  const teacherId = parseInt(req.params.id, 10);
  if (isNaN(teacherId)) return res.status(400).json({ error: 'معرّف غير صحيح' });

  const { suspend, reason } = req.body;
  try {
    const isSuspended = !!suspend;
    const { rows } = await pool.query(
      `UPDATE teachers
          SET is_platform_suspended = $1,
              platform_suspended_at = $2,
              platform_suspended_reason = $3
        WHERE id = $4 RETURNING slug`,
      [isSuspended, isSuspended ? new Date() : null, isSuspended ? (reason || 'تم تعليق الحساب بقرار من الإدارة') : null, teacherId]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'المدرس غير موجود' });

    // Clean resolved tenant cache
    const subdomainTenant = require('../middleware/subdomainTenant');
    if (subdomainTenant && typeof subdomainTenant.invalidateCache === 'function') {
      subdomainTenant.invalidateCache(rows[0].slug);
    }

    // Force invalidating teacher caches
    const { invalidateTeacherAuthCache } = require('../middleware/auth');
    if (typeof invalidateTeacherAuthCache === 'function') {
      invalidateTeacherAuthCache(teacherId);
    }

    _statsCache.ts = 0; // B4 FIX: stale stats after suspension change
    res.json({ success: true, is_platform_suspended: isSuspended });
  } catch (err) {
    console.error('Suspend teacher error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// BUG-7 FIX: Reset Teacher Password (admin-side, no old-password required)
router.post('/teachers/:id/reset-password', requireAdminAuth, async (req, res) => {
  const teacherId = parseInt(req.params.id, 10);
  if (isNaN(teacherId)) return res.status(400).json({ error: 'معرّف غير صحيح' });

  const { new_password, force_password_change } = req.body;
  if (!new_password) return res.status(400).json({ error: 'كلمة المرور الجديدة مطلوبة' });
  if (new_password.length < 8) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });

  try {
    const hashed = await bcrypt.hash(new_password, 10);
    const shouldForce = force_password_change !== false; // default true (admin reset = force change)
    const { rowCount } = await pool.query(
      'UPDATE teachers SET password = $1, force_password_change = $2 WHERE id = $3',
      [hashed, shouldForce, teacherId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'المدرس غير موجود' });

    // Invalidate cached JWT tokens for this teacher
    const { invalidateTeacherAuthCache } = require('../middleware/auth');
    if (typeof invalidateTeacherAuthCache === 'function') {
      invalidateTeacherAuthCache(teacherId);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Reset teacher password error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update Teacher Custom Features (Flags)
// B3 FIX: merge incoming feature flags with existing features_enabled instead of
// overwriting the whole object — prevents silently dropping future feature keys.
router.put('/teachers/:id/features', requireAdminAuth, async (req, res) => {
  const teacherId = parseInt(req.params.id, 10);
  if (isNaN(teacherId)) return res.status(400).json({ error: 'معرّف غير صحيح' });

  const { live_streaming, stickman_run } = req.body;
  try {
    // Fetch current features first so we only overwrite known keys
    const current = await pool.query('SELECT features_enabled FROM teachers WHERE id = $1', [teacherId]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'المدرس غير موجود' });

    const existing = current.rows[0].features_enabled || {};
    const features = {
      ...existing,
      live_streaming: live_streaming !== false,
      stickman_run: stickman_run !== false,
    };

    const { rowCount } = await pool.query(
      'UPDATE teachers SET features_enabled = $1 WHERE id = $2',
      [JSON.stringify(features), teacherId]
    );

    if (rowCount === 0) return res.status(404).json({ error: 'المدرس غير موجود' });

    // B4 FIX: invalidate stats cache whenever teacher features change
    _statsCache.ts = 0;

    res.json({ success: true, features });
  } catch (err) {
    console.error('Update teacher features error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ══════════════════════════════════════════════════════════════════
   3. Team Members Management
   ══════════════════════════════════════════════════════════════════ */

// List Support Team Members of a Teacher
router.get('/teachers/:id/team', requireAdminAuth, async (req, res) => {
  const teacherId = parseInt(req.params.id, 10);
  if (isNaN(teacherId)) return res.status(400).json({ error: 'معرّف غير صحيح' });
  try {
    const { rows } = await pool.query(
      'SELECT id, name, role_title, photo_url, whatsapp_phone, display_order FROM teacher_team_members WHERE teacher_id = $1 ORDER BY display_order, id',
      [teacherId]
    );
    res.json({ team: rows });
  } catch (err) {
    console.error('Get team members error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add Support Team Member
router.post('/teachers/:id/team', requireAdminAuth, async (req, res) => {
  const teacherId = parseInt(req.params.id, 10);
  if (isNaN(teacherId)) return res.status(400).json({ error: 'معرّف غير صحيح' });

  const { name, role_title, photo_url, whatsapp_phone, display_order } = req.body;
  if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO teacher_team_members (teacher_id, name, role_title, photo_url, whatsapp_phone, display_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [teacherId, name.trim(), role_title || null, photo_url || null, whatsapp_phone || null, parseInt(display_order) || 0]
    );
    res.status(201).json({ success: true, memberId: rows[0].id });
  } catch (err) {
    console.error('Add team member error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Edit Support Team Member
router.put('/teachers/:id/team/:memberId', requireAdminAuth, async (req, res) => {
  const teacherId = parseInt(req.params.id, 10);
  const memberId = parseInt(req.params.memberId, 10);
  if (isNaN(teacherId) || isNaN(memberId)) return res.status(400).json({ error: 'معرّفات غير صحيحة' });

  const { name, role_title, photo_url, whatsapp_phone, display_order } = req.body;
  if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });

  try {
    const { rowCount } = await pool.query(
      `UPDATE teacher_team_members
          SET name = $1, role_title = $2, photo_url = $3, whatsapp_phone = $4, display_order = $5
        WHERE id = $6 AND teacher_id = $7`,
      [name.trim(), role_title || null, photo_url || null, whatsapp_phone || null, parseInt(display_order) || 0, memberId, teacherId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'عضو فريق الدعم غير موجود' });
    res.json({ success: true });
  } catch (err) {
    console.error('Update team member error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete Support Team Member
router.delete('/teachers/:id/team/:memberId', requireAdminAuth, async (req, res) => {
  const teacherId = parseInt(req.params.id, 10);
  const memberId = parseInt(req.params.memberId, 10);
  if (isNaN(teacherId) || isNaN(memberId)) return res.status(400).json({ error: 'معرّفات غير صحيحة' });

  try {
    const { rowCount } = await pool.query(
      'DELETE FROM teacher_team_members WHERE id = $1 AND teacher_id = $2',
      [memberId, teacherId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'عضو فريق الدعم غير موجود' });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete team member error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ══════════════════════════════════════════════════════════════════
   4. Plans Management
   ══════════════════════════════════════════════════════════════════ */

// List Plans
router.get('/plans', requireAdminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
          sp.id, sp.name, sp.description, sp.category, sp.max_students, sp.price, 
          sp.first_month_price, sp.billing_type, sp.is_active, sp.sort_order, sp.created_at,
          COUNT(ts.id)::int AS subscribers_count
       FROM subscription_plans sp
       LEFT JOIN teacher_subscriptions ts ON ts.plan_id = sp.id AND ts.status = 'active'
       GROUP BY sp.id
       ORDER BY sp.sort_order, sp.id`
    );

    res.json({ plans: rows });
  } catch (err) {
    console.error('Get plans error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add Plan
router.post('/plans', requireAdminAuth, async (req, res) => {
  const { name, description, category, max_students, price, first_month_price, billing_type, sort_order } = req.body;
  if (!name || !category || !price || !billing_type) {
    return res.status(400).json({ error: 'اسم الباقة وفئتها وسعرها ونظام الفوترة مطلوبة' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO subscription_plans (name, description, category, max_students, price, first_month_price, billing_type, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        name.trim(),
        description || null,
        category,
        max_students ? parseInt(max_students) : null,
        parseFloat(price),
        first_month_price ? parseFloat(first_month_price) : null,
        billing_type,
        parseInt(sort_order) || 0,
      ]
    );
    res.status(201).json({ success: true, planId: rows[0].id });
  } catch (err) {
    console.error('Add plan error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Edit Plan
router.put('/plans/:id', requireAdminAuth, async (req, res) => {
  const planId = parseInt(req.params.id, 10);
  if (isNaN(planId)) return res.status(400).json({ error: 'معرّف غير صحيح' });

  const { name, description, category, max_students, price, first_month_price, billing_type, sort_order, is_active } = req.body;
  if (!name || !category || !price || !billing_type) {
    return res.status(400).json({ error: 'الحقول الأساسية مطلوبة' });
  }

  try {
    const { rowCount } = await pool.query(
      `UPDATE subscription_plans
          SET name = $1, description = $2, category = $3, max_students = $4, price = $5,
              first_month_price = $6, billing_type = $7, sort_order = $8, is_active = $9
        WHERE id = $10`,
      [
        name.trim(),
        description || null,
        category,
        max_students ? parseInt(max_students) : null,
        parseFloat(price),
        first_month_price ? parseFloat(first_month_price) : null,
        billing_type,
        parseInt(sort_order) || 0,
        is_active !== false,
        planId,
      ]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'الباقة غير موجودة' });
    res.json({ success: true });
  } catch (err) {
    console.error('Update plan error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete Plan
router.delete('/plans/:id', requireAdminAuth, async (req, res) => {
  const planId = parseInt(req.params.id, 10);
  if (isNaN(planId)) return res.status(400).json({ error: 'معرّف غير صحيح' });

  try {
    // Check if any subscriptions are using this plan
    const check = await pool.query('SELECT id FROM teacher_subscriptions WHERE plan_id = $1 LIMIT 1', [planId]);
    if (check.rows.length > 0) {
      return res.status(400).json({ error: 'لا يمكن حذف هذه الباقة لوجود اشتراكات نشطة أو سابقة مرتبطة بها' });
    }

    const { rowCount } = await pool.query('DELETE FROM subscription_plans WHERE id = $1', [planId]);
    if (rowCount === 0) return res.status(404).json({ error: 'الباقة غير موجودة' });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete plan error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ══════════════════════════════════════════════════════════════════
   5. Teacher Subscriptions
   ══════════════════════════════════════════════════════════════════ */

// List Subscriptions (Filtered by teacher, status)
router.get('/subscriptions', requireAdminAuth, async (req, res) => {
  const { teacher_id, status } = req.query;
  try {
    let queryStr = `
      SELECT ts.id, ts.teacher_id, ts.plan_id, ts.billing_type, ts.price_override, ts.start_date, ts.end_date, ts.status, ts.notes, ts.created_at,
             t.name AS teacher_name, t.slug AS teacher_slug,
             sp.name AS plan_name, sp.price AS plan_price, sp.category AS plan_category
        FROM teacher_subscriptions ts
        JOIN teachers t ON ts.teacher_id = t.id
        JOIN subscription_plans sp ON ts.plan_id = sp.id
    `;
    const values = [];

    // B1 FIX: validate teacher_id is a real integer before passing to DB
    const conditions = [];
    if (teacher_id) {
      const tid = parseInt(teacher_id, 10);
      if (isNaN(tid)) return res.status(400).json({ error: 'معرّف المدرس غير صحيح' });
      values.push(tid);
      conditions.push(`ts.teacher_id = ${values.length}`);
    }
    if (status) {
      const VALID_STATUSES = ['active', 'expired', 'cancelled'];
      if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'حالة الاشتراك غير صحيحة' });
      values.push(status);
      conditions.push(`ts.status = ${values.length}`);
    }

    if (conditions.length) {
      queryStr += ' WHERE ' + conditions.join(' AND ');
    }

    queryStr += ' ORDER BY ts.start_date DESC';

    const { rows } = await pool.query(queryStr, values);
    res.json({ subscriptions: rows });
  } catch (err) {
    console.error('Get subscriptions error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create/Link Subscription (Assign Package to Teacher)
router.post('/subscriptions', requireAdminAuth, async (req, res) => {
  const { teacher_id, plan_id, billing_type, price_override, start_date, end_date, notes } = req.body;
  if (!teacher_id || !plan_id || !start_date) {
    return res.status(400).json({ error: 'المدرس والباقة وتاريخ البدء حقول مطلوبة' });
  }

  try {
    // Check if teacher and plan exist
    const teacherCheck = await pool.query('SELECT id FROM teachers WHERE id = $1', [teacher_id]);
    if (teacherCheck.rows.length === 0) return res.status(400).json({ error: 'المدرس غير موجود' });

    const planCheck = await pool.query('SELECT id, price, billing_type, category FROM subscription_plans WHERE id = $1', [plan_id]);
    if (planCheck.rows.length === 0) return res.status(400).json({ error: 'الباقة غير موجودة' });

    const plan = planCheck.rows[0];

    // Deactivate previous active subscriptions of the same category (e.g. platform package) if this is a platform sub
    if (plan.category === 'platform') {
      await pool.query(
        `UPDATE teacher_subscriptions
            SET status = 'cancelled'
          WHERE teacher_id = $1 AND status = 'active'
            AND plan_id IN (SELECT id FROM subscription_plans WHERE category = 'platform')`,
        [teacher_id]
      );
    }

    const { rows } = await pool.query(
      `INSERT INTO teacher_subscriptions (teacher_id, plan_id, billing_type, price_override, start_date, end_date, status, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        teacher_id,
        plan_id,
        billing_type || plan.billing_type,
        price_override ? parseFloat(price_override) : plan.price,
        start_date,
        end_date || null,
        'active',
        notes || '',
        req.admin.id,
      ]
    );

    invalidateTeacherAuthCache(parseInt(teacher_id));
    res.status(201).json({ success: true, subscriptionId: rows[0].id });
  } catch (err) {
    console.error('Create subscription error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update Subscription Status or Details (extend end date, change price)
router.put('/subscriptions/:id', requireAdminAuth, async (req, res) => {
  const subId = parseInt(req.params.id, 10);
  if (isNaN(subId)) return res.status(400).json({ error: 'معرّف غير صحيح' });

  const { status, price_override, start_date, end_date, notes } = req.body;

  // B5 FIX: validate status is a known value
  if (status) {
    const VALID_STATUSES = ['active', 'expired', 'cancelled'];
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'حالة الاشتراك غير صحيحة، المقبول: active, expired, cancelled' });
    }
  }

  try {
    const subInfo = await pool.query('SELECT teacher_id FROM teacher_subscriptions WHERE id = $1', [subId]);
    if (subInfo.rows.length === 0) return res.status(404).json({ error: 'الاشتراك غير موجود' });
    const teacherId = subInfo.rows[0].teacher_id;

    // B2 FIX: price_override=0 is a valid price, don't treat it as null via falsy check
    const priceValue = (price_override !== undefined && price_override !== null && price_override !== '')
      ? parseFloat(price_override)
      : null;

    const { rowCount } = await pool.query(
      `UPDATE teacher_subscriptions
          SET status = $1, price_override = $2, start_date = $3, end_date = $4, notes = $5
        WHERE id = $6`,
      [status, priceValue, start_date, end_date || null, notes || '', subId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'الاشتراك غير موجود' });
    invalidateTeacherAuthCache(teacherId);
    res.json({ success: true });
  } catch (err) {
    console.error('Update subscription error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete/Cancel Subscription
router.delete('/subscriptions/:id', requireAdminAuth, async (req, res) => {
  const subId = parseInt(req.params.id, 10);
  if (isNaN(subId)) return res.status(400).json({ error: 'معرّف غير صحيح' });

  try {
    const subInfo = await pool.query('SELECT teacher_id FROM teacher_subscriptions WHERE id = $1', [subId]);
    if (subInfo.rows.length === 0) return res.status(404).json({ error: 'الاشتراك غير موجود' });
    const teacherId = subInfo.rows[0].teacher_id;

    const { rowCount } = await pool.query('DELETE FROM teacher_subscriptions WHERE id = $1', [subId]);
    if (rowCount === 0) return res.status(404).json({ error: 'الاشتراك غير موجود' });
    invalidateTeacherAuthCache(teacherId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete subscription error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ══════════════════════════════════════════════════════════════════
   6. Payments Management
   ══════════════════════════════════════════════════════════════════ */

// List Payments
router.get('/payments', requireAdminAuth, async (req, res) => {
  const { teacher_id } = req.query;
  try {
    let queryStr = `
      SELECT sp.id, sp.subscription_id, sp.teacher_id, sp.amount, sp.currency, sp.paid_at, sp.period_start, sp.period_end, sp.payment_method, sp.notes, sp.created_at,
             t.name AS teacher_name, t.slug AS teacher_slug,
             plan.name AS plan_name
        FROM subscription_payments sp
        JOIN teachers t ON sp.teacher_id = t.id
        JOIN teacher_subscriptions ts ON sp.subscription_id = ts.id
        JOIN subscription_plans plan ON ts.plan_id = plan.id
    `;
    const values = [];

    // B1 FIX: validate teacher_id is a real integer before passing to DB
    if (teacher_id) {
      const tid = parseInt(teacher_id, 10);
      if (isNaN(tid)) return res.status(400).json({ error: 'معرّف المدرس غير صحيح' });
      values.push(tid);
      queryStr += ` WHERE sp.teacher_id = $1`;
    }

    queryStr += ' ORDER BY sp.paid_at DESC';

    const { rows } = await pool.query(queryStr, values);
    res.json({ payments: rows });
  } catch (err) {
    console.error('Get payments error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Record Payment manually
router.post('/payments', requireAdminAuth, async (req, res) => {
  const { subscription_id, amount, paid_at, period_start, period_end, payment_method, notes } = req.body;
  if (!subscription_id || !amount || !paid_at) {
    return res.status(400).json({ error: 'معرّف الاشتراك والقيمة وتاريخ الدفع حقول مطلوبة' });
  }

  try {
    // Check subscription
    const subCheck = await pool.query('SELECT teacher_id FROM teacher_subscriptions WHERE id = $1', [subscription_id]);
    if (subCheck.rows.length === 0) return res.status(400).json({ error: 'الاشتراك المحدد غير موجود' });

    const teacherId = subCheck.rows[0].teacher_id;

    const { rows } = await pool.query(
      `INSERT INTO subscription_payments (subscription_id, teacher_id, amount, paid_at, period_start, period_end, payment_method, notes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        subscription_id,
        teacherId,
        parseFloat(amount),
        paid_at,
        period_start || null,
        period_end || null,
        payment_method || 'other',
        notes || '',
        req.admin.id,
      ]
    );

    res.status(201).json({ success: true, paymentId: rows[0].id });
  } catch (err) {
    console.error('Record payment error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete Payment (Correction of mistakes)
router.delete('/payments/:id', requireAdminAuth, async (req, res) => {
  const paymentId = parseInt(req.params.id, 10);
  if (isNaN(paymentId)) return res.status(400).json({ error: 'معرّف غير صحيح' });

  try {
    const { rowCount } = await pool.query('DELETE FROM subscription_payments WHERE id = $1', [paymentId]);
    if (rowCount === 0) return res.status(404).json({ error: 'الدفعة غير موجودة' });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete payment error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ══════════════════════════════════════════════════════════════════
   7. Platform Overall Statistics
   ══════════════════════════════════════════════════════════════════ */

router.get('/stats', requireAdminAuth, async (req, res) => {
  try {
    // R-2 OPT: serve from cache if fresh
    if (_statsCache.data && Date.now() - _statsCache.ts < _STATS_TTL) {
      return res.json(_statsCache.data);
    }

    // 1. Teachers count stats
    const teachersRes = await pool.query(
      `SELECT 
          COUNT(*)::int AS total,
          COUNT(CASE WHEN is_platform_suspended = true THEN 1 END)::int AS suspended
       FROM teachers`
    );
    const totalTeachers = teachersRes.rows[0].total;
    const suspendedTeachers = teachersRes.rows[0].suspended;
    const activeTeachers = totalTeachers - suspendedTeachers;

    // 2. Students count and active today stats
    const studentsRes = await pool.query(
      `SELECT 
          (SELECT COUNT(*)::int FROM students WHERE deleted_at IS NULL) AS total,
          (SELECT COUNT(DISTINCT student_id)::int FROM (
              SELECT student_id FROM video_progress WHERE last_watched_at >= CURRENT_DATE
              UNION
              SELECT student_id FROM exam_results WHERE created_at >= CURRENT_DATE
              UNION
              SELECT student_id FROM recitation_results WHERE created_at >= CURRENT_DATE
          ) AS active_today) AS active_today`
    );

    // 3. Subscriptions count stats
    const subsRes = await pool.query(
      `SELECT 
          COUNT(CASE WHEN status = 'active' THEN 1 END)::int AS active,
          COUNT(CASE WHEN status = 'expired' THEN 1 END)::int AS expired,
          COUNT(CASE WHEN status = 'active' AND end_date <= CURRENT_DATE + INTERVAL '7 days' THEN 1 END)::int AS expiring_soon,
          COUNT(CASE WHEN status = 'active' AND end_date <= CURRENT_DATE + INTERVAL '30 days' THEN 1 END)::int AS pending_renewals
       FROM teacher_subscriptions`
    );

    // 4. Payments collected this month (current calendar month)
    const paymentsRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0)::float AS total 
       FROM subscription_payments 
       WHERE paid_at >= DATE_TRUNC('month', CURRENT_DATE)`
    );

    // Active SSE connections count (live — not cached)
    const sseConnections = getTotalConnections();

    const response = {
      stats: {
        teachers: {
          total: totalTeachers,
          active: activeTeachers,
          suspended: suspendedTeachers,
        },
        students: {
          total: studentsRes.rows[0].total,
          active_today: studentsRes.rows[0].active_today,
        },
        sse_connections: sseConnections,
        subscriptions: {
          active: subsRes.rows[0].active,
          expired: subsRes.rows[0].expired,
          expiring_soon: subsRes.rows[0].expiring_soon,
        },
        payments: {
          collected_this_month: paymentsRes.rows[0].total,
          pending_renewals: subsRes.rows[0].pending_renewals,
        },
      },
    };
    _statsCache.data = response;
    _statsCache.ts   = Date.now();
    res.json(response);
  } catch (err) {
    console.error('Get platform stats error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ══════════════════════════════════════════════════════════════════
   8. Administrative Upload Endpoint
   ══════════════════════════════════════════════════════════════════ */

// Upload Image (For teacher logo, background/hero, or team photos)
// S4 FIX: apply upload rate limiter before processing
router.post('/upload/image', requireAdminAuth, adminUploadLimiter, uploadAdminImage.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'الرجاء اختيار ملف صورة صالح لرفعه' });
  }

  // Magic-byte check to prevent faked mime-type (M-11)
  if (!(await isValidImage(req.file.path))) {
    deleteFile(req.file.path);
    return res.status(400).json({ error: 'ملف الصورة المرفوع غير صالح أو تالف' });
  }

  // Convert to WebP for smaller file size (up to 80% reduction)
  try {
    const { filename: webpName } = await convertToWebp(req.file.path, req.file.filename);
    const fileUrl = `/uploads/admin/${webpName}`;
    res.json({ success: true, url: fileUrl });
  } catch (convErr) {
    console.error('[admin] WebP conversion error:', convErr.message);
    // convertToWebp throws without deleting the original on sharp failure,
    // so we must clean it up here to avoid orphan files on disk.
    deleteFile(req.file.path);
    return res.status(500).json({ error: 'خطأ أثناء معالجة الصورة' });
  }
}, (err, req, res, next) => {
  // Catch Multer errors
  res.status(400).json({ error: err.message });
});

module.exports = router;
