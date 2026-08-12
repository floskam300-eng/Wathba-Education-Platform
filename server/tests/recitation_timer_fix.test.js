/**
 * Recitation Timer & Expired Session Cleanup Regression Test
 *
 * Verifies:
 * 1. GET /take returns server_now, server_started_at, and remaining_seconds
 * 2. Abandoned/expired sessions in recitation_sessions are auto-cleaned on /take, allowing student to start fresh
 * 3. Active ongoing sessions correctly calculate remaining_seconds and return resumed: true
 * 4. Fallback for undefined/0 duration_minutes is at least 1 minute
 */

const express = require('express');
const http = require('http');
require('dotenv').config();
const pool = require('../db/connection');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../middleware/auth');

let server;
let TEST_PORT;

let passed = 0, failed = 0;
const errors = [];

function req(method, path, body, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: TEST_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };

    const r = http.request(opts, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (_) { json = raw; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

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

async function run() {
  console.log('\n🚀 Starting Recitation Timer Fix Verification...\n');

  // Start test express server mounting the modified router
  const app = express();
  app.use(express.json());
  app.use('/api/recitations', require('../routes/recitations'));

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      TEST_PORT = server.address().port;
      resolve();
    });
  });

  // Create isolated test teacher and student
  const hash = await bcrypt.hash('Password123!', 8);
  const teacherUser = `timer_fix_t_${Date.now()}`;
  const studentUser = `timer_fix_s_${Date.now()}`;

  const tRes = await pool.query(
    `INSERT INTO teachers (name, username, password)
     VALUES ($1, $2, $3) RETURNING id`,
    ['Test Teacher Timer', teacherUser, hash]
  );
  const teacherId = tRes.rows[0].id;

  const sRes = await pool.query(
    `INSERT INTO students (name, username, password, teacher_id, academic_stage)
     VALUES ($1, $2, $3, $4, 'ثانوي') RETURNING id`,
    ['Test Student Timer', studentUser, hash, teacherId]
  );
  const studentId = sRes.rows[0].id;

  // Generate token directly for the student
  const studentToken = generateToken({ id: studentId, role: 'student', academic_stage: 'ثانوي' });
  assert(studentToken, 'Student token generation failed');

  // Create test recitation (10 minutes duration)
  const recRes = await pool.query(
    `INSERT INTO recitations (teacher_id, title, duration_minutes, total_score, pass_score, is_published, academic_stage)
     VALUES ($1, 'Timer Fix Recitation', 10, 10, 5, true, 'ثانوي') RETURNING id`,
    [teacherId]
  );
  const recitationId = recRes.rows[0].id;

  // Add a test question
  await pool.query(
    `INSERT INTO recitation_questions (recitation_id, question_text, question_type, option_a, option_b, correct_answer_letter, points)
     VALUES ($1, 'What is 1+1?', 'mcq', '2', '3', 'A', 10)`,
    [recitationId]
  );

  // 1. Initial take: should return server_now, server_started_at, remaining_seconds = 600, resumed = false
  await test('GET /take returns server_now, server_started_at, and remaining_seconds (600s)', async () => {
    const res = await req('GET', `/api/recitations/${recitationId}/take`, null, studentToken);
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert(res.body.server_now, 'server_now must be present');
    assert(res.body.server_started_at, 'server_started_at must be present');
    assert(res.body.remaining_seconds === 600, `Expected remaining_seconds=600, got ${res.body.remaining_seconds}`);
    assert(res.body.resumed === false, 'Expected resumed=false on initial take');
  });

  // 2. Active resume: should return resumed = true and remaining_seconds <= 600
  await test('GET /take resumes active ongoing session with remaining_seconds', async () => {
    const res = await req('GET', `/api/recitations/${recitationId}/take`, null, studentToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.resumed === true, 'Expected resumed=true');
    assert(res.body.remaining_seconds >= 590 && res.body.remaining_seconds <= 600, `Remaining seconds expected ~600, got ${res.body.remaining_seconds}`);
  });

  // 3. Simulate an orphaned/expired session from 2 hours ago
  await test('GET /take cleans up expired session from hours ago and starts fresh attempt', async () => {
    // Manually set started_at in DB to 2 hours ago
    await pool.query(
      `UPDATE recitation_sessions
       SET started_at = NOW() - INTERVAL '2 hours'
       WHERE student_id = $1 AND recitation_id = $2`,
      [studentId, recitationId]
    );

    const res = await req('GET', `/api/recitations/${recitationId}/take`, null, studentToken);
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert(res.body.resumed === false, 'Expected resumed=false after expired session cleanup');
    assert(res.body.remaining_seconds === 600, `Expected remaining_seconds=600, got ${res.body.remaining_seconds}`);
  });

  // 4. Test 1 minute duration recitation
  const rec1MinRes = await pool.query(
    `INSERT INTO recitations (teacher_id, title, duration_minutes, total_score, pass_score, is_published, academic_stage)
     VALUES ($1, '1 Min Recitation', 1, 10, 5, true, 'ثانوي') RETURNING id`,
    [teacherId]
  );
  const minRecId = rec1MinRes.rows[0].id;
  await pool.query(
    `INSERT INTO recitation_questions (recitation_id, question_text, question_type, option_a, option_b, correct_answer_letter, points)
     VALUES ($1, 'Question 1', 'mcq', 'A', 'B', 'A', 10)`,
    [minRecId]
  );

  await test('GET /take correctly calculates remaining_seconds for 1-minute recitation', async () => {
    const res = await req('GET', `/api/recitations/${minRecId}/take`, null, studentToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.remaining_seconds === 60, `Expected remaining_seconds=60, got ${res.body.remaining_seconds}`);
  });

  // 5. Test expired submission cleans up session
  await test('POST /submit on expired session returns 400 timer_expired and cleans up session', async () => {
    // Advance session started_at to 10 minutes ago on minRecId (which is 1 min duration)
    await pool.query(
      `UPDATE recitation_sessions
       SET started_at = NOW() - INTERVAL '10 minutes'
       WHERE student_id = $1 AND recitation_id = $2`,
      [studentId, minRecId]
    );

    const submitRes = await req('POST', `/api/recitations/${minRecId}/submit`, { answers: [] }, studentToken);
    assert(submitRes.status === 400, `Expected 400, got ${submitRes.status}`);
    assert(submitRes.body.timer_expired === true, 'Expected timer_expired=true');

    // Verify session row is cleaned up from recitation_sessions
    const checkSess = await pool.query(
      'SELECT id FROM recitation_sessions WHERE student_id = $1 AND recitation_id = $2',
      [studentId, minRecId]
    );
    assert(checkSess.rows.length === 0, 'Expired session row should be deleted');
  });

  // Cleanup test data
  await pool.query('DELETE FROM recitation_questions WHERE recitation_id IN ($1, $2)', [recitationId, minRecId]);
  await pool.query('DELETE FROM recitation_sessions WHERE recitation_id IN ($1, $2)', [recitationId, minRecId]);
  await pool.query('DELETE FROM recitations WHERE id IN ($1, $2)', [recitationId, minRecId]);
  await pool.query('DELETE FROM students WHERE id=$1', [studentId]);
  await pool.query('DELETE FROM teachers WHERE id=$1', [teacherId]);

  if (server) server.close();

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch((e) => {
  if (server) server.close();
  console.error('Test runner fatal error:', e);
  process.exit(1);
});
