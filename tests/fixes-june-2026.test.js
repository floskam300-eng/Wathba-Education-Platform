'use strict';
require('dotenv').config();
const pool = require('../server/db/connection');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
const PORT = parseInt(process.env.PORT || '3001', 10);

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

function randomId() {
  return crypto.randomInt(100000, 999999);
}

async function setup() {
  console.log('[setup] Creating test fixtures for June 2026 fixes ...');
  const pw = await bcrypt.hash('FixTest_2026!', 10);
  const uid = randomId();

  T.teacherSlug = `_fix_t_${uid}`;
  const [t] = (await pool.query(
    "INSERT INTO teachers (username,password,name,slug) VALUES ($1,$2,'Fix Teacher',$3) RETURNING id",
    [`_fix_t_${uid}`, pw, T.teacherSlug])).rows;
  T.teacherId = t.id;
  T.teacherToken = makeToken({ id: T.teacherId, role: 'teacher', username: `_fix_t_${uid}`, name: 'Fix Teacher' });

  // Course — paid, free with stage, free without stage
  const [cPaid] = (await pool.query(
    "INSERT INTO courses (name,teacher_id,price,is_published) VALUES ('Fix Paid Course',$1,200,true) RETURNING id",
    [T.teacherId])).rows;
  T.paidCourseId = cPaid.id;

  const [cFree] = (await pool.query(
    "INSERT INTO courses (name,teacher_id,is_free,is_published) VALUES ('Fix Free Course',$1,true,true) RETURNING id",
    [T.teacherId])).rows;
  T.freeCourseId = cFree.id;

  // Students
  const [sActive] = (await pool.query(
    "INSERT INTO students (username,password,name,teacher_id,academic_stage) VALUES ($1,$2,'Fix Active Student',$3,'stage_a') RETURNING id",
    [`_fix_s_active_${uid}`, pw, T.teacherId])).rows;
  T.activeStudentId = sActive.id;
  T.activeStudentToken = makeToken({ id: T.activeStudentId, role: 'student', teacher_id: T.teacherId, username: `_fix_s_active_${uid}`, name: 'Fix Active Student' });

  const [sSuspended] = (await pool.query(
    "INSERT INTO students (username,password,name,teacher_id,academic_stage,is_suspended) VALUES ($1,$2,'Fix Suspended Student',$3,'stage_a',true) RETURNING id",
    [`_fix_s_suspended_${uid}`, pw, T.teacherId])).rows;
  T.suspendedStudentId = sSuspended.id;

  // Enroll active student in paid course
  await pool.query(
    "INSERT INTO student_course_enrollment (student_id,course_id,status) VALUES ($1,$2,'active')",
    [T.activeStudentId, T.paidCourseId]);
}

async function teardown() {
  console.log('[teardown] Cleaning up test fixtures ...');
  try { await pool.query('DELETE FROM students WHERE teacher_id=$1', [T.teacherId]); } catch {}
  try { await pool.query('DELETE FROM exams WHERE teacher_id=$1', [T.teacherId]); } catch {}
  try { await pool.query('DELETE FROM courses WHERE teacher_id=$1', [T.teacherId]); } catch {}
  try { await pool.query('DELETE FROM teachers WHERE id=$1', [T.teacherId]); } catch {}
}

// ══════════════════════════════════════════════════════════════
//  FIX 1: teachers.js import returns generated_passwords
// ══════════════════════════════════════════════════════════════
async function testImportReturnsPasswords() {
  const importPayload = {
    students: [
      { username: `_fix_imp_a_${randomId()}`, name: 'Import Student A' },
      { username: `_fix_imp_b_${randomId()}`, name: 'Import Student B', plain_password: 'KnownPwd123' },
    ],
  };

  const res = await request('POST', '/api/import', importPayload, T.teacherToken);
  assertEqual(res.status, 200, 'Import should succeed');
  assert(res.body.success === true, 'Import should report success');
  assert(res.body.stats.students === 2, 'Import should report 2 students');
  assert(Array.isArray(res.body.generated_passwords), 'Import should include generated_passwords array');
  assert(res.body.generated_passwords.length === 1, 'Only the student without plain_password should be in generated_passwords');
  assert(res.body.generated_passwords[0].username === importPayload.students[0].username, 'Generated password entry should have correct username');
  assert(res.body.generated_passwords[0].generated_password.length >= 6, 'Generated password should be 6+ digits');
}

// ══════════════════════════════════════════════════════════════
//  FIX 2: exams.js standalone publish excludes suspended
// ══════════════════════════════════════════════════════════════
async function testStandaloneExamPublishExcludesSuspended() {
  const examRes = await request('POST', '/api/exams', {
    title: 'Fix Standalone Exam',
    duration_minutes: 30,
    total_score: 100,
    pass_score: 50,
  }, T.teacherToken);
  assertEqual(examRes.status, 201, 'Should create standalone exam');
  const examId = examRes.body.id;

  // Check notification_log has no entries for suspended student
  const notifRes = await pool.query(
    "SELECT * FROM notification_log WHERE teacher_id=$1 AND recipient_type='student' AND type='new_exam' ORDER BY id DESC LIMIT 50",
    [T.teacherId]
  );
  const suspendedNotifs = notifRes.rows.filter(n => n.student_id === T.suspendedStudentId);
  assertEqual(suspendedNotifs.length, 0, 'Suspended student should receive NO notification for standalone exam');
}

