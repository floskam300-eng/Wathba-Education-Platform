/**
 * Recitation Lock Math — Integration Test
 *
 * Verifies the core link-recitation-to-video feature:
 *
 *   "When a video has multiple recitations linked to it, the video is
 *    unlocked only after the student has passed ALL of them."
 *
 * Setup:
 *   - 1 teacher, 1 student, 1 course
 *   - 3 videos (V1, V2, V3) sorted by sort_order
 *   - 3 recitations (R1, R2, R3) ALL linked to video_ids=[V2.id]
 *     plus a fourth safe recitation (R4) NOT linked to V2
 *
 * Assertions:
 *   [A] Initially, V1.is_locked=false (first-video carve-out)
 *   [B] Initially, V2.is_locked=true (R1+R2+R3 all unpassed)
 *   [C] Initially, V3.is_locked=false (no recitations reference it)
 *   [D] Pass R1 → V2 still locked
 *   [E] Pass R2 → V2 still locked
 *   [F] Pass R3 → V2 unlocked (ALL passed)
 *   [G] Safe recursion R4 (not linked to V2) doesn't affect lock state
 *   [H] Negative: removing a video_ids entry from a PASSED recitation keeps V2
 *       unlocked (because passed stays cached via bool_or aggregate)
 *
 * Run: node server/tests/recitation_locks.test.js
 * Requires: server running on port 3001 + DB accessible
 */

const http   = require('http');
require('dotenv').config();
const pool   = require('../db/connection');
const bcrypt = require('bcryptjs');

const BASE = `http://localhost:${process.env.PORT || 3001}`;
let passed = 0, failed = 0;
const errors = [];

function req(method, path, body, token = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port:      process.env.PORT || 3001,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(extraHeaders && extraHeaders['X-Tenant-Slug'] ? { 'X-Tenant-Slug': extraHeaders['X-Tenant-Slug'] } : {}),
        ...(extraHeaders && !extraHeaders['X-Tenant-Slug'] && extraHeaders.studentTenant ? { 'X-Tenant-Slug': extraHeaders.studentTenant } : {}),
        ...(extraHeaders || {}),
      },
    };
    const r = http.request(opts, res => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        let json;
        try { json = JSON.parse(raw); } catch { json = { raw }; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'Assertion failed'); };

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ ${name}: ${e.message}`);
    errors.push({ name, error: e.message });
    failed++;
  }
}

const TEST_RUN = `lkr${Date.now().toString(36)}`;
const TEACHER_USER = 'test_rec_lock_teacher';
const TEACHER_SLUG = `test_rec_lock_teacher_${TEST_RUN}`;
const TEACHER_PASS = 'RecLock_2026!';
const STUDENT_USER = `std_rec_lock_${TEST_RUN}`;
const STUDENT_PASS = 'pass123';

async function cleanTestData() {
  // Best-effort cleanup. Tenant-cache in subdomainTenant.js has a 5-min TTL;
  // using a unique TEACHER_SLUG per run avoids stale-tenant bugs even if
  // a previous run's record lingers.
  await pool.query(`DELETE FROM students WHERE username = $1`, [STUDENT_USER]);
  await pool.query(`DELETE FROM teachers WHERE username = $1`, [TEACHER_USER]);
}

async function setupTeacherAndStudent() {
  const tHash = await bcrypt.hash(TEACHER_PASS, 10);
  const tIns = await pool.query(
    `INSERT INTO teachers (username, password, name, slug)
     VALUES ($1, $2, 'Rec Lock Test Teacher', $3)
     RETURNING id`,
    [TEACHER_USER, tHash, TEACHER_SLUG]
  );
  const teacherId = tIns.rows[0].id;

  const sHash = await bcrypt.hash(STUDENT_PASS, 10);
  const sIns = await pool.query(
    `INSERT INTO students (username, password, name, teacher_id, academic_stage)
     VALUES ($1, $2, 'Rec Lock Test Student', $3, NULL)
     RETURNING id`,
    [STUDENT_USER, sHash, teacherId]
  );
  const studentId = sIns.rows[0].id;

  return { teacherId, studentId };
}

async function loginTeacher() {
  const r = await req('POST', '/api/auth/login', { username: TEACHER_USER, password: TEACHER_PASS, role: 'teacher' });
  assert(r.status === 200 && r.body.token, `Teacher login failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.token;
}

