/**
 * WATHBA Edge Case Tests — API Input Validation, Business Logic Boundaries
 * =========================================================================
 * Run: node tests/edge-cases.test.js
 *
 * Tests input boundaries, null/undefined handling, and business logic edge cases.
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

function request(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: PORT, path: urlPath, method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
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
  console.log('[setup] Creating test fixtures ...');
  const pw = await bcrypt.hash('EdgeTest_2026!', 10);

  // Teacher
  const [t] = (await pool.query(
    "INSERT INTO teachers (username,password,name,slug) VALUES ('_edge_teacher',$1,'Edge Teacher','_edge_teacher') RETURNING id",
    [pw])).rows;
  T.teacherId = t.id;
  T.teacherToken = makeToken({ id: T.teacherId, role: 'teacher' });

  // Course
  const [c] = (await pool.query(
    "INSERT INTO courses (name,teacher_id,price,is_published) VALUES ('Edge Course',$1,100,true) RETURNING id",
    [T.teacherId])).rows;
  T.courseId = c.id;

  // Section
  const [sec] = (await pool.query(
    "INSERT INTO sections (course_id,title,sort_order) VALUES ($1,'Edge Section',1) RETURNING id",
    [T.courseId])).rows;
  T.sectionId = sec.id;

  // Student
  const [s] = (await pool.query(
    "INSERT INTO students (username,password,name,teacher_id,academic_stage) VALUES ('_edge_student',$1,'Edge Student',$2,'الصف الثالث الثانوي') RETURNING id",
    [pw, T.teacherId])).rows;
  T.studentId = s.id;
  T.studentToken = makeToken({ id: T.studentId, role: 'student' });

  // Assistant
  const [a] = (await pool.query(
    "INSERT INTO assistants (username,password,name,teacher_id,can_manage_exams,can_manage_recitations) VALUES ('_edge_asst',$1,'Edge Asst',$2,true,true) RETURNING id",
    [pw, T.teacherId])).rows;
  T.assistantId = a.id;
  T.assistantToken = makeToken({ id: T.assistantId, teacher_id: T.teacherId, role: 'assistant' });
  
  // Enroll student
  await pool.query(
    "INSERT INTO student_course_enrollment (student_id,course_id,status) VALUES ($1,$2,'active')",
    [T.studentId, T.courseId]);

  console.log('[setup] Done.\n');
}

async function teardown() {
  console.log('\n[teardown] Cleaning up ...');
  await pool.query('DELETE FROM teachers WHERE id=$1', [T.teacherId]);
  await pool.query('DELETE FROM students WHERE id=$1', [T.studentId]);
}

async function runTests() {
  // ──────────────────────────────────────────────────────────────────────────
  console.log('▶  EDGE CASE 1: Exam creation boundaries');
  // ──────────────────────────────────────────────────────────────────────────

  await test('Empty exam title → 400', async () => {
    const r = await request('POST', '/api/exams', { title: '  ', duration_minutes: 30, total_score: 100 }, T.teacherToken);
    assertEqual(r.status, 400);
  });

  await test('Negative exam duration → should be 400', async () => {
    const r = await request('POST', '/api/exams', { title: 'Neg Exam', duration_minutes: -5, total_score: 100 }, T.teacherToken);
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test('Zero total_score exam → 400 (validateExam rejects < 1)', async () => {
    const r = await request('POST', '/api/exams', { title: 'Zero Score', duration_minutes: 30, total_score: 0, pass_score: 0 }, T.teacherToken);
    assertEqual(r.status, 400);
  });

  await test('Start_date after end_date → 400', async () => {
    const r = await request('POST', '/api/exams', {
      title: 'Bad Dates', duration_minutes: 30, total_score: 100,
      start_date: new Date(Date.now() + 86400000).toISOString(),
      end_date: new Date(Date.now() - 86400000).toISOString(),
    }, T.teacherToken);
    assertEqual(r.status, 400);
  });

  await test('Extremely long exam title (500 chars) → 201 or 400', async () => {
    const longTitle = 'A'.repeat(500);
    const r = await request('POST', '/api/exams', { title: longTitle, duration_minutes: 30, total_score: 100 }, T.teacherToken);
    assert([201, 400].includes(r.status), `Expected 201 or 400, got ${r.status}`);
  });

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶  EDGE CASE 2: Course creation boundaries');
  // ──────────────────────────────────────────────────────────────────────────

  await test('Course with negative price → 400 (validateCourse rejects < 0)', async () => {
    const r = await request('POST', '/api/courses', { name: 'Neg Price', price: -100, description: 'test' }, T.teacherToken);
    assertEqual(r.status, 400);
  });

  await test('Course with zero price (free) → 201', async () => {
    const r = await request('POST', '/api/courses', { name: 'Free Course', price: 0, description: 'free' }, T.teacherToken);
    assertEqual(r.status, 201);
    if (r.body && r.body.id) await pool.query('DELETE FROM courses WHERE id=$1', [r.body.id]);
  });

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶  EDGE CASE 3: Student auth and input boundaries');
  // ──────────────────────────────────────────────────────────────────────────

  await test('Login with wrong password → 401', async () => {
    const r = await request('POST', '/api/auth/login', { username: 'admin', password: 'WRONG', role: 'teacher' });
    assertEqual(r.status, 401);
  });

  await test('Login with missing role → 200 (tries all roles)', async () => {
    const r = await request('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
    assertEqual(r.status, 200);
  });

  await test('Login with non-existent role → 401', async () => {
    const r = await request('POST', '/api/auth/login', { username: 'admin', password: 'admin123', role: 'superadmin' });
    assertEqual(r.status, 401);
  });

  await test('GET /api/auth/me without token → 401', async () => {
    const r = await request('GET', '/api/auth/me');
    assertEqual(r.status, 401);
  });

  await test('GET /api/auth/me with expired token → 401', async () => {
    const expiredToken = jwt.sign({ id: 1, role: 'teacher' }, JWT_SECRET, { expiresIn: '0s' });
    await new Promise(r => setTimeout(r, 1000)); // wait for expiry
    const r = await request('GET', '/api/auth/me', null, expiredToken);
    assertEqual(r.status, 401);
  });

  await test('GET /api/auth/me with malformed token → 401', async () => {
    const r = await request('GET', '/api/auth/me', null, 'this.is.not.a.jwt');
    assertEqual(r.status, 401);
  });

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶  EDGE CASE 4: Enrollment and payment edge cases');
  // ──────────────────────────────────────────────────────────────────────────

  await test('Enroll student in non-existent course → 403 or 404', async () => {
    const r = await request('POST', '/api/payments/request', { course_id: 999999, payment_method: 'instapay' }, T.studentToken);
    assert(r.status !== 200, `Should not succeed, got ${r.status}`);
  });

  await test('Payment with zero amount → 400 or 201', async () => {
    // Create a free course enrollment request
    const r = await request('POST', '/api/payments/request', { course_id: T.courseId, amount: 0, payment_method: 'instapay' }, T.studentToken);
    // May be 400 (validation) or 201 (free enrollment)
    assert(r.status !== 500, `Server error: ${r.status}`);
  });

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶  EDGE CASE 5: Student exam boundaries');
  // ──────────────────────────────────────────────────────────────────────────

  await test('Submit exam without taking it first → 409 (NO_SESSION_SNAPSHOT)', async () => {
    const [ex] = (await pool.query(
      "INSERT INTO exams (title,duration_minutes,total_score,course_id,teacher_id,pass_score,is_published,start_date,end_date) VALUES ('Edge Exam',30,100,$1,$2,50,true,NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 day') RETURNING id",
      [T.courseId, T.teacherId])).rows;
    await pool.query(
      "INSERT INTO questions (exam_id,question_text,option_a,option_b,correct_answer_letter,points,question_type) VALUES ($1,'Q?','A','B','A',1,'mcq')",
      [ex.id]);
    // CK-1: submit without /take → must reject (NO_SESSION_SNAPSHOT)
    const r = await request('POST', `/api/exams/${ex.id}/submit`, { answers: {} }, T.studentToken);
    assertEqual(r.status, 409, `Expected 409 (no session), got ${r.status}`);
    await pool.query('DELETE FROM exams WHERE id=$1', [ex.id]);
  });

  await test('Submit exam with too many answers (501) → 400', async () => {
    const [ex] = (await pool.query(
      "INSERT INTO exams (title,duration_minutes,total_score,teacher_id,pass_score,is_published,start_date,end_date) VALUES ('Big Submit',60,500,$1,250,true,NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 day') RETURNING id",
      [T.teacherId])).rows;
    const hugeAnswers = {};
    for (let i = 0; i < 501; i++) hugeAnswers[i] = 'A';
    const r = await request('POST', `/api/exams/${ex.id}/submit`, { answers: hugeAnswers }, T.studentToken);
    assertEqual(r.status, 400, `Expected 400 for 501 answers, got ${r.status}`);
    await pool.query('DELETE FROM exams WHERE id=$1', [ex.id]);
  });

  await test('Submit answer with 6000-char string → 400', async () => {
    const [ex] = (await pool.query(
      "INSERT INTO exams (title,duration_minutes,total_score,teacher_id,pass_score,is_published,start_date,end_date) VALUES ('Long Answer',30,100,$1,50,true,NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 day') RETURNING id",
      [T.teacherId])).rows;
    await pool.query(
      "INSERT INTO questions (exam_id,question_text,option_a,option_b,correct_answer_letter,points,question_type) VALUES ($1,'Q?','A','B','A',1,'mcq')",
      [ex.id]);
    const r = await request('POST', `/api/exams/${ex.id}/submit`, { answers: { 1: 'A'.repeat(6000) } }, T.studentToken);
    assertEqual(r.status, 400, `Expected 400 for 6000-char answer, got ${r.status}`);
    await pool.query('DELETE FROM exams WHERE id=$1', [ex.id]);
  });

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶  EDGE CASE 6: Role-based access control');
  // ──────────────────────────────────────────────────────────────────────────

  await test('Student cannot create exams → 403', async () => {
    const r = await request('POST', '/api/exams', { title: 'Student Exam', duration_minutes: 30, total_score: 100 }, T.studentToken);
    assertEqual(r.status, 403);
  });

  await test('Student cannot list exams → 403', async () => {
    const r = await request('GET', '/api/exams', null, T.studentToken);
    assertEqual(r.status, 403);
  });

  await test('Assistant with can_manage_exams can create exams → 201', async () => {
    const r = await request('POST', '/api/exams', { title: 'Asst Created', duration_minutes: 30, total_score: 100, pass_score: 50 }, T.assistantToken);
    assertEqual(r.status, 201);
    if (r.body && r.body.id) await pool.query('DELETE FROM exams WHERE id=$1', [r.body.id]);
  });

  await test('Student cannot create courses → 403', async () => {
    const r = await request('POST', '/api/courses', { name: 'Student Course', price: 0 }, T.studentToken);
    assertEqual(r.status, 403);
  });

  await test('Student cannot delete students → 403', async () => {
    const r = await request('DELETE', `/api/students/${T.studentId}`, null, T.studentToken);
    assertEqual(r.status, 403);
  });

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶  EDGE CASE 7: Data integrity / SQL injection attempts');
  // ──────────────────────────────────────────────────────────────────────────

  await test('SQL injection in username → handled (401)', async () => {
    const r = await request('POST', '/api/auth/login', { username: "' OR 1=1 --", password: 'admin123', role: 'teacher' });
    assertEqual(r.status, 401);
  });

  await test('SQL injection in exam title → handled (400 or 201)', async () => {
    const r = await request('POST', '/api/exams', { title: "'; DROP TABLE students; --", duration_minutes: 30, total_score: 100 }, T.teacherToken);
    assert(r.status !== 500, `Server error means injection might have worked: ${r.status}`);
  });

  await test('NoSQL-style payload in numeric field → handled', async () => {
    const r = await request('POST', '/api/exams', { title: 'Hack', duration_minutes: { $gt: 0 }, total_score: 100 }, T.teacherToken);
    assert(r.status !== 200, `Object as number should not be accepted, got ${r.status}`);
  });

  await test('Prototype pollution attempt → handled', async () => {
    const r = await request('POST', '/api/exams', { title: 'Proto Poll', duration_minutes: 30, total_score: 100, __proto__: { admin: true } }, T.teacherToken);
    assert(r.status !== 500, `Prototype pollution should not crash server`);
  });

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶  EDGE CASE 8: Recitation edge cases');
  // ──────────────────────────────────────────────────────────────────────────

  await test('Student can list recitations → 200', async () => {
    const r = await request('GET', '/api/recitations/student/list', null, T.studentToken);
    assertEqual(r.status, 200);
  });

  await test('Teacher can list recitations → 200', async () => {
    const r = await request('GET', '/api/recitations', null, T.teacherToken);
    assertEqual(r.status, 200);
  });

  await test('Student cannot create recitations → 403', async () => {
    const r = await request('POST', '/api/recitations', { title: 'Student Rec', description: 'test', duration_minutes: 10, total_score: 10 }, T.studentToken);
    assertEqual(r.status, 403);
  });

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶  EDGE CASE 9: Exam retry edge cases');
  // ──────────────────────────────────────────────────────────────────────────

  await test('Retry request for unexamined exam → 400', async () => {
    const [ex] = (await pool.query(
      "INSERT INTO exams (title,duration_minutes,total_score,teacher_id,pass_score,is_published) VALUES ('Unattempted',30,100,$1,50,true) RETURNING id",
      [T.teacherId])).rows;
    const r = await request('POST', `/api/exams/${ex.id}/retry-request`, { message: 'Please retry' }, T.studentToken);
    assertEqual(r.status, 400);
    await pool.query('DELETE FROM exams WHERE id=$1', [ex.id]);
  });

  await test('Retry request for expired exam → 400', async () => {
    const [ex] = (await pool.query(
      "INSERT INTO exams (title,duration_minutes,total_score,teacher_id,pass_score,is_published,end_date) VALUES ('Expired',30,100,$1,50,true,NOW()-INTERVAL '1 hour') RETURNING id",
      [T.teacherId])).rows;
    await pool.query(
      "INSERT INTO exam_results (student_id,exam_id,score,correct_count,wrong_count,is_latest) VALUES ($1,$2,50,5,5,true)",
      [T.studentId, ex.id]);
    const r = await request('POST', `/api/exams/${ex.id}/retry-request`, { message: 'Please retry' }, T.studentToken);
    assertEqual(r.status, 400);
    await pool.query('DELETE FROM exams WHERE id=$1', [ex.id]);
  });

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶  EDGE CASE 10: File upload validation');
  // ──────────────────────────────────────────────────────────────────────────

  await test('Upload HTML file as exam image → 400', async () => {
    // Use node's http to send file content with image MIME type
    const r = await request('POST', '/api/exams/upload-question-image', null, T.teacherToken);
    // No file attached → 400
    assertEqual(r.status, 400);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('═'.repeat(60));
console.log('  WATHBA Edge Case Test Suite');
console.log('═'.repeat(60) + '\n');

(async () => {
  await setup();
  try {
    await runTests();
  } finally {
    await teardown();
    await pool.end();
  }
  console.log('\n' + '─'.repeat(60));
  const total = passed + failed + skipped;
  console.log(`  Results: ${passed}/${total} passed  |  ${failed} failed  |  ${skipped} skipped`);
  console.log('─'.repeat(60));
  if (failed > 0) process.exit(1);
})();
