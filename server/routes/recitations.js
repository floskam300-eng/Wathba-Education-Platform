const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { convertToWebp } = require('../lib/convertToWebp');
const { deleteUploadFile, extractSubQuestionImages } = require('../lib/validateFileMagic');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { getPermissions } = require('../lib/permissionsCache');
const { sendEvent } = require('../sse');
const { sendFCMToStudents } = require('../lib/fcm');
const { logActivity, getActor, getIp } = require('../lib/activityLog');
const { getCached, setCache, invalidateCache } = require('../lib/analyticsCache');

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

async function verifyMagicBytes(filePath, ext) {
  let fh;
  try {
    const buf = Buffer.alloc(4);
    fh = await fs.promises.open(filePath, 'r');
    await fh.read(buf, 0, 4, 0);
    const rule = ALLOWED_MAGIC.find(m => m.ext === ext);
    if (!rule) return false;
    return rule.magic.every((byte, i) => buf[i] === byte);
  } catch { return false; }
  finally {
    if (fh) await fh.close();
  }
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
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
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

const checkImageQuota = async (req, res, next) => {
  const teacherId = getTeacherId(req);
  try {
    const { rows } = await pool.query(
      `SELECT
        (SELECT COUNT(*)::int FROM questions q JOIN exams e ON q.exam_id = e.id WHERE e.teacher_id = $1 AND q.question_image_url IS NOT NULL) +
        (SELECT COUNT(*)::int FROM recitation_questions rq JOIN recitations r ON rq.recitation_id = r.id WHERE r.teacher_id = $1 AND rq.question_image_url IS NOT NULL) +
        (SELECT COUNT(*)::int FROM bank_questions bq JOIN question_banks qb ON bq.bank_id = qb.id WHERE qb.teacher_id = $1 AND bq.question_image_url IS NOT NULL)
        AS count`,
      [teacherId]
    );
    if (parseInt(rows[0].count, 10) >= 500) {
      return res.status(429).json({ error: 'لقد وصلت للحد الأقصى المسموح به لصور الأسئلة (500 صورة)' });
    }
    next();
  } catch (err) {
    console.error('[checkImageQuota] error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

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

// Shuffle MCQ options within image_multi sub-questions.
// Returns new sub_questions array with option_labels shuffled and correct letter remapped.
// Deterministic: same seed + questionId + subIdx always produces the same result.
function shuffleImgMultiSubQs(subQs, baseSeed, questionId) {
  const LETTERS = ['A', 'B', 'C', 'D'];
  return subQs.map((sub, subIdx) => {
    if (sub.type === 'true_false') return sub; // T/F only has 2 fixed positions — no shuffle needed
    const optCount = sub.option_labels ? Math.min(sub.option_labels.length, 4) : 4;
    if (optCount < 2) return sub;
    const origPositions = Array.from({ length: optCount }, (_, i) => i);
    const subSeed = ((baseSeed >>> 0) ^ ((questionId * 1000003) >>> 0) ^ ((subIdx * 31337) >>> 0)) >>> 0;
    const shuffled = seededShuffle(origPositions, subSeed || 1);
    // shuffled[newIdx] = origIdx — the original slot that occupies each new position
    const origCorrectIdx = LETTERS.indexOf(String(sub.correct || '').toUpperCase());
    const newCorrectIdx  = shuffled.indexOf(origCorrectIdx);
    const newCorrect     = (origCorrectIdx >= 0 && newCorrectIdx >= 0) ? LETTERS[newCorrectIdx] : sub.correct;
    const newOptionLabels = sub.option_labels
      ? shuffled.map(origIdx => sub.option_labels[origIdx] !== undefined ? sub.option_labels[origIdx] : null)
      : null;
    return { ...sub, option_labels: newOptionLabels, correct: newCorrect };
  });
}

// ── Ownership helpers ─────────────────────────────────────────────────────────
const getRecitationForOwner = async (id, teacherId) => {
  const r = await pool.query(
    'SELECT * FROM recitations WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL',
    [id, teacherId]
  );
  return r.rows[0] || null;
};

// ── [R6-FIX] Calendar-day streak diff — compares date parts, not 24h periods ─

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
        WHERE r.teacher_id = $1 AND r.deleted_at IS NULL
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
    course_id, video_ids, allow_retry,
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
  if (passSc > totalSc)
    return res.status(400).json({ error: 'درجة النجاح لا يمكن أن تتجاوز الدرجة الكلية' });
  if (passSc < 0 || totalSc < 1)
    return res.status(400).json({ error: 'الدرجات غير صالحة' });

  if (start_date && end_date && new Date(end_date) <= new Date(start_date))
    return res.status(400).json({ error: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية' });

  // [M2-FIX] Guard against NaN from parseInt when course_id is non-numeric
  const rawCourseId = parseInt(course_id, 10);
  const parsedCourseId = Number.isFinite(rawCourseId) && rawCourseId > 0 ? rawCourseId : null;
  const parsedVideoIds = Array.isArray(video_ids) ? video_ids.map(v => parseInt(v, 10)).filter(v => Number.isFinite(v) && v > 0) : [];

  try {
    const teacherId = getTeacherId(req);

    // Verify course ownership if provided
    if (parsedCourseId) {
      const { rows: cRows } = await pool.query(
        'SELECT id FROM courses WHERE id=$1 AND teacher_id=$2',
        [parsedCourseId, teacherId]
      );
      if (!cRows.length) return res.status(403).json({ error: 'الكورس غير موجود أو ليس لك' });

      // [C3-FIX] Verify that all video IDs belong to the specified course
      if (parsedVideoIds.length > 0) {
        const { rows: validVids } = await pool.query(
          'SELECT id FROM videos WHERE id = ANY($1::int[]) AND course_id = $2',
          [parsedVideoIds, parsedCourseId]
        );
        if (validVids.length !== parsedVideoIds.length) {
          return res.status(400).json({ error: 'بعض الفيديوهات المحددة لا تنتمي للكورس المختار' });
        }
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO recitations
         (teacher_id, title, description, academic_stage, duration_minutes,
          total_score, pass_score, points_on_attempt, points_on_pass,
          schedule_type, schedule_day, start_date, end_date,
          shuffle_questions, shuffle_options, course_id, video_ids, allow_retry)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
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
        parsedCourseId,
        JSON.stringify(parsedVideoIds),
        allow_retry !== false,
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
  // [T6-FIX] Use proper try/catch so a DB error on permissions lookup
  // returns 500 instead of being swallowed as a 403.
  if (req.user.role === 'assistant') {
    try {
      const perms = await getPermissions(req.user.id, pool);
      if (!perms || (!perms.can_manage_recitations && !perms.can_view_analytics))
        return res.status(403).json({ error: 'Access denied' });
    } catch {
      return res.status(500).json({ error: 'Server error' });
    }
  }

  // FIX-REC-CACHE: This endpoint previously had no caching, unlike all other
  // analytics endpoints.  Add a 5-minute cache keyed per teacher so repeated
  // requests from the Analytics page do not re-run the six parallel DB queries.
  const teacherIdForCache = getTeacherId(req);
  const cacheKey = `t${teacherIdForCache}_rec_analytics`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const teacherId = teacherIdForCache;

    const [totalRec, totalResults, avgScore, byStage, topStudents, recentActivity] = await Promise.all([
      pool.query('SELECT COUNT(*) AS cnt FROM recitations WHERE teacher_id=$1 AND deleted_at IS NULL', [teacherId]),
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
                0 AS current_streak,
                0 AS max_streak
           FROM students s
           JOIN recitation_results rr ON s.id=rr.student_id
           JOIN recitations rec ON rr.recitation_id=rec.id
          WHERE rec.teacher_id=$1 AND s.deleted_at IS NULL
          GROUP BY s.id, s.name, s.academic_stage
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
          WHERE r.teacher_id=$1 AND r.deleted_at IS NULL
          GROUP BY r.id
          ORDER BY r.created_at DESC
          LIMIT 10`,
        [teacherId]
      ),
    ]);

    const payload = {
      summary: {
        total_recitations: parseInt(totalRec.rows[0].cnt, 10),
        total_results: parseInt(totalResults.rows[0].cnt, 10),
        avg_score: parseFloat(avgScore.rows[0].avg) || 0,
      },
      by_stage: byStage.rows,
      top_students: topStudents.rows,
      recent_recitations: recentActivity.rows,
    };
    setCache(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('[recitations GET /analytics]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// STUDENT FIXED-PATH ROUTES (must come before /:id routes)
// ════════════════════════════════════════════════════════════════════════════════

// GET /api/recitations/student/course/:courseId — recitations for a specific course
// Returns each recitation with the student's result (if any) and which videos they're linked to.
// Used by CourseView to gate video access.
router.get('/student/course/:courseId', requireRole('student'), async (req, res) => {
  const courseId = parseParamId(req.params.courseId);
  if (!courseId) return res.status(400).json({ error: 'Invalid course ID' });

  try {
    const studentId = req.user.id;

    // Tenant isolation: get teacher_id + academic_stage from student row
    const { rows: stRows } = await pool.query(
      'SELECT teacher_id, academic_stage FROM students WHERE id=$1 AND deleted_at IS NULL',
      [studentId]
    );
    if (!stRows.length) return res.status(403).json({ error: 'غير مصرح' });
    const { teacher_id: teacherId, academic_stage } = stRows[0];

    // Verify student is enrolled in this course
    const { rows: enrRows } = await pool.query(
      `SELECT sce.id FROM student_course_enrollment sce
         JOIN courses c ON c.id = sce.course_id
        WHERE sce.student_id=$1 AND sce.course_id=$2 AND sce.status='active'
          AND c.teacher_id=$3 AND c.is_published=true`,
      [studentId, courseId, teacherId]
    );
    if (!enrRows.length) return res.status(403).json({ error: 'غير مسجل في هذا الكورس' });

    // Fetch published recitations RELATED to this course: either directly linked via
    // course_id, OR stage-linked (course_id IS NULL but academic_stage matches the
    // student's stage). Previously only course-linked recitations showed up, so
    // stage-linked ones were invisible — "all recitations fail to load".
    // Recitations are ORDERED by the minimum sort_order of their linked videos, so
    // each recitation appears right before the video it gates — giving the student
    // a logical, sequential order.
    // [H5-FIX] LATERAL best-result uses passed DESC so an ever-passed attempt opens
    // the gate even if a later re-attempt failed.
    const { rows } = await pool.query(
      `SELECT r.id, r.title, r.description, r.duration_minutes, r.total_score, r.pass_score,
              r.start_date, r.end_date,
              r.video_ids,
              (SELECT COUNT(*) FROM recitation_questions WHERE recitation_id=r.id) AS question_count,
              rr.id AS result_id, rr.score AS my_score, rr.passed AS my_passed, rr.ever_passed AS my_ever_passed,
              rr.correct_count AS my_correct, rr.wrong_count AS my_wrong,
              rr.created_at AS my_submitted_at,
              lv.min_sort_order,
              lv.linked_video_title
         FROM recitations r
         LEFT JOIN LATERAL (
           SELECT rr2.id, rr2.score, rr2.passed,
                  (SELECT bool_or(rr3.passed) FROM recitation_results rr3
                    WHERE rr3.student_id=$1 AND rr3.recitation_id=r.id) AS ever_passed,
                  rr2.correct_count, rr2.wrong_count, rr2.created_at
            FROM recitation_results rr2
            WHERE rr2.student_id=$1
              AND rr2.recitation_id=r.id
            ORDER BY rr2.created_at DESC
            LIMIT 1
         ) rr ON true
         LEFT JOIN LATERAL (
           -- Resolve the FIRST linked video (lowest sort_order) for ordering + label.
           -- video_ids is a JSONB array of video ids; we pick the one that appears
           -- earliest in the course playlist.
           SELECT v.sort_order AS min_sort_order, v.title AS linked_video_title
             FROM videos v
            WHERE v.course_id = $2
              AND v.id = ANY (
                ARRAY(
                  SELECT jsonb_array_elements_text(
                    CASE WHEN jsonb_typeof(r.video_ids) = 'array' THEN r.video_ids ELSE '[]'::jsonb END
                  )::int
                )
              )
            ORDER BY v.sort_order ASC, v.id ASC
            LIMIT 1
         ) lv ON true
        WHERE r.teacher_id=$3
          AND r.is_published=true
          AND r.deleted_at IS NULL
          AND (r.course_id=$2 OR (r.course_id IS NULL AND r.academic_stage=$4))
        ORDER BY COALESCE(lv.min_sort_order, 999999) ASC, r.created_at ASC`,
      [studentId, courseId, teacherId, academic_stage]
    );
    res.json(rows);
  } catch (err) {
    console.error('[recitations GET /student/course/:courseId]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

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
           -- R-9 OPT: explicit columns instead of SELECT * in LATERAL subquery
           SELECT id, score, passed, correct_count, wrong_count, created_at
             FROM recitation_results rr2
            WHERE rr2.student_id=$1
              AND rr2.recitation_id=r.id
              AND (r.start_date IS NULL OR rr2.created_at >= r.start_date)
            ORDER BY rr2.created_at DESC
            LIMIT 1
         ) rr ON true
         LEFT JOIN recitation_sessions rs2 ON r.id=rs2.recitation_id AND rs2.student_id=$1
        WHERE r.teacher_id=$2
          AND r.is_published=true
          AND r.deleted_at IS NULL
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
router.post('/upload-image', requireRole('teacher', 'assistant'), checkManageRecitationsPerm, checkImageQuota, (req, res) => {
  uploadRecQImg.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'فشل رفع الصورة' });
    if (!req.file) return res.status(400).json({ error: 'لم يتم اختيار صورة' });

    // [C4] Verify magic bytes — reject if file content doesn't match extension
    const ext = path.extname(req.file.filename).toLowerCase();
    if (!(await verifyMagicBytes(req.file.path, ext))) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'الملف تالف أو غير صالح' });
    }

    // Convert to WebP for smaller file size (up to 80% reduction)
    try {
      const { filename: webpName } = await convertToWebp(req.file.path, req.file.filename);
      res.json({ url: `/uploads/question-images/${webpName}` });
    } catch (convErr) {
      console.error('[recitations] WebP conversion error:', convErr.message);
      // convertToWebp throws without deleting the original on sharp failure,
      // so we must clean it up here to avoid orphan files on disk.
      try { await fs.promises.unlink(req.file.path); } catch (_) {}
      return res.status(500).json({ error: 'خطأ أثناء معالجة الصورة' });
    }
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
    course_id, video_ids, allow_retry,
  } = req.body;

  if (!title || !String(title).trim())
    return res.status(400).json({ error: 'العنوان مطلوب' });

  const dur = parseInt(duration_minutes, 10);
  if (isNaN(dur) || dur < 1 || dur > 60)
    return res.status(400).json({ error: 'المدة يجب أن تكون بين 1 و60 دقيقة' });

  const totalSc = parseInt(total_score, 10) || 10;
  const passSc  = parseInt(pass_score, 10)  || 5;
  if (passSc > totalSc)
    return res.status(400).json({ error: 'درجة النجاح لا يمكن أن تتجاوز الدرجة الكلية' });
  if (passSc < 0 || totalSc < 1)
    return res.status(400).json({ error: 'الدرجات غير صالحة' });

  if (start_date && end_date && new Date(end_date) <= new Date(start_date))
    return res.status(400).json({ error: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية' });

  // [M2-FIX] Guard against NaN from parseInt when course_id is non-numeric
  const rawCourseIdPut = parseInt(course_id, 10);
  const parsedCourseId = Number.isFinite(rawCourseIdPut) && rawCourseIdPut > 0 ? rawCourseIdPut : null;
  const parsedVideoIds = Array.isArray(video_ids) ? video_ids.map(v => parseInt(v, 10)).filter(v => Number.isFinite(v) && v > 0) : [];

  try {
    const teacherId = getTeacherId(req);
    const rec = await getRecitationForOwner(id, teacherId);
    if (!rec) return res.status(404).json({ error: 'التسميع غير موجود' });
    if (rec.is_published) return res.status(409).json({ error: 'لا يمكن تعديل تسميع منشور. قم بإلغاء النشر أولاً' });

    if (parsedCourseId) {
      const { rows: cRows } = await pool.query(
        'SELECT id FROM courses WHERE id=$1 AND teacher_id=$2',
        [parsedCourseId, teacherId]
      );
      if (!cRows.length) return res.status(403).json({ error: 'الكورس غير موجود أو ليس لك' });

      // [C3-FIX] Verify that all video IDs belong to the specified course
      if (parsedVideoIds.length > 0) {
        const { rows: validVids } = await pool.query(
          'SELECT id FROM videos WHERE id = ANY($1::int[]) AND course_id = $2',
          [parsedVideoIds, parsedCourseId]
        );
        if (validVids.length !== parsedVideoIds.length) {
          return res.status(400).json({ error: 'بعض الفيديوهات المحددة لا تنتمي للكورس المختار' });
        }
      }
    }

    const { rows } = await pool.query(
      `UPDATE recitations SET
         title=$1, description=$2, academic_stage=$3, duration_minutes=$4,
         total_score=$5, pass_score=$6, points_on_attempt=$7, points_on_pass=$8,
         schedule_type=$9, schedule_day=$10, start_date=$11, end_date=$12,
         shuffle_questions=$13, shuffle_options=$14, course_id=$15, video_ids=$16,
         allow_retry=$17
       WHERE id=$18 AND teacher_id=$19 RETURNING *`,
      [
        String(title).trim(), description || null, academic_stage || null, dur,
        totalSc, passSc,
        parseInt(points_on_attempt, 10) || 0, parseInt(points_on_pass, 10) || 5,
        schedule_type || 'once',
        schedule_day != null ? parseInt(schedule_day, 10) : null,
        start_date || null, end_date || null,
        !!shuffle_questions, !!shuffle_options,
        parsedCourseId, JSON.stringify(parsedVideoIds),
        allow_retry !== false,
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

    // [T5-FIX] Block deletion of published recitations (consistent with PUT edit guard).
    // Active student sessions would be silently destroyed by CASCADE delete.
    // Teacher must unpublish first to protect in-progress student attempts.
    if (rec.is_published)
      return res.status(409).json({ error: 'لا يمكن حذف تسميع منشور — قم بإلغاء النشر أولاً' });

    // Soft delete — student results survive; recitation disappears from all lists.
    await pool.query('UPDATE recitations SET deleted_at=NOW() WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL', [id, teacherId]);
    // BUG-1 FIX: Clean up any remaining sessions (e.g. from students who opened the
    // recitation but never submitted before the teacher unpublished + deleted it).
    // The DB has ON DELETE CASCADE but that only fires on hard-delete; soft-delete
    // leaves them as orphans that the scheduler's N4-FIX won't reach.
    await pool.query('DELETE FROM recitation_sessions WHERE recitation_id=$1', [id])
      .catch(err => console.warn('[recitations DELETE] session cleanup failed:', err.message));
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
        'SELECT COUNT(*) AS cnt, COALESCE(SUM(points),0) AS points_sum FROM recitation_questions WHERE recitation_id=$1', [id]
      );
      if (parseInt(qRows[0].cnt, 10) === 0)
        return res.status(400).json({ error: 'أضف أسئلة للتسميع قبل النشر' });
      const pointsSum = parseInt(qRows[0].points_sum, 10) || 0;
      const recTotal = parseInt(rec.total_score, 10) || 0;
      if (pointsSum !== recTotal) {
        return res.status(400).json({
          error: `مجموع درجات الأسئلة (${pointsSum}) لا يساوي الدرجة الكلية للتسميع (${recTotal}) — عدّل درجات الأسئلة أو الدرجة الكلية قبل النشر`,
          field: 'points_mismatch',
        });
      }
    }

    // [DUP-2 FIX] Atomically set start_notified based on whether the recitation
    // window is already open, in the same UPDATE that flips is_published.
    // Previously start_notified was always reset to false on publish, which caused
    // the scheduler (running every 5 min) to find the recitation with
    // start_notified=false and send another new_recitation SSE — even though the
    // route had just sent one — resulting in duplicate SSE events and a potential
    // second notification_log row from the scheduler's window-reset path.
    //
    // Logic when publishing ($1=true):
    //   • start_date is null or already past  → start_notified=true  (route handles it now)
    //   • start_date is in the future         → start_notified=false (scheduler fires when window opens)
    // When unpublishing: leave start_notified unchanged.
    const { rows } = await pool.query(
      `UPDATE recitations
          SET is_published=$1,
              start_notified = CASE
                WHEN $1 THEN (start_date IS NULL OR start_date <= NOW())
                ELSE start_notified
              END,
              -- Reset absent_marked when re-publishing so the scheduler and new
              -- unpublish can mark absent again for the fresh window.
              absent_marked = CASE WHEN $1 THEN false ELSE absent_marked END
        WHERE id=$2 AND teacher_id=$3 RETURNING *`,
      [newPublished, id, teacherId]
    );

    // Notify eligible students on publish
    if (newPublished) {
      const rec2 = rows[0];
      const recStartDate = rec2.start_date ? new Date(rec2.start_date) : null;
      const isAvailableNow = !recStartDate || recStartDate <= new Date();

      let studentQuery, params;
      if (rec2.academic_stage) {
        studentQuery = 'SELECT id FROM students WHERE teacher_id=$1 AND academic_stage=$2 AND deleted_at IS NULL AND is_suspended = false';
        params = [teacherId, rec2.academic_stage];
      } else {
        studentQuery = 'SELECT id FROM students WHERE teacher_id=$1 AND deleted_at IS NULL AND is_suspended = false';
        params = [teacherId];
      }
      const { rows: students } = await pool.query(studentQuery, params);
      const studentIds = students.map(s => s.id);

      // Only send real-time SSE + notification_log when the window is open now.
      // If start_date is in the future, the scheduler will fire when the window opens
      // (start_notified=false ensures the scheduler picks it up).
      if (isAvailableNow) {
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
      }

      logActivity({
        teacherId, actor: getActor(req), ip: getIp(req),
        action: 'publish_recitation',
        entity: { type: 'recitation', id, name: rec2.title },
      });
    } else {
      // Unpublishing — mark absent for every eligible student who never submitted
      markAbsentRecitationStudents(pool, id, teacherId).catch(e =>
        console.error('[unpublish recitation] markAbsentRecitationStudents error:', e.message)
      );
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

  const { question_text, question_image_url, question_type, option_a, option_b, option_c, option_d, correct_answer_letter, points, sub_questions, option_labels } = req.body;

  const qtype = question_type || 'mcq';
  const isImgMulti = qtype === 'image_multi';

  if (!question_text && !question_image_url)
    return res.status(400).json({ error: 'نص السؤال أو صورة مطلوبة' });

  // [C3] Validate image URL — must point to our uploads directory only
  if (question_image_url && !validateImageUrl(question_image_url))
    return res.status(400).json({ error: 'رابط الصورة غير صالح' });

  let finalPoints = parseInt(points, 10) || 1;
  let subQs = null;
  if (!isImgMulti) {
    if (!correct_answer_letter || !['A','B','C','D','T','F'].includes(correct_answer_letter))
      return res.status(400).json({ error: 'الإجابة الصحيحة غير صالحة' });
  } else {
    if (!Array.isArray(sub_questions) || sub_questions.length === 0)
      return res.status(400).json({ error: 'سؤال الصورة يحتاج إلى أسئلة فرعية' });
    if (sub_questions.length > 50)
      return res.status(400).json({ error: 'الحد الأقصى للأسئلة الفرعية هو 50' });
    
    let calculatedPoints = 0;
    const sanitizedSubs = [];
    for (const sub of sub_questions) {
      if (!sub.label || !String(sub.label).trim())
        return res.status(400).json({ error: 'كل سؤال فرعي يجب أن يحتوي على رقم/عنوان' });
      const subType = sub.type || 'mcq';
      if (!['mcq', 'true_false'].includes(subType)) return res.status(400).json({ error: 'نوع البند غير صالح' });
      const allowed = subType === 'true_false' ? ['A', 'B'] : ['A', 'B', 'C', 'D'];
      if (!allowed.includes(String(sub.correct || '').toUpperCase()))
        return res.status(400).json({ error: `الإجابة الصحيحة للبند ${sub.label} غير صالحة` });
      
      const subPoints = parseInt(sub.points) >= 1 ? parseInt(sub.points) : 1;
      calculatedPoints += subPoints;
      sanitizedSubs.push({
        label: String(sub.label).trim(),
        correct: String(sub.correct || '').toUpperCase(),
        type: subType,
        points: subPoints,
        option_labels: Array.isArray(sub.option_labels) ? sub.option_labels.map(l => String(l || '').trim()) : null
      });
    }
    const labels = sanitizedSubs.map(s => s.label);
    if (new Set(labels).size !== labels.length)
      return res.status(400).json({ error: 'أرقام الأسئلة الفرعية يجب أن تكون فريدة' });
    subQs = sanitizedSubs;
    finalPoints = calculatedPoints;
  }

  try {
    const teacherId = getTeacherId(req);
    const rec = await getRecitationForOwner(id, teacherId);
    if (!rec) return res.status(404).json({ error: 'التسميع غير موجود' });
    if (rec.is_published) return res.status(409).json({ error: 'لا يمكن إضافة أسئلة لتسميع منشور' });

    const { rows: maxRow } = await pool.query(
      'SELECT COALESCE(MAX(sort_order),0) AS m FROM recitation_questions WHERE recitation_id=$1', [id]
    );

    const finalOptionLabels = Array.isArray(option_labels) ? JSON.stringify(option_labels) : null;
    const { rows } = await pool.query(
      `INSERT INTO recitation_questions
         (recitation_id, question_text, question_image_url, question_type, option_a, option_b, option_c, option_d,
          correct_answer_letter, points, sort_order, sub_questions, option_labels)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
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
        finalPoints,
        parseInt(maxRow[0].m, 10) + 1,
        subQs ? JSON.stringify(subQs) : '[]',
        finalOptionLabels,
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

  const { question_text, question_image_url, question_type, option_a, option_b, option_c, option_d, correct_answer_letter, points, sub_questions, option_labels } = req.body;

  const qtype = question_type || 'mcq';
  const isImgMulti = qtype === 'image_multi';

  if (!question_text && !question_image_url)
    return res.status(400).json({ error: 'نص السؤال أو صورة مطلوبة' });

  // [C3] Validate image URL — must point to our uploads directory only
  if (question_image_url && !validateImageUrl(question_image_url))
    return res.status(400).json({ error: 'رابط الصورة غير صالح' });

  let finalPoints = parseInt(points, 10) || 1;
  let subQs = null;
  if (!isImgMulti) {
    if (!correct_answer_letter || !['A','B','C','D','T','F'].includes(correct_answer_letter))
      return res.status(400).json({ error: 'الإجابة الصحيحة غير صالحة' });
  } else {
    if (!Array.isArray(sub_questions) || sub_questions.length === 0)
      return res.status(400).json({ error: 'سؤال الصورة يحتاج إلى أسئلة فرعية' });
    if (sub_questions.length > 50)
      return res.status(400).json({ error: 'الحد الأقصى للأسئلة الفرعية هو 50' });
    
    let calculatedPoints = 0;
    const sanitizedSubs = [];
    for (const sub of sub_questions) {
      if (!sub.label || !String(sub.label).trim())
        return res.status(400).json({ error: 'كل سؤال فرعي يجب أن يحتوي على رقم/عنوان' });
      const subType = sub.type || 'mcq';
      if (!['mcq', 'true_false'].includes(subType)) return res.status(400).json({ error: 'نوع البند غير صالح' });
      const allowed = subType === 'true_false' ? ['A', 'B'] : ['A', 'B', 'C', 'D'];
      if (!allowed.includes(String(sub.correct || '').toUpperCase()))
        return res.status(400).json({ error: `الإجابة الصحيحة للبند ${sub.label} غير صالحة` });
      
      const subPoints = parseInt(sub.points) >= 1 ? parseInt(sub.points) : 1;
      calculatedPoints += subPoints;
      sanitizedSubs.push({
        label: String(sub.label).trim(),
        correct: String(sub.correct || '').toUpperCase(),
        type: subType,
        points: subPoints,
        option_labels: Array.isArray(sub.option_labels) ? sub.option_labels.map(l => String(l || '').trim()) : null
      });
    }
    const labels = sanitizedSubs.map(s => s.label);
    if (new Set(labels).size !== labels.length)
      return res.status(400).json({ error: 'أرقام الأسئلة الفرعية يجب أن تكون فريدة' });
    subQs = sanitizedSubs;
    finalPoints = calculatedPoints;
  }

  try {
    const teacherId = getTeacherId(req);
    const rec = await getRecitationForOwner(id, teacherId);
    if (!rec) return res.status(404).json({ error: 'التسميع غير موجود' });
    if (rec.is_published) return res.status(409).json({ error: 'لا يمكن تعديل أسئلة تسميع منشور' });

    const finalOptionLabels = Array.isArray(option_labels) ? JSON.stringify(option_labels) : null;
    const { rows } = await pool.query(
      `UPDATE recitation_questions SET
         question_text=$1, question_image_url=$2, question_type=$3,
         option_a=$4, option_b=$5, option_c=$6, option_d=$7,
         correct_answer_letter=$8, points=$9, sub_questions=$10,
         option_labels=$11
       WHERE id=$12 AND recitation_id=$13 RETURNING *`,
      [
        question_text || null,
        question_image_url || null,
        qtype,
        option_a || null, option_b || null, option_c || null, option_d || null,
        isImgMulti ? 'A' : correct_answer_letter,
        finalPoints,
        subQs ? JSON.stringify(subQs) : '[]',
        finalOptionLabels,
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

    // [H2] Delete orphaned image files from disk (best-effort, ignore errors)
    if (qRows[0].question_image_url && VALID_Q_IMG_RE.test(qRows[0].question_image_url)) {
      const imgPath = path.join(__dirname, '../..', qRows[0].question_image_url);
      fs.unlink(imgPath, () => {});
    }
    // Also clean up sub_questions images (image_multi type)
    extractSubQuestionImages(qRows[0].sub_questions).forEach(deleteUploadFile);

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
      `SELECT rr.*, s.name AS student_name, s.academic_stage,
              COUNT(*) OVER (PARTITION BY rr.student_id) AS attempt_count,
              FIRST_VALUE(rr.score) OVER (PARTITION BY rr.student_id ORDER BY rr.created_at ASC) AS first_score,
              FIRST_VALUE(rr.passed) OVER (PARTITION BY rr.student_id ORDER BY rr.created_at ASC) AS first_passed,
              FIRST_VALUE(rr.created_at) OVER (PARTITION BY rr.student_id ORDER BY rr.created_at ASC) AS first_submitted_at
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
        WHERE id=$1 AND teacher_id=$2 AND is_published=true AND deleted_at IS NULL
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

    // Check for existing session first (resume in-progress attempt, even when retrying)
    const { rows: sessRows } = await pool.query(
      'SELECT student_id, recitation_id, started_at, questions_snapshot FROM recitation_sessions WHERE student_id=$1 AND recitation_id=$2',
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

    // [R5-FIX] For recurring recitations: only block if student already submitted
    // WITHIN the current window (start_date). This allows retaking in a new window.
    // [allow_retry] Skip the block entirely when allow_retry=true — students may retake freely.
    const { rows: existing } = await pool.query(
      `SELECT id FROM recitation_results
        WHERE student_id=$1 AND recitation_id=$2
          AND ($3::timestamp IS NULL OR created_at >= $3::timestamp)
        LIMIT 1`,
      [studentId, id, rec.start_date]
    );
    if (existing.length && !rec.allow_retry)
      return res.status(409).json({ error: 'لقد أديت هذا التسميع بالفعل', already_submitted: true });

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
        if (q.question_type === 'mcq') {
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
        }
        if (q.question_type === 'image_multi' && Array.isArray(q.sub_questions) && q.sub_questions.length > 0) {
          return { ...q, sub_questions: shuffleImgMultiSubQs(q.sub_questions, seed, q.id) };
        }
        return q;
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

const recitationSubmitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) => `rec_submit_${req.user?.id}`,
  message: { error: 'لقد قمت بتسليم التسميع عدة مرات، يرجى المحاولة بعد دقيقة' }
});

// POST /api/recitations/:id/submit — submit answers
router.post('/:id/submit', recitationSubmitLimiter, requireRole('student'), async (req, res) => {
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
        WHERE id=$1 AND teacher_id=$2 AND is_published=true AND deleted_at IS NULL
          AND (academic_stage IS NULL OR academic_stage=$3)`,
      [id, teacherId, academic_stage]
    );
    if (!recRows.length) return res.status(404).json({ error: 'التسميع غير متاح' });
    const rec = recRows[0];

    // [R5-FIX] Fast-path duplicate check OUTSIDE the transaction to avoid
    // unnecessary TX overhead for the common case.  A second in-TX check
    // (T1-FIX below) protects against the rare concurrent-submit race.
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
      'SELECT student_id, recitation_id, started_at, questions_snapshot FROM recitation_sessions WHERE student_id=$1 AND recitation_id=$2',
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

        let questionEarnedPoints = 0;
        let subCorrectCount = 0;
        for (const sub of subQs) {
          const rawStudentSubAns = String(parsedAns[sub.label] || '').toUpperCase();
          const rawSubCorrect = String(sub.correct || '').toUpperCase();
          const a = (sub.type === 'true_false' || rawStudentSubAns === 'T' || rawStudentSubAns === 'F')
            ? (rawStudentSubAns === 'T' ? 'A' : rawStudentSubAns === 'F' ? 'B' : rawStudentSubAns)
            : rawStudentSubAns;
          const subCorrect = (sub.type === 'true_false' || rawSubCorrect === 'T' || rawSubCorrect === 'F')
            ? (rawSubCorrect === 'T' ? 'A' : rawSubCorrect === 'F' ? 'B' : rawSubCorrect)
            : rawSubCorrect;

          if (VALID_ANSWER_LETTERS.has(a) && a === subCorrect) {
            subCorrectCount++;
            const subPoints = sub.points !== undefined ? (parseInt(sub.points) || 1) : ((q.points || 1) / subQs.length);
            questionEarnedPoints += subPoints;
          }
        }

        rawScore += questionEarnedPoints;
        if (subCorrectCount === subQs.length) correct++;
        else wrong++;
        continue;
      }

      let finalStudentAns = studentAns;
      let finalCorrectAns = q.correct_answer_letter;
      if (q.question_type === 'true_false') {
        if (finalStudentAns === 'T') finalStudentAns = 'A';
        if (finalStudentAns === 'F') finalStudentAns = 'B';
        if (finalCorrectAns === 'T') finalCorrectAns = 'A';
        if (finalCorrectAns === 'F') finalCorrectAns = 'B';
      }

      if (!finalStudentAns) {
        unanswered++;
      } else if (finalStudentAns === finalCorrectAns) {
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

      // [T1-FIX] Lock the session row inside the transaction to prevent a
      // concurrent second submit from also passing the pre-check and
      // inserting a duplicate result (double points bug).
      // If the session no longer exists (deleted by a racing commit), the
      // student gets a clean "no active session" 400 rather than a 500.
      const { rows: lockRows } = await client.query(
        'SELECT id FROM recitation_sessions WHERE student_id=$1 AND recitation_id=$2 FOR UPDATE',
        [studentId, id]
      );
      if (!lockRows.length) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ error: 'لا توجد جلسة نشطة. ابدأ التسميع أولاً' });
      }

      // Re-check for duplicate INSIDE the locked transaction
      const { rows: dupeRows } = await client.query(
        `SELECT id FROM recitation_results
          WHERE student_id=$1 AND recitation_id=$2
            AND ($3::timestamp IS NULL OR created_at >= $3::timestamp)`,
        [studentId, id, rec.start_date]
      );
      if (dupeRows.length) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(409).json({ error: 'لقد أديت هذا التسميع بالفعل', already_submitted: true });
      }

      // Insert result
       const storedAnswers = answers.map(a => {
        const q = snapshot.find(sq => sq.id === a.question_id);
        const ans = answerMap[a.question_id] || null;
        let isCorrect = false;
        if (q?.question_type === 'image_multi') {
          const subQs = Array.isArray(q.sub_questions) ? q.sub_questions : [];
          if (subQs.length > 0 && ans) {
            let parsed = {};
            try { parsed = JSON.parse(ans); } catch {}
            isCorrect = subQs.every(sub => {
              const rawSubSa = String(parsed[sub.label] || '').toUpperCase();
              const rawSubCorrect = String(sub.correct || '').toUpperCase();
              const aVal = (sub.type === 'true_false' || rawSubSa === 'T' || rawSubSa === 'F')
                ? (rawSubSa === 'T' ? 'A' : rawSubSa === 'F' ? 'B' : rawSubSa)
                : rawSubSa;
              const subCorrectVal = (sub.type === 'true_false' || rawSubCorrect === 'T' || rawSubCorrect === 'F')
                ? (rawSubCorrect === 'T' ? 'A' : rawSubCorrect === 'F' ? 'B' : rawSubCorrect)
                : rawSubCorrect;
              return aVal === subCorrectVal;
            });
          }
        } else {
          let ansNormalized = ans;
          let correctNormalized = q?.correct_answer_letter;
          if (q?.question_type === 'true_false') {
            if (ansNormalized === 'T') ansNormalized = 'A';
            if (ansNormalized === 'F') ansNormalized = 'B';
            if (correctNormalized === 'T') correctNormalized = 'A';
            if (correctNormalized === 'F') correctNormalized = 'B';
          }
          isCorrect = !!ansNormalized && correctNormalized === ansNormalized;
        }
        return { question_id: a.question_id, answer: ans, correct: isCorrect };
      });

      const { rows: resultRows } = await client.query(
        `INSERT INTO recitation_results
           (student_id, recitation_id, score, correct_count, wrong_count, unanswered_count,
            answers, points_earned, start_time, end_time, passed, questions_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10,$11) RETURNING *`,
        [
          studentId, id, finalScore, correct, wrong, unanswered,
          JSON.stringify(storedAnswers),
          pointsEarned,
          session.started_at,
          passed,
          JSON.stringify(snapshot),
        ]
      );

      // Update student points
      if (pointsEarned > 0) {
        await client.query(
          'UPDATE students SET points = points + $1 WHERE id=$2',
          [pointsEarned, studentId]
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

// ── GET /recitations/results/:resultId/review ──────────────────────────────
router.get('/results/:resultId/review', authenticate, async (req, res) => {
  try {
    const resultId = parseInt(req.params.resultId, 10);
    // [SRV-1 FIX] Guard PG_INT_MAX — values >2147483647 cause a DB integer overflow error
    if (isNaN(resultId) || resultId <= 0 || resultId > 2147483647) return res.status(400).json({ error: 'معرّف النتيجة غير صالح' });

    const teacherId = req.user.role === 'student' ? null : (req.user.teacher_id || req.user.id);

    const resultRes = await pool.query(`
      SELECT rr.*, r.title as recitation_title, r.total_score, r.pass_score,
             r.teacher_id,
             s.name as student_name, s.id as student_id_check
      FROM recitation_results rr
      JOIN recitations r ON rr.recitation_id = r.id
      JOIN students s ON rr.student_id = s.id
      WHERE rr.id = $1
    `, [resultId]);

    if (!resultRes.rows.length) return res.status(404).json({ error: 'النتيجة غير موجودة' });
    const row = resultRes.rows[0];

    if (req.user.role === 'student') {
      if (row.student_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    } else {
      if (row.teacher_id !== teacherId) return res.status(403).json({ error: 'Access denied' });
    }

    // Build answer map from recitation_results.answers JSONB
    // Format: [{question_id, answer, correct}]
    // [SH-1] Also capture the stored `correct` flag so is_correct survives snapshot loss.
    const answerMap = {};
    const storedCorrectMap = {};
    try {
      const storedAnswers = Array.isArray(row.answers) ? row.answers
        : (typeof row.answers === 'string' ? JSON.parse(row.answers) : []);
      storedAnswers.forEach(a => {
        if (a.question_id != null) {
          answerMap[a.question_id] = a.answer || null;
          if (a.correct != null) storedCorrectMap[a.question_id] = !!a.correct;
        }
      });
    } catch (_) {}

    // [SH-1] Priority: 1) snapshot stored in result row (since session is deleted post-submit)
    //                  2) active session snapshot (edge case: re-take after retry)
    //                  3) DB fallback (original questions — correct_answer_letter may differ when shuffle was on)
    let snapshot = [];
    const resultSnapshot = Array.isArray(row.questions_snapshot)
      ? row.questions_snapshot
      : (row.questions_snapshot ? (() => { try { return JSON.parse(row.questions_snapshot); } catch { return null; } })() : null);

    if (resultSnapshot && resultSnapshot.length > 0) {
      snapshot = resultSnapshot;
    } else {
      const sessionRes = await pool.query(
        'SELECT questions_snapshot FROM recitation_sessions WHERE student_id=$1 AND recitation_id=$2 ORDER BY started_at DESC LIMIT 1',
        [row.student_id, row.recitation_id]
      );
      if (sessionRes.rows.length && Array.isArray(sessionRes.rows[0].questions_snapshot)) {
        snapshot = sessionRes.rows[0].questions_snapshot;
      } else {
        const qRes = await pool.query(
          'SELECT * FROM recitation_questions WHERE recitation_id=$1 ORDER BY sort_order, id',
          [row.recitation_id]
        );
        snapshot = qRes.rows;
      }
    }

    const review = snapshot.map(q => {
      const studentAns = answerMap[q.id] || null;
      if (q.question_type === 'image_multi') {
        const subQs = Array.isArray(q.sub_questions) ? q.sub_questions : [];
        let parsedAns = {};
        try { if (studentAns) parsedAns = JSON.parse(studentAns); } catch {}
        const subResults = subQs.map(sub => {
          const rawSubSa = parsedAns[sub.label] || null;
          const rawSubCorrect = sub.correct;
          const isTF = sub.type === 'true_false' || String(rawSubCorrect).toUpperCase() === 'T' || String(rawSubCorrect).toUpperCase() === 'F' || String(rawSubSa).toUpperCase() === 'T' || String(rawSubSa).toUpperCase() === 'F';
          const subSa = isTF ? (String(rawSubSa).toUpperCase() === 'T' ? 'A' : String(rawSubSa).toUpperCase() === 'F' ? 'B' : rawSubSa) : rawSubSa;
          const subCorrect = isTF ? (String(rawSubCorrect).toUpperCase() === 'T' ? 'A' : String(rawSubCorrect).toUpperCase() === 'F' ? 'B' : rawSubCorrect) : rawSubCorrect;
          const isSubCorrect = String(subSa || '').toUpperCase() === String(subCorrect || '').toUpperCase();
          return {
            label: sub.label,
            correct: subCorrect,
            type: sub.type || 'mcq',
            points: sub.points !== undefined ? sub.points : 1,
            option_labels: sub.option_labels || null,
            student_answer: subSa,
            is_correct: isSubCorrect,
          };
        });
        // [SH-1] Use stored is_correct if available (ground truth from submit time)
        const storedIsCorrect = storedCorrectMap[q.id];
        return {
          id: q.id,
          question_text: q.question_text,
          question_image_url: q.question_image_url,
          question_type: q.question_type,
          option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d,
          sub_questions: subQs,
          sub_results: subResults,
          student_answer: studentAns,
          is_correct: storedIsCorrect != null ? storedIsCorrect : (subResults.length > 0 && subResults.every(s => s.is_correct)),
          points: q.points,
        };
      }

      let studentAnsNormalized = studentAns;
      let correctLetterNormalized = q.correct_answer_letter;
      if (q.question_type === 'true_false') {
        if (studentAnsNormalized === 'T') studentAnsNormalized = 'A';
        if (studentAnsNormalized === 'F') studentAnsNormalized = 'B';
        if (correctLetterNormalized === 'T') correctLetterNormalized = 'A';
        if (correctLetterNormalized === 'F') correctLetterNormalized = 'B';
      }
      const recomputedCorrect = !!studentAnsNormalized && studentAnsNormalized === correctLetterNormalized;
      // [SH-1] Use stored correct flag as authoritative source (survives shuffle + snapshot loss)
      const isCorrect = storedCorrectMap[q.id] != null ? storedCorrectMap[q.id] : recomputedCorrect;
      return {
        id: q.id,
        question_text: q.question_text,
        question_image_url: q.question_image_url,
        question_type: q.question_type,
        option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d,
        correct_answer_letter: correctLetterNormalized,
        student_answer: studentAnsNormalized,
        is_correct: isCorrect,
        points: q.points,
      };
    });

    const correct    = review.filter(q => q.is_correct).length;
    // [SRV-2 FIX] Removed redundant ternary — both branches were identical.
    // "Wrong" = answered but not correct.
    const wrong      = review.filter(q => !q.is_correct && !!q.student_answer).length;
    const unanswered = review.filter(q => !q.student_answer).length;

    res.json({
      result: {
        id: row.id,
        recitation_id: row.recitation_id,
        student_id: row.student_id,
        student_name: row.student_name,
        recitation_title: row.recitation_title,
        score: row.score,
        total_score: row.total_score,
        pass_score: row.pass_score,
        passed: row.passed,
        correct_count: row.correct_count ?? correct,
        wrong_count: row.wrong_count ?? wrong,
        unanswered_count: row.unanswered_count ?? unanswered,
        points_earned: row.points_earned || 0,
        created_at: row.created_at,
      },
      review,
    });
  } catch (err) {
    console.error('[recitations GET /results/:resultId/review]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Absent marking for recitations ────────────────────────────────────────────
// Mirrors markAbsentStudents() in exams.js. Inserts an is_absent=true row for
// every eligible student who has no result yet for this recitation.
// Eligibility: all non-suspended, non-deleted students of this teacher,
// filtered by academic_stage if the recitation has one set.
async function markAbsentRecitationStudents(poolOrClient, recitationId, teacherId) {
  try {
    const recInfo = await poolOrClient.query(
      'SELECT academic_stage FROM recitations WHERE id=$1 AND deleted_at IS NULL', [recitationId]
    );
    if (!recInfo.rows.length) return 0;
    const { academic_stage } = recInfo.rows[0];

    let eligibleRows;
    if (academic_stage) {
      const r = await poolOrClient.query(
        `SELECT s.id
           FROM students s
          WHERE s.teacher_id=$1 AND s.academic_stage=$2
            AND s.deleted_at IS NULL AND s.is_suspended=false
            AND NOT EXISTS (
              SELECT 1 FROM recitation_results rr
               WHERE rr.student_id=s.id AND rr.recitation_id=$3
            )`,
        [teacherId, academic_stage, recitationId]
      );
      eligibleRows = r.rows;
    } else {
      const r = await poolOrClient.query(
        `SELECT s.id
           FROM students s
          WHERE s.teacher_id=$1
            AND s.deleted_at IS NULL AND s.is_suspended=false
            AND NOT EXISTS (
              SELECT 1 FROM recitation_results rr
               WHERE rr.student_id=s.id AND rr.recitation_id=$3
            )`,
        [teacherId, recitationId]
      );
      eligibleRows = r.rows;
    }

    if (eligibleRows.length > 0) {
      const studentIds = eligibleRows.map(r => r.id);
      await poolOrClient.query(
        `INSERT INTO recitation_results
           (student_id, recitation_id, score, correct_count, wrong_count,
            unanswered_count, is_absent, passed, points_earned)
         SELECT s_id, $2, 0, 0, 0, 0, true, false, 0
           FROM unnest($1::int[]) AS s_id
          WHERE NOT EXISTS (
            SELECT 1 FROM recitation_results rr
             WHERE rr.student_id=s_id AND rr.recitation_id=$2
          )`,
        [studentIds, recitationId]
      );
    }
    await poolOrClient.query(
      'UPDATE recitations SET absent_marked=true WHERE id=$1', [recitationId]
    );
    console.log(`[markAbsentRecitationStudents] recitation=${recitationId} — marked ${eligibleRows.length} absent`);
    return eligibleRows.length;
  } catch (err) {
    console.error('[markAbsentRecitationStudents] error:', err.message);
    return 0;
  }
}

module.exports = router;
module.exports.markAbsentRecitationStudents = markAbsentRecitationStudents;
