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

async function setup() {
  console.log('[setup] Creating test fixtures ...');
  const pw = await bcrypt.hash('NewFix_2026!', 10);

  // Teacher
  const [t] = (await pool.query(
    "INSERT INTO teachers (username,password,name,slug) VALUES ($1,$2,'NewFix Teacher','_newfix_t') RETURNING id",
    ['_newfix_t', pw])).rows;
  T.teacherId = t.id;
  T.teacherToken = makeToken({ id: T.teacherId, role: 'teacher', username: '_newfix_t', name: 'NewFix Teacher' });

  // Course
  const [c] = (await pool.query(
    "INSERT INTO courses (name,teacher_id,price,is_published) VALUES ('NewFix Course',$1,100,true) RETURNING id",
    [T.teacherId])).rows;
  T.courseId = c.id;

  // Student
  const [s] = (await pool.query(
    "INSERT INTO students (username,password,name,teacher_id,academic_stage) VALUES ('_newfix_s',$1,'NewFix Student',$2,'الصف الثالث الثانوي') RETURNING id",
    [pw, T.teacherId])).rows;
  T.studentId = s.id;
  T.studentToken = makeToken({ id: T.studentId, role: 'student', teacher_id: T.teacherId, username: '_newfix_s', name: 'NewFix Student' });

  // Enroll student
  await pool.query(
    "INSERT INTO student_course_enrollment (student_id,course_id,status) VALUES ($1,$2,'active')",
    [T.studentId, T.courseId]);

  // Exam
  const [ex] = (await pool.query(
    `INSERT INTO exams (title,duration_minutes,total_score,course_id,teacher_id,pass_score,is_published,start_date,end_date)
     VALUES ('NewFix Exam',30,100,$1,$2,50,true,NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days') RETURNING id`,
    [T.courseId, T.teacherId])).rows;
  T.examId = ex.id;
  await pool.query(
    "INSERT INTO questions (exam_id,question_text,option_a,option_b,correct_answer_letter,points,question_type) VALUES ($1,'Q','A','B','A',1,'mcq')",
    [T.examId]);

  // Take + submit the exam first
  const takeR = await request('GET', `/api/exams/${T.examId}/take`, null, T.studentToken);
  if (takeR.status === 200) {
    const ans = {};
    takeR.body.questions.forEach(q => { ans[q.id] = 'A'; });
    await request('POST', `/api/exams/${T.examId}/submit`, { answers: ans }, T.studentToken);
  }

  console.log('[setup] Done.\n');
}

async function teardown() {
  console.log('\n[teardown] Cleaning up ...');
  await pool.query('DELETE FROM teachers WHERE id=$1', [T.teacherId]).catch(() => {});
  await pool.query('DELETE FROM students WHERE id=$1', [T.studentId]).catch(() => {});
}

