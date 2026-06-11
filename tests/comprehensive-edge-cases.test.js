/**
 * WATHBA Comprehensive Bug-Fix Verification & Edge Case Test Suite
 * ====================================================================
 * Tests ALL the bug fixes applied in the June 2026 audit.
 *
 * Run: node tests/comprehensive-edge-cases.test.js
 * Prerequisites: Server must be running with latest code.
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
const BASE = `http://localhost:${PORT}`;

let passed = 0, failed = 0, skipped = 0;
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

async function waitMs(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function setup() {
  console.log('[setup] Creating comprehensive test fixtures ...');
  const pw = await bcrypt.hash('CompTest_2026!', 10);

  // Teacher
  const [t] = (await pool.query(
    "INSERT INTO teachers (username,password,name,slug) VALUES ($1,$2,'Comp Teacher','_comp_teacher') RETURNING id",
    ['_comp_teacher', pw])).rows;
  T.teacherId = t.id;
  T.teacherToken = makeToken({ id: T.teacherId, role: 'teacher', username: '_comp_teacher', name: 'Comp Teacher' });

  // Course (kept alive for whole test — deletion test is last)
  const [c] = (await pool.query(
    "INSERT INTO courses (name,teacher_id,price,is_published) VALUES ('Comp Course',$1,100,true) RETURNING id",
    [T.teacherId])).rows;
  T.courseId = c.id;

  const [sec] = (await pool.query(
    "INSERT INTO sections (course_id,title,sort_order) VALUES ($1,'Comp Section',1) RETURNING id",
    [T.courseId])).rows;
  T.sectionId = sec.id;

  // Student
  const [s] = (await pool.query(
    "INSERT INTO students (username,password,name,teacher_id,academic_stage) VALUES ('_comp_student',$1,'Comp Student',$2,'الصف الثالث الثانوي') RETURNING id",
    [pw, T.teacherId])).rows;
  T.studentId = s.id;
  T.studentToken = makeToken({ id: T.studentId, role: 'student', teacher_id: T.teacherId, username: '_comp_student', name: 'Comp Student' });

  // Assistant with specific permissions
  const [a] = (await pool.query(
    `INSERT INTO assistants (username,password,name,teacher_id,can_add_students,can_edit_students,can_delete_students,can_manage_exams,can_view_analytics,can_manage_payments,can_manage_courses,can_send_notifications,can_manage_recitations)
     VALUES ('_comp_asst',$1,'Comp Asst',$2,true,true,false,true,true,true,true,false,true) RETURNING id`,
    [pw, T.teacherId])).rows;
  T.assistantId = a.id;
  T.assistantToken = makeToken({ id: T.assistantId, teacher_id: T.teacherId, role: 'assistant', username: '_comp_asst', name: 'Comp Asst' });

  // Enroll student
  await pool.query(
    "INSERT INTO student_course_enrollment (student_id,course_id,status) VALUES ($1,$2,'active')",
    [T.studentId, T.courseId]);

  // Manual exam with questions
  const [ex] = (await pool.query(
    `INSERT INTO exams (title,duration_minutes,total_score,course_id,teacher_id,pass_score,is_published,start_date,end_date)
     VALUES ('Comp Exam',30,100,$1,$2,50,true,NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 day') RETURNING id`,
    [T.courseId, T.teacherId])).rows;
  T.examId = ex.id;
  const [q1] = (await pool.query(
    `INSERT INTO questions (exam_id,question_text,option_a,option_b,correct_answer_letter,points,question_type)
     VALUES ($1,'Q1','A','B','A',1,'mcq') RETURNING id`,
    [T.examId])).rows;
  T.questionId = q1.id;
  const [q2] = (await pool.query(
    `INSERT INTO questions (exam_id,question_text,option_a,option_b,correct_answer_letter,points,question_type)
     VALUES ($1,'Q2','صح','خطأ','A',1,'true_false') RETURNING id`,
    [T.examId])).rows;
  T.questionId2 = q2.id;

  // Question bank
  const [qb] = (await pool.query(
    "INSERT INTO question_banks (name,subject,teacher_id) VALUES ('Comp Bank','علوم',$1) RETURNING id",
    [T.teacherId])).rows;
  T.bankId = qb.id;
  for (let i = 0; i < 5; i++) {
    await pool.query(
      `INSERT INTO bank_questions (bank_id,question_text,option_a,option_b,correct_answer_letter,points,question_type,difficulty)
       VALUES ($1,'Bank Q $i','A','B','A',1,'mcq','medium')`,
      [T.bankId]);
  }

  // Video for course completion test
  const [v] = (await pool.query(
    "INSERT INTO videos (title,file_path_or_url,duration_minutes,course_id,sort_order) VALUES ('Comp Video','/uploads/videos/test.mp4',10,$1,1) RETURNING id",
    [T.courseId])).rows;
  T.videoId = v.id;

  console.log('[setup] Done.\n');
}

async function teardown() {
  console.log('\n[teardown] Cleaning up ...');
  await pool.query('DELETE FROM teachers WHERE id=$1', [T.teacherId]);
  await pool.query('DELETE FROM students WHERE id=$1', [T.studentId]);
  await pool.query('DELETE FROM assistants WHERE id=$1', [T.assistantId]);
}

// ─────────────────────────────────────────────────────────────────
async function runTests() {
  // ═══════════════ GROUP 1: Exam Session Security (BUG-1 FIX) ════
  console.log('\n▶  GROUP 1: Exam Session & Timer Security');

  await test('[FIX-1] Submit without exam session → 409 (NO_SESSION_SNAPSHOT)', async () => {
    // Create a new exam just for this test (no session created yet)
    const [ex] = (await pool.query(
      `INSERT INTO exams (title,duration_minutes,total_score,teacher_id,pass_score,is_published,start_date,end_date)
       VALUES ('NoSession',30,100,$1,50,true,NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 day') RETURNING id`,
      [T.teacherId])).rows;
    await pool.query(
      `INSERT INTO questions (exam_id,question_text,option_a,option_b,correct_answer_letter,points,question_type)
       VALUES ($1,'Q','A','B','A',1,'mcq')`,
      [ex.id]);
    // Submit WITHOUT calling /take first
    const r = await request('POST', `/api/exams/${ex.id}/submit`, { answers: { 999: 'A' } }, T.studentToken);
    assert(r.status === 409, `Expected 409 (no session), got ${r.status}`);
    await pool.query('DELETE FROM exams WHERE id=$1', [ex.id]);
  });

  await test('[FIX-1] Take exam then submit → 200', async () => {
    const takeR = await request('GET', `/api/exams/${T.examId}/take`, null, T.studentToken);
    assertEqual(takeR.status, 200);
    const qs = takeR.body.questions;
    const ans = {};
    qs.forEach(q => { ans[q.id] = 'A'; });
    const r = await request('POST', `/api/exams/${T.examId}/submit`, { answers: ans }, T.studentToken);
    assertEqual(r.status, 200);
    T.resultId = r.body?.result?.id;
  });

  await test('Double submission → 409 (already submitted)', async () => {
    const r = await request('POST', `/api/exams/${T.examId}/submit`, { answers: { 1: 'A' } }, T.studentToken);
    assertEqual(r.status, 409);
  });

  await test('Submit with forged question IDs → 400/409 (rejected)', async () => {
    const r = await request('POST', `/api/exams/${T.examId}/submit`, { answers: { 99999: 'A', 88888: 'B' } }, T.studentToken);
    assert(r.status !== 200, `Forged IDs should not be accepted, got ${r.status}`);
  });

  // ═══════════════ GROUP 2: End Date Extension (BUG-2 FIX) ═══════
  console.log('\n▶  GROUP 2: Exam End Date Extension Prevention');

  await test('[FIX-2] Extending end_date after submissions → 409', async () => {
    const r = await request('PUT', `/api/exams/${T.examId}`, {
      title: 'Comp Exam', duration_minutes: 30, total_score: 100,
      pass_score: 50, end_date: new Date(Date.now() + 86400000 * 30).toISOString(),
    }, T.teacherToken);
    assert(r.status === 409, `Expected 409 (can't extend), got ${r.status}: ${r.raw?.slice(0,200)}`);
  });

  await test('Shortening end_date is still allowed', async () => {
    const r = await request('PUT', `/api/exams/${T.examId}`, {
      title: 'Comp Exam', duration_minutes: 30, total_score: 100,
      pass_score: 50, end_date: new Date(Date.now() + 3600000).toISOString(),
    }, T.teacherToken);
    assertEqual(r.status, 200);
  });

  // ═══════════════ GROUP 3: Exam Retry Logic ═════════════════════
  console.log('\n▶  GROUP 3: Exam Retry Logic');

  // Create a dedicated exam for retry tests (far-future end_date, not touched by Group 2)
  await test('[setup] Create retry test exam (take & submit first)', async () => {
    const [re] = (await pool.query(
      `INSERT INTO exams (title,duration_minutes,total_score,course_id,teacher_id,pass_score,is_published,start_date,end_date)
       VALUES ('Retry Exam',30,100,$1,$2,50,true,NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days') RETURNING id`,
      [T.courseId, T.teacherId])).rows;
    T.retryExamId = re.id;
    await pool.query(
      `INSERT INTO questions (exam_id,question_text,option_a,option_b,correct_answer_letter,points,question_type)
       VALUES ($1,'RQ1','A','B','A',1,'mcq'),($1,'RQ2','صح','خطأ','A',1,'true_false')`,
      [T.retryExamId]);
    // Take the exam first
    const takeR = await request('GET', `/api/exams/${T.retryExamId}/take`, null, T.studentToken);
    assertEqual(takeR.status, 200);
    const ans = {};
    takeR.body.questions.forEach(q => { ans[q.id] = 'A'; });
    const subR = await request('POST', `/api/exams/${T.retryExamId}/submit`, { answers: ans }, T.studentToken);
    assertEqual(subR.status, 200);
  });

  await test('Retry request on already-taken exam → 201', async () => {
    const r = await request('POST', `/api/exams/${T.retryExamId}/retry-request`, { message: 'أريد إعادة' }, T.studentToken);
    assertEqual(r.status, 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('Duplicate retry while pending → 409', async () => {
    const r = await request('POST', `/api/exams/${T.retryExamId}/retry-request`, { message: 'ثانية' }, T.studentToken);
    assertEqual(r.status, 409);
  });

  await test('Approve retry request → 200', async () => {
    const listR = await request('GET', '/api/exams/retry-requests', null, T.teacherToken);
    assert(listR.body.length > 0, 'Should have retry requests');
    const reqId = listR.body[0].id;
    const r = await request('PUT', `/api/exams/retry-requests/${reqId}/approve`, { teacher_note: 'موافق' }, T.teacherToken);
    assertEqual(r.status, 200);
  });

  await test('Take exam again after retry approved → 200', async () => {
    const r = await request('GET', `/api/exams/${T.retryExamId}/take`, null, T.studentToken);
    assertEqual(r.status, 200);
  });

  // Wait for rate-limit windows to expire (submitLimiter: 5 per 60s, loginLimiter: 30 per 15m)
  await new Promise(r => setTimeout(r, 70000));

  // ═══════════════ GROUP 4: Course Deletion Guard (BUG-3 FIX) ════
  console.log('\n▶  GROUP 4: Course Deletion Guard');

  await test('[FIX-3] Delete course with active enrollments (no force) → 409', async () => {
    const [tmpCourse] = (await pool.query(
      "INSERT INTO courses (name,teacher_id,price,is_published) VALUES ('Del Test Course',$1,0,true) RETURNING id",
      [T.teacherId])).rows;
    await pool.query(
      "INSERT INTO student_course_enrollment (student_id,course_id,status) VALUES ($1,$2,'active')",
      [T.studentId, tmpCourse.id]);
    const r = await request('DELETE', `/api/courses/${tmpCourse.id}`, { }, T.teacherToken);
    assert(r.status === 409, `Expected 409 (enrollments exist), got ${r.status}: ${r.raw?.slice(0,200)}`);
    await pool.query('DELETE FROM courses WHERE id=$1', [tmpCourse.id]);
  });

  // ═══════════════ GROUP 5: Input Validation ═════════════════════
  console.log('\n▶  GROUP 5: Input Validation & Injection Protection');

  await test('SQL injection in exam title → handled', async () => {
    const r = await request('POST', '/api/exams', {
      title: "'); DROP TABLE students; --", duration_minutes: 30,
      total_score: 100, pass_score: 50,
    }, T.teacherToken);
    assert(r.status !== 500, `Server error: ${r.status}`);
  });

  await test('JSON prototype pollution → handled', async () => {
    const r = await request('POST', '/api/exams', {
      title: 'Proto', duration_minutes: 30, total_score: 100, pass_score: 50,
      __proto__: { malicious: true },
    }, T.teacherToken);
    assert(r.status !== 500, `Prototype pollution crashed server: ${r.status}`);
  });

  await test('Exceptionally long answer (6000 chars) → 400', async () => {
    const r = await request('POST', `/api/exams/${T.examId}/submit`, { answers: { 1: 'A'.repeat(6000) } }, T.studentToken);
    assertEqual(r.status, 400);
  });

  await test('Negative exam duration → 400', async () => {
    const r = await request('POST', '/api/exams', { title: 'Neg', duration_minutes: -5, total_score: 100, pass_score: 50 }, T.teacherToken);
    assertEqual(r.status, 400);
  });

  await test('Zero total score → 400', async () => {
    const r = await request('POST', '/api/exams', { title: 'Zero', duration_minutes: 30, total_score: 0, pass_score: 0 }, T.teacherToken);
    assertEqual(r.status, 400);
  });

  // ═══════════════ GROUP 6: Auth & Token Security ════════════════
  console.log('\n▶  GROUP 6: Authentication & Token Security');

  await test('Access with revoked token → 401', async () => {
    const tok = makeToken({ id: T.studentId, role: 'student', teacher_id: T.teacherId });
    const r1 = await request('POST', '/api/auth/logout', null, tok);
    assertEqual(r1.status, 200);
    const r2 = await request('GET', '/api/exams/student/available', null, tok);
    assertEqual(r2.status, 401);
  });

  await test('Login with wrong password → 401', async () => {
    const r = await request('POST', '/api/auth/login', { username: '_comp_student', password: 'WRONG', role: 'student', device_id: 'test-dev-001' });
    assertEqual(r.status, 401, `Expected 401, got ${r.status}`);
  });

  await test('Login without password → 400', async () => {
    const r = await request('POST', '/api/auth/login', { username: '_comp_student', role: 'student' });
    assertEqual(r.status, 400);
  });

  await test('Login with non-existent role → 401', async () => {
    const r = await request('POST', '/api/auth/login', { username: '_comp_nonexist_' + Date.now(), password: 'CompTest_2026!', role: 'nonexistent' });
    assertEqual(r.status, 401);
  });

  await test('GET /api/auth/me without token → 401', async () => {
    const r = await request('GET', '/api/auth/me');
    assertEqual(r.status, 401);
  });

  // ═══════════════ GROUP 7: Leaderboard ══════════════════════════
  console.log('\n▶  GROUP 7: Leaderboard & Points');

  await test('View leaderboard → 200', async () => {
    const r = await request('GET', '/api/payments/leaderboard', null, T.teacherToken);
    assertEqual(r.status, 200);
  });

  await test('Manual leaderboard reset → 200', async () => {
    const r = await request('POST', '/api/payments/leaderboard/reset', {}, T.teacherToken);
    assertEqual(r.status, 200);
  });

  // ═══════════════ GROUP 8: Data Isolation ═══════════════════════
  console.log('\n▶  GROUP 8: Data Isolation');

  await test('Student cannot access other teacher exam → 403', async () => {
    const pw2 = await bcrypt.hash('Other_2026!', 10);
    const [oT] = (await pool.query(
      "INSERT INTO teachers (username,password,name,slug) VALUES ('_comp_other',$1,'Other T','_comp_other') RETURNING id",
      [pw2])).rows;
    const [oEx] = (await pool.query(
      `INSERT INTO exams (title,duration_minutes,total_score,teacher_id,pass_score,is_published)
       VALUES ('Other',30,100,$1,50,true) RETURNING id`,
      [oT.id])).rows;
    const r = await request('GET', `/api/exams/${oEx.id}/take`, null, T.studentToken);
    assert(r.status !== 200, 'Should not access others exam');
    await pool.query('DELETE FROM exams WHERE id=$1', [oEx.id]);
    await pool.query('DELETE FROM teachers WHERE id=$1', [oT.id]);
  });

  await test('Assistant cannot access other teacher data', async () => {
    const pw2 = await bcrypt.hash('Other_2026!', 10);
    const [oT] = (await pool.query(
      "INSERT INTO teachers (username,password,name,slug) VALUES ('_comp_other2',$1,'Other2','_comp_other2') RETURNING id",
      [pw2])).rows;
    const badToken = makeToken({ id: 99999, teacher_id: oT.id, role: 'assistant', username: 'bad', name: 'Bad' });
    const r = await request('GET', '/api/students', null, badToken);
    assert(r.status === 401 || r.status === 403, `Expected 401/403, got ${r.status}`);
    await pool.query('DELETE FROM teachers WHERE id=$1', [oT.id]);
  });

  // ═══════════════ GROUP 9: Payment Verification ═════════════════
  console.log('\n▶  GROUP 9: Payment Security');

  await test('Payment under-priced → 400 (AMOUNT_MISMATCH)', async () => {
    const [pay] = (await pool.query(
      "INSERT INTO payments (student_id,course_id,amount,method,status) VALUES ($1,$2,10,'instapay','pending') RETURNING id",
      [T.studentId, T.courseId])).rows;
    const r = await request('PUT', `/api/payments/${pay.id}/verify`, { status: 'verified' }, T.teacherToken);
    assertEqual(r.status, 400);
    await pool.query('DELETE FROM payments WHERE id=$1', [pay.id]);
  });

  await test('Payment correct amount → 200 verified', async () => {
    const [pay] = (await pool.query(
      "INSERT INTO payments (student_id,course_id,amount,method,status) VALUES ($1,$2,100,'instapay','pending') RETURNING id",
      [T.studentId, T.courseId])).rows;
    // Use ASSISTANT token because verified_by FK references assistants(id), not teachers(id)
    const r = await request('PUT', `/api/payments/${pay.id}/verify`, { status: 'verified' }, T.assistantToken);
    assertEqual(r.status, 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    await pool.query('DELETE FROM payments WHERE id=$1', [pay.id]);
  });

  // ═══════════════ GROUP 10: Assistant Permissions ═══════════════
  console.log('\n▶  GROUP 10: Assistant Permission Enforcement');

  await test('Assistant can_manage_exams → create exam OK', async () => {
    const r = await request('POST', '/api/exams', { title: 'Asst Exam', duration_minutes: 30, total_score: 100, pass_score: 50 }, T.assistantToken);
    assertEqual(r.status, 201);
    if (r.body?.id) await pool.query('DELETE FROM exams WHERE id=$1', [r.body.id]);
  });

  await test('Assistant no can_delete_students → 403', async () => {
    const r = await request('DELETE', `/api/students/${T.studentId}`, null, T.assistantToken);
    assertEqual(r.status, 403);
  });

  // ═══════════════ GROUP 11: Exam Result Access ══════════════════
  console.log('\n▶  GROUP 11: Exam Results');

  await test('View own exam result → 200', async () => {
    if (!T.resultId) { skipped++; return; }
    const r = await request('GET', `/api/exams/results/${T.resultId}/review`, null, T.studentToken);
    assertEqual(r.status, 200);
  });

  await test('No access to another student result → 403', async () => {
    if (!T.resultId) { skipped++; return; }
    const pw2 = await bcrypt.hash('Other!26', 10);
    const [oS] = (await pool.query(
      "INSERT INTO students (username,password,name,teacher_id) VALUES ('_comp_other_s',$1,'OS',$2) RETURNING id",
      [pw2, T.teacherId])).rows;
    const oToken = makeToken({ id: oS.id, role: 'student', teacher_id: T.teacherId });
    const r = await request('GET', `/api/exams/results/${T.resultId}/review`, null, oToken);
    assertEqual(r.status, 403);
    await pool.query('DELETE FROM students WHERE id=$1', [oS.id]);
  });

  // ═══════════════ GROUP 12: Student Device Security ═════════════
  console.log('\n▶  GROUP 12: Student Device Security');

  await test('[FIX-6] Login without device_id for student → 400', async () => {
    // Use a fresh student to avoid rate limit on main student
    const pwF = await bcrypt.hash('Fresh!26', 10);
    const [fresh] = (await pool.query(
      "INSERT INTO students (username,password,name,teacher_id) VALUES ('_comp_fresh',$1,'Fresh',$2) RETURNING id",
      [pwF, T.teacherId])).rows;
    // X-Tenant-Slug is required by subdomainTenant middleware for student login (non-prod falls back to header)
    const r = await request('POST', '/api/auth/login', { username: '_comp_fresh', password: 'Fresh!26', role: 'student' }, null, { 'X-Tenant-Slug': '_comp_teacher' });
    assertEqual(r.status, 400, `Expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
    await pool.query('DELETE FROM students WHERE id=$1', [fresh.id]);
  });

  await test('Login WITH device_id → 200', async () => {
    const pwF = await bcrypt.hash('Fresh2!26', 10);
    const [fresh] = (await pool.query(
      "INSERT INTO students (username,password,name,teacher_id) VALUES ('_comp_fresh2',$1,'Fresh2',$2) RETURNING id",
      [pwF, T.teacherId])).rows;
    const r = await request('POST', '/api/auth/login', { username: '_comp_fresh2', password: 'Fresh2!26', role: 'student', device_id: 'test-dev-002' }, null, { 'X-Tenant-Slug': '_comp_teacher' });
    assertEqual(r.status, 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    await pool.query('DELETE FROM students WHERE id=$1', [fresh.id]);
  });

  // ═══════════════ GROUP 13: ID Validation Edge Cases ══════════════
  console.log('\n▶  GROUP 13: ID Validation Edge Cases');

  await test('[ID-VAL] GET student results with string ID → 400', async () => {
    const r = await request('GET', '/api/students/abc/results', null, T.teacherToken);
    assertEqual(r.status, 400);
  });

  await test('[ID-VAL] GET student profile with negative ID → 400', async () => {
    const r = await request('GET', '/api/students/-1/profile', null, T.teacherToken);
    assertEqual(r.status, 400);
  });

  await test('[ID-VAL] PUT student with zero ID → 400', async () => {
    const r = await request('PUT', '/api/students/0', { name: 'X' }, T.teacherToken);
    assertEqual(r.status, 400);
  });

  await test('[ID-VAL] DELETE student with NaN ID → 400', async () => {
    const r = await request('DELETE', '/api/students/null', null, T.teacherToken);
    assertEqual(r.status, 400);
  });

  await test('[ID-VAL] DELETE course with string ID → 400', async () => {
    const r = await request('DELETE', '/api/courses/xyz', {}, T.teacherToken);
    assertEqual(r.status, 400);
  });

  await test('[ID-VAL] Publish course with negative ID → 400', async () => {
    const r = await request('POST', '/api/courses/-5/publish', {}, T.teacherToken);
    assertEqual(r.status, 400);
  });

  await test('[ID-VAL] Verify payment with object ID → 400', async () => {
    const r = await request('PUT', '/api/payments/NaN/verify', { status: 'verified' }, T.assistantToken);
    assertEqual(r.status, 400);
  });

  await test('[ID-VAL] Read notification with huge ID → 400', async () => {
    const r = await request('PUT', '/api/notifications/999999999999', { status: 'read' }, T.studentToken);
    assertEqual(r.status, 400);
  });

  await test('[ID-VAL] Suspend student with decimal ID → 400', async () => {
    const r = await request('POST', '/api/students/3.14/suspend', { action: 'suspend' }, T.teacherToken);
    assertEqual(r.status, 400);
  });

  await test('[ID-VAL] DELETE assistant with ID exceeding MAX_INT → 400', async () => {
    const r = await request('DELETE', '/api/assistants/2147483648', null, T.teacherToken);
    assertEqual(r.status, 400);
  });

  // ═══════════════ GROUP 14: Input Sanitization ═══════════════════
  console.log('\n▶  GROUP 14: Input Sanitization');

  await test('[SANITIZE] Create student with HTML in name → sanitized(?) or 400', async () => {
    const r = await request('POST', '/api/students', {
      name: '<script>alert(1)</script>John', username: '_san_test_1',
      password: 'SanTest_26!',
    }, T.teacherToken);
    // Should either reject or sanitize — not store raw
    assert(r.status === 200 || r.status === 400 || r.status === 201,
      `Unexpected status ${r.status}`);
    if (r.status === 201 || r.status === 200) {
      // Fetch and verify the name was sanitized
      const q = await pool.query("SELECT name FROM students WHERE username='_san_test_1'");
      if (q.rows.length) {
        assert(!q.rows[0].name.includes('<script>'), 'Name should not contain raw HTML');
        await pool.query("DELETE FROM students WHERE username='_san_test_1'");
      }
    }
  });

  await test('[SANITIZE] Create student with control chars in name → sanitized', async () => {
    const r = await request('POST', '/api/students', {
      name: 'John\u0000Doe\u0007\u001b', username: '_san_test_2', password: 'SanTest_26!',
    }, T.teacherToken);
    assert(r.status === 200 || r.status === 201, `Expected 200/201, got ${r.status}`);
    if (r.status === 200 || r.status === 201) {
      const q = await pool.query("SELECT name FROM students WHERE username='_san_test_2'");
      if (q.rows.length) {
        assertEqual(q.rows[0].name, 'JohnDoe', 'Control chars should be stripped');
        await pool.query("DELETE FROM students WHERE username='_san_test_2'");
      }
    }
  });

  await test('[SANITIZE] Create student with very long name (200 chars) → 400 or truncated', async () => {
    const r = await request('POST', '/api/students', {
      name: 'A'.repeat(200), username: '_san_test_3', password: 'SanTest_26!',
    }, T.teacherToken);
    assert(r.status === 400 || r.status === 200 || r.status === 201,
      `Unexpected status ${r.status}`);
    if (r.status !== 400) {
      const q = await pool.query("SELECT name FROM students WHERE username='_san_test_3'");
      if (q.rows.length) {
        assert(q.rows[0].name.length <= 100, 'Name should be truncated to 100');
        await pool.query("DELETE FROM students WHERE username='_san_test_3'");
      }
    }
  });

  // ═══════════════ GROUP 15: Payment force_enroll Bypass ═══════════
  console.log('\n▶  GROUP 15: Payment / force_enroll Edge Cases');

  await test('[PAYMENT] force_enroll=true with insufficient amount → 400', async () => {
    const [pay] = (await pool.query(
      "INSERT INTO payments (student_id,course_id,amount,method,status) VALUES ($1,$2,5,'instapay','pending') RETURNING id",
      [T.studentId, T.courseId])).rows;
    const r = await request('PUT', `/api/payments/${pay.id}/verify`,
      { status: 'verified', force_enroll: true }, T.assistantToken);
    assertEqual(r.status, 400, `Expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
    await pool.query('DELETE FROM payments WHERE id=$1', [pay.id]);
  });

  await test('[PAYMENT] force_enroll=true with sufficient amount → 200', async () => {
    const [pay] = (await pool.query(
      "INSERT INTO payments (student_id,course_id,amount,method,status) VALUES ($1,$2,100,'instapay','pending') RETURNING id",
      [T.studentId, T.courseId])).rows;
    const r = await request('PUT', `/api/payments/${pay.id}/verify`,
      { status: 'verified', force_enroll: true }, T.assistantToken);
    assertEqual(r.status, 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    await pool.query('DELETE FROM payments WHERE id=$1', [pay.id]);
  });

  // ═══════════════ GROUP 16: Notification XSS Prevention ═══════════
  console.log('\n▶  GROUP 16: Notification Message Sanitization');

  await test('[NOTIF] Send notification with script tag → sanitized', async () => {
    const r = await request('POST', '/api/notifications', {
      student_ids: [T.studentId],
      title: 'Test',
      body: '<script>alert("xss")</script>Hello <b>student</b>',
      message_type: 'general',
    }, T.teacherToken);
    assertEqual(r.status, 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    // Verify the stored body is sanitized (strip scripts)
    const q = await pool.query(
      'SELECT body FROM notifications WHERE student_id=$1 ORDER BY id DESC LIMIT 1',
      [T.studentId]);
    if (q.rows.length) {
      assert(!q.rows[0].body.includes('<script>'), 'Script tags should be stripped');
    }
  });

  await test('[NOTIF] Send notification with empty body → 400', async () => {
    const r = await request('POST', '/api/notifications', {
      student_ids: [T.studentId],
      title: 'Empty',
      body: '',
      message_type: 'general',
    }, T.teacherToken);
    assertEqual(r.status, 400);
  });

  // ═══════════════ GROUP 17: Bulk Import Edge Cases ═══════════════
  console.log('\n▶  GROUP 17: Bulk Import Edge Cases');

  await test('[BULK] Bulk import with empty list → 400', async () => {
    const r = await request('POST', '/api/students/bulk-import', { students: [] }, T.teacherToken);
    assertEqual(r.status, 400);
  });

  await test('[BULK] Bulk import with student missing name → 400/200 (skipped)', async () => {
    const r = await request('POST', '/api/students/bulk-import', {
      students: [{ username: '_bulk_noname', password: 'Test1234' }],
    }, T.teacherToken);
    assert(r.status === 400 || r.status === 200, `Expected 400 or 200, got ${r.status}`);
  });

  await test('[BULK] Bulk import with duplicate usernames → handled (no crash)', async () => {
    const r = await request('POST', '/api/students/bulk-import', {
      students: [
        { name: 'Dup1', username: '_bulk_dup', password: 'Test1234' },
        { name: 'Dup2', username: '_bulk_dup', password: 'Test1234' },
      ],
    }, T.teacherToken);
    assert(r.status !== 500, `Server should not crash on duplicates: ${r.status}`);
  });

  await test('[BULK] Bulk import with XSS in name fields → sanitized', async () => {
    const r = await request('POST', '/api/students/bulk-import', {
      students: [{
        name: '<img src=x onerror=alert(1)>Hacker',
        username: '_bulk_xss_' + Date.now(),
        password: 'Test1234',
      }],
    }, T.teacherToken);
    assert(r.status !== 500, `Server error: ${r.status}`);
    // If successful, verify no raw HTML stored
    if (r.status === 200) {
      const q = await pool.query("SELECT name FROM students WHERE username LIKE '_bulk_xss_%'");
      for (const row of q.rows) {
        assert(!row.name.includes('<img'), 'HTML should be stripped from imported names');
      }
      await pool.query("DELETE FROM students WHERE username LIKE '_bulk_xss_%'");
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('═'.repeat(65));
console.log('  WATHBA Comprehensive Bug-Fix Verification Suite');
console.log('═'.repeat(65) + '\n');

(async () => {
  try {
    await setup();
  } catch (e) {
    console.error('[setup] FAILED:', e.message);
    process.exit(1);
  }
  try {
    await runTests();
  } finally {
    await teardown();
    await pool.end();
  }
  console.log('\n' + '═'.repeat(65));
  const total = passed + failed + skipped;
  const status = failed > 0 ? '❌ SOME FAILED' : '✅ ALL PASSED';
  console.log(`  ${status}  |  ${passed}/${total} passed  |  ${failed} failed  |  ${skipped} skipped`);
  console.log('═'.repeat(65));
  if (failed > 0) process.exit(1);
})();