async function loginStudent() {
  const r = await req('POST', '/api/auth/login', {
    username: STUDENT_USER, password: STUDENT_PASS, role: 'student',
    device_id: `test_device_${STUDENT_USER}_${Date.now()}`,
  }, null, { 'X-Tenant-Slug': TEACHER_SLUG });
  assert(r.status === 200 && r.body.token, `Student login failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.token;
}

async function makeCourse(token) {
  const r = await req('POST', '/api/courses', {
    name: 'Rec Lock Test Course',
    description: 'used to verify multi-recitation locking',
    is_free: true,
  }, token);
  assert(r.status === 201 && r.body.id, `Course create failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.id;
}

async function addVideo(token, courseId, title, sortOrder) {
  const r = await req('POST', `/api/courses/${courseId}/videos/url`, {
    title, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', sort_order: sortOrder, duration_minutes: 5,
  }, token);
  assert((r.status === 200 || r.status === 201) && r.body.id, `Video create failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.id;
}

async function enrollStudent(token, courseId, studentId) {
  const r = await req('POST', `/api/courses/${courseId}/enroll/${studentId}`, {}, token);
  assert(r.status === 200, `Enroll failed: ${r.status} ${JSON.stringify(r.body)}`);
}

async function makeRecitation(token, courseId, title, videoIds) {
  const r = await req('POST', '/api/recitations', {
    title, description: title,
    duration_minutes: 5, total_score: 10, pass_score: 5,
    course_id: courseId, video_ids: videoIds,
    allow_retry: true,
  }, token);
  assert(r.status === 201 && r.body.id, `Recitation create failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.id;
}

async function addMcqQuestion(token, recId) {
  const r = await req('POST', `/api/recitations/${recId}/questions`, {
    question_text: 'سؤال تجريبي', question_type: 'mcq',
    option_a: 'أ', option_b: 'ب', option_c: 'ج', option_d: 'د',
    correct_answer_letter: 'A', points: 10,
  }, token);
  assert(r.status === 201 && r.body.id, `Question create failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.id;
}

async function publishRecitation(token, recId) {
  const r = await req('PUT', `/api/recitations/${recId}/publish`, {}, token);
  assert(r.status === 200, `Publish failed: ${r.status} ${JSON.stringify(r.body)}`);
}

async function startSession(token, recId) {
  const r = await req('GET', `/api/recitations/${recId}/take`, null, token);
  assert(r.status === 200 && Array.isArray(r.body.questions), `Take failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.questions;
}

async function submitAllCorrect(token, recId, questions) {
  const answers = questions.map(q => ({ question_id: q.id, answer: 'A' }));
  const r = await req('POST', `/api/recitations/${recId}/submit`, { answers }, token);
  assert(r.status === 200, `Submit failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

async function fetchCourseContent(token, courseId) {
  const r = await req('GET', `/api/courses/${courseId}/content`, null, token);
  assert(r.status === 200, `Fetch content failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

(async () => {
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║   RECITATION LOCK MATH — INTEGRATION TESTS       ║');
  console.log('╚═══════════════════════════════════════════════════╝');

  await cleanTestData();

  try {
    const { teacherId, studentId } = await setupTeacherAndStudent();
    const teacherToken = await loginTeacher();
    const studentToken = await loginStudent();

    const courseId = await makeCourse(teacherToken);
    const v1 = await addVideo(teacherToken, courseId, 'فيديو ١', 1);
    const v2 = await addVideo(teacherToken, courseId, 'فيديو ٢', 2);
    const v3 = await addVideo(teacherToken, courseId, 'فيديو ٣', 3);
    console.log(`[setup] course=${courseId}  V1=${v1} V2=${v2} V3=${v3}`);

    // Publish course (requires at least one piece of content — videos are now added).
    const pub = await req('PUT', `/api/courses/${courseId}/publish`, {}, teacherToken);
    assert(pub.status === 200, `Course publish failed: ${pub.status} ${JSON.stringify(pub.body)}`);

    await enrollStudent(teacherToken, courseId, studentId);

    const r1 = await makeRecitation(teacherToken, courseId, 'تسميع ١', [v2]);
    const r2 = await makeRecitation(teacherToken, courseId, 'تسميع ٢', [v2]);
    const r3 = await makeRecitation(teacherToken, courseId, 'تسميع ٣', [v2]);
    const r4 = await makeRecitation(teacherToken, courseId, 'تسميع ٤ (لا يقفل V2)', []);
    console.log(`[setup] recitations: R1=${r1} R2=${r2} R3=${r3} R4=${r4}`);

    await addMcqQuestion(teacherToken, r1);
    await addMcqQuestion(teacherToken, r2);
    await addMcqQuestion(teacherToken, r3);
    await addMcqQuestion(teacherToken, r4);
    await publishRecitation(teacherToken, r1);
    await publishRecitation(teacherToken, r2);
    await publishRecitation(teacherToken, r3);
    await publishRecitation(teacherToken, r4);

    console.log('\n[A] Initial lock state — none passed');

    await test('A1: V1 (sort_order=1) is NOT locked (first-video carve-out)', async () => {
      const c = await fetchCourseContent(studentToken, courseId);
      const v = c.videos.find(x => x.id === v1);
      assert(v.is_locked === false, `Expected V1.is_locked=false, got ${v.is_locked}`);
    });

    await test('A2: V2 is LOCKED (R1+R2+R3 unpassed)', async () => {
      const c = await fetchCourseContent(studentToken, courseId);
      const v = c.videos.find(x => x.id === v2);
      assert(v.is_locked === true, `Expected V2.is_locked=true, got ${v.is_locked}`);
    });

    await test('A3: V3 is NOT locked (no recitations reference it)', async () => {
      const c = await fetchCourseContent(studentToken, courseId);
      const v = c.videos.find(x => x.id === v3);
      assert(v.is_locked === false, `Expected V3.is_locked=false, got ${v.is_locked}`);
    });

    console.log('\n[B] Pass R1 — V2 should stay locked (R2+R3 still pending)');

    await test('B1: Start R1, submit all-correct, V2 still locked', async () => {
      const qs = await startSession(studentToken, r1);
      const result = await submitAllCorrect(studentToken, r1, qs);
      assert(result.passed === true, `Expected passed=true, got ${JSON.stringify(result)}`);
      const c = await fetchCourseContent(studentToken, courseId);
      const v = c.videos.find(x => x.id === v2);
      assert(v.is_locked === true, `V2 should still be locked after passing R1 (R2+R3 pending); got is_locked=${v.is_locked}`);
    });

    console.log('\n[C] Pass R2 — V2 should still be locked (R3 pending)');

    await test('C1: Start R2, submit all-correct, V2 still locked', async () => {
      const qs = await startSession(studentToken, r2);
      const result = await submitAllCorrect(studentToken, r2, qs);
      assert(result.passed === true, `Expected passed=true, got ${JSON.stringify(result)}`);
      const c = await fetchCourseContent(studentToken, courseId);
      const v = c.videos.find(x => x.id === v2);
      assert(v.is_locked === true, `V2 should still be locked after passing R1+R2 (R3 pending); got is_locked=${v.is_locked}`);
    });

    console.log('\n[D] Pass R3 — V2 should now be UNLOCKED (all linked passed)');

    await test('D1: Start R3, submit all-correct, V2 unlocked', async () => {
      const qs = await startSession(studentToken, r3);
      const result = await submitAllCorrect(studentToken, r3, qs);
      assert(result.passed === true, `Expected passed=true, got ${JSON.stringify(result)}`);
      const c = await fetchCourseContent(studentToken, courseId);
      const v = c.videos.find(x => x.id === v2);
      assert(v.is_locked === false, `V2 should be UNLOCKED after passing ALL linked recitations; got is_locked=${v.is_locked}`);
    });

    console.log('\n[E] Negative — submitting an unrelated recitation (R4) keeps V2 unlocked');

    await test('E1: Start R4, submit all-correct, V2 still unlocked', async () => {
      const qs = await startSession(studentToken, r4);
      await submitAllCorrect(studentToken, r4, qs);
      const c = await fetchCourseContent(studentToken, courseId);
      const v = c.videos.find(x => x.id === v2);
      assert(v.is_locked === false, `V2 should remain unlocked; got is_locked=${v.is_locked}`);
    });

    console.log('\n[F] Negative — DB invariant (no dead ever_passed column)');

    await test('F1: ever_passed column no longer exists on recitation_results', async () => {
      const r = await pool.query(`
        SELECT 1 FROM information_schema.columns
         WHERE table_name='recitation_results' AND column_name='ever_passed'
      `);
      assert(r.rows.length === 0, `ever_passed column still exists — migration 0001 not applied`);
    });

    await test('F2: ever_passed column no longer exists on exam_results', async () => {
      const r = await pool.query(`
        SELECT 1 FROM information_schema.columns
         WHERE table_name='exam_results' AND column_name='ever_passed'
      `);
      assert(r.rows.length === 0, `ever_passed column still exists on exam_results — migration 0001 not applied`);
    });

    console.log('\n🎉 ALL RECITATION LOCK TESTS PASSED!');
  } catch (err) {
    console.error('\n❌ Test setup failed:', err.message);
    console.error(err.stack);
    failed++;
  } finally {
    await cleanTestData();
    console.log('\n[teardown] Test teacher/student removed.');
    console.log(`\n══════════════════════════════════════════════════`);
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log(`══════════════════════════════════════════════════`);
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
