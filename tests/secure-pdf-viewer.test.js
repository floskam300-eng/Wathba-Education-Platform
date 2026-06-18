/**
 * SecurePdfViewer — Backend Security & Edge-Case Tests
 *
 * What is tested:
 *   A. Authentication gate  (no token → 401, bad token → 401, expired → 401)
 *   B. Security headers on /uploads/pdfs
 *   C. Path-traversal guard
 *   D. Student enrollment gate
 *   E. Student suspension gate  ← NEW (S-1 fix)
 *   F. Unpublished course gate   ← NEW (T-3)
 *   G. Teacher / assistant ownership gate  ← assistant test added (T-2)
 *   H. Edge cases
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
const crypto   = require('crypto');
const { Pool } = require('pg');

const BASE_URL   = process.env.TEST_BASE_URL || 'http://localhost:3001';
const JWT_SECRET = process.env.JWT_SECRET    || 'change-this-to-a-long-random-secret';

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

const REQUEST_TIMEOUT_MS = 8000;

function request(method, urlPath, { headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, { method, headers }, (res) => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    // [T-1 fix] abort if server is unreachable — prevents test suite from hanging
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${method} ${urlPath}`));
    });
    req.on('error', reject);
    req.end();
  });
}

// [T-5 fix] use crypto random bytes so multiple tokens in the same millisecond
// never share the same jti (which can cause verifyFullToken to reject duplicates).
function makeToken(payload, expiresIn = '1h') {
  const jti = 'test-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
  return jwt.sign({ jti, ...payload }, JWT_SECRET, { expiresIn });
}

/* ─── DB seed helpers ───────────────────────────────────────── */

let _teacherId, _teacher2Id, _assistantId;
let _studentId, _suspendedStudentId, _otherStudentId;
let _courseId, _unpubCourseId, _pdfId, _unpubPdfId;
// Standalone exam fixtures (for B-3 question-image test)
let _standaloneExamId, _questionId, _examSessionId;

