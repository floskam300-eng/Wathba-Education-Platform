const { sendEvent } = require('../sse');
const { invalidateCache } = require('./analyticsCache');

const VALID_ANSWER_LETTERS = new Set(['A', 'B', 'C', 'D']);

/**
 * Pure function to calculate score, counts, and detailed answers
 * for a given list of recitation questions and the student's answers.
 * Accepts answers as either an object ({ [qid]: val }) or array ([{ question_id, answer }]).
 */
function calculateRecitationScore(snapshot, answersPayload, rec) {
  const answerMap = {};
  if (Array.isArray(answersPayload)) {
    for (const a of answersPayload) {
      if (a && a.question_id) answerMap[a.question_id] = a.answer;
    }
  } else if (answersPayload && typeof answersPayload === 'object') {
    Object.assign(answerMap, answersPayload);
  }

  let rawScore = 0;
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;

  const questionsList = Array.isArray(snapshot) ? snapshot : [];

  for (const q of questionsList) {
    let studentAns = answerMap[q.id];
    if (studentAns !== null && studentAns !== undefined && typeof studentAns !== 'object') {
      studentAns = String(studentAns).trim().toUpperCase();
    }

    if (q.question_type === 'image_multi') {
      const subQs = Array.isArray(q.sub_questions) ? q.sub_questions : [];
      if (!subQs.length) { unanswered++; continue; }

      let parsedAns = {};
      if (studentAns) {
        if (typeof studentAns === 'object') {
          parsedAns = studentAns;
        } else {
          try { parsedAns = JSON.parse(studentAns); } catch { parsedAns = {}; }
        }
      }

      let questionEarnedPoints = 0;
      for (const sub of subQs) {
        const rawStudentSubAns = String(parsedAns[sub.label] || '').toUpperCase();
        const rawSubCorrect = String(sub.correct || '').toUpperCase();
        const a = (sub.type === 'true_false' || rawStudentSubAns === 'T' || rawStudentSubAns === 'F')
          ? (rawStudentSubAns === 'T' ? 'A' : rawStudentSubAns === 'F' ? 'B' : rawStudentSubAns)
          : rawStudentSubAns;
        const subCorrectNorm = (sub.type === 'true_false' || rawSubCorrect === 'T' || rawSubCorrect === 'F')
          ? (rawSubCorrect === 'T' ? 'A' : rawSubCorrect === 'F' ? 'B' : rawSubCorrect)
          : rawSubCorrect;

        if (!a || !VALID_ANSWER_LETTERS.has(a)) {
          unanswered++;
        } else if (a === subCorrectNorm) {
          correct++;
          const subPoints = sub.points !== undefined ? (parseInt(sub.points) || 1) : ((q.points || 1) / subQs.length);
          questionEarnedPoints += subPoints;
        } else {
          wrong++;
        }
      }

      rawScore += questionEarnedPoints;
      continue;
    }

    let finalStudentAns = typeof studentAns === 'string' ? studentAns : null;
    let finalCorrectAns = q.correct_answer_letter ? String(q.correct_answer_letter).toUpperCase() : null;
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
      rawScore += (parseInt(q.points) || 1);
    } else {
      wrong++;
    }
  }

  // Compute total points across all questions/sub-questions
  const totalPoints = questionsList.reduce((s, q) => {
    if (q.question_type === 'image_multi') {
      const subQs = Array.isArray(q.sub_questions) ? q.sub_questions : [];
      if (subQs.length > 0) {
        const subTotal = subQs.reduce((sp, sub) => {
          return sp + (sub.points !== undefined && parseInt(sub.points) >= 0
            ? (parseInt(sub.points) || 1)
            : ((q.points || 1) / subQs.length));
        }, 0);
        return s + subTotal;
      }
    }
    return s + (parseInt(q.points) || 1);
  }, 0);

  const totalScore = parseInt(rec?.total_score) || 100;
  const finalScore = totalPoints > 0
    ? Math.min(totalScore, Math.round((rawScore / totalPoints) * totalScore))
    : 0;
  const passScore = parseInt(rec?.pass_score) || 50;
  const passed = finalScore >= passScore;

  let pointsEarned = parseInt(rec?.points_on_attempt) || 0;
  if (passed) pointsEarned += (parseInt(rec?.points_on_pass) || 0);

  // Build stored answers array for recitation_results
  const storedAnswers = questionsList.map(q => {
    const rawStudentAns = answerMap[q.id];
    const ans = (rawStudentAns && typeof rawStudentAns === 'object')
      ? JSON.stringify(rawStudentAns)
      : (rawStudentAns ? String(rawStudentAns).trim().toUpperCase() : null);

    let isCorrect = false;
    if (q.question_type === 'image_multi') {
      const subQs = Array.isArray(q.sub_questions) ? q.sub_questions : [];
      if (subQs.length > 0 && ans) {
        let parsed = {};
        try { parsed = typeof rawStudentAns === 'object' ? rawStudentAns : JSON.parse(ans); } catch { }
        isCorrect = subQs.every(sub => {
          const rawSubSa = String(parsed[sub.label] || '').toUpperCase();
          const rawSubCorrect = String(sub.correct || '').toUpperCase();
          const aVal = (sub.type === 'true_false' || rawSubSa === 'T' || rawSubSa === 'F')
            ? (rawSubSa === 'T' ? 'A' : rawSubSa === 'F' ? 'B' : rawSubSa)
            : rawSubSa;
          const subCorrectVal = (sub.type === 'true_false' || rawSubCorrect === 'T' || rawSubCorrect === 'F')
            ? (rawSubCorrect === 'T' ? 'A' : rawSubCorrect === 'F' ? 'B' : rawSubCorrect)
            : rawSubCorrect;
          return aVal && aVal === subCorrectVal;
        });
      }
      return {
        question_id: q.id,
        answer: ans,
        student_answer: ans,
        correct_answer: null,
        correct: isCorrect,
        is_correct: isCorrect,
        question_type: q.question_type,
      };
    }

    let checkStudentAns = ans;
    let checkCorrectAns = q.correct_answer_letter ? String(q.correct_answer_letter).toUpperCase() : null;
    if (q.question_type === 'true_false') {
      if (checkStudentAns === 'T') checkStudentAns = 'A';
      if (checkStudentAns === 'F') checkStudentAns = 'B';
      if (checkCorrectAns === 'T') checkCorrectAns = 'A';
      if (checkCorrectAns === 'F') checkCorrectAns = 'B';
    }
    isCorrect = Boolean(checkStudentAns && checkStudentAns === checkCorrectAns);

    return {
      question_id: q.id,
      answer: checkStudentAns,
      student_answer: checkStudentAns,
      correct_answer: checkCorrectAns,
      correct: isCorrect,
      is_correct: isCorrect,
      question_type: q.question_type || 'mcq',
    };
  });

  return {
    rawScore,
    totalPoints,
    finalScore,
    passed,
    correct,
    wrong,
    unanswered,
    pointsEarned,
    storedAnswers,
  };
}

