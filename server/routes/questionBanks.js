const express = require('express');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
router.use(authenticate);

const getTeacherId = (req) => req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;

const qImgStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/question-images');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `bq_${Date.now()}${path.extname(file.originalname)}`);
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

// ── List banks ──
router.get('/', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      `SELECT qb.*, c.name AS course_name, COUNT(bq.id) AS question_count
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
router.post('/', requireRole('teacher', 'assistant'), async (req, res) => {
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
router.put('/:id', requireRole('teacher', 'assistant'), async (req, res) => {
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
      [name.trim(), course_id || null, req.params.id, teacherId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'البنك غير موجود' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Delete bank ──
router.delete('/:id', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      'DELETE FROM question_banks WHERE id=$1 AND teacher_id=$2 RETURNING id',
      [req.params.id, teacherId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'البنك غير موجود' });
    res.json({ message: 'تم حذف البنك' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Get bank questions ──
router.get('/:id/questions', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const bank = await pool.query('SELECT id FROM question_banks WHERE id=$1 AND teacher_id=$2', [req.params.id, teacherId]);
    if (!bank.rows.length) return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query('SELECT * FROM bank_questions WHERE bank_id=$1 ORDER BY id', [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Add question to bank ──
router.post('/:id/questions', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { question_text, question_image_url, option_a, option_b, option_c, option_d, correct_answer_letter, points, question_type } = req.body;
  try {
    const bank = await pool.query('SELECT id FROM question_banks WHERE id=$1 AND teacher_id=$2', [req.params.id, teacherId]);
    if (!bank.rows.length) return res.status(403).json({ error: 'Access denied' });

    const qType = question_type || 'mcq';
    let optA = option_a, optB = option_b, correctLetter = correct_answer_letter;
    if (qType === 'true_false') { optA = 'صح'; optB = 'خطأ'; correctLetter = correct_answer_letter || 'A'; }

    if (!optA || !optB) return res.status(400).json({ error: 'الخيار الأول والثاني مطلوبان' });
    if (!correctLetter) return res.status(400).json({ error: 'الإجابة الصحيحة مطلوبة' });

    const result = await pool.query(
      'INSERT INTO bank_questions (bank_id, question_text, question_image_url, option_a, option_b, option_c, option_d, correct_answer_letter, points, question_type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [req.params.id, question_text || null, question_image_url || null, optA, optB, option_c || null, option_d || null, correctLetter.toUpperCase(), points || 1, qType]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Update bank question ──
router.put('/questions/:qid', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { question_text, question_image_url, option_a, option_b, option_c, option_d, correct_answer_letter, points, question_type } = req.body;
  try {
    const ownership = await pool.query(
      `SELECT bq.id FROM bank_questions bq
       JOIN question_banks qb ON bq.bank_id = qb.id
       WHERE bq.id=$1 AND qb.teacher_id=$2`,
      [req.params.qid, teacherId]
    );
    if (!ownership.rows.length) return res.status(403).json({ error: 'Access denied' });

    const qType = question_type || 'mcq';
    let optA = option_a, optB = option_b, correctLetter = correct_answer_letter;
    if (qType === 'true_false') { optA = 'صح'; optB = 'خطأ'; }

    const result = await pool.query(
      'UPDATE bank_questions SET question_text=$1, question_image_url=$2, option_a=$3, option_b=$4, option_c=$5, option_d=$6, correct_answer_letter=$7, points=$8, question_type=$9 WHERE id=$10 RETURNING *',
      [question_text || null, question_image_url || null, optA, optB, option_c || null, option_d || null, correctLetter.toUpperCase(), points || 1, qType, req.params.qid]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Delete bank question ──
router.delete('/questions/:qid', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const ownership = await pool.query(
      `SELECT bq.id FROM bank_questions bq
       JOIN question_banks qb ON bq.bank_id = qb.id
       WHERE bq.id=$1 AND qb.teacher_id=$2`,
      [req.params.qid, teacherId]
    );
    if (!ownership.rows.length) return res.status(403).json({ error: 'Access denied' });
    await pool.query('DELETE FROM bank_questions WHERE id=$1', [req.params.qid]);
    res.json({ message: 'تم حذف السؤال' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Upload question image ──
router.post('/upload-image', requireRole('teacher', 'assistant'), uploadImg.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لم يتم رفع أي ملف' });
  res.json({ url: `/uploads/question-images/${req.file.filename}` });
});

module.exports = router;
