const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { getPermissions } = require('../lib/permissionsCache');
const { sendEvent } = require('../sse');
const { sendFCMToStudents } = require('../lib/fcm');
const { logActivity, getActor, getIp } = require('../lib/activityLog');

const REC_Q_IMG_DIR = path.join(__dirname, '../../uploads/question-images');
fs.mkdirSync(REC_Q_IMG_DIR, { recursive: true });

// [C4] Allowed image magic bytes — JPEG, PNG, GIF, WEBP
const ALLOWED_MAGIC = [
  { ext: '.jpg',  magic: [0xFF, 0xD8, 0xFF] },
  { ext: '.jpeg', magic: [0xFF, 0xD8, 0xFF] },
  { ext: '.png',  magic: [0x89, 0x50, 0x4E, 0x47] },
  { ext: '.gif',  magic: [0x47, 0x49, 0x46] },
  { ext: '.webp', magic: [0x52, 0x49, 0x46, 0x46] },
];
const ALLOWED_IMG_EXTS = new Set(ALLOWED_MAGIC.map(m => m.ext));

function verifyMagicBytes(filePath, ext) {
  try {
    const buf = Buffer.alloc(4);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    const rule = ALLOWED_MAGIC.find(m => m.ext === ext);
    if (!rule) return false;
    return rule.magic.every((byte, i) => buf[i] === byte);
  } catch { return false; }
}

const recQImgStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, REC_Q_IMG_DIR),
  filename: (req, file, cb) => {
    // [C5] Use crypto random bytes to prevent filename collision on concurrent uploads
    const ext = path.extname(file.originalname).toLowerCase();
    const rand = crypto.randomBytes(12).toString('hex');
    cb(null, `rec_q_${Date.now()}_${rand}${ext}`);
  },
});
const uploadRecQImg = multer({
  storage: recQImgStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_IMG_EXTS.has(ext)) return cb(new Error('امتداد الملف غير مدعوم'));
    if (!file.mimetype.startsWith('image/')) return cb(new Error('يُسمح بالصور فقط'));
    cb(null, true);
  },
});

// [C3] Validate that question_image_url only points to our uploads directory
const VALID_Q_IMG_RE = /^\/uploads\/question-images\/[\w.\-]+$/;
function validateImageUrl(url) {
  if (!url) return true;
  return VALID_Q_IMG_RE.test(url);
}

// [C1] Strip correct answers from a question before sending to client.
// For image_multi: also strip sub_questions[*].correct field.
function stripClientQuestion(q) {
  if (q.question_type === 'image_multi' && Array.isArray(q.sub_questions)) {
    return {
      ...q,
      correct_answer_letter: undefined,
      sub_questions: q.sub_questions.map(({ correct, ...rest }) => rest),
    };
  }
  return { ...q, correct_answer_letter: undefined };
}

const router = express.Router();
router.use(authenticate);

const PG_INT_MAX = 2147483647;
const parseParamId = (raw) => {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0 || n > PG_INT_MAX || String(n) !== String(raw).trim()) return null;
  return n;
};

const getTeacherId = (req) =>
  req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;

