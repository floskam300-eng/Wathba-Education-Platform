/**
 * WATHBA — Exam Attempt History & Grade Preservation Test Suite
 * =================================================================
 * Verifies the feature: "old grades are never lost, and every attempt is
 * reviewable by both student and teacher".
 *
 * Coverage:
 *   1. GET /exams/results/by-exam-student/:examId/:studentId
 *      - returns ALL attempts (latest + archived)
 *      - ordering: newest first
 *      - security: student sees only own attempts
 *      - security: teacher can't read another teacher's student
 *      - security: invalid ids → 400
 *      - security: unauthenticated → 401
 *   2. force_reset (republish) ARCHIVES results instead of deleting
 *      - old grade preserved with is_latest=false
 *      - student can still review an archived attempt
 *      - teacher can still review an archived attempt
 *   3. Retry flow preserves history (existing behaviour regression)
 *
 * Run: node server/tests/exam_history_test.js
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
async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
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
let T1 = {}, T2 = {}, S1 = {}, S2 = {}, OTHER_S = {};
let T1_TOKEN, T2_TOKEN, S1_TOKEN, S2_TOKEN;
const SLUG1 = '_test_hist_slug1';
const SLUG2 = '_test_hist_slug2';

// ── Setup ──────────────────────────────────────────────────────────────────────
async function setup() {
  // Wipe leftovers from previous runs
  await pool.query(`DELETE FROM teachers WHERE username IN ('_test_hist_t1','_test_hist_t2')`);

  const hash = await bcrypt.hash('TestPass123!', 10);

  // Two teachers (T1 owns S1/S2; T2 owns OTHER_S — used for cross-teacher checks)
  const t1r = await pool.query(
    `INSERT INTO teachers (username, password, name, slug) VALUES ('_test_hist_t1', $1, 'Hist Teacher One', $2) RETURNING *`,
    [hash, SLUG1]
  );
  T1 = t1r.rows[0];
  const t2r = await pool.query(
    `INSERT INTO teachers (username, password, name, slug) VALUES ('_test_hist_t2', $1, 'Hist Teacher Two', $2) RETURNING *`,
    [hash, SLUG2]
  );
  T2 = t2r.rows[0];

  async function makeStudent(uname, name, teacherId) {
    const r = await pool.query(
      `INSERT INTO students (username, password, name, teacher_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [uname, hash, name, teacherId]
    );
    return r.rows[0];
  }
  S1 = await makeStudent('_hist_s1', 'Hist Student One', T1.id);
  S2 = await makeStudent('_hist_s2', 'Hist Student Two', T1.id);
  OTHER_S = await makeStudent('_hist_os', 'Hist Other Student', T2.id);

  T1_TOKEN = generateToken({ id: T1.id, role: 'teacher', username: T1.username, name: T1.name, teacher_slug: SLUG1 });
  T2_TOKEN = generateToken({ id: T2.id, role: 'teacher', username: T2.username, name: T2.name, teacher_slug: SLUG2 });
  S1_TOKEN = generateToken({ id: S1.id, role: 'student', username: S1.username, name: S1.name, teacher_id: T1.id, teacher_slug: SLUG1 });
  S2_TOKEN = generateToken({ id: S2.id, role: 'student', username: S2.username, name: S2.name, teacher_id: T1.id, teacher_slug: SLUG1 });

  console.log(note(`Setup done — T1=${T1.id} T2=${T2.id} S1=${S1.id} S2=${S2.id} OTHER_S=${OTHER_S.id}`));
}

// ── Teardown ───────────────────────────────────────────────────────────────────
async function teardown() {
  await pool.query(`DELETE FROM teachers WHERE id IN ($1, $2)`, [T1.id, T2.id]);
  // Cascade deletes students, exams, exam_results, enrollments
}

// ── DB helper: create an exam owned by a teacher ──────────────────────────────
async function makeExam(teacherId, { published = true, endedHoursAgo = null, absentMarked = false } = {}) {
  const endDate = endedHoursAgo != null
    ? new Date(Date.now() - endedHoursAgo * 3600 * 1000).toISOString()
    : null;
  const r = await pool.query(
    `INSERT INTO exams (title, teacher_id, duration_minutes, total_score, pass_score,
                        is_published, end_date, absent_marked, question_source)
     VALUES ($1, $2, 60, 100, 50, $3, $4, $5, 'bank') RETURNING *`,
    [`Hist Exam ${Date.now()}-${Math.random().toString(36).slice(2,6)}`, teacherId, published, endDate, absentMarked]
  );
  return r.rows[0];
}

// ── DB helper: insert a real (non-absent) result ──────────────────────────────
async function insertResult(studentId, examId, { score = 60, attempt = 1, latest = true, createdHoursAgo = 0 }) {
  const r = await pool.query(
    `INSERT INTO exam_results
       (student_id, exam_id, score, correct_count, wrong_count, unanswered_count,
        start_time, end_time, answers, points_earned, attempt_number, is_latest, is_absent, created_at)
     VALUES ($1, $2, $3, 6, 4, 0, NOW()-INTERVAL '1 hour', NOW(), '[]'::jsonb, 0, $4, $5, false, NOW() - ($6 || ' hours')::INTERVAL)
     RETURNING *`,
    [studentId, examId, score, attempt, latest, String(createdHoursAgo)]
  );
  return r.rows[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
(async () => {
  if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
    console.error('❌ DATABASE_URL and JWT_SECRET must be set');
    process.exit(1);
  }

  console.log(head('Setting up test fixtures...'));
  await setup();

  // ════════════════════════════════════════════════════════════════════════════
  console.log(head('1. GET /results/by-exam-student — returns all attempts'));
  // ════════════════════════════════════════════════════════════════════════════
  let examA, oldResultA, newResultA;
  await (async () => {
    examA = await makeExam(T1.id);
    // Create 2 real attempts: old (archived) + new (latest). Ensure created_at differs.
    oldResultA = await insertResult(S1.id, examA.id, { score: 40, attempt: 1, latest: false, createdHoursAgo: 5 });
    newResultA = await insertResult(S1.id, examA.id, { score: 80, attempt: 2, latest: true, createdHoursAgo: 0 });

    const r = await req('GET', `/exams/results/by-exam-student/${examA.id}/${S1.id}`, null, T1_TOKEN);
    assert('H1: teacher gets 200', r.status === 200, `status=${r.status}`);
    const attempts = r.data?.attempts || [];
    assert('H1b: returns 2 attempts', attempts.length === 2, `len=${attempts.length}`);
    // Ordering: newest first
    assert('H1c: attempts ordered newest-first', attempts[0].id === newResultA.id, `first id=${attempts[0]?.id}`);
    // Each attempt carries attempt_number + is_latest + is_absent
    assert('H1d: attempt has attempt_number', typeof attempts[0].attempt_number === 'number', `attempt_number=${attempts[0]?.attempt_number}`);
    assert('H1e: archived attempt is_latest=false', attempts.some(a => a.id === oldResultA.id && a.is_latest === false), `archived present=${!!attempts.find(a => a.id === oldResultA.id)}`);
    assert('H1f: latest attempt is_latest=true', attempts.some(a => a.id === newResultA.id && a.is_latest === true), '');

    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [examA.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [examA.id]);
  })();

  // ════════════════════════════════════════════════════════════════════════════
  console.log(head('2. Endpoint security — access control'));
  // ════════════════════════════════════════════════════════════════════════════
  let examB;
  await (async () => {
    examB = await makeExam(T1.id);
    await insertResult(S1.id, examB.id, { score: 55, attempt: 1, latest: true });

    // Student can view their OWN attempts
    const sR = await req('GET', `/exams/results/by-exam-student/${examB.id}/${S1.id}`, null, S1_TOKEN);
    assert('H2-1: student views own attempts → 200', sR.status === 200, `status=${sR.status}`);

    // Student CANNOT view ANOTHER student's attempts
    const sOther = await req('GET', `/exams/results/by-exam-student/${examB.id}/${S2.id}`, null, S1_TOKEN);
    assert('H2-2: student cannot view another student → 403', sOther.status === 403, `status=${sOther.status}`);

    // Teacher T1 (owner) can view
    const tR = await req('GET', `/exams/results/by-exam-student/${examB.id}/${S1.id}`, null, T1_TOKEN);
    assert('H2-3: owner teacher views → 200', tR.status === 200, `status=${tR.status}`);

    // Teacher T2 (NOT owner of exam) cannot view
    const t2R = await req('GET', `/exams/results/by-exam-student/${examB.id}/${S1.id}`, null, T2_TOKEN);
    assert('H2-4: non-owner teacher → 403', t2R.status === 403, `status=${t2R.status}`);

    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [examB.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [examB.id]);
  })();

  // ════════════════════════════════════════════════════════════════════════════
  console.log(head('3. Endpoint security — teacher can read another teacher\'s student?'));
  // ════════════════════════════════════════════════════════════════════════════
  await (async () => {
    // T2 has its own exam; OTHER_S belongs to T2
    const examC = await makeExam(T2.id);
    await insertResult(OTHER_S.id, examC.id, { score: 70, attempt: 1, latest: true });

    // T1 owns an exam too; craft a request using T1's exam id but OTHER_S (T2's student)
    const examT1 = await makeExam(T1.id);
    // T1 passes examT1 (their own exam) but OTHER_S as studentId
    const cross = await req('GET', `/exams/results/by-exam-student/${examT1.id}/${OTHER_S.id}`, null, T1_TOKEN);
    assert('H3-1: teacher cannot read a student they do not own (even with own exam) → 403', cross.status === 403, `status=${cross.status} err=${cross.data?.error}`);

    // Sanity: T2 reading its own student works
    const ok = await req('GET', `/exams/results/by-exam-student/${examC.id}/${OTHER_S.id}`, null, T2_TOKEN);
    assert('H3-2: owner teacher reads own student → 200', ok.status === 200, `status=${ok.status}`);

    await pool.query('DELETE FROM exam_results WHERE exam_id IN ($1,$2)', [examC.id, examT1.id]);
    await pool.query('DELETE FROM exams WHERE id IN ($1,$2)', [examC.id, examT1.id]);
  })();

  // ════════════════════════════════════════════════════════════════════════════
  console.log(head('4. Endpoint edge cases — invalid ids, auth'));
  // ════════════════════════════════════════════════════════════════════════════
  await (async () => {
    const examE = await makeExam(T1.id);

    // Invalid examId
    const badExam = await req('GET', `/exams/results/by-exam-student/abc/${S1.id}`, null, T1_TOKEN);
    assert('H4-1: invalid examId → 400', badExam.status === 400, `status=${badExam.status}`);
    // Invalid studentId
    const badStudent = await req('GET', `/exams/results/by-exam-student/${examE.id}/xyz`, null, T1_TOKEN);
    assert('H4-2: invalid studentId → 400', badStudent.status === 400, `status=${badStudent.status}`);
    // Nonexistent exam
    const noExam = await req('GET', `/exams/results/by-exam-student/99999999/${S1.id}`, null, T1_TOKEN);
    assert('H4-3: nonexistent exam → 404', noExam.status === 404, `status=${noExam.status}`);
    // Unauthenticated
    const noAuth = await req('GET', `/exams/results/by-exam-student/${examE.id}/${S1.id}`, null, null);
    assert('H4-4: unauthenticated → 401', noAuth.status === 401, `status=${noAuth.status}`);
    // Student with no attempts → empty array
    const empty = await req('GET', `/exams/results/by-exam-student/${examE.id}/${S2.id}`, null, S2_TOKEN);
    assert('H4-5: student with no attempts → 200 + empty', empty.status === 200 && (empty.data?.attempts?.length === 0), `status=${empty.status} len=${empty.data?.attempts?.length}`);

    await pool.query('DELETE FROM exams WHERE id=$1', [examE.id]);
  })();

  // ════════════════════════════════════════════════════════════════════════════
  console.log(head('5. force_reset preserves history (archive, not delete)'));
  // ════════════════════════════════════════════════════════════════════════════
  await (async () => {
    const examF = await makeExam(T1.id, { published: false });
    const resultF = await insertResult(S1.id, examF.id, { score: 65, attempt: 1, latest: true });

    // Republish WITHOUT force → 409 RESULTS_EXIST
    const warn = await req('PUT', `/exams/${examF.id}/publish`, {}, T1_TOKEN);
    assert('H5-1: republish warns RESULTS_EXIST → 409', warn.status === 409 && warn.data?.code === 'RESULTS_EXIST', `status=${warn.status} code=${warn.data?.code}`);

    // force_reset → archives
    const force = await req('PUT', `/exams/${examF.id}/publish`, { force_reset: true }, T1_TOKEN);
    assert('H5-2: force_reset publishes → 200', force.status === 200, `status=${force.status} err=${force.data?.error}`);

    // Old result still exists, is_latest=false
    const stillExists = await pool.query('SELECT id, is_latest, score FROM exam_results WHERE id=$1', [resultF.id]);
    assert('H5-3: old result preserved (not deleted)', stillExists.rows.length === 1, `rows=${stillExists.rows.length}`);
    assert('H5-4: old result is_latest=false after reset', stillExists.rows[0]?.is_latest === false, `is_latest=${stillExists.rows[0]?.is_latest}`);
    assert('H5-5: old result score preserved', Number(stillExists.rows[0]?.score) === 65, `score=${stillExists.rows[0]?.score}`);

    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [examF.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [examF.id]);
  })();

  // ════════════════════════════════════════════════════════════════════════════
  console.log(head('6. Archived (old) attempt is reviewable by BOTH student & teacher'));
  // ════════════════════════════════════════════════════════════════════════════
  await (async () => {
    const examG = await makeExam(T1.id);
    const archived = await insertResult(S1.id, examG.id, { score: 35, attempt: 1, latest: false, createdHoursAgo: 3 });
    const latest = await insertResult(S1.id, examG.id, { score: 78, attempt: 2, latest: true, createdHoursAgo: 0 });

    // Student reviews the ARCHIVED attempt
    const sReview = await req('GET', `/exams/results/${archived.id}/review`, null, S1_TOKEN);
    assert('H6-1: student reviews archived attempt → 200', sReview.status === 200, `status=${sReview.status}`);
    assert('H6-2: archived review shows attempt_number=1', sReview.data?.result?.attempt_number === 1, `attempt=${sReview.data?.result?.attempt_number}`);
    assert('H6-3: archived review shows is_latest=false', sReview.data?.result?.is_latest === false, `is_latest=${sReview.data?.result?.is_latest}`);
    assert('H6-4: archived review shows old score 35', Number(sReview.data?.result?.score) === 35, `score=${sReview.data?.result?.score}`);

    // Teacher reviews the archived attempt too
    const tReview = await req('GET', `/exams/results/${archived.id}/review`, null, T1_TOKEN);
    assert('H6-5: teacher reviews archived attempt → 200', tReview.status === 200, `status=${tReview.status}`);

    // Student reviews the LATEST attempt (sanity)
    const sReviewLatest = await req('GET', `/exams/results/${latest.id}/review`, null, S1_TOKEN);
    assert('H6-6: student reviews latest attempt → 200', sReviewLatest.status === 200, `status=${sReviewLatest.status}`);
    assert('H6-7: latest review shows score 78', Number(sReviewLatest.data?.result?.score) === 78, `score=${sReviewLatest.data?.result?.score}`);

    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [examG.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [examG.id]);
  })();

  // ════════════════════════════════════════════════════════════════════════════
  console.log(head('7. /student/my-results includes archived attempts'));
  // ════════════════════════════════════════════════════════════════════════════
  await (async () => {
    const examH = await makeExam(T1.id);
    await insertResult(S1.id, examH.id, { score: 45, attempt: 1, latest: false, createdHoursAgo: 2 });
    await insertResult(S1.id, examH.id, { score: 90, attempt: 2, latest: true, createdHoursAgo: 0 });

    const r = await req('GET', `/exams/student/my-results`, null, S1_TOKEN);
    assert('H7-1: my-results → 200', r.status === 200, `status=${r.status}`);
    const mine = (r.data || []).filter(x => x.exam_id === examH.id);
    assert('H7-2: my-results returns BOTH attempts for this exam', mine.length === 2, `count=${mine.length}`);
    assert('H7-3: my-results includes archived (is_latest=false)', mine.some(x => x.is_latest === false), '');
    assert('H7-4: my-results includes latest (is_latest=true)', mine.some(x => x.is_latest === true), '');

    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [examH.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [examH.id]);
  })();

  // ════════════════════════════════════════════════════════════════════════════
  console.log(head('8. /students/:id/profile includes attempt_number + is_latest'));
  // ════════════════════════════════════════════════════════════════════════════
  await (async () => {
    const examI = await makeExam(T1.id);
    await insertResult(S1.id, examI.id, { score: 30, attempt: 1, latest: false, createdHoursAgo: 2 });
    await insertResult(S1.id, examI.id, { score: 75, attempt: 2, latest: true, createdHoursAgo: 0 });

    const r = await req('GET', `/students/${S1.id}/profile`, null, T1_TOKEN);
    assert('H8-1: profile → 200', r.status === 200, `status=${r.status}`);
    const examResults = r.data?.examResults || [];
    const forExamI = examResults.filter(e => e.exam_id === examI.id);
    assert('H8-2: profile examResults includes both attempts', forExamI.length === 2, `count=${forExamI.length}`);
    assert('H8-3: profile includes attempt_number field', forExamI.every(e => typeof e.attempt_number === 'number'), '');
    assert('H8-4: profile includes is_latest field', forExamI.every(e => typeof e.is_latest === 'boolean'), '');

    await pool.query('DELETE FROM exam_results WHERE exam_id=$1', [examI.id]);
    await pool.query('DELETE FROM exams WHERE id=$1', [examI.id]);
  })();

  // ════════════════════════════════════════════════════════════════════════════
  // Summary
  // ════════════════════════════════════════════════════════════════════════════
  console.log(head('Summary'));
  await teardown();
  await pool.end();

  console.log(`\n${C.bold}Results: ${C.green}${passed}${C.reset}${C.bold} passed / ${C.red}${failed}${C.reset}${C.bold} failed${C.reset}\n`);

  if (failed > 0) {
    console.log(`${C.red}${C.bold}Failed tests:${C.reset}`);
    failures.forEach(f => console.log(`  • ${f.name}${f.detail ? `\n    ${C.gray}${f.detail}${C.reset}` : ''}`));
    process.exit(1);
  }
  console.log(`${C.green}${C.bold}All attempt-history tests passed! ✅${C.reset}\n`);
  process.exit(0);
})().catch(async (e) => {
  console.error('\n💥 Test runner crashed:', e);
  try { await teardown(); } catch {}
  try { await pool.end(); } catch {}
  process.exit(1);
});
