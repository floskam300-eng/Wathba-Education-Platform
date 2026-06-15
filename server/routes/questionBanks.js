const express = require('express');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { getPermissions } = require('../lib/permissionsCache');
const { isValidImage, deleteFile } = require('../lib/validateFileMagic');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const router = express.Router();
router.use(authenticate);

const getTeacherId = (req) => req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;

// [QB1-FIX] parseParamId — strict integer validation + PG_INT_MAX guard.
// Uses /^\d+$/ to reject any non-digit prefix (e.g. "1;DROP TABLE" → null).
// parseInt alone is insufficient because parseInt("1;DROP", 10) === 1.
const PG_INT_MAX = 2147483647;
function parseParamId(raw) {
  const s = String(raw ?? '').trim();
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < 1 || n > PG_INT_MAX) return null;
  return n;
}

const checkManageExamsPerm = async (req, res, next) => {
  if (req.user.role === 'teacher') return next();
  try {
    const perms = await getPermissions(req.user.id, pool);
    if (!perms || !perms.can_manage_exams)
      return res.status(403).json({ error: 'Access denied: missing permission (can_manage_exams)' });
    next();
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
};

// [QB3-FIX] Use crypto.randomBytes(8) for filename uniqueness.
// Date.now() alone allowed same-millisecond collisions when two teachers
// uploaded simultaneously, causing one file to silently overwrite the other.
const qImgStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/question-images');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const rand = crypto.randomBytes(8).toString('hex');
    cb(null, `bq_${Date.now()}_${rand}${path.extname(file.originalname)}`);
  },
});
const uploadImg = multer({
  storage: qImgStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('يُسمح بالصور فقط'));
  },
});

// [QB4/QB5] Shared valid-letter set used in both POST and PUT
const VALID_ANSWER_LETTERS = new Set(['A', 'B', 'C', 'D', 'T', 'F']);

