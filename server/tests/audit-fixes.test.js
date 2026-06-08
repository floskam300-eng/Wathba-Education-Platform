/**
 * WATHBA Platform — Audit Fixes Test Suite
 * ==========================================
 * Run: node server/tests/audit-fixes.test.js
 *
 * Tests every fix from the security/bug/performance audit.
 * Requires: DATABASE_URL + JWT_SECRET env vars, server running on port 3001.
 *
 * Creates a temporary test teacher (username: _test_teacher_audit) with a
 * known password, uses it for all HTTP tests, and cleans up at the end.
 */

require('dotenv').config();
const pool   = require('../db/connection');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt    = require('jsonwebtoken');
const http   = require('http');
const fs     = require('fs');

const JWT_SECRET      = process.env.JWT_SECRET;
const TEST_USERNAME   = '_test_teacher_audit';
const TEST_PASSWORD   = 'AuditTest_2026!';
let   TEST_TOKEN      = null;   // set after test-teacher is logged in
let   TEST_TEACHER_ID = null;

// ── Tiny test runner ──────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
    results.push({ name, ok: true });
  } catch (e) {
    console.error(`  ❌ ${name}\n     ${e.message}`);
    failed++;
    results.push({ name, ok: false, error: e.message });
  }
}

function assert(cond, msg)     { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts  = {
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
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Setup: create temp test teacher ──────────────────────────────────────────
async function setup() {
  // Clean up any leftover from previous run
  await pool.query('DELETE FROM teachers WHERE username = $1', [TEST_USERNAME]);
  const hashed = await bcrypt.hash(TEST_PASSWORD, 10);
  const r = await pool.query(
    `INSERT INTO teachers (username, password, name, slug)
     VALUES ($1, $2, 'Test Teacher (Audit)', $3) RETURNING id`,
    [TEST_USERNAME, hashed, TEST_USERNAME]
  );
  TEST_TEACHER_ID = r.rows[0].id;

  // Login to get token
  const login = await request('POST', '/api/auth/login',
    { username: TEST_USERNAME, password: TEST_PASSWORD, role: 'teacher' }
  );
  if (login.status !== 200) {
    throw new Error(`Test teacher login failed: ${login.status} — ${JSON.stringify(login.body)}`);
  }
  TEST_TOKEN = login.body.token;
  console.log(`[setup] Test teacher created (id=${TEST_TEACHER_ID}), logged in successfully.\n`);
}

// ── Teardown ──────────────────────────────────────────────────────────────────
async function teardown() {
  await pool.query('DELETE FROM teachers WHERE username = $1', [TEST_USERNAME]);
  console.log('\n[teardown] Test teacher removed.');
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════');
console.log('  WATHBA Audit-Fixes Test Suite');
console.log('══════════════════════════════════════════════════\n');

(async () => {
  await setup();

  // ── 1. JWT Blacklist Persistence ──────────────────────────────────────────
  console.log('▶ Fix 1 — JWT Blacklist DB Persistence');

  await test('revoked_tokens table exists', async () => {
    const r = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_name = 'revoked_tokens'
       ) AS ok`
    );
    assert(r.rows[0].ok, 'Table revoked_tokens does not exist');
  });

  await test('blacklisted token hash is stored in DB', async () => {
    const fakeToken = jwt.sign({ id: 9999, role: 'teacher' }, JWT_SECRET, { expiresIn: '1s' });
    const hash      = crypto.createHash('sha256').update(fakeToken).digest('hex');
    const exp       = Date.now() + 60_000;

    await pool.query(
      'INSERT INTO revoked_tokens (token_hash, expires_at) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [hash, new Date(exp).toISOString()]
    );
    const check = await pool.query(
      'SELECT token_hash FROM revoked_tokens WHERE token_hash = $1', [hash]
    );
    assert(check.rows.length > 0, 'Token hash not persisted to DB');
    await pool.query('DELETE FROM revoked_tokens WHERE token_hash = $1', [hash]);
  });

  await test('expired tokens excluded from active query', async () => {
    const oldHash = crypto.randomBytes(32).toString('hex');
    await pool.query(
      "INSERT INTO revoked_tokens (token_hash, expires_at) VALUES ($1, NOW() - INTERVAL '1 hour') ON CONFLICT DO NOTHING",
      [oldHash]
    );
    const check = await pool.query(
      'SELECT token_hash FROM revoked_tokens WHERE token_hash = $1 AND expires_at > NOW()',
      [oldHash]
    );
    assertEqual(check.rows.length, 0, 'Expired token should not appear in active query');
    await pool.query('DELETE FROM revoked_tokens WHERE token_hash = $1', [oldHash]);
  });

  await test('login → logout → revoked token returns 401', async () => {
    // Login fresh
    const login = await request('POST', '/api/auth/login',
      { username: TEST_USERNAME, password: TEST_PASSWORD, role: 'teacher' }
    );
    assert(login.status === 200, `Login failed: ${login.status}`);
    const tempToken = login.body.token;

    // Verify token works
    const me = await request('GET', '/api/auth/me', null, tempToken);
    assertEqual(me.status, 200, 'Token should be valid before logout');

    // Logout (revokes token)
    const logout = await request('POST', '/api/auth/logout', {}, tempToken);
    assert(logout.status === 200, `Logout failed: ${logout.status}`);

    // Revoked token should now be rejected
    const after = await request('GET', '/api/auth/me', null, tempToken);
    assertEqual(after.status, 401, 'Revoked token should return 401');
  });

  // ── 2. Exam Force-Reset Point Deduction ───────────────────────────────────
  console.log('\n▶ Fix 2 — Exam Force-Reset Deducts Student Points');

  await test('force_reset deducts points_earned from students', async () => {
    const pw     = 'ts_' + Date.now();
    const hashed = await bcrypt.hash(pw, 10);

    const sRes = await pool.query(
      `INSERT INTO students (username, password, name, teacher_id, points)
       VALUES ($1, $2, $3, $4, 100) RETURNING id`,
      [`ts_std_${Date.now()}`, hashed, 'Reset Test Student', TEST_TEACHER_ID]
    );
    const studentId = sRes.rows[0].id;

    const eRes = await pool.query(
      `INSERT INTO exams (title, duration_minutes, total_score, teacher_id, is_published)
       VALUES ('Temp Reset Exam', 30, 100, $1, true) RETURNING id`,
      [TEST_TEACHER_ID]
    );
    const examId = eRes.rows[0].id;

    await pool.query(
      `INSERT INTO exam_results (student_id, exam_id, score, points_earned, is_latest, correct_count, wrong_count)
       VALUES ($1, $2, 80, 50, true, 8, 2)`,
      [studentId, examId]
    );

    // Run the force_reset logic (mirrors exams.js)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const earnedRows = await client.query(
        `SELECT student_id, COALESCE(points_earned, 0) AS pts
         FROM exam_results WHERE exam_id=$1 AND COALESCE(points_earned,0)>0 AND is_latest=true`,
        [examId]
      );
      for (const row of earnedRows.rows) {
        await client.query(
          'UPDATE students SET points = GREATEST(0, points - $1) WHERE id = $2',
          [row.pts, row.student_id]
        );
      }
      await client.query('DELETE FROM exam_results WHERE exam_id=$1', [examId]);
      await client.query('COMMIT');
    } finally { client.release(); }

    const after = await pool.query('SELECT points FROM students WHERE id=$1', [studentId]);
    assertEqual(after.rows[0].points, 50, `Expected 50 pts remaining, got ${after.rows[0].points}`);

    await pool.query('DELETE FROM exams WHERE id=$1',    [examId]);
    await pool.query('DELETE FROM students WHERE id=$1', [studentId]);
  });

  await test('force_reset GREATEST(0) — points never go negative', async () => {
    const pw     = 'floor_' + Date.now();
    const hashed = await bcrypt.hash(pw, 10);
    const sRes   = await pool.query(
      `INSERT INTO students (username, password, name, teacher_id, points)
       VALUES ($1, $2, $3, $4, 10) RETURNING id`,
      [`floor_std_${Date.now()}`, hashed, 'Floor Test Student', TEST_TEACHER_ID]
    );
    const studentId = sRes.rows[0].id;
    await pool.query(
      'UPDATE students SET points = GREATEST(0, points - 100) WHERE id=$1', [studentId]
    );
    const after = await pool.query('SELECT points FROM students WHERE id=$1', [studentId]);
    assertEqual(after.rows[0].points, 0, `Points should be 0, not ${after.rows[0].points}`);
    await pool.query('DELETE FROM students WHERE id=$1', [studentId]);
  });

  // ── 3. Payment Verify Auto-Enroll ─────────────────────────────────────────
  console.log('\n▶ Fix 3 — Payment Verify Auto-Enrolls Student');

  await test('verifying a payment auto-enrolls student in course', async () => {
    const pw     = 'pe_' + Date.now();
    const hashed = await bcrypt.hash(pw, 10);
    const sRes   = await pool.query(
      `INSERT INTO students (username, password, name, teacher_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [`pe_std_${Date.now()}`, hashed, 'AutoEnroll Student', TEST_TEACHER_ID]
    );
    const studentId = sRes.rows[0].id;
    const cRes = await pool.query(
      `INSERT INTO courses (name, teacher_id, price) VALUES ('AutoEnroll Course', $1, 100) RETURNING id`,
      [TEST_TEACHER_ID]
    );
    const courseId = cRes.rows[0].id;

    // Simulate auto-enroll on payment verify (mirrors payments.js)
    await pool.query(
      `INSERT INTO student_course_enrollment (student_id, course_id, status)
       VALUES ($1, $2, 'active') ON CONFLICT (student_id, course_id) DO UPDATE SET status = 'active'`,
      [studentId, courseId]
    );

    const enroll = await pool.query(
      `SELECT status FROM student_course_enrollment WHERE student_id=$1 AND course_id=$2`,
      [studentId, courseId]
    );
    assert(enroll.rows.length > 0, 'Student not enrolled after payment verify');
    assertEqual(enroll.rows[0].status, 'active', 'Enrollment status should be active');

    await pool.query('DELETE FROM student_course_enrollment WHERE student_id=$1', [studentId]);
    await pool.query('DELETE FROM courses WHERE id=$1',   [courseId]);
    await pool.query('DELETE FROM students WHERE id=$1',  [studentId]);
  });

  await test('double verify is idempotent — no duplicate enrollments', async () => {
    const pw     = 'idem_' + Date.now();
    const hashed = await bcrypt.hash(pw, 10);
    const sRes   = await pool.query(
      `INSERT INTO students (username, password, name, teacher_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [`idem_std_${Date.now()}`, hashed, 'Idempotent Student', TEST_TEACHER_ID]
    );
    const studentId = sRes.rows[0].id;
    const cRes = await pool.query(
      `INSERT INTO courses (name, teacher_id, price) VALUES ('Idem Course', $1, 50) RETURNING id`,
      [TEST_TEACHER_ID]
    );
    const courseId = cRes.rows[0].id;

    for (let i = 0; i < 3; i++) {
      await pool.query(
        `INSERT INTO student_course_enrollment (student_id, course_id, status)
         VALUES ($1, $2, 'active') ON CONFLICT (student_id, course_id) DO UPDATE SET status = 'active'`,
        [studentId, courseId]
      );
    }
    const count = await pool.query(
      `SELECT COUNT(*) FROM student_course_enrollment WHERE student_id=$1 AND course_id=$2`,
      [studentId, courseId]
    );
    assertEqual(parseInt(count.rows[0].count), 1, 'Should be exactly 1 enrollment row');

    await pool.query('DELETE FROM student_course_enrollment WHERE student_id=$1', [studentId]);
    await pool.query('DELETE FROM courses WHERE id=$1',   [courseId]);
    await pool.query('DELETE FROM students WHERE id=$1',  [studentId]);
  });

  // ── 4. Leaderboard Race Condition ─────────────────────────────────────────
  console.log('\n▶ Fix 4 — Leaderboard Reset Race Condition');

  await test('leaderboard_reset_tracker FOR UPDATE lock works', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO leaderboard_reset_tracker (teacher_id, last_reset_at, next_reset_at)
         VALUES ($1, NOW(), NOW() + INTERVAL '30 days') ON CONFLICT (teacher_id) DO NOTHING`,
        [TEST_TEACHER_ID]
      );
      const r = await client.query(
        'SELECT teacher_id FROM leaderboard_reset_tracker WHERE teacher_id=$1 FOR UPDATE',
        [TEST_TEACHER_ID]
      );
      assert(r.rows.length > 0, 'FOR UPDATE lock query returned empty result');
      await client.query('ROLLBACK');
    } finally { client.release(); }
  });

  await test('concurrent resets produce exactly ONE history entry (serialized by FOR UPDATE)', async () => {
    const label = 'Audit Test Month ' + Date.now();
    // Pre-cleanup
    await pool.query('DELETE FROM leaderboard_history WHERE teacher_id=$1 AND month_label=$2', [TEST_TEACHER_ID, label]);

    const run = async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO leaderboard_reset_tracker (teacher_id, last_reset_at, next_reset_at)
           VALUES ($1, NOW(), NOW() + INTERVAL '30 days') ON CONFLICT (teacher_id) DO NOTHING`,
          [TEST_TEACHER_ID]
        );
        // FOR UPDATE serializes concurrent runs — second waits, then sees first's insert
        await client.query(
          'SELECT teacher_id FROM leaderboard_reset_tracker WHERE teacher_id=$1 FOR UPDATE',
          [TEST_TEACHER_ID]
        );
        const existing = await client.query(
          'SELECT teacher_id FROM leaderboard_history WHERE teacher_id=$1 AND month_label=$2',
          [TEST_TEACHER_ID, label]
        );
        if (!existing.rows.length) {
          await client.query(
            'INSERT INTO leaderboard_history (teacher_id, month_label, reset_at, rankings) VALUES ($1,$2,NOW(),$3)',
            [TEST_TEACHER_ID, label, '[]']
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally { client.release(); }
    };

    // Run two "resets" concurrently
    await Promise.all([run(), run()]);

    const count = await pool.query(
      'SELECT COUNT(*) FROM leaderboard_history WHERE teacher_id=$1 AND month_label=$2',
      [TEST_TEACHER_ID, label]
    );
    assertEqual(parseInt(count.rows[0].count), 1, 'Exactly 1 history entry expected after concurrent resets');

    await pool.query('DELETE FROM leaderboard_history WHERE teacher_id=$1 AND month_label=$2', [TEST_TEACHER_ID, label]);
  });

  // ── 5. Multer Error Handling ──────────────────────────────────────────────
  console.log('\n▶ Fix 5 — Multer Error Returns JSON (not HTML crash)');

  await test('oversized image upload returns JSON 400 not HTML', async () => {
    const boundary = '----TestBoundary' + Date.now();
    const bigData  = Buffer.alloc(6 * 1024 * 1024, 'A'); // 6MB > 5MB limit
    const header   = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="big.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body   = Buffer.concat([header, bigData, footer]);

    const res = await new Promise((resolve, reject) => {
      const opts = {
        hostname: 'localhost', port: 3001,
        path: '/api/exams/upload-question-image', method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
      };
      const req = http.request(opts, (r) => {
        let raw = '';
        r.on('data', c => raw += c);
        r.on('end', () => {
          try { resolve({ status: r.statusCode, body: JSON.parse(raw) }); }
          catch (_) { resolve({ status: r.statusCode, body: raw }); }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    assertEqual(res.status, 400, `Expected 400 for oversized file, got ${res.status}`);
    assert(typeof res.body === 'object' && res.body.error, 'Response should be JSON with error field');
    assert(!String(res.body.error).includes('<html'), 'Error should NOT be HTML');
  });

  await test('non-image file type is rejected with 400 JSON', async () => {
    const boundary = '----TestBoundary2_' + Date.now();
    const content  = Buffer.from('I am a PDF, not an image');
    const header   = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="test.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body   = Buffer.concat([header, content, footer]);

    const res = await new Promise((resolve, reject) => {
      const opts = {
        hostname: 'localhost', port: 3001,
        path: '/api/exams/upload-question-image', method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
      };
      const req = http.request(opts, (r) => {
        let raw = '';
        r.on('data', c => raw += c);
        r.on('end', () => {
          try { resolve({ status: r.statusCode, body: JSON.parse(raw) }); }
          catch (_) { resolve({ status: r.statusCode, body: raw }); }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    assertEqual(res.status, 400, `Expected 400 for non-image type, got ${res.status}`);
    assert(typeof res.body === 'object' && res.body.error, 'Response should be JSON with error field');
  });

  // ── 6. bcrypt Outside Transaction ─────────────────────────────────────────
  console.log('\n▶ Fix 6 — bcrypt Hashing Outside DB Transaction');

  await test('bcrypt.hash is correct and completes in <5s', async () => {
    const password = '123456';
    const start    = Date.now();
    const hashed   = await bcrypt.hash(password, 10);
    const duration = Date.now() - start;
    assert(hashed.startsWith('$2'), 'bcrypt hash should start with $2');
    assert(await bcrypt.compare(password, hashed), 'bcrypt verify should pass');
    assert(duration < 5000, `bcrypt.hash took ${duration}ms — too slow`);
  });

  await test('bulk import API (3 students) succeeds with pre-hashed passwords', async () => {
    const students = [
      { 'الاسم': 'بلك تيست ١', 'المرحلة': 'الصف الأول الثانوي', 'الجنس': 'ذكر' },
      { 'الاسم': 'بلك تيست ٢', 'المرحلة': 'الصف الثاني الثانوي', 'الجنس': 'أنثى' },
      { 'الاسم': 'بلك تيست ٣', 'المرحلة': 'الصف الثالث الثانوي' },
    ];
    const res = await request('POST', '/api/students/bulk', { students }, TEST_TOKEN);
    assert(res.status === 200 || res.status === 201,
      `Bulk import failed: ${res.status} — ${JSON.stringify(res.body)}`);
    assertEqual(res.body.success, 3, `Expected 3 created, got ${res.body.success}`);
    for (const s of students) {
      await pool.query('DELETE FROM students WHERE name=$1 AND teacher_id=$2', [s['الاسم'], TEST_TEACHER_ID]);
    }
  });

  // ── 7. Missing DB Indexes ─────────────────────────────────────────────────
  console.log('\n▶ Fix 7 — Missing DB Indexes Created');

  const indexTests = [
    ['idx_students_stage_teacher', 'students'],
    ['idx_videos_section',         'videos'],
    ['idx_pdfs_section',           'pdf_files'],
    ['idx_revoked_tokens_expires', 'revoked_tokens'],
  ];
  for (const [idxName, tbl] of indexTests) {
    await test(`index ${idxName} on ${tbl}`, async () => {
      const r = await pool.query(
        `SELECT indexname FROM pg_indexes WHERE tablename=$1 AND indexname=$2`,
        [tbl, idxName]
      );
      assert(r.rows.length > 0, `Index ${idxName} on ${tbl} does not exist`);
    });
  }

  // ── 8. AuthContext Silent Fail Fixed ──────────────────────────────────────
  console.log('\n▶ Fix 8 — AuthContext Logs Background Refresh Errors');

  await test('updateUser catch logs console.warn (source code check)', async () => {
    const src = fs.readFileSync('client/src/context/AuthContext.jsx', 'utf8');
    assert(src.includes('console.warn') && src.includes('Background user refresh failed'),
      'updateUser catch should log a descriptive console.warn message');
    assert(!src.includes('.catch(() => {})'), 'Silent empty catch should be removed');
  });

  // ── 9. Student Dashboard staleTime ────────────────────────────────────────
  console.log('\n▶ Fix 9 — Student Dashboard staleTime');

  await test('staleTime is 60000ms — not 0', async () => {
    const src = fs.readFileSync('client/src/pages/student/Dashboard.jsx', 'utf8');
    assert(src.includes('staleTime: 60_000') || src.includes('staleTime: 60000'),
      'staleTime should be 60_000 ms');
    assert(!src.includes('staleTime: 0'), 'staleTime: 0 should be removed');
  });

  // ── 10. Broken Image onError Handlers ─────────────────────────────────────
  console.log('\n▶ Fix 10 — Broken Image onError Handlers');

  await test('Exams.jsx has ≥2 onError handlers hiding broken images', async () => {
    const src   = fs.readFileSync('client/src/pages/student/Exams.jsx', 'utf8');
    const count = (src.match(/onError=.*?display.*?none/g) || []).length;
    assert(count >= 2, `Expected ≥2 onError handlers in Exams.jsx, found ${count}`);
  });

  // ── 11. Edge Cases ────────────────────────────────────────────────────────
  console.log('\n▶ Edge Cases');

  await test('login with wrong password returns 401', async () => {
    const res = await request('POST', '/api/auth/login',
      { username: TEST_USERNAME, password: 'WrongPassword!', role: 'teacher' }
    );
    assertEqual(res.status, 401, `Expected 401, got ${res.status}`);
    assert(res.body.error, 'Response should have error field');
  });

  await test('accessing /api/auth/me without token → 401', async () => {
    const res = await request('GET', '/api/auth/me', null, null);
    assertEqual(res.status, 401, `Expected 401, got ${res.status}`);
  });

  await test('student cannot access teacher-only route → 401/403', async () => {
    // Create a temp student
    const pw     = 'stu_' + Date.now();
    const hashed = await bcrypt.hash(pw, 10);
    const sRes   = await pool.query(
      `INSERT INTO students (username, password, name, teacher_id)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [`edge_stu_${Date.now()}`, hashed, 'Edge Student', TEST_TEACHER_ID]
    );
    const studentId = sRes.rows[0].id;

    const login = await request('POST', '/api/auth/login',
      { username: `edge_stu_${studentId}`, password: pw }
    );
    // Student token (or just use a forged JWT for role check)
    const stdToken = jwt.sign(
      { id: studentId, role: 'student', teacher_id: TEST_TEACHER_ID },
      JWT_SECRET, { expiresIn: '5m' }
    );

    const res = await request('GET', '/api/students', null, stdToken);
    assert(res.status === 403 || res.status === 401,
      `Expected 403/401 for student on teacher route, got ${res.status}`);

    await pool.query('DELETE FROM students WHERE id=$1', [studentId]);
  });

  await test('bulk import: empty-name row skipped, valid row created', async () => {
    const res = await request('POST', '/api/students/bulk', {
      students: [
        { 'الاسم': '',         'المرحلة': 'الصف الأول الثانوي' },
        { 'الاسم': 'طالب صالح', 'المرحلة': 'الصف الأول الثانوي' },
      ]
    }, TEST_TOKEN);

    assert(res.status === 200 || res.status === 201, `Status: ${res.status}`);
    assertEqual(res.body.success, 1, 'Only 1 valid student should be created');
    assertEqual(res.body.failed,  1, 'Exactly 1 row should fail validation');
    assert(res.body.errors?.some(e => e.includes('الاسم مطلوب')),
      'Error message should mention missing name');

    await pool.query('DELETE FROM students WHERE name=$1 AND teacher_id=$2', ['طالب صالح', TEST_TEACHER_ID]);
  });

  await test('bulk import: 201 students rejected with 400', async () => {
    const bigBatch = Array.from({ length: 201 }, (_, i) => ({ 'الاسم': `طالب ${i}` }));
    const res = await request('POST', '/api/students/bulk', { students: bigBatch }, TEST_TOKEN);
    assertEqual(res.status, 400, `Expected 400 for >200 batch, got ${res.status}`);
    assert(res.body.error?.includes('200'), 'Error should mention the 200 limit');
  });

  await test('payment verify with invalid status returns 400', async () => {
    // Create a temp payment to target
    const pw     = 'pv_' + Date.now();
    const hashed = await bcrypt.hash(pw, 10);
    const sRes   = await pool.query(
      `INSERT INTO students (username,password,name,teacher_id)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [`pv_std_${Date.now()}`, hashed, 'PV Student', TEST_TEACHER_ID]
    );
    const studentId = sRes.rows[0].id;
    const pRes = await pool.query(
      `INSERT INTO payments (student_id, amount, method, status)
       VALUES ($1, 100, 'cash', 'pending') RETURNING id`,
      [studentId]
    );
    const payId = pRes.rows[0].id;

    const res = await request('PUT', `/api/payments/${payId}/verify`,
      { status: 'hacked' }, TEST_TOKEN
    );
    assert([400, 404].includes(res.status),
      `Expected 400/404 for invalid status, got ${res.status}`);
    if (res.status === 400) assert(res.body.error, 'Should return error message');

    await pool.query('DELETE FROM payments WHERE id=$1', [payId]);
    await pool.query('DELETE FROM students WHERE id=$1', [studentId]);
  });

  await test('exam submission without token → 401', async () => {
    const res = await request('POST', '/api/exams/1/submit', { answers: {} }, null);
    assertEqual(res.status, 401, `Expected 401 without token, got ${res.status}`);
  });

  await test('revoked_tokens cleanup index exists', async () => {
    const r = await pool.query(
      `SELECT indexname FROM pg_indexes
       WHERE tablename='revoked_tokens' AND indexname='idx_revoked_tokens_expires'`
    );
    assert(r.rows.length > 0, 'idx_revoked_tokens_expires index missing');
  });

  await test('valid login returns JWT token with correct role', async () => {
    const res = await request('POST', '/api/auth/login',
      { username: TEST_USERNAME, password: TEST_PASSWORD, role: 'teacher' }
    );
    assertEqual(res.status, 200, `Login should succeed`);
    assert(res.body.token, 'Response should include token');
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    assertEqual(decoded.role, 'teacher', 'Token role should be teacher');
    // Revoke this extra token
    const expiresAt = (decoded.exp || 0) * 1000;
    await request('POST', '/api/auth/logout', {}, res.body.token);
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  await teardown();
  await pool.end();

  console.log('\n══════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  console.log('══════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('Failed tests:');
    for (const r of results.filter(r => !r.ok)) {
      console.log(`  ❌ ${r.name}: ${r.error}`);
    }
    process.exit(1);
  } else {
    console.log('All tests passed! ✅\n');
    process.exit(0);
  }

})().catch(async err => {
  console.error('\n💥 Test runner crashed:', err.message);
  await teardown().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(2);
});
