const { sendEvent } = require('../sse');
const { isValidImage, deleteFile } = require('../lib/validateFileMagic');
const rateLimit = require('express-rate-limit');
const { sendFCMToStudents } = require('../lib/fcm');
const express = require('express');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { invalidateCache } = require('../lib/analyticsCache');
const { validateExam } = require('../middleware/validate');
const { getPermissions } = require('../lib/permissionsCache');
const { logActivity, getActor, getIp } = require('../lib/activityLog');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const router = express.Router();
router.use(authenticate);

const PG_INT_MAX = 2147483647;
const parseParamId = (raw) => {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0 || n > PG_INT_MAX || String(n) !== String(raw).trim()) return null;
  return n;
};

// Pre-create question-images directory once at startup (not on every request)
const QUESTION_IMG_DIR = path.join(__dirname, '../../uploads/question-images');
fs.mkdirSync(QUESTION_IMG_DIR, { recursive: true });

const questionImageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, QUESTION_IMG_DIR),
  filename: (req, file, cb) => {
    // [T4-FIX] Use crypto.randomBytes to prevent filename collision on
    // concurrent uploads — same timestamp can produce the same name,
    // causing the second upload to silently overwrite the first.
    const ext = path.extname(file.originalname).toLowerCase();
    const rand = crypto.randomBytes(8).toString('hex');
    cb(null, `q_${Date.now()}_${rand}${ext}`);
  },
});
const uploadQuestionImage = multer({
  storage: questionImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('يُسمح بالصور فقط'));
  },
});

const getTeacherId = (req) => req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;

// ── Middleware: assistants must have can_manage_exams ──
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

const verifyExamOwnership = async (examId, teacherId) => {
  const r = await pool.query('SELECT id FROM exams WHERE id=$1 AND teacher_id=$2', [examId, teacherId]);
  return r.rows.length > 0;
};

const verifyQuestionOwnership = async (questionId, teacherId) => {
  const r = await pool.query(
    'SELECT q.id FROM questions q JOIN exams e ON q.exam_id=e.id WHERE q.id=$1 AND e.teacher_id=$2',
    [questionId, teacherId]
  );
  return r.rows.length > 0;
};

// Returns { id, is_published } for ownership check + published guard, or null if not found/not owned
const getExamForOwner = async (examId, teacherId) => {
  const r = await pool.query(
    'SELECT id, is_published FROM exams WHERE id=$1 AND teacher_id=$2',
    [examId, teacherId]
  );
  return r.rows[0] || null;
};

// Returns { id, is_published } of the parent exam for a question, or null if not found/not owned
const getExamForQuestion = async (questionId, teacherId) => {
  const r = await pool.query(
    'SELECT e.id, e.is_published FROM questions q JOIN exams e ON q.exam_id=e.id WHERE q.id=$1 AND e.teacher_id=$2',
    [questionId, teacherId]
  );
  return r.rows[0] || null;
};

// ── List exams ──
router.get('/', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      `SELECT e.*, c.name as course_name,
              CASE
                WHEN e.question_source = 'bank' AND (COALESCE(e.bank_easy_count,0) + COALESCE(e.bank_medium_count,0) + COALESCE(e.bank_hard_count,0)) > 0
                  THEN (COALESCE(e.bank_easy_count,0) + COALESCE(e.bank_medium_count,0) + COALESCE(e.bank_hard_count,0))
                WHEN e.question_source = 'bank' THEN e.bank_question_count
                ELSE COUNT(DISTINCT q.id)::int
              END as question_count,
              COUNT(DISTINCT er.id)::int as attempt_count
       FROM exams e
       LEFT JOIN courses c ON e.course_id = c.id
       LEFT JOIN questions q ON e.id = q.exam_id AND e.question_source != 'bank'
       LEFT JOIN exam_results er ON e.id = er.exam_id
       WHERE e.teacher_id = $1
       GROUP BY e.id, c.name ORDER BY e.created_at DESC`,
      [teacherId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});