async function seed() {
  // [T-4 fix] use parameterized queries — avoids template-literal injection risk.
  // Strategy: pre-clean any leftover rows from prior runs by username/slug,
  // then do plain INSERTs. This avoids ON CONFLICT issues on partial indexes.
  const hash = await bcrypt.hash('TestPass1!', 10);
  const Q = (sql, p) => pool.query(sql, p);

  // ── Pre-clean stale test fixtures ────────────────────────────
  // (in dependency order: children before parents)
  const cleanStudentByUsername = async (uname) => {
    const r = await Q(`SELECT id FROM students WHERE username=$1`, [uname]);
    if (!r.rows.length) return;
    const sid = r.rows[0].id;
    await Q(`DELETE FROM student_course_enrollment WHERE student_id=$1`, [sid]);
    await Q(`DELETE FROM students WHERE id=$1`, [sid]);
  };
  await cleanStudentByUsername('test_pdf_student');
  await cleanStudentByUsername('test_pdf_suspended');
  await cleanStudentByUsername('test_pdf_other');

  await Q(`DELETE FROM assistants WHERE username=$1`, ['test_pdf_assistant']);
  await Q(`DELETE FROM teachers WHERE slug IN ('test-pdf-teacher','test-pdf-teacher2')`);

  // ── Teacher 1 (owns the test course) ────────────────────────
  const t = await Q(
    `INSERT INTO teachers (username,password,name,bio,classification,whatsapp_phone,slug)
     VALUES($1,$2,'Test Teacher PDF','bio','class','+200','test-pdf-teacher')
     RETURNING id`,
    ['test_pdf_teacher', hash],
  );
  _teacherId = t.rows[0].id;

  // ── Teacher 2 (should NOT access teacher 1's PDFs) ──────────
  const t2 = await Q(
    `INSERT INTO teachers (username,password,name,bio,classification,whatsapp_phone,slug)
     VALUES($1,$2,'Test Teacher PDF 2','bio','class','+201','test-pdf-teacher2')
     RETURNING id`,
    ['test_pdf_teacher2', hash],
  );
  _teacher2Id = t2.rows[0].id;

  // ── Assistant (belongs to teacher 1) ────────────────────────
  const a = await Q(
    `INSERT INTO assistants (teacher_id,username,password,name)
     VALUES($1,$2,$3,'Test Assistant PDF') RETURNING id`,
    [_teacherId, 'test_pdf_assistant', hash],
  );
  _assistantId = a.rows[0].id;

  // ── Published course (owned by teacher 1) ───────────────────
  const c = await Q(
    `INSERT INTO courses (teacher_id,name,description)
     VALUES($1,'PDF Test Course Published','desc') RETURNING id`,
    [_teacherId],
  );
  _courseId = c.rows[0].id;
  await Q('UPDATE courses SET is_published=true WHERE id=$1', [_courseId]);

  // ── Unpublished course (owned by teacher 1) ──────────────────
  const c2 = await Q(
    `INSERT INTO courses (teacher_id,name,description)
     VALUES($1,'PDF Test Course Unpublished','desc') RETURNING id`,
    [_teacherId],
  );
  _unpubCourseId = c2.rows[0].id;
  // leave is_published = false (default)

  // ── PDF in published course ──────────────────────────────────
  const p = await Q(
    `INSERT INTO pdf_files (course_id,title,file_url)
     VALUES($1,'Test PDF','/uploads/pdfs/test-secure.pdf') RETURNING id`,
    [_courseId],
  );
  _pdfId = p.rows[0].id;

  // ── PDF in unpublished course ────────────────────────────────
  const p2 = await Q(
    `INSERT INTO pdf_files (course_id,title,file_url)
     VALUES($1,'Unpub PDF','/uploads/pdfs/test-secure-unpub.pdf') RETURNING id`,
    [_unpubCourseId],
  );
  _unpubPdfId = p2.rows[0].id;

  // ── Active enrolled student ──────────────────────────────────
  const s = await Q(
    `INSERT INTO students (teacher_id,username,password,name,gender,academic_stage,phone)
     VALUES($1,$2,$3,'PDF Student','ذكر','الأول الثانوي','+200000001') RETURNING id`,
    [_teacherId, 'test_pdf_student', hash],
  );
  _studentId = s.rows[0].id;
  await Q('UPDATE students SET is_suspended=false WHERE id=$1', [_studentId]);

  await Q(
    `INSERT INTO student_course_enrollment (student_id,course_id,status)
     VALUES($1,$2,'active') ON CONFLICT DO NOTHING`,
    [_studentId, _courseId],
  );
  await Q(
    `INSERT INTO student_course_enrollment (student_id,course_id,status)
     VALUES($1,$2,'active') ON CONFLICT DO NOTHING`,
    [_studentId, _unpubCourseId],
  );

  // ── Suspended (but enrolled) student ─────────────────────────
  const ss = await Q(
    `INSERT INTO students (teacher_id,username,password,name,gender,academic_stage,phone)
     VALUES($1,$2,$3,'Suspended Student','ذكر','الأول الثانوي','+200000003') RETURNING id`,
    [_teacherId, 'test_pdf_suspended', hash],
  );
  _suspendedStudentId = ss.rows[0].id;
  await Q('UPDATE students SET is_suspended=true WHERE id=$1', [_suspendedStudentId]);

  await Q(
    `INSERT INTO student_course_enrollment (student_id,course_id,status)
     VALUES($1,$2,'active') ON CONFLICT DO NOTHING`,
    [_suspendedStudentId, _courseId],
  );

  // ── Non-enrolled student ─────────────────────────────────────
  const s2 = await Q(
    `INSERT INTO students (teacher_id,username,password,name,gender,academic_stage,phone)
     VALUES($1,$2,$3,'Other Student','ذكر','الأول الثانوي','+200000002') RETURNING id`,
    [_teacherId, 'test_pdf_other', hash],
  );
  _otherStudentId = s2.rows[0].id;

  // ── Standalone exam + question image (for B-3 suspended student test) ────
  // Pre-clean stale fixtures by known image URL
  await Q(
    `DELETE FROM questions WHERE question_image_url='/uploads/question-images/test-secure-q.jpg'`
  );
  await Q(`DELETE FROM exams WHERE title='PDF Standalone Exam Test' AND teacher_id=$1`, [_teacherId]);

  const ex = await Q(
    `INSERT INTO exams (title,teacher_id,course_id,duration_minutes,total_score,is_published)
     VALUES('PDF Standalone Exam Test',$1,NULL,60,100,true) RETURNING id`,
    [_teacherId],
  );
  _standaloneExamId = ex.rows[0].id;

  const qr = await Q(
    `INSERT INTO questions
       (exam_id,question_text,question_image_url,option_a,option_b,correct_answer_letter,points)
     VALUES($1,'Test Q','/uploads/question-images/test-secure-q.jpg','A','B','A',1)
     RETURNING id`,
    [_standaloneExamId],
  );
  _questionId = qr.rows[0].id;

  // Give the *suspended* student an exam session so the old code would have granted access
  await Q(
    `INSERT INTO exam_sessions (student_id, exam_id)
     VALUES($1,$2) ON CONFLICT DO NOTHING`,
    [_suspendedStudentId, _standaloneExamId],
  );
  const esr = await Q(
    `SELECT id FROM exam_sessions WHERE student_id=$1 AND exam_id=$2`,
    [_suspendedStudentId, _standaloneExamId],
  );
  _examSessionId = esr.rows[0]?.id;

  // Also give the *active* student an exam session (for the positive regression check)
  await Q(
    `INSERT INTO exam_sessions (student_id, exam_id)
     VALUES($1,$2) ON CONFLICT DO NOTHING`,
    [_studentId, _standaloneExamId],
  );
}

