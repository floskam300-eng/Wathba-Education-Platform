const { sendEvent, broadcastToTeacherStudents, broadcastToCourseStudents } = require('../sse');
const express = require('express');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { invalidateCache } = require('../lib/analyticsCache');
const { validateExam } = require('../middleware/validate');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
router.use(authenticate);

const questionImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/question-images');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `q_${Date.now()}${ext}`);
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

const { getPermissions } = require('../lib/permissionsCache');

const getTeacherId = (req) => req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;

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

// ── List exams ──
router.get('/', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      `SELECT e.*, c.name as course_name, COUNT(q.id) as question_count,
              COUNT(er.id) as attempt_count
       FROM exams e
       LEFT JOIN courses c ON e.course_id = c.id
       LEFT JOIN questions q ON e.id = q.exam_id
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

const validateExamFields = ({ title, duration_minutes, total_score, pass_score }) => {
  if (!title || !title.trim()) return 'عنوان الامتحان مطلوب';
  const dur = parseInt(duration_minutes);
  const total = parseInt(total_score);
  const pass = parseInt(pass_score);
  if (!dur || dur <= 0) return 'مدة الامتحان يجب أن تكون أكبر من صفر';
  if (!total || total <= 0) return 'الدرجة الكلية يجب أن تكون أكبر من صفر';
  if (pass < 0 || pass > total) return `درجة النجاح يجب أن تكون بين 0 و ${total}`;
  return null;
};

// ── Create exam ──
router.post('/', requireRole('teacher', 'assistant'), validateExam, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { title, duration_minutes, total_score, course_id, pass_score, badge_name, badge_color, start_date, end_date } = req.body;
  try {
    if (course_id) {
      const courseCheck = await pool.query('SELECT id FROM courses WHERE id=$1 AND teacher_id=$2', [course_id, teacherId]);
      if (!courseCheck.rows.length) return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    if (start_date && end_date) {
      const diffMin = (new Date(end_date) - new Date(start_date)) / 60000;
      if (diffMin < parseInt(duration_minutes || 60))
        return res.status(400).json({ error: `الفترة بين البداية والنهاية (${Math.round(diffMin)} دقيقة) أقل من مدة الاختبار (${duration_minutes || 60} دقيقة)` });
    }
    const result = await pool.query(
      'INSERT INTO exams (title,duration_minutes,total_score,course_id,teacher_id,pass_score,badge_name,badge_color,start_date,end_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [title, duration_minutes || 60, total_score || 100, course_id || null, teacherId, pass_score ?? 50, badge_name, badge_color || '#FF8C00', start_date || null, end_date || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Update exam ──
router.put('/:id', requireRole('teacher', 'assistant'), validateExam, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { title, duration_minutes, total_score, course_id, pass_score, badge_name, badge_color, start_date, end_date } = req.body;
  try {
    if (start_date && end_date) {
      const diffMin = (new Date(end_date) - new Date(start_date)) / 60000;
      if (diffMin < parseInt(duration_minutes || 60))
        return res.status(400).json({ error: `الفترة بين البداية والنهاية (${Math.round(diffMin)} دقيقة) أقل من مدة الاختبار (${duration_minutes || 60} دقيقة)` });
    }
    const result = await pool.query(
      'UPDATE exams SET title=$1,duration_minutes=$2,total_score=$3,course_id=$4,pass_score=$5,badge_name=$6,badge_color=$7,start_date=$8,end_date=$9 WHERE id=$10 AND teacher_id=$11 RETURNING *',
      [title, duration_minutes, total_score, course_id, pass_score, badge_name, badge_color, start_date || null, end_date || null, req.params.id, teacherId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Exam not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Toggle publish exam ──
router.put('/:id/publish', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      'UPDATE exams SET is_published = NOT is_published WHERE id=$1 AND teacher_id=$2 RETURNING id, is_published, title, course_id, start_date',
      [req.params.id, teacherId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Exam not found' });
    const exam = result.rows[0];

    if (exam.is_published) {
      // Get all affected student IDs
      let studentIds = [];
      if (exam.course_id) {
        const sRes = await pool.query(
          'SELECT student_id AS id FROM student_course_enrollment WHERE course_id=$1',
          [exam.course_id]
        );
        studentIds = sRes.rows.map(r => r.id);
      } else {
        const sRes = await pool.query(
          'SELECT id FROM students WHERE teacher_id=$1 AND deleted_at IS NULL',
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

      for (const sid of studentIds) {
        try {
          await pool.query(
            `INSERT INTO notification_log (teacher_id, student_id, recipient_type, message, type, is_read, source, title)
             VALUES ($1,$2,'student',$3,'new_exam',false,'platform',$4)`,
            [teacherId, sid, notifMsg, notifTitle]
          );
        } catch (_) {}
        if (!hasStartDate) {
          sendEvent(`student_${sid}`, 'new_exam', { title: exam.title, examId: exam.id });
        }
      }

      if (hasStartDate) {
        const delay = startDate - now;
        setTimeout(async () => {
          const startMsg = `⏰ بدأ وقت اختبار: "${exam.title}" — يمكنك الدخول الآن`;
          for (const sid of studentIds) {
            try {
              await pool.query(
                `INSERT INTO notification_log (teacher_id, student_id, recipient_type, message, type, is_read, source, title)
                 VALUES ($1,$2,'student',$3,'new_exam',false,'platform',$4)`,
                [teacherId, sid, startMsg, 'بدأ وقت الاختبار']
              );
            } catch (_) {}
            sendEvent(`student_${sid}`, 'new_exam', { title: exam.title, examId: exam.id });
          }
        }, delay);
      }
    }

    res.json({ id: exam.id, is_published: exam.is_published });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Upload question image ──
router.post('/upload-question-image', requireRole('teacher', 'assistant'), uploadQuestionImage.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لم يتم رفع أي ملف' });
  const url = `/uploads/question-images/${req.file.filename}`;
  res.json({ url });
});

// ── Delete exam ──
router.delete('/:id', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query('DELETE FROM exams WHERE id=$1 AND teacher_id=$2 RETURNING id', [req.params.id, teacherId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Exam not found' });
    res.json({ message: 'Exam deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Get questions ──
router.get('/:id/questions', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    if (!(await verifyExamOwnership(req.params.id, teacherId))) {
      return res.status(403).json({ error: 'Access denied: exam not yours' });
    }
    const result = await pool.query('SELECT * FROM questions WHERE exam_id=$1 ORDER BY id', [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Add question ──
router.post('/:id/questions', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { question_text, question_image_url, option_a, option_b, option_c, option_d, correct_answer_letter, points, question_type, essay_answer_key } = req.body;
  try {
    if (!(await verifyExamOwnership(req.params.id, teacherId))) {
      return res.status(403).json({ error: 'Access denied: exam not yours' });
    }
    const qType = question_type || 'mcq';
    let optA = option_a, optB = option_b, correctLetter = correct_answer_letter;

    if (qType === 'true_false') {
      optA = 'صح'; optB = 'خطأ';
      correctLetter = correct_answer_letter || 'A';
    } else if (qType === 'essay') {
      optA = '-'; optB = '-'; correctLetter = 'A';
    }

    const result = await pool.query(
      'INSERT INTO questions (question_text,question_image_url,option_a,option_b,option_c,option_d,correct_answer_letter,points,exam_id,question_type,essay_answer_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
      [question_text, question_image_url, optA, optB, option_c, option_d, correctLetter.toUpperCase(), points || 1, req.params.id, qType, essay_answer_key || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Update question ──
router.put('/questions/:qid', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { question_text, question_image_url, option_a, option_b, option_c, option_d, correct_answer_letter, points, question_type, essay_answer_key } = req.body;
  try {
    if (!(await verifyQuestionOwnership(req.params.qid, teacherId))) {
      return res.status(403).json({ error: 'Access denied: question not yours' });
    }
    const qType = question_type || 'mcq';
    let optA = option_a, optB = option_b, correctLetter = correct_answer_letter;
    if (qType === 'true_false') { optA = 'صح'; optB = 'خطأ'; }
    else if (qType === 'essay') { optA = '-'; optB = '-'; correctLetter = 'A'; }

    const result = await pool.query(
      'UPDATE questions SET question_text=$1,question_image_url=$2,option_a=$3,option_b=$4,option_c=$5,option_d=$6,correct_answer_letter=$7,points=$8,question_type=$9,essay_answer_key=$10 WHERE id=$11 RETURNING *',
      [question_text, question_image_url, optA, optB, option_c, option_d, correctLetter.toUpperCase(), points || 1, qType, essay_answer_key || null, req.params.qid]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Delete question ──
router.delete('/questions/:qid', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    if (!(await verifyQuestionOwnership(req.params.qid, teacherId))) {
      return res.status(403).json({ error: 'Access denied: question not yours' });
    }
    await pool.query('DELETE FROM questions WHERE id=$1', [req.params.qid]);
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
router.post('/:id/retry-request', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  const examId = req.params.id;
  const { message } = req.body;
  try {
    const taken = await pool.query(
      'SELECT id, score FROM exam_results WHERE student_id=$1 AND exam_id=$2',
      [studentId, examId]
    );
    if (!taken.rows.length) return res.status(400).json({ error: 'لم تؤدِ هذا الاختبار بعد' });
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
router.get('/retry-requests', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      `SELECT rr.*, s.name as student_name, e.title as exam_title
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
router.put('/retry-requests/:reqId/approve', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { teacher_note } = req.body;
  try {
    const rr = await pool.query(
      `SELECT rr.* FROM exam_retry_requests rr
       JOIN exams e ON rr.exam_id = e.id
       WHERE rr.id=$1 AND e.teacher_id=$2`,
      [req.params.reqId, teacherId]
    );
    if (!rr.rows.length) return res.status(404).json({ error: 'الطلب غير موجود' });
    await pool.query(
      "UPDATE exam_retry_requests SET status='approved', teacher_note=$1, handled_at=NOW() WHERE id=$2",
      [teacher_note || null, req.params.reqId]
    );
    try {
      const row = rr.rows[0];
      await pool.query(
        `INSERT INTO notification_log (teacher_id, student_id, message, type)
         VALUES ($1, $2, 'تمت الموافقة على طلب إعادة الاختبار — يمكنك الآن إعادة تأدية الاختبار', 'retry_approved')`,
        [teacherId, row.student_id]
      );
      sendEvent(`student_${row.student_id}`, 'retry_approved', { examId: row.exam_id });
    } catch (_) {}
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Teacher: reject retry request ──
router.put('/retry-requests/:reqId/reject', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { teacher_note } = req.body;
  try {
    const rr = await pool.query(
      `SELECT rr.* FROM exam_retry_requests rr
       JOIN exams e ON rr.exam_id = e.id
       WHERE rr.id=$1 AND e.teacher_id=$2`,
      [req.params.reqId, teacherId]
    );
    if (!rr.rows.length) return res.status(404).json({ error: 'الطلب غير موجود' });
    await pool.query(
      "UPDATE exam_retry_requests SET status='rejected', teacher_note=$1, handled_at=NOW() WHERE id=$2",
      [teacher_note || null, req.params.reqId]
    );
    try {
      const row = rr.rows[0];
      await pool.query(
        `INSERT INTO notification_log (teacher_id, student_id, message, type)
         VALUES ($1, $2, 'تم رفض طلب إعادة الاختبار', 'retry_rejected')`,
        [teacherId, row.student_id]
      );
      sendEvent(`student_${row.student_id}`, 'retry_rejected', { examId: row.exam_id });
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
       LEFT JOIN exam_results er ON e.id = er.exam_id AND er.student_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM exam_retry_requests rr
           WHERE rr.student_id = $1 AND rr.exam_id = e.id AND rr.status = 'approved'
         )
       WHERE e.teacher_id = (SELECT teacher_id FROM students WHERE id = $1)
         AND (e.course_id IS NULL OR sce.student_id IS NOT NULL)
         AND e.is_published = true`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Student: take exam ──
router.get('/:id/take', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  try {
    const now = new Date();
    const eligibilityCheck = await pool.query(
      `SELECT e.id, e.title, e.duration_minutes, e.total_score, e.pass_score,
              e.start_date, e.end_date
       FROM exams e
       LEFT JOIN student_course_enrollment sce ON e.course_id = sce.course_id AND sce.student_id = $1
       WHERE e.id = $2
         AND e.teacher_id = (SELECT teacher_id FROM students WHERE id = $1)
         AND (e.course_id IS NULL OR sce.student_id IS NOT NULL)`,
      [studentId, req.params.id]
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
    const questions = await pool.query(
      'SELECT id,question_text,question_image_url,option_a,option_b,option_c,option_d,points,question_type FROM questions WHERE exam_id=$1 ORDER BY id',
      [req.params.id]
    );
    if (questions.rows.length === 0) {
      return res.status(400).json({ error: 'هذا الاختبار لا يحتوي على أسئلة بعد' });
    }
    res.json({ exam: eligibilityCheck.rows[0], questions: questions.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Student: submit exam ──
router.post('/:id/submit', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  const examId = req.params.id;
  const { answers, start_time } = req.body;

  try {
    const existing = await pool.query(
      'SELECT id FROM exam_results WHERE student_id=$1 AND exam_id=$2',
      [studentId, examId]
    );
    if (existing.rows.length > 0) {
      const retryApproved = await pool.query(
        "SELECT id FROM exam_retry_requests WHERE student_id=$1 AND exam_id=$2 AND status='approved' ORDER BY created_at DESC LIMIT 1",
        [studentId, examId]
      );
      if (!retryApproved.rows.length) {
        return res.status(409).json({ error: 'لقد أديت هذا الاختبار مسبقاً' });
      }
      await pool.query('DELETE FROM exam_results WHERE student_id=$1 AND exam_id=$2', [studentId, examId]);
      await pool.query(
        "UPDATE exam_retry_requests SET status='used', handled_at=NOW() WHERE id=$1",
        [retryApproved.rows[0].id]
      );
    }

    const eligibilityCheck = await pool.query(
      `SELECT e.*
       FROM exams e
       LEFT JOIN student_course_enrollment sce ON e.course_id = sce.course_id AND sce.student_id = $1
       WHERE e.id = $2
         AND e.teacher_id = (SELECT teacher_id FROM students WHERE id = $1)
         AND (e.course_id IS NULL OR sce.student_id IS NOT NULL)`,
      [studentId, examId]
    );
    if (!eligibilityCheck.rows.length) {
      return res.status(403).json({ error: 'Access denied: exam not available to you' });
    }

    const exam = eligibilityCheck.rows[0];
    const questionsRes = await pool.query('SELECT * FROM questions WHERE exam_id=$1', [examId]);
    const questions = questionsRes.rows;

    let score = 0, correct = 0, wrong = 0, unanswered = 0;
    const detailedAnswers = questions.map(q => {
      const rawAnswer    = answers[q.id];
      const studentAnswer = rawAnswer ? String(rawAnswer).toUpperCase() : null;
      const correctLetter = q.correct_answer_letter ? q.correct_answer_letter.toUpperCase() : null;
      const qType = q.question_type || 'mcq';

      if (qType === 'essay') {
        return {
          question_id: q.id,
          student_answer: rawAnswer || '',
          correct_answer: q.essay_answer_key || '',
          is_correct: null,
          question_type: 'essay'
        };
      }

      let isCorrect = false;
      if (!studentAnswer) {
        unanswered++;
      } else if (studentAnswer === correctLetter) {
        score += q.points;
        correct++;
        isCorrect = true;
      } else {
        wrong++;
      }
      return { question_id: q.id, student_answer: studentAnswer, correct_answer: correctLetter, is_correct: isCorrect, question_type: qType };
    });

    const gradableQuestions = questions.filter(q => (q.question_type || 'mcq') !== 'essay');
    const totalPoints = gradableQuestions.reduce((s, q) => s + q.points, 0);
    const normalizedScore = totalPoints > 0 ? Math.round((score / totalPoints) * exam.total_score) : 0;
    const pointsEarned = normalizedScore;

    const result = await pool.query(
      'INSERT INTO exam_results (student_id,exam_id,score,correct_count,wrong_count,unanswered_count,start_time,end_time,answers,points_earned) VALUES($1,$2,$3,$4,$5,$6,$7,NOW(),$8,$9) RETURNING *',
      [studentId, examId, normalizedScore, correct, wrong, unanswered, start_time, JSON.stringify(detailedAnswers), pointsEarned]
    );

    await pool.query('UPDATE students SET points = points + $1 WHERE id = $2', [pointsEarned, studentId]);
    invalidateCache(exam.teacher_id);

    if (normalizedScore >= exam.pass_score && exam.badge_name) {
      await pool.query(
        'INSERT INTO badges (student_id,exam_id,badge_name,badge_color) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [studentId, examId, exam.badge_name, exam.badge_color]
      );
    }

    res.json({ result: result.rows[0], detailedAnswers, normalizedScore, pointsEarned });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Teacher: grade essay questions in a result ──
router.put('/results/:resultId/grade-essay', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { essay_scores } = req.body; // { [question_id]: points_awarded }
  try {
    const resultRes = await pool.query(
      `SELECT er.*, e.total_score, e.teacher_id, e.id as exam_id_val
       FROM exam_results er
       JOIN exams e ON er.exam_id = e.id
       WHERE er.id = $1 AND e.teacher_id = $2`,
      [req.params.resultId, teacherId]
    );
    if (!resultRes.rows.length) return res.status(404).json({ error: 'Result not found' });
    const row = resultRes.rows[0];

    const totalEssayPoints = Object.values(essay_scores || {}).reduce((s, v) => s + (parseInt(v) || 0), 0);
    const newScore = Math.min(row.score + totalEssayPoints, row.total_score);

    await pool.query(
      'UPDATE exam_results SET essay_graded=true, essay_score_adjustment=$1, score=$2 WHERE id=$3',
      [totalEssayPoints, newScore, req.params.resultId]
    );

    if (totalEssayPoints > 0) {
      await pool.query(
        'UPDATE students SET points = points + $1 WHERE id = $2',
        [totalEssayPoints, row.student_id]
      );
    }

    try {
      await pool.query(
        `INSERT INTO notification_log (teacher_id, student_id, message, type)
         VALUES ($1, $2, 'تم تصحيح إجاباتك المقالية وتحديث درجتك', 'essay_graded')`,
        [teacherId, row.student_id]
      );
      sendEvent(`student_${row.student_id}`, 'essay_graded', { new_score: newScore, resultId: req.params.resultId });
    } catch (_) {}

    res.json({ success: true, new_score: newScore, essay_score_adjustment: totalEssayPoints });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Student: get exam results for a specific course ──
router.get('/student/course-results/:courseId', requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT er.id, er.score, er.correct_count, er.wrong_count, er.unanswered_count,
              er.points_earned, er.essay_graded, er.essay_score_adjustment, er.created_at,
              e.title as exam_title, e.total_score, e.pass_score, e.id as exam_id
       FROM exam_results er
       JOIN exams e ON er.exam_id = e.id
       WHERE er.student_id = $1 AND e.course_id = $2
       ORDER BY er.created_at DESC`,
      [req.user.id, req.params.courseId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Get result summary ──
router.get('/results/:resultId', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT er.*, s.name as student_name, e.title as exam_title, e.total_score, e.pass_score, e.teacher_id as exam_teacher_id
       FROM exam_results er JOIN students s ON er.student_id=s.id JOIN exams e ON er.exam_id=e.id
       WHERE er.id=$1`,
      [req.params.resultId]
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
router.get('/results/:resultId/review', authenticate, async (req, res) => {
  try {
    const resultRes = await pool.query(
      `SELECT er.id, er.student_id, er.exam_id, er.score, er.correct_count, er.wrong_count,
              er.unanswered_count, er.points_earned, er.start_time, er.end_time, er.created_at,
              er.answers, er.essay_graded, er.essay_score_adjustment,
              s.name  AS student_name,
              e.title AS exam_title, e.total_score, e.pass_score, e.teacher_id AS exam_teacher_id
       FROM exam_results er
       JOIN students s ON er.student_id = s.id
       JOIN exams e    ON er.exam_id    = e.id
       WHERE er.id = $1`,
      [req.params.resultId]
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

    const questionsRes = await pool.query('SELECT * FROM questions WHERE exam_id=$1 ORDER BY id', [row.exam_id]);

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
      const correctAnswer    = qType === 'essay'
        ? (q.essay_answer_key || null)
        : correctLetter;

      let isCorrect;
      if (qType === 'essay') {
        isCorrect = stored ? (stored.is_correct ?? null) : null;
      } else if (!studentAnswer) {
        isCorrect = false;
      } else {
        isCorrect = studentAnswer === correctLetter;
      }

      return {
        ...q,
        correct_answer_letter: correctLetter,
        student_answer: studentAnswer,
        correct_answer: correctAnswer,
        is_correct: isCorrect,
      };
    });

    const { answers, exam_teacher_id, ...resultClean } = row;
    const hasEssay = questions.some(q => q.question_type === 'essay');
    res.json({ result: { ...resultClean, has_essay: hasEssay }, questions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Teacher: list all exam results with pending essay questions ──
router.get('/essay-pending', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const result = await pool.query(
      `SELECT er.id, er.student_id, er.exam_id, er.score, er.created_at,
              er.essay_graded, er.essay_score_adjustment, er.answers,
              s.name  AS student_name, s.username AS student_username,
              e.title AS exam_title, e.total_score, e.pass_score
       FROM exam_results er
       JOIN students s ON er.student_id = s.id
       JOIN exams   e ON er.exam_id    = e.id
       WHERE e.teacher_id = $1
         AND er.essay_graded = false
         AND EXISTS (
           SELECT 1 FROM questions q
           WHERE q.exam_id = e.id AND q.question_type = 'essay'
         )
       ORDER BY er.created_at DESC`,
      [teacherId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Teacher: get essay questions + student answers for a result ──
router.get('/results/:resultId/essay-detail', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const resultRes = await pool.query(
      `SELECT er.*, e.teacher_id AS exam_teacher_id, e.total_score, e.title AS exam_title, e.pass_score
       FROM exam_results er
       JOIN exams e ON er.exam_id = e.id
       WHERE er.id = $1 AND e.teacher_id = $2`,
      [req.params.resultId, teacherId]
    );
    if (!resultRes.rows.length) return res.status(403).json({ error: 'Access denied' });
    const row = resultRes.rows[0];

    const questionsRes = await pool.query(
      `SELECT * FROM questions WHERE exam_id = $1 AND question_type = 'essay' ORDER BY id`,
      [row.exam_id]
    );

    let answers = [];
    try {
      const raw = typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers;
      if (Array.isArray(raw)) answers = raw;
    } catch (_) {}

    const answerMap = {};
    answers.forEach(a => { if (a.question_id) answerMap[String(a.question_id)] = a; });

    const essayQuestions = questionsRes.rows.map(q => ({
      ...q,
      student_answer: answerMap[String(q.id)]?.student_answer ?? null,
    }));

    const { exam_teacher_id, answers: _ans, ...safeResult } = row;
    res.json({ result: safeResult, essay_questions: essayQuestions });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
