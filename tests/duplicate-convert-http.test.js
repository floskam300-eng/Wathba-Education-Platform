/**
 * HTTP Integration Test for Duplicate & Convert API Routes
 */
'use strict';
require('dotenv').config();
const assert = require('assert');
const pool = require('../server/db/connection');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'wathba_jwt_secret_key_2024';
const BASE_URL = 'http://127.0.0.1:3001/api';

async function runHttpTest() {
  console.log('══════════════════════════════════════════════════════════');
  console.log('  Testing HTTP API Duplicate & Convert Endpoints');
  console.log('══════════════════════════════════════════════════════════\n');

  const testSuffix = Date.now().toString().slice(-6);
  const teacherUsername = `t_http_${testSuffix}`;
  let teacherId, token;

  try {
    const hashedPassword = await bcrypt.hash('password123', 10);
    const teacherRes = await pool.query(
      `INSERT INTO teachers (username, password, name, slug)
       VALUES ($1, $2, 'أستاذ الاختبارات', $3)
       RETURNING id`,
      [teacherUsername, hashedPassword, teacherUsername]
    );
    teacherId = teacherRes.rows[0].id;
    token = jwt.sign({ id: teacherId, role: 'teacher', teacher_id: teacherId }, JWT_SECRET, { expiresIn: '1h' });

    // 1. Create Exam
    const examRes = await pool.query(
      `INSERT INTO exams (title, duration_minutes, total_score, pass_score, teacher_id, is_published)
       VALUES ('اختبار الكيمياء الأصلي', 45, 100, 50, $1, true)
       RETURNING id`,
      [teacherId]
    );
    const examId = examRes.rows[0].id;
    await pool.query(
      `INSERT INTO questions (exam_id, question_text, question_type, option_a, option_b, option_c, option_d, correct_answer_letter, points)
       VALUES ($1, 'ما هو الرمز الكيميائي للماء؟', 'mcq', 'H2O', 'CO2', 'NaCl', 'O2', 'A', 5)`,
      [examId]
    );

    // 2. HTTP POST /exams/:id/duplicate
    const dupRes = await fetch(`${BASE_URL}/exams/${examId}/duplicate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: 'اختبار الكيمياء (نسخة عبر HTTP)',
        duration_minutes: 50,
        total_score: 100,
        pass_score: 50,
      }),
    });
    const dupData = await dupRes.json();
    assert.strictEqual(dupRes.status, 201, `Duplicate exam should return 201, got ${dupRes.status}: ${JSON.stringify(dupData)}`);
    assert.strictEqual(dupData.title, 'اختبار الكيمياء (نسخة عبر HTTP)');
    assert.strictEqual(dupData.is_published, false);
    console.log('✅ HTTP POST /exams/:id/duplicate returned 201');

    // 3. HTTP POST /exams/:id/convert-to-recitation
    const convRecRes = await fetch(`${BASE_URL}/exams/${examId}/convert-to-recitation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: 'تسميع كيمياء من الاختبار',
        duration_minutes: 10,
        total_score: 10,
        pass_score: 5,
      }),
    });
    const convRecData = await convRecRes.json();
    assert.strictEqual(convRecRes.status, 201, `Convert exam to recitation should return 201, got ${convRecRes.status}: ${JSON.stringify(convRecData)}`);
    assert.strictEqual(convRecData.title, 'تسميع كيمياء من الاختبار');
    assert.strictEqual(convRecData.is_published, false);
    console.log('✅ HTTP POST /exams/:id/convert-to-recitation returned 201');

    const recitationId = convRecData.id;

    // 4. HTTP POST /recitations/:id/duplicate
    const dupRecHttpRes = await fetch(`${BASE_URL}/recitations/${recitationId}/duplicate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: 'تسميع كيمياء (نسخة مكررة)',
        duration_minutes: 10,
        total_score: 10,
        pass_score: 5,
      }),
    });
    const dupRecData = await dupRecHttpRes.json();
    assert.strictEqual(dupRecHttpRes.status, 201, `Duplicate recitation should return 201, got ${dupRecHttpRes.status}`);
    assert.strictEqual(dupRecData.title, 'تسميع كيمياء (نسخة مكررة)');
    assert.strictEqual(dupRecData.is_published, false);
    console.log('✅ HTTP POST /recitations/:id/duplicate returned 201');

    // 5. HTTP POST /recitations/:id/convert-to-exam
    const convExamHttpRes = await fetch(`${BASE_URL}/recitations/${recitationId}/convert-to-exam`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: 'اختبار تم تحويله من التسميع',
        duration_minutes: 60,
        total_score: 100,
        pass_score: 50,
      }),
    });
    const convExamData = await convExamHttpRes.json();
    assert.strictEqual(convExamHttpRes.status, 201, `Convert recitation to exam should return 201, got ${convExamHttpRes.status}`);
    assert.strictEqual(convExamData.title, 'اختبار تم تحويله من التسميع');
    assert.strictEqual(convExamData.is_published, false);
    console.log('✅ HTTP POST /recitations/:id/convert-to-exam returned 201');

    console.log('\n══════════════════════════════════════════════════════════');
    console.log('🎉 ALL HTTP API ENDPOINT TESTS PASSED SUCCESSFULLY!');
    console.log('══════════════════════════════════════════════════════════');
  } finally {
    if (teacherId) {
      await pool.query('DELETE FROM teachers WHERE id = $1', [teacherId]).catch(() => {});
    }
    await pool.end();
  }
}

runHttpTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
