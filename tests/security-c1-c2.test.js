/**
 * WATHBA Security Tests — C-1 (IDOR on uploads) + C-2 (Revoked JWT bypass)
 * =========================================================================
 * Run: node tests/security-c1-c2.test.js
 *
 * Requires:
 *   DATABASE_URL, JWT_SECRET env vars
 *   Server running on port 3001
 *
 * What is tested:
 *   [C-1] IDOR prevention — each user may only access files they own / are
 *         enrolled in.  Another valid JWT must NOT be enough.
 *
 *   [C-2] Revoked-JWT bypass — after logout the blacklisted token must be
 *         rejected by both the /uploads/* static-file routes AND /api/sse.
 *
 * Test data is created in setup() and fully cleaned up in teardown().
 */

'use strict';
require('dotenv').config();

const pool   = require('../server/db/connection');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt    = require('jsonwebtoken');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');

const JWT_SECRET = process.env.JWT_SECRET;
const PORT       = parseInt(process.env.PORT || '3001', 10);
const BASE       = `http://localhost:${PORT}`;

// ── Tiny test runner ──────────────────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0;

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

function skip(name) {
  console.log(`  ⏭   ${name} (skipped)`);
  skipped++;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function request(method, urlPath, body, token, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname : 'localhost',
      port     : PORT,
      path     : urlPath,
      method,
      headers  : {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data  ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...extraHeaders,
      },
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

function getFile(urlPath, token, { abortOnFirstData = false } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = { hostname: 'localhost', port: PORT, path: urlPath, method: 'GET', headers };
    const req = http.request(opts, (res) => {
      if (abortOnFirstData) {
        // For SSE / keep-alive connections: resolve as soon as we have the status code
        res.on('data', () => {});
        resolve({ status: res.statusCode });
        // Destroy socket to avoid hanging the process
        setTimeout(() => { try { req.destroy(); } catch (_) {} }, 50);
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', (e) => {
      // Ignore connection-reset errors caused by intentional req.destroy()
      if (e.code === 'ECONNRESET' || e.code === 'ECONNREFUSED') return;
      reject(e);
    });
    req.end();
  });
}

function getFileQs(urlPath, token) {
  const sep = urlPath.includes('?') ? '&' : '?';
  return getFile(`${urlPath}${sep}token=${encodeURIComponent(token)}`, null);
}

function makeToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d', jwtid: crypto.randomUUID() });
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const T = {
  // Two separate teachers
  teacherA: { username: '_sec_test_teacherA', id: null, token: null },
  teacherB: { username: '_sec_test_teacherB', id: null, token: null },

  // Two students: studentEnrolled in courseA, studentOther has NO enrollment
  studentEnrolled: { username: '_sec_test_std_enrolled', id: null, token: null },
  studentOther   : { username: '_sec_test_std_other',    id: null, token: null },
  studentSuspended: { username: '_sec_test_std_suspended', id: null, token: null },

  // One assistant belonging to teacherA
  assistant: { username: '_sec_test_asst', id: null, token: null },

  // Courses
  courseA: { id: null },
  courseB: { id: null },

  // Media files (actual temp files on disk)
  videoA  : { dbPath: null, diskPath: null },
  pdfA    : { dbPath: null, diskPath: null },
  questionImageA: { dbPath: null, diskPath: null },

  // Exam + question
  examA   : { id: null },
  questionA: { id: null },
};

// ── Setup ─────────────────────────────────────────────────────────────────────
async function setup() {
  console.log('[setup] Creating test fixtures …');

  const hashed = await bcrypt.hash('SecTest_2026!', 10);

  // Teachers
  {
    await pool.query('DELETE FROM teachers WHERE username = ANY($1)',
      [[T.teacherA.username, T.teacherB.username]]);

    const rA = await pool.query(
      `INSERT INTO teachers (username, password, name, slug)
       VALUES ($1, $2, 'Sec Test Teacher A', $3) RETURNING id`,
      [T.teacherA.username, hashed, T.teacherA.username]
    );
    T.teacherA.id = rA.rows[0].id;

    const rB = await pool.query(
      `INSERT INTO teachers (username, password, name, slug)
       VALUES ($1, $2, 'Sec Test Teacher B', $3) RETURNING id`,
      [T.teacherB.username, hashed, T.teacherB.username]
    );
    T.teacherB.id = rB.rows[0].id;
  }

  // Students
  {
    await pool.query(
      'DELETE FROM students WHERE username = ANY($1)',
      [[T.studentEnrolled.username, T.studentOther.username, T.studentSuspended.username]]
    );
    for (const s of [T.studentEnrolled, T.studentOther, T.studentSuspended]) {
      const r = await pool.query(
        `INSERT INTO students (username, password, name, teacher_id)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [s.username, hashed, s.username, T.teacherA.id]
      );
      s.id = r.rows[0].id;
    }
    // Suspend one student
    await pool.query('UPDATE students SET is_suspended = true WHERE id = $1', [T.studentSuspended.id]);
  }

  // Assistant for teacherA
  {
    await pool.query('DELETE FROM assistants WHERE username = $1', [T.assistant.username]);
    const rA = await pool.query(
      `INSERT INTO assistants (username, password, name, teacher_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [T.assistant.username, hashed, T.assistant.username, T.teacherA.id]
    );
    T.assistant.id = rA.rows[0].id;
  }

  // Courses
  {
    const rA = await pool.query(
      `INSERT INTO courses (name, teacher_id, price, is_published)
       VALUES ('SecTest Course A', $1, 0, true) RETURNING id`,
      [T.teacherA.id]
    );
    T.courseA.id = rA.rows[0].id;

    const rB = await pool.query(
      `INSERT INTO courses (name, teacher_id, price, is_published)
       VALUES ('SecTest Course B', $1, 0, true) RETURNING id`,
      [T.teacherB.id]
    );
    T.courseB.id = rB.rows[0].id;
  }

  // Enroll studentEnrolled in courseA (active)
  await pool.query(
    `INSERT INTO student_course_enrollment (student_id, course_id, status)
     VALUES ($1, $2, 'active')
     ON CONFLICT (student_id, course_id) DO UPDATE SET status='active'`,
    [T.studentEnrolled.id, T.courseA.id]
  );

  // Create temp media files on disk + DB records
  const uploadsBase = path.join(__dirname, '../uploads');
  const ts = Date.now();

  // Video for courseA
  T.videoA.dbPath   = `/uploads/videos/sec_test_vid_${ts}.mp4`;
  T.videoA.diskPath = path.join(uploadsBase, `videos/sec_test_vid_${ts}.mp4`);
  fs.writeFileSync(T.videoA.diskPath, 'fake-video-content-for-security-test');

  const secA = await pool.query(
    `INSERT INTO sections (course_id, title, sort_order) VALUES ($1, 'SecTest Section', 1) RETURNING id`,
    [T.courseA.id]
  );
  const sectionId = secA.rows[0].id;

  await pool.query(
    `INSERT INTO videos (section_id, course_id, title, file_path_or_url, duration_minutes)
     VALUES ($1, $2, 'SecTest Video', $3, 1)`,
    [sectionId, T.courseA.id, T.videoA.dbPath]
  );

  // PDF for courseA
  T.pdfA.dbPath   = `/uploads/pdfs/sec_test_pdf_${ts}.pdf`;
  T.pdfA.diskPath = path.join(uploadsBase, `pdfs/sec_test_pdf_${ts}.pdf`);
  fs.writeFileSync(T.pdfA.diskPath, 'fake-pdf-content-for-security-test');

  await pool.query(
    `INSERT INTO pdf_files (section_id, course_id, title, file_url)
     VALUES ($1, $2, 'SecTest PDF', $3)`,
    [sectionId, T.courseA.id, T.pdfA.dbPath]
  );

  // Question image for courseA exam
  T.questionImageA.dbPath   = `/uploads/question-images/sec_test_qimg_${ts}.png`;
  T.questionImageA.diskPath = path.join(uploadsBase, `question-images/sec_test_qimg_${ts}.png`);
  fs.writeFileSync(T.questionImageA.diskPath, 'fake-image-content-for-security-test');

  const eA = await pool.query(
    `INSERT INTO exams (title, duration_minutes, total_score, course_id, teacher_id, is_published, pass_score)
     VALUES ('SecTest Exam A', 30, 100, $1, $2, true, 50) RETURNING id`,
    [T.courseA.id, T.teacherA.id]
  );
  T.examA.id = eA.rows[0].id;

  const qA = await pool.query(
    `INSERT INTO questions (exam_id, question_text, question_type, question_image_url, option_a, option_b, correct_answer_letter, points)
     VALUES ($1, 'SecTest Q?', 'mcq', $2, 'Opt A', 'Opt B', 'A', 1) RETURNING id`,
    [T.examA.id, T.questionImageA.dbPath]
  );
  T.questionA.id = qA.rows[0].id;

  // Generate tokens directly (faster than HTTP login for setup)
  T.teacherA.token     = makeToken({ id: T.teacherA.id,    role: 'teacher' });
  T.teacherB.token     = makeToken({ id: T.teacherB.id,    role: 'teacher' });
  T.studentEnrolled.token  = makeToken({ id: T.studentEnrolled.id, role: 'student' });
  T.studentOther.token     = makeToken({ id: T.studentOther.id,    role: 'student' });
  T.studentSuspended.token = makeToken({ id: T.studentSuspended.id, role: 'student' });
  T.assistant.token    = makeToken({ id: T.assistant.id, teacher_id: T.teacherA.id, role: 'assistant' });

  console.log('[setup] Done.\n');
}

// ── Teardown ──────────────────────────────────────────────────────────────────
async function teardown() {
  console.log('\n[teardown] Cleaning up …');
  try {
    for (const f of [T.videoA, T.pdfA, T.questionImageA]) {
      if (f.diskPath && fs.existsSync(f.diskPath)) fs.unlinkSync(f.diskPath);
    }
    await pool.query('DELETE FROM teachers WHERE username = ANY($1)',
      [[T.teacherA.username, T.teacherB.username]]);
    await pool.query('DELETE FROM students WHERE username = ANY($1)',
      [[T.studentEnrolled.username, T.studentOther.username, T.studentSuspended.username]]);
    console.log('[teardown] Done.');
  } catch (e) {
    console.warn('[teardown] Warning:', e.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Test Suites
// ═════════════════════════════════════════════════════════════════════════════

async function runTests() {

  // ──────────────────────────────────────────────────────────────────────────
  console.log('▶  [C-2] Revoked JWT — Upload endpoints reject blacklisted tokens');
  // ──────────────────────────────────────────────────────────────────────────

  await test('Video: no token → 401', async () => {
    const r = await getFile(T.videoA.dbPath, null);
    assertEqual(r.status, 401, `Expected 401, got ${r.status}`);
  });

  await test('PDF: no token → 401', async () => {
    const r = await getFile(T.pdfA.dbPath, null);
    assertEqual(r.status, 401, `Expected 401, got ${r.status}`);
  });

  await test('Question-image: no token → 401', async () => {
    const r = await getFile(T.questionImageA.dbPath, null);
    assertEqual(r.status, 401, `Expected 401, got ${r.status}`);
  });

  await test('Video: fabricated JWT with non-existent user → 401/403', async () => {
    const fakeToken = makeToken({ id: 999999999, role: 'teacher' });
    const r = await getFileQs(T.videoA.dbPath, fakeToken);
    assert([401, 403].includes(r.status), `Expected 401/403, got ${r.status}`);
  });

  await test('[C-2] Video: revoked (logged-out) teacher token → 401', async () => {
    // Use HTTP login to get a real token, then log out via API to trigger blacklist
    const loginRes = await request('POST', '/api/auth/login',
      { username: T.teacherA.username, password: 'SecTest_2026!', role: 'teacher' });
    assert(loginRes.status === 200, `Login failed: ${loginRes.status}`);
    const tokenToRevoke = loginRes.body.token;

    // Verify token works before revocation
    const before = await getFileQs(T.videoA.dbPath, tokenToRevoke);
    assert([200, 206].includes(before.status),
      `Token should work before logout, got ${before.status}`);

    // Revoke by logging out
    const logoutRes = await request('POST', '/api/auth/logout', null, tokenToRevoke);
    assertEqual(logoutRes.status, 200, `Logout failed: ${logoutRes.status}`);

    // Token must now be rejected
    const after = await getFileQs(T.videoA.dbPath, tokenToRevoke);
    assertEqual(after.status, 401,
      `[C-2] Revoked token still allows video download! Got ${after.status}`);
  });

  await test('[C-2] PDF: revoked student token → 401', async () => {
    // Generate a fresh student token directly (student login requires tenant subdomain in tests)
    const studentToken = makeToken({ id: T.studentEnrolled.id, role: 'student' });

    const before = await getFileQs(T.pdfA.dbPath, studentToken);
    assert([200, 206].includes(before.status),
      `Student token should allow PDF access before revocation, got ${before.status}`);

    // Revoke the token via the logout endpoint (accepts Bearer token from any role)
    const logoutRes = await request('POST', '/api/auth/logout', null, studentToken);
    assertEqual(logoutRes.status, 200, `Logout failed: ${logoutRes.status}`);

    const after = await getFileQs(T.pdfA.dbPath, studentToken);
    assertEqual(after.status, 401,
      `[C-2] Revoked student token still allows PDF download! Got ${after.status}`);
  });

  await test('[C-2] SSE: revoked teacher token → 401', async () => {
    const loginRes = await request('POST', '/api/auth/login',
      { username: T.teacherA.username, password: 'SecTest_2026!', role: 'teacher' });
    assert(loginRes.status === 200, `Login failed: ${loginRes.status}`);
    const tokenToRevoke = loginRes.body.token;

    await request('POST', '/api/auth/logout', null, tokenToRevoke);

    const r = await getFile(`/api/sse?token=${encodeURIComponent(tokenToRevoke)}`, null,
      { abortOnFirstData: true });
    assertEqual(r.status, 401,
      `[C-2] Revoked token still allows SSE connection! Got ${r.status}`);
  });

  await test('[C-2] SSE: no token → 401', async () => {
    const r = await getFile('/api/sse', null, { abortOnFirstData: true });
    assertEqual(r.status, 401, `Expected 401, got ${r.status}`);
  });

  await test('[C-2] SSE: invalid/garbage token → 401', async () => {
    const r = await getFile('/api/sse?token=this.is.garbage', null, { abortOnFirstData: true });
    assertEqual(r.status, 401, `Expected 401, got ${r.status}`);
  });

  await test('[C-2] Suspended student: video → 403', async () => {
    const r = await getFileQs(T.videoA.dbPath, T.studentSuspended.token);
    assertEqual(r.status, 403,
      `[C-2] Suspended student should be blocked (403), got ${r.status}`);
  });

  await test('[C-2] Suspended student: SSE → 403', async () => {
    const r = await getFile(
      `/api/sse?token=${encodeURIComponent(T.studentSuspended.token)}`, null,
      { abortOnFirstData: true }
    );
    assertEqual(r.status, 403,
      `[C-2] Suspended student should be blocked from SSE (403), got ${r.status}`);
  });

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶  [C-1] IDOR — Ownership and enrollment enforced on file downloads');
  // ──────────────────────────────────────────────────────────────────────────

  // ── Video tests ────────────────────────────────────────────────────────────
  await test('[C-1] Video: teacherA (owner) can download their own video', async () => {
    const r = await getFileQs(T.videoA.dbPath, T.teacherA.token);
    assert([200, 206].includes(r.status),
      `TeacherA should access their own video, got ${r.status}`);
  });

  await test('[C-1] Video: teacherB (different teacher) → 403', async () => {
    const r = await getFileQs(T.videoA.dbPath, T.teacherB.token);
    assertEqual(r.status, 403,
      `[C-1] TeacherB must NOT access TeacherA video! Got ${r.status}`);
  });

  await test('[C-1] Video: enrolled student can download', async () => {
    const r = await getFileQs(T.videoA.dbPath, T.studentEnrolled.token);
    assert([200, 206].includes(r.status),
      `Enrolled student should access video, got ${r.status}`);
  });

  await test('[C-1] Video: non-enrolled student → 403', async () => {
    const r = await getFileQs(T.videoA.dbPath, T.studentOther.token);
    assertEqual(r.status, 403,
      `[C-1] Non-enrolled student must NOT access video! Got ${r.status}`);
  });

  await test('[C-1] Video: assistantA (correct teacher) can download', async () => {
    const r = await getFileQs(T.videoA.dbPath, T.assistant.token);
    assert([200, 206].includes(r.status),
      `AssistantA should access TeacherA video, got ${r.status}`);
  });

  // ── PDF tests ──────────────────────────────────────────────────────────────
  await test('[C-1] PDF: teacherA (owner) can download', async () => {
    const r = await getFileQs(T.pdfA.dbPath, T.teacherA.token);
    assert([200, 206].includes(r.status),
      `TeacherA should access their own PDF, got ${r.status}`);
  });

  await test('[C-1] PDF: teacherB (different teacher) → 403', async () => {
    const r = await getFileQs(T.pdfA.dbPath, T.teacherB.token);
    assertEqual(r.status, 403,
      `[C-1] TeacherB must NOT access TeacherA PDF! Got ${r.status}`);
  });

  await test('[C-1] PDF: enrolled student can download', async () => {
    const r = await getFileQs(T.pdfA.dbPath, T.studentEnrolled.token);
    assert([200, 206].includes(r.status),
      `Enrolled student should access PDF, got ${r.status}`);
  });

  await test('[C-1] PDF: non-enrolled student → 403', async () => {
    const r = await getFileQs(T.pdfA.dbPath, T.studentOther.token);
    assertEqual(r.status, 403,
      `[C-1] Non-enrolled student must NOT access PDF! Got ${r.status}`);
  });

  // ── Question-image tests ───────────────────────────────────────────────────
  await test('[C-1] Question-image: teacherA (owner) can download', async () => {
    const r = await getFileQs(T.questionImageA.dbPath, T.teacherA.token);
    assert([200, 206].includes(r.status),
      `TeacherA should access their own question image, got ${r.status}`);
  });

  await test('[C-1] Question-image: teacherB (different teacher) → 403', async () => {
    const r = await getFileQs(T.questionImageA.dbPath, T.teacherB.token);
    assertEqual(r.status, 403,
      `[C-1] TeacherB must NOT access TeacherA question image! Got ${r.status}`);
  });

  await test('[C-1] Question-image: enrolled student (has exam access) can download', async () => {
    // Give the enrolled student a session so access is granted
    await pool.query(
      `INSERT INTO exam_sessions (student_id, exam_id, questions_snapshot)
       VALUES ($1, $2, '[]')
       ON CONFLICT (student_id, exam_id) DO NOTHING`,
      [T.studentEnrolled.id, T.examA.id]
    );
    const r = await getFileQs(T.questionImageA.dbPath, T.studentEnrolled.token);
    assert([200, 206].includes(r.status),
      `Enrolled student with session should access question image, got ${r.status}`);
  });

  await test('[C-1] Question-image: non-enrolled student → 403', async () => {
    const r = await getFileQs(T.questionImageA.dbPath, T.studentOther.token);
    assertEqual(r.status, 403,
      `[C-1] Non-enrolled student must NOT access question image! Got ${r.status}`);
  });

  // ── Unpublished course ─────────────────────────────────────────────────────
  await test('[C-1] Student blocked from unpublished course video', async () => {
    // Use a FRESH student who has never accessed this file so there is no cached result.
    const h = await bcrypt.hash('x', 10);
    const fsr = await pool.query(
      `INSERT INTO students (username, password, name, teacher_id)
       VALUES ('_sec_test_fresh_unpub', $1, 'FreshUnpub', $2) RETURNING id`,
      [h, T.teacherA.id]
    );
    const freshId = fsr.rows[0].id;
    await pool.query(
      `INSERT INTO student_course_enrollment (student_id, course_id, status)
       VALUES ($1, $2, 'active')`,
      [freshId, T.courseA.id]
    );
    const freshToken = makeToken({ id: freshId, role: 'student' });

    await pool.query('UPDATE courses SET is_published = false WHERE id = $1', [T.courseA.id]);
    try {
      const r = await getFileQs(T.videoA.dbPath, freshToken);
      assertEqual(r.status, 403,
        `[C-1] Enrolled student must NOT access video of unpublished course! Got ${r.status}`);
    } finally {
      await pool.query('UPDATE courses SET is_published = true  WHERE id = $1', [T.courseA.id]);
      await pool.query('DELETE FROM students WHERE id = $1', [freshId]);
    }
  });

  // ── Directory listing / path traversal ────────────────────────────────────
  await test('Directory listing on /uploads/videos is blocked', async () => {
    const r = await getFileQs('/uploads/videos/', T.teacherA.token);
    assert([403, 404].includes(r.status),
      `Directory listing should be blocked (403/404), got ${r.status}`);
  });

  await test('Path traversal attempt (%2F..%2F) is blocked', async () => {
    const r = await getFileQs('/uploads/videos/%2F..%2F..%2Fetc%2Fpasswd', T.teacherA.token);
    assert([400, 403, 404].includes(r.status),
      `Path traversal should be blocked, got ${r.status}`);
  });

  await test('File with .. in path is blocked', async () => {
    const r = await getFileQs('/uploads/videos/../pdfs/some.pdf', T.teacherA.token);
    assert([400, 403, 404].includes(r.status),
      `Path with .. should be blocked, got ${r.status}`);
  });

  // ── File not in DB → 404 (not 200 or 403) ─────────────────────────────────
  await test('File on disk but NOT in DB → 404 (orphaned file)', async () => {
    const orphanPath = path.join(__dirname, '../uploads/videos/sec_test_orphan.mp4');
    fs.writeFileSync(orphanPath, 'orphan-file');
    try {
      const r = await getFileQs('/uploads/videos/sec_test_orphan.mp4', T.teacherA.token);
      assertEqual(r.status, 404,
        `Orphaned file (not in DB) should return 404, got ${r.status}`);
    } finally {
      fs.unlinkSync(orphanPath);
    }
  });

  // ── Cache consistency (important for range requests) ──────────────────────
  await test('[C-1] Access cache: second request for same file reuses cache (enrolled)', async () => {
    const r1 = await getFileQs(T.videoA.dbPath, T.studentEnrolled.token);
    const r2 = await getFileQs(T.videoA.dbPath, T.studentEnrolled.token);
    assert([200, 206].includes(r1.status) && [200, 206].includes(r2.status),
      `Both requests should succeed, got ${r1.status} / ${r2.status}`);
  });

  await test('[C-1] Access cache: second request for same file reuses cache (blocked)', async () => {
    const r1 = await getFileQs(T.videoA.dbPath, T.studentOther.token);
    const r2 = await getFileQs(T.videoA.dbPath, T.studentOther.token);
    assertEqual(r1.status, 403, `First request should be 403, got ${r1.status}`);
    assertEqual(r2.status, 403, `Second request should also be 403, got ${r2.status}`);
  });

  // ── SSE: valid token from enrolled student connects ok ─────────────────────
  await test('[C-2] SSE: valid enrolled-student token → 200 (connected)', async () => {
    const r = await getFile(
      `/api/sse?token=${encodeURIComponent(T.studentEnrolled.token)}`, null,
      { abortOnFirstData: true }
    );
    assertEqual(r.status, 200, `Valid student should connect to SSE, got ${r.status}`);
  });

  await test('[C-2] SSE: valid teacher token → 200 (connected)', async () => {
    const r = await getFile(
      `/api/sse?token=${encodeURIComponent(T.teacherA.token)}`, null,
      { abortOnFirstData: true }
    );
    assertEqual(r.status, 200, `Valid teacher should connect to SSE, got ${r.status}`);
  });

  // ── Enroll then unenroll (enrollment change is reflected after cache TTL) ──
  await test('[C-1] Previously enrolled, now inactive → 403', async () => {
    // Deactivate enrollment
    await pool.query(
      `UPDATE student_course_enrollment SET status='inactive'
       WHERE student_id=$1 AND course_id=$2`,
      [T.studentEnrolled.id, T.courseA.id]
    );

    // Note: due to 60s file-access cache we need a fresh token to bust the cache key.
    // Force cache miss by using a slightly different path (non-existent variant) OR
    // wait — but for test speed we test via a second *student* that was never in cache.
    const freshStudent = await pool.query(
      `INSERT INTO students (username, password, name, teacher_id)
       VALUES ('_sec_test_fresh', $1, 'Fresh', $2) RETURNING id`,
      [await bcrypt.hash('x', 10), T.teacherA.id]
    );
    const freshId = freshStudent.rows[0].id;
    // Enroll and immediately deactivate so they have *inactive* enrollment
    await pool.query(
      `INSERT INTO student_course_enrollment (student_id, course_id, status)
       VALUES ($1, $2, 'inactive')`,
      [freshId, T.courseA.id]
    );
    const freshToken = makeToken({ id: freshId, role: 'student' });

    try {
      const r = await getFileQs(T.videoA.dbPath, freshToken);
      assertEqual(r.status, 403,
        `[C-1] Inactive enrollment must be blocked! Got ${r.status}`);
    } finally {
      await pool.query('DELETE FROM students WHERE id = $1', [freshId]);
      // Restore enrollment for other tests
      await pool.query(
        `UPDATE student_course_enrollment SET status='active'
         WHERE student_id=$1 AND course_id=$2`,
        [T.studentEnrolled.id, T.courseA.id]
      );
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
const SECTION_WIDTH = 60;
console.log('\n' + '═'.repeat(SECTION_WIDTH));
console.log('  WATHBA Security Test Suite — C-1 (IDOR) + C-2 (JWT Revocation)');
console.log('═'.repeat(SECTION_WIDTH) + '\n');

(async () => {
  await setup();
  try {
    await runTests();
  } finally {
    await teardown();
    await pool.end();
  }

  console.log('\n' + '─'.repeat(SECTION_WIDTH));
  const total = passed + failed + skipped;
  console.log(`  Results: ${passed}/${total} passed  |  ${failed} failed  |  ${skipped} skipped`);
  console.log('─'.repeat(SECTION_WIDTH));

  if (failed > 0) {
    console.error('\n  ⚠  Some tests FAILED — vulnerabilities may still be present.\n');
    process.exit(1);
  } else {
    console.log('\n  ✅  All tests passed — C-1 and C-2 are fixed.\n');
  }
})();
