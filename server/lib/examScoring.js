const { sendEvent } = require('../sse');
const { invalidateCache } = require('./analyticsCache');

/**
 * Pure function to calculate score, counts, and detailed answers
 * for a given list of questions and the student's answers dictionary.
 */
function calculateExamScore(questionsData, answersPayload, exam) {
  let answers = {};
  if (answersPayload && typeof answersPayload === 'object') {
    answers = answersPayload;
  }
  let score = 0, correct = 0, wrong = 0, unanswered = 0;
  const detailedAnswers = (questionsData || []).map(q => {
    const rawAnswer = answers[q.id];
    const qType = q.question_type || 'mcq';
    let isCorrect = false;

    if (qType === 'image_multi') {
      const subQs = Array.isArray(q.sub_questions) ? q.sub_questions : [];
      let parsedAns = {};
      if (rawAnswer && typeof rawAnswer === 'object') parsedAns = rawAnswer;
      else { try { parsedAns = JSON.parse(rawAnswer || '{}'); } catch {} }
      const hasAnswer = Object.keys(parsedAns).length > 0;
      const studentAnswerStr = hasAnswer ? JSON.stringify(parsedAns) : null;

      let questionEarnedPoints = 0;
      let allCorrect = subQs.length > 0;
      for (const sub of subQs) {
        const rawSubCorrect = String(sub.correct || '').toUpperCase();
        const rawStudentSubAns = String(parsedAns[sub.label] || '').toUpperCase();
        const subCorrect = (sub.type === 'true_false' || rawSubCorrect === 'T' || rawSubCorrect === 'F')
          ? (rawSubCorrect === 'T' ? 'A' : rawSubCorrect === 'F' ? 'B' : rawSubCorrect)
          : rawSubCorrect;
        const studentSubAns = (sub.type === 'true_false' || rawStudentSubAns === 'T' || rawStudentSubAns === 'F')
          ? (rawStudentSubAns === 'T' ? 'A' : rawStudentSubAns === 'F' ? 'B' : rawStudentSubAns)
          : rawStudentSubAns;

        if (!studentSubAns) {
          unanswered++;
          allCorrect = false;
        } else if (studentSubAns === subCorrect) {
          correct++;
          const subPoints = sub.points !== undefined ? (parseInt(sub.points) || 1) : (q.points / (subQs.length || 1));
          questionEarnedPoints += subPoints;
        } else {
          wrong++;
          allCorrect = false;
        }
      }
      score += questionEarnedPoints;
      isCorrect = allCorrect && subQs.length > 0;
      return { question_id: q.id, student_answer: studentAnswerStr, correct_answer: null, is_correct: isCorrect, question_type: qType };
    }

    let studentAnswer = rawAnswer ? String(rawAnswer).toUpperCase() : null;
    let correctLetter = q.correct_answer_letter ? q.correct_answer_letter.toUpperCase() : null;
    if (qType === 'true_false') {
      if (studentAnswer === 'T') studentAnswer = 'A';
      if (studentAnswer === 'F') studentAnswer = 'B';
      if (correctLetter === 'T') correctLetter = 'A';
      if (correctLetter === 'F') correctLetter = 'B';
    }

    if (!studentAnswer) {
      unanswered++;
    } else if (studentAnswer === correctLetter) {
      score += (parseInt(q.points) || 1);
      correct++;
      isCorrect = true;
    } else {
      wrong++;
    }
    return { question_id: q.id, student_answer: studentAnswer, correct_answer: correctLetter, is_correct: isCorrect, question_type: qType };
  });

  const totalPoints = (questionsData || []).reduce((s, q) => s + (parseInt(q.points) || 1), 0);
  const examTotalScore = parseInt(exam?.total_score) || 100;
  const normalizedScore = totalPoints > 0 ? Math.round((score / totalPoints) * examTotalScore) : 0;
  const passScore = parseInt(exam?.pass_score) || 50;
  const passed = normalizedScore >= passScore;

  return {
    score,
    normalizedScore,
    correct,
    wrong,
    unanswered,
    detailedAnswers,
    passed,
  };
}

/**
 * Auto-submits an expired exam session by evaluating saved answers against
 * the exam questions snapshot instead of arbitrarily giving 0.
 */