// ── Permission guard for assistants ──────────────────────────────────────────
const checkManageRecitationsPerm = async (req, res, next) => {
  if (req.user.role === 'teacher') return next();
  try {
    const perms = await getPermissions(req.user.id, pool);
    if (!perms || !perms.can_manage_recitations)
      return res.status(403).json({ error: 'Access denied: missing permission (can_manage_recitations)' });
    next();
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Seeded Fisher-Yates shuffle (deterministic per student+recitation) ────────
function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Ownership helpers ─────────────────────────────────────────────────────────
const getRecitationForOwner = async (id, teacherId) => {
  const r = await pool.query(
    'SELECT id, is_published, title FROM recitations WHERE id=$1 AND teacher_id=$2',
    [id, teacherId]
  );
  return r.rows[0] || null;
};

// ── [R6-FIX] Calendar-day streak diff — compares date parts, not 24h periods ─
function calendarDayDiff(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86400000);
}

// ════════════════════════════════════════════════════════════════════════════════
// TEACHER/ASSISTANT ROUTES
// ════════════════════════════════════════════════════════════════════════════════

// GET /api/recitations — list all recitations for this teacher
router.get('/', requireRole('teacher', 'assistant'), checkManageRecitationsPerm, async (req, res) => {
  try {
    const teacherId = getTeacherId(req);
    const { rows } = await pool.query(
      `SELECT r.*,
              (SELECT COUNT(*) FROM recitation_questions WHERE recitation_id = r.id) AS question_count,
              (SELECT COUNT(*) FROM recitation_results WHERE recitation_id = r.id) AS result_count
         FROM recitations r
        WHERE r.teacher_id = $1
        ORDER BY r.created_at DESC`,
      [teacherId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[recitations GET /]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/recitations — create
router.post('/', requireRole('teacher', 'assistant'), checkManageRecitationsPerm, async (req, res) => {
  const {
    title, description, academic_stage, duration_minutes,
    total_score, pass_score, points_on_attempt, points_on_pass,
    schedule_type, schedule_day, start_date, end_date,
    shuffle_questions, shuffle_options,
  } = req.body;

  if (!title || !String(title).trim())
    return res.status(400).json({ error: 'العنوان مطلوب' });
  if (String(title).trim().length > 300)
    return res.status(400).json({ error: 'العنوان طويل جداً' });

  const dur = parseInt(duration_minutes, 10);
  if (isNaN(dur) || dur < 1 || dur > 60)
    return res.status(400).json({ error: 'المدة يجب أن تكون بين 1 و60 دقيقة' });

  const totalSc = parseInt(total_score, 10) || 10;
  const passSc  = parseInt(pass_score, 10)  || 5;
  // [R7-FIX] Validate pass_score does not exceed total_score
  if (passSc > totalSc)
    return res.status(400).json({ error: 'درجة النجاح لا يمكن أن تتجاوز الدرجة الكلية' });
  if (passSc < 0 || totalSc < 1)
    return res.status(400).json({ error: 'الدرجات غير صالحة' });

  // [R9-FIX] Validate date range
  if (start_date && end_date && new Date(end_date) <= new Date(start_date))
    return res.status(400).json({ error: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية' });

  try {
    const teacherId = getTeacherId(req);
    const { rows } = await pool.query(
      `INSERT INTO recitations
         (teacher_id, title, description, academic_stage, duration_minutes,
          total_score, pass_score, points_on_attempt, points_on_pass,
          schedule_type, schedule_day, start_date, end_date,
          shuffle_questions, shuffle_options)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        teacherId,
        String(title).trim(),
        description || null,
        academic_stage || null,
        dur,
        totalSc,
        passSc,
        parseInt(points_on_attempt, 10) || 0,
        parseInt(points_on_pass, 10) || 5,
        schedule_type || 'once',
        schedule_day != null ? parseInt(schedule_day, 10) : null,
        start_date || null,
        end_date || null,
        !!shuffle_questions,
        !!shuffle_options,
      ]
    );
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'create_recitation',
      entity: { type: 'recitation', id: rows[0].id, name: rows[0].title },
    });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[recitations POST /]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── [R1-FIX] Analytics & student fixed-path routes are registered BEFORE
//    any /:id parameterised routes to avoid Express shadowing them. ────────────

// GET /api/recitations/analytics — teacher analytics
router.get('/analytics', requireRole('teacher', 'assistant'), async (req, res) => {
  if (req.user.role === 'assistant') {
    const perms = await getPermissions(req.user.id, pool).catch(() => null);
    if (!perms || (!perms.can_manage_recitations && !perms.can_view_analytics))
      return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const teacherId = getTeacherId(req);

    const [totalRec, totalResults, avgScore, byStage, topStudents, recentActivity] = await Promise.all([
      pool.query('SELECT COUNT(*) AS cnt FROM recitations WHERE teacher_id=$1', [teacherId]),
      pool.query(
        'SELECT COUNT(*) AS cnt FROM recitation_results rr JOIN recitations r ON rr.recitation_id=r.id WHERE r.teacher_id=$1',
        [teacherId]
      ),
      // [N3-FIX] Normalize score to percentage (0–100) so the UI's "%" display is correct.
      // Without normalization, a score of 7/10 would show as "7%" instead of "70%".
      pool.query(
        `SELECT COALESCE(
           AVG(CASE WHEN r.total_score > 0
                    THEN rr.score::float / r.total_score * 100
                    ELSE 0 END), 0
         )::numeric(5,1) AS avg
           FROM recitation_results rr
           JOIN recitations r ON rr.recitation_id=r.id
          WHERE r.teacher_id=$1`,
        [teacherId]
      ),
      pool.query(
        `SELECT COALESCE(s.academic_stage,'غير محدد') AS stage,
                COUNT(DISTINCT rr.student_id) AS participants,
                COALESCE(AVG(CASE WHEN r.total_score > 0
                                  THEN rr.score::float / r.total_score * 100
                                  ELSE 0 END), 0)::numeric(5,1) AS avg_score,
                COUNT(rr.id) AS total_attempts
           FROM recitation_results rr
           JOIN recitations r ON rr.recitation_id=r.id
           JOIN students s ON rr.student_id=s.id
          WHERE r.teacher_id=$1
          GROUP BY s.academic_stage
          ORDER BY total_attempts DESC`,
        [teacherId]
      ),
      pool.query(
        `SELECT s.id, s.name, s.academic_stage,
                COUNT(rr.id) AS total_completed,
                COALESCE(AVG(CASE WHEN rec.total_score > 0
                                  THEN rr.score::float / rec.total_score * 100
                                  ELSE 0 END), 0)::numeric(5,1) AS avg_score,
                COALESCE(rs.current_streak,0) AS current_streak,
                COALESCE(rs.max_streak,0) AS max_streak
           FROM students s
           JOIN recitation_results rr ON s.id=rr.student_id
           JOIN recitations rec ON rr.recitation_id=rec.id
           LEFT JOIN recitation_streaks rs ON s.id=rs.student_id AND rs.teacher_id=$1
          WHERE rec.teacher_id=$1 AND s.deleted_at IS NULL
          GROUP BY s.id, rs.current_streak, rs.max_streak
          ORDER BY total_completed DESC, avg_score DESC
          LIMIT 20`,
        [teacherId]
      ),
      // [A1-FIX] Normalize avg_score to percentage (0–100) — consistent with
      // global summary.avg_score and by_stage.avg_score.  Before this fix
      // recent_recitations.avg_score was the raw score (e.g. 7) while others
      // returned a percentage (e.g. 70).
      pool.query(
        `SELECT r.id, r.title, r.academic_stage,
                COUNT(rr.id) AS participant_count,
                COALESCE(AVG(CASE WHEN r.total_score > 0
                                  THEN rr.score::float / r.total_score * 100
                                  ELSE 0 END), 0)::numeric(5,1) AS avg_score,
                COALESCE(AVG(CASE WHEN rr.passed THEN 1 ELSE 0 END)*100,0)::numeric(5,1) AS pass_rate
           FROM recitations r
           LEFT JOIN recitation_results rr ON r.id=rr.recitation_id
          WHERE r.teacher_id=$1
          GROUP BY r.id
          ORDER BY r.created_at DESC
          LIMIT 10`,
        [teacherId]
      ),
    ]);

    res.json({
      summary: {
        total_recitations: parseInt(totalRec.rows[0].cnt, 10),
        total_results: parseInt(totalResults.rows[0].cnt, 10),
        avg_score: parseFloat(avgScore.rows[0].avg) || 0,
      },
      by_stage: byStage.rows,
      top_students: topStudents.rows,
      recent_recitations: recentActivity.rows,
    });
  } catch (err) {
    console.error('[recitations GET /analytics]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// STUDENT FIXED-PATH ROUTES (must come before /:id routes)
// ════════════════════════════════════════════════════════════════════════════════

// GET /api/recitations/student/list — available recitations for student
router.get('/student/list', requireRole('student'), async (req, res) => {
  try {
    const studentId = req.user.id;

    // Get student info (teacher_id + academic_stage) — tenant isolation
    const { rows: stRows } = await pool.query(
      'SELECT teacher_id, academic_stage FROM students WHERE id=$1 AND deleted_at IS NULL',
      [studentId]
    );
    if (!stRows.length) return res.status(404).json({ error: 'الطالب غير موجود' });
    const { teacher_id: teacherId, academic_stage } = stRows[0];

    // [N2-FIX] Use LATERAL join so we only fetch the most recent result
    // WITHIN THE CURRENT WINDOW (created_at >= r.start_date).
    // Without this fix, for recurring recitations a student who completed
    // week-1 would still show "done" in week-2's fresh window.
    const { rows } = await pool.query(
      `SELECT r.*,
              (SELECT COUNT(*) FROM recitation_questions WHERE recitation_id=r.id) AS question_count,
              rr.id AS result_id, rr.score AS my_score, rr.passed AS my_passed,
              rr.correct_count AS my_correct, rr.wrong_count AS my_wrong,
              rr.created_at AS my_submitted_at,
              rs2.id AS session_id
         FROM recitations r
         LEFT JOIN LATERAL (
           SELECT * FROM recitation_results rr2
            WHERE rr2.student_id=$1
              AND rr2.recitation_id=r.id
              AND (r.start_date IS NULL OR rr2.created_at >= r.start_date)
            ORDER BY rr2.created_at DESC
            LIMIT 1
         ) rr ON true
         LEFT JOIN recitation_sessions rs2 ON r.id=rs2.recitation_id AND rs2.student_id=$1
        WHERE r.teacher_id=$2
          AND r.is_published=true
          AND (r.academic_stage IS NULL OR r.academic_stage=$3)
        ORDER BY r.start_date DESC NULLS LAST, r.created_at DESC`,
      [studentId, teacherId, academic_stage]
    );
    res.json(rows);
  } catch (err) {
    console.error('[recitations GET /student/list]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/recitations/student/streak — student streak info
router.get('/student/streak', requireRole('student'), async (req, res) => {
  try {
    const studentId = req.user.id;

    const { rows: stRows } = await pool.query(
      'SELECT teacher_id FROM students WHERE id=$1 AND deleted_at IS NULL',
      [studentId]
    );
    if (!stRows.length) return res.status(404).json({ error: 'الطالب غير موجود' });
    const teacherId = stRows[0].teacher_id;

    const { rows } = await pool.query(
      'SELECT * FROM recitation_streaks WHERE student_id=$1 AND teacher_id=$2',
      [studentId, teacherId]
    );
    res.json(rows[0] || { current_streak: 0, max_streak: 0, total_completed: 0 });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/recitations/student/results — student's full result history
// [R1-FIX] This route was previously shadowed by GET /:id/results — now placed first
router.get('/student/results', requireRole('student'), async (req, res) => {
  try {
    const studentId = req.user.id;

    const { rows: stRows } = await pool.query(
      'SELECT teacher_id FROM students WHERE id=$1 AND deleted_at IS NULL',
      [studentId]
    );
    if (!stRows.length) return res.status(404).json({ error: 'الطالب غير موجود' });
    const teacherId = stRows[0].teacher_id;

    const { rows } = await pool.query(
      `SELECT rr.*, r.title, r.total_score, r.pass_score, r.academic_stage
         FROM recitation_results rr
         JOIN recitations r ON rr.recitation_id=r.id
        WHERE rr.student_id=$1 AND r.teacher_id=$2
        ORDER BY rr.created_at DESC`,
      [studentId, teacherId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/recitations/upload-image — upload a question image
router.post('/upload-image', requireRole('teacher', 'assistant'), checkManageRecitationsPerm, (req, res) => {
  uploadRecQImg.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'فشل رفع الصورة' });
    if (!req.file) return res.status(400).json({ error: 'لم يتم اختيار صورة' });

    // [C4] Verify magic bytes — reject if file content doesn't match extension
    const ext = path.extname(req.file.filename).toLowerCase();
    if (!verifyMagicBytes(req.file.path, ext)) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'الملف تالف أو غير صالح' });
    }

    res.json({ url: `/uploads/question-images/${req.file.filename}` });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// TEACHER/ASSISTANT PARAMETERISED ROUTES
// ════════════════════════════════════════════════════════════════════════════════

// PUT /api/recitations/:id — update
router.put('/:id', requireRole('teacher', 'assistant'), checkManageRecitationsPerm, async (req, res) => {
  const id = parseParamId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  const {
    title, description, academic_stage, duration_minutes,
    total_score, pass_score, points_on_attempt, points_on_pass,
    schedule_type, schedule_day, start_date, end_date,
    shuffle_questions, shuffle_options,
  } = req.body;

  if (!title || !String(title).trim())
    return res.status(400).json({ error: 'العنوان مطلوب' });

  const dur = parseInt(duration_minutes, 10);
  if (isNaN(dur) || dur < 1 || dur > 60)
    return res.status(400).json({ error: 'المدة يجب أن تكون بين 1 و60 دقيقة' });

  const totalSc = parseInt(total_score, 10) || 10;
  const passSc  = parseInt(pass_score, 10)  || 5;
  // [R7-FIX] Validate pass_score does not exceed total_score
  if (passSc > totalSc)
    return res.status(400).json({ error: 'درجة النجاح لا يمكن أن تتجاوز الدرجة الكلية' });
  if (passSc < 0 || totalSc < 1)
    return res.status(400).json({ error: 'الدرجات غير صالحة' });

  // [R9-FIX] Validate date range
  if (start_date && end_date && new Date(end_date) <= new Date(start_date))
    return res.status(400).json({ error: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية' });

  try {
    const teacherId = getTeacherId(req);
    const rec = await getRecitationForOwner(id, teacherId);
    if (!rec) return res.status(404).json({ error: 'التسميع غير موجود' });
    if (rec.is_published) return res.status(409).json({ error: 'لا يمكن تعديل تسميع منشور. قم بإلغاء النشر أولاً' });

    const { rows } = await pool.query(
      `UPDATE recitations SET
         title=$1, description=$2, academic_stage=$3, duration_minutes=$4,
         total_score=$5, pass_score=$6, points_on_attempt=$7, points_on_pass=$8,
         schedule_type=$9, schedule_day=$10, start_date=$11, end_date=$12,
         shuffle_questions=$13, shuffle_options=$14
       WHERE id=$15 AND teacher_id=$16 RETURNING *`,
      [
        String(title).trim(), description || null, academic_stage || null, dur,
        totalSc, passSc,
        parseInt(points_on_attempt, 10) || 0, parseInt(points_on_pass, 10) || 5,
        schedule_type || 'once',
        schedule_day != null ? parseInt(schedule_day, 10) : null,
        start_date || null, end_date || null,
        !!shuffle_questions, !!shuffle_options,
        id, teacherId,
      ]
    );
    if (rows.length) {
      logActivity({
        teacherId, actor: getActor(req), ip: getIp(req),
        action: 'edit_recitation',
        entity: { type: 'recitation', id, name: rows[0].title },
      });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[recitations PUT /:id]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/recitations/:id — delete
router.delete('/:id', requireRole('teacher', 'assistant'), checkManageRecitationsPerm, async (req, res) => {
  const id = parseParamId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const teacherId = getTeacherId(req);
    const rec = await getRecitationForOwner(id, teacherId);
    if (!rec) return res.status(404).json({ error: 'التسميع غير موجود' });

    await pool.query('DELETE FROM recitations WHERE id=$1 AND teacher_id=$2', [id, teacherId]);
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'delete_recitation',
      entity: { type: 'recitation', id, name: rec.title },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[recitations DELETE /:id]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/recitations/:id/publish — toggle publish
router.put('/:id/publish', requireRole('teacher', 'assistant'), checkManageRecitationsPerm, async (req, res) => {
  const id = parseParamId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const teacherId = getTeacherId(req);
    const rec = await getRecitationForOwner(id, teacherId);
    if (!rec) return res.status(404).json({ error: 'التسميع غير موجود' });

    const newPublished = !rec.is_published;

    // Validate before publishing
    if (newPublished) {
      const { rows: qRows } = await pool.query(
        'SELECT COUNT(*) AS cnt FROM recitation_questions WHERE recitation_id=$1', [id]
      );
      if (parseInt(qRows[0].cnt, 10) === 0)
        return res.status(400).json({ error: 'أضف أسئلة للتسميع قبل النشر' });
    }

    const { rows } = await pool.query(
      `UPDATE recitations SET is_published=$1, start_notified=false
        WHERE id=$2 AND teacher_id=$3 RETURNING *`,
      [newPublished, id, teacherId]
    );

    // Notify eligible students on publish
    if (newPublished) {
      const rec2 = rows[0];
      let studentQuery, params;
      if (rec2.academic_stage) {
        studentQuery = 'SELECT id FROM students WHERE teacher_id=$1 AND academic_stage=$2 AND deleted_at IS NULL';
        params = [teacherId, rec2.academic_stage];
      } else {
        studentQuery = 'SELECT id FROM students WHERE teacher_id=$1 AND deleted_at IS NULL';
        params = [teacherId];
      }
      const { rows: students } = await pool.query(studentQuery, params);
      const studentIds = students.map(s => s.id);

      for (const sid of studentIds) {
        sendEvent(`student_${sid}`, 'new_recitation', {
          title: rec2.title,
          recitationId: rec2.id,
        });
        pool.query(
          `INSERT INTO notification_log (teacher_id, student_id, title, message, type, source)
           VALUES ($1,$2,$3,$4,'new_recitation','platform')`,
          [teacherId, sid, 'تسميع جديد 📖', `تم نشر تسميع جديد: "${rec2.title}"`]
        ).catch(() => {});
      }

      sendFCMToStudents(pool, studentIds,
        'تسميع جديد 📖',
        `تم نشر تسميع: "${rec2.title}"`,
        { recitationId: String(rec2.id) }
      ).catch(() => {});

      logActivity({
        teacherId, actor: getActor(req), ip: getIp(req),
        action: 'publish_recitation',
        entity: { type: 'recitation', id, name: rec2.title },
      });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('[recitations PUT /:id/publish]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Questions management ──────────────────────────────────────────────────────

// GET /api/recitations/:id/questions
router.get('/:id/questions', requireRole('teacher', 'assistant'), checkManageRecitationsPerm, async (req, res) => {
  const id = parseParamId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const teacherId = getTeacherId(req);
    const rec = await getRecitationForOwner(id, teacherId);
    if (!rec) return res.status(404).json({ error: 'التسميع غير موجود' });

    const { rows } = await pool.query(
      'SELECT * FROM recitation_questions WHERE recitation_id=$1 ORDER BY sort_order ASC, id ASC',
      [id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/recitations/:id/questions — add question
router.post('/:id/questions', requireRole('teacher', 'assistant'), checkManageRecitationsPerm, async (req, res) => {
  const id = parseParamId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  const { question_text, question_image_url, question_type, option_a, option_b, option_c, option_d, correct_answer_letter, points, sub_questions } = req.body;

  const qtype = question_type || 'mcq';
  const isImgMulti = qtype === 'image_multi';

  if (!question_text && !question_image_url)
    return res.status(400).json({ error: 'نص السؤال أو صورة مطلوبة' });

  // [C3] Validate image URL — must point to our uploads directory only
  if (question_image_url && !validateImageUrl(question_image_url))
    return res.status(400).json({ error: 'رابط الصورة غير صالح' });

  if (!isImgMulti) {
    if (!correct_answer_letter || !['A','B','C','D','T','F'].includes(correct_answer_letter))
      return res.status(400).json({ error: 'الإجابة الصحيحة غير صالحة' });
  } else {
    // [H1/M2] Validate sub_questions: required, bounded, and each item must have valid label+correct
    if (!Array.isArray(sub_questions) || sub_questions.length === 0)
      return res.status(400).json({ error: 'سؤال الصورة يحتاج إلى أسئلة فرعية' });
    if (sub_questions.length > 50)
      return res.status(400).json({ error: 'الحد الأقصى للأسئلة الفرعية هو 50' });
    const VALID_LETTERS = new Set(['A','B','C','D']);
    for (const sub of sub_questions) {
      if (!sub.label || !String(sub.label).trim())
        return res.status(400).json({ error: 'كل سؤال فرعي يجب أن يحتوي على رقم/عنوان' });
      if (!VALID_LETTERS.has(String(sub.correct || '').toUpperCase()))
        return res.status(400).json({ error: 'الإجابة الصحيحة لكل بند يجب أن تكون A أو B أو C أو D' });
    }
    // [M1-server] Validate label uniqueness
    const labels = sub_questions.map(s => String(s.label).trim());
    if (new Set(labels).size !== labels.length)
      return res.status(400).json({ error: 'أرقام الأسئلة الفرعية يجب أن تكون فريدة' });
  }

  try {
    const teacherId = getTeacherId(req);
    const rec = await getRecitationForOwner(id, teacherId);
    if (!rec) return res.status(404).json({ error: 'التسميع غير موجود' });
    if (rec.is_published) return res.status(409).json({ error: 'لا يمكن إضافة أسئلة لتسميع منشور' });

    const { rows: maxRow } = await pool.query(
      'SELECT COALESCE(MAX(sort_order),0) AS m FROM recitation_questions WHERE recitation_id=$1', [id]
    );

    const { rows } = await pool.query(
      `INSERT INTO recitation_questions
         (recitation_id, question_text, question_image_url, question_type, option_a, option_b, option_c, option_d,
          correct_answer_letter, points, sort_order, sub_questions)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        id,
        question_text || null,
        question_image_url || null,
        qtype,
        option_a || null,
        option_b || null,
        option_c || null,
        option_d || null,
        isImgMulti ? 'A' : correct_answer_letter,
        parseInt(points, 10) || 1,
        parseInt(maxRow[0].m, 10) + 1,
        isImgMulti ? JSON.stringify(sub_questions) : '[]',
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[recitations POST /:id/questions]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/recitations/:id/questions/:qid — update question
router.put('/:id/questions/:qid', requireRole('teacher', 'assistant'), checkManageRecitationsPerm, async (req, res) => {
  const id = parseParamId(req.params.id);
  const qid = parseParamId(req.params.qid);
  if (!id || !qid) return res.status(400).json({ error: 'Invalid ID' });

  const { question_text, question_image_url, question_type, option_a, option_b, option_c, option_d, correct_answer_letter, points, sub_questions } = req.body;

  const qtype = question_type || 'mcq';
  const isImgMulti = qtype === 'image_multi';

  if (!question_text && !question_image_url)
    return res.status(400).json({ error: 'نص السؤال أو صورة مطلوبة' });

  // [C3] Validate image URL — must point to our uploads directory only
  if (question_image_url && !validateImageUrl(question_image_url))
    return res.status(400).json({ error: 'رابط الصورة غير صالح' });

  if (!isImgMulti) {
    if (!correct_answer_letter || !['A','B','C','D','T','F'].includes(correct_answer_letter))
      return res.status(400).json({ error: 'الإجابة الصحيحة غير صالحة' });
  } else {
    // [H1/M2/M3] Validate sub_questions on update too
    if (!Array.isArray(sub_questions) || sub_questions.length === 0)
      return res.status(400).json({ error: 'سؤال الصورة يحتاج إلى أسئلة فرعية' });
    if (sub_questions.length > 50)
      return res.status(400).json({ error: 'الحد الأقصى للأسئلة الفرعية هو 50' });
    const VALID_LETTERS = new Set(['A','B','C','D']);
    for (const sub of sub_questions) {
      if (!sub.label || !String(sub.label).trim())
        return res.status(400).json({ error: 'كل سؤال فرعي يجب أن يحتوي على رقم/عنوان' });
      if (!VALID_LETTERS.has(String(sub.correct || '').toUpperCase()))
        return res.status(400).json({ error: 'الإجابة الصحيحة لكل بند يجب أن تكون A أو B أو C أو D' });
    }
    // [M1-server] Validate label uniqueness
    const labels = sub_questions.map(s => String(s.label).trim());
    if (new Set(labels).size !== labels.length)
      return res.status(400).json({ error: 'أرقام الأسئلة الفرعية يجب أن تكون فريدة' });
  }

  try {
    const teacherId = getTeacherId(req);
    const rec = await getRecitationForOwner(id, teacherId);
    if (!rec) return res.status(404).json({ error: 'التسميع غير موجود' });
    if (rec.is_published) return res.status(409).json({ error: 'لا يمكن تعديل أسئلة تسميع منشور' });

    const { rows } = await pool.query(
      `UPDATE recitation_questions SET
         question_text=$1, question_image_url=$2, question_type=$3,
         option_a=$4, option_b=$5, option_c=$6, option_d=$7,
         correct_answer_letter=$8, points=$9, sub_questions=$10
       WHERE id=$11 AND recitation_id=$12 RETURNING *`,
      [
        question_text || null,
        question_image_url || null,
        qtype,
        option_a || null, option_b || null, option_c || null, option_d || null,
        isImgMulti ? 'A' : correct_answer_letter,
        parseInt(points, 10) || 1,
        isImgMulti ? JSON.stringify(sub_questions) : '[]',
        qid, id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'السؤال غير موجود' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/recitations/:id/questions/:qid
router.delete('/:id/questions/:qid', requireRole('teacher', 'assistant'), checkManageRecitationsPerm, async (req, res) => {
  const id = parseParamId(req.params.id);
  const qid = parseParamId(req.params.qid);
  if (!id || !qid) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const teacherId = getTeacherId(req);
    const rec = await getRecitationForOwner(id, teacherId);
    if (!rec) return res.status(404).json({ error: 'التسميع غير موجود' });
    if (rec.is_published) return res.status(409).json({ error: 'لا يمكن حذف أسئلة تسميع منشور' });

    // [H2] Fetch image URL before deletion so we can clean up the file
    const { rows: qRows } = await pool.query(
      'SELECT question_image_url FROM recitation_questions WHERE id=$1 AND recitation_id=$2',
      [qid, id]
    );
    if (!qRows.length) return res.status(404).json({ error: 'السؤال غير موجود' });

    const { rowCount } = await pool.query(
      'DELETE FROM recitation_questions WHERE id=$1 AND recitation_id=$2',
      [qid, id]
    );
    if (!rowCount) return res.status(404).json({ error: 'السؤال غير موجود' });

    // [H2] Delete orphaned image file from disk (best-effort, ignore errors)
    if (qRows[0].question_image_url && VALID_Q_IMG_RE.test(qRows[0].question_image_url)) {
      const imgPath = path.join(__dirname, '../..', qRows[0].question_image_url);
      fs.unlink(imgPath, () => {});
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/recitations/:id/results — teacher: results per recitation
router.get('/:id/results', requireRole('teacher', 'assistant'), checkManageRecitationsPerm, async (req, res) => {
  const id = parseParamId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const teacherId = getTeacherId(req);
    const rec = await getRecitationForOwner(id, teacherId);
    if (!rec) return res.status(404).json({ error: 'التسميع غير موجود' });

    const { rows } = await pool.query(
      `SELECT rr.*, s.name AS student_name, s.academic_stage
         FROM recitation_results rr
         JOIN students s ON rr.student_id = s.id
        WHERE rr.recitation_id = $1 AND s.teacher_id = $2
        ORDER BY rr.created_at DESC`,
      [id, teacherId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// STUDENT SESSION ROUTES
// ════════════════════════════════════════════════════════════════════════════════

// GET /api/recitations/:id/take — start or resume session
router.get('/:id/take', requireRole('student'), async (req, res) => {
  const id = parseParamId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const studentId = req.user.id;

    // Verify student + get teacher
    const { rows: stRows } = await pool.query(
      'SELECT teacher_id, academic_stage FROM students WHERE id=$1 AND deleted_at IS NULL',
      [studentId]
    );
    if (!stRows.length) return res.status(403).json({ error: 'غير مصرح' });
    const { teacher_id: teacherId, academic_stage } = stRows[0];

    // Load recitation — strict tenant + stage isolation
    const { rows: recRows } = await pool.query(
      `SELECT * FROM recitations
        WHERE id=$1 AND teacher_id=$2 AND is_published=true
          AND (academic_stage IS NULL OR academic_stage=$3)`,
      [id, teacherId, academic_stage]
    );
    if (!recRows.length) return res.status(404).json({ error: 'التسميع غير متاح' });
    const rec = recRows[0];

    // Check time window
    const now = new Date();
    if (rec.start_date && new Date(rec.start_date) > now)
      return res.status(400).json({ error: 'لم يبدأ التسميع بعد' });
    if (rec.end_date && new Date(rec.end_date) < now)
      return res.status(400).json({ error: 'انتهى وقت التسميع' });

    // [R5-FIX] For recurring recitations: only block if student already submitted
    // WITHIN the current window (start_date). This allows retaking in a new window.
    const { rows: existing } = await pool.query(
      `SELECT id FROM recitation_results
        WHERE student_id=$1 AND recitation_id=$2
          AND ($3::timestamp IS NULL OR created_at >= $3::timestamp)
        LIMIT 1`,
      [studentId, id, rec.start_date]
    );
    if (existing.length) return res.status(409).json({ error: 'لقد أديت هذا التسميع بالفعل', already_submitted: true });

    // Check for existing session (resume)
    const { rows: sessRows } = await pool.query(
      'SELECT * FROM recitation_sessions WHERE student_id=$1 AND recitation_id=$2',
      [studentId, id]
    );

    if (sessRows.length) {
      // Resume existing session
      const sess = sessRows[0];
      // [C1] Strip correct_answer_letter AND sub_questions[*].correct before sending to client
      const clientSnapshot = (sess.questions_snapshot || []).map(stripClientQuestion);
      return res.json({
        recitation: rec,
        questions: clientSnapshot,
        server_started_at: sess.started_at,
        resumed: true,
      });
    }

    // Create new session — load and snapshot questions
    const { rows: questions } = await pool.query(
      'SELECT * FROM recitation_questions WHERE recitation_id=$1 ORDER BY sort_order ASC, id ASC',
      [id]
    );
    if (!questions.length) return res.status(400).json({ error: 'لا توجد أسئلة في هذا التسميع' });

    const seed = (studentId * 73856093) ^ (id * 19349663);
    let snapshotQs = rec.shuffle_questions
      ? seededShuffle(questions, seed)
      : [...questions];

    if (rec.shuffle_options) {
      snapshotQs = snapshotQs.map(q => {
        if (q.question_type !== 'mcq') return q;
        const opts = [
          { letter: 'A', text: q.option_a },
          { letter: 'B', text: q.option_b },
          q.option_c ? { letter: 'C', text: q.option_c } : null,
          q.option_d ? { letter: 'D', text: q.option_d } : null,
        ].filter(Boolean);
        const shuffledOpts = seededShuffle(opts, seed ^ q.id);
        const letterMap = {};
        ['A','B','C','D'].forEach((l, i) => {
          if (shuffledOpts[i]) letterMap[shuffledOpts[i].letter] = l;
        });
        return {
          ...q,
          option_a: shuffledOpts[0]?.text || null,
          option_b: shuffledOpts[1]?.text || null,
          option_c: shuffledOpts[2]?.text || null,
          option_d: shuffledOpts[3]?.text || null,
          correct_answer_letter: letterMap[q.correct_answer_letter] || q.correct_answer_letter,
        };
      });
    }

    // [C1] Strip correct answers AND sub_questions[*].correct from snapshot sent to client
    const clientSnapshot = snapshotQs.map(stripClientQuestion);
    const serverSnapshot = snapshotQs;

    // [N1-FIX] ON CONFLICT must NOT reset started_at — doing so would reset
    // the student's exam timer in the rare concurrent-request race condition.
    // We only update the snapshot (same deterministic content) to handle the
    // race, while preserving the original started_at for the timer.
    const { rows: sessionRows } = await pool.query(
      `INSERT INTO recitation_sessions (student_id, recitation_id, questions_snapshot)
       VALUES ($1,$2,$3)
       ON CONFLICT (student_id, recitation_id) DO UPDATE
         SET questions_snapshot=EXCLUDED.questions_snapshot
       RETURNING *`,
      [studentId, id, JSON.stringify(serverSnapshot)]
    );

    res.json({
      recitation: rec,
      questions: clientSnapshot,
      server_started_at: sessionRows[0].started_at,
      resumed: false,
    });
  } catch (err) {
    console.error('[recitations GET /:id/take]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/recitations/:id/submit — submit answers
router.post('/:id/submit', requireRole('student'), async (req, res) => {
  const id = parseParamId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  const { answers } = req.body;
  if (!Array.isArray(answers)) return res.status(400).json({ error: 'الإجابات غير صالحة' });

  // [R10-FIX] Limit answers array size to prevent abuse
  if (answers.length > 500)
    return res.status(400).json({ error: 'عدد الإجابات تجاوز الحد المسموح' });

  const VALID_ANSWER_LETTERS = new Set(['A','B','C','D','T','F']);

  try {
    const studentId = req.user.id;

    // Get student + teacher
    const { rows: stRows } = await pool.query(
      'SELECT teacher_id, academic_stage FROM students WHERE id=$1 AND deleted_at IS NULL',
      [studentId]
    );
    if (!stRows.length) return res.status(403).json({ error: 'غير مصرح' });
    const { teacher_id: teacherId, academic_stage } = stRows[0];

    // Load recitation
    const { rows: recRows } = await pool.query(
      `SELECT * FROM recitations
        WHERE id=$1 AND teacher_id=$2 AND is_published=true
          AND (academic_stage IS NULL OR academic_stage=$3)`,
      [id, teacherId, academic_stage]
    );
    if (!recRows.length) return res.status(404).json({ error: 'التسميع غير متاح' });
    const rec = recRows[0];

    // [R5-FIX] Check for existing result within current window only
    const { rows: existingResult } = await pool.query(
      `SELECT id FROM recitation_results
        WHERE student_id=$1 AND recitation_id=$2
          AND ($3::timestamp IS NULL OR created_at >= $3::timestamp)`,
      [studentId, id, rec.start_date]
    );
    if (existingResult.length)
      return res.status(409).json({ error: 'لقد أديت هذا التسميع بالفعل', already_submitted: true });

    // Load session (with server-side snapshot)
    const { rows: sessRows } = await pool.query(
      'SELECT * FROM recitation_sessions WHERE student_id=$1 AND recitation_id=$2',
      [studentId, id]
    );
    if (!sessRows.length) return res.status(400).json({ error: 'لا توجد جلسة نشطة. ابدأ التسميع أولاً' });
    const session = sessRows[0];

    // Timer check — server authoritative (+ 30s grace)
    const elapsedMs = Date.now() - new Date(session.started_at).getTime();
    const maxMs = (rec.duration_minutes * 60 + 30) * 1000;
    if (elapsedMs > maxMs)
      return res.status(400).json({ error: 'انتهى وقت التسميع', timer_expired: true });

    // Build raw answer map — image_multi answers are JSON strings; others are letters
    const snapshot = session.questions_snapshot;
    const answerMap = {};
    // [A2-FIX] Cap image_multi answer string length to 10KB to prevent abuse.
    // Each sub-question answer is a single letter, so a 10KB JSON string could
    // theoretically hold ~1000 sub-answers — far more than the 50-item maximum.
    const IMAGE_MULTI_MAX_BYTES = 10 * 1024;
    for (const a of answers) {
      if (a.question_id == null) continue;
      const qInSnap = snapshot.find(q => q.id === a.question_id);
      if (qInSnap && qInSnap.question_type === 'image_multi') {
        const raw = a.answer || null;
        if (raw && String(raw).length > IMAGE_MULTI_MAX_BYTES) continue; // silently drop oversized
        answerMap[a.question_id] = raw;
      } else {
        const letter = String(a.answer || '').trim().toUpperCase();
        answerMap[a.question_id] = VALID_ANSWER_LETTERS.has(letter) ? letter : null;
      }
    }

    let correct = 0, wrong = 0, unanswered = 0, rawScore = 0;

    for (const q of snapshot) {
      const studentAns = answerMap[q.id];

      if (q.question_type === 'image_multi') {
        const subQs = Array.isArray(q.sub_questions) ? q.sub_questions : [];
        if (!subQs.length || !studentAns) { unanswered++; continue; }

        let parsedAns = {};
        try { parsedAns = JSON.parse(studentAns); } catch { parsedAns = {}; }

        const hasAnyAnswer = Object.keys(parsedAns).length > 0;
        if (!hasAnyAnswer) { unanswered++; continue; }

        let subCorrect = 0;
        for (const sub of subQs) {
          const a = String(parsedAns[sub.label] || '').toUpperCase();
          if (VALID_ANSWER_LETTERS.has(a) && a === String(sub.correct).toUpperCase()) subCorrect++;
        }

        rawScore += (q.points || 1) * subCorrect / subQs.length;
        if (subCorrect === subQs.length) correct++;
        else wrong++;
        continue;
      }

      if (!studentAns) {
        unanswered++;
      } else if (studentAns === q.correct_answer_letter) {
        correct++;
        rawScore += (q.points || 1);
      } else {
        wrong++;
      }
    }

    // Normalize score against total_score
    const totalPoints = snapshot.reduce((s, q) => s + (q.points || 1), 0);
    const finalScore = totalPoints > 0
      ? Math.round((rawScore / totalPoints) * rec.total_score)
      : 0;
    const passed = finalScore >= rec.pass_score;

    // Points to award
    let pointsEarned = rec.points_on_attempt || 0;
    if (passed) pointsEarned += (rec.points_on_pass || 0);

    // Atomic transaction: insert result + update student points + upsert streak
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert result
      // [C2] Compute correct flag properly for image_multi (JSON string answer vs letter)
      const storedAnswers = answers.map(a => {
        const q = snapshot.find(sq => sq.id === a.question_id);
        const ans = answerMap[a.question_id] || null;
        let isCorrect = false;
        if (q?.question_type === 'image_multi') {
          const subQs = Array.isArray(q.sub_questions) ? q.sub_questions : [];
          if (subQs.length > 0 && ans) {
            let parsed = {};
            try { parsed = JSON.parse(ans); } catch {}
            isCorrect = subQs.every(sub =>
              String(parsed[sub.label] || '').toUpperCase() === String(sub.correct).toUpperCase()
            );
          }
        } else {
          isCorrect = q?.correct_answer_letter === ans;
        }
        return { question_id: a.question_id, answer: ans, correct: isCorrect };
      });

      const { rows: resultRows } = await client.query(
        `INSERT INTO recitation_results
           (student_id, recitation_id, score, correct_count, wrong_count, unanswered_count,
            answers, points_earned, start_time, end_time, passed)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10) RETURNING *`,
        [
          studentId, id, finalScore, correct, wrong, unanswered,
          JSON.stringify(storedAnswers),
          pointsEarned,
          session.started_at,
          passed,
        ]
      );

      // Update student points
      if (pointsEarned > 0) {
        await client.query(
          'UPDATE students SET points = points + $1 WHERE id=$2',
          [pointsEarned, studentId]
        );
      }

      // [R6-FIX] Upsert streak — use calendar-day comparison, not 24h millis
      const { rows: streakRows } = await client.query(
        'SELECT * FROM recitation_streaks WHERE student_id=$1 AND teacher_id=$2',
        [studentId, teacherId]
      );

      if (streakRows.length === 0) {
        await client.query(
          `INSERT INTO recitation_streaks (student_id, teacher_id, current_streak, max_streak, last_completed_at, total_completed)
           VALUES ($1,$2,1,1,NOW(),1)`,
          [studentId, teacherId]
        );
      } else {
        const streak = streakRows[0];
        const lastDate = streak.last_completed_at ? new Date(streak.last_completed_at) : null;
        const todayDate = new Date();

        // [R6-FIX] Compare calendar dates (date part only), not 24-hour periods
        const diffDays = lastDate ? calendarDayDiff(lastDate, todayDate) : 999;

        let newCurrent = streak.current_streak;
        if (diffDays === 0) {
          // Same calendar day — no streak change
        } else if (diffDays === 1) {
          newCurrent += 1;
        } else {
          newCurrent = 1; // streak broken
        }
        const newMax = Math.max(newCurrent, streak.max_streak);

        await client.query(
          `UPDATE recitation_streaks SET
             current_streak=$1, max_streak=$2, last_completed_at=NOW(),
             total_completed=total_completed+1, updated_at=NOW()
           WHERE student_id=$3 AND teacher_id=$4`,
          [newCurrent, newMax, studentId, teacherId]
        );
      }

      // Delete session
      await client.query(
        'DELETE FROM recitation_sessions WHERE student_id=$1 AND recitation_id=$2',
        [studentId, id]
      );

      await client.query('COMMIT');

      // Notify teacher
      sendEvent(`teacher_${teacherId}`, 'recitation_submitted', {
        studentId,
        recitationId: id,
        score: finalScore,
        passed,
      });

      res.json({
        result: resultRows[0],
        score: finalScore,
        correct,
        wrong,
        unanswered,
        passed,
        points_earned: pointsEarned,
        total_score: rec.total_score,
        pass_score: rec.pass_score,
        // Send back answers with correct letters for review
        review: snapshot.map(q => {
          const studentAns = answerMap[q.id] || null;
          if (q.question_type === 'image_multi') {
            const subQs = Array.isArray(q.sub_questions) ? q.sub_questions : [];
            let parsedAns = {};
            try { if (studentAns) parsedAns = JSON.parse(studentAns); } catch {}
            const subResults = subQs.map(sub => ({
              label: sub.label,
              correct: sub.correct,
              student_answer: parsedAns[sub.label] || null,
              is_correct: String(parsedAns[sub.label] || '').toUpperCase() === String(sub.correct).toUpperCase(),
            }));
            return {
              id: q.id,
              question_text: q.question_text,
              question_image_url: q.question_image_url,
              question_type: q.question_type,
              option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d,
              sub_questions: subQs,
              sub_results: subResults,
              student_answer: studentAns,
              is_correct: subResults.every(s => s.is_correct),
              points: q.points,
            };
          }
          return {
            id: q.id,
            question_text: q.question_text,
            question_image_url: q.question_image_url,
            question_type: q.question_type,
            option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d,
            correct_answer_letter: q.correct_answer_letter,
            student_answer: studentAns,
            is_correct: studentAns === q.correct_answer_letter,
            points: q.points,
          };
        }),
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[recitations POST /:id/submit]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
