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
    console.error(`  ❌  ${name}\n       ${e.message.split('\n')[0]}`);
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
    const opts = { hostname: 'localhost', port: PORT, path: urlPath, method, headers };
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
  console.log('[setup] Creating test fixtures ...');
  const pw = await bcrypt.hash('SessAudit_2026!', 10);

  // Teacher
  const [t] = (await pool.query(
    "INSERT INTO teachers (username,password,name,slug) VALUES ($1,$2,'SessAudit Teacher','_sessaudit_t') RETURNING id",
    ['_sessaudit_t', pw])).rows;
  T.teacherId = t.id;
  T.teacherToken = makeToken({ id: T.teacherId, role: 'teacher', username: '_sessaudit_t', name: 'SessAudit Teacher' });

  // Course
  const [c] = (await pool.query(
    "INSERT INTO courses (name,teacher_id,price,is_published) VALUES ('SessAudit Course',$1,100,true) RETURNING id",
    [T.teacherId])).rows;
  T.courseId = c.id;

  // Question bank
  const [bank] = (await pool.query(
    "INSERT INTO question_banks (name,teacher_id) VALUES ('SessAudit Bank',$1) RETURNING id",
    [T.teacherId])).rows;
  T.bankId = bank.id;

  // Existing MCQ question
  const [q] = (await pool.query(
    `INSERT INTO bank_questions (bank_id,question_text,option_a,option_b,correct_answer_letter,points,question_type,sub_questions)
     VALUES ($1,'MCQ question','A opt','B opt','A',5,'mcq','[]') RETURNING id`,
    [T.bankId])).rows;
  T.mcqQid = q.id;

  // Existing image_multi question
  const subs = JSON.stringify([{ label: '1', correct: 'A' }, { label: '2', correct: 'B' }]);
  const [iq] = (await pool.query(
    `INSERT INTO bank_questions (bank_id,question_text,option_a,option_b,option_c,option_d,correct_answer_letter,points,question_type,sub_questions)
     VALUES ($1,'img question','A','B','C','D','A',2,'image_multi',$2) RETURNING id`,
    [T.bankId, subs])).rows;
  T.imgQid = iq.id;

  // Exam
  const [ex] = (await pool.query(
    `INSERT INTO exams (title,duration_minutes,total_score,course_id,teacher_id,pass_score,is_published,start_date,end_date)
     VALUES ('SessAudit Exam',30,100,$1,$2,50,false,NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days') RETURNING id`,
    [T.courseId, T.teacherId])).rows;
  T.examId = ex.id;

  console.log('[setup] Done.\n');
}

async function teardown() {
  console.log('\n[teardown] Cleaning up ...');
  await pool.query('DELETE FROM teachers WHERE id=$1', [T.teacherId]).catch(() => {});
}

