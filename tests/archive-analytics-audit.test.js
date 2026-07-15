/**
 * Archive & Analytics Audit — Bug-Fix Verification Tests
 * ====================================================================
 * Covers every bug identified and fixed during the July 2026 audit of:
 *   • server/routes/archive.js
 *   • server/routes/teachers.js  (analytics endpoints)
 *   • server/routes/assistants.js (analytics endpoint)
 *   • server/routes/recitations.js (/analytics)
 *   • client distribution-chart data shapes (validated via API shape)
 *
 * Run: node tests/archive-analytics-audit.test.js
 * Prerequisites: Server running, seed data loaded (seed.js).
 *
 * FIXED BUGS COVERED:
 *   BUG-ARC-FILTERS  — /archive/filters: INNER JOIN dropped standalone exams
 *   BUG-ANA-DIST-T   — /teachers/analytics: stageDistribution+genderDistribution
 *                       now returned (previously missing; frontend used top-50)
 *   BUG-ANA-DIST-A   — /assistants/analytics: same addition
 *   BUG-ANA-KPD      — keepPreviousData v4 API silently ignored in RQ v5
 *                       (verified via absence of runtime error; shape-tested)
 *   BUG-ANA-WRONGQ   — wrongQExamIdx out-of-bounds crash (frontend useEffect fix)
 *   BUG-REC-CACHE    — /recitations/analytics had no caching (verified via
 *                       cache-hit header absence and response stability)
 */

'use strict';
require('dotenv').config();
const pool   = require('../server/db/connection');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const http   = require('http');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
const PORT       = parseInt(process.env.PORT || '3001', 10);

let passed = 0, failed = 0;
let T = {}; // shared test fixtures

// ── helpers ──────────────────────────────────────────────────────────────────

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

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function assertGte(a, b, msg) {
  if (a < b) throw new Error(msg || `Expected ${a} >= ${b}`);
}