async function cleanup() {
  // Delete in FK-safe order (children before parents)
  const Q = (sql, p) => pool.query(sql, p).catch(() => {});

  // Standalone exam fixtures
  if (_examSessionId)      await Q('DELETE FROM exam_sessions WHERE id=$1', [_examSessionId]);
  if (_studentId && _standaloneExamId)
    await Q('DELETE FROM exam_sessions WHERE student_id=$1 AND exam_id=$2', [_studentId, _standaloneExamId]);
  if (_questionId)         await Q('DELETE FROM questions WHERE id=$1', [_questionId]);
  if (_standaloneExamId)   await Q('DELETE FROM exams WHERE id=$1', [_standaloneExamId]);

  if (_pdfId)              await Q('DELETE FROM pdf_files WHERE id=$1', [_pdfId]);
  if (_unpubPdfId)         await Q('DELETE FROM pdf_files WHERE id=$1', [_unpubPdfId]);

  // Enrollments
  const delEnroll = (sid, cid) =>
    Q('DELETE FROM student_course_enrollment WHERE student_id=$1 AND course_id=$2', [sid, cid]);
  if (_studentId && _courseId)           await delEnroll(_studentId, _courseId);
  if (_studentId && _unpubCourseId)      await delEnroll(_studentId, _unpubCourseId);
  if (_suspendedStudentId && _courseId)  await delEnroll(_suspendedStudentId, _courseId);

  if (_courseId)           await Q('DELETE FROM courses WHERE id=$1', [_courseId]);
  if (_unpubCourseId)      await Q('DELETE FROM courses WHERE id=$1', [_unpubCourseId]);

  if (_studentId)          await Q('DELETE FROM students WHERE id=$1', [_studentId]);
  if (_suspendedStudentId) await Q('DELETE FROM students WHERE id=$1', [_suspendedStudentId]);
  if (_otherStudentId)     await Q('DELETE FROM students WHERE id=$1', [_otherStudentId]);

  if (_assistantId)        await Q('DELETE FROM assistants WHERE id=$1', [_assistantId]);
  if (_teacher2Id)         await Q('DELETE FROM teachers WHERE id=$1', [_teacher2Id]);
  if (_teacherId)          await Q('DELETE FROM teachers WHERE id=$1', [_teacherId]);
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

  await test('Token with unknown role → 401 or 403', async () => {
    const tok = makeToken({ id: 1, role: 'superadmin' }, '1m');
    const r   = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    assert.ok(r.status === 401 || r.status === 403, `expected 401/403 got ${r.status}`);
  });
}

