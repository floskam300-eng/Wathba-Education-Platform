require('dotenv').config();
const pool = require('./connection');

async function fixAnswers() {
  const client = await pool.connect();
  try {
    // Get all results with old object format
    const resultsRes = await client.query(`
      SELECT er.id, er.answers, er.exam_id
      FROM exam_results er
      WHERE jsonb_typeof(er.answers) = 'object'
      ORDER BY er.id
    `);

    if (resultsRes.rows.length === 0) {
      console.log('✅ كل البيانات بالصيغة الصحيحة بالفعل');
      return;
    }

    console.log(`🔧 تحويل ${resultsRes.rows.length} نتيجة إلى الصيغة الصحيحة...`);

    // Get questions for all affected exams
    const examIds = [...new Set(resultsRes.rows.map(r => r.exam_id))];
    const questionsRes = await client.query(
      `SELECT id, exam_id, correct_answer_letter, question_type, points
       FROM questions
       WHERE exam_id = ANY($1)
       ORDER BY exam_id, id`,
      [examIds]
    );

    // Group questions by exam_id (ordered by id = their position)
    const questionsByExam = {};
    for (const q of questionsRes.rows) {
      if (!questionsByExam[q.exam_id]) questionsByExam[q.exam_id] = [];
      questionsByExam[q.exam_id].push(q);
    }

    let fixed = 0;
    for (const row of resultsRes.rows) {
      const oldAnswers = row.answers; // {"1":"a","2":"b",...}
      const questions  = questionsByExam[row.exam_id] || [];

      // Convert to proper array format
      const newAnswers = questions.map((q, idx) => {
        const seqKey      = String(idx + 1);
        const rawAns      = oldAnswers[seqKey];
        const studentAns  = rawAns ? String(rawAns).toUpperCase() : null;
        const correctAns  = q.correct_answer_letter ? q.correct_answer_letter.toUpperCase() : null;
        const qType       = q.question_type || 'mcq';
        let isCorrect;

        if (qType === 'essay') {
          isCorrect = null;
        } else if (!studentAns) {
          isCorrect = false;
        } else {
          isCorrect = studentAns === correctAns;
        }

        return {
          question_id:    q.id,
          student_answer: studentAns,
          correct_answer: correctAns,
          is_correct:     isCorrect,
          question_type:  qType,
        };
      });

      await client.query(
        'UPDATE exam_results SET answers = $1 WHERE id = $2',
        [JSON.stringify(newAnswers), row.id]
      );
      fixed++;
    }

    console.log(`✅ تم تحويل ${fixed} نتيجة إلى الصيغة الصحيحة`);

    // Verify
    const check = await client.query(`
      SELECT COUNT(*) as old_count
      FROM exam_results
      WHERE jsonb_typeof(answers) = 'object'
    `);
    console.log('🔍 نتائج بصيغة قديمة متبقية:', check.rows[0].old_count);

  } catch (err) {
    console.error('❌ خطأ:', err.message);
    console.error(err.stack);
  } finally {
    client.release();
    process.exit(0);
  }
}

fixAnswers();
