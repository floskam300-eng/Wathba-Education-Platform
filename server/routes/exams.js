const express = require('express');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const getTeacherId = (req) => req.user.role === 'teacher' ? req.user.id : req.user.teacher_id;

// ── Helper: verify exam belongs to the current teacher/assistant's teacher ──
const verifyExamOwnership = async (examId, teacherId) => {
  const r = await pool.query('SELECT id FROM exams WHERE id=$1 AND teacher_id=$2', [examId, teacherId]);
  return r.rows.length > 0;
};

// ── Helper: verify a question belongs to an exam owned by teacher ──
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
router.post('/', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { title, duration_minutes, total_score, course_id, pass_score, badge_name, badge_color } = req.body;
  try {
    // If course_id provided, verify it belongs to this teacher
    if (course_id) {
      const courseCheck = await pool.query('SELECT id FROM courses WHERE id=$1 AND teacher_id=$2', [course_id, teacherId]);
      if (!courseCheck.rows.length) return res.status(403).json({ error: 'Access denied: course not yours' });
    }
    const result = await pool.query(
      'INSERT INTO exams (title,duration_minutes,total_score,course_id,teacher_id,pass_score,badge_name,badge_color) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [title, duration_minutes || 60, total_score || 100, course_id || null, teacherId, pass_score || 50, badge_name, badge_color || '#FF8C00']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Update exam (already scoped by teacher_id) ──
router.put('/:id', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { title, duration_minutes, total_score, course_id, pass_score, badge_name, badge_color } = req.body;
  try {
    const result = await pool.query(
      'UPDATE exams SET title=$1,duration_minutes=$2,total_score=$3,course_id=$4,pass_score=$5,badge_name=$6,badge_color=$7 WHERE id=$8 AND teacher_id=$9 RETURNING *',
      [title, duration_minutes, total_score, course_id, pass_score, badge_name, badge_color, req.params.id, teacherId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Exam not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Delete exam (already scoped by teacher_id) ──
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

// ── Get questions — FIXED: verify exam ownership ──
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

// ── Add question — FIXED: verify exam ownership ──
router.post('/:id/questions', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { question_text, question_image_url, option_a, option_b, option_c, option_d, correct_answer_letter, points } = req.body;
  try {
    if (!(await verifyExamOwnership(req.params.id, teacherId))) {
      return res.status(403).json({ error: 'Access denied: exam not yours' });
    }
    const result = await pool.query(
      'INSERT INTO questions (question_text,question_image_url,option_a,option_b,option_c,option_d,correct_answer_letter,points,exam_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [question_text, question_image_url, option_a, option_b, option_c, option_d, correct_answer_letter.toUpperCase(), points || 1, req.params.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Update question — FIXED: verify question belongs to teacher's exam ──
router.put('/questions/:qid', requireRole('teacher', 'assistant'), async (req, res) => {
  const teacherId = getTeacherId(req);
  const { question_text, question_image_url, option_a, option_b, option_c, option_d, correct_answer_letter, points } = req.body;
  try {
    if (!(await verifyQuestionOwnership(req.params.qid, teacherId))) {
      return res.status(403).json({ error: 'Access denied: question not yours' });
    }
    const result = await pool.query(
      'UPDATE questions SET question_text=$1,question_image_url=$2,option_a=$3,option_b=$4,option_c=$5,option_d=$6,correct_answer_letter=$7,points=$8 WHERE id=$9 RETURNING *',
      [question_text, question_image_url, option_a, option_b, option_c, option_d, correct_answer_letter.toUpperCase(), points || 1, req.params.qid]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Delete question — FIXED: verify question belongs to teacher's exam ──
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

// ── Student: list available exams ──
router.get('/student/available', requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.title, e.duration_minutes, e.total_score, e.pass_score, e.badge_name, c.name as course_name,
              er.id as already_taken, er.score
       FROM exams e
       LEFT JOIN courses c ON e.course_id = c.id
       LEFT JOIN student_course_enrollment sce ON e.course_id = sce.course_id AND sce.student_id = $1
       LEFT JOIN exam_results er ON e.id = er.exam_id AND er.student_id = $1
       WHERE e.teacher_id = (SELECT teacher_id FROM students WHERE id = $1)
         AND (e.course_id IS NULL OR sce.student_id IS NOT NULL)`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Student: take exam — FIXED: verify exam belongs to student's teacher + enrollment ──
router.get('/:id/take', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  try {
    // Exam must belong to student's teacher, and if course-linked, student must be enrolled
    const eligibilityCheck = await pool.query(
      `SELECT e.id, e.title, e.duration_minutes, e.total_score, e.pass_score
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
    const questions = await pool.query(
      'SELECT id,question_text,question_image_url,option_a,option_b,option_c,option_d,points FROM questions WHERE exam_id=$1 ORDER BY id',
      [req.params.id]
    );
    res.json({ exam: eligibilityCheck.rows[0], questions: questions.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Student: submit exam — FIXED: verify eligibility before accepting submission ──
router.post('/:id/submit', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  const examId = req.params.id;
  const { answers, start_time } = req.body;

  try {
    // Verify student is eligible for this exam
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
      const studentAnswer = answers[q.id];
      let isCorrect = false;
      if (!studentAnswer) {
        unanswered++;
      } else if (studentAnswer === q.correct_answer_letter) {
        score += q.points;
        correct++;
        isCorrect = true;
      } else {
        wrong++;
      }
      return { question_id: q.id, student_answer: studentAnswer, correct_answer: q.correct_answer_letter, is_correct: isCorrect };
    });

    const totalPoints = questions.reduce((s, q) => s + q.points, 0);
    const normalizedScore = totalPoints > 0 ? Math.round((score / totalPoints) * exam.total_score) : 0;
    const pointsEarned = correct * 10;

    const result = await pool.query(
      'INSERT INTO exam_results (student_id,exam_id,score,correct_count,wrong_count,unanswered_count,start_time,end_time,answers,points_earned) VALUES($1,$2,$3,$4,$5,$6,$7,NOW(),$8,$9) RETURNING *',
      [studentId, examId, normalizedScore, correct, wrong, unanswered, start_time, JSON.stringify(detailedAnswers), pointsEarned]
    );

    await pool.query('UPDATE students SET points = points + $1 WHERE id = $2', [pointsEarned, studentId]);

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

// ── Get result summary — FIXED: ownership check ──
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

// ── Full exam review: questions + student answers (already had ownership check) ──
router.get('/results/:resultId/review', authenticate, async (req, res) => {
  try {
    const resultRes = await pool.query(
      `SELECT er.id, er.student_id, er.exam_id, er.score, er.correct_count, er.wrong_count,
              er.unanswered_count, er.points_earned, er.start_time, er.end_time, er.created_at,
              er.answers,
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

    let storedAnswers = [];
    try {
      storedAnswers = typeof row.answers === 'string'
        ? JSON.parse(row.answers)
        : (Array.isArray(row.answers) ? row.answers : []);
    } catch (_) {}
    const answerMap = {};
    storedAnswers.forEach(a => { answerMap[String(a.question_id)] = a; });

    const questions = questionsRes.rows.map(q => {
      const stored = answerMap[String(q.id)];
      return {
        ...q,
        student_answer: stored?.student_answer || null,
        correct_answer: q.correct_answer_letter,
        is_correct:     stored?.is_correct     || false,
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