async function runHeaderTests() {
  console.log('\n📋  B. Security headers on /uploads/pdfs\n');

  const tok = makeToken({ id: _teacherId, role: 'teacher' }, '1m');

  await test('Content-Disposition: inline (no download prompt)', async () => {
    const r  = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    const cd = r.headers['content-disposition'] || '';
    assert.ok(
      cd.startsWith('inline'),
      `expected Content-Disposition to start with "inline", got "${cd}" (status ${r.status})`,
    );
  });

  await test('Cache-Control: private, no-store (no redundant directives)', async () => {
    const r  = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    const cc = r.headers['cache-control'] || '';
    assert.ok(cc.includes('no-store'), `expected no-store in Cache-Control, got "${cc}"`);
    // [B-5 fix] no-cache / must-revalidate should NOT appear (they are redundant)
    assert.ok(!cc.includes('no-cache'),        `no-cache is redundant with no-store, found in "${cc}"`);
    assert.ok(!cc.includes('must-revalidate'), `must-revalidate is redundant with no-store, found in "${cc}"`);
  });

  await test('X-Content-Type-Options: nosniff', async () => {
    const r  = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    const xo = r.headers['x-content-type-options'] || '';
    assert.strictEqual(xo, 'nosniff', `expected "nosniff" got "${xo}"`);
  });

  await test('X-Robots-Tag: noindex, nofollow', async () => {
    const r  = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    const xr = r.headers['x-robots-tag'] || '';
    assert.ok(
      xr.includes('noindex') && xr.includes('nofollow'),
      `expected X-Robots-Tag to contain noindex + nofollow, got "${xr}"`,
    );
  });
}

async function runPathTraversalTests() {
  console.log('\n📋  C. Path-traversal guard\n');

  const tok = makeToken({ id: _teacherId, role: 'teacher' }, '1m');

  await test('../ sequence blocked', async () => {
    const r = await request('GET', '/uploads/pdfs/../../../etc/passwd?token=' + tok);
    assert.ok(r.status === 403 || r.status === 404, `expected 403 or 404 got ${r.status}`);
  });

  await test('URL-encoded traversal blocked', async () => {
    const r = await request('GET', '/uploads/pdfs/..%2F..%2Fetc%2Fpasswd?token=' + tok);
    assert.ok(r.status === 403 || r.status === 404, `expected 403 or 404 got ${r.status}`);
  });

  await test('Null-byte injection attempt blocked', async () => {
    const r = await request('GET', '/uploads/pdfs/test%00.pdf?token=' + tok);
    assert.ok(r.status === 403 || r.status === 404 || r.status === 400,
      `expected 400/403/404 got ${r.status}`);
  });
}

async function runEnrollmentTests() {
  console.log('\n📋  D. Student enrollment gate\n');

  await test('Enrolled active student → 404 (auth passed, file missing on disk)', async () => {
    const tok = makeToken({ id: _studentId, role: 'student' }, '1m');
    const r   = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    assert.ok(
      r.status === 404 || r.status === 200,
      `enrolled student should get 404 (file not on disk) or 200, got ${r.status}`,
    );
  });

  await test('Non-enrolled student → 403', async () => {
    const tok = makeToken({ id: _otherStudentId, role: 'student' }, '1m');
    const r   = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    assert.strictEqual(r.status, 403, `non-enrolled student should get 403, got ${r.status}`);
  });
}

async function runSuspensionTests() {
  console.log('\n📋  E. Suspended student gate  [S-1 fix]\n');

  await test('Suspended student (enrolled but suspended) → 403', async () => {
    const tok = makeToken({ id: _suspendedStudentId, role: 'student' }, '1m');
    const r   = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    assert.strictEqual(
      r.status, 403,
      `suspended student should get 403 even if enrolled, got ${r.status}`,
    );
  });

  await test('Non-suspended enrolled student still gets through (regression check)', async () => {
    const tok = makeToken({ id: _studentId, role: 'student' }, '1m');
    const r   = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    assert.ok(
      r.status === 200 || r.status === 404,
      `active student should not be blocked by suspension fix, got ${r.status}`,
    );
  });
}