/**
 * Auto-submits an expired recitation session using any saved answers.
 * Returns the created recitation_result or null.
 */
async function autoSubmitExpiredRecitationSession(poolOrClient, session, recitation = null, studentIdParam = null, recitationIdParam = null) {
  const isPool = typeof poolOrClient.connect === 'function';
  const client = isPool ? await poolOrClient.connect() : poolOrClient;

  try {
    if (isPool) await client.query('BEGIN');

    const sess = session || {};
    const studentId = studentIdParam || sess.student_id;
    const recitationId = recitationIdParam || sess.recitation_id;

    if (!studentId || !recitationId) {
      if (isPool) await client.query('ROLLBACK');
      return null;
    }

    let fullRec = recitation;
    if (!fullRec) {
      const rRes = await client.query('SELECT * FROM recitations WHERE id=$1', [recitationId]);
      if (rRes.rows.length) {
        fullRec = rRes.rows[0];
      }
    }

    // Check if result already exists for current window
    const { rows: existingCheck } = await client.query(
      `SELECT id FROM recitation_results
        WHERE student_id=$1 AND recitation_id=$2
          AND (
            $3 = 'once'
            OR $4::timestamptz IS NULL
            OR created_at >= $4::timestamptz
          )
          AND (is_absent IS NULL OR is_absent=false)`,
      [studentId, recitationId, fullRec?.schedule_type || 'once', fullRec?.start_date]
    );

    if (existingCheck.length > 0) {
      await client.query('DELETE FROM recitation_sessions WHERE student_id=$1 AND recitation_id=$2', [studentId, recitationId]);
      if (isPool) await client.query('COMMIT');
      return null;
    }

    const snapshot = Array.isArray(sess.questions_snapshot) ? sess.questions_snapshot : [];

    const {
      finalScore,
      passed,
      correct,
      wrong,
      unanswered,
      pointsEarned,
      storedAnswers,
    } = calculateRecitationScore(snapshot, sess.answers || {}, fullRec);

    const startedAt = sess.started_at || new Date();

    const insertRes = await client.query(
      `INSERT INTO recitation_results
         (student_id, recitation_id, score, correct_count, wrong_count, unanswered_count, answers, points_earned, start_time, end_time, passed, is_absent, questions_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, false, $11)
       RETURNING *`,
      [studentId, recitationId, finalScore, correct, wrong, unanswered, JSON.stringify(storedAnswers), pointsEarned, startedAt, passed, JSON.stringify(snapshot)]
    );

    if (pointsEarned > 0) {
      await client.query('UPDATE students SET points = points + $1 WHERE id=$2', [pointsEarned, studentId]);
    }

    // Update streak if passed
    if (passed) {
      const today = new Date().toISOString().slice(0, 10);
      await client.query(
        `INSERT INTO recitation_streaks (student_id, current_streak, best_streak, last_recitation_date)
         VALUES ($1, 1, 1, $2)
         ON CONFLICT (student_id) DO UPDATE SET
           current_streak = CASE
             WHEN recitation_streaks.last_recitation_date = $2 THEN recitation_streaks.current_streak
             WHEN recitation_streaks.last_recitation_date = ($2::date - INTERVAL '1 day')::date THEN recitation_streaks.current_streak + 1
             ELSE 1
           END,
           best_streak = CASE
             WHEN recitation_streaks.last_recitation_date = $2 THEN recitation_streaks.best_streak
             WHEN recitation_streaks.last_recitation_date = ($2::date - INTERVAL '1 day')::date
               AND recitation_streaks.current_streak + 1 > recitation_streaks.best_streak
               THEN recitation_streaks.current_streak + 1
             ELSE recitation_streaks.best_streak
           END,
           last_recitation_date = $2`,
        [studentId, today]
      );
    }

    await client.query('DELETE FROM recitation_sessions WHERE student_id=$1 AND recitation_id=$2', [studentId, recitationId]);

    await client.query('COMMIT');

    if (fullRec?.teacher_id) {
      invalidateCache(fullRec.teacher_id);
      sendEvent(`teacher_${fullRec.teacher_id}`, 'recitation_result_submitted', { recitationId, studentId });
      pool.query('SELECT id FROM assistants WHERE teacher_id=$1', [fullRec.teacher_id])
        .then(({ rows }) => {
          for (const assistant of rows) {
            sendEvent(`assistant_${assistant.id}`, 'recitation_result_submitted', { recitationId, studentId });
          }
        })
        .catch(() => {});
    }

    console.log(`[RecitationScoring] Expired recitation auto-submitted: student=${studentId}, recitation=${recitationId}, score=${finalScore}/${fullRec?.total_score || 100}, correct=${correct}, wrong=${wrong}, unanswered=${unanswered}`);
    return insertRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  calculateRecitationScore,
  autoSubmitExpiredRecitationSession,
};