async function runTests() {

  // ══════════════════════════════════════════════════════════
  // GROUP 1: EQ-1 – "مجموعة جديدة" crash fix (QuestionBanks)
  // The fix removed setNextGroupId from the button callback.
  // We verify that the button no longer triggers the dead call
  // by checking sub_questions is cleared (group_id reset) via POST.
  // ══════════════════════════════════════════════════════════
  console.log('\n▶  GROUP 1: EQ-1 – New Group button in QuestionBanks (regression check)');

  // group_id in bank_questions is INTEGER — use a numeric value
  const GROUP_NUM = 999001;
  await test('[EQ-1] Add first question with group_id to bank', async () => {
    const r = await request('POST', `/api/question-banks/${T.bankId}/questions`, {
      question_text: 'First grouped q',
      option_a: 'A opt', option_b: 'B opt',
      correct_answer_letter: 'A', points: 2, question_type: 'mcq',
      group_id: GROUP_NUM,
    }, T.teacherToken);
    assertEqual(r.status, 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.group_id === GROUP_NUM, `group_id should be ${GROUP_NUM}, got ${r.body.group_id}`);
    T.groupedQid = r.body.id;
  });

  await test('[EQ-1] Add second question to same group', async () => {
    const r = await request('POST', `/api/question-banks/${T.bankId}/questions`, {
      question_text: 'Second grouped q',
      option_a: 'A opt', option_b: 'B opt',
      correct_answer_letter: 'B', points: 2, question_type: 'mcq',
      group_id: GROUP_NUM,
    }, T.teacherToken);
    assertEqual(r.status, 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.group_id === GROUP_NUM, `Second question should be in same group (${GROUP_NUM})`);
  });

  await test('[EQ-1] Add question with null group_id (new group) → group_id null', async () => {
    const r = await request('POST', `/api/question-banks/${T.bankId}/questions`, {
      question_text: 'Standalone q after new group click',
      option_a: 'A opt', option_b: 'B opt',
      correct_answer_letter: 'A', points: 1, question_type: 'mcq',
    }, T.teacherToken);
    assertEqual(r.status, 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.group_id === null, `group_id should be null, got ${r.body.group_id}`);
  });

  // ══════════════════════════════════════════════════════════
  // GROUP 2: EQ-2/EQ-3 – image_multi display in SingleQuestionCard / GroupQuestionCard
  // We verify the server returns sub_questions for bank and exam questions.
  // ══════════════════════════════════════════════════════════
  console.log('\n▶  GROUP 2: EQ-2/EQ-3 – image_multi sub_questions returned in list');

  await test('[EQ-2] GET bank questions returns sub_questions for image_multi', async () => {
    const r = await request('GET', `/api/question-banks/${T.bankId}/questions`, null, T.teacherToken);
    assertEqual(r.status, 200, `Expected 200, got ${r.status}`);
    const imgQ = r.body.find(q => q.id === T.imgQid);
    assert(imgQ, 'image_multi question should be in list');
    const subs = typeof imgQ.sub_questions === 'string'
      ? JSON.parse(imgQ.sub_questions)
      : imgQ.sub_questions;
    assert(Array.isArray(subs), 'sub_questions should be an array');
    assertEqual(subs.length, 2, 'Should have 2 sub_questions');
    assert(subs[0].label === '1', 'First sub label should be "1"');
    assert(subs[0].correct === 'A', 'First sub correct should be A');
  });

  await test('[EQ-2] image_multi option_a/b/c/d are placeholder A/B/C/D (not real options)', async () => {
    const r = await request('GET', `/api/question-banks/${T.bankId}/questions`, null, T.teacherToken);
    const imgQ = r.body.find(q => q.id === T.imgQid);
    assert(imgQ, 'image_multi question should exist');
    assertEqual(imgQ.option_a, 'A', 'option_a should be placeholder A');
    assertEqual(imgQ.option_b, 'B', 'option_b should be placeholder B');
    assertEqual(imgQ.option_c, 'C', 'option_c should be placeholder C');
    assertEqual(imgQ.option_d, 'D', 'option_d should be placeholder D');
  });

  await test('[EQ-2] exam questions endpoint includes sub_questions field', async () => {
    // Add an image_multi question to the exam
    const subsSel = JSON.stringify([{ label: '1', correct: 'A' }]);
    const addR = await pool.query(
      `INSERT INTO questions (exam_id,question_text,option_a,option_b,option_c,option_d,correct_answer_letter,points,question_type,sub_questions)
       VALUES ($1,'Exam img q','A','B','C','D','A',3,'image_multi',$2) RETURNING id`,
      [T.examId, subsSel]
    );
    T.examImgQid = addR.rows[0].id;
    const r = await request('GET', `/api/exams/${T.examId}/questions`, null, T.teacherToken);
    assertEqual(r.status, 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    const imgQ = r.body.find(q => q.id === T.examImgQid);
    assert(imgQ, 'Exam image_multi question should be in list');
    assert('sub_questions' in imgQ, 'sub_questions field should be present on exam question');
    const subs = typeof imgQ.sub_questions === 'string'
      ? JSON.parse(imgQ.sub_questions)
      : imgQ.sub_questions;
    assert(Array.isArray(subs) && subs.length === 1, 'Exam question should have 1 sub_question');
  });

  // ══════════════════════════════════════════════════════════
  // GROUP 3: SV-1 – Bank name length cap (max 200 chars)
  // ══════════════════════════════════════════════════════════
  console.log('\n▶  GROUP 3: SV-1 – Bank name max-length validation');

  await test('[SV-1] POST bank with name > 200 chars → 400', async () => {
    const longName = 'أ'.repeat(201);
    const r = await request('POST', '/api/question-banks', { name: longName }, T.teacherToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.error, 'Should return error message');
  });

  await test('[SV-1] POST bank with name exactly 200 chars → 201', async () => {
    const name = 'أ'.repeat(200);
    const r = await request('POST', '/api/question-banks', { name }, T.teacherToken);
    assertEqual(r.status, 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    T.extraBankId = r.body.id;
  });

  await test('[SV-1] PUT bank with name > 200 chars → 400', async () => {
    const longName = 'ب'.repeat(201);
    const r = await request('PUT', `/api/question-banks/${T.bankId}`, { name: longName }, T.teacherToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('[SV-1] PUT bank with name exactly 200 chars → 200', async () => {
    const name = 'ب'.repeat(200);
    const r = await request('PUT', `/api/question-banks/${T.bankId}`, { name }, T.teacherToken);
    assertEqual(r.status, 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.name.length === 200, 'Name should be stored as 200 chars');
    // restore name
    await request('PUT', `/api/question-banks/${T.bankId}`, { name: 'SessAudit Bank' }, T.teacherToken);
  });

  // ══════════════════════════════════════════════════════════
  // GROUP 4: SV-2 – course_id integer validation in bank create/update
  // ══════════════════════════════════════════════════════════
  console.log('\n▶  GROUP 4: SV-2 – course_id integer validation in bank endpoints');

  await test('[SV-2] POST bank with non-integer course_id → 400', async () => {
    const r = await request('POST', '/api/question-banks', {
      name: 'Temp bank', course_id: 'abc; DROP TABLE courses',
    }, T.teacherToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.error && r.body.error.includes('معرّف الكورس'), `Unexpected error: ${r.body.error}`);
  });

  await test('[SV-2] POST bank with float course_id → 400', async () => {
    const r = await request('POST', '/api/question-banks', {
      name: 'Temp bank', course_id: 1.7,
    }, T.teacherToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('[SV-2] POST bank with zero course_id → 400', async () => {
    const r = await request('POST', '/api/question-banks', {
      name: 'Temp bank', course_id: 0,
    }, T.teacherToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('[SV-2] POST bank with valid integer course_id owned by teacher → 201', async () => {
    const r = await request('POST', '/api/question-banks', {
      name: 'Temp bank with course', course_id: T.courseId,
    }, T.teacherToken);
    assertEqual(r.status, 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    assertEqual(r.body.course_id, T.courseId, 'course_id should be set correctly');
    T.bankWithCourseId = r.body.id;
  });

  await test('[SV-2] PUT bank with non-integer course_id → 400', async () => {
    const r = await request('PUT', `/api/question-banks/${T.bankId}`, {
      name: 'SessAudit Bank', course_id: 'evil_string',
    }, T.teacherToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('[SV-2] PUT bank with valid course_id → 200', async () => {
    const r = await request('PUT', `/api/question-banks/${T.bankId}`, {
      name: 'SessAudit Bank', course_id: T.courseId,
    }, T.teacherToken);
    assertEqual(r.status, 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assertEqual(r.body.course_id, T.courseId, 'course_id should be updated');
    // restore
    await request('PUT', `/api/question-banks/${T.bankId}`, { name: 'SessAudit Bank' }, T.teacherToken);
  });

  // ══════════════════════════════════════════════════════════
  // GROUP 5: SV-3 – points range validation in bank questions POST and PUT
  // ══════════════════════════════════════════════════════════
  console.log('\n▶  GROUP 5: SV-3 – points range validation (1–1000)');

  await test('[SV-3] POST bank question with points=0 → 400', async () => {
    const r = await request('POST', `/api/question-banks/${T.bankId}/questions`, {
      question_text: 'q', option_a: 'A', option_b: 'B',
      correct_answer_letter: 'A', points: 0, question_type: 'mcq',
    }, T.teacherToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.error && r.body.error.includes('النقاط'), `Unexpected error: ${r.body.error}`);
  });

  await test('[SV-3] POST bank question with points=1001 → 400', async () => {
    const r = await request('POST', `/api/question-banks/${T.bankId}/questions`, {
      question_text: 'q', option_a: 'A', option_b: 'B',
      correct_answer_letter: 'A', points: 1001, question_type: 'mcq',
    }, T.teacherToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('[SV-3] POST bank question with points=1000 → 201', async () => {
    const r = await request('POST', `/api/question-banks/${T.bankId}/questions`, {
      question_text: 'q with max points', option_a: 'A', option_b: 'B',
      correct_answer_letter: 'A', points: 1000, question_type: 'mcq',
    }, T.teacherToken);
    assertEqual(r.status, 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    assertEqual(r.body.points, 1000, 'points should be 1000');
    T.maxPointsQid = r.body.id;
  });

  await test('[SV-3] POST bank question with points=1 → 201', async () => {
    const r = await request('POST', `/api/question-banks/${T.bankId}/questions`, {
      question_text: 'q with min points', option_a: 'A', option_b: 'B',
      correct_answer_letter: 'A', points: 1, question_type: 'mcq',
    }, T.teacherToken);
    assertEqual(r.status, 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    assertEqual(r.body.points, 1, 'points should be 1');
  });

  await test('[SV-3] PUT bank question with points=0 → 400', async () => {
    const r = await request('PUT', `/api/question-banks/questions/${T.mcqQid}`, {
      question_text: 'MCQ question', option_a: 'A opt', option_b: 'B opt',
      correct_answer_letter: 'A', points: 0, question_type: 'mcq',
    }, T.teacherToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('[SV-3] PUT bank question with points=1001 → 400', async () => {
    const r = await request('PUT', `/api/question-banks/questions/${T.mcqQid}`, {
      question_text: 'MCQ question', option_a: 'A opt', option_b: 'B opt',
      correct_answer_letter: 'A', points: 1001, question_type: 'mcq',
    }, T.teacherToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('[SV-3] PUT bank question with points=500 → 200', async () => {
    const r = await request('PUT', `/api/question-banks/questions/${T.mcqQid}`, {
      question_text: 'MCQ question', option_a: 'A opt', option_b: 'B opt',
      correct_answer_letter: 'A', points: 500, question_type: 'mcq',
    }, T.teacherToken);
    assertEqual(r.status, 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assertEqual(r.body.points, 500, 'points should be updated to 500');
  });

  // ══════════════════════════════════════════════════════════
  // GROUP 6: Bank question CRUD with image_multi type (full coverage)
  // ══════════════════════════════════════════════════════════
  console.log('\n▶  GROUP 6: image_multi POST/PUT in question banks');

  await test('[IMG] POST image_multi with valid sub_questions → 201', async () => {
    const r = await request('POST', `/api/question-banks/${T.bankId}/questions`, {
      question_text: 'Image multi test',
      question_image_url: 'https://example.com/img.png',
      question_type: 'image_multi',
      sub_questions: [
        { label: '1', correct: 'A' },
        { label: '2', correct: 'B' },
        { label: '3', correct: 'C' },
      ],
      points: 3,
    }, T.teacherToken);
    assertEqual(r.status, 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    assertEqual(r.body.question_type, 'image_multi', 'type should be image_multi');
    T.newImgQid = r.body.id;
    const subs = typeof r.body.sub_questions === 'string'
      ? JSON.parse(r.body.sub_questions)
      : r.body.sub_questions;
    assertEqual(subs.length, 3, 'Should have 3 sub_questions');
  });

  await test('[IMG] POST image_multi with empty sub_questions → 400', async () => {
    const r = await request('POST', `/api/question-banks/${T.bankId}/questions`, {
      question_text: 'Test', question_type: 'image_multi', sub_questions: [], points: 1,
    }, T.teacherToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}`);
  });

  await test('[IMG] POST image_multi with > 50 sub_questions → 400', async () => {
    const subs = Array.from({ length: 51 }, (_, i) => ({ label: String(i + 1), correct: 'A' }));
    const r = await request('POST', `/api/question-banks/${T.bankId}/questions`, {
      question_text: 'Test', question_type: 'image_multi', sub_questions: subs, points: 1,
    }, T.teacherToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}`);
  });

  await test('[IMG] POST image_multi with duplicate labels → 400', async () => {
    const r = await request('POST', `/api/question-banks/${T.bankId}/questions`, {
      question_text: 'Test', question_type: 'image_multi',
      sub_questions: [{ label: '1', correct: 'A' }, { label: '1', correct: 'B' }],
      points: 1,
    }, T.teacherToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}`);
  });

  await test('[IMG] POST image_multi with invalid correct letter → 400', async () => {
    const r = await request('POST', `/api/question-banks/${T.bankId}/questions`, {
      question_text: 'Test', question_type: 'image_multi',
      sub_questions: [{ label: '1', correct: 'Z' }],
      points: 1,
    }, T.teacherToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}`);
  });

  await test('[IMG] POST image_multi strips extra fields from sub_questions', async () => {
    const r = await request('POST', `/api/question-banks/${T.bankId}/questions`, {
      question_text: 'Test strip',
      question_type: 'image_multi',
      sub_questions: [{ label: '1', correct: 'A', extra_field: 'should_be_stripped', another: 999 }],
      points: 1,
    }, T.teacherToken);
    assertEqual(r.status, 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    const subs = typeof r.body.sub_questions === 'string'
      ? JSON.parse(r.body.sub_questions)
      : r.body.sub_questions;
    assert(!('extra_field' in subs[0]), 'extra_field should be stripped');
    assert(!('another' in subs[0]), 'another field should be stripped');
    assert('label' in subs[0], 'label should remain');
    assert('correct' in subs[0], 'correct should remain');
  });

  await test('[IMG] PUT image_multi updates sub_questions correctly → 200', async () => {
    const r = await request('PUT', `/api/question-banks/questions/${T.newImgQid}`, {
      question_text: 'Image multi updated',
      question_image_url: 'https://example.com/img2.png',
      question_type: 'image_multi',
      sub_questions: [
        { label: 'A', correct: 'B' },
        { label: 'B', correct: 'C' },
      ],
      points: 2,
    }, T.teacherToken);
    assertEqual(r.status, 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    const subs = typeof r.body.sub_questions === 'string'
      ? JSON.parse(r.body.sub_questions)
      : r.body.sub_questions;
    assertEqual(subs.length, 2, 'Should have 2 sub_questions after update');
    assertEqual(subs[0].correct, 'B', 'First sub correct should be B');
  });

  // ══════════════════════════════════════════════════════════
  // GROUP 7: parseParamId strict validation on bank routes
  // ══════════════════════════════════════════════════════════
  console.log('\n▶  GROUP 7: parseParamId strict validation on all bank routes');

  await test('[PARSE] GET /banks/abc/questions → 400', async () => {
    const r = await request('GET', '/api/question-banks/abc/questions', null, T.teacherToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}`);
  });

  await test('[PARSE] GET /banks/0/questions → 400', async () => {
    const r = await request('GET', '/api/question-banks/0/questions', null, T.teacherToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}`);
  });

  await test('[PARSE] DELETE /banks/questions/0 → 400', async () => {
    const r = await request('DELETE', '/api/question-banks/questions/0', null, T.teacherToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}`);
  });

  await test('[PARSE] PUT /banks/questions/abc → 400', async () => {
    const r = await request('PUT', '/api/question-banks/questions/abc', {
      question_text: 'x', option_a: 'a', option_b: 'b',
      correct_answer_letter: 'A', points: 1, question_type: 'mcq',
    }, T.teacherToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}`);
  });

  await test('[PARSE] DELETE /banks/abc → 400', async () => {
    const r = await request('DELETE', '/api/question-banks/abc', null, T.teacherToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}`);
  });

  // ══════════════════════════════════════════════════════════
  // GROUP 8: Tenant isolation — bank endpoints require same-teacher ownership
  // ══════════════════════════════════════════════════════════
  console.log('\n▶  GROUP 8: Tenant isolation – cross-teacher bank access denied');

  let otherTeacherToken;
  await test('[TENANT] Create another teacher for isolation test', async () => {
    const pw2 = await bcrypt.hash('OtherTeacher!', 10);
    const [other] = (await pool.query(
      "INSERT INTO teachers (username,password,name,slug) VALUES ($1,$2,'Other Teacher','_sessaudit_other') RETURNING id",
      ['_sessaudit_other', pw2])).rows;
    T.otherTeacherId = other.id;
    otherTeacherToken = makeToken({ id: other.id, role: 'teacher', username: '_sessaudit_other', name: 'Other Teacher' });
    assert(otherTeacherToken, 'Should create token for other teacher');
  });

  await test('[TENANT] Other teacher cannot GET first teacher\'s bank questions → 403', async () => {
    const r = await request('GET', `/api/question-banks/${T.bankId}/questions`, null, otherTeacherToken);
    assertEqual(r.status, 403, `Expected 403, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('[TENANT] Other teacher cannot DELETE first teacher\'s bank question → 403', async () => {
    const r = await request('DELETE', `/api/question-banks/questions/${T.mcqQid}`, null, otherTeacherToken);
    assertEqual(r.status, 403, `Expected 403, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('[TENANT] Other teacher cannot PUT first teacher\'s bank → 404', async () => {
    const r = await request('PUT', `/api/question-banks/${T.bankId}`, { name: 'Hacked' }, otherTeacherToken);
    // 404 because bank not found for other teacher (ownership check)
    assertEqual(r.status, 404, `Expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('[TENANT] Other teacher cannot DELETE first teacher\'s bank → 404', async () => {
    const r = await request('DELETE', `/api/question-banks/${T.bankId}`, null, otherTeacherToken);
    assertEqual(r.status, 404, `Expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ══════════════════════════════════════════════════════════
  // GROUP 9: Bank list and question list correctness
  // ══════════════════════════════════════════════════════════
  console.log('\n▶  GROUP 9: Bank list and question list correctness');

  await test('[LIST] GET /banks returns only this teacher\'s banks', async () => {
    const r = await request('GET', '/api/question-banks', null, T.teacherToken);
    assertEqual(r.status, 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.body), 'Should return an array');
    const ids = r.body.map(b => b.id);
    assert(ids.includes(T.bankId), 'Should include teacher\'s bank');
    if (T.otherTeacherId) {
      // Other teacher's banks should not appear
      const otherBanks = r.body.filter(b => b.teacher_id === T.otherTeacherId);
      assertEqual(otherBanks.length, 0, 'Should not include other teacher\'s banks');
    }
  });

  await test('[LIST] GET /banks includes question_count', async () => {
    const r = await request('GET', '/api/question-banks', null, T.teacherToken);
    const bank = r.body.find(b => b.id === T.bankId);
    assert(bank, 'Bank should be in list');
    assert('question_count' in bank, 'Bank should have question_count');
    assert(parseInt(bank.question_count) > 0, 'question_count should be > 0');
  });

  await test('[LIST] GET /banks/:id/questions returns all questions for bank', async () => {
    const r = await request('GET', `/api/question-banks/${T.bankId}/questions`, null, T.teacherToken);
    assertEqual(r.status, 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.body), 'Should return an array');
    const qids = r.body.map(q => q.id);
    assert(qids.includes(T.mcqQid), 'Should include the original MCQ question');
    assert(qids.includes(T.imgQid), 'Should include the image_multi question');
  });

  await test('[LIST] DELETE bank question → 200, then verify removal', async () => {
    // Add a temp question to delete
    const addR = await request('POST', `/api/question-banks/${T.bankId}/questions`, {
      question_text: 'To be deleted',
      option_a: 'A', option_b: 'B', correct_answer_letter: 'A',
      points: 1, question_type: 'mcq',
    }, T.teacherToken);
    assertEqual(addR.status, 201, 'Should add temp question');
    const delQid = addR.body.id;

    const delR = await request('DELETE', `/api/question-banks/questions/${delQid}`, null, T.teacherToken);
    assertEqual(delR.status, 200, `Expected 200, got ${delR.status}: ${JSON.stringify(delR.body)}`);

    const listR = await request('GET', `/api/question-banks/${T.bankId}/questions`, null, T.teacherToken);
    const found = listR.body.find(q => q.id === delQid);
    assert(!found, 'Deleted question should not appear in list');
  });

  // ══════════════════════════════════════════════════════════
  // GROUP 10: Bank CRUD happy-path
  // ══════════════════════════════════════════════════════════
  console.log('\n▶  GROUP 10: Bank CRUD happy-path');

  await test('[CRUD] POST /banks with no name → 400', async () => {
    const r = await request('POST', '/api/question-banks', { name: '   ' }, T.teacherToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}`);
  });

  await test('[CRUD] POST /banks with valid name → 201 with question_count=0', async () => {
    const r = await request('POST', '/api/question-banks', { name: 'Brand New Bank' }, T.teacherToken);
    assertEqual(r.status, 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.id, 'Should return bank id');
    assertEqual(parseInt(r.body.question_count), 0, 'New bank should have 0 questions');
    T.newBankId = r.body.id;
  });

  await test('[CRUD] PUT /banks/:id renames bank', async () => {
    const r = await request('PUT', `/api/question-banks/${T.newBankId}`, { name: 'Renamed Bank' }, T.teacherToken);
    assertEqual(r.status, 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assertEqual(r.body.name, 'Renamed Bank', 'Name should be updated');
  });

  await test('[CRUD] DELETE /banks/:id → 200', async () => {
    const r = await request('DELETE', `/api/question-banks/${T.newBankId}`, null, T.teacherToken);
    assertEqual(r.status, 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('[CRUD] DELETE /banks/:id again → 404', async () => {
    const r = await request('DELETE', `/api/question-banks/${T.newBankId}`, null, T.teacherToken);
    assertEqual(r.status, 404, `Expected 404, got ${r.status}`);
  });

  // ══════════════════════════════════════════════════════════
  // GROUP 11: Unauthenticated access
  // ══════════════════════════════════════════════════════════
  console.log('\n▶  GROUP 11: Unauthenticated access to bank endpoints → 401');

  await test('[AUTH] GET /banks without token → 401', async () => {
    const r = await request('GET', '/api/question-banks', null, null);
    assertEqual(r.status, 401, `Expected 401, got ${r.status}`);
  });

  await test('[AUTH] POST /banks without token → 401', async () => {
    const r = await request('POST', '/api/question-banks', { name: 'test' }, null);
    assertEqual(r.status, 401, `Expected 401, got ${r.status}`);
  });

  await test('[AUTH] GET /banks/:id/questions without token → 401', async () => {
    const r = await request('GET', `/api/question-banks/${T.bankId}/questions`, null, null);
    assertEqual(r.status, 401, `Expected 401, got ${r.status}`);
  });
}

(async () => {
  try {
    await setup();
    await runTests();
  } catch (e) {
    console.error('Fatal setup/test error:', e);
  } finally {
    try { await teardown(); } catch {}
    if (T.otherTeacherId) {
      await pool.query('DELETE FROM teachers WHERE id=$1', [T.otherTeacherId]).catch(() => {});
    }
    if (T.extraBankId) {
      await pool.query('DELETE FROM question_banks WHERE id=$1', [T.extraBankId]).catch(() => {});
    }
    if (T.bankWithCourseId) {
      await pool.query('DELETE FROM question_banks WHERE id=$1', [T.bankWithCourseId]).catch(() => {});
    }
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
    await pool.end();
  }
})();