// ── Create exam ──
router.post('/', requireRole('teacher', 'assistant'), checkManageExamsPerm, validateExam, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { title, duration_minutes, total_score, course_id, pass_score, badge_name, badge_color, start_date, end_date, shuffle_questions, shuffle_options, question_source, bank_id, bank_question_count, points_on_attempt, points_on_pass, bank_easy_count, bank_medium_count, bank_hard_count } = req.body;
  try {
    if (course_id) {
      const courseCheck = await pool.query('SELECT id FROM courses WHERE id=$1 AND teacher_id=$2', [course_id, teacherId]);
      if (!courseCheck.rows.length) return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    if (question_source === 'bank' && bank_id) {
      const bankCheck = await pool.query('SELECT id FROM question_banks WHERE id=$1 AND teacher_id=$2', [bank_id, teacherId]);
      if (!bankCheck.rows.length) return res.status(403).json({ error: 'Access denied: bank not yours' });
    }
    if (start_date && end_date) {
      const startDt = new Date(start_date);
      const endDt = new Date(end_date);
      if (isNaN(startDt.getTime()) || isNaN(endDt.getTime())) {
        return res.status(400).json({ error: 'تنسيق التاريخ غير صالح' });
      }
      const diffMin = (endDt - startDt) / 60000;
      if (diffMin < parseInt(duration_minutes || 60))
        return res.status(400).json({ error: `الفترة بين البداية والنهاية (${Math.round(diffMin)} دقيقة) أقل من مدة الاختبار (${duration_minutes || 60} دقيقة)` });
    }
    const easyCount   = parseInt(bank_easy_count)   || 0;
    const mediumCount = parseInt(bank_medium_count) || 0;
    const hardCount   = parseInt(bank_hard_count)   || 0;
    const result = await pool.query(
      'INSERT INTO exams (title,duration_minutes,total_score,course_id,teacher_id,pass_score,badge_name,badge_color,start_date,end_date,shuffle_questions,shuffle_options,question_source,bank_id,bank_question_count,points_on_attempt,points_on_pass,bank_easy_count,bank_medium_count,bank_hard_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *',
      [title, duration_minutes || 60, total_score || 100, course_id || null, teacherId, pass_score ?? 50, badge_name, badge_color || '#FF8C00', start_date || null, end_date || null, !!shuffle_questions, !!shuffle_options, question_source || 'manual', (question_source === 'bank' && bank_id) ? bank_id : null, bank_question_count || 10, points_on_attempt || 0, points_on_pass || 0, easyCount, mediumCount, hardCount]
    );
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'create_exam',
      entity: { type: 'exam', id: result.rows[0].id, name: title },
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Update exam ──
router.put('/:id', requireRole('teacher', 'assistant'), checkManageExamsPerm, validateExam, async (req, res) => {
  const examId = parseParamId(req.params.id);
  if (!examId) return res.status(400).json({ error: 'معرّف الاختبار غير صالح' });
  const teacherId = getTeacherId(req);
  const { title, duration_minutes, total_score, course_id, pass_score, badge_name, badge_color, start_date, end_date, shuffle_questions, shuffle_options, question_source, bank_id, bank_question_count, points_on_attempt, points_on_pass, bank_easy_count, bank_medium_count, bank_hard_count } = req.body;
  try {
    const existingExam = await pool.query(
      'SELECT id, end_date, is_published FROM exams WHERE id=$1 AND teacher_id=$2',
      [examId, teacherId]
    );
    if (!existingExam.rows.length) return res.status(404).json({ error: 'Exam not found' });
    const currentExam = existingExam.rows[0];
    // Prevent editing published exams — must unpublish first
    if (currentExam.is_published) {
      return res.status(409).json({ error: 'لا يمكن تعديل اختبار منشور — أوقف النشر أولاً' });
    }
    if (end_date && currentExam.end_date) {
      const newEnd = new Date(end_date);
      const oldEnd = new Date(currentExam.end_date);
      if (newEnd > oldEnd) {
        const resultCount = await pool.query(
          'SELECT COUNT(id)::int AS cnt FROM exam_results WHERE exam_id=$1',
          [examId]
        );
        if (parseInt(resultCount.rows[0].cnt) > 0) {
          return res.status(409).json({
            error: 'لا يمكن تمديد تاريخ الاختبار بعد أن بدأ الطلاب التأدية — هذا يمنح ميزة غير عادلة',
            code: 'CANNOT_EXTEND_END_DATE',
          });
        }
      }
    }
    if (question_source === 'bank' && bank_id) {
      const bankCheck = await pool.query('SELECT id FROM question_banks WHERE id=$1 AND teacher_id=$2', [bank_id, teacherId]);
      if (!bankCheck.rows.length) return res.status(403).json({ error: 'Access denied: bank not yours' });
    }
    if (start_date && end_date) {
      const startDt = new Date(start_date);
      const endDt = new Date(end_date);
      if (isNaN(startDt.getTime()) || isNaN(endDt.getTime())) {
        return res.status(400).json({ error: 'تنسيق التاريخ غير صالح' });
      }
      const diffMin = (endDt - startDt) / 60000;
      if (diffMin < parseInt(duration_minutes || 60))
        return res.status(400).json({ error: `الفترة بين البداية والنهاية (${Math.round(diffMin)} دقيقة) أقل من مدة الاختبار (${duration_minutes || 60} دقيقة)` });
    }
    const easyCount   = parseInt(bank_easy_count)   || 0;
    const mediumCount = parseInt(bank_medium_count) || 0;
    const hardCount   = parseInt(bank_hard_count)   || 0;
    const result = await pool.query(
      'UPDATE exams SET title=$1,duration_minutes=$2,total_score=$3,course_id=$4,pass_score=$5,badge_name=$6,badge_color=$7,start_date=$8,end_date=$9,shuffle_questions=$10,shuffle_options=$11,question_source=$12,bank_id=$13,bank_question_count=$14,points_on_attempt=$15,points_on_pass=$16,bank_easy_count=$17,bank_medium_count=$18,bank_hard_count=$19 WHERE id=$20 AND teacher_id=$21 RETURNING *',
      [title, duration_minutes, total_score, course_id || null, pass_score, badge_name, badge_color, start_date || null, end_date || null, !!shuffle_questions, !!shuffle_options, question_source || 'manual', (question_source === 'bank' && bank_id) ? bank_id : null, bank_question_count || 10, points_on_attempt || 0, points_on_pass || 0, easyCount, mediumCount, hardCount, examId, teacherId]
    );
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'edit_exam',
      entity: { type: 'exam', id: result.rows[0].id, name: result.rows[0].title },
    });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Toggle publish exam ──
router.put('/:id/publish', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
  const examId = parseParamId(req.params.id);
  if (!examId) return res.status(400).json({ error: 'معرّف الاختبار غير صالح' });
  const teacherId = getTeacherId(req);
  try {
    // Get current exam state before toggling
    const current = await pool.query(
      'SELECT * FROM exams WHERE id=$1 AND teacher_id=$2',
      [examId, teacherId]
    );
    if (!current.rows.length) return res.status(404).json({ error: 'Exam not found' });
    const currentExam = current.rows[0];
    const isPublishing = !currentExam.is_published; // about to publish

    // Validate dates before publishing
    if (isPublishing) {
      const now = new Date();
      if (currentExam.end_date && new Date(currentExam.end_date) < now) {
        return res.status(400).json({
          error: 'انتهى تاريخ الاختبار — يرجى تحديث تاريخ النهاية أولاً قبل النشر',
          field: 'end_date'
        });
      }
      // Validate course is published (if exam belongs to a course)
      if (currentExam.course_id) {
        const courseCheck = await pool.query('SELECT is_published FROM courses WHERE id=$1', [currentExam.course_id]);
        if (courseCheck.rows.length && !courseCheck.rows[0].is_published) {
          return res.status(400).json({ error: 'لا يمكن نشر الاختبار لأن الكورس المرتبط به غير منشور — انشر الكورس أولاً' });
        }
      }
      // Validate exam has questions (only for manual source)
      if (currentExam.question_source !== 'bank') {
        const qCount = await pool.query('SELECT COUNT(id) as cnt FROM questions WHERE exam_id=$1', [examId]);
        if (parseInt(qCount.rows[0].cnt) === 0) {
          return res.status(400).json({ error: 'لا يمكن نشر اختبار بدون أسئلة — أضف أسئلة أولاً' });
        }
      }
      // If republishing (exam was taken before), clear previous results to allow re-attempt
      const existingResults = await pool.query(
        'SELECT COUNT(id) as cnt FROM exam_results WHERE exam_id=$1',
        [examId]
      );
      const resultCount = parseInt(existingResults.rows[0].cnt);
      if (resultCount > 0) {
        if (!req.body.force_reset) {
          return res.status(409).json({
            error: `يوجد ${resultCount} طالب أدوا هذا الاختبار بالفعل — إعادة النشر ستمسح نتائجهم نهائياً`,
            code: 'RESULTS_EXIST',
            count: resultCount,
          });
        }
        const resetClient = await pool.connect();
        try {
          await resetClient.query('BEGIN');
          // Deduct points earned from this exam before deleting results
          const earnedRows = await resetClient.query(
            `SELECT student_id, COALESCE(points_earned, 0) AS pts
             FROM exam_results
             WHERE exam_id = $1 AND COALESCE(points_earned, 0) > 0 AND is_latest = true`,
            [examId]
          );
          for (const row of earnedRows.rows) {
            await resetClient.query(
              'UPDATE students SET points = GREATEST(0, points - $1) WHERE id = $2',
              [row.pts, row.student_id]
            );
          }
          await resetClient.query('DELETE FROM exam_results WHERE exam_id=$1', [examId]);
          await resetClient.query(
            "UPDATE exam_retry_requests SET status='used', handled_at=NOW() WHERE exam_id=$1 AND status='pending'",
            [examId]
          );
          await resetClient.query('COMMIT');
        } catch (txErr) {
          await resetClient.query('ROLLBACK');
          throw txErr;
        } finally {
          resetClient.release();
        }
        logActivity({
          teacherId, actor: getActor(req), ip: getIp(req),
          action: 'force_reset_exam_results',
          entity: { type: 'exam', id: examId, name: currentExam.title },
          details: { deleted_results: resultCount },
        });
      }
    }

    const result = await pool.query(
      'UPDATE exams SET is_published = NOT is_published WHERE id=$1 AND teacher_id=$2 RETURNING id, is_published, title, course_id, start_date',
      [examId, teacherId]
    );
    const exam = result.rows[0];

    if (exam.is_published) {
      let studentIds = [];
      if (exam.course_id) {
        const sRes = await pool.query(
          "SELECT student_id AS id FROM student_course_enrollment WHERE course_id=$1 AND status='active'",
          [exam.course_id]
        );
        studentIds = sRes.rows.map(r => r.id);
      } else {
        const sRes = await pool.query(
          'SELECT id FROM students WHERE teacher_id=$1 AND deleted_at IS NULL AND is_suspended = false',
          [teacherId]
        );
        studentIds = sRes.rows.map(r => r.id);
      }

      const now = new Date();
      const startDate = exam.start_date ? new Date(exam.start_date) : null;
      const hasStartDate = startDate && startDate > now;

      const notifTitle = 'اختبار جديد';
      const notifMsg = hasStartDate
        ? `📝 اختبار جديد: "${exam.title}" — يبدأ في ${startDate.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}`
        : `📝 اختبار جديد متاح الآن: "${exam.title}"`;

      // Batch INSERT all notifications in one query (avoid N+1)
      if (studentIds.length > 0) {
        await pool.query(
          `INSERT INTO notification_log (teacher_id, student_id, recipient_type, message, type, is_read, source, title)
           SELECT $1, unnest($2::int[]), 'student', $3, 'new_exam', false, 'platform', $4`,
          [teacherId, studentIds, notifMsg, notifTitle]
        ).catch(e => console.error('[exam publish notif batch]', e.message));
      }
      if (!hasStartDate) {
        for (const sid of studentIds)
          sendEvent(`student_${sid}`, 'new_exam', { title: exam.title, examId: exam.id });
      }
      sendFCMToStudents(pool, studentIds, notifTitle, notifMsg, { examId: String(exam.id) }).catch(() => {});

      await pool.query(
        'UPDATE exams SET start_notified = $1 WHERE id = $2',
        [!hasStartDate, exam.id]
      );
    } else {
      // Unpublishing — notify relevant students so their UI updates immediately
      let unpubStudentIds = [];
      if (exam.course_id) {
        const sRes = await pool.query(
          "SELECT student_id AS id FROM student_course_enrollment WHERE course_id=$1 AND status='active'",
          [exam.course_id]
        );
        unpubStudentIds = sRes.rows.map(r => r.id);
      } else {
        const sRes = await pool.query(
          'SELECT id FROM students WHERE teacher_id=$1 AND deleted_at IS NULL',
          [teacherId]
        );
        unpubStudentIds = sRes.rows.map(r => r.id);
      }
      for (const sid of unpubStudentIds) {
        sendEvent(`student_${sid}`, 'exam_unpublished', {
          examId: exam.id,
          title: exam.title,
        });
      }
    }

    // Notify the teacher (and any logged-in assistants) in real-time
    sendEvent(`teacher_${teacherId}`, 'exam_publish_changed', {
      id: exam.id,
      is_published: exam.is_published,
      title: exam.title,
    });

    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'publish_exam',
      entity: { type: 'exam', id: exam.id, name: exam.title },
      details: { is_published: exam.is_published },
    });
    res.json({ id: exam.id, is_published: exam.is_published });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Upload question image ──
router.post('/upload-question-image', requireRole('teacher', 'assistant'), checkManageExamsPerm,
  (req, res, next) => {
    uploadQuestionImage.single('image')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'حجم الصورة أكبر من الحد المسموح (5 ميجابايت)' });
        }
        return res.status(400).json({ error: err.message || 'خطأ في رفع الملف' });
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'لم يتم رفع أي ملف' });
    // [M-11] FIX: validate image magic bytes — MIME/extension are spoofable
    const validImg = await isValidImage(req.file.path);
    if (!validImg) {
      deleteFile(req.file.path);
      return res.status(400).json({ error: 'الملف المرفوع ليس صورة صالحة (PNG / JPEG / GIF / WebP)' });
    }
    const url = `/uploads/question-images/${req.file.filename}`;
    res.json({ url });
  }
);

