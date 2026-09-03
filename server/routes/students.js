const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('../db/connection');
const { authenticate, requireRole, invalidateStudentAuthCache } = require('../middleware/auth');
const { invalidateCache } = require('../lib/analyticsCache');
const { getPermissions } = require('../lib/permissionsCache');
const { validateStudent } = require('../middleware/validate');
const { logActivity, getActor, getIp } = require('../lib/activityLog');
const { pushSessionKicked, broadcastToTeacherAndAssistants } = require('../sse');

const router = express.Router();
router.use(authenticate);

// Rate limiter for student creation — 30 per minute per IP
const addStudentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات إضافة طلاب كثيرة جداً، حاول مرة أخرى بعد دقيقة' },
});

// Rate limiter for video-progress heartbeats — legit clients post once per 10s
// plus a few flushes (pause/unmount); keyed per student, not per IP, because
// many students can share one NAT IP.
const videoProgressLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `vp:${req.user.id}`,
  message: { error: 'تحديثات تقدم المشاهدة كثيرة جداً — أعد المحاولة لاحقاً' },
});

const getTeacherId = (req) => {
  if (req.user.role === 'teacher') return req.user.id;
  return req.user.teacher_id;
};

// Helper: Check student count against active subscription plan max_students limit
const checkStudentLimit = async (teacherId, toAddCount = 1, dbPool = pool) => {
  const subRes = await dbPool.query(
    `SELECT sp.max_students
       FROM teacher_subscriptions ts
       JOIN subscription_plans sp ON ts.plan_id = sp.id
      WHERE ts.teacher_id = $1 AND ts.status = 'active'
      LIMIT 1`,
    [teacherId]
  );
  if (subRes.rows.length === 0) {
    // If no active subscription exists, we allow it (for dev/test resilience)
    return { allowed: true };
  }
  const maxStudents = subRes.rows[0].max_students;
  if (maxStudents === null) return { allowed: true }; // Unlimited

  const countRes = await dbPool.query(
    'SELECT COUNT(*)::int AS count FROM students WHERE teacher_id = $1 AND deleted_at IS NULL AND is_simulation IS NOT TRUE',
    [teacherId]
  );
  const currentCount = countRes.rows[0].count;
  if (currentCount + toAddCount > maxStudents) {
    return { allowed: false, maxStudents, currentCount };
  }
  return { allowed: true };
};

// ── Stage → username prefix map ──
const STAGE_PREFIXES = {
  'الصف الأول الابتدائي': 'P1',
  'الصف الثاني الابتدائي': 'P2',
  'الصف الثالث الابتدائي': 'P3',
  'الصف الرابع الابتدائي': 'P4',
  'الصف الخامس الابتدائي': 'P5',
  'الصف السادس الابتدائي': 'P6',
  'الصف الأول الإعدادي': 'A',
  'الصف الثاني الإعدادي': 'B',
  'الصف الثالث الإعدادي': 'C',
  'الصف الأول الثانوي عام': 'HA',
  'الصف الأول الثانوي بكالوريا': 'HB',
  'الصف الثاني الثانوي عام': 'NA',
  'الصف الثاني الثانوي بكالوريا': 'NB',
  'الصف الثالث الثانوي': 'T',
};