async function autoSubmitExpiredExamSession(pool, sess, examRow, studentId, examId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if a valid non-absent result was already submitted for this exam
    const existingRes = await client.query(
      'SELECT id, points_earned, attempt_number, is_absent FROM exam_results WHERE student_id=$1 AND exam_id=$2 AND is_latest=true FOR UPDATE',
      [studentId, examId]
    );

    let nextAttemptNumber = 1;
    if (existingRes.rows.length > 0) {
      const isAbsentRow = existingRes.rows[0].is_absent === true;
      if (!isAbsentRow) {
        // Already recorded a real submission — clean up orphaned session and exit
        await client.query('DELETE FROM exam_sessions WHERE student_id=$1 AND exam_id=$2', [studentId, examId]);
        await client.query('COMMIT');
        return null;
      }
      nextAttemptNumber = (existingRes.rows[0].attempt_number || 1) + 1;
      await client.query(
        'UPDATE exam_results SET is_latest=false WHERE student_id=$1 AND exam_id=$2',
        [studentId, examId]
      );
    }

    // Resolve full exam info if not fully provided in examRow
    let fullExam = examRow;
    if (!fullExam?.teacher_id || fullExam?.total_score === undefined) {
      const exRes = await client.query(
        'SELECT id, title, total_score, pass_score, points_on_pass, points_on_attempt, badge_name, badge_color, teacher_id, question_source, bank_id, duration_minutes FROM exams WHERE id=$1',
        [examId]
      );
      if (exRes.rows.length) {
        fullExam = exRes.rows[0];
      }
    }

    // Resolve questions data
    let questionsData = [];
    const snapshot = Array.isArray(sess.questions_snapshot) ? sess.questions_snapshot : [];

    if (fullExam?.question_source === 'bank' && fullExam?.bank_id) {
      questionsData = snapshot;
    } else {
      if (snapshot.length > 0) {
        const snapshotIds = snapshot.map(q => q.id);
        const qr = await client.query(
          'SELECT id, question_type, correct_answer_letter, points, sub_questions FROM questions WHERE exam_id=$1 AND id = ANY($2)',
          [examId, snapshotIds]
        );
        const snapSubQsMap = {};
        snapshot.forEach(sq => {
          if (sq.question_type === 'image_multi') snapSubQsMap[sq.id] = sq.sub_questions;
        });
        questionsData = qr.rows.map(q =>
          (q.question_type === 'image_multi' && snapSubQsMap[q.id])
            ? { ...q, sub_questions: snapSubQsMap[q.id] }
            : q
        );
      } else {
        const qr = await client.query(
          'SELECT id, question_type, correct_answer_letter, points, sub_questions FROM questions WHERE exam_id=$1 ORDER BY id',
          [examId]
        );
        questionsData = qr.rows;
      }
    }

    // Grade student's stored answers from the session
    const {
      normalizedScore,
      correct,
      wrong,
      unanswered,
      detailedAnswers,
      passed,
    } = calculateExamScore(questionsData, sess.answers || {}, fullExam);

    const passPoints = fullExam?.points_on_pass || 0;
    const pointsEarned = passed ? passPoints : 0; // No early lock bonus on timeout

    const startedAt = sess.started_at || new Date();

    const insertRes = await client.query(
      `INSERT INTO exam_results
         (student_id, exam_id, score, correct_count, wrong_count, unanswered_count, start_time, end_time, answers, points_earned, attempt_number, is_latest, is_absent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, true, false)
       RETURNING *`,
      [studentId, examId, normalizedScore, correct, wrong, unanswered, startedAt, JSON.stringify(detailedAnswers), pointsEarned, nextAttemptNumber]
    );

    if (pointsEarned > 0) {
      await client.query('UPDATE students SET points = points + $1 WHERE id=$2', [pointsEarned, studentId]);
    }

    if (passed && fullExam?.badge_name) {
      await client.query(
        'INSERT INTO badges (student_id, exam_id, badge_name, badge_color) VALUES($1, $2, $3, $4) ON CONFLICT (student_id, exam_id) DO UPDATE SET badge_name=EXCLUDED.badge_name, badge_color=EXCLUDED.badge_color',
        [studentId, examId, fullExam.badge_name, fullExam.badge_color]
      );
    }

    await client.query('DELETE FROM exam_sessions WHERE student_id=$1 AND exam_id=$2', [studentId, examId]);

    await client.query('COMMIT');

    if (fullExam?.teacher_id) {
      invalidateCache(fullExam.teacher_id);
      sendEvent(`teacher_${fullExam.teacher_id}`, 'exam_result_submitted', { examId, studentId });
      pool.query('SELECT id FROM assistants WHERE teacher_id=$1', [fullExam.teacher_id])
        .then(({ rows }) => {
          for (const assistant of rows) {
            sendEvent(`assistant_${assistant.id}`, 'exam_result_submitted', { examId, studentId });
          }
        })
        .catch(() => {});
    }

    console.log(`[ExamScoring] Expired exam auto-submitted: student=${studentId}, exam=${examId}, score=${normalizedScore}/${fullExam?.total_score || 100}, correct=${correct}, wrong=${wrong}, unanswered=${unanswered}`);
    return insertRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  calculateExamScore,
  autoSubmitExpiredExamSession,
};
