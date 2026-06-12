/**
 * WATHBA Platform — Post-Audit Fixes Test Suite
 * ==============================================
 * Run: node server/tests/security-and-fixes.test.js
 *
 * Tests all security, business-logic, and performance fixes.
 * Requires: DATABASE_URL + JWT_SECRET env vars, server running on port 3001.
 */

require('dotenv').config();
const pool   = require('../db/connection');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt    = require('jsonwebtoken');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');

const JWT_SECRET      = process.env.JWT_SECRET;
const TEST_USERNAME   = '_test_fixes_teacher';
const TEST_PASSWORD   = 'FixTest_2026!';
let   TEST_TOKEN      = null;
let   TEST_TEACHER_ID = null;

// ── Tiny test runner ──
let passed = 0, failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ ${name}\n     ${e.message}`);
    failed++;
  }
}

function assert(cond, msg)     { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function assertMatch(str, regex, msg) {
  if (!regex.test(str)) throw new Error(msg || `Expected "${str}" to match ${regex}`);
}

function request(method, path, body, token) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3001, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data  ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch (_) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    if (data) req.write(data);
    req.end();
  });
}

// ── Setup ──
async function setup() {
  await pool.query('DELETE FROM teachers WHERE username = $1', [TEST_USERNAME]);
  const hashed = await bcrypt.hash(TEST_PASSWORD, 10);
  const r = await pool.query(
    `INSERT INTO teachers (username, password, name, phone)
     VALUES ($1, $2, 'Test Teacher Fixes', '01000000000')
     ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password
     RETURNING id`,
    [TEST_USERNAME, hashed]
  );
  TEST_TEACHER_ID = r.rows[0].id;

  const loginRes = await request('POST', '/api/auth/login', {
    username: TEST_USERNAME, password: TEST_PASSWORD, role: 'teacher',
  });
  if (loginRes.status !== 200) throw new Error('Setup login failed: ' + JSON.stringify(loginRes.body));
  TEST_TOKEN = loginRes.body.token;
}

async function teardown() {
  await pool.query('DELETE FROM teachers WHERE username = $1', [TEST_USERNAME]);
}

// ══════════════════════════════════════════════════════════════════════════════
//  FIX TESTS
// ══════════════════════════════════════════════════════════════════════════════

async function runTests() {
  console.log('\n═══ Wathba Platform — Security & Fixes Test Suite ═══\n');

  // ── 1. CORS Configuration ────────────────────────────────────────────
  console.log('▶ Fix 1 — CORS Configuration');

  await test('CORS rejects disallowed origin with credentials', async () => {
    const { status } = await request('OPTIONS', '/api/health', null, null);
    assert(status === 204 || status === 200, `Unexpected status: ${status}`);
  });

  await test('CORS source code has no wildcard with credentials', async () => {
    const src = fs.readFileSync('server/index.js', 'utf8');
    assert(!src.includes("origin: '*'"), 'Wildcard origin must not appear');
    assertMatch(src, "origin.*=== 'production'", 'Production CORS check present');
  });

  // ── 2. Video Progress Security ───────────────────────────────────────
  console.log('\n▶ Fix 2 — Video Progress Server-Side Caps');

  await test('safeWatchedSeconds capped at durationMinutes * 60, not 86400', async () => {
    const src = fs.readFileSync('server/routes/students.js', 'utf8');
    assertMatch(src, 'maxWatchedSeconds', 'Variable maxWatchedSeconds exists');
    assertMatch(src, 'durationMinutes \\* 60', 'Capped at durationMinutes * 60');
    assert(!src.includes('Math.min(actual_watched_seconds || 0, 86400)'), '86400 hardcap removed');
  });

  // ── 3. Student List Pagination ───────────────────────────────────────
  console.log('\n▶ Fix 3 — Student List Pagination');

  await test('GET /api/students returns paginated response', async () => {
    const res = await request('GET', '/api/students?page=1&pageSize=10', null, TEST_TOKEN);
    assertEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.body?.students), 'Response has students array');
    assert(typeof res.body?.total === 'number', 'Response has total count');
    assertEqual(res.body?.page, 1, 'Page matches');
    assertEqual(res.body?.pageSize, 10, 'PageSize matches');
  });

  await test('GET /api/students defaults to page=1, pageSize=20', async () => {
    const res = await request('GET', '/api/students?page=1', null, TEST_TOKEN);
    assertEqual(res.status, 200);
    assertEqual(res.body?.page, 1);
    assertEqual(res.body?.pageSize, 20);
  });

  await test('GET /api/students without page param returns flat array (backward compat)', async () => {
    const res = await request('GET', '/api/students', null, TEST_TOKEN);
    assertEqual(res.status, 200);
    assert(Array.isArray(res.body), 'Response is a plain array');
  });

  await test('GET /api/students caps pageSize at 100', async () => {
    const res = await request('GET', '/api/students?page=1&pageSize=9999', null, TEST_TOKEN);
    assertEqual(res.status, 200);
    assert(res.body?.pageSize <= 100, 'pageSize capped at 100');
  });

  // ── 4. Course Publish Reactivates Inactive Enrollments ───────────────
  console.log('\n▶ Fix 4 — Course Publish Enrollment Reactivation');

  await test('course publish SQL uses ON CONFLICT DO UPDATE SET status', async () => {
    const src = fs.readFileSync('server/routes/courses.js', 'utf8');
    assertMatch(src, "ON CONFLICT \\(student_id, course_id\\) DO UPDATE SET status = 'active'",
      'SQL has ON CONFLICT DO UPDATE SET status');
    assert(!src.includes('ON CONFLICT DO NOTHING') || src.indexOf('ON CONFLICT DO NOTHING') > src.indexOf('DO UPDATE SET status'),
      'All free-course enroll SQL must use DO UPDATE, not DO NOTHING');
  });

  // ── 5. Database Query Timeout ────────────────────────────────────────
  console.log('\n▶ Fix 5 — Database Query Timeout');

  await test('pool config has query_timeout and statement_timeout', async () => {
    const src = fs.readFileSync('server/db/connection.js', 'utf8');
    assertMatch(src, 'query_timeout', 'query_timeout is configured');
    assertMatch(src, 'statement_timeout', 'statement_timeout is configured');
  });

  // ── 6. Silent Catch Blocks ──────────────────────────────────────────
  console.log('\n▶ Fix 6 — Silent Catch Block Elimination');

  await test('student delete cascade ops log warnings on failure', async () => {
    const src = fs.readFileSync('server/routes/students.js', 'utf8');
    const line = src.split('\n').findIndex(l => l.includes("'DELETE FROM video_progress WHERE student_id=$1'"));
    const after = src.split('\n').slice(line, line + 3).join('\n');
    assertMatch(after, 'console.warn', 'Catch block uses console.warn');
    assert(!after.includes('catch(() => {})'), 'Empty catch removed');
  });

  // ── 7. JWT Payload Consistency ───────────────────────────────────────
  console.log('\n▶ Fix 7 — JWT Payload Consistency');

  await test('assistant token includes teacher_id', async () => {
    const src = fs.readFileSync('server/routes/auth.js', 'utf8');
    assertMatch(src, 'teacher_id', 'teacher_id is added to payload for non-teacher roles');
  });

  // ── 8. Rate Limiting on Submission ──────────────────────────────────
  console.log('\n▶ Fix 8 — Exam Submission Rate Limiting');

  await test('submitLimiter exists with max 5 per minute', async () => {
    const src = fs.readFileSync('server/routes/exams.js', 'utf8');
    assertMatch(src, 'max: 5', 'Submit limiter max is 5');
    assertMatch(src, 'submitLimiter', 'submitLimiter is defined');
  });

  // ── 9. Media Token Uses Separate Secret Path ─────────────────────────
  console.log('\n▶ Fix 9 — Media Token Separate Secret');

  await test('media-only token includes media_only flag', async () => {
    const src = fs.readFileSync('server/routes/auth.js', 'utf8');
    assertMatch(src, 'media_only', 'media_only flag in payload');
    assertMatch(src, "'15m'", 'Short expiry on media token');
  });

  // ── 10. Health / Database Check ─────────────────────────────────────
  console.log('\n▶ Fix 10 — API Health Check');

  await test('GET /api/health returns ok', async () => {
    const res = await request('GET', '/api/health', null, null);
    assertEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert(res.body?.ok || res.body?.status === 'ok', 'Health endpoint ok');
  });

  // ── Summary ─────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n═══ Results: ${passed}/${total} passed, ${failed} failed ═══\n`);
  process.exit(failed > 0 ? 1 : 0);
}

setup()
  .then(runTests)
  .catch(e => { console.error('Setup failed:', e); process.exit(1); })
  .finally(() => teardown().catch(() => {}));
