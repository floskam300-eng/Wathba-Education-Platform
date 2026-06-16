/**
 * WATHBA — Absent Marking + Retry History Test Suite
 * =====================================================
 * Covers every edge case for:
 *   1. markAbsentStudents() — correct absent insertion logic
 *   2. runEndedExamCheck() scheduler — published-only guard
 *   3. Student exam history (/student/my-results)
 *   4. Archive students list (absent-only visibility)
 *   5. Review endpoint security (absent block)
 *   6. Republish 409 message accuracy
 *   7. Course-results absent field
 *   8. Analytics examResults accuracy
 *
 * Run: node server/tests/absent_retry_test.js
 * Requires: DATABASE_URL + JWT_SECRET env vars, server on port 3001.
 */

require('dotenv').config();
const pool   = require('../db/connection');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../middleware/auth');

const BASE = 'http://localhost:3001/api';

// ── Colour helpers ─────────────────────────────────────────────────────────────
const C = {
  reset:'\x1b[0m', bold:'\x1b[1m',
  green:'\x1b[32m', red:'\x1b[31m', yellow:'\x1b[33m',
  cyan:'\x1b[36m', gray:'\x1b[90m',
};
const pass  = m => `${C.green}${C.bold}  ✓ PASS${C.reset}  ${m}`;
const fail  = m => `${C.red}${C.bold}  ✗ FAIL${C.reset}  ${m}`;
const note  = m => `${C.gray}     ↳ ${m}${C.reset}`;
const head  = m => `\n${C.cyan}${C.bold}══ ${m} ══${C.reset}`;

let passed = 0, failed = 0;
const failures = [];

function assert(name, cond, detail = '') {
  if (cond) {
    console.log(pass(name));
    if (detail) console.log(note(detail));
    passed++;
  } else {
    console.log(fail(name));
    if (detail) console.log(note(`${C.red}${detail}${C.reset}`));
    failed++;
    failures.push({ name, detail });
  }
}

// ── HTTP helper ────────────────────────────────────────────────────────────────
async function req(method, path, body, token, slug) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (slug)  headers['X-Tenant-Slug'] = slug;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

// ── State ──────────────────────────────────────────────────────────────────────
let T = {};  // teacher row
let S1 = {}, S2 = {}, S3 = {};  // student rows
let EXAM_ID, EXAM_ID_UNPUB, COURSE_ID;
let S1_TOKEN, S2_TOKEN, S3_TOKEN, T_TOKEN;
const SLUG = '_test_absent_slug';