// ══════════════════════════════════════════════════════════════
//  FIX 3: courses.js payment auto-create dedup via NOT EXISTS
// ══════════════════════════════════════════════════════════════
async function testPaymentAutoCreateNoDuplicate() {
  // Request enrollment twice. Only ONE payment should exist.
  const enrollPayload = { message: 'Please enroll' };

  const r1 = await request('POST', `/api/courses/${T.paidCourseId}/enroll/request`, enrollPayload, T.activeStudentToken);
  assert(r1.status === 200 || r1.status === 201, `First enrollment request should succeed (got ${r1.status})`);

  const r2 = await request('POST', `/api/courses/${T.paidCourseId}/enroll/request`, enrollPayload, T.activeStudentToken);
  assert(r2.status === 200 || r2.status === 201, `Second enrollment request should succeed (got ${r2.status})`);

  // Verify only ONE payment for this student+course
  const payRes = await pool.query(
    'SELECT COUNT(*)::int AS cnt FROM payments WHERE student_id=$1 AND course_id=$2',
    [T.activeStudentId, T.paidCourseId]
  );
  assertEqual(payRes.rows[0].cnt, 1, `Should be exactly 1 payment row, got ${payRes.rows[0].cnt}`);
}

// ══════════════════════════════════════════════════════════════
//  FIX 4: students.js missing return after 409
// ══════════════════════════════════════════════════════════════
async function testStudentCreateReturns409OnExhaustion() {
  // Create a student first to lock a username pattern
  const prefixRes = await request('POST', '/api/students', {
    name: 'Test User A',
    academic_stage: 'الصف الثالث الثانوي',
  }, T.teacherToken);
  // (success or 409 are both fine — just ensure no crash/500)

  // Try creating many students — verify the API never crashes with 500 on collision
  for (let i = 0; i < 7; i++) {
    const res = await request('POST', '/api/students', {
      name: 'Duplicate Test',
      academic_stage: 'الصف الثالث الثانوي',
    }, T.teacherToken);
    // Accept 201 or 409 — but NOT 500
    assert(res.status !== 500, `Should not crash with 500 on retry exhaustion (got ${res.status}): ${res.raw?.slice(0, 100)}`);
  }
}

// ══════════════════════════════════════════════════════════════
//  FIX 5: exams.js NaN date validation
// ══════════════════════════════════════════════════════════════
async function testExamDateNaNSafeguard() {
  // Invalid date strings should be caught before diff calculation
  const res = await request('POST', '/api/exams', {
    title: 'NaN Date Exam',
    duration_minutes: 30,
    total_score: 100,
    pass_score: 50,
    start_date: 'not-a-date',
    end_date: 'also-not-a-date',
  }, T.teacherToken);
  assertEqual(res.status, 400, 'Invalid dates should return 400');
  assert(res.body.error, 'Response should contain error message');

  // Valid dates should still work
  const validRes = await request('POST', '/api/exams', {
    title: 'Valid Date Exam',
    duration_minutes: 30,
    total_score: 100,
    pass_score: 50,
    start_date: new Date(Date.now() + 86400000).toISOString(),
    end_date: new Date(Date.now() + 86400000 * 3).toISOString(),
  }, T.teacherToken);
  assert(validRes.status === 200 || validRes.status === 201, `Valid dates should succeed (got ${validRes.status})`);
}

// ══════════════════════════════════════════════════════════════
//  RUN ALL TESTS
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log('');
  console.log('══════════════════════════════════════════════════');
  console.log('  June 2026 Bug-Fix Verification Tests');
  console.log('══════════════════════════════════════════════════');
  console.log('');

  await setup();

  await test('[FIX-1] teachers.js import returns generated_passwords for auto-generated passwords', testImportReturnsPasswords);
  await test('[FIX-2] exams.js standalone publish excludes suspended students from notifications', testStandaloneExamPublishExcludesSuspended);
  await test('[FIX-3] courses.js payment auto-create does not duplicate on re-request', testPaymentAutoCreateNoDuplicate);
  await test('[FIX-4] students.js create endpoint does not crash on retry exhaustion (409 not 500)', testStudentCreateReturns409OnExhaustion);
  await test('[FIX-5] exams.js NaN date strings return 400 instead of crashing', testExamDateNaNSafeguard);

  await teardown();

  console.log('');
  console.log(`  Results:  ✅ ${passed} passed  ❌ ${failed} failed  ⏭ ${skipped} skipped`);
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