// ── List banks ──
router.get('/', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      `SELECT qb.*, c.name AS course_name,
              COUNT(bq.id) AS question_count,
              COUNT(bq.id) FILTER (WHERE bq.difficulty = 'easy')   AS easy_count,
              COUNT(bq.id) FILTER (WHERE bq.difficulty = 'medium') AS medium_count,
              COUNT(bq.id) FILTER (WHERE bq.difficulty = 'hard')   AS hard_count
       FROM question_banks qb
       LEFT JOIN bank_questions bq ON bq.bank_id = qb.id
       LEFT JOIN courses c ON c.id = qb.course_id
       WHERE qb.teacher_id = $1
       GROUP BY qb.id, c.name
       ORDER BY qb.created_at DESC`,
      [teacherId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Create bank ──
router.post('/', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { name, course_id } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'اسم البنك مطلوب' });
  try {
    if (course_id) {
      const courseCheck = await pool.query('SELECT id FROM courses WHERE id=$1 AND teacher_id=$2', [course_id, teacherId]);
      if (!courseCheck.rows.length) return res.status(403).json({ error: 'الكورس غير موجود' });
    }
    const result = await pool.query(
      'INSERT INTO question_banks (name, course_id, teacher_id) VALUES ($1,$2,$3) RETURNING *',
      [name.trim(), course_id || null, teacherId]
    );
    res.status(201).json({ ...result.rows[0], question_count: 0 });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Update bank ──
router.put('/:id', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
  // [QB1-FIX] Validate bank ID before any DB call
  const bankId = parseParamId(req.params.id);
  if (!bankId) return res.status(400).json({ error: 'معرّف البنك غير صالح' });

  const teacherId = getTeacherId(req);
  const { name, course_id } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'اسم البنك مطلوب' });
  try {
    if (course_id) {
      const courseCheck = await pool.query('SELECT id FROM courses WHERE id=$1 AND teacher_id=$2', [course_id, teacherId]);
      if (!courseCheck.rows.length) return res.status(403).json({ error: 'الكورس غير موجود' });
    }
    const result = await pool.query(
      'UPDATE question_banks SET name=$1, course_id=$2 WHERE id=$3 AND teacher_id=$4 RETURNING *',
      [name.trim(), course_id || null, bankId, teacherId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'البنك غير موجود' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Delete bank ──
router.delete('/:id', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
  // [QB1-FIX] Validate bank ID before any DB call
  const bankId = parseParamId(req.params.id);
  if (!bankId) return res.status(400).json({ error: 'معرّف البنك غير صالح' });

  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      'DELETE FROM question_banks WHERE id=$1 AND teacher_id=$2 RETURNING id',
      [bankId, teacherId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'البنك غير موجود' });
    res.json({ message: 'تم حذف البنك' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Get bank questions ──
// [QB2-FIX] Added checkManageExamsPerm — previously any assistant (even without
// can_manage_exams) could retrieve all questions in a bank belonging to their
// teacher. Now the permission gate is enforced consistently with create/update.
router.get('/:id/questions', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
  // [QB1-FIX] Validate bank ID before any DB call
  const bankId = parseParamId(req.params.id);
  if (!bankId) return res.status(400).json({ error: 'معرّف البنك غير صالح' });

  const teacherId = getTeacherId(req);
  try {
    const bank = await pool.query('SELECT id FROM question_banks WHERE id=$1 AND teacher_id=$2', [bankId, teacherId]);
    if (!bank.rows.length) return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query('SELECT * FROM bank_questions WHERE bank_id=$1 ORDER BY id', [bankId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Add question to bank ──
router.post('/:id/questions', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
  // [QB1-FIX] Validate bank ID before any DB call
  const bankId = parseParamId(req.params.id);
  if (!bankId) return res.status(400).json({ error: 'معرّف البنك غير صالح' });

  const teacherId = getTeacherId(req);
  const {
    question_text, question_image_url, option_a, option_b, option_c, option_d,
    correct_answer_letter, points, question_type, difficulty,
    group_id, group_context, group_context_image, sub_questions,
  } = req.body;
  try {
    const bank = await pool.query('SELECT id FROM question_banks WHERE id=$1 AND teacher_id=$2', [bankId, teacherId]);
    if (!bank.rows.length) return res.status(403).json({ error: 'Access denied' });

    const qType = question_type || 'mcq';
    const isImgMulti = qType === 'image_multi';
    let optA = option_a, optB = option_b, correctLetter = correct_answer_letter;

    // [S1] require at least question_text or image
    if (!question_text && !question_image_url)
      return res.status(400).json({ error: 'السؤال يحتاج نصاً أو صورة' });

    let cleanSubQuestions = [];
    if (isImgMulti) {
      if (!Array.isArray(sub_questions) || sub_questions.length === 0)
        return res.status(400).json({ error: 'image_multi يتطلب قائمة الأسئلة الفرعية' });
      if (sub_questions.length > 50)
        return res.status(400).json({ error: 'الحد الأقصى 50 سؤالاً فرعياً' });
      const VALID_LETTERS = new Set(['A','B','C','D']);
      for (const sub of sub_questions) {
        const lbl = String(sub.label ?? '').trim();
        if (!lbl) return res.status(400).json({ error: 'كل بند يجب أن يحتوي على رقم/تسمية' });
        // [S1] cap label length
        if (lbl.length > 200) return res.status(400).json({ error: 'تسمية السؤال الفرعي طويلة جداً' });
        if (!VALID_LETTERS.has(String(sub.correct || '').toUpperCase()))
          return res.status(400).json({ error: 'الإجابة الصحيحة لكل بند يجب أن تكون A أو B أو C أو D' });
      }
      const labels = sub_questions.map(s => String(s.label).trim());
      if (new Set(labels).size !== labels.length)
        return res.status(400).json({ error: 'تسميات الأسئلة الفرعية يجب أن تكون فريدة' });
      // [S2] strip extra fields — store only label + correct
      cleanSubQuestions = sub_questions.map(s => ({
        label: String(s.label).trim(),
        correct: String(s.correct).toUpperCase(),
      }));
      optA = 'A'; optB = 'B'; correctLetter = 'A';
    } else if (qType === 'true_false') {
      optA = 'صح'; optB = 'خطأ'; correctLetter = correct_answer_letter || 'A';
    }

    if (!isImgMulti && (!optA || !optB)) return res.status(400).json({ error: 'الخيار الأول والثاني مطلوبان' });

    if (!correctLetter || !VALID_ANSWER_LETTERS.has(String(correctLetter).toUpperCase())) {
      return res.status(400).json({ error: 'الإجابة الصحيحة يجب أن تكون A أو B أو C أو D أو T أو F' });
    }

    const validDifficulties = ['easy', 'medium', 'hard'];
    const qDifficulty = validDifficulties.includes(difficulty) ? difficulty : 'medium';

    const result = await pool.query(
      'INSERT INTO bank_questions (bank_id, question_text, question_image_url, option_a, option_b, option_c, option_d, correct_answer_letter, points, question_type, difficulty, group_id, group_context, group_context_image, sub_questions) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',
      [bankId, question_text || null, question_image_url || null, optA, optB, isImgMulti ? 'C' : (option_c || null), isImgMulti ? 'D' : (option_d || null), correctLetter.toUpperCase(), points || 1, qType, qDifficulty, group_id || null, group_context || null, group_context_image || null, isImgMulti ? JSON.stringify(cleanSubQuestions) : '[]']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Update bank question ──
router.put('/questions/:qid', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
  // [QB1-FIX] Validate question ID before any DB call
  const qid = parseParamId(req.params.qid);
  if (!qid) return res.status(400).json({ error: 'معرّف السؤال غير صالح' });

  const teacherId = getTeacherId(req);
  const {
    question_text, question_image_url, option_a, option_b, option_c, option_d,
    correct_answer_letter, points, question_type, difficulty,
    group_id, group_context, group_context_image, sub_questions,
  } = req.body;
  try {
    const ownership = await pool.query(
      `SELECT bq.id FROM bank_questions bq
       JOIN question_banks qb ON bq.bank_id = qb.id
       WHERE bq.id=$1 AND qb.teacher_id=$2`,
      [qid, teacherId]
    );
    if (!ownership.rows.length) return res.status(403).json({ error: 'Access denied' });

    const qType = question_type || 'mcq';
    const isImgMulti = qType === 'image_multi';
    let optA = option_a, optB = option_b, correctLetter = correct_answer_letter;

    // [S1] require at least question_text or image
    if (!question_text && !question_image_url)
      return res.status(400).json({ error: 'السؤال يحتاج نصاً أو صورة' });

    let cleanSubQuestions = [];
    if (isImgMulti) {
      if (!Array.isArray(sub_questions) || sub_questions.length === 0)
        return res.status(400).json({ error: 'image_multi يتطلب قائمة الأسئلة الفرعية' });
      if (sub_questions.length > 50)
        return res.status(400).json({ error: 'الحد الأقصى 50 سؤالاً فرعياً' });
      const VALID_LETTERS = new Set(['A','B','C','D']);
      for (const sub of sub_questions) {
        const lbl = String(sub.label ?? '').trim();
        if (!lbl) return res.status(400).json({ error: 'كل بند يجب أن يحتوي على رقم/تسمية' });
        // [S1] cap label length
        if (lbl.length > 200) return res.status(400).json({ error: 'تسمية السؤال الفرعي طويلة جداً' });
        if (!VALID_LETTERS.has(String(sub.correct || '').toUpperCase()))
          return res.status(400).json({ error: 'الإجابة الصحيحة لكل بند يجب أن تكون A أو B أو C أو D' });
      }
      const labels = sub_questions.map(s => String(s.label).trim());
      if (new Set(labels).size !== labels.length)
        return res.status(400).json({ error: 'تسميات الأسئلة الفرعية يجب أن تكون فريدة' });
      // [S2] strip extra fields — store only label + correct
      cleanSubQuestions = sub_questions.map(s => ({
        label: String(s.label).trim(),
        correct: String(s.correct).toUpperCase(),
      }));
      optA = 'A'; optB = 'B'; correctLetter = 'A';
    } else if (qType === 'true_false') {
      optA = 'صح'; optB = 'خطأ';
    }

    // [QB5-FIX] Guard against null/undefined correctLetter before .toUpperCase().
    if (!correctLetter || !VALID_ANSWER_LETTERS.has(String(correctLetter).toUpperCase())) {
      return res.status(400).json({ error: 'الإجابة الصحيحة يجب أن تكون A أو B أو C أو D أو T أو F' });
    }

    const validDifficulties = ['easy', 'medium', 'hard'];
    const qDifficulty = validDifficulties.includes(difficulty) ? difficulty : 'medium';

    const result = await pool.query(
      'UPDATE bank_questions SET question_text=$1, question_image_url=$2, option_a=$3, option_b=$4, option_c=$5, option_d=$6, correct_answer_letter=$7, points=$8, question_type=$9, difficulty=$10, group_id=$11, group_context=$12, group_context_image=$13, sub_questions=$14 WHERE id=$15 RETURNING *',
      [question_text || null, question_image_url || null, optA, optB, isImgMulti ? 'C' : (option_c || null), isImgMulti ? 'D' : (option_d || null), correctLetter.toUpperCase(), points || 1, qType, qDifficulty, group_id || null, group_context || null, group_context_image || null, isImgMulti ? JSON.stringify(cleanSubQuestions) : '[]', qid]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Delete bank question ──
router.delete('/questions/:qid', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
  // [QB1-FIX] Validate question ID before any DB call
  const qid = parseParamId(req.params.qid);
  if (!qid) return res.status(400).json({ error: 'معرّف السؤال غير صالح' });

  const teacherId = getTeacherId(req);
  try {
    const ownership = await pool.query(
      `SELECT bq.id FROM bank_questions bq
       JOIN question_banks qb ON bq.bank_id = qb.id
       WHERE bq.id=$1 AND qb.teacher_id=$2`,
      [qid, teacherId]
    );
    if (!ownership.rows.length) return res.status(403).json({ error: 'Access denied' });
    await pool.query('DELETE FROM bank_questions WHERE id=$1', [qid]);
    res.json({ message: 'تم حذف السؤال' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Upload question image ──
// [QB2-FIX] Added checkManageExamsPerm — was publicly accessible to any
// authenticated teacher/assistant without the exams permission.
router.post('/upload-image', requireRole('teacher', 'assistant'), checkManageExamsPerm, uploadImg.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لم يتم رفع أي ملف' });
  const validImg = await isValidImage(req.file.path);
  if (!validImg) {
    deleteFile(req.file.path);
    return res.status(400).json({ error: 'الملف المرفوع ليس صورة صالحة (PNG / JPEG / GIF / WebP)' });
  }
  res.json({ url: `/uploads/question-images/${req.file.filename}` });
});

module.exports = router;
