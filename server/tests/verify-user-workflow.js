/**
 * verify-user-workflow.js
 * =======================
 * Integration verification script to verify that:
 *  1. Adding a Course
 *  2. Adding a Recitation
 *  3. Creating a Question Bank and adding questions
 *  4. Creating an Exam using the Question Bank
 * all work flawlessly in a unified user flow.
 *
 * Run:
 *   node server/tests/verify-user-workflow.js
 */

'use strict';

require('dotenv').config();

const path   = require('path');
const fs     = require('fs');
const http   = require('http');
const pool   = require('../db/connection');
const bcrypt = require('bcryptjs');

let passed = 0, failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
  passed++;
}

function jsonRequest(method, urlPath, bodyObj, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(bodyObj);
    const opts = {
      hostname: 'localhost', port: 3001, path: urlPath, method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-Tenant-Slug': '_test_workflow_teacher', // must match the teacher's slug
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch (_) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║   WATHBA — Core Platform Workflow Verification   ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  const TEST_USER = '_test_workflow_teacher';
  const TEST_PASS = 'WorkflowTest_2026!';
  let TOKEN = null;
  let TEACHER_ID = null;

  // Cleanup any old test teachers/data from failed runs
  await pool.query('DELETE FROM teachers WHERE username = $1', [TEST_USER]);

  try {
    // 1. Create a test teacher in the database
    const hashed = await bcrypt.hash(TEST_PASS, 10);
    const insertRes = await pool.query(
      `INSERT INTO teachers (username, password, name, slug) VALUES ($1, $2, 'Workflow Test Teacher', $3) RETURNING id`,
      [TEST_USER, hashed, TEST_USER]
    );
    TEACHER_ID = insertRes.rows[0].id;
    console.log(`[setup] Created test teacher (ID: ${TEACHER_ID})`);

    // 2. Log in to retrieve JWT
    const loginRes = await jsonRequest('POST', '/api/auth/login', {
      username: TEST_USER,
      password: TEST_PASS,
      role: 'teacher'
    });
    assert(loginRes.status === 200, `Login failed: ${loginRes.status}`);
    TOKEN = loginRes.body.token;
    console.log('✅ 1. Teacher Logged in Successfully');

    // 3. Create a Course
    const courseRes = await jsonRequest('POST', '/api/courses', {
      name: 'كورس لغة عربية متقدم',
      description: 'كورس شامل في النحو والصرف',
      price: 150,
      is_free: false,
      points_on_complete: 50
    }, TOKEN);
    assert(courseRes.status === 201, `Course creation failed: ${courseRes.status} — ${JSON.stringify(courseRes.body)}`);
    const courseId = courseRes.body.id;
    console.log(`✅ 2. Course Created successfully (ID: ${courseId})`);

    // 4. Create a Question Bank
    const bankRes = await jsonRequest('POST', '/api/question-banks', {
      name: 'بنك أسئلة النحو',
      course_id: courseId
    }, TOKEN);
    assert(bankRes.status === 201, `Question Bank creation failed: ${bankRes.status} — ${JSON.stringify(bankRes.body)}`);
    const bankId = bankRes.body.id;
    console.log(`✅ 3. Question Bank Created successfully (ID: ${bankId})`);

    // 5. Add a Question to the Question Bank
    const questionRes = await jsonRequest('POST', `/api/question-banks/${bankId}/questions`, {
      question_text: 'ما إعراب كلمة "مسرعاً" في جملة "جاء القطار مسرعاً"؟',
      question_type: 'mcq',
      option_a: 'حال منصوبة',
      option_b: 'تمييز منصوب',
      option_c: 'مفعول به',
      option_d: 'فاعل',
      correct_answer_letter: 'A',
      points: 5,
      difficulty: 'medium'
    }, TOKEN);
    assert(questionRes.status === 201, `Question addition to bank failed: ${questionRes.status} — ${JSON.stringify(questionRes.body)}`);
    console.log(`✅ 4. Question Added to Question Bank successfully`);

    // 6. Create an Exam using the Question Bank as a source
    const start_date = new Date();
    const end_date = new Date(start_date.getTime() + 120 * 60000); // 120 minutes later
    const examRes = await jsonRequest('POST', '/api/exams', {
      title: 'اختبار النحو الأول الكورس العربي',
      duration_minutes: 60,
      total_score: 100,
      course_id: courseId,
      pass_score: 50,
      start_date: start_date.toISOString(),
      end_date: end_date.toISOString(),
      question_source: 'bank',
      bank_id: bankId,
      bank_question_count: 1
    }, TOKEN);
    assert(examRes.status === 201, `Exam creation failed: ${examRes.status} — ${JSON.stringify(examRes.body)}`);
    const examId = examRes.body.id;
    console.log(`✅ 5. Exam Created successfully (ID: ${examId})`);

    // 7. Create a Recitation
    const recitationRes = await jsonRequest('POST', '/api/recitations', {
      title: 'تسميع سورة الملك',
      description: 'تسميع الآيات من 1 إلى 10',
      duration_minutes: 15,
      total_score: 10,
      pass_score: 6,
      course_id: courseId,
      allow_retry: true
    }, TOKEN);
    assert(recitationRes.status === 201, `Recitation creation failed: ${recitationRes.status} — ${JSON.stringify(recitationRes.body)}`);
    const recitationId = recitationRes.body.id;
    console.log(`✅ 6. Recitation Created successfully (ID: ${recitationId})`);

    console.log('\n🎉 ALL CORE WORKFLOW TESTS PASSED FLAWLESSLY!');
  } catch (err) {
    console.error('\n❌ Workflow tests failed:', err.message);
    failed++;
  } finally {
    // Teardown test teacher
    await pool.query('DELETE FROM teachers WHERE username = $1', [TEST_USER]);
    console.log('\n[teardown] Test teacher and related cascading data removed.');

    console.log(`\n══════════════════════════════════════════════════`);
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log(`══════════════════════════════════════════════════\n`);
    process.exit(failed > 0 ? 1 : 0);
  }
})();
