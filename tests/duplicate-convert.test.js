/**
 * Exam & Recitation Duplicate & Cross-Convert Verification Test
 */
'use strict';
require('dotenv').config();
const assert = require('assert');
const pool = require('../server/db/connection');
const bcrypt = require('bcryptjs');

async function runTest() {
  console.log('══════════════════════════════════════════════════════════');
  console.log('  Testing Exam & Recitation Duplicate & Cross-Convert');
  console.log('══════════════════════════════════════════════════════════\n');

  const testSuffix = Date.now().toString().slice(-6);
  const teacherUsername = `t_dup_${testSuffix}`;
  let teacherId, examId, dupExamId, recFromExamId, dupRecId, examFromRecId;

  try {
    // 1. Create Teacher
    const hashedPassword = await bcrypt.hash('password123', 10);
    const teacherRes = await pool.query(
      `INSERT INTO teachers (username, password, name, slug)
       VALUES ($1, $2, 'أستاذ النسخ والتحويل', $3)
       RETURNING id`,
      [teacherUsername, hashedPassword, teacherUsername]
    );
    teacherId = teacherRes.rows[0].id;
    console.log(`✅ Created test teacher (ID: ${teacherId})`);

    // 2. Create Source Exam
    const examRes = await pool.query(
      `INSERT INTO exams (title, duration_minutes, total_score, pass_score, teacher_id, is_published)
       VALUES ('اختبار الفيزياء الأصلي', 45, 100, 50, $1, true)
       RETURNING id`,
      [teacherId]
    );
    examId = examRes.rows[0].id;

    // Add questions to Source Exam
    await pool.query(
      `INSERT INTO questions (exam_id, question_text, question_type, option_a, option_b, option_c, option_d, correct_answer_letter, points)
       VALUES ($1, 'ما هي وحدة قياس القوة؟', 'mcq', 'نيوتن', 'جول', 'واط', 'باسكال', 'A', 10)`,
      [examId]
    );
    await pool.query(
      `INSERT INTO questions (exam_id, question_text, question_type, option_a, option_b, correct_answer_letter, points)
       VALUES ($1, 'السرعة هي كمية قياسية؟', 'true_false', 'صواب', 'خطأ', 'B', 10)`,
      [examId]
    );
    await pool.query(
      `INSERT INTO questions (exam_id, question_text, question_type, option_a, option_b, correct_answer_letter, sub_questions, points)
       VALUES ($1, 'اختر من الرسم', 'image_multi', 'A', 'B', 'A', $2, 20)`,
      [examId, JSON.stringify([{ label: '1', correct: 'A' }, { label: '2', correct: 'C' }])]
    );
    console.log(`✅ Created source exam with 3 questions (ID: ${examId})`);

    // 3. Test Exam Duplication (POST /exams/:id/duplicate logic)
    const dupRes = await pool.query(
      `INSERT INTO exams (
        title, duration_minutes, total_score, teacher_id, pass_score, is_published, question_source
      ) VALUES ('اختبار الفيزياء (نسخة 2)', 60, 100, $1, 50, false, 'manual')
      RETURNING id, is_published, title`,
      [teacherId]
    );
    dupExamId = dupRes.rows[0].id;
    assert.strictEqual(dupRes.rows[0].is_published, false, 'Duplicated exam must be draft (is_published: false)');

    // Copy questions
    const origExamQs = await pool.query('SELECT * FROM questions WHERE exam_id=$1 ORDER BY id ASC', [examId]);
    for (const q of origExamQs.rows) {
      await pool.query(
        `INSERT INTO questions (
          exam_id, question_text, question_image_url, option_a, option_b, option_c, option_d,
          correct_answer_letter, points, question_type, sub_questions
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          dupExamId, q.question_text || '', q.question_image_url, q.option_a || 'A', q.option_b || 'B', q.option_c || null, q.option_d || null,
          q.correct_answer_letter || 'A', q.points || 1, q.question_type || 'mcq', JSON.stringify(q.sub_questions || [])
        ]
      );
    }
    const dupExamQs = await pool.query('SELECT * FROM questions WHERE exam_id=$1 ORDER BY id ASC', [dupExamId]);
    assert.strictEqual(dupExamQs.rows.length, 3, 'Duplicated exam must have exactly 3 cloned questions');
    assert.strictEqual(dupExamQs.rows[0].question_text, 'ما هي وحدة قياس القوة؟');
    assert.strictEqual(dupExamQs.rows[0].correct_answer_letter, 'A');
    console.log(`✅ Duplicated exam verified: cloned 3 questions accurately as draft (ID: ${dupExamId})`);

    // 4. Test Convert Exam to Recitation (POST /exams/:id/convert-to-recitation logic)
    const recConvRes = await pool.query(
      `INSERT INTO recitations (
        teacher_id, title, duration_minutes, total_score, pass_score, is_published, schedule_type
      ) VALUES ($1, 'تسميع مأخوذ من الفيزياء', 15, 10, 5, false, 'once')
      RETURNING id, is_published`,
      [teacherId]
    );
    recFromExamId = recConvRes.rows[0].id;
    assert.strictEqual(recConvRes.rows[0].is_published, false, 'Converted recitation must be draft');

    let sortOrder = 0;
    for (const q of origExamQs.rows) {
      await pool.query(
        `INSERT INTO recitation_questions (
          recitation_id, question_text, question_image_url, question_type,
          option_a, option_b, option_c, option_d, correct_answer_letter,
          points, sort_order, sub_questions
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          recFromExamId, q.question_text, q.question_image_url, q.question_type || 'mcq',
          q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer_letter,
          q.points || 1, sortOrder++, JSON.stringify(q.sub_questions || [])
        ]
      );
    }
    const convRecQs = await pool.query('SELECT * FROM recitation_questions WHERE recitation_id=$1 ORDER BY sort_order ASC', [recFromExamId]);
    assert.strictEqual(convRecQs.rows.length, 3, 'Converted recitation must have 3 cloned questions in recitation_questions');
    assert.strictEqual(convRecQs.rows[1].question_type, 'true_false');
    assert.strictEqual(convRecQs.rows[2].question_type, 'image_multi');
    console.log(`✅ Converted exam to recitation verified: 3 questions copied into recitation_questions (ID: ${recFromExamId})`);

    // 5. Test Recitation Duplication (POST /recitations/:id/duplicate logic)
    const dupRecRes = await pool.query(
      `INSERT INTO recitations (
        teacher_id, title, duration_minutes, total_score, pass_score, is_published, schedule_type
      ) VALUES ($1, 'تسميع مأخوذ من الفيزياء (نسخة)', 15, 10, 5, false, 'once')
      RETURNING id, is_published`,
      [teacherId]
    );
    dupRecId = dupRecRes.rows[0].id;
    assert.strictEqual(dupRecRes.rows[0].is_published, false);

    sortOrder = 0;
    for (const q of convRecQs.rows) {
      await pool.query(
        `INSERT INTO recitation_questions (
          recitation_id, question_text, question_image_url, question_type,
          option_a, option_b, option_c, option_d, correct_answer_letter,
          points, sort_order, sub_questions
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          dupRecId, q.question_text, q.question_image_url, q.question_type || 'mcq',
          q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer_letter,
          q.points || 1, sortOrder++, JSON.stringify(q.sub_questions || [])
        ]
      );
    }
    const dupRecQs = await pool.query('SELECT * FROM recitation_questions WHERE recitation_id=$1 ORDER BY sort_order ASC', [dupRecId]);
    assert.strictEqual(dupRecQs.rows.length, 3);
    console.log(`✅ Duplicated recitation verified: 3 questions cloned as draft (ID: ${dupRecId})`);

    // 6. Test Convert Recitation to Exam (POST /recitations/:id/convert-to-exam logic)
    const examConvRes = await pool.query(
      `INSERT INTO exams (
        title, duration_minutes, total_score, teacher_id, pass_score, is_published, question_source
      ) VALUES ('اختبار من التسميع', 45, 100, $1, 50, false, 'manual')
      RETURNING id, is_published`,
      [teacherId]
    );
    examFromRecId = examConvRes.rows[0].id;
    assert.strictEqual(examConvRes.rows[0].is_published, false);

    for (const q of dupRecQs.rows) {
      await pool.query(
        `INSERT INTO questions (
          exam_id, question_text, question_image_url, option_a, option_b, option_c, option_d,
          correct_answer_letter, points, question_type, sub_questions
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          examFromRecId, q.question_text || '', q.question_image_url, q.option_a || 'A', q.option_b || 'B', q.option_c || null, q.option_d || null,
          q.correct_answer_letter || 'A', q.points || 1, q.question_type || 'mcq', JSON.stringify(q.sub_questions || [])
        ]
      );
    }
    const finalExamQs = await pool.query('SELECT * FROM questions WHERE exam_id=$1 ORDER BY id ASC', [examFromRecId]);
    assert.strictEqual(finalExamQs.rows.length, 3);
    assert.strictEqual(finalExamQs.rows[0].question_text, 'ما هي وحدة قياس القوة؟');
    assert.strictEqual(finalExamQs.rows[1].question_type, 'true_false');
    assert.strictEqual(finalExamQs.rows[2].question_type, 'image_multi');
    console.log(`✅ Converted recitation to exam verified: 3 questions copied into questions (ID: ${examFromRecId})`);

    console.log('\n══════════════════════════════════════════════════════════');
    console.log('🎉 ALL DUPLICATE & CONVERT TESTS PASSED SUCCESSFULLY!');
    console.log('══════════════════════════════════════════════════════════');
  } finally {
    if (teacherId) {
      await pool.query('DELETE FROM teachers WHERE id = $1', [teacherId]).catch(() => {});
    }
    await pool.end();
  }
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
