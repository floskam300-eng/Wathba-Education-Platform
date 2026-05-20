const { sendEvent } = require('../sse');
const { sendFCMToStudents } = require('../lib/fcm');
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

const getTeacherId = (req) => req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;

// ── Middleware: assistants must have can_manage_exams ──
const checkManageExamsPerm = async (req, res, next) => {
  if (req.user.role === 'teacher') return next();
  try {
    const r = await pool.query('SELECT can_manage_exams FROM assistants WHERE id=$1', [req.user.id]);
    if (!r.rows.length || !r.rows[0].can_manage_exams)
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


// ── Create exam ──
router.post('/', requireRole('teacher', 'assistant'), checkManageExamsPerm, validateExam, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { title, duration_minutes, total_score, course_id, pass_score, badge_name, badge_color, start_date, end_date, shuffle_questions, shuffle_options, question_source, bank_id, bank_question_count, points_on_attempt, points_on_pass } = req.body;
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
      const diffMin = (new Date(end_date) - new Date(start_date)) / 60000;
      if (diffMin < parseInt(duration_minutes || 60))
        return res.status(400).json({ error: `الفترة بين البداية والنهاية (${Math.round(diffMin)} دقيقة) أقل من مدة الاختبار (${duration_minutes || 60} دقيقة)` });
    }
    const result = await pool.query(
      'INSERT INTO exams (title,duration_minutes,total_score,course_id,teacher_id,pass_score,badge_name,badge_color,start_date,end_date,shuffle_questions,shuffle_options,question_source,bank_id,bank_question_count,points_on_attempt,points_on_pass) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *',
      [title, duration_minutes || 60, total_score || 100, course_id || null, teacherId, pass_score ?? 50, badge_name, badge_color || '#FF8C00', start_date || null, end_date || null, !!shuffle_questions, !!shuffle_options, question_source || 'manual', (question_source === 'bank' && bank_id) ? bank_id : null, bank_question_count || 10, points_on_attempt || 0, points_on_pass || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Update exam ──
router.put('/:id', requireRole('teacher', 'assistant'), checkManageExamsPerm, validateExam, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { title, duration_minutes, total_score, course_id, pass_score, badge_name, badge_color, start_date, end_date, shuffle_questions, shuffle_options, question_source, bank_id, bank_question_count, points_on_attempt, points_on_pass } = req.body;
  try {
    if (question_source === 'bank' && bank_id) {
      const bankCheck = await pool.query('SELECT id FROM question_banks WHERE id=$1 AND teacher_id=$2', [bank_id, teacherId]);
      if (!bankCheck.rows.length) return res.status(403).json({ error: 'Access denied: bank not yours' });
    }
    if (start_date && end_date) {
      const diffMin = (new Date(end_date) - new Date(start_date)) / 60000;
      if (diffMin < parseInt(duration_minutes || 60))
        return res.status(400).json({ error: `الفترة بين البداية والنهاية (${Math.round(diffMin)} دقيقة) أقل من مدة الاختبار (${duration_minutes || 60} دقيقة)` });
    }
    const result = await pool.query(
      'UPDATE exams SET title=$1,duration_minutes=$2,total_score=$3,course_id=$4,pass_score=$5,badge_name=$6,badge_color=$7,start_date=$8,end_date=$9,shuffle_questions=$10,shuffle_options=$11,question_source=$12,bank_id=$13,bank_question_count=$14,points_on_attempt=$15,points_on_pass=$16 WHERE id=$17 AND teacher_id=$18 RETURNING *',
      [title, duration_minutes, total_score, course_id || null, pass_score, badge_name, badge_color, start_date || null, end_date || null, !!shuffle_questions, !!shuffle_options, question_source || 'manual', (question_source === 'bank' && bank_id) ? bank_id : null, bank_question_count || 10, points_on_attempt || 0, points_on_pass || 0, req.params.id, teacherId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Exam not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Toggle publish exam ──
router.put('/:id/publish', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    // Get current exam state before toggling
    const current = await pool.query(
      'SELECT * FROM exams WHERE id=$1 AND teacher_id=$2',
      [req.params.id, teacherId]
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
        const qCount = await pool.query('SELECT COUNT(id) as cnt FROM questions WHERE exam_id=$1', [req.params.id]);
        if (parseInt(qCount.rows[0].cnt) === 0) {
          return res.status(400).json({ error: 'لا يمكن نشر اختبار بدون أسئلة — أضف أسئلة أولاً' });
        }
      }
      // If republishing (exam was taken before), clear previous results to allow re-attempt
      const existingResults = await pool.query(
        'SELECT COUNT(id) as cnt FROM exam_results WHERE exam_id=$1',
        [req.params.id]
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
        await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [req.params.id]);
        await pool.query(
          "UPDATE exam_retry_requests SET status='used', handled_at=NOW() WHERE exam_id=$1 AND status='pending'",
          [req.params.id]
        );
      }
    }

    const result = await pool.query(
      'UPDATE exams SET is_published = NOT is_published WHERE id=$1 AND teacher_id=$2 RETURNING id, is_published, title, course_id, start_date',
      [req.params.id, teacherId]
    );
    const exam = result.rows[0];

    if (exam.is_published) {
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
          'SELECT student_id AS id FROM student_course_enrollment WHERE course_id=$1',
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
router.delete('/:id', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
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
router.post('/:id/questions', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { question_text, question_image_url, option_a, option_b, option_c, option_d, correct_answer_letter, points, question_type } = req.body;
  try {
    if (!(await verifyExamOwnership(req.params.id, teacherId))) {
      return res.status(403).json({ error: 'Access denied: exam not yours' });
    }
    const qType = question_type || 'mcq';
    let optA = option_a, optB = option_b, correctLetter = correct_answer_letter;

    if (qType === 'true_false') {
      optA = 'صح'; optB = 'خطأ';
      correctLetter = correct_answer_letter || 'A';
    }

    const result = await pool.query(
      'INSERT INTO questions (question_text,question_image_url,option_a,option_b,option_c,option_d,correct_answer_letter,points,exam_id,question_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [question_text, question_image_url, optA, optB, option_c, option_d, correctLetter.toUpperCase(), points || 1, req.params.id, qType]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Update question ──
router.put('/questions/:qid', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { question_text, question_image_url, option_a, option_b, option_c, option_d, correct_answer_letter, points, question_type } = req.body;
  try {
    if (!(await verifyQuestionOwnership(req.params.qid, teacherId))) {
      return res.status(403).json({ error: 'Access denied: question not yours' });
    }
    const qType = question_type || 'mcq';
    let optA = option_a, optB = option_b, correctLetter = correct_answer_letter;
    if (qType === 'true_false') { optA = 'صح'; optB = 'خطأ'; }

    const result = await pool.query(
      'UPDATE questions SET question_text=$1,question_image_url=$2,option_a=$3,option_b=$4,option_c=$5,option_d=$6,correct_answer_letter=$7,points=$8,question_type=$9 WHERE id=$10 RETURNING *',
      [question_text, question_image_url, optA, optB, option_c, option_d, correctLetter.toUpperCase(), points || 1, qType, req.params.qid]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Delete question ──
router.delete('/questions/:qid', requireRole('teacher', 'assistant'), checkManageExamsPerm, async (req, res) => {
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
router.get('/retry-requests', requireRole('teacher', 'assistant'), async (req, res) => {
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
        `INSERT INTO notification_log (teacher_id, student_id, recipient_type, message, type, is_read, source, title)
         VALUES ($1, $2, 'student', 'تمت الموافقة على طلب إعادة الاختبار — يمكنك الآن إعادة تأدية الاختبار', 'retry_approved', false, 'platform', 'قبول إعادة اختبار')`,
        [teacherId, row.student_id]
      );
      await pool.query(
        'DELETE FROM exam_sessions WHERE student_id=$1 AND exam_id=$2',
        [row.student_id, row.exam_id]
      );
      sendEvent(`student_${row.student_id}`, 'retry_approved', { examId: row.exam_id });
      sendFCMToStudents(pool, [row.student_id], 'قبول إعادة اختبار', 'تمت الموافقة على طلب إعادة الاختبار — يمكنك الآن إعادة تأدية الاختبار').catch(() => {});
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
       LEFT JOIN exam_results er ON e.id = er.exam_id AND er.student_id = $1
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
  const studentId = req.user.id;
  try {
    const now = new Date();
    const eligibilityCheck = await pool.query(
      `SELECT e.id, e.title, e.duration_minutes, e.total_score, e.pass_score,
              e.start_date, e.end_date, e.shuffle_questions, e.shuffle_options,
              e.question_source, e.bank_id, e.bank_question_count
       FROM exams e
       LEFT JOIN student_course_enrollment sce ON e.course_id = sce.course_id AND sce.student_id = $1
       WHERE e.id = $2
         AND e.is_published = true
         AND e.teacher_id = (SELECT teacher_id FROM students WHERE id = $1)
         AND (e.course_id IS NULL OR sce.status = 'active')`,
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

    let questions;
    if (exam.question_source === 'bank' && exam.bank_id) {
      const bankQRes = await pool.query(
        'SELECT id,question_text,question_image_url,option_a,option_b,option_c,option_d,points,question_type FROM bank_questions WHERE bank_id=$1',
        [exam.bank_id]
      );
      if (bankQRes.rows.length === 0) {
        return res.status(400).json({ error: 'بنك الأسئلة فارغ' });
      }
      const seed = (studentId * 999983 + parseInt(req.params.id) * 999979) >>> 0;
      const shuffled = seededShuffle(bankQRes.rows, seed);
      const count = Math.min(exam.bank_question_count || 10, shuffled.length);
      questions = shuffled.slice(0, count);
    } else {
      const questionsRes = await pool.query(
        'SELECT id,question_text,question_image_url,option_a,option_b,option_c,option_d,points,question_type FROM questions WHERE exam_id=$1 ORDER BY id',
        [req.params.id]
      );
      if (questionsRes.rows.length === 0) {
        return res.status(400).json({ error: 'هذا الاختبار لا يحتوي على أسئلة بعد' });
      }
      questions = questionsRes.rows;
      if (exam.shuffle_questions) {
        const seed = (studentId * 31 + parseInt(req.params.id) * 17) >>> 0;
        questions = seededShuffle(questions, seed);
      }
    }
    // ── Store server-side session: start time + question snapshot ──
    // This prevents timer cheating and bank-question tampering on submit
    try {
      await pool.query(
        `INSERT INTO exam_sessions (student_id, exam_id, started_at, questions_snapshot)
         VALUES ($1, $2, NOW(), $3)
         ON CONFLICT (student_id, exam_id)
         DO UPDATE SET questions_snapshot = EXCLUDED.questions_snapshot`,
        [studentId, req.params.id, JSON.stringify(questions)]
      );
    } catch (_) {}

    res.json({ exam, questions });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Student: submit exam ──
router.post('/:id/submit', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  const examId = req.params.id;
  const { answers } = req.body;

  if (!answers || typeof answers !== 'object' || Array.isArray(answers))
    return res.status(400).json({ error: 'بيانات الإجابات غير صحيحة' });
  if (Object.keys(answers).length > 500)
    return res.status(400).json({ error: 'عدد الإجابات يتجاوز الحد المسموح (500)' });

  // ── Pre-flight eligibility check (outside transaction for speed) ──
  let eligibilityRow, questionsData, serverSession;
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
      // Use stored snapshot to prevent changed-question scoring bug
      if (serverSession?.questions_snapshot?.length > 0) {
        questionsData = serverSession.questions_snapshot.filter(q => questionIds.includes(q.id));
        if (questionsData.length === 0) {
          const bqr = await pool.query('SELECT * FROM bank_questions WHERE id = ANY($1) AND bank_id = $2', [questionIds, eligibilityRow.bank_id]);
          questionsData = bqr.rows;
        }
      } else {
        const bqr = await pool.query('SELECT * FROM bank_questions WHERE id = ANY($1) AND bank_id = $2', [questionIds, eligibilityRow.bank_id]);
        questionsData = bqr.rows;
      }
    } else {
      const qr = await pool.query('SELECT * FROM questions WHERE exam_id=$1', [examId]);
      questionsData = qr.rows;
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
    if (!studentAnswer) { unanswered++; }
    else if (studentAnswer === correctLetter) { score += q.points; correct++; isCorrect = true; }
    else { wrong++; }
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

    // Retry path: deduct old points + remove old result + mark retry as used
    const existingCheck = await client.query(
      'SELECT points_earned FROM exam_results WHERE student_id=$1 AND exam_id=$2 FOR UPDATE',
      [studentId, examId]
    );
    if (existingCheck.rows.length > 0) {
      const oldPts = existingCheck.rows[0].points_earned || 0;
      if (oldPts > 0)
        await client.query('UPDATE students SET points = GREATEST(0, points - $1) WHERE id=$2', [oldPts, studentId]);
      await client.query('DELETE FROM exam_results WHERE student_id=$1 AND exam_id=$2', [studentId, examId]);
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

    // Insert new result
    const resultRow = await client.query(
      'INSERT INTO exam_results (student_id,exam_id,score,correct_count,wrong_count,unanswered_count,start_time,end_time,answers,points_earned) VALUES($1,$2,$3,$4,$5,$6,$7,NOW(),$8,$9) RETURNING *',
      [studentId, examId, normalizedScore, correct, wrong, unanswered, safeStartTime, JSON.stringify(detailedAnswers), pointsEarned]
    );

    if (pointsEarned > 0)
      await client.query('UPDATE students SET points = points + $1 WHERE id=$2', [pointsEarned, studentId]);

    if (passed && exam.badge_name)
      await client.query(
        'INSERT INTO badges (student_id,exam_id,badge_name,badge_color) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [studentId, examId, exam.badge_name, exam.badge_color]
      );

    await client.query('COMMIT');
    invalidateCache(exam.teacher_id);
    res.json({ result: resultRow.rows[0], detailedAnswers, normalizedScore, pointsEarned, pass_score: exam.pass_score });
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
  try {
    const enrollCheck = await pool.query(
      "SELECT id FROM student_course_enrollment WHERE student_id=$1 AND course_id=$2 AND status='active'",
      [req.user.id, req.params.courseId]
    );
    if (!enrollCheck.rows.length)
      return res.status(403).json({ error: 'Access denied: not enrolled in this course' });

    const result = await pool.query(
      `SELECT er.id, er.score, er.correct_count, er.wrong_count, er.unanswered_count,
              er.points_earned, er.created_at,
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
              er.answers,
              s.name  AS student_name,
              e.title AS exam_title, e.total_score, e.pass_score, e.teacher_id AS exam_teacher_id,
              e.question_source, e.bank_id
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

      let isCorrect;
      if (!studentAnswer) {
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
    res.json({ result: resultClean, questions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
