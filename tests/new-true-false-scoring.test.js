'use strict';
require('dotenv').config();
const pool = require('../server/db/connection');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
const PORT = parseInt(process.env.PORT || '3001', 10);

let passed = 0, failed = 0;
let T = {};

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌  ${name}\n       ${e.stack}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function request(method, urlPath, body, token, extraHeaders) {
  return new Promise((resolve, reject) => {
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const headers = {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      ...(extraHeaders || {}),
    };
    const opts = {
      hostname: 'localhost', port: PORT, path: urlPath, method, headers,
    };
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(raw), raw }); }
        catch { resolve({ status: res.statusCode, body: raw, raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function makeToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h', jwtid: crypto.randomUUID() });
}

async function setup() {
  console.log('[setup] Creating true/false and scoring test fixtures ...');
  const pw = await bcrypt.hash('TestPw_2026!', 10);

  // 1. Teacher
  const [t] = (await pool.query(
    "INSERT INTO teachers (username,password,name,slug) VALUES ($1,$2,'Test Teacher','_test_t') RETURNING id",
    ['_test_t', pw])).rows;
  T.teacherId = t.id;
  T.teacherToken = makeToken({ id: T.teacherId, role: 'teacher', username: '_test_t', name: 'Test Teacher' });

  // 2. Course
  const [c] = (await pool.query(
    "INSERT INTO courses (name,teacher_id,price,is_published) VALUES ('Test Course',$1,100,true) RETURNING id",
    [T.teacherId])).rows;
  T.courseId = c.id;

  // 3. Student
  const [s] = (await pool.query(
    "INSERT INTO students (username,password,name,teacher_id,academic_stage) VALUES ('_test_student',$1,'Test Student',$2,'الصف الثالث الثانوي') RETURNING id",
    [pw, T.teacherId])).rows;
  T.studentId = s.id;
  T.studentToken = makeToken({ id: T.studentId, role: 'student', teacher_id: T.teacherId, username: '_test_student', name: 'Test Student' });

  // Enroll student
  await pool.query(
    "INSERT INTO student_course_enrollment (student_id,course_id,status) VALUES ($1,$2,'active')",
    [T.studentId, T.courseId]);

  // 4. Exam
  const [ex] = (await pool.query(
    `INSERT INTO exams (title,duration_minutes,total_score,course_id,teacher_id,pass_score,is_published,start_date,end_date)
     VALUES ('Test Exam',30,100,$1,$2,50,true,NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days') RETURNING id`,
    [T.courseId, T.teacherId])).rows;
  T.examId = ex.id;

  // Question 1: normal true_false with correct letter 'T' (testing compatibility normalization)
  const [q1] = (await pool.query(
    `INSERT INTO questions (exam_id,question_text,option_a,option_b,correct_answer_letter,points,question_type)
     VALUES ($1,'Q1 (T/F normal)','صح','خطأ','T',10,'true_false') RETURNING id`,
    [T.examId])).rows;
  T.q1Id = q1.id;

  // Question 2: image_multi with custom subquestions points
  const subQs = [
    { label: 'sub1', correct: 'T', type: 'true_false', points: 15 }, // TF with 'T' (normalizes to A)
    { label: 'sub2', correct: 'B', type: 'true_false', points: 5 },  // TF with 'B'
    { label: 'sub3', correct: 'C', type: 'mcq', points: 20 },        // MCQ
  ];
  const [q2] = (await pool.query(
    `INSERT INTO questions (exam_id,question_text,option_a,option_b,correct_answer_letter,points,question_type,sub_questions)
     VALUES ($1,'Q2 (image_multi)','A','B','A',40,'image_multi',$2) RETURNING id`,
    [T.examId, JSON.stringify(subQs)])).rows;
  T.q2Id = q2.id;

  // 5. Recitation
  const [rec] = (await pool.query(
    `INSERT INTO recitations (title,duration_minutes,total_score,course_id,teacher_id,pass_score,is_published,start_date)
     VALUES ('Test Recitation',30,100,$1,$2,50,true,NOW()-INTERVAL '1 day') RETURNING id`,
    [T.courseId, T.teacherId])).rows;
  T.recitationId = rec.id;

  // Recitation Question 1: normal true_false with correct letter 'F' (normalizes to B)
  const [rq1] = (await pool.query(
    `INSERT INTO recitation_questions (recitation_id,question_text,option_a,option_b,correct_answer_letter,points,question_type,sort_order)
     VALUES ($1,'RQ1','صح','خطأ','F',20,'true_false',1) RETURNING id`,
    [T.recitationId])).rows;
  T.rq1Id = rq1.id;

  // Recitation Question 2: image_multi with custom points
  const [rq2] = (await pool.query(
    `INSERT INTO recitation_questions (recitation_id,question_text,option_a,option_b,correct_answer_letter,points,question_type,sub_questions,sort_order)
     VALUES ($1,'RQ2','A','B','A',40,'image_multi',$2,2) RETURNING id`,
    [T.recitationId, JSON.stringify(subQs)])).rows;
  T.rq2Id = rq2.id;

  console.log('[setup] Done.\n');
}

async function teardown() {
  console.log('\n[teardown] Cleaning up ...');
  await pool.query('DELETE FROM teachers WHERE id=$1', [T.teacherId]).catch(() => {});
  await pool.query('DELETE FROM students WHERE id=$1', [T.studentId]).catch(() => {});
}

async function runTests() {
  console.log('\n▶  GROUP 1: Exam True/False & Custom Points Grading');

  await test('Take and Submit Exam with mixed answers & normalization', async () => {
    // 1. Start Session
    const takeR = await request('GET', `/api/exams/${T.examId}/take`, null, T.studentToken);
    assertEqual(takeR.status, 200, 'take exam failed');

    // 2. Submit answers
    // Q1 (TF, correct is 'T' -> maps to 'A'): student answers 'A' -> Should be CORRECT (10 points)
    // Q2 (image_multi, sub1: 'T' (15 pts), sub2: 'B' (5 pts), sub3: 'C' (20 pts))
    // We answer:
    // sub1 = 'A' (correct, since 'T' normalizes to 'A' -> 15 points)
    // sub2 = 'A' (incorrect, correct is 'B' -> 0 points)
    // sub3 = 'C' (correct, mcq -> 20 points)
    // Total earned score on Q2 = 15 + 20 = 35 points
    // Total raw earned points = 10 + 35 = 45 points
    // Total possible exam points = 10 + 40 = 50 points
    // Normalized score = (45 / 50) * 100 (exam total_score) = 90%
    const answers = {
      [T.q1Id]: 'A',
      [T.q2Id]: {
        sub1: 'A',
        sub2: 'A',
        sub3: 'C'
      }
    };

    const submitR = await request('POST', `/api/exams/${T.examId}/submit`, { answers }, T.studentToken);
    assertEqual(submitR.status, 200, 'submit exam failed');
    assertEqual(Math.round(submitR.body.result.score), 90, 'forged score mismatch');
    T.examResultId = submitR.body.result.id;
  });

  await test('Review Exam results contains correct points & types breakdown', async () => {
    const reviewR = await request('GET', `/api/exams/results/${T.examResultId}/review`, null, T.studentToken);
    assertEqual(reviewR.status, 200, 'review exam failed');
    const reviewQuestions = reviewR.body.questions;
    
    // Find Q1
    const rq1 = reviewQuestions.find(q => q.id === T.q1Id);
    assert(rq1, 'Q1 not found in review');
    assertEqual(rq1.student_answer, 'A', 'student answer not saved or normalized');
    assertEqual(rq1.correct_answer, 'A', 'correct answer not normalized in review');
    assertEqual(rq1.is_correct, true, 'Q1 should be marked correct');

    // Find Q2
    const rq2 = reviewQuestions.find(q => q.id === T.q2Id);
    assert(rq2, 'Q2 not found in review');
    const subResults = rq2.sub_results;
    assert(Array.isArray(subResults), 'sub_results is not an array');
    
    const s1 = subResults.find(s => s.label === 'sub1');
    assertEqual(s1.student_answer, 'A', 'sub1 student answer mismatch');
    assertEqual(s1.correct, 'A', 'sub1 correct answer mismatch');
    assertEqual(s1.points, 15, 'sub1 points mismatch');
    assertEqual(s1.is_correct, true, 'sub1 should be correct');

    const s2 = subResults.find(s => s.label === 'sub2');
    assertEqual(s2.student_answer, 'A', 'sub2 student answer mismatch');
    assertEqual(s2.correct, 'B', 'sub2 correct answer mismatch');
    assertEqual(s2.points, 5, 'sub2 points mismatch');
    assertEqual(s2.is_correct, false, 'sub2 should be incorrect');

    const s3 = subResults.find(s => s.label === 'sub3');
    assertEqual(s3.student_answer, 'C', 'sub3 student answer mismatch');
    assertEqual(s3.correct, 'C', 'sub3 correct answer mismatch');
    assertEqual(s3.points, 20, 'sub3 points mismatch');
    assertEqual(s3.is_correct, true, 'sub3 should be correct');
  });

  console.log('\n▶  GROUP 2: Recitation True/False & Custom Points Grading');

  await test('Take and Submit Recitation with mixed answers & normalization', async () => {
    // 1. Start Session
    const takeR = await request('GET', `/api/recitations/${T.recitationId}/take`, null, T.studentToken);
    assertEqual(takeR.status, 200, 'take recitation failed');

    // 2. Submit answers
    // RQ1 (TF, correct is 'F' -> maps to 'B'): student answers 'B' -> Should be CORRECT (20 points)
    // RQ2 (image_multi, sub1: 'T' (15 pts), sub2: 'B' (5 pts), sub3: 'C' (20 pts))
    // We answer:
    // sub1 = 'A' (correct -> 15 points)
    // sub2 = 'B' (correct -> 5 points)
    // sub3 = 'A' (incorrect, correct is 'C' -> 0 points)
    // Total earned score on RQ2 = 15 + 5 = 20 points
    // Total raw earned points = 20 + 20 = 40 points
    // Total possible recitation points = 20 + 40 = 60 points
    // Normalized score = (40 / 60) * 100 (recitation total_score) = 67%
    const answers = [
      { question_id: T.rq1Id, answer: 'B' },
      { question_id: T.rq2Id, answer: JSON.stringify({ sub1: 'A', sub2: 'B', sub3: 'A' }) }
    ];

    const submitR = await request('POST', `/api/recitations/${T.recitationId}/submit`, { answers }, T.studentToken);
    assertEqual(submitR.status, 200, 'submit recitation failed');
    assertEqual(Math.round(submitR.body.result.score), 67, 'recitation score mismatch');
    T.recitationResultId = submitR.body.result.id;
  });

  await test('Review Recitation results contains correct points & types breakdown', async () => {
    const reviewR = await request('GET', `/api/recitations/results/${T.recitationResultId}/review`, null, T.studentToken);
    assertEqual(reviewR.status, 200, 'review recitation failed');
    const reviewQuestions = reviewR.body.review;

    // Find RQ1
    const rq1 = reviewQuestions.find(q => q.id === T.rq1Id);
    assert(rq1, 'RQ1 not found in review');
    assertEqual(rq1.student_answer, 'B', 'student answer not saved or normalized');
    assertEqual(rq1.correct_answer_letter, 'B', 'correct answer not normalized in review');
    assertEqual(rq1.is_correct, true, 'RQ1 should be marked correct');

    // Find RQ2
    const rq2 = reviewQuestions.find(q => q.id === T.rq2Id);
    assert(rq2, 'RQ2 not found in review');
    const subResults = rq2.sub_results;
    assert(Array.isArray(subResults), 'sub_results is not an array');

    const s1 = subResults.find(s => s.label === 'sub1');
    assertEqual(s1.student_answer, 'A', 'sub1 student answer mismatch');
    assertEqual(s1.correct, 'A', 'sub1 correct answer mismatch');
    assertEqual(s1.points, 15, 'sub1 points mismatch');
    assertEqual(s1.is_correct, true, 'sub1 should be correct');

    const s2 = subResults.find(s => s.label === 'sub2');
    assertEqual(s2.student_answer, 'B', 'sub2 student answer mismatch');
    assertEqual(s2.correct, 'B', 'sub2 correct answer mismatch');
    assertEqual(s2.points, 5, 'sub2 points mismatch');
    assertEqual(s2.is_correct, true, 'sub2 should be correct');

    const s3 = subResults.find(s => s.label === 'sub3');
    assertEqual(s3.student_answer, 'A', 'sub3 student answer mismatch');
    assertEqual(s3.correct, 'C', 'sub3 correct answer mismatch');
    assertEqual(s3.points, 20, 'sub3 points mismatch');
    assertEqual(s3.is_correct, false, 'sub3 should be incorrect');
  });
}

(async () => {
  try {
    await setup();
  } catch (e) {
    console.error('[setup] FAILED:', e.stack);
    process.exit(1);
  }
  try {
    await runTests();
  } finally {
    await teardown();
    await pool.end();
  }
  console.log('\n' + '═'.repeat(65));
  const total = passed + failed;
  const status = failed > 0 ? '❌ SOME FAILED' : '✅ ALL PASSED';
  console.log(`  ${status}  |  ${passed}/${total} passed  |  ${failed} failed`);
  console.log('═'.repeat(65));
  if (failed > 0) process.exit(1);
})();