// ── Delete exam ──
router.delete('/:id', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
  const examId = parseParamId(req.params.id);
  if (!examId) return res.status(400).json({ error: 'معرّف الاختبار غير صالح' });
  const teacherId = getTeacherId(req);
  try {
    const examInfo = await pool.query('SELECT title FROM exams WHERE id=$1 AND teacher_id=$2', [examId, teacherId]);
    const result = await pool.query('DELETE FROM exams WHERE id=$1 AND teacher_id=$2 RETURNING id', [examId, teacherId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Exam not found' });
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'delete_exam',
      entity: { type: 'exam', id: examId, name: examInfo.rows[0]?.title },
    });
    res.json({ message: 'Exam deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Get questions ──
// M-2 fix: assistants without can_manage_exams must NOT see correct_answer_letter
router.get('/:id/questions', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
  const examId = parseParamId(req.params.id);
  if (!examId) return res.status(400).json({ error: 'معرّف الاختبار غير صالح' });
  const teacherId = getTeacherId(req);
  try {
    if (!(await verifyExamOwnership(examId, teacherId))) {
      return res.status(403).json({ error: 'Access denied: exam not yours' });
    }
    const result = await pool.query('SELECT * FROM questions WHERE exam_id=$1 ORDER BY id', [examId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Add question ──
router.post('/:id/questions', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
  const examId = parseParamId(req.params.id);
  if (!examId) return res.status(400).json({ error: 'معرّف الاختبار غير صالح' });
  const teacherId = getTeacherId(req);
  const { question_text, question_image_url, option_a, option_b, option_c, option_d, correct_answer_letter, points, question_type, group_id, group_context, group_context_image } = req.body;
  try {
    const examRow = await getExamForOwner(examId, teacherId);
    if (!examRow) return res.status(403).json({ error: 'Access denied: exam not yours' });
    if (examRow.is_published) {
      return res.status(409).json({ error: 'لا يمكن إضافة أسئلة لاختبار منشور — أوقف النشر أولاً' });
    }
    const qType = (question_type === 'true_false') ? 'true_false' : 'mcq';
    let optA = option_a, optB = option_b, correctLetter;

    if (qType === 'true_false') {
      optA = 'صح'; optB = 'خطأ';
      const raw = String(correct_answer_letter || 'A').toUpperCase();
      correctLetter = ['A', 'B'].includes(raw) ? raw : 'A';
    } else {
      const raw = String(correct_answer_letter || 'A').toUpperCase();
      if (!['A', 'B', 'C', 'D'].includes(raw))
        return res.status(400).json({ error: 'الإجابة الصحيحة يجب أن تكون A أو B أو C أو D' });
      if (raw === 'C' && !(option_c || '').toString().trim())
        return res.status(400).json({ error: 'الإجابة الصحيحة تشير للخيار ج، لكن الخيار ج فارغ' });
      if (raw === 'D' && !(option_d || '').toString().trim())
        return res.status(400).json({ error: 'الإجابة الصحيحة تشير للخيار د، لكن الخيار د فارغ' });
      correctLetter = raw;
    }

    const result = await pool.query(
      'INSERT INTO questions (question_text,question_image_url,option_a,option_b,option_c,option_d,correct_answer_letter,points,exam_id,question_type,group_id,group_context,group_context_image) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
      [question_text || null, question_image_url || null, optA, optB, option_c || null, option_d || null, correctLetter, points || 1, examId, qType, group_id || null, group_context || null, group_context_image || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Update question ──
router.put('/questions/:qid', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
  const qid = parseParamId(req.params.qid);
  if (!qid) return res.status(400).json({ error: 'معرّف السؤال غير صالح' });
  const teacherId = getTeacherId(req);
  const { question_text, question_image_url, option_a, option_b, option_c, option_d, correct_answer_letter, points, question_type, group_id, group_context, group_context_image } = req.body;
  try {
    const examRow = await getExamForQuestion(qid, teacherId);
    if (!examRow) return res.status(403).json({ error: 'Access denied: question not yours' });
    if (examRow.is_published) {
      return res.status(409).json({ error: 'لا يمكن تعديل أسئلة اختبار منشور — أوقف النشر أولاً' });
    }
    const qType = (question_type === 'true_false') ? 'true_false' : 'mcq';
    let optA = option_a, optB = option_b, correctLetter;

    if (qType === 'true_false') {
      optA = 'صح'; optB = 'خطأ';
      const raw = String(correct_answer_letter || 'A').toUpperCase();
      correctLetter = ['A', 'B'].includes(raw) ? raw : 'A';
    } else {
      const raw = String(correct_answer_letter || 'A').toUpperCase();
      if (!['A', 'B', 'C', 'D'].includes(raw))
        return res.status(400).json({ error: 'الإجابة الصحيحة يجب أن تكون A أو B أو C أو D' });
      if (raw === 'C' && !(option_c || '').toString().trim())
        return res.status(400).json({ error: 'الإجابة الصحيحة تشير للخيار ج، لكن الخيار ج فارغ' });
      if (raw === 'D' && !(option_d || '').toString().trim())
        return res.status(400).json({ error: 'الإجابة الصحيحة تشير للخيار د، لكن الخيار د فارغ' });
      correctLetter = raw;
    }

    const result = await pool.query(
      'UPDATE questions SET question_text=$1,question_image_url=$2,option_a=$3,option_b=$4,option_c=$5,option_d=$6,correct_answer_letter=$7,points=$8,question_type=$9,group_id=$10,group_context=$11,group_context_image=$12 WHERE id=$13 RETURNING *',
      [question_text || null, question_image_url || null, optA, optB, option_c || null, option_d || null, correctLetter, points || 1, qType, group_id || null, group_context || null, group_context_image || null, qid]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'السؤال غير موجود' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Delete question ──
router.delete('/questions/:qid', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
  const qid = parseParamId(req.params.qid);
  if (!qid) return res.status(400).json({ error: 'معرّف السؤال غير صالح' });
  const teacherId = getTeacherId(req);
  try {
    const examRow = await getExamForQuestion(qid, teacherId);
    if (!examRow) return res.status(403).json({ error: 'Access denied: question not yours' });
    if (examRow.is_published) {
      return res.status(409).json({ error: 'لا يمكن حذف أسئلة من اختبار منشور — أوقف النشر أولاً' });
    }
    await pool.query('DELETE FROM questions WHERE id=$1', [qid]);
    res.json({ message: 'Question deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Student: get my retry requests ──
router.get('/student/retry-requests', requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT rr.*, e.title as exam_title
       FROM exam_retry_requests rr
       JOIN exams e ON rr.exam_id = e.id
       WHERE rr.student_id = $1
       ORDER BY rr.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Student: submit retry request ──
const MAX_RETRIES_PER_EXAM = 3;
router.post('/:id/retry-request', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  const examId = parseParamId(req.params.id);
  if (!examId) return res.status(400).json({ error: 'معرّف الاختبار غير صالح' });
  const { message } = req.body;
  try {
    const examCheck = await pool.query(
      'SELECT id, course_id, end_date FROM exams WHERE id=$1 AND teacher_id=(SELECT teacher_id FROM students WHERE id=$2)',
      [examId, studentId]
    );
    if (!examCheck.rows.length) return res.status(403).json({ error: 'Access denied: exam not from your teacher' });
    // Block retry requests for exams whose window has already closed
    const examEndDate = examCheck.rows[0].end_date;
    if (examEndDate && new Date(examEndDate) < new Date()) {
      return res.status(400).json({ error: 'لا يمكن طلب إعادة اختبار انتهت مدته' });
    }

    // For course-linked exams, verify the student is actively enrolled
    const examCourseId = examCheck.rows[0].course_id;
    if (examCourseId) {
      const enrollCheck = await pool.query(
        "SELECT id FROM student_course_enrollment WHERE student_id=$1 AND course_id=$2 AND status='active'",
        [studentId, examCourseId]
      );
      if (!enrollCheck.rows.length) {
        return res.status(403).json({ error: 'Access denied: not enrolled in the course for this exam' });
      }
    }

    const taken = await pool.query(
      'SELECT id, score FROM exam_results WHERE student_id=$1 AND exam_id=$2 AND is_latest=true',
      [studentId, examId]
    );
    if (!taken.rows.length) return res.status(400).json({ error: 'لم تؤدِ هذا الاختبار بعد' });

    // Enforce max retry limit per exam
    const usedRetries = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM exam_retry_requests WHERE student_id=$1 AND exam_id=$2 AND status IN ('used','approved')",
      [studentId, examId]
    );
    if (parseInt(usedRetries.rows[0].cnt) >= MAX_RETRIES_PER_EXAM) {
      return res.status(429).json({ error: `لقد استنفذت الحد الأقصى من طلبات الإعادة (${MAX_RETRIES_PER_EXAM}) لهذا الاختبار` });
    }

    // Block spam: 24-hour cooldown after a rejection
    const recentRejection = await pool.query(
      "SELECT id FROM exam_retry_requests WHERE student_id=$1 AND exam_id=$2 AND status='rejected' AND created_at > NOW() - INTERVAL '24 hours' LIMIT 1",
      [studentId, examId]
    );
    if (recentRejection.rows.length) {
      return res.status(429).json({ error: 'يرجى الانتظار 24 ساعة بعد الرفض قبل إرسال طلب إعادة جديد' });
    }
    const pending = await pool.query(
      "SELECT id, status FROM exam_retry_requests WHERE student_id=$1 AND exam_id=$2 AND status IN ('pending','approved') ORDER BY created_at DESC LIMIT 1",
      [studentId, examId]
    );
    if (pending.rows.length) {
      const st = pending.rows[0].status;
      const msg = st === 'approved' ? 'تمت الموافقة على طلبك — يمكنك الآن إعادة الاختبار' : 'يوجد طلب معلق بالفعل، انتظر رد المعلم';
      return res.status(409).json({ error: msg });
    }
    const result = await pool.query(
      'INSERT INTO exam_retry_requests (student_id, exam_id, message) VALUES ($1,$2,$3) RETURNING *',
      [studentId, examId, message || null]
    );
    try {
      const examInfo = await pool.query(
        'SELECT teacher_id, title FROM exams WHERE id=$1', [examId]
      );
      const studentInfo = await pool.query('SELECT name FROM students WHERE id=$1', [studentId]);
      if (examInfo.rows.length) {
        const { teacher_id } = examInfo.rows[0];
        const studentName = studentInfo.rows[0]?.name || 'طالب';
        sendEvent(`teacher_${teacher_id}`, 'retry_request', {
          student_name: studentName,
          exam_title: examInfo.rows[0].title,
          examId,
        });
      }
    } catch (_) {}
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Teacher: list pending retry requests ──
// M-3 fix: assistants must have can_manage_exams to view retry requests
router.get('/retry-requests', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      `SELECT rr.*, s.name as student_name, e.title as exam_title,
              (SELECT er.id FROM exam_results er WHERE er.exam_id=rr.exam_id AND er.student_id=rr.student_id ORDER BY er.created_at DESC LIMIT 1) as result_id
       FROM exam_retry_requests rr
       JOIN students s ON rr.student_id = s.id
       JOIN exams e ON rr.exam_id = e.id
       WHERE e.teacher_id = $1
       ORDER BY rr.created_at DESC`,
      [teacherId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Teacher: approve retry request ──
router.put('/retry-requests/:reqId/approve', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
  const reqId = parseParamId(req.params.reqId);
  if (!reqId) return res.status(400).json({ error: 'معرّف الطلب غير صالح' });
  const teacherId = getTeacherId(req);
  const { teacher_note } = req.body;
  try {
    const rr = await pool.query(
      `SELECT rr.* FROM exam_retry_requests rr
       JOIN exams e ON rr.exam_id = e.id
       WHERE rr.id=$1 AND e.teacher_id=$2`,
      [reqId, teacherId]
    );
    if (!rr.rows.length) return res.status(404).json({ error: 'الطلب غير موجود' });
    await pool.query(
      "UPDATE exam_retry_requests SET status='approved', teacher_note=$1, handled_at=NOW() WHERE id=$2",
      [teacher_note || null, reqId]
    );
    const row = rr.rows[0];
    // Always delete the old exam session so the student can start a fresh timed attempt
    // This MUST run regardless of notification success — do NOT wrap in try-catch
    await pool.query(
      'DELETE FROM exam_sessions WHERE student_id=$1 AND exam_id=$2',
      [row.student_id, row.exam_id]
    );
    // Notifications are best-effort — swallow errors so they don't block the response
    try {
      await pool.query(
        `INSERT INTO notification_log (teacher_id, student_id, recipient_type, message, type, is_read, source, title)
         VALUES ($1, $2, 'student', 'تمت الموافقة على طلب إعادة الاختبار — يمكنك الآن إعادة تأدية الاختبار', 'retry_approved', false, 'platform', 'قبول إعادة اختبار')`,
        [teacherId, row.student_id]
      );
      sendEvent(`student_${row.student_id}`, 'retry_approved', { examId: row.exam_id });
      sendFCMToStudents(pool, [row.student_id], 'قبول إعادة اختبار', 'تمت الموافقة على طلب إعادة الاختبار — يمكنك الآن إعادة تأدية الاختبار').catch(() => {});
    } catch (_) {}
    const examTitle = (await pool.query('SELECT title FROM exams WHERE id=$1', [row.exam_id]).catch(() => ({ rows: [] }))).rows[0]?.title;
    const studentName = (await pool.query('SELECT name FROM students WHERE id=$1', [row.student_id]).catch(() => ({ rows: [] }))).rows[0]?.name;
    logActivity({
      teacherId, actor: getActor(req), ip: getIp(req),
      action: 'approve_retry',
      entity: { type: 'exam', id: row.exam_id, name: examTitle },
      details: { student_name: studentName },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Teacher: reject retry request ──
router.put('/retry-requests/:reqId/reject', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
  const reqId = parseParamId(req.params.reqId);
  if (!reqId) return res.status(400).json({ error: 'معرّف الطلب غير صالح' });
  const teacherId = getTeacherId(req);
  const { teacher_note } = req.body;
  try {
    const rr = await pool.query(
      `SELECT rr.* FROM exam_retry_requests rr
       JOIN exams e ON rr.exam_id = e.id
       WHERE rr.id=$1 AND e.teacher_id=$2`,
      [reqId, teacherId]
    );
    if (!rr.rows.length) return res.status(404).json({ error: 'الطلب غير موجود' });
    await pool.query(
      "UPDATE exam_retry_requests SET status='rejected', teacher_note=$1, handled_at=NOW() WHERE id=$2",
      [teacher_note || null, reqId]
    );
    try {
      const row = rr.rows[0];
      await pool.query(
        `INSERT INTO notification_log (teacher_id, student_id, recipient_type, message, type, is_read, source, title)
         VALUES ($1, $2, 'student', 'تم رفض طلب إعادة الاختبار', 'retry_rejected', false, 'platform', 'رفض إعادة اختبار')`,
        [teacherId, row.student_id]
      );
      sendEvent(`student_${row.student_id}`, 'retry_rejected', { examId: row.exam_id });
      sendFCMToStudents(pool, [row.student_id], 'رفض إعادة اختبار', 'تم رفض طلب إعادة الاختبار').catch(() => {});
    } catch (_) {}
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Student: list available exams (with scheduling check) ──
router.get('/student/available', requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.title, e.duration_minutes, e.total_score, e.pass_score,
              e.badge_name, e.start_date, e.end_date, c.name as course_name,
              er.id as already_taken, er.score
       FROM exams e
       LEFT JOIN courses c ON e.course_id = c.id
       LEFT JOIN student_course_enrollment sce ON e.course_id = sce.course_id AND sce.student_id = $1
       LEFT JOIN exam_results er ON e.id = er.exam_id AND er.student_id = $1 AND er.is_latest = true
         AND NOT EXISTS (
           SELECT 1 FROM exam_retry_requests rr
           WHERE rr.student_id = $1 AND rr.exam_id = e.id AND rr.status = 'approved'
         )
       WHERE e.teacher_id = (SELECT teacher_id FROM students WHERE id = $1)
         AND (e.course_id IS NULL OR sce.status = 'active')
         AND e.is_published = true`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Seeded shuffle helper (Fisher-Yates with LCG RNG) ──
function seededShuffle(arr, seed) {
  const result = [...arr];
  let s = seed >>> 0;
  const rand = () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 0x100000000;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ── Student: take exam ──
router.get('/:id/take', requireRole('student'), async (req, res) => {
  const examId = parseParamId(req.params.id);
  if (!examId) return res.status(400).json({ error: 'معرّف الاختبار غير صالح' });
  const studentId = req.user.id;
  try {
    // Block students who already submitted without an approved retry
    const [existingRes, retryRes] = await Promise.all([
      pool.query(
        'SELECT id FROM exam_results WHERE student_id=$1 AND exam_id=$2 AND is_latest=true',
        [studentId, examId]
      ),
      pool.query(
        "SELECT id FROM exam_retry_requests WHERE student_id=$1 AND exam_id=$2 AND status='approved'",
        [studentId, examId]
      ),
    ]);
    if (existingRes.rows.length > 0 && retryRes.rows.length === 0) {
      return res.status(403).json({ error: 'لقد أديت هذا الاختبار بالفعل — يُرجى طلب الإعادة من المعلم' });
    }

    const now = new Date();
    const eligibilityCheck = await pool.query(
      `SELECT e.id, e.title, e.duration_minutes, e.total_score, e.pass_score,
              e.start_date, e.end_date, e.shuffle_questions, e.shuffle_options,
              e.question_source, e.bank_id, e.bank_question_count,
              e.bank_easy_count, e.bank_medium_count, e.bank_hard_count
       FROM exams e
       LEFT JOIN student_course_enrollment sce ON e.course_id = sce.course_id AND sce.student_id = $1
       WHERE e.id = $2
         AND e.is_published = true
         AND e.teacher_id = (SELECT teacher_id FROM students WHERE id = $1)
         AND (e.course_id IS NULL OR sce.status = 'active')`,
      [studentId, examId]
    );
    if (!eligibilityCheck.rows.length) {
      return res.status(403).json({ error: 'Access denied: exam not available to you' });
    }
    const exam = eligibilityCheck.rows[0];
    if (exam.start_date && new Date(exam.start_date) > now) {
      return res.status(403).json({ error: 'الاختبار لم يبدأ بعد', start_date: exam.start_date });
    }
    if (exam.end_date && new Date(exam.end_date) < now) {
      return res.status(403).json({ error: 'انتهى وقت الاختبار', end_date: exam.end_date });
    }

    let questions;
    if (exam.question_source === 'bank' && exam.bank_id) {
      const bankQRes = await pool.query(
        'SELECT id,question_text,question_image_url,option_a,option_b,option_c,option_d,correct_answer_letter,points,question_type,difficulty,group_id,group_context,group_context_image FROM bank_questions WHERE bank_id=$1',
        [exam.bank_id]
      );
      if (bankQRes.rows.length === 0) {
        return res.status(400).json({ error: 'بنك الأسئلة فارغ' });
      }
      const seed = (studentId * 999983 + examId * 999979) >>> 0;
      const easyCount   = parseInt(exam.bank_easy_count)   || 0;
      const mediumCount = parseInt(exam.bank_medium_count) || 0;
      const hardCount   = parseInt(exam.bank_hard_count)   || 0;
      const useDifficulty = (easyCount + mediumCount + hardCount) > 0;
      if (useDifficulty) {
        const easyQs   = seededShuffle(bankQRes.rows.filter(q => q.difficulty === 'easy'),   seed);
        const mediumQs = seededShuffle(bankQRes.rows.filter(q => q.difficulty === 'medium'), seed + 1);
        const hardQs   = seededShuffle(bankQRes.rows.filter(q => q.difficulty === 'hard'),   seed + 2);
        const picked = [
          ...easyQs.slice(0, easyCount),
          ...mediumQs.slice(0, mediumCount),
          ...hardQs.slice(0, hardCount),
        ];
        if (picked.length === 0) {
          return res.status(400).json({ error: 'لا توجد أسئلة كافية بالصعوبات المطلوبة في البنك' });
        }
        questions = seededShuffle(picked, seed + 3);
      } else {
        const shuffled = seededShuffle(bankQRes.rows, seed);
        // BUG-8 fix: use explicit count > 0 check, avoid falsy 0 silently defaulting to 10
        const count = Math.min(exam.bank_question_count > 0 ? exam.bank_question_count : 10, shuffled.length);
        questions = shuffled.slice(0, count);
      }
    } else {
      const questionsRes = await pool.query(
        'SELECT id,question_text,question_image_url,option_a,option_b,option_c,option_d,points,question_type,group_id,group_context,group_context_image FROM questions WHERE exam_id=$1 ORDER BY id',
        [examId]
      );
      if (questionsRes.rows.length === 0) {
        return res.status(400).json({ error: 'هذا الاختبار لا يحتوي على أسئلة بعد' });
      }
      questions = questionsRes.rows;
      if (exam.shuffle_questions) {
        const seed = (studentId * 31 + examId * 17) >>> 0;
        questions = seededShuffle(questions, seed);
      }
    }
    // ── Store server-side session: start time + question snapshot ──
    // This prevents timer cheating and bank-question tampering on submit.
    // H-9 fix: if a session already exists, ALWAYS return the stored snapshot
    // questions (not freshly generated ones) so the client and server stay in
    // sync.  The old code used ON CONFLICT DO NOTHING and then returned the
    // new questions array — mismatch on re-entry / duplicate GET /take calls.
    let serverStartedAt = null;
    try {
      const insertRes = await pool.query(
        `INSERT INTO exam_sessions (student_id, exam_id, started_at, questions_snapshot)
         VALUES ($1, $2, NOW(), $3)
         ON CONFLICT (student_id, exam_id)
         DO NOTHING
         RETURNING started_at`,
        [studentId, examId, JSON.stringify(questions)]
      );

      if (insertRes.rows.length > 0) {
        // New session — use the freshly generated questions
        serverStartedAt = insertRes.rows[0].started_at;
      } else {
        // Session already existed (re-entry or duplicate GET /take) —
        // MUST return the stored snapshot so submit scores the right questions.
        const sessionRow = await pool.query(
          'SELECT started_at, questions_snapshot FROM exam_sessions WHERE student_id=$1 AND exam_id=$2',
          [studentId, examId]
        );
        if (sessionRow.rows[0]) {
          serverStartedAt = sessionRow.rows[0].started_at;
          const storedSnap = sessionRow.rows[0].questions_snapshot;
          if (Array.isArray(storedSnap) && storedSnap.length > 0) {
            questions = storedSnap; // Override with the authoritative snapshot
          }
        }
      }
    } catch (_) {}

    // Enforce session TTL: sessions older than 24 hours are invalid
    if (serverStartedAt) {
      const sessionAgeMs = Date.now() - new Date(serverStartedAt).getTime();
      if (sessionAgeMs > 24 * 60 * 60 * 1000) {
        await pool.query('DELETE FROM exam_sessions WHERE student_id=$1 AND exam_id=$2', [studentId, examId]);
        return res.status(409).json({ error: 'انتهت صلاحية جلسة الاختبار — يرجى البدء من جديد', code: 'SESSION_EXPIRED' });
      }
    }

    // Strip correct_answer_letter from client response to prevent answer leaking
    const clientQuestions = questions.map(({ correct_answer_letter: _omit, ...q }) => q);
    res.json({ exam, questions: clientQuestions, serverStartedAt });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Rate-limiter: max 5 submissions per 60 s per student ──
const submitLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, message: { error: 'يرجى الانتظار قبل إعادة التسليم' } });

// ── Student: submit exam ──
router.post('/:id/submit', submitLimiter, requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  const examId = parseParamId(req.params.id);
  if (!examId) return res.status(400).json({ error: 'معرّف الاختبار غير صالح' });
  const { answers } = req.body;

  if (!answers || typeof answers !== 'object' || Array.isArray(answers))
    return res.status(400).json({ error: 'بيانات الإجابات غير صحيحة' });
  if (Object.keys(answers).length > 500)
    return res.status(400).json({ error: 'عدد الإجابات يتجاوز الحد المسموح (500)' });
  // Cap individual answer value length to prevent oversized payloads
  // (e.g. a student sending a 1 MB essay as a single answer field)
  for (const v of Object.values(answers)) {
    if (typeof v === 'string' && v.length > 5000)
      return res.status(400).json({ error: 'طول إحدى الإجابات يتجاوز الحد المسموح (5000 حرف)' });
  }

  // ── Pre-flight eligibility check (outside transaction for speed) ──
  let eligibilityRow, questionsData, serverSession;
  try {
    const existing = await pool.query(
      'SELECT id FROM exam_results WHERE student_id=$1 AND exam_id=$2 AND is_latest=true',
      [studentId, examId]
    );
    if (existing.rows.length > 0) {
      const retryApproved = await pool.query(
        "SELECT id FROM exam_retry_requests WHERE student_id=$1 AND exam_id=$2 AND status='approved' ORDER BY created_at DESC LIMIT 1",
        [studentId, examId]
      );
      if (!retryApproved.rows.length)
        return res.status(409).json({ error: 'لقد أديت هذا الاختبار مسبقاً' });
    }

    const ec = await pool.query(
      `SELECT e.* FROM exams e
       LEFT JOIN student_course_enrollment sce ON e.course_id = sce.course_id AND sce.student_id = $1
       WHERE e.id = $2
         AND e.is_published = true
         AND e.teacher_id = (SELECT teacher_id FROM students WHERE id = $1)
         AND (e.course_id IS NULL OR sce.status = 'active')`,
      [studentId, examId]
    );
    if (!ec.rows.length)
      return res.status(403).json({ error: 'Access denied: exam not available to you' });

    eligibilityRow = ec.rows[0];

    // Reject if exam window has not yet opened
    const nowCheck = new Date();
    if (eligibilityRow.start_date && new Date(eligibilityRow.start_date) > nowCheck)
      return res.status(409).json({ error: 'الاختبار لم يبدأ بعد — لا يمكن تسليم الإجابات قبل موعد البدء' });

    // Reject if exam window has closed
    if (eligibilityRow.end_date && new Date(eligibilityRow.end_date) < nowCheck)
      return res.status(409).json({ error: 'انتهى وقت الاختبار — لا يمكن تسليم الإجابات بعد انقضاء المهلة' });

    // ── Fetch server-side session (start time + question snapshot) ──
    const sessionRes = await pool.query(
      'SELECT started_at, questions_snapshot FROM exam_sessions WHERE student_id=$1 AND exam_id=$2',
      [studentId, examId]
    );
    serverSession = sessionRes.rows[0] || null;

    // ── Enforce server-side duration limit (prevents client-side timer cheating) ──
    if (serverSession?.started_at) {
      const elapsedMs  = Date.now() - new Date(serverSession.started_at).getTime();
      const maxMs      = (eligibilityRow.duration_minutes || 60) * 60 * 1000 + 90_000; // +90s grace
      if (elapsedMs > maxMs) {
        return res.status(409).json({ error: 'انتهت مدة الاختبار — لا يمكن تسليم الإجابات بعد انتهاء الوقت المخصص' });
      }
    }

    if (eligibilityRow.question_source === 'bank' && eligibilityRow.bank_id) {
      const questionIds = Object.keys(answers || {}).map(Number).filter(id => id > 0);
      if (questionIds.length === 0) return res.status(400).json({ error: 'لم يتم إرسال أي إجابات' });
      // SEC-2: Always use snapshot as authoritative source when available.
      // Do NOT fall back to DB if snapshot exists — this would allow forged question IDs.
      if (serverSession?.questions_snapshot?.length > 0) {
        // Only score questions that were actually served to this student
        questionsData = serverSession.questions_snapshot.filter(q => questionIds.includes(q.id));
        // Any submitted IDs not in snapshot are silently ignored (scored as unanswered)
      } else {
        // H-10 fix: No snapshot for a bank exam → REJECT the submission.
        // The old fallback loaded questions directly from the DB by submitted ID,
        // allowing an attacker to forge any question IDs from the bank.
        // A valid session (created by GET /:id/take) always has a snapshot —
        // its absence means the student never properly opened the exam.
        return res.status(409).json({
          error: 'جلسة الاختبار غير موجودة أو انتهت — يرجى الدخول للاختبار مجدداً ثم التسليم',
          code: 'NO_SESSION_SNAPSHOT',
        });
      }
    } else {
      // Manual exam: use snapshot if available for fair scoring,
      // otherwise reject — same security stance as bank exams.
      // Without a snapshot, the timer check is bypassed AND any question
      // could be answered regardless of what was shown to the student.
      if (serverSession?.questions_snapshot?.length > 0) {
        // Snapshot stores questions as-shown; re-attach correct_answer_letter from DB for scoring
        const snapshotIds = serverSession.questions_snapshot.map(q => q.id);
        const qr = await pool.query('SELECT * FROM questions WHERE exam_id=$1 AND id = ANY($2)', [examId, snapshotIds]);
        questionsData = qr.rows;
      } else {
        return res.status(409).json({
          error: 'جلسة الاختبار غير موجودة أو انتهت — يرجى الدخول للاختبار مجدداً ثم التسليم',
          code: 'NO_SESSION_SNAPSHOT',
        });
      }
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }

  // ── Score calculation (pure, no DB) ──
  const exam = eligibilityRow;
  let score = 0, correct = 0, wrong = 0, unanswered = 0;
  const detailedAnswers = questionsData.map(q => {
    const rawAnswer     = answers[q.id];
    const studentAnswer = rawAnswer ? String(rawAnswer).toUpperCase() : null;
    const correctLetter = q.correct_answer_letter ? q.correct_answer_letter.toUpperCase() : null;
    const qType = q.question_type || 'mcq';
    let isCorrect = false;
    if (!studentAnswer) {
      unanswered++;
    } else if (studentAnswer === correctLetter) {
      score += q.points; correct++; isCorrect = true;
    } else {
      wrong++;
    }
    return { question_id: q.id, student_answer: studentAnswer, correct_answer: correctLetter, is_correct: isCorrect, question_type: qType };
  });
  const totalPoints = questionsData.reduce((s, q) => s + q.points, 0);
  const normalizedScore = totalPoints > 0 ? Math.round((score / totalPoints) * exam.total_score) : 0;
  const passed = normalizedScore >= exam.pass_score;
  const pointsEarned = (exam.points_on_attempt || 0) + (passed ? (exam.points_on_pass || 0) : 0);

  // ── Atomic DB write inside a transaction ──
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Retry path: deduct old points + archive old result + mark retry as used
    const existingCheck = await client.query(
      'SELECT id, points_earned, attempt_number FROM exam_results WHERE student_id=$1 AND exam_id=$2 AND is_latest=true FOR UPDATE',
      [studentId, examId]
    );
    let nextAttemptNumber = 1;
    if (existingCheck.rows.length > 0) {
      const oldPts = existingCheck.rows[0].points_earned || 0;
      nextAttemptNumber = (existingCheck.rows[0].attempt_number || 1) + 1;
      if (oldPts > 0)
        await client.query('UPDATE students SET points = GREATEST(0, points - $1) WHERE id=$2', [oldPts, studentId]);
      // Archive old result instead of deleting — preserves history
      await client.query(
        'UPDATE exam_results SET is_latest=false WHERE student_id=$1 AND exam_id=$2',
        [studentId, examId]
      );
      await client.query(
        "UPDATE exam_retry_requests SET status='used', handled_at=NOW() WHERE student_id=$1 AND exam_id=$2 AND status='approved'",
        [studentId, examId]
      );
    }

    // Use server-side start time — prevents all timer cheating from client
    const durationMs = (exam.duration_minutes || 60) * 60 * 1000;
    const safeStartTime = serverSession?.started_at
      ? new Date(serverSession.started_at)
      : new Date(Date.now() - durationMs);

    // Insert new result with incremented attempt number
    const resultRow = await client.query(
      'INSERT INTO exam_results (student_id,exam_id,score,correct_count,wrong_count,unanswered_count,start_time,end_time,answers,points_earned,attempt_number,is_latest) VALUES($1,$2,$3,$4,$5,$6,$7,NOW(),$8,$9,$10,true) RETURNING *',
      [studentId, examId, normalizedScore, correct, wrong, unanswered, safeStartTime, JSON.stringify(detailedAnswers), pointsEarned, nextAttemptNumber]
    );

    if (pointsEarned > 0)
      await client.query('UPDATE students SET points = points + $1 WHERE id=$2', [pointsEarned, studentId]);

    if (passed && exam.badge_name)
      await client.query(
        'INSERT INTO badges (student_id,exam_id,badge_name,badge_color) VALUES($1,$2,$3,$4) ON CONFLICT (student_id,exam_id) DO UPDATE SET badge_name=EXCLUDED.badge_name, badge_color=EXCLUDED.badge_color',
        [studentId, examId, exam.badge_name, exam.badge_color]
      );

    await client.query('COMMIT');
    invalidateCache(exam.teacher_id);
    // Clean up the exam session after successful submission (best-effort)
    pool.query('DELETE FROM exam_sessions WHERE student_id=$1 AND exam_id=$2', [studentId, examId]).catch(() => {});
    res.json({ result: resultRow.rows[0], detailedAnswers, normalizedScore, pointsEarned, pass_score: exam.pass_score, total_score: exam.total_score });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ── Student: get exam results for a specific course ──
router.get('/student/course-results/:courseId', requireRole('student'), async (req, res) => {
  const courseId = parseParamId(req.params.courseId);
  if (!courseId) return res.status(400).json({ error: 'معرّف الكورس غير صالح' });
  try {
    const enrollCheck = await pool.query(
      "SELECT id FROM student_course_enrollment WHERE student_id=$1 AND course_id=$2 AND status='active'",
      [req.user.id, courseId]
    );
    if (!enrollCheck.rows.length)
      return res.status(403).json({ error: 'Access denied: not enrolled in this course' });

    const result = await pool.query(
      `SELECT er.id, er.score, er.correct_count, er.wrong_count, er.unanswered_count,
              er.points_earned, er.created_at,
              e.title as exam_title, e.total_score, e.pass_score, e.id as exam_id
       FROM exam_results er
       JOIN exams e ON er.exam_id = e.id
       WHERE er.student_id = $1 AND e.course_id = $2 AND er.is_latest = true
       ORDER BY er.created_at DESC`,
      [req.user.id, courseId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Get result summary ──
router.get('/results/:resultId', requireRole('teacher', 'assistant', 'student'), async (req, res) => {
  const resultId = parseParamId(req.params.resultId);
  if (!resultId) return res.status(400).json({ error: 'معرّف النتيجة غير صالح' });
  try {
    const result = await pool.query(
      `SELECT er.*, s.name as student_name, e.title as exam_title, e.total_score, e.pass_score, e.teacher_id as exam_teacher_id
       FROM exam_results er JOIN students s ON er.student_id=s.id JOIN exams e ON er.exam_id=e.id
       WHERE er.id=$1`,
      [resultId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Result not found' });
    const row = result.rows[0];

    if (req.user.role === 'student') {
      if (parseInt(row.student_id) !== parseInt(req.user.id)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else {
      const teacherId = getTeacherId(req);
      if (parseInt(row.exam_teacher_id) !== parseInt(teacherId)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const { exam_teacher_id, ...safe } = row;
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Full exam review ──
// M-4 fix: assistants must have can_view_analytics to access exam review
router.get('/results/:resultId/review', requireRole('teacher', 'assistant', 'student'), async (req, res, next) => {
  if (req.user.role === 'assistant') {
    try {
      const perms = await getPermissions(req.user.id, pool);
      if (!perms?.can_view_analytics)
        return res.status(403).json({ error: 'Access denied: missing permission (can_view_analytics)' });
    } catch { return res.status(500).json({ error: 'Server error' }); }
  }
  next();
}, async (req, res) => {
  const resultId = parseParamId(req.params.resultId);
  if (!resultId) return res.status(400).json({ error: 'معرّف النتيجة غير صالح' });
  try {
    const resultRes = await pool.query(
      `SELECT er.id, er.student_id, er.exam_id, er.score, er.correct_count, er.wrong_count,
              er.unanswered_count, er.points_earned, er.start_time, er.end_time, er.created_at,
              er.answers, er.attempt_number,
              s.name  AS student_name,
              e.title AS exam_title, e.total_score, e.pass_score, e.teacher_id AS exam_teacher_id,
              e.question_source, e.bank_id, e.shuffle_options
       FROM exam_results er
       JOIN students s ON er.student_id = s.id
       JOIN exams e    ON er.exam_id    = e.id
       WHERE er.id = $1`,
      [resultId]
    );
    if (!resultRes.rows.length) return res.status(404).json({ error: 'Result not found' });
    const row = resultRes.rows[0];

    if (req.user.role === 'student') {
      if (parseInt(row.student_id) !== parseInt(req.user.id)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else {
      const teacherId = getTeacherId(req);
      if (parseInt(row.exam_teacher_id) !== parseInt(teacherId)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const isBank = row.question_source === 'bank' && row.bank_id;
    let questionsRes;
    if (isBank) {
      let answeredIds = [];
      let isOldBankFormat = false;
      try {
        const raw = typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers;
        if (Array.isArray(raw)) {
          answeredIds = raw.map(a => a.question_id).filter(Boolean);
        } else if (raw && typeof raw === 'object') {
          // Old sequential format — fall back to fetching all bank questions by position
          isOldBankFormat = true;
        }
      } catch (_) {}
      if (answeredIds.length > 0) {
        questionsRes = await pool.query('SELECT * FROM bank_questions WHERE id = ANY($1) ORDER BY id', [answeredIds]);
      } else if (isOldBankFormat) {
        questionsRes = await pool.query('SELECT * FROM bank_questions WHERE bank_id = $1 ORDER BY id', [row.bank_id]);
      } else {
        questionsRes = { rows: [] };
      }
    } else {
      questionsRes = await pool.query('SELECT * FROM questions WHERE exam_id=$1 ORDER BY id', [row.exam_id]);
    }

    // ── Parse stored answers — handles two formats: ──────────────────────────
    // 1. New format (array): [{question_id, student_answer, correct_answer, is_correct}]
    // 2. Old/seed format (object): {"1":"a","2":"b",...} — keys are 1-based sequence
    let storedAnswers = [];
    let isOldSeqFormat = false;
    try {
      const raw = typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers;
      if (Array.isArray(raw)) {
        storedAnswers = raw;
      } else if (raw && typeof raw === 'object') {
        // Old sequential format — convert to array keyed by position
        isOldSeqFormat = true;
        storedAnswers = Object.entries(raw).map(([k, v]) => ({
          seq: parseInt(k, 10),
          student_answer: typeof v === 'string' ? v.toUpperCase() : v,
        }));
      }
    } catch (_) {}

    // Build lookup map: question_id → answer entry
    const answerMap = {};
    if (isOldSeqFormat) {
      // Map sequential index → question ID using sorted question list
      const seqMap = {};
      storedAnswers.forEach(a => { seqMap[a.seq] = a; });
      questionsRes.rows.forEach((q, i) => {
        const entry = seqMap[i + 1];
        if (entry) answerMap[String(q.id)] = entry;
      });
    } else {
      storedAnswers.forEach(a => { answerMap[String(a.question_id)] = a; });
    }

    const questions = questionsRes.rows.map(q => {
      const stored = answerMap[String(q.id)];
      const qType  = q.question_type || 'mcq';

      // Normalize to uppercase for reliable comparison
      const rawStudentAnswer = stored?.student_answer ?? null;
      const studentAnswer    = rawStudentAnswer ? String(rawStudentAnswer).toUpperCase() : null;
      const correctLetter    = q.correct_answer_letter ? q.correct_answer_letter.toUpperCase() : null;
      const correctAnswer = correctLetter;

      const isCorrect = !studentAnswer ? false : studentAnswer === correctLetter;

      return {
        ...q,
        correct_answer_letter: correctLetter,
        student_answer: studentAnswer,
        correct_answer: correctAnswer,
        is_correct: isCorrect,
      };
    });

    const { answers, exam_teacher_id, ...resultClean } = row;
    res.json({ result: resultClean, questions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