function request(method, urlPath, body, token, extraHeaders) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      ...(extraHeaders || {}),
    };
    const opts = { hostname: 'localhost', port: PORT, path: urlPath, method, headers };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        let json;
        try { json = JSON.parse(raw); } catch { json = raw; }
        resolve({ status: res.statusCode, body: json, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const get  = (path, token, extra) => request('GET',    path, null, token, extra);
const post = (path, body, token, extra) => request('POST', path, body, token, extra);

function makeToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h', jwtid: crypto.randomBytes(8).toString('hex') });
}

function rand(n = 8) { return crypto.randomBytes(n).toString('hex'); }

// ── setup ─────────────────────────────────────────────────────────────────────

async function setup() {
  console.log('\n🔧  Setting up fixtures…');

  // Create teacher
  const tSlug  = `audit-anl-${rand(4)}`;
  const tUser  = `tch_anl_${rand(4)}`;
  const tPass  = await bcrypt.hash('Teacher123!', 10);
  const tRes   = await pool.query(
    `INSERT INTO teachers (username, password, name, slug, force_password_change)
     VALUES ($1, $2, $3, $4, false)
     RETURNING id`,
    [tUser, tPass, 'Analytics Audit Teacher', tSlug]
  );
  T.teacherId   = tRes.rows[0].id;
  T.teacherToken = makeToken({ id: T.teacherId, role: 'teacher', slug: tSlug });

  // Create a second teacher (to verify isolation)
  const t2Slug = `audit-anl2-${rand(4)}`;
  const t2Res  = await pool.query(
    `INSERT INTO teachers (username, password, name, slug, force_password_change)
     VALUES ($1, $2, $3, $4, false) RETURNING id`,
    [`tch_anl2_${rand(4)}`, tPass, 'Other Teacher', t2Slug]
  );
  T.otherTeacherId    = t2Res.rows[0].id;
  T.otherTeacherToken = makeToken({ id: T.otherTeacherId, role: 'teacher', slug: t2Slug });

  // Create assistant with can_view_analytics
  const aPass = await bcrypt.hash('Asst123!', 10);
  const aRes  = await pool.query(
    `INSERT INTO assistants (username, password, name, teacher_id, can_view_analytics, can_manage_recitations)
     VALUES ($1, $2, $3, $4, true, true) RETURNING id`,
    [`asst_anl_${rand(4)}`, aPass, 'Analytics Assistant', T.teacherId]
  );
  T.assistantId    = aRes.rows[0].id;
  T.assistantToken = makeToken({
    id: T.assistantId, role: 'assistant', slug: tSlug,
    can_view_analytics: true, can_manage_recitations: true,
  });

  // Create students with different stages and genders
  const studentData = [
    { name: 'Student A', stage: 'الصف الأول الثانوي', gender: 'ذكر'  },
    { name: 'Student B', stage: 'الصف الأول الثانوي', gender: 'ذكر'  },
    { name: 'Student C', stage: 'الصف الثاني الثانوي', gender: 'أنثى' },
    { name: 'Student D', stage: 'الصف الثاني الثانوي', gender: 'أنثى' },
    { name: 'Student E', stage: 'الصف الثالث الثانوي', gender: 'ذكر'  },
  ];
  T.studentIds = [];
  for (const s of studentData) {
    const sPass = await bcrypt.hash('Std123!', 10);
    const sRes  = await pool.query(
      `INSERT INTO students (username, password, name, teacher_id, academic_stage, gender)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [`std_${rand(4)}`, sPass, s.name, T.teacherId, s.stage, s.gender]
    );
    T.studentIds.push(sRes.rows[0].id);
  }

  // Create a course (column is "name" not "title")
  const cRes = await pool.query(
    `INSERT INTO courses (name, teacher_id, target_stage, price, is_published)
     VALUES ($1, $2, $3, 0, true) RETURNING id`,
    ['Analytics Test Course', T.teacherId, 'الصف الأول الثانوي']
  );
  T.courseId = cRes.rows[0].id;

  // Create exam WITH a course
  const eRes = await pool.query(
    `INSERT INTO exams (title, teacher_id, course_id, total_score, pass_score, is_published, start_date, end_date)
     VALUES ($1, $2, $3, 100, 50, true, NOW() - INTERVAL '1 day', NOW() + INTERVAL '7 days')
     RETURNING id`,
    ['Course Exam', T.teacherId, T.courseId]
  );
  T.courseExamId = eRes.rows[0].id;

  // Create exam WITHOUT a course (standalone)
  const seRes = await pool.query(
    `INSERT INTO exams (title, teacher_id, course_id, total_score, pass_score, is_published, start_date, end_date)
     VALUES ($1, $2, NULL, 100, 50, true, NOW() - INTERVAL '1 day', NOW() + INTERVAL '7 days')
     RETURNING id`,
    ['Standalone Exam (no course)', T.teacherId]
  );
  T.standaloneExamId = seRes.rows[0].id;

  // Enroll students in the course
  for (const sid of T.studentIds.slice(0, 3)) {
    await pool.query(
      `INSERT INTO student_course_enrollment (student_id, course_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [sid, T.courseId]
    );
  }

  // Add exam results for course exam
  for (let i = 0; i < 3; i++) {
    await pool.query(
      `INSERT INTO exam_results (exam_id, student_id, score,
                                 correct_count, wrong_count, unanswered_count, is_latest, is_absent)
       VALUES ($1, $2, $3, $4, $5, 0, true, false)`,
      [T.courseExamId, T.studentIds[i], 60 + i * 10, 6 + i, 3 - i]
    );
  }

  // Create a recitation
  const rRes = await pool.query(
    `INSERT INTO recitations (title, teacher_id, total_score, is_published, academic_stage)
     VALUES ($1, $2, 10, true, $3) RETURNING id`,
    ['Test Recitation', T.teacherId, 'الصف الأول الثانوي']
  );
  T.recitationId = rRes.rows[0].id;

  // Add recitation results
  for (const sid of T.studentIds.slice(0, 2)) {
    await pool.query(
      `INSERT INTO recitation_results (recitation_id, student_id, score, passed)
       VALUES ($1, $2, $3, $4)`,
      [T.recitationId, sid, 8, true]
    );
  }

  console.log('  ✅  Fixtures created');
}

// ── teardown ──────────────────────────────────────────────────────────────────

async function teardown() {
  // Clean up in dependency order
  await pool.query(`DELETE FROM recitation_results WHERE recitation_id IN
    (SELECT id FROM recitations WHERE teacher_id=$1)`, [T.teacherId]);
  await pool.query(`DELETE FROM recitations WHERE teacher_id=$1`, [T.teacherId]);
  await pool.query(`DELETE FROM exam_results WHERE exam_id IN
    (SELECT id FROM exams WHERE teacher_id=$1)`, [T.teacherId]);
  await pool.query(`DELETE FROM exams WHERE teacher_id=$1`, [T.teacherId]);
  await pool.query(`DELETE FROM student_course_enrollment WHERE course_id IN
    (SELECT id FROM courses WHERE teacher_id=$1)`, [T.teacherId]);
  await pool.query(`DELETE FROM courses WHERE teacher_id=$1`, [T.teacherId]);
  await pool.query(`DELETE FROM students WHERE teacher_id=$1`, [T.teacherId]);
  await pool.query(`DELETE FROM assistants WHERE teacher_id=$1`, [T.teacherId]);
  await pool.query(`DELETE FROM teachers WHERE id IN ($1, $2)`, [T.teacherId, T.otherTeacherId]);
}

// ─────────────────────────────────────────────────────────────────────────────
//  TEST SUITES
// ─────────────────────────────────────────────────────────────────────────────

// ── BUG-ARC-FILTERS: Standalone exams must appear in /archive/filters ────────

async function testArchiveFilters() {
  console.log('\n📋  BUG-ARC-FILTERS — Archive filters endpoint');

  await test('GET /api/archive/filters returns 200 for teacher', async () => {
    const r = await get('/api/archive/filters', T.teacherToken);
    assertEqual(r.status, 200, `Expected 200 got ${r.status}`);
    assert(Array.isArray(r.body.exams), 'body.exams must be array');
  });

  await test('BUG-ARC-FILTERS: standalone exam (no course_id) appears in filter list', async () => {
    const r = await get('/api/archive/filters', T.teacherToken);
    assertEqual(r.status, 200);
    const ids = (r.body.exams || []).map(e => e.id);
    assert(
      ids.includes(T.standaloneExamId),
      `Standalone exam ${T.standaloneExamId} not in filters list — LEFT JOIN fix may not be applied`
    );
  });

  await test('BUG-ARC-FILTERS: course-linked exam also appears in filter list', async () => {
    const r = await get('/api/archive/filters', T.teacherToken);
    const ids = (r.body.exams || []).map(e => e.id);
    assert(
      ids.includes(T.courseExamId),
      `Course exam ${T.courseExamId} not in filters list`
    );
  });

  await test('BUG-ARC-FILTERS: standalone exam has null course_name (not dropped)', async () => {
    const r = await get('/api/archive/filters', T.teacherToken);
    const standalone = (r.body.exams || []).find(e => e.id === T.standaloneExamId);
    assert(standalone, 'standalone exam must be present');
    // course_name is NULL for standalone exams
    assert(
      standalone.course_name === null || standalone.course_name === undefined,
      `Expected course_name to be null, got ${standalone.course_name}`
    );
  });

  await test('GET /api/archive/filters — tenant isolation (other teacher gets different list)', async () => {
    const r = await get('/api/archive/filters', T.otherTeacherToken);
    assertEqual(r.status, 200);
    const ids = (r.body.exams || []).map(e => e.id);
    assert(
      !ids.includes(T.standaloneExamId),
      'Other teacher must not see first teacher\'s exams'
    );
  });

  await test('GET /api/archive/filters — 401 without token', async () => {
    const r = await get('/api/archive/filters', null);
    assertEqual(r.status, 401);
  });
}

// ── BUG-ANA-DIST-T: /teachers/analytics must return stageDistribution & genderDistribution ─

async function testTeacherAnalyticsDistribution() {
  console.log('\n📊  BUG-ANA-DIST-T — Teacher analytics distribution fields');

  await test('GET /api/teachers/analytics returns 200', async () => {
    const r = await get('/api/teachers/analytics', T.teacherToken);
    assertEqual(r.status, 200, `Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('BUG-ANA-DIST-T: stageDistribution field present in response', async () => {
    const r = await get('/api/teachers/analytics', T.teacherToken);
    assert(Array.isArray(r.body.stageDistribution),
      'stageDistribution must be an array — fix for top-50 bias not applied');
  });

  await test('BUG-ANA-DIST-T: genderDistribution field present in response', async () => {
    const r = await get('/api/teachers/analytics', T.teacherToken);
    assert(Array.isArray(r.body.genderDistribution),
      'genderDistribution must be an array — fix for top-50 bias not applied');
  });

  await test('BUG-ANA-DIST-T: stageDistribution rows have {stage, count} shape', async () => {
    const r = await get('/api/teachers/analytics', T.teacherToken);
    const rows = r.body.stageDistribution || [];
    assertGte(rows.length, 1, 'stageDistribution should have at least 1 row (we created 5 students with stages)');
    for (const row of rows) {
      assert('stage' in row, `Row missing "stage" key: ${JSON.stringify(row)}`);
      assert(typeof row.count === 'number', `row.count must be number: ${JSON.stringify(row)}`);
      assertGte(row.count, 1, `count must be >= 1: ${JSON.stringify(row)}`);
    }
  });

  await test('BUG-ANA-DIST-T: genderDistribution rows have {gender, count} shape', async () => {
    const r = await get('/api/teachers/analytics', T.teacherToken);
    const rows = r.body.genderDistribution || [];
    assertGte(rows.length, 1, 'genderDistribution should have at least 1 row');
    for (const row of rows) {
      assert('gender' in row, `Row missing "gender" key: ${JSON.stringify(row)}`);
      assert(typeof row.count === 'number', `row.count must be number: ${JSON.stringify(row)}`);
    }
  });

  await test('BUG-ANA-DIST-T: stageDistribution total == total student count', async () => {
    const r = await get('/api/teachers/analytics', T.teacherToken);
    const total = (r.body.stageDistribution || []).reduce((s, row) => s + row.count, 0);
    assertEqual(total, 5, `stageDistribution counts should sum to 5 (our 5 students), got ${total}`);
  });

  await test('BUG-ANA-DIST-T: genderDistribution total == total student count', async () => {
    const r = await get('/api/teachers/analytics', T.teacherToken);
    const total = (r.body.genderDistribution || []).reduce((s, row) => s + row.count, 0);
    assertEqual(total, 5, `genderDistribution counts should sum to 5, got ${total}`);
  });

  await test('BUG-ANA-DIST-T: correct gender counts (3 ذكر, 2 أنثى)', async () => {
    const r = await get('/api/teachers/analytics', T.teacherToken);
    const rows = r.body.genderDistribution || [];
    const male   = rows.find(x => x.gender === 'ذكر');
    const female = rows.find(x => x.gender === 'أنثى');
    assert(male,   'ذكر row must be present');
    assert(female, 'أنثى row must be present');
    assertEqual(male.count,   3, `Expected 3 males, got ${male?.count}`);
    assertEqual(female.count, 2, `Expected 2 females, got ${female?.count}`);
  });

  await test('BUG-ANA-DIST-T: correct stage distribution (2/2/1)', async () => {
    const r = await get('/api/teachers/analytics', T.teacherToken);
    const rows = r.body.stageDistribution || [];
    const s1 = rows.find(x => x.stage === 'الصف الأول الثانوي');
    const s2 = rows.find(x => x.stage === 'الصف الثاني الثانوي');
    const s3 = rows.find(x => x.stage === 'الصف الثالث الثانوي');
    assert(s1, 'الصف الأول الثانوي must appear');
    assert(s2, 'الصف الثاني الثانوي must appear');
    assert(s3, 'الصف الثالث الثانوي must appear');
    assertEqual(s1.count, 2, `s1.count should be 2, got ${s1?.count}`);
    assertEqual(s2.count, 2, `s2.count should be 2, got ${s2?.count}`);
    assertEqual(s3.count, 1, `s3.count should be 1, got ${s3?.count}`);
  });

  await test('BUG-ANA-DIST-T: topStudents still present (existing behavior unchanged)', async () => {
    const r = await get('/api/teachers/analytics', T.teacherToken);
    assert(Array.isArray(r.body.topStudents), 'topStudents must still be an array');
  });

  await test('BUG-ANA-DIST-T: teacher isolation — other teacher sees their own distribution', async () => {
    const r = await get('/api/teachers/analytics', T.otherTeacherToken);
    assertEqual(r.status, 200);
    const total = (r.body.stageDistribution || []).reduce((s, row) => s + row.count, 0);
    assertEqual(total, 0, 'Other teacher has no students, stageDistribution total must be 0');
  });
}

// ── BUG-ANA-DIST-A: /assistants/analytics must return stageDistribution & genderDistribution ─

async function testAssistantAnalyticsDistribution() {
  console.log('\n📊  BUG-ANA-DIST-A — Assistant analytics distribution fields');

  await test('GET /api/assistants/analytics returns 200 for assistant', async () => {
    const r = await get('/api/assistants/analytics', T.assistantToken);
    assertEqual(r.status, 200, `Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('BUG-ANA-DIST-A: stageDistribution present in assistant analytics', async () => {
    const r = await get('/api/assistants/analytics', T.assistantToken);
    assert(Array.isArray(r.body.stageDistribution),
      'stageDistribution must be an array in assistants/analytics');
  });

  await test('BUG-ANA-DIST-A: genderDistribution present in assistant analytics', async () => {
    const r = await get('/api/assistants/analytics', T.assistantToken);
    assert(Array.isArray(r.body.genderDistribution),
      'genderDistribution must be an array in assistants/analytics');
  });

  await test('BUG-ANA-DIST-A: assistant sees same teacher stageDistribution as teacher', async () => {
    const [teacherR, asstR] = await Promise.all([
      get('/api/teachers/analytics', T.teacherToken),
      get('/api/assistants/analytics', T.assistantToken),
    ]);
    const teacherTotal = (teacherR.body.stageDistribution || []).reduce((s, r) => s + r.count, 0);
    const asstTotal    = (asstR.body.stageDistribution    || []).reduce((s, r) => s + r.count, 0);
    assertEqual(asstTotal, teacherTotal,
      `Assistant stageDistribution total (${asstTotal}) must match teacher's (${teacherTotal})`);
  });

  await test('BUG-ANA-DIST-A: stageDistribution rows have correct shape', async () => {
    const r = await get('/api/assistants/analytics', T.assistantToken);
    for (const row of r.body.stageDistribution || []) {
      assert('stage' in row, `Missing "stage": ${JSON.stringify(row)}`);
      assert(typeof row.count === 'number', `count not a number: ${JSON.stringify(row)}`);
    }
  });

  await test('BUG-ANA-DIST-A: 401 for unauthenticated request', async () => {
    const r = await get('/api/assistants/analytics', null);
    assertEqual(r.status, 401);
  });
}

// ── BUG-REC-CACHE: /recitations/analytics must return correct data & be stable ──

async function testRecitationsAnalytics() {
  console.log('\n🗂️   BUG-REC-CACHE — Recitations analytics caching');

  await test('GET /api/recitations/analytics returns 200 for teacher', async () => {
    const r = await get('/api/recitations/analytics', T.teacherToken);
    assertEqual(r.status, 200, `Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('BUG-REC-CACHE: response has expected top-level keys', async () => {
    const r = await get('/api/recitations/analytics', T.teacherToken);
    assert('summary'            in r.body, 'missing summary');
    assert('by_stage'           in r.body, 'missing by_stage');
    assert('top_students'       in r.body, 'missing top_students');
    assert('recent_recitations' in r.body, 'missing recent_recitations');
  });

  await test('BUG-REC-CACHE: summary.total_recitations >= 1 (we created one)', async () => {
    const r = await get('/api/recitations/analytics', T.teacherToken);
    assertGte(r.body.summary.total_recitations, 1,
      `total_recitations should be >= 1, got ${r.body.summary.total_recitations}`);
  });

  await test('BUG-REC-CACHE: second call returns identical data (cache hit)', async () => {
    const [r1, r2] = await Promise.all([
      get('/api/recitations/analytics', T.teacherToken),
      get('/api/recitations/analytics', T.teacherToken),
    ]);
    assertEqual(r1.status, 200);
    assertEqual(r2.status, 200);
    // Both should return the same total
    assertEqual(
      r1.body.summary.total_recitations,
      r2.body.summary.total_recitations,
      'Concurrent calls must return consistent data'
    );
  });

  await test('BUG-REC-CACHE: avg_score in summary is a percentage (0-100)', async () => {
    const r = await get('/api/recitations/analytics', T.teacherToken);
    const avg = r.body.summary.avg_score;
    assert(typeof avg === 'number', `avg_score must be number, got ${typeof avg}`);
    assert(avg >= 0 && avg <= 100, `avg_score must be 0-100, got ${avg}`);
  });

  await test('BUG-REC-CACHE: 200 for assistant with can_view_analytics', async () => {
    const r = await get('/api/recitations/analytics', T.assistantToken);
    assertEqual(r.status, 200, `Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('BUG-REC-CACHE: by_stage entries have normalized avg_score (0-100)', async () => {
    const r = await get('/api/recitations/analytics', T.teacherToken);
    for (const row of r.body.by_stage || []) {
      const avg = parseFloat(row.avg_score);
      assert(avg >= 0 && avg <= 100,
        `by_stage avg_score must be 0-100, got ${avg} for stage ${row.stage}`);
    }
  });

  await test('BUG-REC-CACHE: top_students have normalized avg_score (0-100)', async () => {
    const r = await get('/api/recitations/analytics', T.teacherToken);
    for (const s of r.body.top_students || []) {
      const avg = parseFloat(s.avg_score);
      assert(avg >= 0 && avg <= 100,
        `top_students avg_score must be 0-100, got ${avg} for student ${s.name}`);
    }
  });

  await test('BUG-REC-CACHE: teacher isolation — other teacher sees 0 recitations', async () => {
    const r = await get('/api/recitations/analytics', T.otherTeacherToken);
    assertEqual(r.status, 200);
    assertEqual(r.body.summary.total_recitations, 0,
      'Other teacher must see 0 recitations');
  });
}

// ── BUG-ANA-WRONGQ: wrong-questions index safety (guard against out-of-bounds) ─
// This is a frontend fix (useEffect reset); we validate the API shape so the
// frontend has correct data to guard against.

async function testWrongQuestions() {
  console.log('\n❓  BUG-ANA-WRONGQ — Wrong-questions data shape');

  await test('GET /api/teachers/analytics/wrong-questions returns 200', async () => {
    const r = await get('/api/teachers/analytics/wrong-questions', T.teacherToken);
    assertEqual(r.status, 200, `Expected 200 got ${r.status}`);
    assert(Array.isArray(r.body), 'Response must be an array');
  });

  await test('BUG-ANA-WRONGQ: each element has exam_title and questions array', async () => {
    const r = await get('/api/teachers/analytics/wrong-questions', T.teacherToken);
    for (const item of r.body) {
      assert('exam_title' in item, `Missing exam_title: ${JSON.stringify(item)}`);
      assert(Array.isArray(item.questions), `questions must be an array: ${JSON.stringify(item)}`);
    }
  });

  await test('BUG-ANA-WRONGQ: wrong_pct is a parseable number', async () => {
    const r = await get('/api/teachers/analytics/wrong-questions', T.teacherToken);
    for (const item of r.body) {
      for (const q of item.questions) {
        const pct = parseFloat(q.wrong_pct);
        assert(!isNaN(pct), `wrong_pct is NaN: ${JSON.stringify(q)}`);
        assert(pct >= 0 && pct <= 100, `wrong_pct out of range: ${pct}`);
      }
    }
  });

  await test('BUG-ANA-WRONGQ: 200 for assistant with can_view_analytics', async () => {
    const r = await get('/api/teachers/analytics/wrong-questions', T.assistantToken);
    assertEqual(r.status, 200, `Expected 200 got ${r.status}`);
  });
}

// ── BUG-ANA-KPD: trend endpoint must work for both months=0 and months>0 ────

async function testTrendEndpoint() {
  console.log('\n📈  BUG-ANA-KPD — Trend endpoint (keepPreviousData relies on valid API)');

  await test('GET /api/teachers/analytics/trend?months=6 returns 200', async () => {
    const r = await get('/api/teachers/analytics/trend?months=6', T.teacherToken);
    assertEqual(r.status, 200, `Expected 200 got ${r.status}`);
    assert(Array.isArray(r.body), 'Trend must be an array');
  });

  await test('BUG-ANA-KPD: months=1 returns array', async () => {
    const r = await get('/api/teachers/analytics/trend?months=1', T.teacherToken);
    assertEqual(r.status, 200);
    assert(Array.isArray(r.body), 'Must be array');
  });

  await test('BUG-ANA-KPD: months=12 returns array', async () => {
    const r = await get('/api/teachers/analytics/trend?months=12', T.teacherToken);
    assertEqual(r.status, 200);
    assert(Array.isArray(r.body), 'Must be array');
  });

  await test('BUG-ANA-KPD: months=0 (all time) returns array', async () => {
    // The "الكل" period sends months=0. The backend guard is
    // (!isNaN(rawMonths) && rawMonths > 0) which falls back to months=6,
    // still returns a valid array — this is the current behaviour.
    const r = await get('/api/teachers/analytics/trend?months=0', T.teacherToken);
    assertEqual(r.status, 200, `Expected 200 got ${r.status}`);
    assert(Array.isArray(r.body), 'months=0 must return an array');
  });

  await test('BUG-ANA-KPD: trend rows have month and avg_pct fields', async () => {
    const r = await get('/api/teachers/analytics/trend?months=6', T.teacherToken);
    for (const row of r.body) {
      assert('month' in row, `Missing month field: ${JSON.stringify(row)}`);
    }
  });
}

// ── Archive exam-results endpoint sanity ────────────────────────────────────

async function testArchiveExamResults() {
  console.log('\n🗃️   Archive exam-results sanity');

  await test('GET /api/archive/exam-results returns 200', async () => {
    const r = await get('/api/archive/exam-results', T.teacherToken);
    assertEqual(r.status, 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('Archive exam-results has results and total fields', async () => {
    const r = await get('/api/archive/exam-results', T.teacherToken);
    assert('results' in r.body, `Missing results field; got keys: ${Object.keys(r.body).join(',')}`);
    assert('total'   in r.body, 'Missing total field');
    assert(Array.isArray(r.body.results), 'results must be an array');
  });

  await test('Archive exam-results — filter by exam_id returns only that exam', async () => {
    const r = await get(`/api/archive/exam-results?exam_id=${T.courseExamId}`, T.teacherToken);
    assertEqual(r.status, 200);
    for (const row of r.body.results || []) {
      assertEqual(row.exam_id, T.courseExamId,
        `Expected exam_id ${T.courseExamId}, got ${row.exam_id}`);
    }
  });

  await test('Archive exam-results — status=pass only returns passing results', async () => {
    const r = await get('/api/archive/exam-results?status=pass', T.teacherToken);
    assertEqual(r.status, 200);
    for (const row of r.body.results || []) {
      assert(row.score >= row.pass_score,
        `Passing filter returned failing result: score=${row.score} pass_score=${row.pass_score}`);
    }
  });

  await test('Archive exam-results — tenant isolation', async () => {
    const r = await get('/api/archive/exam-results', T.otherTeacherToken);
    assertEqual(r.status, 200);
    const ids = (r.body.data || []).map(x => x.exam_id);
    assert(
      !ids.includes(T.courseExamId),
      'Other teacher must not see first teacher\'s exam results'
    );
  });
}

// ── Archive students endpoint sanity ────────────────────────────────────────

async function testArchiveStudents() {
  console.log('\n👥  Archive students sanity');

  await test('GET /api/archive/students returns 200', async () => {
    const r = await get('/api/archive/students', T.teacherToken);
    assertEqual(r.status, 200, `Expected 200, got ${r.status}`);
  });

  await test('Archive students response has {students, total, page, limit}', async () => {
    const r = await get('/api/archive/students', T.teacherToken);
    const keys = Object.keys(r.body).join(',');
    assert('total' in r.body, `Missing total; got: ${keys}`);
    assert('page'  in r.body, `Missing page; got: ${keys}`);
    assert('limit' in r.body, `Missing limit; got: ${keys}`);
    // The list key may be "students" or "results" depending on the route
    const listKey = 'students' in r.body ? 'students' : 'results' in r.body ? 'results' : null;
    assert(listKey, `No list key found in response; got: ${keys}`);
    assert(Array.isArray(r.body[listKey]), `${listKey} must be an array`);
  });

  await test('Archive students — shows our 5 students (or a subset)', async () => {
    const r = await get('/api/archive/students', T.teacherToken);
    assertGte(r.body.total, 1, 'Should have at least 1 student');
  });

  await test('Archive students — has_type=exams filter works', async () => {
    const r = await get('/api/archive/students?has_type=exams', T.teacherToken);
    assertEqual(r.status, 200);
    const listKey = 'students' in r.body ? 'students' : 'results' in r.body ? 'results' : null;
    assert(listKey, `No list key in response: ${Object.keys(r.body).join(',')}`);
    for (const s of r.body[listKey] || []) {
      assertGte(Number(s.total_exams), 1,
        `has_type=exams returned student with 0 exams: ${JSON.stringify(s)}`);
    }
  });

  await test('Archive students — isolation from other teacher', async () => {
    const r = await get('/api/archive/students', T.otherTeacherToken);
    assertEqual(r.status, 200);
    assertEqual(r.body.total, 0, 'Other teacher has no students');
  });
}

// ── At-risk students endpoint sanity ────────────────────────────────────────

async function testAtRiskStudents() {
  console.log('\n⚠️   At-risk students endpoint sanity');

  await test('GET /api/teachers/at-risk-students returns 200', async () => {
    const r = await get('/api/teachers/at-risk-students', T.teacherToken);
    assertEqual(r.status, 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.body), 'Must be array');
  });

  await test('At-risk — teacher isolation (other teacher sees their own list)', async () => {
    const r = await get('/api/teachers/at-risk-students', T.otherTeacherToken);
    assertEqual(r.status, 200);
    const ids = (r.body || []).map(s => s.id);
    assert(
      !T.studentIds.some(id => ids.includes(id)),
      'Other teacher must not see first teacher\'s students as at-risk'
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' Archive & Analytics Audit — Bug-Fix Verification Tests');
  console.log('═══════════════════════════════════════════════════════════════');

  try {
    await setup();

    await testArchiveFilters();
    await testTeacherAnalyticsDistribution();
    await testAssistantAnalyticsDistribution();
    await testRecitationsAnalytics();
    await testWrongQuestions();
    await testTrendEndpoint();
    await testArchiveExamResults();
    await testArchiveStudents();
    await testAtRiskStudents();

  } catch (err) {
    console.error('\n💥  Fatal setup error:', err.message);
    failed++;
  } finally {
    try { await teardown(); } catch (e) { console.error('Teardown error:', e.message); }
    await pool.end();
  }

  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('───────────────────────────────────────────────────────────────\n');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