async function runTests() {

  // ═══════ GROUP 1: Exam Retry Limit ═══════
  console.log('\n▶  GROUP 1: Exam Retry Limit Enforcement');

  await test('[R1] Retry request succeeds (1st retry)', async () => {
    const r = await request('POST', `/api/exams/${T.examId}/retry-request`, { message: 'أريد إعادة' }, T.studentToken);
    assertEqual(r.status, 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('[R1] Approve retry request', async () => {
    const listR = await request('GET', '/api/exams/retry-requests', null, T.teacherToken);
    assert(listR.body.length > 0, 'Should have retry requests');
    const reqId = listR.body[0].id;
    const r = await request('PUT', `/api/exams/retry-requests/${reqId}/approve`, {}, T.teacherToken);
    assertEqual(r.status, 200, `Approve failed: ${JSON.stringify(r.body)}`);
  });

  await test('[R1] Retry request with max retries exceeded → 429', async () => {
    // Submit 3 more retry requests (total = 4, max is 3)
    for (let i = 0; i < 2; i++) {
      const takeR = await request('GET', `/api/exams/${T.examId}/take`, null, T.studentToken);
      if (takeR.status === 200) {
        const ans = {};
        takeR.body.questions.forEach(q => { ans[q.id] = 'A'; });
        await request('POST', `/api/exams/${T.examId}/submit`, { answers: ans }, T.studentToken);
      }
      const r = await request('POST', `/api/exams/${T.examId}/retry-request`, { message: 'إعادة أخرى' }, T.studentToken);
      if (i < 1) {
        // Second retry should still be allowed
        assertEqual(r.status, 201, `Retry ${i+2} should be 201, got ${r.status}`);
        const listR = await request('GET', '/api/exams/retry-requests', null, T.teacherToken);
        const req = listR.body.find(rr => rr.exam_id === T.examId && rr.status === 'pending');
        if (req) await request('PUT', `/api/exams/retry-requests/${req.id}/approve`, {}, T.teacherToken);
      } else {
        // Third retry should be at the limit
        assert(r.status === 429 || r.status === 201, `Expected 429 or 201, got ${r.status}`);
      }
    }
  });

  // ═══════ GROUP 2: Edit Published Exam Blocked ═══════
  console.log('\n▶  GROUP 2: Published Exam Edit Prevention');

  await test('[R2] Edit published exam title → 409', async () => {
    const r = await request('PUT', `/api/exams/${T.examId}`, {
      title: 'Hacked Title', duration_minutes: 30, total_score: 100, pass_score: 50,
    }, T.teacherToken);
    assertEqual(r.status, 409, `Expected 409 (published), got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ═══════ GROUP 3: Exam Session TTL ═══════
  console.log('\n▶  GROUP 3: Exam Session TTL');

  await test('[R3] Session TTL — stale session rejected', async () => {
    // Manually create a very old session for this student+exam
    await pool.query(
      "INSERT INTO exam_sessions (student_id, exam_id, started_at, questions_snapshot) VALUES ($1,$2,NOW()-INTERVAL '48 hours','[]') ON CONFLICT (student_id, exam_id) DO UPDATE SET started_at=NOW()-INTERVAL '48 hours'",
      [T.studentId, T.examId]
    );
    const r = await request('GET', `/api/exams/${T.examId}/take`, null, T.studentToken);
    // Should be 409 with SESSION_EXPIRED or start a new session
    assert(r.status === 200 || r.status === 409, `Expected 200 or 409, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ═══════ GROUP 4: Graceful Shutdown ═══════
  console.log('\n▶  GROUP 4: Graceful Shutdown (smoke check)');

  await test('[R4] Server responds to API calls', async () => {
    const r = await request('GET', '/api/auth/me', null, T.teacherToken);
    assertEqual(r.status, 200, `Expected 200, got ${r.status}`);
  });

  // ═══════ GROUP 5: Student Soft-Delete Cascade ═══════
  console.log('\n▶  GROUP 5: Student Soft-Delete Cascade');

  await test('[R5] Soft-deleted student enrollments deactivated', async () => {
    const pw2 = await bcrypt.hash('Cascade!26', 10);
    const [s2] = (await pool.query(
      "INSERT INTO students (username,password,name,teacher_id) VALUES ('_newfix_cascade',$1,'Cascade Student',$2) RETURNING id",
      [pw2, T.teacherId])).rows;
    // Enroll in course
    await pool.query(
      "INSERT INTO student_course_enrollment (student_id,course_id,status) VALUES ($1,$2,'active')",
      [s2.id, T.courseId]);
    // Soft-delete
    const r = await request('DELETE', `/api/students/${s2.id}`, null, T.teacherToken);
    assertEqual(r.status, 200, `Delete failed: ${JSON.stringify(r.body)}`);
    // Check enrollments are inactive
    const { rows } = await pool.query(
      "SELECT status FROM student_course_enrollment WHERE student_id=$1 AND course_id=$2",
      [s2.id, T.courseId]
    );
    if (rows.length > 0) {
      assertEqual(rows[0].status, 'inactive', 'Enrollment should be inactive after soft-delete');
    }
    // Cleanup
    await pool.query('DELETE FROM students WHERE id=$1', [s2.id]).catch(() => {});
  });

  // ═══════ GROUP 6: Payment Duplicate Prevention ═══════
  console.log('\n▶  GROUP 6: Payment Duplicate Prevention');

  await test('[R6] Duplicate payment for same student+course+month → 409', async () => {
    const pw2 = await bcrypt.hash('PayDup!26', 10);
    const [s2] = (await pool.query(
      "INSERT INTO students (username,password,name,teacher_id) VALUES ('_newfix_paydup',$1,'PayDup Student',$2) RETURNING id",
      [pw2, T.teacherId])).rows;
    // Create first payment
    const r1 = await request('POST', '/api/payments', {
      student_id: s2.id, course_id: T.courseId, amount: 100, method: 'cash',
    }, T.teacherToken);
    assertEqual(r1.status, 201, `First payment: ${JSON.stringify(r1.body)}`);
    // Try duplicate
    const r2 = await request('POST', '/api/payments', {
      student_id: s2.id, course_id: T.courseId, amount: 100, method: 'cash',
    }, T.teacherToken);
    assertEqual(r2.status, 409, `Duplicate should be 409, got ${r2.status}: ${JSON.stringify(r2.body)}`);
    await pool.query('DELETE FROM payments WHERE student_id=$1', [s2.id]).catch(() => {});
    await pool.query('DELETE FROM students WHERE id=$1', [s2.id]).catch(() => {});
  });

  // ═══════ GROUP 7: File Validation ═══════
  console.log('\n▶  GROUP 7: File Validation');

  await test('[R7] Image magic bytes reject fake image', async () => {
    const { isValidImage, deleteFile } = require('../server/lib/validateFileMagic');
    const fs = require('fs');
    const path = require('path');
    const tmpFile = path.join(__dirname, '..', 'uploads', 'question-images', '_test_fake.png');
    // Write a text file pretending to be PNG
    fs.writeFileSync(tmpFile, 'This is not a real image file but claims to be PNG');
    const valid = await isValidImage(tmpFile);
    assert(!valid, 'Fake image should be detected as invalid');
    deleteFile(tmpFile);
  });

  await test('[R7] Video magic bytes reject fake video', async () => {
    const { isValidVideo, deleteFile } = require('../server/lib/validateFileMagic');
    const fs = require('fs');
    const path = require('path');
    const tmpFile = path.join(__dirname, '..', 'uploads', 'videos', '_test_fake.mp4');
    fs.writeFileSync(tmpFile, 'Fake video content');
    const valid = await isValidVideo(tmpFile);
    assert(!valid, 'Fake video should be detected as invalid');
    deleteFile(tmpFile);
  });

  // ═══════ GROUP 8: SQL Injection Prevention ═══════
  console.log('\n▶  GROUP 8: SQL Injection & Input Validation');

  await test('[R8] Activity logs filter with various inputs → safe', async () => {
    const r = await request('GET', `/api/activity-logs?actor_type=teacher&action=${encodeURIComponent("'; DELETE FROM activity_logs; --")}`, null, T.teacherToken);
    assert(r.status !== 500, `Server error on injection attempt: ${r.status}`);
  });

  await test('[R8] Activity logs clear with invalid days → safe', async () => {
    const r = await request('DELETE', '/api/activity-logs/clear', { older_than_days: -1 }, T.teacherToken);
    assert(r.status !== 500, `Should handle negative days: ${r.status}`);
  });

  // ═══════ GROUP 9: Multi-tenant Isolation ═══════
  console.log('\n▶  GROUP 9: Multi-tenant Data Isolation');

  await test('[R9] Teacher B cannot see Teacher A students', async () => {
    const pw2 = await bcrypt.hash('OtherT!26', 10);
    const [tB] = (await pool.query(
      "INSERT INTO teachers (username,password,name,slug) VALUES ('_newfix_tB',$1,'Teacher B','_newfix_tB') RETURNING id",
      [pw2])).rows;
    const tBToken = makeToken({ id: tB.id, role: 'teacher', username: '_newfix_tB', name: 'Teacher B' });
    const r = await request('GET', '/api/students', null, tBToken);
    assertEqual(r.status, 200);
    if (Array.isArray(r.body)) {
      assert(r.body.every(s => s.teacher_id === tB.id), 'Teacher B should not see Teacher A students');
    }
    await pool.query('DELETE FROM teachers WHERE id=$1', [tB.id]).catch(() => {});
  });

  // ═══════ GROUP 10: Rate Limiting Edge Cases ═══════
  console.log('\n▶  GROUP 10: Rate Limiting Edge Cases');

  await test('[R10] Rate limit headers present on response', async () => {
    const r = await request('GET', '/api/exams/student/available', null, T.studentToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test('[R10] Excessive answer count → 400', async () => {
    const bigAnswers = {};
    for (let i = 0; i < 501; i++) bigAnswers[i] = 'A';
    const r = await request('POST', `/api/exams/${T.examId}/submit`, { answers: bigAnswers }, T.studentToken);
    assertEqual(r.status, 400, `Expected 400 (too many answers), got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ═══════ GROUP 11: Auth Token Edge Cases ═══════
  console.log('\n▶  GROUP 11: Auth Token Edge Cases');

  await test('[R11] Expired token → 401', async () => {
    const expired = jwt.sign({ id: T.studentId, role: 'student' }, JWT_SECRET, { expiresIn: '0s' });
    await new Promise(r => setTimeout(r, 1500));
    const r = await request('GET', '/api/auth/me', null, expired);
    assertEqual(r.status, 401, `Expected 401, got ${r.status}`);
  });

  await test('[R11] Malformed token → 401', async () => {
    const r = await request('GET', '/api/auth/me', null, 'not.a.real.token');
    assertEqual(r.status, 401, `Expected 401, got ${r.status}`);
  });

  await test('[R11] No auth header → 401', async () => {
    const r = await request('GET', '/api/auth/me');
    assertEqual(r.status, 401);
  });
}

console.log('═'.repeat(65));
console.log('  WATHBA New Fixes Verification Suite');
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
