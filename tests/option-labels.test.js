/**
 * WATHBA - Custom Option Labels & Sub-questions Option Labeling Test Suite
 * ====================================================================
 * Run: node tests/option-labels.test.js
 * Prerequisites: Server must be running locally.
 */

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
    console.error(`  ❌  ${name}\n       ${e.message}\n${e.stack}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}

function request(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
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
  console.log('[setup] Creating option labels test fixtures ...');
  const pw = await bcrypt.hash('password123', 10);

  // 1. Create Teacher
  const username = `t_label_${Date.now()}`;
  const [t] = (await pool.query(
    "INSERT INTO teachers (username,password,name,slug) VALUES ($1,$2,'Test Label Teacher',$3) RETURNING id",
    [username, pw, username])).rows;
  T.teacherId = t.id;
  T.teacherToken = makeToken({ id: T.teacherId, role: 'teacher', username, name: 'Test Label Teacher' });

  // 2. Create Course
  const [c] = (await pool.query(
    "INSERT INTO courses (name,teacher_id,price,is_published) VALUES ('Option Labels Course',$1,0,true) RETURNING id",
    [T.teacherId])).rows;
  T.courseId = c.id;

  // 3. Create Student
  const stdUsername = `std_label_${Date.now()}`;
  const [s] = (await pool.query(
    "INSERT INTO students (username,password,name,parent_phone,teacher_id) VALUES ($1,$2,'Test Label Student','+20123456789',$3) RETURNING id",
    [stdUsername, pw, T.teacherId])).rows;
  T.studentId = s.id;
  T.studentToken = makeToken({ id: T.studentId, role: 'student', username: stdUsername, name: 'Test Label Student' });

  // Enroll student in course
  await pool.query(
    "INSERT INTO student_course_enrollment (student_id,course_id,status) VALUES ($1,$2,'active')",
    [T.studentId, T.courseId]
  );
}

async function cleanup() {
  console.log('[cleanup] Deleting option labels test fixtures ...');
  if (T.courseId) {
    await pool.query("DELETE FROM student_course_enrollment WHERE course_id=$1", [T.courseId]);
    await pool.query("DELETE FROM recitation_questions WHERE recitation_id IN (SELECT id FROM recitations WHERE course_id=$1)", [T.courseId]);
    await pool.query("DELETE FROM recitations WHERE course_id=$1", [T.courseId]);
    await pool.query("DELETE FROM questions WHERE exam_id IN (SELECT id FROM exams WHERE course_id=$1)", [T.courseId]);
    await pool.query("DELETE FROM exams WHERE course_id=$1", [T.courseId]);
    await pool.query("DELETE FROM courses WHERE id=$1", [T.courseId]);
  }
  if (T.teacherId) {
    await pool.query("DELETE FROM teachers WHERE id=$1", [T.teacherId]);
  }
  if (T.studentId) {
    await pool.query("DELETE FROM students WHERE id=$1", [T.studentId]);
  }
}

async function runTests() {
  try {
    await setup();
  } catch (err) {
    console.error('Setup failed:', err);
    process.exit(1);
  }

  // --- TEST CASE 1: Exam MCQ Custom Option Labels ---
  await test('POST /api/exams/:id/questions with custom option_labels', async () => {
    // 1. Create Exam
    const resExam = await request('POST', '/api/exams', {
      title: 'Option Labels Test Exam',
      duration_minutes: 30,
      total_score: 10,
      pass_score: 5,
      course_id: T.courseId,
      shuffle_questions: false,
      shuffle_options: false,
      is_published: true,
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 86400000).toISOString(),
    }, T.teacherToken);
    
    assert(resExam.status === 201, `Failed to create exam: ${resExam.status}`);
    const examId = resExam.body.id;
    T.examId = examId;

    // 2. Create Question with Option Labels
    const resQ = await request('POST', `/api/exams/${examId}/questions`, {
      question_type: 'mcq',
      question_text: 'What is 1 + 1?',
      option_a: '1',
      option_b: '2',
      option_c: '3',
      option_d: '4',
      correct_answer_letter: 'B',
      points: 5,
      option_labels: ['أ', 'ب', 'ج', 'د']
    }, T.teacherToken);

    assertEqual(resQ.status, 201, 'POST question status');
    assertEqual(resQ.body.option_labels, ['أ', 'ب', 'ج', 'د'], 'Saved option_labels matches input');

    // 3. Create image_multi Question with Sub-questions Option Labels
    const resSubQ = await request('POST', `/api/exams/${examId}/questions`, {
      question_type: 'image_multi',
      question_text: 'Match the diagrams',
      option_a: 'A',
      option_b: 'B',
      option_c: 'C',
      option_d: 'D',
      correct_answer_letter: 'A',
      points: 5,
      sub_questions: [
        { label: '1', correct: 'B', type: 'mcq', points: 2, option_labels: ['1', '2', '3', '4'] },
        { label: '2', correct: 'A', type: 'true_false', points: 3 }
      ]
    }, T.teacherToken);

    assertEqual(resSubQ.status, 201, 'POST image_multi sub-question status');
    assertEqual(resSubQ.body.sub_questions[0].option_labels, ['1', '2', '3', '4'], 'Saved sub-question option_labels');

    // 4. Publish Exam
    const resPub = await request('PUT', `/api/exams/${examId}/publish`, null, T.teacherToken);
    assertEqual(resPub.status, 200, 'Publish exam status');
  });

  // --- TEST CASE 2: Student Exam Taking endpoint returns custom option labels ---
  await test('GET /api/exams/:id/take fetches correct option_labels', async () => {
    const resTake = await request('GET', `/api/exams/${T.examId}/take`, null, T.studentToken);
    if (resTake.status !== 200) {
      console.error('GET /take failed:', resTake.status, resTake.body);
    }
    assertEqual(resTake.status, 200, 'GET /take status');
    
    const questions = resTake.body.questions;
    assert(Array.isArray(questions) && questions.length === 2, 'Should return exactly 2 questions');

    // MCQ Main Question
    const mcqQ = questions.find(q => q.question_type === 'mcq');
    assert(mcqQ, 'MCQ question found in take payload');
    assertEqual(mcqQ.option_labels, ['أ', 'ب', 'ج', 'د'], 'MCQ question option_labels returned to student');

    // Image Multi Sub-question
    const imgQ = questions.find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi question found');
    assertEqual(imgQ.sub_questions[0].option_labels, ['1', '2', '3', '4'], 'Sub-question option_labels returned to student');
  });

  // --- TEST CASE 3: Recitation MCQ Custom Option Labels ---
  await test('POST /api/recitations/:id/questions and fetch recitations', async () => {
    // 1. Create Recitation
    const resRec = await request('POST', '/api/recitations', {
      title: 'Option Labels Recitation',
      course_id: T.courseId,
      duration_minutes: 15,
      total_score: 2,
      pass_score: 1,
      due_date: new Date(Date.now() + 86400000).toISOString(),
      is_published: true,
    }, T.teacherToken);

    if (resRec.status !== 201) {
      console.error('Create recitation failed:', resRec.status, resRec.body);
    }
    assertEqual(resRec.status, 201, 'Create recitation status');
    const recId = resRec.body.id;
    T.recitationId = recId;

    // 2. Add question with custom labels
    const resQ = await request('POST', `/api/recitations/${recId}/questions`, {
      question_type: 'mcq',
      question_text: 'What is the color of sky?',
      option_a: 'Red',
      option_b: 'Blue',
      option_c: 'Green',
      option_d: 'Yellow',
      correct_answer_letter: 'B',
      points: 2,
      option_labels: ['أ', 'ب', 'ج', 'د']
    }, T.teacherToken);

    assertEqual(resQ.status, 201, 'Create recitation question status');
    assertEqual(resQ.body.option_labels, ['أ', 'ب', 'ج', 'د'], 'Recitation question option_labels saved');

    // 3. Publish Recitation
    const resPubRec = await request('PUT', `/api/recitations/${recId}/publish`, null, T.teacherToken);
    if (resPubRec.status !== 200) {
      console.error('Publish recitation failed:', resPubRec.status, resPubRec.body);
    }
    assertEqual(resPubRec.status, 200, 'Publish recitation status');

    // 4. Fetch recitation questions as student
    const resTake = await request('GET', `/api/recitations/${recId}/take`, null, T.studentToken);
    if (resTake.status !== 200) {
      console.error('GET /recitations/:id/take failed:', resTake.status, resTake.body);
    }
    assertEqual(resTake.status, 200, 'Fetch recitation questions status');
    
    const recQ = resTake.body.questions.find(q => q.question_type === 'mcq');
    assert(recQ, 'Recitation question found');
    assertEqual(recQ.option_labels, ['أ', 'ب', 'ج', 'د'], 'Recitation question option_labels returned to student');
  });

  // --- TEST CASE 4: Question Bank MCQ Custom Option Labels ---
  await test('POST /api/question-banks/:id/questions and fetch questions', async () => {
    // 1. Create Question Bank
    const resBank = await request('POST', '/api/question-banks', {
      name: 'Option Labels Bank',
      description: 'Test Bank',
    }, T.teacherToken);

    assertEqual(resBank.status, 201, 'Create bank status');
    const bankId = resBank.body.id;
    T.bankId = bankId;

    // 2. Create question in bank
    const resQ = await request('POST', `/api/question-banks/${bankId}/questions`, {
      question_type: 'mcq',
      question_text: 'Solve 5 * 5',
      option_a: '10',
      option_b: '25',
      option_c: '30',
      option_d: '50',
      correct_answer_letter: 'B',
      points: 3,
      difficulty: 'medium',
      option_labels: ['1', '2', '3', '4']
    }, T.teacherToken);

    assertEqual(resQ.status, 201, 'Create bank question status');
    assertEqual(resQ.body.option_labels, ['1', '2', '3', '4'], 'Bank question option_labels saved');

    // 3. Fetch bank questions
    const resGet = await request('GET', `/api/question-banks/${bankId}/questions`, null, T.teacherToken);
    assertEqual(resGet.status, 200, 'Fetch bank questions status');
    const bankQ = resGet.body.find(q => q.question_type === 'mcq');
    assertEqual(bankQ.option_labels, ['1', '2', '3', '4'], 'Bank option_labels returned to teacher');
  });

  try {
    await cleanup();
  } catch (err) {
    console.error('Cleanup failed:', err);
  }

  console.log(`\nTest results: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
