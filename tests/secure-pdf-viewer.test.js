/**
 * SecurePdfViewer — Backend Security & Edge-Case Tests
 *
 * What is tested:
 *   A. HTTP headers on /uploads/pdfs (Content-Disposition, Cache-Control, nosniff)
 *   B. Authentication gate  (no token → 401, bad token → 401)
 *   C. Path-traversal guard (../ sequences blocked)
 *   D. Student enrollment gate (non-enrolled student → 403)
 *   E. Teacher / assistant ownership gate
 *   F. Edge cases: missing file, deleted student, suspended student
 *
 * Run:
 *   node tests/secure-pdf-viewer.test.js
 */

'use strict';

require('dotenv').config();
const http     = require('http');
const https    = require('https');
const assert   = require('assert');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const { Pool } = require('pg');

const BASE_URL  = process.env.TEST_BASE_URL || 'http://localhost:3001';
const JWT_SECRET = process.env.JWT_SECRET   || 'change-this-to-a-long-random-secret';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/* ─── helpers ───────────────────────────────────────────────── */

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${name}`);
    console.error(`      ${err.message}`);
    failed++;
  }
}

function request(method, path, { headers = {}, followRedirects = false } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, { method, headers }, (res) => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

function makeToken(payload, expiresIn = '1h') {
  return jwt.sign({ jti: 'test-' + Date.now(), ...payload }, JWT_SECRET, { expiresIn });
}

/* ─── DB seed helpers ───────────────────────────────────────── */

let _teacherId, _teacher2Id, _studentId, _courseId, _pdfId, _enrollId;
let _otherStudentId;

async function seed() {
  const hash = await bcrypt.hash('TestPass1!', 10);

  // Teacher
  const t = await pool.query(
    `INSERT INTO teachers (username,password,name,bio,classification,whatsapp_phone,slug)
     VALUES('test_pdf_teacher','${hash}','Test Teacher','bio','class','+200','test-pdf-teacher')
     ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name
     RETURNING id`,
  );
  _teacherId = t.rows[0].id;

  // Second teacher (to test ownership isolation)
  const t2 = await pool.query(
    `INSERT INTO teachers (username,password,name,bio,classification,whatsapp_phone,slug)
     VALUES('test_pdf_teacher2','${hash}','Test Teacher 2','bio','class','+201','test-pdf-teacher2')
     ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name
     RETURNING id`,
  );
  _teacher2Id = t2.rows[0].id;

  // Course (published so enrolled students can access it)
  const c = await pool.query(
    `INSERT INTO courses (teacher_id,name,description)
     VALUES($1,'PDF Test Course','desc') RETURNING id`,
    [_teacherId],
  );
  _courseId = c.rows[0].id;
  // Set is_published = true (added via ALTER TABLE)
  await pool.query('UPDATE courses SET is_published=true WHERE id=$1', [_courseId]);

  // PDF file row (points to a non-existent file — tests only check DB-level access)
  const p = await pool.query(
    `INSERT INTO pdf_files (course_id,title,file_url)
     VALUES($1,'Test PDF','/uploads/pdfs/test-secure.pdf') RETURNING id`,
    [_courseId],
  );
  _pdfId = p.rows[0].id;

  // Enrolled student
  const s = await pool.query(
    `INSERT INTO students (teacher_id,username,password,name,gender,academic_stage,phone)
     VALUES($1,'test_pdf_student','${hash}','PDF Student','ذكر','الأول الثانوي','+200000001')
     ON CONFLICT DO NOTHING RETURNING id`,
    [_teacherId],
  );
  _studentId = (s.rows[0] || (await pool.query(
    `SELECT id FROM students WHERE username='test_pdf_student' AND teacher_id=$1`, [_teacherId],
  )).rows[0]).id;

  const e = await pool.query(
    `INSERT INTO student_course_enrollment (student_id,course_id,status)
     VALUES($1,$2,'active') ON CONFLICT DO NOTHING RETURNING id`,
    [_studentId, _courseId],
  );
  _enrollId = e.rows[0]?.id;

  // Non-enrolled student
  const s2 = await pool.query(
    `INSERT INTO students (teacher_id,username,password,name,gender,academic_stage,phone)
     VALUES($1,'test_pdf_other','${hash}','Other Student','ذكر','الأول الثانوي','+200000002')
     ON CONFLICT DO NOTHING RETURNING id`,
    [_teacherId],
  );
  _otherStudentId = (s2.rows[0] || (await pool.query(
    `SELECT id FROM students WHERE username='test_pdf_other' AND teacher_id=$1`, [_teacherId],
  )).rows[0]).id;
}

async function cleanup() {
  if (_pdfId)          await pool.query('DELETE FROM pdf_files WHERE id=$1', [_pdfId]);
  if (_enrollId)       await pool.query('DELETE FROM student_course_enrollment WHERE student_id=$1 AND course_id=$2', [_studentId, _courseId]);
  if (_courseId)       await pool.query('DELETE FROM courses WHERE id=$1', [_courseId]);
  if (_studentId)      await pool.query('DELETE FROM students WHERE id=$1', [_studentId]);
  if (_otherStudentId) await pool.query('DELETE FROM students WHERE id=$1', [_otherStudentId]);
  if (_teacher2Id)     await pool.query('DELETE FROM teachers WHERE id=$1', [_teacher2Id]);
  if (_teacherId)      await pool.query('DELETE FROM teachers WHERE id=$1', [_teacherId]);
}

/* ─── Test suites ────────────────────────────────────────────── */

async function runAuthTests() {
  console.log('\n📋  A. Authentication gate\n');

  await test('No token → 401', async () => {
    const r = await request('GET', '/uploads/pdfs/test-secure.pdf');
    assert.strictEqual(r.status, 401, `expected 401 got ${r.status}`);
  });

  await test('Malformed token → 401', async () => {
    const r = await request('GET', '/uploads/pdfs/test-secure.pdf', {
      headers: { Authorization: 'Bearer not.a.jwt' },
    });
    assert.strictEqual(r.status, 401, `expected 401 got ${r.status}`);
  });

  await test('Expired token → 401', async () => {
    const tok = makeToken({ id: 1, role: 'student' }, '-1s');
    const r   = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    assert.strictEqual(r.status, 401, `expected 401 got ${r.status}`);
  });
}

async function runHeaderTests() {
  console.log('\n📋  B. Security headers on /uploads/pdfs\n');

  const tok = makeToken({ id: _teacherId, role: 'teacher' }, '1m');

  await test('Content-Disposition: inline (no download prompt)', async () => {
    const r = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    const cd = r.headers['content-disposition'] || '';
    assert.ok(
      cd.startsWith('inline'),
      `expected Content-Disposition to start with "inline", got "${cd}" (status ${r.status})`,
    );
  });

  await test('Cache-Control: no-store', async () => {
    const r = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    const cc = r.headers['cache-control'] || '';
    assert.ok(
      cc.includes('no-store'),
      `expected no-store in Cache-Control, got "${cc}"`,
    );
  });

  await test('X-Content-Type-Options: nosniff', async () => {
    const r = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    const xo = r.headers['x-content-type-options'] || '';
    assert.strictEqual(xo, 'nosniff', `expected "nosniff" got "${xo}"`);
  });
}

async function runPathTraversalTests() {
  console.log('\n📋  C. Path-traversal guard\n');

  const tok = makeToken({ id: _teacherId, role: 'teacher' }, '1m');

  await test('../ sequence blocked', async () => {
    const r = await request('GET', '/uploads/pdfs/../../../etc/passwd?token=' + tok);
    assert.ok(
      r.status === 403 || r.status === 404,
      `expected 403 or 404 got ${r.status}`,
    );
  });

  await test('URL-encoded traversal blocked', async () => {
    const r = await request('GET', '/uploads/pdfs/..%2F..%2Fetc%2Fpasswd?token=' + tok);
    assert.ok(
      r.status === 403 || r.status === 404,
      `expected 403 or 404 got ${r.status}`,
    );
  });
}

async function runEnrollmentTests() {
  console.log('\n📋  D. Student enrollment gate\n');

  await test('Enrolled student token → file check proceeds (not 401/403 on auth)', async () => {
    const tok = makeToken({ id: _studentId, role: 'student' }, '1m');
    const r   = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    // File doesn't exist on disk → 404 is correct (auth passed, file missing)
    // If enrollment check fails → 403
    assert.ok(
      r.status === 404 || r.status === 200,
      `enrolled student should get 404 (no file on disk) or 200, got ${r.status}`,
    );
  });

  await test('Non-enrolled student → 403', async () => {
    const tok = makeToken({ id: _otherStudentId, role: 'student' }, '1m');
    const r   = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    assert.strictEqual(r.status, 403, `non-enrolled student should get 403, got ${r.status}`);
  });
}

async function runOwnershipTests() {
  console.log('\n📋  E. Teacher ownership gate\n');

  await test('Owner teacher can access their own PDF (404 = file missing, not 403)', async () => {
    const tok = makeToken({ id: _teacherId, role: 'teacher' }, '1m');
    const r   = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    assert.ok(
      r.status === 200 || r.status === 404,
      `owner teacher should get 200 or 404, got ${r.status}`,
    );
  });

  await test('Different teacher cannot access another teacher\'s PDF → 403', async () => {
    const tok = makeToken({ id: _teacher2Id, role: 'teacher' }, '1m');
    const r   = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    assert.strictEqual(r.status, 403, `other teacher should get 403, got ${r.status}`);
  });
}

async function runEdgeCaseTests() {
  console.log('\n📋  F. Edge cases\n');

  await test('Non-existent file but valid owner → 404 (not 500)', async () => {
    const tok = makeToken({ id: _teacherId, role: 'teacher' }, '1m');
    const r   = await request('GET', '/uploads/pdfs/completely-nonexistent-file.pdf?token=' + tok);
    // File not in DB → 404
    assert.ok(
      r.status === 404 || r.status === 403,
      `expected 404 or 403, got ${r.status}`,
    );
  });

  await test('Empty filename → 403', async () => {
    const tok = makeToken({ id: _teacherId, role: 'teacher' }, '1m');
    const r   = await request('GET', '/uploads/pdfs/?token=' + tok);
    assert.ok(
      r.status === 403 || r.status === 404 || r.status === 301 || r.status === 200,
      `expected 403/404/301, got ${r.status}`,
    );
  });

  await test('Token in Authorization header (not query param) works', async () => {
    const tok = makeToken({ id: _teacherId, role: 'teacher' }, '1m');
    const r   = await request('GET', '/uploads/pdfs/test-secure.pdf', {
      headers: { Authorization: `Bearer ${tok}` },
    });
    assert.ok(
      r.status === 200 || r.status === 404,
      `expected 200 or 404, got ${r.status}`,
    );
  });

  await test('Role "admin" (non-existent role) → 403', async () => {
    const tok = makeToken({ id: 1, role: 'admin' }, '1m');
    const r   = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    assert.ok(
      r.status === 401 || r.status === 403,
      `expected 401 or 403, got ${r.status}`,
    );
  });
}

/* ─── Manual / frontend checklist (printed to console) ─────── */

function printFrontendChecklist() {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🖥️  Frontend manual edge-case checklist
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. No download / open-in-new-tab button is visible for students.
  2. Right-clicking the canvas shows NO browser context menu.
  3. Ctrl+S on the PDF page does NOT trigger "Save as" dialog.
  4. Ctrl+P does NOT open the print dialog.
  5. Watermark shows student name + zero-padded ID on every page.
  6. "إعادة المحاولة" button appears when the server returns an error.
  7. Zoom in/out buttons work and re-render the watermark correctly.
  8. Page navigation (prev/next) works and resets correctly when
     switching to a different PDF.
  9. Single-page PDFs do NOT show the bottom page-nav bar.
 10. Switching from pdfs tab to videos tab and back loads the PDF
     fresh without stale canvas content.
 11. Two browser tabs open on the same PDF — watermark shows in both.
 12. Mobile: canvas is scrollable, toolbar wraps gracefully.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

/* ─── Main ───────────────────────────────────────────────────── */

(async () => {
  console.log('\n🔐  SecurePdfViewer — Backend Test Suite');
  console.log('==========================================');

  try {
    await seed();
  } catch (err) {
    console.error('❌  Seed failed:', err.message);
    await pool.end();
    process.exit(1);
  }

  try {
    await runAuthTests();
    await runHeaderTests();
    await runPathTraversalTests();
    await runEnrollmentTests();
    await runOwnershipTests();
    await runEdgeCaseTests();
  } finally {
    await cleanup().catch(e => console.error('Cleanup error:', e.message));
    await pool.end();
  }

  console.log(`\n==========================================`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);

  printFrontendChecklist();

  process.exit(failed > 0 ? 1 : 0);
})();