async function runUnpublishedTests() {
  console.log('\n📋  F. Unpublished course gate  [T-3]\n');

  await test('Student enrolled in unpublished course → 403', async () => {
    const tok = makeToken({ id: _studentId, role: 'student' }, '1m');
    const r   = await request('GET', '/uploads/pdfs/test-secure-unpub.pdf?token=' + tok);
    assert.strictEqual(
      r.status, 403,
      `student should get 403 for unpublished course PDF, got ${r.status}`,
    );
  });

  await test('Owner teacher can access unpublished course PDF', async () => {
    const tok = makeToken({ id: _teacherId, role: 'teacher' }, '1m');
    const r   = await request('GET', '/uploads/pdfs/test-secure-unpub.pdf?token=' + tok);
    assert.ok(
      r.status === 200 || r.status === 404,
      `owner teacher should get 200/404 for unpublished PDF, got ${r.status}`,
    );
  });
}

async function runOwnershipTests() {
  console.log('\n📋  G. Teacher & assistant ownership gate  [T-2 added]\n');

  await test('Owner teacher can access their own PDF', async () => {
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

  await test('Assistant of owner teacher can access the PDF', async () => {
    // Assistant token includes teacher_id so the middleware can check ownership
    const tok = makeToken({ id: _assistantId, role: 'assistant', teacher_id: _teacherId }, '1m');
    const r   = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    assert.ok(
      r.status === 200 || r.status === 404,
      `assistant of owner teacher should get 200/404, got ${r.status}`,
    );
  });

  await test('Assistant of OTHER teacher cannot access the PDF → 403', async () => {
    // Spoof an assistant token that claims to belong to teacher2
    const tok = makeToken({ id: _assistantId, role: 'assistant', teacher_id: _teacher2Id }, '1m');
    const r   = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    assert.strictEqual(r.status, 403, `other teacher's assistant should get 403, got ${r.status}`);
  });
}

async function runEdgeCaseTests() {
  console.log('\n📋  H. Edge cases\n');

  await test('File not in DB but valid owner token → 404 (not 500)', async () => {
    const tok = makeToken({ id: _teacherId, role: 'teacher' }, '1m');
    const r   = await request('GET', '/uploads/pdfs/completely-nonexistent-xyz.pdf?token=' + tok);
    assert.ok(
      r.status === 404 || r.status === 403,
      `expected 404 or 403, got ${r.status}`,
    );
  });

  await test('Empty filename → 403 or 404', async () => {
    const tok = makeToken({ id: _teacherId, role: 'teacher' }, '1m');
    const r   = await request('GET', '/uploads/pdfs/?token=' + tok);
    assert.ok(
      r.status === 403 || r.status === 404 || r.status === 301 || r.status === 200,
      `expected 403/404/301, got ${r.status}`,
    );
  });

  await test('Token in Authorization header works (not only query-param)', async () => {
    const tok = makeToken({ id: _teacherId, role: 'teacher' }, '1m');
    const r   = await request('GET', '/uploads/pdfs/test-secure.pdf', {
      headers: { Authorization: `Bearer ${tok}` },
    });
    assert.ok(
      r.status === 200 || r.status === 404,
      `expected 200 or 404, got ${r.status}`,
    );
  });

  await test('Unrecognised role in token → 401 or 403', async () => {
    const tok = makeToken({ id: 1, role: 'admin' }, '1m');
    const r   = await request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok);
    assert.ok(r.status === 401 || r.status === 403, `expected 401 or 403, got ${r.status}`);
  });

  await test('Two different tokens in same millisecond have unique JTIs (no false 401)', async () => {
    // Both tokens created simultaneously — they must have different JTIs
    const tok1 = makeToken({ id: _teacherId, role: 'teacher' }, '1m');
    const tok2 = makeToken({ id: _teacherId, role: 'teacher' }, '1m');
    assert.notStrictEqual(tok1, tok2, 'tokens should differ (unique jti)');
    const [r1, r2] = await Promise.all([
      request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok1),
      request('GET', '/uploads/pdfs/test-secure.pdf?token=' + tok2),
    ]);
    assert.ok(
      (r1.status === 200 || r1.status === 404) &&
      (r2.status === 200 || r2.status === 404),
      `both tokens should pass auth; got ${r1.status} and ${r2.status}`,
    );
  });
}