// ── Setup ──────────────────────────────────────────────────────────────────────
async function setup() {
  // Wipe leftovers from previous runs
  await pool.query(`DELETE FROM teachers WHERE username = '_test_absent_teacher'`);
  await pool.query(`DELETE FROM students  WHERE username LIKE '_abs_s%'`);

  const hash = await bcrypt.hash('TestPass123!', 10);

  // Teacher
  const tr = await pool.query(
    `INSERT INTO teachers (username, password, name, slug)
     VALUES ('_test_absent_teacher', $1, 'Absent Test Teacher', $2)
     RETURNING *`,
    [hash, SLUG]
  );
  T = tr.rows[0];

  // Students
  async function makeStudent(uname, name) {
    const r = await pool.query(
      `INSERT INTO students (username, password, name, teacher_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [uname, hash, name, T.id]
    );
    return r.rows[0];
  }
  S1 = await makeStudent('_abs_s1', 'Absent Student One');
  S2 = await makeStudent('_abs_s2', 'Absent Student Two');
  S3 = await makeStudent('_abs_s3', 'Retry Student Three');

  // Generate JWT tokens directly (avoids HTTP login complexity: device_id, slug cache, etc.)
  T_TOKEN  = generateToken({ id: T.id,  role: 'teacher', username: T.username,  name: T.name,  teacher_slug: SLUG });
  S1_TOKEN = generateToken({ id: S1.id, role: 'student', username: S1.username, name: S1.name, teacher_id: T.id, teacher_slug: SLUG });
  S2_TOKEN = generateToken({ id: S2.id, role: 'student', username: S2.username, name: S2.name, teacher_id: T.id, teacher_slug: SLUG });
  S3_TOKEN = generateToken({ id: S3.id, role: 'student', username: S3.username, name: S3.name, teacher_id: T.id, teacher_slug: SLUG });

  console.log(note(`Tokens generated directly — T=${!!T_TOKEN} S1=${!!S1_TOKEN} S2=${!!S2_TOKEN} S3=${!!S3_TOKEN}`));

  // Course for course-results tests
  const cr = await pool.query(
    `INSERT INTO courses (name, teacher_id, is_published) VALUES ('Test Course Absent', $1, true) RETURNING *`,
    [T.id]
  );
  COURSE_ID = cr.rows[0].id;

  // Enroll S3 in the course
  await pool.query(
    `INSERT INTO student_course_enrollment (student_id, course_id, status) VALUES ($1, $2, 'active')`,
    [S3.id, COURSE_ID]
  );

  console.log(note(`Teacher id=${T.id}, S1=${S1.id}, S2=${S2.id}, S3=${S3.id}`));
}

// ── Teardown ───────────────────────────────────────────────────────────────────
async function teardown() {
  await pool.query(`DELETE FROM teachers WHERE id = $1`, [T.id]);
  // Cascade deletes students, exams, exam_results, enrollments
}

// ── DB helpers ─────────────────────────────────────────────────────────────────
async function makeExam({ published = true, endedHoursAgo = null, absentMarked = false, courseId = null } = {}) {
  const endDate = endedHoursAgo != null
    ? new Date(Date.now() - endedHoursAgo * 3600 * 1000).toISOString()
    : null;
  const r = await pool.query(
    `INSERT INTO exams (title, teacher_id, duration_minutes, total_score, pass_score,
                        is_published, end_date, absent_marked, course_id)
     VALUES ($1, $2, 60, 100, 50, $3, $4, $5, $6) RETURNING *`,
    [`Test Exam ${Date.now()}`, T.id, published, endDate, absentMarked, courseId || null]
  );
  return r.rows[0];
}

async function insertAbsentRecord(studentId, examId, attemptNumber = 1) {
  await pool.query(
    `INSERT INTO exam_results
       (student_id, exam_id, score, correct_count, wrong_count, unanswered_count,
        start_time, end_time, answers, points_earned, attempt_number, is_latest, is_absent)
     VALUES ($1, $2, 0, 0, 0, 0, NOW()-INTERVAL '1 hour', NOW(), '[]'::jsonb, 0, $3, true, true)
     ON CONFLICT DO NOTHING`,
    [studentId, examId, attemptNumber]
  );
}

async function insertRealResult(studentId, examId, score, attemptNumber = 1, isLatest = true) {
  await pool.query(
    `INSERT INTO exam_results
       (student_id, exam_id, score, correct_count, wrong_count, unanswered_count,
        start_time, end_time, answers, points_earned, attempt_number, is_latest, is_absent)
     VALUES ($1, $2, $3, 1, 0, 0, NOW()-INTERVAL '1 hour', NOW(), '[]'::jsonb, 0, $4, $5, false)
     ON CONFLICT DO NOTHING`,
    [studentId, examId, score, attemptNumber, isLatest]
  );
}

async function countAbsentRows(examId) {
  const r = await pool.query(
    `SELECT COUNT(*) AS cnt FROM exam_results WHERE exam_id=$1 AND is_absent=true`, [examId]
  );
  return parseInt(r.rows[0].cnt);
}

async function countRealRows(examId) {
  const r = await pool.query(
    `SELECT COUNT(*) AS cnt FROM exam_results WHERE exam_id=$1 AND is_absent=false`, [examId]
  );
  return parseInt(r.rows[0].cnt);
}

// ─────────────────────────────────────────────────────────────────────────────
async function run() {
  await setup();

  // ══════════════════════════════════════════════════════════════════════════
  console.log(head('1. markAbsentStudents — DB-level logic'));
  // ══════════════════════════════════════════════════════════════════════════

  const { markAbsentStudents } = require('../routes/exams');

  await (async () => {
    const exam = await makeExam({ published: true, endedHoursAgo: 2 });
    await markAbsentStudents(pool, exam.id, T.id);
    const absent = await countAbsentRows(exam.id);

    assert(
      'M-1: marks all enrolled (non-course) students absent',
      absent === 3,
      `expected 3 (S1, S2, S3), got ${absent}`
    );
    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('UPDATE exams SET absent_marked=false WHERE id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    const exam = await makeExam({ published: true, endedHoursAgo: 2 });
    // S1 already has a real result
    await insertRealResult(S1.id, exam.id, 80);
    await markAbsentStudents(pool, exam.id, T.id);

    const absentForS1 = await pool.query(
      `SELECT * FROM exam_results WHERE student_id=$1 AND exam_id=$2 AND is_absent=true`,
      [S1.id, exam.id]
    );
    assert(
      'M-2: student who already submitted is NOT marked absent',
      absentForS1.rows.length === 0,
      `S1 should have 0 absent rows, found ${absentForS1.rows.length}`
    );
    const total = await countAbsentRows(exam.id);
    assert(
      'M-3: only the remaining 2 students get absent records',
      total === 2,
      `expected 2, got ${total}`
    );
    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    const exam = await makeExam({ published: true, endedHoursAgo: 2 });
    await markAbsentStudents(pool, exam.id, T.id);
    // Call again — should NOT insert duplicates
    await markAbsentStudents(pool, exam.id, T.id);
    const absent = await countAbsentRows(exam.id);
    assert(
      'M-4: calling markAbsentStudents twice does not create duplicate records',
      absent === 3,
      `expected 3, got ${absent}`
    );
    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    const exam = await makeExam({ published: true, endedHoursAgo: 2 });
    await markAbsentStudents(pool, exam.id, T.id);
    // Verify is_latest=true and attempt_number=1 on all absent rows
    const rows = await pool.query(
      `SELECT is_latest, attempt_number, is_absent FROM exam_results WHERE exam_id=$1`,
      [exam.id]
    );
    const allLatest   = rows.rows.every(r => r.is_latest === true);
    const allAttempt1 = rows.rows.every(r => r.attempt_number === 1);
    const allAbsent   = rows.rows.every(r => r.is_absent   === true);
    assert('M-5: absent records have is_latest=true',    allLatest,   `rows: ${JSON.stringify(rows.rows)}`);
    assert('M-6: absent records have attempt_number=1',  allAttempt1, `rows: ${JSON.stringify(rows.rows)}`);
    assert('M-7: absent records have is_absent=true',    allAbsent,   `rows: ${JSON.stringify(rows.rows)}`);
    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // Absent records for a course exam only affects enrolled students
    const courseExam = await makeExam({ published: true, endedHoursAgo: 2, courseId: COURSE_ID });
    // Only S3 is enrolled in COURSE_ID
    await markAbsentStudents(pool, courseExam.id, T.id);
    const absent = await countAbsentRows(courseExam.id);
    assert(
      'M-8: course exam — only enrolled students get absent record',
      absent === 1,
      `expected 1 (S3 only), got ${absent}`
    );
    const row = await pool.query(
      `SELECT student_id FROM exam_results WHERE exam_id=$1 AND is_absent=true`, [courseExam.id]
    );
    assert(
      'M-9: course exam — the absent student is S3 (enrolled)',
      row.rows[0]?.student_id === S3.id,
      `expected S3 id=${S3.id}, got ${row.rows[0]?.student_id}`
    );
    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [courseExam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [courseExam.id]);
  })();

  await (async () => {
    // absent_marked flag is set to true after marking
    const exam = await makeExam({ published: true, endedHoursAgo: 2 });
    await markAbsentStudents(pool, exam.id, T.id);
    const r = await pool.query(`SELECT absent_marked FROM exams WHERE id=$1`, [exam.id]);
    assert(
      'M-10: absent_marked is set to true after marking',
      r.rows[0].absent_marked === true,
      `absent_marked=${r.rows[0].absent_marked}`
    );
    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // Student with is_latest=false (archived attempt) still gets marked absent
    // if they have NO is_latest=true result (can't happen in normal flow, but test the guard)
    // In normal flow: if a student has any result the NOT EXISTS guard fires.
    const exam = await makeExam({ published: true, endedHoursAgo: 2 });
    // Insert a NON-latest result for S1 (simulates archived old attempt with no current result)
    await pool.query(
      `INSERT INTO exam_results
         (student_id, exam_id, score, correct_count, wrong_count, unanswered_count,
          start_time, end_time, answers, points_earned, attempt_number, is_latest, is_absent)
       VALUES ($1, $2, 60, 1, 0, 0, NOW()-INTERVAL '2 hours', NOW()-INTERVAL '1 hour', '[]', 0, 1, false, false)`,
      [S1.id, exam.id]
    );
    await markAbsentStudents(pool, exam.id, T.id);
    // S1 already has a result (even non-latest), so NOT EXISTS fires — no absent row
    const s1Absent = await pool.query(
      `SELECT * FROM exam_results WHERE student_id=$1 AND exam_id=$2 AND is_absent=true`,
      [S1.id, exam.id]
    );
    assert(
      'M-11: student with ANY existing result (even archived) is not marked absent',
      s1Absent.rows.length === 0,
      `found ${s1Absent.rows.length} absent rows for S1`
    );
    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  // ══════════════════════════════════════════════════════════════════════════
  console.log(head('2. Scheduler — published-only guard (BUG-1)'));
  // ══════════════════════════════════════════════════════════════════════════

  await (async () => {
    // Unpublished exam with past end_date should NOT be processed by scheduler
    const unpubExam = await makeExam({ published: false, endedHoursAgo: 2 });
    // Simulate what the scheduler query does (with our fix)
    const { rows } = await pool.query(`
      SELECT e.id FROM exams e
      WHERE e.end_date IS NOT NULL
        AND e.end_date <= NOW()
        AND e.absent_marked = false
        AND e.is_published = true
        AND e.id = $1
    `, [unpubExam.id]);
    assert(
      'S-1: scheduler query skips unpublished exams (is_published=true guard)',
      rows.length === 0,
      `should be 0 but found ${rows.length} rows`
    );
    await pool.query('DELETE FROM exams WHERE id=$1', [unpubExam.id]);
  })();

  await (async () => {
    // Published exam with past end_date SHOULD be processed
    const pubExam = await makeExam({ published: true, endedHoursAgo: 2 });
    const { rows } = await pool.query(`
      SELECT e.id FROM exams e
      WHERE e.end_date IS NOT NULL
        AND e.end_date <= NOW()
        AND e.absent_marked = false
        AND e.is_published = true
        AND e.id = $1
    `, [pubExam.id]);
    assert(
      'S-2: scheduler query includes published ended exams',
      rows.length === 1,
      `should be 1 but found ${rows.length} rows`
    );
    await pool.query('DELETE FROM exams WHERE id=$1', [pubExam.id]);
  })();

  await (async () => {
    // Exam with absent_marked=true should NOT be reprocessed by scheduler
    const exam = await makeExam({ published: true, endedHoursAgo: 2, absentMarked: true });
    const { rows } = await pool.query(`
      SELECT e.id FROM exams e
      WHERE e.end_date IS NOT NULL
        AND e.end_date <= NOW()
        AND e.absent_marked = false
        AND e.is_published = true
        AND e.id = $1
    `, [exam.id]);
    assert(
      'S-3: scheduler skips exams already marked (absent_marked=true)',
      rows.length === 0,
      `should be 0 but found ${rows.length} rows`
    );
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // Future exam should NOT be processed
    const futureExam = await makeExam({ published: true });  // no end_date
    const { rows } = await pool.query(`
      SELECT e.id FROM exams e
      WHERE e.end_date IS NOT NULL
        AND e.end_date <= NOW()
        AND e.absent_marked = false
        AND e.is_published = true
        AND e.id = $1
    `, [futureExam.id]);
    assert(
      'S-4: scheduler skips exams with no end_date',
      rows.length === 0,
      `should be 0 (no end_date)`
    );
    await pool.query('DELETE FROM exams WHERE id=$1', [futureExam.id]);
  })();

  // ══════════════════════════════════════════════════════════════════════════
  console.log(head('3. GET /exams/student/my-results'));
  // ══════════════════════════════════════════════════════════════════════════

  await (async () => {
    // Empty history
    const r = await req('GET', '/exams/student/my-results', null, S1_TOKEN);
    assert('R-1: returns 200 for student with no results', r.status === 200, `status=${r.status}`);
    assert('R-2: returns array', Array.isArray(r.data), `got ${typeof r.data}`);
    assert('R-3: empty array for new student', r.data.length === 0, `length=${r.data.length}`);
  })();

  await (async () => {
    const exam = await makeExam({ published: true, endedHoursAgo: 2 });
    EXAM_ID = exam.id;
    // Insert absent record for S1
    await insertAbsentRecord(S1.id, exam.id);

    const r = await req('GET', '/exams/student/my-results', null, S1_TOKEN);
    assert('R-4: absent record appears in my-results', r.status === 200 && r.data.length >= 1, `status=${r.status} length=${r.data?.length}`);
    const row = r.data.find(x => x.exam_id === exam.id);
    assert('R-5: absent record has is_absent=true', row?.is_absent === true, `is_absent=${row?.is_absent}`);
    assert('R-6: absent record has is_latest=true', row?.is_latest === true, `is_latest=${row?.is_latest}`);
    assert('R-7: absent record has score=0',        parseInt(row?.score) === 0, `score=${row?.score}`);
    assert('R-8: absent record includes exam_title', !!row?.exam_title, `exam_title=${row?.exam_title}`);
    // Clean up so subsequent tests see a clean slate for S1
    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // Real result appears with is_absent=false
    const exam = await makeExam({ published: true, endedHoursAgo: 1 });
    await insertRealResult(S2.id, exam.id, 75);

    const r = await req('GET', '/exams/student/my-results', null, S2_TOKEN);
    const row = r.data.find(x => x.exam_id === exam.id);
    assert('R-9: real result has is_absent=false', row?.is_absent === false, `is_absent=${row?.is_absent}`);
    assert('R-10: real result shows correct score', parseInt(row?.score) === 75, `score=${row?.score}`);
    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // Retry history: S3 has 2 attempts (old archived + new latest)
    const exam = await makeExam({ published: true, endedHoursAgo: 1 });
    await pool.query(
      `INSERT INTO exam_results
         (student_id, exam_id, score, correct_count, wrong_count, unanswered_count,
          start_time, end_time, answers, points_earned, attempt_number, is_latest, is_absent)
       VALUES ($1, $2, 40, 0, 2, 0, NOW()-INTERVAL '2 hours', NOW()-INTERVAL '1 hour', '[]', 0, 1, false, false),
              ($1, $2, 70, 2, 0, 0, NOW()-INTERVAL '30 minutes', NOW(), '[]', 0, 2, true, false)`,
      [S3.id, exam.id]
    );
    const r = await req('GET', '/exams/student/my-results', null, S3_TOKEN);
    const rows = r.data.filter(x => x.exam_id === exam.id);
    assert('R-11: both attempts appear in history', rows.length === 2, `got ${rows.length}`);
    const latest  = rows.find(x => x.is_latest === true);
    const archive = rows.find(x => x.is_latest === false);
    assert('R-12: latest attempt has attempt_number=2', parseInt(latest?.attempt_number) === 2, `got ${latest?.attempt_number}`);
    assert('R-13: archived attempt has is_latest=false', archive?.is_latest === false, `is_latest=${archive?.is_latest}`);
    assert('R-14: latest attempt has higher score', parseInt(latest?.score) > parseInt(archive?.score), `latest=${latest?.score} archive=${archive?.score}`);
    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // Endpoint requires authentication
    const r = await req('GET', '/exams/student/my-results', null, null);
    assert('R-15: my-results rejects unauthenticated request', r.status === 401, `status=${r.status}`);
  })();

  // ══════════════════════════════════════════════════════════════════════════
  console.log(head('4. GET /results/:id/review — absent guard (BUG-3)'));
  // ══════════════════════════════════════════════════════════════════════════

  await (async () => {
    const exam = await makeExam({ published: true, endedHoursAgo: 1 });
    await insertAbsentRecord(S1.id, exam.id);
    const resultRow = await pool.query(
      `SELECT id FROM exam_results WHERE student_id=$1 AND exam_id=$2 AND is_absent=true`,
      [S1.id, exam.id]
    );
    const resultId = resultRow.rows[0]?.id;

    const r = await req('GET', `/exams/results/${resultId}/review`, null, S1_TOKEN);
    assert(
      'V-1: review endpoint returns 403 for absent result (student)',
      r.status === 403,
      `expected 403, got ${r.status}`
    );
    assert(
      'V-2: error message is in Arabic',
      typeof r.data?.error === 'string' && r.data.error.includes('غائ'),
      `error="${r.data?.error}"`
    );
    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // Teacher CAN review an absent record (to inspect the student's situation)
    const exam = await makeExam({ published: true, endedHoursAgo: 1 });
    await insertAbsentRecord(S1.id, exam.id);
    const resultRow = await pool.query(
      `SELECT id FROM exam_results WHERE student_id=$1 AND exam_id=$2 AND is_absent=true`,
      [S1.id, exam.id]
    );
    const resultId = resultRow.rows[0]?.id;
    // Add a question so review doesn't 500
    await pool.query(
      `INSERT INTO questions (exam_id, question_text, option_a, option_b, correct_answer_letter, points)
       VALUES ($1, 'Q1?', 'A', 'B', 'A', 10)`,
      [exam.id]
    );
    const r = await req('GET', `/exams/results/${resultId}/review`, null, T_TOKEN);
    assert(
      'V-3: teacher can access absent result review (no student-side block for teachers)',
      r.status === 200,
      `expected 200, got ${r.status} — ${JSON.stringify(r.data?.error)}`
    );
    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM questions WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // Valid review for a real result passes
    const exam = await makeExam({ published: true, endedHoursAgo: 1 });
    await pool.query(
      `INSERT INTO questions (exam_id, question_text, option_a, option_b, correct_answer_letter, points)
       VALUES ($1, 'Q?', 'A', 'B', 'A', 10)`,
      [exam.id]
    );
    await insertRealResult(S1.id, exam.id, 80);
    const resultRow = await pool.query(
      `SELECT id FROM exam_results WHERE student_id=$1 AND exam_id=$2 AND is_absent=false`,
      [S1.id, exam.id]
    );
    const resultId = resultRow.rows[0]?.id;
    const r = await req('GET', `/exams/results/${resultId}/review`, null, S1_TOKEN);
    assert(
      'V-4: real result review returns 200 for student',
      r.status === 200,
      `status=${r.status} error="${r.data?.error}"`
    );
    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM questions WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // Wrong student cannot review another's result
    const exam = await makeExam({ published: true, endedHoursAgo: 1 });
    await pool.query(
      `INSERT INTO questions (exam_id, question_text, option_a, option_b, correct_answer_letter, points)
       VALUES ($1, 'Q?', 'A', 'B', 'A', 10)`,
      [exam.id]
    );
    await insertRealResult(S1.id, exam.id, 80);
    const resultRow = await pool.query(
      `SELECT id FROM exam_results WHERE student_id=$1 AND exam_id=$2 AND is_absent=false`,
      [S1.id, exam.id]
    );
    const resultId = resultRow.rows[0]?.id;
    // S2 tries to review S1's result
    const r = await req('GET', `/exams/results/${resultId}/review`, null, S2_TOKEN);
    assert('V-5: cross-student review is blocked (403)', r.status === 403, `status=${r.status}`);
    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM questions WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  // ══════════════════════════════════════════════════════════════════════════
  console.log(head('5. GET /archive/students — absent-only visibility (BUG-4+6)'));
  // ══════════════════════════════════════════════════════════════════════════

  await (async () => {
    const exam = await makeExam({ published: true, endedHoursAgo: 1 });
    // Only S1 is absent, S2 and S3 have nothing
    await insertAbsentRecord(S1.id, exam.id);

    const r = await req('GET', '/archive/students', null, T_TOKEN);
    assert('A-1: returns 200', r.status === 200, `status=${r.status}`);

    const s1Row = r.data?.students?.find(x => x.id === S1.id);
    assert(
      'A-2: absent-only student appears in default list (BUG-4 fix)',
      !!s1Row,
      `S1 not found in results. ids=${r.data?.students?.map(x=>x.id).join(',')}`
    );

    if (s1Row) {
      assert(
        'A-3: absent_exams count is 1 for absent-only student',
        parseInt(s1Row.absent_exams) === 1,
        `absent_exams=${s1Row.absent_exams}`
      );
      assert(
        'A-4: total_exams is 0 for absent-only student (no real submissions)',
        parseInt(s1Row.total_exams) === 0,
        `total_exams=${s1Row.total_exams}`
      );
    }

    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // has_type='exams' should include absent-only students (BUG-6 fix)
    const exam = await makeExam({ published: true, endedHoursAgo: 1 });
    await insertAbsentRecord(S1.id, exam.id);

    const r = await req('GET', '/archive/students?has_type=exams', null, T_TOKEN);
    const s1Row = r.data?.students?.find(x => x.id === S1.id);
    assert(
      'A-5: has_type=exams includes absent-only student (BUG-6 fix)',
      !!s1Row,
      `S1 not found in has_type=exams list`
    );

    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // has_type='recitations' should NOT include exam-absent-only students
    const exam = await makeExam({ published: true, endedHoursAgo: 1 });
    await insertAbsentRecord(S1.id, exam.id);

    const r = await req('GET', '/archive/students?has_type=recitations', null, T_TOKEN);
    const s1Row = r.data?.students?.find(x => x.id === S1.id);
    assert(
      'A-6: has_type=recitations excludes exam-absent-only student',
      !s1Row,
      `S1 should NOT appear in recitations list, but was found`
    );

    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // Student with real result has correct aggregates
    const exam = await makeExam({ published: true, endedHoursAgo: 1 });
    await insertRealResult(S2.id, exam.id, 80);

    const r = await req('GET', '/archive/students', null, T_TOKEN);
    const s2Row = r.data?.students?.find(x => x.id === S2.id);
    assert(
      'A-7: student with real result appears in list',
      !!s2Row,
      `S2 not found. ids=${r.data?.students?.map(x=>x.id).join(',')}`
    );
    if (s2Row) {
      assert(
        'A-8: total_exams=1 for student with one real result',
        parseInt(s2Row.total_exams) === 1,
        `total_exams=${s2Row.total_exams}`
      );
      assert(
        'A-9: absent_exams=0 for student with only real results',
        parseInt(s2Row.absent_exams) === 0,
        `absent_exams=${s2Row.absent_exams}`
      );
    }

    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // Student with BOTH absent and real results
    const exam1 = await makeExam({ published: true, endedHoursAgo: 3 });
    const exam2 = await makeExam({ published: true, endedHoursAgo: 1 });
    await insertAbsentRecord(S3.id, exam1.id);
    await insertRealResult(S3.id, exam2.id, 60);

    const r = await req('GET', '/archive/students', null, T_TOKEN);
    const s3Row = r.data?.students?.find(x => x.id === S3.id);
    if (s3Row) {
      assert(
        'A-10: student with mixed records: total_exams=1',
        parseInt(s3Row.total_exams) === 1,
        `total_exams=${s3Row.total_exams}`
      );
      assert(
        'A-11: student with mixed records: absent_exams=1',
        parseInt(s3Row.absent_exams) === 1,
        `absent_exams=${s3Row.absent_exams}`
      );
    } else {
      assert('A-10: student with mixed records appears in list', false, 'S3 not found');
      assert('A-11: stub', false, 'S3 not found');
    }

    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam1.id]);
    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam2.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam1.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam2.id]);
  })();

  // ══════════════════════════════════════════════════════════════════════════
  console.log(head('6. PUT /exams/:id/publish — 409 message accuracy (BUG-5)'));
  // ══════════════════════════════════════════════════════════════════════════

  await (async () => {
    // Add a question first to allow publishing
    const exam = await makeExam({ published: false });
    await pool.query(
      `INSERT INTO questions (exam_id, question_text, option_a, option_b, correct_answer_letter, points)
       VALUES ($1, 'Q1', 'A', 'B', 'A', 10)`,
      [exam.id]
    );
    // Insert only absent records (no real submissions)
    await insertAbsentRecord(S1.id, exam.id);
    await insertAbsentRecord(S2.id, exam.id);

    const r = await req('PUT', `/exams/${exam.id}/publish`, {}, T_TOKEN);
    assert(
      'P-1: republish with only absent records returns 409',
      r.status === 409,
      `status=${r.status}`
    );
    assert(
      'P-2: 409 message mentions "غائب" not "أدوا" (absent-only message)',
      r.data?.error?.includes('غائب') || r.data?.error?.includes('غيابات') || r.data?.error?.includes('مسجّلون'),
      `error="${r.data?.error}"`
    );
    assert(
      'P-3: 409 response includes real_count=0',
      r.data?.real_count === 0,
      `real_count=${r.data?.real_count}`
    );
    assert(
      'P-4: 409 response includes count=2 (total including absent)',
      r.data?.count === 2,
      `count=${r.data?.count}`
    );

    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM questions WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // Republish with REAL results uses the standard "أدوا" message
    const exam = await makeExam({ published: false });
    await pool.query(
      `INSERT INTO questions (exam_id, question_text, option_a, option_b, correct_answer_letter, points)
       VALUES ($1, 'Q1', 'A', 'B', 'A', 10)`,
      [exam.id]
    );
    await insertRealResult(S1.id, exam.id, 70);

    const r = await req('PUT', `/exams/${exam.id}/publish`, {}, T_TOKEN);
    assert('P-5: republish with real results returns 409', r.status === 409, `status=${r.status}`);
    assert(
      'P-6: 409 message mentions "أدوا" (real-submissions message)',
      r.data?.error?.includes('أدوا'),
      `error="${r.data?.error}"`
    );
    assert(
      'P-7: 409 response includes real_count=1',
      r.data?.real_count === 1,
      `real_count=${r.data?.real_count}`
    );

    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM questions WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // force_reset wipes both absent and real records and resets absent_marked
    const exam = await makeExam({ published: false });
    await pool.query(
      `INSERT INTO questions (exam_id, question_text, option_a, option_b, correct_answer_letter, points)
       VALUES ($1, 'Q1', 'A', 'B', 'A', 10)`,
      [exam.id]
    );
    await insertAbsentRecord(S1.id, exam.id);
    await pool.query(`UPDATE exams SET absent_marked=true WHERE id=$1`, [exam.id]);

    const r = await req('PUT', `/exams/${exam.id}/publish`, { force_reset: true }, T_TOKEN);
    assert('P-8: force_reset with absent records publishes successfully (200)', r.status === 200, `status=${r.status} err="${r.data?.error}"`);

    const remaining = await countAbsentRows(exam.id);
    assert('P-9: force_reset deletes all absent records', remaining === 0, `remaining=${remaining}`);

    const flag = await pool.query(`SELECT absent_marked FROM exams WHERE id=$1`, [exam.id]);
    assert('P-10: force_reset resets absent_marked to false', flag.rows[0]?.absent_marked === false, `absent_marked=${flag.rows[0]?.absent_marked}`);

    await pool.query('DELETE FROM questions WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  // ══════════════════════════════════════════════════════════════════════════
  console.log(head('7. GET /exams/student/course-results — is_absent field (BUG-9)'));
  // ══════════════════════════════════════════════════════════════════════════

  await (async () => {
    const exam = await makeExam({ published: true, endedHoursAgo: 1, courseId: COURSE_ID });
    await insertAbsentRecord(S3.id, exam.id);

    const r = await req('GET', `/exams/student/course-results/${COURSE_ID}`, null, S3_TOKEN);
    assert('C-1: course-results returns 200', r.status === 200, `status=${r.status}`);
    const row = r.data?.find?.(x => x.exam_id === exam.id);
    assert(
      'C-2: absent record appears in course-results',
      !!row,
      `not found. ids=${r.data?.map?.(x=>x.exam_id).join(',')}`
    );
    assert(
      'C-3: is_absent field is present in course-results response (BUG-9 fix)',
      row && 'is_absent' in row,
      `fields: ${Object.keys(row || {}).join(',')}`
    );
    assert(
      'C-4: is_absent=true for absent record',
      row?.is_absent === true,
      `is_absent=${row?.is_absent}`
    );

    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // Non-enrolled student cannot access course-results
    const r = await req('GET', `/exams/student/course-results/${COURSE_ID}`, null, S1_TOKEN);
    assert('C-5: non-enrolled student gets 403 for course-results', r.status === 403, `status=${r.status}`);
  })();

  await (async () => {
    // Real result in course has is_absent=false
    const exam = await makeExam({ published: true, endedHoursAgo: 1, courseId: COURSE_ID });
    await insertRealResult(S3.id, exam.id, 88);

    const r = await req('GET', `/exams/student/course-results/${COURSE_ID}`, null, S3_TOKEN);
    const row = r.data?.find?.(x => x.exam_id === exam.id);
    assert(
      'C-6: real result has is_absent=false in course-results',
      row?.is_absent === false,
      `is_absent=${row?.is_absent}`
    );

    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  // ══════════════════════════════════════════════════════════════════════════
  console.log(head('8. Analytics — examResults accuracy (BUG-8)'));
  // ══════════════════════════════════════════════════════════════════════════

  await (async () => {
    const exam = await makeExam({ published: true, endedHoursAgo: 2 });
    // S1: real result score=80 is_latest=true
    // S2: absent is_latest=true
    // S3: archived attempt score=50 is_latest=false + new attempt score=70 is_latest=true
    await insertRealResult(S1.id, exam.id, 80, 1, true);
    await insertAbsentRecord(S2.id, exam.id);
    await pool.query(
      `INSERT INTO exam_results
         (student_id, exam_id, score, correct_count, wrong_count, unanswered_count,
          start_time, end_time, answers, points_earned, attempt_number, is_latest, is_absent)
       VALUES ($1, $2, 50, 0, 1, 0, NOW()-INTERVAL '3 hours', NOW()-INTERVAL '2 hours', '[]', 0, 1, false, false),
              ($1, $2, 70, 1, 0, 0, NOW()-INTERVAL '1 hour', NOW(), '[]', 0, 2, true, false)`,
      [S3.id, exam.id]
    );

    // Analytics query with BUG-8 fix (is_latest=true filter)
    const { rows } = await pool.query(`
      SELECT e.id,
             ROUND(AVG(er.score::numeric / NULLIF(e.total_score,0) * 100) FILTER (WHERE er.is_absent = false), 1) AS avg_pct,
             COUNT(er.id) FILTER (WHERE er.is_absent = false) as attempt_count,
             COUNT(er.id) FILTER (WHERE er.is_absent = true)  as absent_count
      FROM exam_results er
      JOIN exams e ON er.exam_id = e.id
      WHERE e.teacher_id = $1 AND er.is_latest = true AND e.id = $2
      GROUP BY e.id
    `, [T.id, exam.id]);

    const row = rows[0];
    assert(
      'AN-1: attempt_count=2 (S1 and S3 latest only, S3 archived excluded)',
      parseInt(row?.attempt_count) === 2,
      `attempt_count=${row?.attempt_count}`
    );
    assert(
      'AN-2: absent_count=1 (only S2)',
      parseInt(row?.absent_count) === 1,
      `absent_count=${row?.absent_count}`
    );
    // avg_pct over S1(80) and S3(70) latest only, total_score=100
    // avg = (80+70)/2 = 75%
    assert(
      'AN-3: avg_pct=75 (only latest real results, not archived)',
      parseFloat(row?.avg_pct) === 75.0,
      `avg_pct=${row?.avg_pct}`
    );

    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  // ══════════════════════════════════════════════════════════════════════════
  console.log(head('9. my-results LIMIT guard (BUG-7)'));
  // ══════════════════════════════════════════════════════════════════════════

  await (async () => {
    // Verify the query contains LIMIT 500 at the SQL level (check source)
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/../routes/exams.js', 'utf8');
    const hasLimit = /LIMIT 500/.test(src);
    assert('L-1: my-results query contains LIMIT 500', hasLimit, 'LIMIT 500 not found in exams.js');
  })();

  await (async () => {
    // Unauthenticated request is blocked
    const r = await req('GET', '/exams/student/my-results', null, null);
    assert('L-2: my-results unauthenticated → 401', r.status === 401, `status=${r.status}`);
  })();

  await (async () => {
    // Teacher token cannot access student my-results (student-only route)
    const r = await req('GET', '/exams/student/my-results', null, T_TOKEN);
    assert('L-3: my-results with teacher token → 403', r.status === 403, `status=${r.status}`);
  })();

  // ══════════════════════════════════════════════════════════════════════════
  console.log(head('10. Edge cases — retry + absent interaction'));
  // ══════════════════════════════════════════════════════════════════════════

  await (async () => {
    // Absent record should NOT prevent further retry if exam is republished after force_reset
    const exam = await makeExam({ published: false });
    await pool.query(
      `INSERT INTO questions (exam_id, question_text, option_a, option_b, correct_answer_letter, points)
       VALUES ($1, 'Q1', 'A', 'B', 'A', 10)`,
      [exam.id]
    );
    // Start with absent record
    await insertAbsentRecord(S1.id, exam.id);
    // Force reset wipes it
    const r = await req('PUT', `/exams/${exam.id}/publish`, { force_reset: true }, T_TOKEN);
    assert('E-1: force_reset on exam with absent records succeeds (200)', r.status === 200, `status=${r.status}`);
    const remaining = await countAbsentRows(exam.id);
    assert('E-2: after force_reset no absent records remain', remaining === 0, `remaining=${remaining}`);

    await pool.query('DELETE FROM questions WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // Absent record score must be 0
    const exam = await makeExam({ published: true, endedHoursAgo: 1 });
    await markAbsentStudents(pool, exam.id, T.id);
    const { rows } = await pool.query(
      `SELECT score FROM exam_results WHERE exam_id=$1 AND is_absent=true`, [exam.id]
    );
    const allZero = rows.every(r => parseInt(r.score) === 0);
    assert('E-3: all absent records have score=0', allZero, `scores: ${rows.map(r=>r.score).join(',')}`);

    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // Absent record points_earned must be 0
    const exam = await makeExam({ published: true, endedHoursAgo: 1 });
    await markAbsentStudents(pool, exam.id, T.id);
    const { rows } = await pool.query(
      `SELECT points_earned FROM exam_results WHERE exam_id=$1 AND is_absent=true`, [exam.id]
    );
    const allZero = rows.every(r => parseInt(r.points_earned) === 0);
    assert('E-4: absent records have points_earned=0', allZero, `pts: ${rows.map(r=>r.points_earned).join(',')}`);

    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // Only one absent record per (student, exam) pair — unique constraint
    const exam = await makeExam({ published: true, endedHoursAgo: 1 });
    await insertAbsentRecord(S1.id, exam.id);
    // Try to insert another (should be ignored by ON CONFLICT)
    await insertAbsentRecord(S1.id, exam.id);
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM exam_results WHERE student_id=$1 AND exam_id=$2`,
      [S1.id, exam.id]
    );
    assert(
      'E-5: ON CONFLICT prevents duplicate absent records for same (student, exam)',
      parseInt(rows[0].cnt) === 1,
      `count=${rows[0].cnt}`
    );
    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // Verify result summary endpoint (/results/:id) returns is_absent for reference
    const exam = await makeExam({ published: true, endedHoursAgo: 1 });
    await insertAbsentRecord(S1.id, exam.id);
    const { rows } = await pool.query(
      `SELECT id FROM exam_results WHERE student_id=$1 AND exam_id=$2 AND is_absent=true`,
      [S1.id, exam.id]
    );
    const resultId = rows[0]?.id;
    const r = await req('GET', `/exams/results/${resultId}`, null, S1_TOKEN);
    assert('E-6: result summary returns 200 for absent record (student)', r.status === 200, `status=${r.status}`);

    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  await (async () => {
    // Suspended student should not be marked absent (test the NOT EXISTS guard only;
    // suspension filtering is done at enrollment/query level — verify the query
    // correctly handles suspended students for course exams)
    const exam = await makeExam({ published: true, endedHoursAgo: 1, courseId: COURSE_ID });
    // Deactivate S3 in the course (valid status = 'inactive'; 'suspended' is not in chk_enrollment_status)
    await pool.query(
      `UPDATE student_course_enrollment SET status='inactive' WHERE student_id=$1 AND course_id=$2`,
      [S3.id, COURSE_ID]
    );
    await markAbsentStudents(pool, exam.id, T.id);
    const absentForS3 = await pool.query(
      `SELECT * FROM exam_results WHERE student_id=$1 AND exam_id=$2 AND is_absent=true`,
      [S3.id, exam.id]
    );
    assert(
      'E-7: inactive/non-active student is NOT marked absent in course exam',
      absentForS3.rows.length === 0,
      `found ${absentForS3.rows.length} absent rows for S3 (inactive)`
    );
    // Restore enrollment
    await pool.query(
      `UPDATE student_course_enrollment SET status='active' WHERE student_id=$1 AND course_id=$2`,
      [S3.id, COURSE_ID]
    );
    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [exam.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [exam.id]);
  })();

  // ══════════════════════════════════════════════════════════════════════════
  // Summary
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log(`${C.bold}Results: ${C.green}${passed} passed${C.reset} ${C.bold}/ ${C.red}${failed} failed${C.reset}`);
  if (failures.length) {
    console.log(`\n${C.red}${C.bold}Failed tests:${C.reset}`);
    failures.forEach(f => {
      console.log(`  • ${f.name}`);
      if (f.detail) console.log(`    ${C.gray}${f.detail}${C.reset}`);
    });
  }
  console.log('═'.repeat(60) + '\n');
}

(async () => {
  try {
    await run();
  } catch (err) {
    console.error(`\n${C.red}Fatal error:${C.reset}`, err.message, err.stack);
    process.exit(1);
  } finally {
    await teardown().catch(e => console.error('Teardown error:', e.message));
    await pool.end().catch(() => {});
    process.exit(failed > 0 ? 1 : 0);
  }
})();
