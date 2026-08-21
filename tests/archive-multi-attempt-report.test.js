'use strict';
require('dotenv').config();
const pool   = require('../server/db/connection');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const http   = require('http');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
const PORT       = parseInt(process.env.PORT || '3001', 10);

let passed = 0, failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌  ${name}\n       ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function request(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
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

const get = (path, token) => request('GET', path, null, token);

function makeToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h', jwtid: crypto.randomBytes(8).toString('hex') });
}

function rand(n = 8) { return crypto.randomBytes(n).toString('hex'); }

async function run() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' Archive Multi-Attempt Report — Verification Tests');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 1. Setup fixtures
  const suffix = rand(4);
  const tSlug  = `multi-${suffix}`;
  const tUser  = `tch_multi_${suffix}`;
  const tPass  = await bcrypt.hash('Teacher123!', 10);

  const tRes = await pool.query(
    `INSERT INTO teachers (username, password, name, slug, force_password_change)
     VALUES ($1, $2, $3, $4, false) RETURNING id`,
    [tUser, tPass, `Teacher Multi ${suffix}`, tSlug]
  );
  const teacherId = tRes.rows[0].id;
  const teacherToken = makeToken({ id: teacherId, role: 'teacher', slug: tSlug });

  // Create Students: S1 (3 attempts), S2 (1 attempt), S3 (absent)
  const sPass = await bcrypt.hash('Std123!', 10);

  const s1Res = await pool.query(
    `INSERT INTO students (username, password, name, teacher_id, academic_stage)
     VALUES ($1, $2, $3, $4, 'ثانوية عامة') RETURNING id`,
    [`s1_${suffix}`, sPass, `Student 1 ${suffix}`, teacherId]
  );
  const s1Id = s1Res.rows[0].id;

  const s2Res = await pool.query(
    `INSERT INTO students (username, password, name, teacher_id, academic_stage)
     VALUES ($1, $2, $3, $4, 'ثانوية عامة') RETURNING id`,
    [`s2_${suffix}`, sPass, `Student 2 ${suffix}`, teacherId]
  );
  const s2Id = s2Res.rows[0].id;

  const s3Res = await pool.query(
    `INSERT INTO students (username, password, name, teacher_id, academic_stage)
     VALUES ($1, $2, $3, $4, 'ثانوية عامة') RETURNING id`,
    [`s3_${suffix}`, sPass, `Student 3 ${suffix}`, teacherId]
  );
  const s3Id = s3Res.rows[0].id;

  // Create Exam (total_score: 100, pass_score: 60)
  const exRes = await pool.query(
    `INSERT INTO exams (teacher_id, title, total_score, pass_score, is_published)
     VALUES ($1, $2, 100, 60, true) RETURNING id`,
    [teacherId, `Exam Multi ${suffix}`]
  );
  const examId = exRes.rows[0].id;

  // S1 has 3 exam attempts:
  // Attempt 1 (fail 40), Attempt 2 (fail 50), Attempt 3 (pass 90, latest)
  await pool.query(
    `INSERT INTO exam_results (student_id, exam_id, score, attempt_number, is_latest, is_absent, created_at)
     VALUES ($1, $2, 40, 1, false, false, NOW() - interval '2 days')`,
    [s1Id, examId]
  );
  await pool.query(
    `INSERT INTO exam_results (student_id, exam_id, score, attempt_number, is_latest, is_absent, created_at)
     VALUES ($1, $2, 50, 2, false, false, NOW() - interval '1 day')`,
    [s1Id, examId]
  );
  await pool.query(
    `INSERT INTO exam_results (student_id, exam_id, score, attempt_number, is_latest, is_absent, created_at)
     VALUES ($1, $2, 90, 3, true, false, NOW())`,
    [s1Id, examId]
  );

  // S2 has 1 exam attempt (pass 85)
  await pool.query(
    `INSERT INTO exam_results (student_id, exam_id, score, attempt_number, is_latest, is_absent, created_at)
     VALUES ($1, $2, 85, 1, true, false, NOW())`,
    [s2Id, examId]
  );

  // Create Recitation (total_score: 50, pass_score: 30)
  const recRes = await pool.query(
    `INSERT INTO recitations (teacher_id, title, total_score, pass_score, is_published)
     VALUES ($1, $2, 50, 30, true) RETURNING id`,
    [teacherId, `Recitation Multi ${suffix}`]
  );
  const recId = recRes.rows[0].id;

  // S1 has 3 recitation attempts:
  // Attempt 1 (fail 20), Attempt 2 (fail 25), Attempt 3 (pass 45)
  await pool.query(
    `INSERT INTO recitation_results (student_id, recitation_id, score, passed, is_absent, created_at)
     VALUES ($1, $2, 20, false, false, NOW() - interval '2 days')`,
    [s1Id, recId]
  );
  await pool.query(
    `INSERT INTO recitation_results (student_id, recitation_id, score, passed, is_absent, created_at)
     VALUES ($1, $2, 25, false, false, NOW() - interval '1 day')`,
    [s1Id, recId]
  );
  await pool.query(
    `INSERT INTO recitation_results (student_id, recitation_id, score, passed, is_absent, created_at)
     VALUES ($1, $2, 45, true, false, NOW())`,
    [s1Id, recId]
  );

  // S2 has 1 recitation attempt
  await pool.query(
    `INSERT INTO recitation_results (student_id, recitation_id, score, passed, is_absent, created_at)
     VALUES ($1, $2, 40, true, false, NOW())`,
    [s2Id, recId]
  );

  // ── Tests ────────────────────────────────────────────────────────────

  await test('GET /api/archive/item/exam/:id/students returns all attempts for multi-attempt student', async () => {
    const res = await get(`/api/archive/item/exam/${examId}/students`, teacherToken);
    assertEqual(res.status, 200);
    const { item, students } = res.body;
    assert(Array.isArray(students), 'students should be an array');
    assertEqual(item.retried_count, 1, 'retried_count should be 1');

    const s1 = students.find(s => s.student_id === s1Id);
    assert(s1, 's1 must exist in response');
    assertEqual(s1.attempts_count, 3, 's1 should have 3 attempts');
    assertEqual(s1.attempts.length, 3, 's1 attempts array should have 3 elements');

    // Check attempts ordering and values
    assertEqual(s1.attempts[0].attempt_number, 1, 'Attempt 1 number');
    assertEqual(s1.attempts[0].score, 40, 'Attempt 1 score');
    assertEqual(s1.attempts[0].passed, false, 'Attempt 1 passed status');

    assertEqual(s1.attempts[1].attempt_number, 2, 'Attempt 2 number');
    assertEqual(s1.attempts[1].score, 50, 'Attempt 2 score');
    assertEqual(s1.attempts[1].passed, false, 'Attempt 2 passed status');

    assertEqual(s1.attempts[2].attempt_number, 3, 'Attempt 3 number');
    assertEqual(s1.attempts[2].score, 90, 'Attempt 3 score');
    assertEqual(s1.attempts[2].passed, true, 'Attempt 3 passed status');

    const s2 = students.find(s => s.student_id === s2Id);
    assert(s2, 's2 must exist');
    assertEqual(s2.attempts_count, 1, 's2 attempts count 1');

    const s3 = students.find(s => s.student_id === s3Id);
    assert(s3, 's3 must exist');
    assertEqual(s3.status, 'absent', 's3 status absent');
  });

  await test('GET /api/archive/item/recitation/:id/students returns all attempts with attempt_number for recitation', async () => {
    const res = await get(`/api/archive/item/recitation/${recId}/students`, teacherToken);
    assertEqual(res.status, 200);
    const { item, students } = res.body;
    assert(Array.isArray(students), 'students should be an array');
    assertEqual(item.retried_count, 1, 'recitation retried_count should be 1');

    const s1 = students.find(s => s.student_id === s1Id);
    assert(s1, 's1 must exist');
    assertEqual(s1.attempts_count, 3, 's1 recitation attempts_count should be 3');
    assertEqual(s1.attempts.length, 3, 's1 recitation attempts length should be 3');

    assertEqual(s1.attempts[0].attempt_number, 1, 'Recitation Attempt 1 number');
    assertEqual(s1.attempts[0].score, 20, 'Recitation Attempt 1 score');
    assertEqual(s1.attempts[0].passed, false, 'Recitation Attempt 1 passed status');

    assertEqual(s1.attempts[1].attempt_number, 2, 'Recitation Attempt 2 number');
    assertEqual(s1.attempts[1].score, 25, 'Recitation Attempt 2 score');
    assertEqual(s1.attempts[1].passed, false, 'Recitation Attempt 2 passed status');

    assertEqual(s1.attempts[2].attempt_number, 3, 'Recitation Attempt 3 number');
    assertEqual(s1.attempts[2].score, 45, 'Recitation Attempt 3 score');
    assertEqual(s1.attempts[2].passed, true, 'Recitation Attempt 3 passed status');
  });

  await test('GET /api/archive/student/:id/recitation-results includes attempt_number for each recitation attempt', async () => {
    const res = await get(`/api/archive/student/${s1Id}/recitation-results`, teacherToken);
    assertEqual(res.status, 200);
    assert(Array.isArray(res.body), 'response should be an array of attempts');
    assertEqual(res.body.length, 3, 's1 should have 3 recitation result rows');

    // Ordered created_at DESC -> row 0 is attempt 3, row 1 is attempt 2, row 2 is attempt 1
    const att3 = res.body[0];
    const att2 = res.body[1];
    const att1 = res.body[2];

    assertEqual(Number(att3.attempt_number), 3, 'Latest attempt is #3');
    assertEqual(Number(att2.attempt_number), 2, 'Middle attempt is #2');
    assertEqual(Number(att1.attempt_number), 1, 'First attempt is #1');
  });

  await test('Report rows construction includes all attempts (initial + all retakes) with grouping and non-duplicated names', async () => {
    const res = await get(`/api/archive/item/exam/${examId}/students`, teacherToken);
    const { item, students } = res.body;

    const reportRows = [];
    students.forEach((st, sIdx) => {
      const isAbsent = st.status === 'absent' || !st.attempts || st.attempts.length === 0;
      const isNewGroup = sIdx > 0;

      if (isAbsent) {
        reportRows.push({
          cells: [
            st.student_name || '—',
            st.student_username || '—',
            st.academic_stage || '—',
            '—',
            'غائب',
            '—',
            '—',
            '—',
            '—',
          ],
          isFirstOfGroup: true,
          isNewGroup,
          groupIndex: sIdx,
        });
      } else {
        st.attempts.forEach((att, idx) => {
          const isFirstAttempt = idx === 0;
          const attNum = att.attempt_number || (idx + 1);
          const attemptLabel = attNum === 1 ? 'المحاولة 1 (أولى)' : `المحاولة ${attNum} (إعادة ${attNum - 1})`;
          const isPassed = att.passed === true || (att.score !== null && Number(att.score) >= Number(item.pass_score));
          const scoreStr = att.score !== null && att.score !== undefined ? `${att.score}/${item.total_score}` : '—';
          const pctStr = att.percentage !== null && att.percentage !== undefined ? `${att.percentage}%` : '—';

          reportRows.push({
            cells: [
              isFirstAttempt ? (st.student_name || '—') : '',
              isFirstAttempt ? (st.student_username || '—') : '',
              isFirstAttempt ? (st.academic_stage || '—') : '',
              attemptLabel,
              isPassed ? 'ناجح' : 'راسب',
              scoreStr,
              pctStr,
              '—',
              '—',
            ],
            isFirstOfGroup: isFirstAttempt,
            isNewGroup: isFirstAttempt && isNewGroup,
            groupIndex: sIdx,
          });
        });
      }
    });

    // Total rows: S1 (3 attempts) + S2 (1 attempt) + S3 (1 absent row) = 5 rows
    assertEqual(reportRows.length, 5, 'Total report rows should be 5');

    // S1 rows check (Group 0)
    assertEqual(reportRows[0].cells[0], `Student 1 ${suffix}`, 'S1 row 1 shows student name');
    assertEqual(reportRows[0].cells[3], 'المحاولة 1 (أولى)', 'S1 row 1 attempt label');
    assertEqual(reportRows[0].cells[4], 'راسب', 'S1 row 1 status');
    assertEqual(reportRows[0].cells[5], '40/100', 'S1 row 1 score');
    assertEqual(reportRows[0].isFirstOfGroup, true, 'S1 row 1 isFirstOfGroup');
    assertEqual(reportRows[0].isNewGroup, false, 'S1 row 1 isNewGroup (first student)');

    assertEqual(reportRows[1].cells[0], '', 'S1 row 2 does NOT duplicate student name');
    assertEqual(reportRows[1].cells[3], 'المحاولة 2 (إعادة 1)', 'S1 row 2 attempt label');
    assertEqual(reportRows[1].cells[4], 'راسب', 'S1 row 2 status');
    assertEqual(reportRows[1].cells[5], '50/100', 'S1 row 2 score');
    assertEqual(reportRows[1].isFirstOfGroup, false, 'S1 row 2 isFirstOfGroup is false');

    assertEqual(reportRows[2].cells[0], '', 'S1 row 3 does NOT duplicate student name');
    assertEqual(reportRows[2].cells[3], 'المحاولة 3 (إعادة 2)', 'S1 row 3 attempt label');
    assertEqual(reportRows[2].cells[4], 'ناجح', 'S1 row 3 status');
    assertEqual(reportRows[2].cells[5], '90/100', 'S1 row 3 score');
    assertEqual(reportRows[2].isFirstOfGroup, false, 'S1 row 3 isFirstOfGroup is false');

    // S2 row check (Group 1 - new student separator)
    assertEqual(reportRows[3].cells[0], `Student 2 ${suffix}`, 'S2 row 1 shows student name');
    assertEqual(reportRows[3].isFirstOfGroup, true, 'S2 row 1 isFirstOfGroup');
    assertEqual(reportRows[3].isNewGroup, true, 'S2 row 1 has isNewGroup = true (separator border)');
    assertEqual(reportRows[3].groupIndex, 1, 'S2 row 1 groupIndex = 1');

    // S3 absent row check (Group 2 - new student separator)
    assertEqual(reportRows[4].cells[0], `Student 3 ${suffix}`, 'S3 row 1 shows student name');
    assertEqual(reportRows[4].cells[4], 'غائب', 'S3 row status is absent');
    assertEqual(reportRows[4].isNewGroup, true, 'S3 row 1 has isNewGroup = true (separator border)');
    assertEqual(reportRows[4].groupIndex, 2, 'S3 row 1 groupIndex = 2');
  });

  // Cleanup fixtures
  await pool.query('DELETE FROM teachers WHERE id=$1', [teacherId]);

  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('───────────────────────────────────────────────────────────────\n');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

run().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