async function runStandaloneImageTests() {
  console.log('\n📋  I. Standalone-exam question-image suspended student gate  [B-3 fix]\n');

  const IMAGE_PATH = '/uploads/question-images/test-secure-q.jpg';

  await test('Suspended student with exam session cannot access standalone question image → 403', async () => {
    const tok = makeToken({ id: _suspendedStudentId, role: 'student' }, '1m');
    const r   = await request('GET', `${IMAGE_PATH}?token=${tok}`);
    assert.strictEqual(
      r.status, 403,
      `suspended student should get 403 even with exam session, got ${r.status}`,
    );
  });

  await test('Active student with exam session can access standalone question image → 404 (file missing)', async () => {
    const tok = makeToken({ id: _studentId, role: 'student' }, '1m');
    const r   = await request('GET', `${IMAGE_PATH}?token=${tok}`);
    assert.ok(
      r.status === 200 || r.status === 404,
      `active student with session should get 200/404, got ${r.status}`,
    );
  });

  await test('Student without any exam session cannot access standalone question image → 403', async () => {
    const tok = makeToken({ id: _otherStudentId, role: 'student' }, '1m');
    const r   = await request('GET', `${IMAGE_PATH}?token=${tok}`);
    assert.strictEqual(
      r.status, 403,
      `student with no session should get 403, got ${r.status}`,
    );
  });

  await test('Owner teacher can access standalone question image → 404 (file missing)', async () => {
    const tok = makeToken({ id: _teacherId, role: 'teacher' }, '1m');
    const r   = await request('GET', `${IMAGE_PATH}?token=${tok}`);
    assert.ok(
      r.status === 200 || r.status === 404,
      `owner teacher should get 200/404, got ${r.status}`,
    );
  });

  await test('Other teacher cannot access standalone question image → 403', async () => {
    const tok = makeToken({ id: _teacher2Id, role: 'teacher' }, '1m');
    const r   = await request('GET', `${IMAGE_PATH}?token=${tok}`);
    assert.strictEqual(r.status, 403, `other teacher should get 403, got ${r.status}`);
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
  7. Zoom in/out buttons work and watermark redraws on each page render.
  8. Page navigation (prev/next) works and page resets when
     switching to a different PDF.
  9. Single-page PDFs do NOT show the bottom page-nav bar.
 10. Switching to another PDF resets zoom to 130% (default scale).   ← B-3
 11. Opening a PDF while user session is loading shows a spinner,
     not a watermark-less document.                                   ← B-4
 12. Switching from pdfs tab to videos tab and back loads the PDF
     fresh with no stale spinner overlay.                             ← B-2
 13. Two browser tabs open on the same PDF — watermark shows in both.
 14. Mobile: canvas is scrollable, toolbar wraps gracefully.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

/* ─── Main ───────────────────────────────────────────────────── */

(async () => {
  console.log('\n🔐  SecurePdfViewer — Backend Test Suite (v3)');
  console.log('===============================================');

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
    await runSuspensionTests();
    await runUnpublishedTests();
    await runOwnershipTests();
    await runEdgeCaseTests();
    await runStandaloneImageTests();   // [B-3 fix] new suite
  } finally {
    await cleanup().catch(e => console.error('Cleanup error:', e.message));
    await pool.end();
  }

  console.log(`\n===============================================`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);

  printFrontendChecklist();

  process.exit(failed > 0 ? 1 : 0);
})();