// Returns the next available username for a teacher + stage (e.g. H001, H002 …)
const generateUsername = async (teacherId, stage, dbPool) => {
  const prefix = STAGE_PREFIXES[stage] || 'S';
  // Fetch all usernames that match PREFIX followed by digits only
  const { rows } = await dbPool.query(
    `SELECT username FROM students
     WHERE teacher_id = $1 AND username ~ $2 AND deleted_at IS NULL`,
    [teacherId, `^${prefix}[0-9]+$`]
  );
  let maxNum = 0;
  for (const row of rows) {
    const n = parseInt(row.username.slice(prefix.length), 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;
  }
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
};

// ── Preview next username for a given stage ──
// GET /students/stages — distinct academic stages for this teacher
router.get('/stages', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      `SELECT DISTINCT academic_stage FROM students
       WHERE teacher_id=$1 AND deleted_at IS NULL AND academic_stage IS NOT NULL AND is_simulation IS NOT TRUE
       ORDER BY academic_stage`,
      [teacherId]
    );
    res.json({ stages: result.rows.map(r => r.academic_stage) });
  } catch (err) {
    console.error('[students/stages]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Active-student count grouped by academic stage (used by the bulk-delete UI).
router.get('/stage-counts', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      `SELECT academic_stage AS stage, COUNT(*)::int AS count
         FROM students
        WHERE teacher_id=$1 AND deleted_at IS NULL AND academic_stage IS NOT NULL AND is_simulation IS NOT TRUE
        GROUP BY academic_stage
        ORDER BY academic_stage`,
      [teacherId]
    );
    res.json({ counts: result.rows });
  } catch (err) {
    console.error('[students/stage-counts]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /students/device-limit ───────────────────────────────────────────────
router.get('/device-limit', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      'SELECT max_allowed_devices FROM teachers WHERE id = $1',
      [teacherId]
    );
    const max_allowed_devices = Math.max(1, parseInt(result.rows[0]?.max_allowed_devices, 10) || 1);
    res.json({ max_allowed_devices });
  } catch (err) {
    console.error('[GET_DEVICE_LIMIT_ERROR]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /students/device-limit ───────────────────────────────────────────────
router.put('/device-limit', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  if (req.user.role === 'assistant') {
    const perms = await getPermissions(req.user.id, pool);
    if (!perms?.can_edit_students) return res.status(403).json({ error: 'Access denied: missing permission' });
  }

  const limit = parseInt(req.body.max_allowed_devices, 10);
  if (isNaN(limit) || limit < 1 || limit > 10) {
    return res.status(400).json({ error: 'الحد المسموح به يجب أن يكون رقماً بين 1 و 10 أجهزة' });
  }

  try {
    await pool.query(
      'UPDATE teachers SET max_allowed_devices = $1 WHERE id = $2',
      [limit, teacherId]
    );

    try {
      logActivity({
        teacherId,
        actor: getActor(req),
        ip: getIp(req),
        action: 'update_device_limit',
        entity: { type: 'teacher', id: teacherId },
        details: { max_allowed_devices: limit },
      });
    } catch (_) {}

    res.json({ success: true, max_allowed_devices: limit });
  } catch (err) {
    console.error('[PUT_DEVICE_LIMIT_ERROR]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/next-username', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { stage } = req.query;
  if (!stage) return res.status(400).json({ error: 'stage is required' });
  try {
    const username = await generateUsername(teacherId, stage, pool);
    res.json({ username, prefix: STAGE_PREFIXES[stage] || 'S' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// M-1 fix: assistants must have can_view_analytics to list students (PII guard).
// [AUDIT-FIX] Broadened to any-of can_view_analytics/can_add_students/can_edit_students/
// can_delete_students — an assistant granted ONLY e.g. can_add_students still needs to
// see the roster to operate on it; the list itself isn't the sensitive part, viewing
// PII without any student-management permission at all is.
router.get('/', requireRole('teacher', 'assistant'), (req, res, next) => checkAnyPermission(req, res, next, ['can_view_analytics', 'can_add_students', 'can_edit_students', 'can_delete_students']), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { search, stage } = req.query;
  try {
    const params = [teacherId];
    let searchClause = '';
    let stageClause = '';
    if (stage && stage.trim() && stage.trim() !== 'الكل') {
      params.push(stage.trim());
      stageClause = `AND s.academic_stage = $${params.length}`;
    }
    if (search && search.trim()) {
      const escaped = search.trim()
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');
      params.push(`%${escaped}%`);
      searchClause = `AND (s.name ILIKE $${params.length} ESCAPE '\\' OR s.username ILIKE $${params.length} ESCAPE '\\' OR s.phone ILIKE $${params.length} ESCAPE '\\')`;
    }
    if (req.query.page) {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
      const offset = (page - 1) * pageSize;
      params.push(pageSize, offset);
      const countParams = params.slice(0, -2);
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total FROM students s WHERE s.teacher_id = $1 AND s.deleted_at IS NULL AND (s.is_simulation IS NOT TRUE) ${stageClause} ${searchClause}`,
        countParams
      );
      const result = await pool.query(
        `SELECT s.id, s.username, s.name, s.plain_password, s.phone, s.parent_phone, s.academic_stage,
                s.gender, s.teacher_id, s.points, s.created_at, s.deleted_at, s.fcm_token,
                s.is_suspended,
                COUNT(CASE WHEN sce.status = 'active' THEN sce.course_id END)::int as enrolled_courses
         FROM students s
         LEFT JOIN student_course_enrollment sce ON s.id = sce.student_id
         WHERE s.teacher_id = $1 AND s.deleted_at IS NULL AND (s.is_simulation IS NOT TRUE) ${stageClause} ${searchClause}
         GROUP BY s.id ORDER BY s.created_at DESC
         LIMIT $${countParams.length + 1} OFFSET $${countParams.length + 2}`,
        params
      );
      return res.json({ students: result.rows, total: countRes.rows[0].total, page, pageSize });
    }
    const result = await pool.query(
      `SELECT s.id, s.username, s.name, s.plain_password, s.phone, s.parent_phone, s.academic_stage,
              s.gender, s.teacher_id, s.points, s.created_at, s.deleted_at, s.fcm_token,
              s.is_suspended,
              COUNT(CASE WHEN sce.status = 'active' THEN sce.course_id END)::int as enrolled_courses
       FROM students s
       LEFT JOIN student_course_enrollment sce ON s.id = sce.student_id
       WHERE s.teacher_id = $1 AND s.deleted_at IS NULL AND (s.is_simulation IS NOT TRUE) ${stageClause} ${searchClause}
       GROUP BY s.id ORDER BY s.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

const checkPermission = async (req, res, next, perm) => {
  if (req.user.role === 'teacher') return next();
  try {
    const perms = await getPermissions(req.user.id, pool);
    if (!perms) return res.status(403).json({ error: 'Access denied' });
    if (!perms[perm]) return res.status(403).json({ error: 'Access denied: missing permission' });
    next();
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// [AUDIT-FIX] Any-of variant: passes if the assistant has AT LEAST ONE of the listed
// permissions. Teachers always pass.
const checkAnyPermission = async (req, res, next, permsList) => {
  if (req.user.role === 'teacher') return next();
  try {
    const perms = await getPermissions(req.user.id, pool);
    if (!perms || !permsList.some(p => perms[p])) {
      return res.status(403).json({ error: 'Access denied: missing permission' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

router.post('/', addStudentLimiter, requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_add_students'), validateStudent, async (req, res) => {
  const teacherId = getTeacherId(req);

  // Enforce student limit check (package constraints)
  try {
    const limitCheck = await checkStudentLimit(teacherId, 1, pool);
    if (!limitCheck.allowed) {
      return res.status(403).json({
        error: `لقد تجاوزت الحد الأقصى لعدد الطلاب المسموح به في باقة اشتراكك الحالية (الحد الأقصى: ${limitCheck.maxStudents} طالب، الحالي: ${limitCheck.currentCount} طالب). يرجى ترقية الباقة لزيادة هذا الحد.`
      });
    }
  } catch (limitErr) {
    console.error('[checkStudentLimit] error:', limitErr.message);
    return res.status(500).json({ error: 'Server error' });
  }

  const { name, phone, parent_phone, academic_stage, gender, credMode, manualUsername, manualPassword } = req.body;

  // Resolve credential mode: default to 'auto' for backward-compat
  const isManualMode = credMode === 'manual';

  // Manual mode requires both fields; auto mode ignores them entirely
  if (isManualMode) {
    if (!manualUsername || !String(manualUsername).trim())
      return res.status(400).json({ error: 'اسم المستخدم مطلوب في وضع الإدخال اليدوي' });
    if (!manualPassword || String(manualPassword).length < 5)
      return res.status(400).json({ error: 'كلمة المرور مطلوبة ويجب أن تكون 5 أحرف على الأقل' });
  }

  // Password: manual or auto-generated
  const finalPassword = isManualMode
    ? String(manualPassword).trim()
    : String(100000 + crypto.randomInt(0, 900000));

  // Sanitize gender: empty string violates CHECK constraint, convert to NULL
  const safeGender = gender || null;
  try {
    // Sanitize student name: trim, collapse whitespace, strip control characters
    const safeName = String(name || '').trim().replace(/[\x00-\x1f\x7f-\x9f]/g, '').slice(0, 100);
    if (!safeName) return res.status(400).json({ error: 'اسم الطالب مطلوب' });

    // Username: manual or auto-generated (auto mode ignores manualUsername entirely)
    let username;
    if (isManualMode) {
      username = String(manualUsername).trim();
      // Check uniqueness within this teacher's students
      const { rows: existing } = await pool.query(
        'SELECT id FROM students WHERE username=$1 AND teacher_id=$2 AND deleted_at IS NULL',
        [username, teacherId]
      );
      if (existing.length > 0) {
        return res.status(409).json({ error: `اسم المستخدم "${username}" مستخدم بالفعل لدى طالب آخر` });
      }
    } else {
      username = await generateUsername(teacherId, academic_stage || '', pool);
    }

    // Retry up to 5 times on race-condition duplicate (only relevant for auto-generated usernames)
    let retries = 0;
    while (retries < 5) {
      try {
        const hashed = await bcrypt.hash(finalPassword, 10);
        const result = await pool.query(
          'INSERT INTO students (username,password,plain_password,name,phone,parent_phone,academic_stage,gender,teacher_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
          [username, hashed, finalPassword, name, phone, parent_phone, academic_stage, safeGender, teacherId]
        );
        invalidateCache(teacherId);
        // Auto-enroll new student in teacher's published free courses
        // [BUG-FIX] Use ON CONFLICT DO UPDATE to reactivate any existing inactive enrollment
        let enrollWarning = null;
        try {
          await pool.query(
            `INSERT INTO student_course_enrollment (student_id, course_id, status)
             SELECT $1, c.id, 'active' FROM courses c
             WHERE c.teacher_id = $2 AND c.is_free = true AND c.is_published = true
               AND (c.target_stage IS NULL OR c.target_stage = '' OR c.target_stage = $3)
             ON CONFLICT (student_id, course_id) DO UPDATE SET status = 'active'`,
            [result.rows[0].id, teacherId, academic_stage || '']
          );
        } catch (enrollErr) {
          console.warn('[auto-enroll] Failed to enroll student in free courses:', enrollErr.message);
          enrollWarning = 'تعذّر التسجيل التلقائي في الكورسات المجانية';
        }
        const { password: _, plain_password: __, ...safe } = result.rows[0];
        logActivity({
          teacherId, actor: getActor(req), ip: getIp(req),
          action: 'add_student',
          entity: { type: 'student', id: safe.id, name: safe.name },
          details: { username: safe.username, academic_stage, gender },
        });
        return res.status(201).json({ ...safe, generated_password: finalPassword, ...(enrollWarning ? { warning: enrollWarning } : {}) });
      } catch (err) {
        if (err.code === '23505' && !isManualMode) {
          // Race condition on auto-generated username — retry with a new one
          retries++;
          username = await generateUsername(teacherId, academic_stage || '', pool);
        } else if (err.code === '23505' && isManualMode) {
          return res.status(409).json({ error: `اسم المستخدم "${username}" مستخدم بالفعل لدى طالب آخر` });
        } else {
          throw err;
        }
      }
    }
    return res.status(409).json({ error: 'تعذّر توليد اسم مستخدم فريد، حاول مرة أخرى' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_edit_students'), validateStudent, async (req, res) => {
  const teacherId = getTeacherId(req);
  const studentId = parseInt(req.params.id, 10);
  if (isNaN(studentId) || studentId <= 0) return res.status(400).json({ error: 'Invalid student ID' });
  const { name, phone, parent_phone, academic_stage, gender, password, username } = req.body;
  // Sanitize gender: empty string violates CHECK constraint, convert to NULL
  const safeGender = gender || null;
  try {
    const existingRes = await pool.query(
      'SELECT id, username, academic_stage FROM students WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL',
      [studentId, teacherId]
    );
    if (!existingRes.rows.length) return res.status(404).json({ error: 'Student not found' });
    const currentStudent = existingRes.rows[0];
    const oldStage = currentStudent.academic_stage;

    // Determine target username (if provided, use new one; otherwise keep existing)
    let newUsername = currentStudent.username;
    if (username !== undefined && username !== null && String(username).trim() !== '') {
      newUsername = String(username).trim();
    }

    // Check duplicate username across this teacher's active students (or globally if constraint exists)
    if (newUsername !== currentStudent.username) {
      const duplicateCheck = await pool.query(
        'SELECT id FROM students WHERE username = $1 AND teacher_id = $2 AND id <> $3 AND deleted_at IS NULL',
        [newUsername, teacherId, studentId]
      );
      if (duplicateCheck.rows.length > 0) {
        return res.status(409).json({ error: `كود الطالب (اسم المستخدم) "${newUsername}" مستخدم بالفعل لدى طالب آخر` });
      }
    }

    let query, params;
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      query = 'UPDATE students SET name=$1,phone=$2,parent_phone=$3,academic_stage=$4,gender=$5,password=$6,plain_password=$7,username=$8 WHERE id=$9 AND teacher_id=$10 RETURNING *';
      params = [name, phone, parent_phone, academic_stage, safeGender, hashed, password, newUsername, studentId, teacherId];
    } else {
      query = 'UPDATE students SET name=$1,phone=$2,parent_phone=$3,academic_stage=$4,gender=$5,username=$6 WHERE id=$7 AND teacher_id=$8 RETURNING *';
      params = [name, phone, parent_phone, academic_stage, safeGender, newUsername, studentId, teacherId];
    }
    const result = await pool.query(query, params);
    if (!result.rows.length) return res.status(404).json({ error: 'Student not found' });

    // When student's academic stage changes:
    // 1. Deactivate active enrollments for courses belonging specifically to other academic stages
    // 2. Auto-enroll in new stage free published courses
    // 3. Clean up pending course enrollment requests for old stage courses
    if (academic_stage !== undefined && academic_stage !== null && academic_stage !== oldStage) {
      try {
        await pool.query(
          `UPDATE student_course_enrollment
           SET status = 'inactive'
           WHERE student_id = $1
             AND course_id IN (
               SELECT id FROM courses
               WHERE teacher_id = $2
                 AND target_stage IS NOT NULL
                 AND target_stage != ''
                 AND target_stage != $3
             )`,
          [studentId, teacherId, academic_stage || '']
        );

        await pool.query(
          `INSERT INTO student_course_enrollment (student_id, course_id, status)
           SELECT $1, c.id, 'active'
           FROM courses c
           WHERE c.teacher_id = $2 AND c.is_free = true AND c.is_published = true
             AND (c.target_stage IS NULL OR c.target_stage = '' OR c.target_stage = $3)
           ON CONFLICT (student_id, course_id) DO UPDATE SET status = 'active'`,
          [studentId, teacherId, academic_stage || '']
        );

        await pool.query(
          `DELETE FROM course_enrollment_requests
           WHERE student_id = $1
             AND course_id IN (
               SELECT id FROM courses
               WHERE teacher_id = $2
                 AND target_stage IS NOT NULL
                 AND target_stage != ''
                 AND target_stage != $3
             )
             AND status = 'pending'`,
          [studentId, teacherId, academic_stage || '']
        );
      } catch (stageUpdateErr) {
        console.warn('[PUT /students/:id] Stage enrollment sync warning:', stageUpdateErr.message);
      }
    }

    invalidateStudentAuthCache(studentId);
    invalidateCache(teacherId);
    const { password: _, plain_password: __, ...safe } = result.rows[0];
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'edit_student',
      entity: { type: 'student', id: safe.id, name: safe.name },
      details: { username: safe.username, academic_stage, gender },
    });
    res.json(safe);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: `كود الطالب (اسم المستخدم) "${username}" مستخدم بالفعل لدى طالب آخر` });
    }
    console.error('[PUT /students/:id]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Import Model (must be before /:id to avoid route shadowing) ───────────────

router.get('/import-model', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const r = await pool.query(
      'SELECT id, headers, sample_row, mappings, updated_at FROM teacher_import_models WHERE teacher_id = $1',
      [teacherId]
    );
    res.json({ model: r.rows[0] || null });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/import-model', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { headers, sample_row, mappings } = req.body;
  if (!Array.isArray(headers) || !headers.length) return res.status(400).json({ error: 'يجب توفير أعمدة الملف' });
  if (!mappings?.name) return res.status(400).json({ error: 'يجب ربط عمود اسم الطالب على الأقل' });
  const ALLOWED = ['name', 'phone', 'parent_phone', 'username', 'password', 'gender', 'academic_stage'];
  const clean = {};
  for (const f of ALLOWED) { if (mappings[f] && typeof mappings[f] === 'string') clean[f] = mappings[f].slice(0, 200); }
  try {
    await pool.query(
      `INSERT INTO teacher_import_models (teacher_id, headers, sample_row, mappings)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (teacher_id) DO UPDATE SET
         headers=EXCLUDED.headers, sample_row=EXCLUDED.sample_row, mappings=EXCLUDED.mappings, updated_at=NOW()`,
      [teacherId, JSON.stringify(headers.map(h => String(h).slice(0, 200))), JSON.stringify(sample_row || {}), JSON.stringify(clean)]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/import-model', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query('DELETE FROM teacher_import_models WHERE teacher_id=$1 RETURNING id', [teacherId]);
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Bulk delete all active students of a single academic stage (soft delete).
// Mirrors the single-student DELETE logic but scopes by stage + teacher.
router.post('/bulk-delete-stage', requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_delete_students'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { stage } = req.body || {};
  if (!stage || typeof stage !== 'string' || !stage.trim()) {
    return res.status(400).json({ error: 'المرحلة الدراسية مطلوبة' });
  }
  const stageName = stage.trim();
  try {
    const idsRes = await pool.query(
      'SELECT id FROM students WHERE teacher_id=$1 AND academic_stage=$2 AND deleted_at IS NULL',
      [teacherId, stageName]
    );
    const studentIds = idsRes.rows.map(r => r.id);
    if (studentIds.length === 0) {
      return res.status(404).json({ error: 'لا يوجد طلاب نشطون في هذه المرحلة' });
    }
    await pool.query(
      'UPDATE students SET deleted_at=NOW() WHERE teacher_id=$1 AND academic_stage=$2 AND deleted_at IS NULL',
      [teacherId, stageName]
    );
    // Best-effort cleanup, matching single-student DELETE behaviour
    await pool.query(
      "UPDATE student_course_enrollment SET status='inactive' WHERE student_id = ANY($1::int[])",
      [studentIds]
    ).catch(err => console.warn('[bulk-delete-stage] enrollment:', err.message));
    await pool.query(
      'DELETE FROM student_devices WHERE student_id = ANY($1::int[])',
      [studentIds]
    ).catch(err => console.warn('[bulk-delete-stage] devices:', err.message));
    await pool.query(
      'DELETE FROM exam_sessions WHERE student_id = ANY($1::int[])',
      [studentIds]
    ).catch(err => console.warn('[bulk-delete-stage] exam_sessions:', err.message));
    await pool.query(
      "UPDATE live_stream_viewers SET is_active=false, left_at=NOW() WHERE student_id = ANY($1::int[]) AND is_active=true",
      [studentIds]
    ).catch(err => console.warn('[bulk-delete-stage] live viewers:', err.message));
    await pool.query(
      'DELETE FROM video_progress WHERE student_id = ANY($1::int[])',
      [studentIds]
    ).catch(err => console.warn('[bulk-delete-stage] video_progress:', err.message));
    await pool.query(
      'UPDATE exam_results SET is_latest=false WHERE student_id = ANY($1::int[])',
      [studentIds]
    ).catch(err => console.warn('[bulk-delete-stage] exam_results:', err.message));

    invalidateCache(teacherId);
    studentIds.forEach(id => invalidateStudentAuthCache(id));

    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'bulk_delete_students_by_stage',
      entity: { type: 'stage', name: stageName, count: studentIds.length },
    });

    res.json({ message: 'Students deleted', stage: stageName, count: studentIds.length });
  } catch (err) {
    console.error('[bulk-delete-stage] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireRole('teacher', 'assistant'), async (req, res, next) => {
  // Safety net: if Express somehow routes /import-model to /:id, handle it here
  if (req.params.id === 'import-model') {
    const teacherId = getTeacherId(req);
    try {
      const result = await pool.query('DELETE FROM teacher_import_models WHERE teacher_id=$1 RETURNING id', [teacherId]);
      return res.json({ success: true, deleted: result.rowCount });
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  }
  next();
}, (req, res, next) => checkPermission(req, res, next, 'can_delete_students'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const studentId = parseInt(req.params.id, 10);
  if (isNaN(studentId) || studentId <= 0) return res.status(400).json({ error: 'Invalid student ID' });
  try {
    const studentInfo = await pool.query(
      'SELECT name FROM students WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL',
      [studentId, teacherId]
    );
    const result = await pool.query(
      'UPDATE students SET deleted_at=NOW() WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL RETURNING id',
      [studentId, teacherId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Student not found' });
    // BUG-4 FIX: All cleanup queries must use the validated integer `studentId`,
    // not the raw URL string `req.params.id`. PostgreSQL will implicitly cast the
    // string but it is inconsistent and fragile if the param ever contains non-digits.
    await pool.query(
      "UPDATE student_course_enrollment SET status='inactive' WHERE student_id=$1",
      [studentId]
    ).catch(err => console.warn('[delete student] enrollment deactivation failed:', err.message));
    await pool.query(
      'DELETE FROM student_devices WHERE student_id=$1',
      [studentId]
    ).catch(err => console.warn('[delete student] device cleanup failed:', err.message));
    await pool.query(
      'DELETE FROM exam_sessions WHERE student_id=$1',
      [studentId]
    ).catch(err => console.warn('[delete student] exam session cleanup failed:', err.message));
    await pool.query(
      "UPDATE live_stream_viewers SET is_active=false, left_at=NOW() WHERE student_id=$1 AND is_active=true",
      [studentId]
    ).catch(err => console.warn('[delete student] live viewer cleanup failed:', err.message));
    await pool.query(
      'DELETE FROM video_progress WHERE student_id=$1',
      [studentId]
    ).catch(err => console.warn('[delete student] video progress cleanup failed:', err.message));
    await pool.query(
      'UPDATE exam_results SET is_latest=false WHERE student_id=$1',
      [studentId]
    ).catch(err => console.warn('[delete student] exam results cleanup failed:', err.message));
    invalidateCache(teacherId);
    invalidateStudentAuthCache(studentId);
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'delete_student',
      entity: { type: 'student', id: studentId, name: studentInfo.rows[0]?.name },
    });
    res.json({ message: 'Student deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/results', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const studentId = parseInt(req.params.id, 10);
  if (isNaN(studentId) || studentId <= 0) return res.status(400).json({ error: 'Invalid student ID' });
  try {
    if (req.user.role === 'assistant') {
      const perms = await getPermissions(req.user.id, pool);
      if (!perms?.can_view_analytics) return res.status(403).json({ error: 'Access denied: missing permission' });
    }
    const studentCheck = await pool.query(
      'SELECT id FROM students WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL',
      [studentId, teacherId]
    );
    if (!studentCheck.rows.length) return res.status(404).json({ error: 'Student not found' });
    const result = await pool.query(
      `SELECT er.*, e.title as exam_title, e.total_score, e.pass_score
       FROM exam_results er
       JOIN exams e ON er.exam_id = e.id
       WHERE er.student_id = $1 AND e.teacher_id = $2
       ORDER BY er.created_at DESC`,
      [studentId, teacherId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Full student profile (for teacher/assistant analytics) ──
router.get('/:id/profile', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const studentId = parseInt(req.params.id, 10);
  if (isNaN(studentId) || studentId <= 0) return res.status(400).json({ error: 'Invalid student ID' });
  try {
    if (req.user.role === 'assistant') {
      const perms = await getPermissions(req.user.id, pool);
      if (!perms?.can_view_analytics) return res.status(403).json({ error: 'Access denied: missing permission' });
    }
    // Student basic info
    const studentRes = await pool.query(
      `SELECT id, name, username, phone, parent_phone, academic_stage, gender, points, created_at
       FROM students WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL`,
      [studentId, teacherId]
    );
    if (!studentRes.rows.length) return res.status(404).json({ error: 'Student not found' });

    const [coursesRes, examsRes, paymentsRes, badgesRes, videoProgressRes, recitationsRes] = await Promise.all([
      // Enrolled courses + content counts + watched video count
      pool.query(`
        SELECT c.id, c.name, c.description, c.price, c.target_stage,
               sce.enrollment_date, sce.status,
               COUNT(DISTINCT v.id) as total_videos,
               COUNT(DISTINCT p.id) as total_pdfs,
               COUNT(DISTINCT CASE WHEN vp.progress_percentage >= 90 THEN vp.video_id END) as watched_videos,
               COALESCE(SUM(vp.watched_minutes), 0) as total_watched_minutes
        FROM student_course_enrollment sce
        JOIN courses c ON sce.course_id = c.id
        LEFT JOIN videos v ON v.course_id = c.id
        LEFT JOIN pdf_files p ON p.course_id = c.id
        LEFT JOIN video_progress vp ON vp.video_id = v.id AND vp.student_id = $1
        WHERE sce.student_id = $1
        GROUP BY c.id, sce.enrollment_date, sce.status
        ORDER BY sce.enrollment_date DESC
      `, [studentId]),

      // Last exam results (every attempt incl. archived is_latest=false) so the
      // teacher can see previous grades for the same exam, not just the latest.
      pool.query(`
        SELECT er.id, er.score, er.correct_count, er.wrong_count,
               er.unanswered_count, er.points_earned, er.created_at,
               er.attempt_number, er.is_latest, er.is_absent, er.exam_id,
               e.title as exam_title, e.total_score, e.pass_score,
               c.name as course_name
        FROM exam_results er
        JOIN exams e ON er.exam_id = e.id
        LEFT JOIN courses c ON e.course_id = c.id
        WHERE er.student_id = $1
        ORDER BY er.created_at DESC
        LIMIT 50
      `, [studentId]),

      // Payment history
      pool.query(`
        SELECT p.id, p.amount, p.method, p.payment_date, p.status,
               p.reference_number, p.notes,
               c.name as course_name
        FROM payments p
        LEFT JOIN courses c ON p.course_id = c.id
        WHERE p.student_id = $1
        ORDER BY p.payment_date DESC
      `, [studentId]),

      // Badges
      pool.query(`
        SELECT b.*, e.title as exam_title
        FROM badges b
        LEFT JOIN exams e ON b.exam_id = e.id
        WHERE b.student_id = $1
        ORDER BY b.earned_at DESC
      `, [studentId]),

      // Video progress summary
      pool.query(`
        SELECT vp.*, v.title as video_title, v.duration_minutes, c.name as course_name
        FROM video_progress vp
        JOIN videos v ON vp.video_id = v.id
        JOIN courses c ON v.course_id = c.id
        WHERE vp.student_id = $1
        ORDER BY vp.last_watched_at DESC
      `, [studentId]),

      // Last 5 recitation results
      pool.query(`
        SELECT rr.id, rr.score, rr.correct_count, rr.wrong_count,
               rr.unanswered_count, rr.points_earned, rr.passed, rr.created_at,
               r.title as recitation_title, r.total_score, r.pass_score
        FROM recitation_results rr
        JOIN recitations r ON rr.recitation_id = r.id
        WHERE rr.student_id = $1
        ORDER BY rr.created_at DESC
        LIMIT 5
      `, [studentId]),
    ]);

    res.json({
      student: studentRes.rows[0],
      courses: coursesRes.rows,
      examResults: examsRes.rows,
      payments: paymentsRes.rows,
      badges: badgesRes.rows,
      videoProgress: videoProgressRes.rows,
      recitationResults: recitationsRes.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Full stats for the logged-in student themselves ──
router.get('/me/stats', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  try {
    const [studentRes, coursesRes, examsRes, paymentsRes, badgesRes, videoProgressRes, rankRes] = await Promise.all([
      pool.query(
        `SELECT id, name, username, phone, parent_phone, academic_stage, gender, points, created_at
         FROM students WHERE id=$1`, [studentId]
      ),
      pool.query(`
        SELECT c.id, c.name, c.description, c.price, c.target_stage,
               sce.enrollment_date, sce.status,
               COUNT(DISTINCT v.id)::int  AS total_videos,
               COUNT(DISTINCT pf.id)::int AS total_pdfs,
               COUNT(DISTINCT CASE WHEN vp.progress_percentage >= 90 THEN vp.video_id END)::int AS watched_videos,
               COALESCE(SUM(vp.watched_minutes),0)::int AS total_watched_minutes,
               COALESCE(AVG(vp.progress_percentage),0)::numeric(5,1) AS avg_progress
        FROM student_course_enrollment sce
        JOIN courses c ON sce.course_id = c.id
        LEFT JOIN videos v  ON v.course_id = c.id
        LEFT JOIN pdf_files pf ON pf.course_id = c.id
        LEFT JOIN video_progress vp ON vp.video_id = v.id AND vp.student_id = $1
        WHERE sce.student_id = $1
        GROUP BY c.id, sce.enrollment_date, sce.status
        ORDER BY sce.enrollment_date DESC
      `, [studentId]),
      pool.query(`
        SELECT er.id, er.score, er.correct_count, er.wrong_count,
               er.unanswered_count, er.points_earned, er.start_time, er.end_time, er.created_at,
               er.is_absent,
               e.title AS exam_title, e.total_score, e.pass_score, e.badge_name, e.badge_color,
               c.name  AS course_name
        FROM exam_results er
        JOIN exams e ON er.exam_id = e.id
        LEFT JOIN courses c ON e.course_id = c.id
        -- BUG-7 FIX: exclude results for soft-deleted exams so the student's
        -- stats/summary (pass count, avg score, total exams) are not skewed by
        -- exams the teacher has deleted. Results rows are kept in DB for history
        -- but the student should not see or be graded against deleted exams.
        WHERE er.student_id = $1 AND e.deleted_at IS NULL
        ORDER BY er.created_at DESC
      `, [studentId]),
      pool.query(`
        SELECT p.id, p.amount, p.method, p.payment_date, p.status,
               p.reference_number, p.notes, c.name AS course_name, c.price AS course_price
        FROM payments p
        LEFT JOIN courses c ON p.course_id = c.id
        WHERE p.student_id = $1
        ORDER BY p.payment_date DESC
      `, [studentId]),
      pool.query(`
        SELECT b.*, e.title AS exam_title
        FROM badges b LEFT JOIN exams e ON b.exam_id = e.id
        WHERE b.student_id = $1 ORDER BY b.earned_at DESC
      `, [studentId]),
      pool.query(`
        SELECT vp.video_id, vp.watch_count, vp.watched_minutes, vp.progress_percentage, vp.last_watched_at,
               v.title AS video_title, v.duration_minutes, c.name AS course_name
        FROM video_progress vp
        JOIN videos v ON vp.video_id = v.id
        JOIN courses c ON v.course_id = c.id
        WHERE vp.student_id = $1
        ORDER BY vp.last_watched_at DESC
      `, [studentId]),
      pool.query(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN points > (SELECT points FROM students WHERE id=$1) THEN 1 ELSE 0 END) AS above
        FROM students WHERE teacher_id = (SELECT teacher_id FROM students WHERE id=$1)
          AND deleted_at IS NULL
      `, [studentId]),
    ]);

    if (!studentRes.rows.length) return res.status(404).json({ error: 'Student not found' });

    const student = studentRes.rows[0];
    const exams = examsRes.rows;
    const payments = paymentsRes.rows;

    // Aggregate totals — exclude absent records from pass/fail and avg calculations
    // so that absent rows don't inflate the fail count or depress the average score.
    const totalPaid = payments.filter(p => p.status === 'verified').reduce((s, p) => s + parseFloat(p.amount), 0);
    const totalPending = payments.filter(p => p.status === 'pending').reduce((s, p) => s + parseFloat(p.amount), 0);
    const absentCount = exams.filter(e => e.is_absent === true || e.is_absent === 'true').length;
    const takenExams = exams.filter(e => e.is_absent !== true && e.is_absent !== 'true');
    const passCount = takenExams.filter(e => parseInt(e.score) >= parseInt(e.pass_score)).length;
    const avgScore = takenExams.length ? Math.round(takenExams.reduce((s, e) => s + (e.score / e.total_score * 100), 0) / takenExams.length) : 0;
    const totalWatchedMinutes = videoProgressRes.rows.reduce((s, v) => s + v.watched_minutes, 0);

    // Rank among teacher's students by points (#1 = most points)
    const rankRow = rankRes.rows[0];
    const myRank = parseInt(rankRow.above) + 1;

    res.json({
      student,
      courses: coursesRes.rows,
      examResults: exams,
      payments,
      badges: badgesRes.rows,
      videoProgress: videoProgressRes.rows,
      summary: {
        totalPaid,
        totalPending,
        totalExams: exams.length,           // all results incl. absents
        takenCount: takenExams.length,       // actually-attempted exams
        passCount,
        failCount: takenExams.length - passCount,
        absentCount,
        avgScore,
        totalWatchedMinutes,
        totalCourses: coursesRes.rows.length,
        totalBadges: badgesRes.rows.length,
        rank: myRank,
        totalStudents: parseInt(rankRow.total),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


// ── Bulk import ───────────────────────────────────────────────────────────────

router.post('/bulk', requireRole('teacher', 'assistant'), (req, res, next) => checkPermission(req, res, next, 'can_add_students'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { students } = req.body;
  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: 'No students provided' });
  }
  const MAX_BULK = 200;
  if (students.length > MAX_BULK) {
    return res.status(400).json({ error: `الحد الأقصى للاستيراد الجماعي هو ${MAX_BULK} طالب في المرة الواحدة` });
  }

  // Enforce student limit check (package constraints)
  try {
    const limitCheck = await checkStudentLimit(teacherId, students.length, pool);
    if (!limitCheck.allowed) {
      return res.status(403).json({
        error: `الاستيراد سيتجاوز الحد الأقصى لعدد الطلاب المسموح به في باقة اشتراكك الحالية (الحد الأقصى: ${limitCheck.maxStudents} طالب، الحالي: ${limitCheck.currentCount} طالب، المطلوب إضافته: ${students.length} طالب). يرجى ترقية الباقة لزيادة هذا الحد.`
      });
    }
  } catch (limitErr) {
    console.error('[checkStudentLimit bulk] error:', limitErr.message);
    return res.status(500).json({ error: 'Server error' });
  }

  const EGYPTIAN_PHONE_RE = /^01[0125][0-9]{8}$/;
  const results = { success: 0, failed: 0, errors: [], created: [] };
  const newStudentIds = [];

  // ── Phase 1: Parse all rows and hash passwords BEFORE opening a DB transaction.
  //    bcrypt is CPU-bound and can take 100-300ms per hash. Holding a pool connection
  //    open during this time (especially for 100-200 students) exhausts the pool.

  const prepared = [];
  for (const [idx, s] of students.entries()) {
    const name = (s['الاسم'] || s['name'] || '').toString().trim().replace(/[\x00-\x1f\x7f-\x9f<>]/g, '').slice(0, 100);
    const manualUsername = (s['اسم المستخدم'] || s['username'] || '').toString().trim().replace(/[\x00-\x1f\x7f-\x9f<>]/g, '');
    const manualPassword = (s['كلمة المرور'] || s['password'] || '').toString().trim();
    const rawPhone = (s['الهاتف'] || s['phone'] || '').toString().trim();
    const rawParentPhone = (s['هاتف ولي الأمر'] || s['parent_phone'] || '').toString().trim();
    const cleanPhone = rawPhone ? rawPhone.replace(/[\s\-]/g, '') : '';
    const cleanParentPhone = rawParentPhone ? rawParentPhone.replace(/[\s\-]/g, '') : '';
    const phone = cleanPhone && EGYPTIAN_PHONE_RE.test(cleanPhone) ? cleanPhone : null;
    const parent_phone = cleanParentPhone && EGYPTIAN_PHONE_RE.test(cleanParentPhone) ? cleanParentPhone : null;
    if (rawPhone && !phone) results.errors.push(`${name || '?'}: رقم الهاتف "${rawPhone}" غير صحيح — تم تجاهله`);
    if (rawParentPhone && !parent_phone) results.errors.push(`${name || '?'}: هاتف ولي الأمر "${rawParentPhone}" غير صحيح — تم تجاهله`);
    const academic_stage = (s['المرحلة'] || s['academic_stage'] || '').toString().trim() || null;
    const rawGender = (s['الجنس'] || s['gender'] || '').toString().trim();
    // Normalize gender to match DB CHECK constraint (ذكر / أنثى)
    const gender = (() => {
      if (!rawGender) return null;
      const g = rawGender.normalize('NFC').replace(/\s/g, '');
      if (/^(ذكر|male|m|boy)$/i.test(g)) return 'ذكر';
      if (/^(أنثى|انثى|أنثي|انثي|female|f|girl)$/i.test(g)) return 'أنثى';
      return null; // unknown value → NULL (avoids CHECK violation)
    })();

    if (!name) {
      results.failed++;
      results.errors.push(`(صف فارغ): الاسم مطلوب`);
      prepared.push(null);
      continue;
    }

    const finalPassword = manualPassword || String(100000 + crypto.randomInt(0, 900000));
    const hashed = await bcrypt.hash(finalPassword, 12); // OUTSIDE transaction — intentional (increased from 10 to 12 rounds)
    prepared.push({ name, manualUsername, manualPassword, finalPassword, hashed, phone, parent_phone, academic_stage, gender });
  }

  // ── Phase 2: Open transaction and do all DB writes with pre-computed hashes
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const [rowIdx, row] of prepared.entries()) {
      if (!row) continue; // was a validation error in phase 1

      const { name, manualUsername, manualPassword, finalPassword, hashed, phone, parent_phone, academic_stage, gender } = row;

      // Use a SAVEPOINT per student so a single INSERT failure does NOT abort the
      // whole transaction and cascade-fail every student that comes after it.
      const sp = `sp_bulk_${rowIdx}`;
      await client.query(`SAVEPOINT ${sp}`);

      try {
        let username = manualUsername || await generateUsername(teacherId, academic_stage || '', client);
        let retries = 0;
        while (retries < 5) {
          try {
            const insertRes = await client.query(
              'INSERT INTO students (username,password,plain_password,name,phone,parent_phone,academic_stage,gender,teacher_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
              [username, hashed, finalPassword, name, phone, parent_phone, academic_stage, gender, teacherId]
            );
            await client.query(`RELEASE SAVEPOINT ${sp}`);
            newStudentIds.push(insertRes.rows[0].id);
            results.success++;
            results.created.push({ name, username, generated_password: finalPassword });
            break;
          } catch (err) {
            if (err.code === '23505' && !manualUsername) {
              // Retry with a fresh username — rollback to savepoint first so PG isn't in error state
              await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
              retries++;
              username = await generateUsername(teacherId, academic_stage || '', client);
            } else {
              throw err;
            }
          }
        }
        if (retries >= 5) {
          await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
          results.failed++;
          results.errors.push(`${name}: تعذّر توليد اسم مستخدم فريد`);
        }
      } catch (err) {
        // Roll back this student's savepoint so the transaction stays usable
        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`).catch(() => { });
        results.failed++;
        let reason = 'خطأ في الحفظ';
        if (err.code === '23505') reason = 'اسم المستخدم موجود مسبقاً';
        else if (err.code === '23514') reason = `قيمة غير مقبولة — كود: ${err.constraint || err.code}`;
        else if (err.code === '25P02') reason = 'خطأ داخلي في المعاملة';
        results.errors.push(`${name}: ${reason}`);
      }
    }

    await client.query('COMMIT');
    invalidateCache(teacherId);
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'bulk_import_students',
      entity: { type: 'student' },
      details: { count: results.success, failed: results.failed },
    });

    // Auto-enroll newly created students in the teacher's published free courses
    if (newStudentIds.length > 0) {
      pool.query(
        `INSERT INTO student_course_enrollment (student_id, course_id)
         SELECT s.id, c.id
         FROM students s
         JOIN courses c ON c.teacher_id = $1 AND c.is_free = true AND c.is_published = true
         WHERE s.id = ANY($2::int[])
           AND (c.target_stage IS NULL OR c.target_stage = '' OR c.target_stage = s.academic_stage)
         ON CONFLICT DO NOTHING`,
        [teacherId, newStudentIds]
      ).catch(e => console.warn('[bulk auto-enroll]', e.message));
    }

    res.json(results);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'حدث خطأ غير متوقع — تم التراجع عن جميع التغييرات، لم يُحفظ أي طالب' });
  } finally {
    client.release();
  }
});

// ── Save video progress ──
// Anti-tamper model (server-authoritative):
//   • The client reports only a DELTA of watch-seconds since its previous report.
//   • The server accepts at most (real elapsed time since this student's last
//     update for this video) × MAX_SPEED_FACTOR + GRACE — so a forged single
//     request can never grant more than ~GRACE seconds of watch credit.
//   • watched_minutes and progress_percentage are derived SERVER-SIDE from the
//     accumulated seconds; client-supplied values for those fields are ignored.
router.post('/me/video-progress', requireRole('student'), videoProgressLimiter, async (req, res) => {
  const studentId = req.user.id;
  const { video_id, watch_count_increment, last_position, actual_watched_seconds } = req.body;
  if (!video_id) return res.status(400).json({ error: 'video_id required' });
  try {
    // Verify the video belongs to a course the student is actively enrolled in,
    // and load any existing progress row for wall-clock validation.
    const ownershipCheck = await pool.query(
      `SELECT v.id, v.course_id, v.section_id, v.duration_minutes,
              vp.actual_watched_seconds AS prev_actual_seconds,
              vp.last_watched_at        AS prev_last_watched_at
         FROM videos v
         JOIN student_course_enrollment sce ON v.course_id = sce.course_id
         LEFT JOIN video_progress vp ON vp.video_id = v.id AND vp.student_id = $2
        WHERE v.id = $1 AND sce.student_id = $2 AND sce.status = 'active'`,
      [video_id, studentId]
    );
    if (!ownershipCheck.rows.length) {
      return res.status(403).json({ error: 'Access denied: video not in your enrolled courses' });
    }

    // [Phase-7] Server-authoritative section lock check. A video in a
    // section that's gated by an unpassed recitation must not accept
    // progress updates. This closes the "stale browser" loophole where a
    // student could keep watching a video that just became locked because
    // their browser still had the URL loaded. Returns the same 403 the
    // content endpoint would, with the same error message the student UI
    // already knows how to show.
    const videoRow = ownershipCheck.rows[0];
    const videoSectionId = videoRow.section_id ? Number(videoRow.section_id) : null;
    if (videoSectionId) {
      const gateRes = await pool.query(
        `SELECT s.id, s.title
           FROM sections s
           JOIN sections target ON target.id = $3
          WHERE s.course_id = $1
            AND (s.sort_order < target.sort_order OR (s.sort_order = target.sort_order AND s.id < target.id))
            AND EXISTS (
              SELECT 1 FROM recitations r
               WHERE r.section_id = s.id
                 AND r.is_published = true
                 AND r.deleted_at IS NULL
                 AND r.is_gate_required = true
            )
            AND NOT EXISTS (
              SELECT 1 FROM recitations r
               JOIN recitation_results rr ON rr.recitation_id = r.id
              WHERE r.section_id = s.id
                AND r.is_published = true
                AND r.deleted_at IS NULL
                AND r.is_gate_required = true
                AND rr.student_id = $2
                AND rr.passed = true
                AND (rr.is_absent IS NULL OR rr.is_absent = false)
            )
          ORDER BY s.sort_order ASC, s.id ASC
          LIMIT 1`,
        [videoRow.course_id, studentId, videoSectionId]
      );
      if (gateRes.rows.length > 0) {
        const blockingTitle = gateRes.rows[0].title;
        return res.status(403).json({
          error: `هذا الفيديو في فصل مقفل — يجب اجتياز تسميع فصل (${blockingTitle}) أولاً`,
        });
      }
    }
    let durationMinutes = parseFloat(videoRow.duration_minutes) || 0;

    // [Duration adoption] URL videos added without a duration can't be verified
    // against anything. When the player measures a sane one, persist it ONCE
    // (only while still unset) so future updates become fully verifiable.
    const measuredSec = parseFloat(req.body.measured_duration_seconds) || 0;
    if (durationMinutes <= 0 && measuredSec >= 30 && measuredSec <= 86400) {
      const measuredMinutes = Math.ceil(measuredSec / 60);
      const adoptRes = await pool.query(
        `UPDATE videos SET duration_minutes = $2
          WHERE id = $1 AND (duration_minutes IS NULL OR duration_minutes = 0)
          RETURNING duration_minutes`,
        [video_id, measuredMinutes]
      );
      if (adoptRes.rows.length) durationMinutes = parseFloat(adoptRes.rows[0].duration_minutes) || 0;
    }

    // [Anti-cheat] Wall-clock cap: each request may add at most the real time
    // elapsed since this student's previous update × MAX_SPEED_FACTOR + GRACE.
    // 2.5× covers max playback speed (2×); +30s covers timer throttling in
    // background tabs and flush timing. A brand-new row gets a small fixed
    // grant instead — enough for an honest first heartbeat (~10s of playback),
    // far short of the full duration a forged request would claim.
    const VIDEO_MAX_SPEED_FACTOR = 2.5;
    const VIDEO_GRACE_SECONDS = 30;
    const FIRST_UPDATE_GRACE_SECONDS = 45;
    const prevActual = parseInt(videoRow.prev_actual_seconds, 10) || 0;
    const elapsedSec = videoRow.prev_last_watched_at
      ? Math.max(0, (Date.now() - new Date(videoRow.prev_last_watched_at).getTime()) / 1000)
      : null;
    const wallClockAllowance = elapsedSec === null
      ? FIRST_UPDATE_GRACE_SECONDS
      : Math.ceil(elapsedSec * VIDEO_MAX_SPEED_FACTOR) + VIDEO_GRACE_SECONDS;

    const maxWatchedSeconds = durationMinutes > 0 ? durationMinutes * 60 : 86400;
    const rawDelta = Math.max(0, Math.min(actual_watched_seconds || 0, wallClockAllowance));
    // Absolute accumulated total, capped by the real duration.
    const totalActualSeconds = Math.min(prevActual + Math.round(rawDelta), maxWatchedSeconds);

    // Server-derived stats — client-reported watched_minutes/progress ignored.
    const newWatchedMinutes = Math.floor(totalActualSeconds / 60);
    let serverProgress = 0;
    if (durationMinutes > 0) {
      serverProgress = Math.min(100, (totalActualSeconds / (durationMinutes * 60)) * 100);
    } else {
      // Duration genuinely unknown (adoption didn't apply) — fall back to the
      // client-provided percentage capped at 100.
      serverProgress = Math.min(100, Math.max(0, parseFloat(req.body.progress_percentage) || 0));
    }
    serverProgress = Math.round(serverProgress * 100) / 100;

    const positionCap = durationMinutes > 0 ? durationMinutes * 60 : 86400;
    const safePosition = Math.max(0, Math.min(parseFloat(last_position) || 0, positionCap));

    await pool.query(
      `INSERT INTO video_progress (student_id, video_id, watch_count, watched_minutes, progress_percentage, last_watched_at, last_position, actual_watched_seconds)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)
       ON CONFLICT (student_id, video_id) DO UPDATE SET
         watch_count = CASE WHEN $3 > 0 THEN video_progress.watch_count + $3 ELSE video_progress.watch_count END,
         watched_minutes = $4,
         progress_percentage = GREATEST(video_progress.progress_percentage, $5),
         last_watched_at = NOW(),
         last_position = $6,
         actual_watched_seconds = $7`,
      [studentId, video_id, watch_count_increment || 0, newWatchedMinutes, serverProgress, safePosition, totalActualSeconds]
    );

    res.json({
      ok: true,
      actual_watched_seconds: totalActualSeconds,
      watched_minutes: newWatchedMinutes,
      progress_percentage: serverProgress,
      duration_adopted: durationMinutes > 0 && !(parseFloat(videoRow.duration_minutes) > 0),
    });

    // ── Award course completion points if all videos watched (race-safe) ──
    try {
      const courseRow = await pool.query('SELECT course_id FROM videos WHERE id=$1', [video_id]);
      if (courseRow.rows.length && courseRow.rows[0].course_id) {
        const courseId = courseRow.rows[0].course_id;
        const [courseRes, videosRes] = await Promise.all([
          pool.query('SELECT points_on_complete FROM courses WHERE id=$1', [courseId]),
          pool.query('SELECT id, duration_minutes FROM videos WHERE course_id=$1', [courseId]),
        ]);
        const pointsOnComplete = courseRes.rows[0]?.points_on_complete || 0;
        // [M-10] FIX: only award completion points if ALL videos have known duration_minutes > 0.
        // URL videos without duration let the client send a fake 100% progress,
        // which would otherwise trigger bogus completion rewards.
        const allHaveDuration = videosRes.rows.every(v => parseFloat(v.duration_minutes) > 0);
        if (pointsOnComplete > 0 && videosRes.rows.length > 0 && allHaveDuration) {
          const doneRes = await pool.query(
            'SELECT COUNT(*) FROM video_progress WHERE student_id=$1 AND video_id = ANY($2) AND progress_percentage >= 90',
            [studentId, videosRes.rows.map(v => v.id)]
          );
          if (parseInt(doneRes.rows[0].count) >= videosRes.rows.length) {
            // Atomic: INSERT only if not exists, then UPDATE only if INSERT actually inserted
            const insertRes = await pool.query(
              'INSERT INTO course_completion_points (student_id, course_id, points_awarded) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',
              [studentId, courseId, pointsOnComplete]
            );
            if (insertRes.rows.length > 0) {
              await pool.query('UPDATE students SET points = points + $1 WHERE id=$2', [pointsOnComplete, studentId]);
            }
          }
        }
      }
    } catch (completionErr) {
      console.error('[video-progress completion]', completionErr.message);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me/dashboard', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  try {
    const [enrollments, results, progress, badges, student, totalExamsRes] = await Promise.all([
      pool.query(`
        SELECT sce.*, c.name, c.description, c.thumbnail_url
        FROM student_course_enrollment sce
        JOIN courses c ON sce.course_id = c.id
        JOIN students s ON s.id = sce.student_id
        WHERE sce.student_id = $1
          AND sce.status = 'active'
          AND c.is_published = true
          AND (c.target_stage IS NULL OR c.target_stage = '' OR c.target_stage = s.academic_stage)
      `, [studentId]),
      // BUG-5 FIX: filter e.deleted_at IS NULL so soft-deleted exams don't appear
      // in the student's recent results list on their dashboard.
      pool.query('SELECT er.*, e.title as exam_title, e.total_score, e.pass_score FROM exam_results er JOIN exams e ON er.exam_id=e.id WHERE er.student_id=$1 AND er.is_latest=true AND e.deleted_at IS NULL ORDER BY er.created_at DESC LIMIT 5', [studentId]),
      pool.query('SELECT vp.student_id, vp.video_id, vp.watch_count, vp.watched_minutes, vp.progress_percentage, vp.last_watched_at, v.title, v.course_id FROM video_progress vp JOIN videos v ON vp.video_id=v.id WHERE vp.student_id=$1 ORDER BY vp.last_watched_at DESC LIMIT 15', [studentId]),
      // R-5 OPT: explicit columns + LIMIT 50 (was SELECT * with no limit)
      pool.query('SELECT id, student_id, exam_id, badge_name, badge_color, earned_at FROM badges WHERE student_id=$1 ORDER BY earned_at DESC LIMIT 50', [studentId]),
      pool.query('SELECT id,name,points,academic_stage,gender FROM students WHERE id=$1', [studentId]),
      // BUG-6 FIX: join exams and filter deleted_at IS NULL so the total exam
      // count shown to the student excludes exams the teacher has soft-deleted.
      pool.query('SELECT COUNT(er.id)::int AS count FROM exam_results er JOIN exams e ON er.exam_id=e.id WHERE er.student_id=$1 AND er.is_latest=true AND e.deleted_at IS NULL', [studentId]),
    ]);
    res.json({ student: student.rows[0], enrollments: enrollments.rows, recentResults: results.rows, videoProgress: progress.rows, badges: badges.rows, totalExams: totalExamsRes.rows[0].count });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me/notifications', requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, message, type, is_read, sent_at
       FROM notification_log
       WHERE student_id = $1
       ORDER BY sent_at DESC LIMIT 30`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/me/notifications/:id/read', requireRole('student'), async (req, res) => {
  try {
    await pool.query(
      'UPDATE notification_log SET is_read=true WHERE id=$1 AND student_id=$2',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/me/notifications/read-all', requireRole('student'), async (req, res) => {
  try {
    await pool.query(
      "UPDATE notification_log SET is_read=true WHERE student_id=$1 AND source='platform' AND is_read=false",
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/attendance/:courseId', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { courseId } = req.params;
  try {
    const courseCheck = await pool.query(
      'SELECT id, name, target_stage FROM courses WHERE id=$1 AND teacher_id=$2',
      [courseId, teacherId]
    );
    if (!courseCheck.rows.length) return res.status(403).json({ error: 'Access denied' });

    const [students, videos, progress] = await Promise.all([
      // BUG-17 FIX: exclude soft-deleted students from attendance view
      pool.query(
        `SELECT s.id, s.name, s.username, s.academic_stage
         FROM students s
         JOIN student_course_enrollment sce ON s.id = sce.student_id
         WHERE sce.course_id = $1 AND s.deleted_at IS NULL AND s.is_simulation IS NOT TRUE
         ORDER BY s.name`,
        [courseId]
      ),
      pool.query(
        `SELECT id, title, duration_minutes, sort_order
         FROM videos WHERE course_id=$1 ORDER BY sort_order, id`,
        [courseId]
      ),
      pool.query(
        `SELECT vp.student_id, vp.video_id, vp.progress_percentage, vp.watched_minutes,
                vp.watch_count, COALESCE(vp.actual_watched_seconds, 0) AS actual_watched_seconds
         FROM video_progress vp
         JOIN videos v ON vp.video_id = v.id
         WHERE v.course_id = $1`,
        [courseId]
      ),
    ]);

    const progressMap = {};
    progress.rows.forEach(p => {
      if (!progressMap[p.student_id]) progressMap[p.student_id] = {};
      progressMap[p.student_id][p.video_id] = {
        progress_percentage: parseFloat(p.progress_percentage),
        watched_minutes: p.watched_minutes,
        watch_count: p.watch_count,
        actual_watched_seconds: parseInt(p.actual_watched_seconds) || 0,
      };
    });

    res.json({
      course: courseCheck.rows[0],
      students: students.rows,
      videos: videos.rows,
      progressMap,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// DEVICE-SECURITY ROUTES
// IMPORTANT: literal-path routes (/device-alerts/…) come BEFORE parameterised
// routes (/:id/…) so Express doesn't accidentally swallow them.
// ════════════════════════════════════════════════════════════════════════════

// ── GET /students/device-alerts ──────────────────────────────────────────────
router.get('/device-alerts', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    // Assistants need can_view_analytics to see security alerts
    if (req.user.role === 'assistant') {
      const perms = await getPermissions(req.user.id, pool);
      if (!perms?.can_view_analytics) return res.status(403).json({ error: 'Access denied: missing permission' });
    }
    const result = await pool.query(
      `SELECT da.*, s.name AS student_name, s.username AS student_username,
              s.academic_stage, s.is_suspended
       FROM device_alerts da
       JOIN students s ON s.id = da.student_id
       WHERE da.teacher_id = $1
       ORDER BY da.created_at DESC`,
      [teacherId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /students/device-alerts/:alertId/action ─────────────────────────────
// MUST be before POST /:id/… routes to avoid Express path ambiguity
router.post('/device-alerts/:alertId/action', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const alertId = parseInt(req.params.alertId, 10);
  if (isNaN(alertId)) return res.status(400).json({ error: 'Invalid alert ID' });

  const { action } = req.body;
  if (!['reactivate', 'reactivate_reset_devices', 'reset_devices', 'dismiss', 'keep_original_device', 'switch_to_new_device', 'add_new_device'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }
  // Assistants need can_edit_students to act on alerts
  if (req.user.role === 'assistant') {
    try {
      const perms = await getPermissions(req.user.id, pool);
      if (!perms?.can_edit_students) return res.status(403).json({ error: 'Access denied: missing permission' });
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  }
  try {
    const alertRes = await pool.query(
      'SELECT * FROM device_alerts WHERE id=$1 AND teacher_id=$2',
      [alertId, teacherId]
    );
    if (!alertRes.rows.length) return res.status(403).json({ error: 'التحذير غير موجود أو تم معالجته بالفعل' });
    const alert = alertRes.rows[0];

    // Helper to safely upsert device without failing on missing unique constraint
    const upsertDevice = async (stdId, devId, devName, ip) => {
      if (!devId) return;
      try {
        const exist = await pool.query(
          'SELECT 1 FROM student_devices WHERE student_id=$1 AND device_id=$2',
          [stdId, devId]
        );
        if (exist.rows.length === 0) {
          await pool.query(
            `INSERT INTO student_devices (student_id, device_id, device_name, ip_address)
             VALUES ($1, $2, $3, $4)`,
            [stdId, devId, devName, ip]
          );
        } else {
          await pool.query(
            `UPDATE student_devices
                SET last_seen = NOW(),
                    device_name = COALESCE(NULLIF($3, ''), device_name),
                    ip_address = COALESCE(NULLIF($4, ''), ip_address)
              WHERE student_id = $1 AND device_id = $2`,
            [stdId, devId, devName, ip]
          );
        }
      } catch (devErr) {
        console.warn('[UPSERT_DEVICE_WARN]', devErr.message);
      }
    };

    // Helper to safely kick active sessions without failing if table is missing
    const safeKickSessions = async (stdId, reason, devId = null) => {
      try {
        if (devId) {
          await pool.query(
            `UPDATE student_active_sessions
                SET kicked_at = NOW(),
                    kicked_reason = $3
              WHERE student_id = $1 AND device_id = $2 AND kicked_at IS NULL`,
            [stdId, devId, reason]
          );
        } else {
          await pool.query(
            `UPDATE student_active_sessions
                SET kicked_at = NOW(),
                    kicked_reason = $2
              WHERE student_id = $1 AND kicked_at IS NULL`,
            [stdId, reason]
          );
        }
      } catch (sessErr) {
        console.warn('[SAFE_KICK_SESSION_WARN]', sessErr.message);
      }
    };

    if (action === 'reactivate') {
      await pool.query('UPDATE students SET is_suspended=false, failed_device_attempts=0 WHERE id=$1', [alert.student_id]);
      if (alert.device_id) {
        await upsertDevice(alert.student_id, alert.device_id, alert.device_name, alert.ip_address);
      }
      await pool.query(
        "UPDATE device_alerts SET status='reactivated', resolved_at=NOW() WHERE student_id=$1 AND teacher_id=$2 AND status='pending'",
        [alert.student_id, teacherId]
      );
      await safeKickSessions(alert.student_id, 'teacher_reactivated_account');
      invalidateStudentAuthCache(alert.student_id);
    } else if (action === 'reactivate_reset_devices') {
      await pool.query('UPDATE students SET is_suspended=false, failed_device_attempts=0 WHERE id=$1', [alert.student_id]);
      await pool.query('DELETE FROM student_devices WHERE student_id=$1', [alert.student_id]);
      await pool.query(
        "UPDATE device_alerts SET status='reactivated', resolved_at=NOW() WHERE student_id=$1 AND teacher_id=$2 AND status='pending'",
        [alert.student_id, teacherId]
      );
      await safeKickSessions(alert.student_id, 'teacher_reset_devices');
      invalidateStudentAuthCache(alert.student_id);
    } else if (action === 'reset_devices') {
      await pool.query('DELETE FROM student_devices WHERE student_id=$1', [alert.student_id]);
      await pool.query('UPDATE students SET failed_device_attempts=0 WHERE id=$1', [alert.student_id]);
      await pool.query(
        "UPDATE device_alerts SET status='reactivated', resolved_at=NOW() WHERE student_id=$1 AND teacher_id=$2 AND status='pending'",
        [alert.student_id, teacherId]
      );
      await safeKickSessions(alert.student_id, 'teacher_reset_devices');
      invalidateStudentAuthCache(alert.student_id);
    } else if (action === 'dismiss' || action === 'keep_original_device') {
      await pool.query(
        "UPDATE device_alerts SET status='dismissed', resolved_at=NOW() WHERE student_id=$1 AND teacher_id=$2 AND status='pending'",
        [alert.student_id, teacherId]
      );
      if (alert.device_id) {
        await safeKickSessions(alert.student_id, 'teacher_kept_original_device', alert.device_id);
      }
    } else if (action === 'switch_to_new_device') {
      await pool.query('DELETE FROM student_devices WHERE student_id=$1', [alert.student_id]);
      if (alert.device_id) {
        await upsertDevice(alert.student_id, alert.device_id, alert.device_name, alert.ip_address);
      }
      await pool.query('UPDATE students SET is_suspended=false, failed_device_attempts=0 WHERE id=$1', [alert.student_id]);
      await pool.query(
        "UPDATE device_alerts SET status='reactivated', resolved_at=NOW() WHERE student_id=$1 AND teacher_id=$2 AND status='pending'",
        [alert.student_id, teacherId]
      );
      await safeKickSessions(alert.student_id, 'teacher_switched_to_new_device');
      invalidateStudentAuthCache(alert.student_id);
    } else if (action === 'add_new_device') {
      if (alert.device_id) {
        await upsertDevice(alert.student_id, alert.device_id, alert.device_name, alert.ip_address);
      }
      await pool.query('UPDATE students SET is_suspended=false, failed_device_attempts=0 WHERE id=$1', [alert.student_id]);
      await pool.query(
        "UPDATE device_alerts SET status='reactivated', resolved_at=NOW() WHERE student_id=$1 AND teacher_id=$2 AND status='pending'",
        [alert.student_id, teacherId]
      );
      if (alert.device_id) {
        await safeKickSessions(alert.student_id, 'teacher_added_new_device', alert.device_id);
      }
      invalidateStudentAuthCache(alert.student_id);
    }

    const studentName = (await pool.query('SELECT name FROM students WHERE id=$1', [alert.student_id]).catch(() => ({ rows: [] }))).rows[0]?.name;
    try {
      logActivity({
        teacherId, actor: getActor(req), ip: getIp(req),
        action: 'device_alert_review',
        entity: { type: 'student', id: alert.student_id, name: studentName },
        details: { alert_action: action },
      });
    } catch (_) {}

    // [Phase 2] Push SSE notification so the kicked tab logs out instantly.
    if (['switch_to_new_device', 'reactivate', 'reactivate_reset_devices', 'reset_devices'].includes(action)) {
      setImmediate(() => pushSessionKicked(
        alert.student_id,
        `teacher_${action}`,
        action === 'switch_to_new_device'
          ? 'تم استبدال جهازك بجهاز جديد من قِبل المدرس.'
          : 'تم تعديل إعدادات جهازك من قِبل المدرس. سيتم تسجيل الخروج.'
      ));
    } else if (action === 'keep_original_device' || action === 'dismiss') {
      if (alert.device_id) {
        setImmediate(() => pushSessionKicked(
          alert.student_id,
          'teacher_kept_original_device',
          'الإبقاء على جهازك الأصلي فقط — تم رفض طلب الجهاز الجديد.'
        ));
      }
    }

    // Broadcast to update other open dashboard/alerts screens immediately
    setImmediate(() => {
      broadcastToTeacherAndAssistants(pool, teacherId, 'device_alert_resolved', {
        alert_id: alertId,
        student_id: alert.student_id,
        action,
      }).catch(() => {});
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[DEVICE_ALERT_ACTION_ERROR]', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// ── GET /students/:id/devices ────────────────────────────────────────────────
router.get('/:id/devices', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const studentId = parseInt(req.params.id, 10);
  if (isNaN(studentId)) return res.status(400).json({ error: 'Invalid student ID' });
  try {
    // Assistants need can_view_analytics
    if (req.user.role === 'assistant') {
      const perms = await getPermissions(req.user.id, pool);
      if (!perms?.can_view_analytics) return res.status(403).json({ error: 'Access denied: missing permission' });
    }
    const check = await pool.query(
      'SELECT id FROM students WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL',
      [studentId, teacherId]
    );
    if (!check.rows.length) return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(
      'SELECT id, device_id, device_name, ip_address, device_origin, first_seen, last_seen FROM student_devices WHERE student_id=$1 ORDER BY last_seen DESC',
      [studentId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /students/:id/devices-overview ────────────────────────────────────────
// Combined view for the teacher: registered devices + currently open sessions +
// recent login history. View-only; no mutation endpoints are added here.
router.get('/:id/devices-overview', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const studentId = parseInt(req.params.id, 10);
  if (isNaN(studentId)) return res.status(400).json({ error: 'Invalid student ID' });
  try {
    if (req.user.role === 'assistant') {
      const perms = await getPermissions(req.user.id, pool);
      if (!perms?.can_view_analytics) return res.status(403).json({ error: 'Access denied: missing permission' });
    }
    const check = await pool.query(
      'SELECT id FROM students WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL',
      [studentId, teacherId]
    );
    if (!check.rows.length) return res.status(403).json({ error: 'Access denied' });

    // Three independent queries, each LEFT-JOINed with student_devices so the UI
    // can show a friendly device_name without an extra round-trip.
    const [devicesRes, activeRes, historyRes] = await Promise.all([
      pool.query(
        `SELECT id, device_id, device_name, device_origin, ip_address, first_seen, last_seen
           FROM student_devices
          WHERE student_id = $1
          ORDER BY last_seen DESC`,
        [studentId]
      ),
      pool.query(
        `SELECT s.id              AS session_id,
                s.device_id,
                s.device_origin,
                s.ip_address,
                s.user_agent,
                s.logged_in_at,
                s.last_active_at,
                d.device_name,
                d.first_seen
           FROM student_active_sessions s
           LEFT JOIN student_devices d
             ON d.student_id = s.student_id AND d.device_id = s.device_id
          WHERE s.student_id = $1
            AND s.kicked_at IS NULL
          ORDER BY s.last_active_at DESC`,
        [studentId]
      ),
      pool.query(
        `SELECT s.id              AS session_id,
                s.device_id,
                s.device_origin,
                s.ip_address,
                s.user_agent,
                s.logged_in_at,
                s.last_active_at,
                s.kicked_at,
                s.kicked_reason,
                d.device_name
           FROM student_active_sessions s
           LEFT JOIN student_devices d
             ON d.student_id = s.student_id AND d.device_id = s.device_id
          WHERE s.student_id = $1
          ORDER BY s.logged_in_at DESC
          LIMIT 30`,
        [studentId]
      ),
    ]);

    res.json({
      registeredDevices: devicesRes.rows,
      activeSessions:    activeRes.rows,
      recentLogins:      historyRes.rows,
    });
  } catch (err) {
    console.error('[DEVICES_OVERVIEW_ERROR]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /students/:id/devices/:deviceId ────────────────────────────────────
router.delete('/:id/devices/:deviceId',
  requireRole('teacher', 'assistant'),
  (req, res, next) => checkPermission(req, res, next, 'can_edit_students'),
  async (req, res) => {
    const teacherId = getTeacherId(req);
    const studentId = parseInt(req.params.id, 10);
    const deviceId = req.params.deviceId;
    if (isNaN(studentId)) return res.status(400).json({ error: 'Invalid student ID' });
    try {
      const check = await pool.query(
        'SELECT id FROM students WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL',
        [studentId, teacherId]
      );
      if (!check.rows.length) return res.status(403).json({ error: 'Access denied' });
      await pool.query(
        'DELETE FROM student_devices WHERE student_id=$1 AND (device_id=$2 OR id::text=$2)',
        [studentId, deviceId]
      );
      // Also kick any active session that was tied to this device — the
      // student can no longer use it.
      await pool.query(
        `UPDATE student_active_sessions
            SET kicked_at = NOW(),
                kicked_reason = 'teacher_removed_device'
          WHERE student_id = $1 AND device_id = $2 AND kicked_at IS NULL`,
        [studentId, deviceId]
      );
      setImmediate(() => pushSessionKicked(
        studentId,
        'teacher_removed_device',
        'تم إزالة هذا الجهاز من حسابك من قِبل المدرس.'
      ));
      invalidateStudentAuthCache(studentId);

      setImmediate(() => {
        broadcastToTeacherAndAssistants(pool, teacherId, 'device_alert_resolved', {
          student_id: studentId,
          action: 'delete_device',
          device_id: deviceId,
        }).catch(() => {});
      });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /students/:id/suspend ───────────────────────────────────────────────
router.post('/:id/suspend',
  requireRole('teacher', 'assistant'),
  (req, res, next) => checkPermission(req, res, next, 'can_edit_students'),
  async (req, res) => {
    const teacherId = getTeacherId(req);
    const studentId = parseInt(req.params.id, 10);
    if (isNaN(studentId)) return res.status(400).json({ error: 'Invalid student ID' });

    const { action } = req.body;
    if (!['suspend', 'reactivate', 'reactivate_reset_devices'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }
    try {
      const check = await pool.query(
        'SELECT id, name FROM students WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL',
        [studentId, teacherId]
      );
      if (!check.rows.length) return res.status(403).json({ error: 'Access denied' });

      if (action === 'suspend') {
        await pool.query('UPDATE students SET is_suspended=true WHERE id=$1', [studentId]);
        // Mark all live sessions for this student as kicked so they get a
        // 403 session_kicked on their next request, then the frontend shows
        // the suspended-account modal.
        await pool.query(
          `UPDATE student_active_sessions
              SET kicked_at = NOW(),
                  kicked_reason = 'teacher_suspended_account'
            WHERE student_id = $1 AND kicked_at IS NULL`,
          [studentId]
        );
        setImmediate(() => pushSessionKicked(
          studentId,
          'teacher_suspended_account',
          'تم إيقاف حسابك من قِبل المدرس.'
        ));
        invalidateStudentAuthCache(studentId);
      } else if (action === 'reactivate') {
        await pool.query('UPDATE students SET is_suspended=false, failed_device_attempts=0 WHERE id=$1', [studentId]);
        await pool.query(
          "UPDATE device_alerts SET status='reactivated', resolved_at=NOW() WHERE student_id=$1 AND status='pending'",
          [studentId]
        );
        invalidateStudentAuthCache(studentId);
      } else if (action === 'reactivate_reset_devices') {
        await pool.query('UPDATE students SET is_suspended=false, failed_device_attempts=0 WHERE id=$1', [studentId]);
        await pool.query('DELETE FROM student_devices WHERE student_id=$1', [studentId]);
        await pool.query(
          "UPDATE device_alerts SET status='reactivated', resolved_at=NOW() WHERE student_id=$1 AND status='pending'",
          [studentId]
        );
        invalidateStudentAuthCache(studentId);
      }

      logActivity({
        teacherId,
        actor: getActor(req),
        ip: getIp(req),
        action: action === 'suspend' ? 'suspend_student' : 'reactivate_student',
        entity: { type: 'student', id: studentId, name: check.rows[0].name },
      });

      setImmediate(() => {
        broadcastToTeacherAndAssistants(pool, teacherId, 'device_alert_resolved', {
          student_id: studentId,
          action,
        }).catch(() => {});
      });

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── DELETE /students/:id/devices ──────────────────────────────────────────────
// Wipes every registered device for the student AND kicks every active session
// in one shot. After this the student is logged out everywhere and will have to
// re-authorize on their next login (a fresh device entry will be created at that
// point). Used by the "Clear all devices" button in the teacher-side
// devices-overview modal.
router.delete('/:id/devices',
  requireRole('teacher', 'assistant'),
  (req, res, next) => checkPermission(req, res, next, 'can_edit_students'),
  async (req, res) => {
    const teacherId = getTeacherId(req);
    const studentId = parseInt(req.params.id, 10);
    if (isNaN(studentId)) return res.status(400).json({ error: 'Invalid student ID' });
    try {
      const check = await pool.query(
        'SELECT id, name FROM students WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL',
        [studentId, teacherId]
      );
      if (!check.rows.length) return res.status(403).json({ error: 'Access denied' });

      // Kick every live session so the student gets a force_logout SSE event
      // and the JWT is rejected on the next request.
      const kickRes = await pool.query(
        `UPDATE student_active_sessions
            SET kicked_at = NOW(),
                kicked_reason = 'teacher_cleared_all_devices'
          WHERE student_id = $1 AND kicked_at IS NULL
          RETURNING id`,
        [studentId]
      );

      // Delete every registered device for this student.
      const delRes = await pool.query(
        'DELETE FROM student_devices WHERE student_id=$1 RETURNING id',
        [studentId]
      );

      // Also resolve any pending device-alerts so they don't re-surface.
      await pool.query(
        "UPDATE device_alerts SET status='dismissed', resolved_at=NOW() WHERE student_id=$1 AND status='pending'",
        [studentId]
      );

      // Force a re-auth so the cached validation re-checks the (now empty)
      // device list on the student's next request.
      invalidateStudentAuthCache(studentId);

      // Push SSE force_logout to any connected student tab.
      setImmediate(() => pushSessionKicked(
        studentId,
        'teacher_cleared_all_devices',
        'تم مسح جميع أجهزة حسابك من قِبل المدرس. ستحتاج لتسجيل الدخول مرة أخرى.'
      ));

      // Broadcast to all teacher/assistant tabs so the roster badge / alerts
      // panel refresh immediately.
      setImmediate(() => {
        broadcastToTeacherAndAssistants(pool, teacherId, 'device_alert_resolved', {
          student_id: studentId,
          action: 'clear_all_devices',
          devices_removed: delRes.rowCount,
          sessions_kicked: kickRes.rowCount,
        }).catch(() => {});
      });

      logActivity({
        teacherId,
        actor: getActor(req),
        ip: getIp(req),
        action: 'clear_all_devices',
        entity: { type: 'student', id: studentId, name: check.rows[0].name },
        details: { devices_removed: delRes.rowCount, sessions_kicked: kickRes.rowCount },
      });

      res.json({
        success: true,
        devices_removed: delRes.rowCount,
        sessions_kicked: kickRes.rowCount,
      });
    } catch (err) {
      console.error('[CLEAR_ALL_DEVICES_ERROR]', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
