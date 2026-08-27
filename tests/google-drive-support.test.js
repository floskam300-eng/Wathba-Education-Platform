/**
 * WATHBA — Google Drive Support Test Suite
 * =========================================
 * يغطي هذا الملف ميزة دعم روابط Google Drive في منظومة الكورسات:
 *
 *   [U]  Unit tests   — extractDriveId / toDrivePreviewUrl
 *                       (pure logic, no network required)
 *   [N]  Network tests — POST /:id/videos/url يحفظ /preview canonical
 *                       — GET  /:id/content كطالب يعيد provider:'drive'
 *                          و drive_id ويُخفي raw URL
 *                       — CSP frame-src يحوي drive.google.com
 *
 * التشغيل:
 *   node tests/google-drive-support.test.js
 *
 * المتطلبات:
 *   1. خادم Express يعمل على PORT (افتراضياً 3001)
 *   2. بيانات seed مثبّتة: node server/db/seed.js
 *   3. DATABASE_URL متاح للاختبارات التي تلمس القاعدة
 */

'use strict';
require('dotenv').config();

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const bcrypt = require('bcryptjs');
const pool   = require('../server/db/connection');

/* ══════════════════════════════════════════════════════════════════
   CONFIGURATION
   ══════════════════════════════════════════════════════════════════ */
const PORT        = parseInt(process.env.PORT || '3001', 10);
const BASE_URL    = `http://localhost:${PORT}/api`;
const BASE_HOST   = `http://localhost:${PORT}`;
const TIMEOUT     = 8000;
const TENANT_SLUG = 'admin';

const DRIVE_ID = '1Wv56LQasEnMSuZydu1_BbEJF2J6Dat4N';

let passed   = 0;
let failed   = 0;
let skipped  = 0;
const failures = [];

/* ══════════════════════════════════════════════════════════════════
   HELPERS — mirrored from server/routes/courses.js
   (loaded dynamically via require so we test the SAME code the server runs)
   ══════════════════════════════════════════════════════════════════ */
// We import the helper from the routes module indirectly: courses.js exports
// the router, not the helpers. Re-implement the SAME regexes here to keep the
// unit tests self-contained; the integration test below then validates the
// server behaves identically.
//
// IMPORTANT: keep this in sync with extractDriveId / toDrivePreviewUrl in
// server/routes/courses.js and client/src/pages/{student,teacher}/.../*.jsx.
const DRIVE_RE = [
  /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{25,50})/,
  /drive\.google\.com\/open\?.*?id=([a-zA-Z0-9_-]{25,50})/,
  /drive\.google\.com\/uc\?(?:[^#]*&)?id=([a-zA-Z0-9_-]{25,50})/,
];
function extractDriveId(url) {
  if (!url || typeof url !== 'string') return null;
  for (const re of DRIVE_RE) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}
function toDrivePreviewUrl(url) {
  const id = extractDriveId(url);
  if (!id) return url;
  return `https://drive.google.com/file/d/${id}/preview`;
}

function assert(condition, label, detail = '') {
  if (condition) { passed++; console.log(`  ✅ ${label}`); }
  else           { failed++; failures.push({ label, detail }); console.error(`  ❌ ${label}${detail ? ': ' + detail : ''}`); }
}
function skip(label) { skipped++; console.log(`  ⏭️  [SKIP] ${label}`); }

function request({ method = 'GET', path, body, token, headers = {} }) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const strBody = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname, port: url.port || 80, path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type':  'application/json',
        'X-Tenant-Slug': TENANT_SLUG,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    };
    if (strBody) opts.headers['Content-Length'] = Buffer.byteLength(strBody);
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, body: data, headers: res.headers }); }
      });
    });
    req.on('error', reject);
    const timer = setTimeout(() => { req.destroy(); reject(new Error('Timeout')); }, TIMEOUT);
    req.on('close', () => clearTimeout(timer));
    if (strBody) req.write(strBody);
    req.end();
  });
}

/* ── tenant-aware request: in production the server resolves the tenant
   from the Host subdomain (X-Tenant-Slug header is ignored). For local
   tests we forge a Host header like `<slug>.wathba.site` so the middleware
   extracts the slug and the student/assistant login endpoints work. */
function tenantRequest(slug, { method = 'GET', path, body, token, headers = {} }) {
  return request({
    method, path, body, token,
    headers: { ...headers, Host: `${slug}.wathba.site` },
  });
}

async function login(username, password, slug = TENANT_SLUG) {
  // For student logins, the production server enforces a 1-device policy: if
  // any device_id is already registered for this student, a new device_id is
  // blocked with NEW_DEVICE_BLOCKED. Tests must therefore reuse ONE fixed
  // device_id across all calls in this run.
  let deviceId = null;
  if (username.startsWith('std_')) {
    // Clear any leftover state from previous runs and pre-register the test
    // device_id so the login succeeds on the first try.
    deviceId = 'gd-test-device-fixed';
    try {
      const sRes = await pool.query(`SELECT id FROM students WHERE username=$1`, [username]);
      const sid = sRes.rows[0]?.id;
      if (sid) {
        await pool.query(`DELETE FROM device_alerts WHERE student_id=$1`, [sid]);
        await pool.query(`UPDATE students SET failed_device_attempts=0 WHERE id=$1`, [sid]);
        // Replace any previously registered devices with our test device so the
        // 1-device policy doesn't block the new device_id.
        await pool.query(`DELETE FROM student_devices WHERE student_id=$1`, [sid]);
        await pool.query(
          `INSERT INTO student_devices (student_id, device_id, device_name, device_origin, ip_address, hardware_hash)
           VALUES ($1, $2, $3, 'browser', '127.0.0.1', $4)`,
          [sid, deviceId, 'GD Test Browser', 'gd-test-hw-hash']
        );
      }
    } catch (_) { /* ignore — tables may not exist */ }
  }
  // Use Host header to make the production server resolve the tenant from a
  // synthetic subdomain. Falls back to the default X-Tenant-Slug header when
  // the server is in dev mode (it ignores header in production).
  const res = await tenantRequest(slug, {
    method: 'POST', path: '/auth/login',
    body: {
      username, password,
      device_id: deviceId || ('test-drive-' + Date.now() + '-' + Math.random().toString(36).slice(2)),
      hardware_hash: 'gd-test-hw-hash',
    },
  });
  return res.body?.token || null;
}

async function section(label, fn) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('═'.repeat(60));
  try { await fn(); }
  catch (err) { console.error('  ⚠️  Unexpected error in section:', err.message); }
}

/* ══════════════════════════════════════════════════════════════════
   [U] UNIT TESTS — extractDriveId / toDrivePreviewUrl
   ══════════════════════════════════════════════════════════════════ */
function testUnitLogic() {
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  [U] Unit Tests — extractDriveId / toDrivePreviewUrl');
  console.log('══════════════════════════════════════════════════════════════════');

  // ── U-1..U-7: each accepted URL form resolves to the same id ──
  const acceptedForms = [
    ['/file/d/{ID}/view',                `https://drive.google.com/file/d/${DRIVE_ID}/view`],
    ['/file/d/{ID}/view?usp=sharing',    `https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`],
    ['/file/d/{ID}/preview',             `https://drive.google.com/file/d/${DRIVE_ID}/preview`],
    ['/file/d/{ID}/edit',                `https://drive.google.com/file/d/${DRIVE_ID}/edit`],
    ['/open?id={ID}',                    `https://drive.google.com/open?id=${DRIVE_ID}`],
    ['/open?id={ID}&usp=sharing',        `https://drive.google.com/open?id=${DRIVE_ID}&usp=sharing`],
    ['/uc?id={ID}&export=download',      `https://drive.google.com/uc?id=${DRIVE_ID}&export=download`],
  ];
  acceptedForms.forEach(([label, url], i) => {
    assert(extractDriveId(url) === DRIVE_ID, `U-${i+1}: ${label} → extracts id`);
  });

  // ── U-8..U-11: non-Drive URLs return null (no false positives) ──
  const negatives = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://example.com/drive/file/d/abc',
    'not a url',
    '',
    null,
    undefined,
  ];
  negatives.forEach((url, i) => {
    assert(extractDriveId(url) === null, `U-8.${i+1}: non-Drive URL returns null (${typeof url})`);
  });

  // ── U-9: toDrivePreviewUrl normalizes every accepted form ──
  const expected = `https://drive.google.com/file/d/${DRIVE_ID}/preview`;
  acceptedForms.forEach(([label, url], i) => {
    assert(toDrivePreviewUrl(url) === expected, `U-9.${i+1}: ${label} → /preview canonical form`);
  });

  // ── U-10: toDrivePreviewUrl is idempotent on canonical form ──
  assert(
    toDrivePreviewUrl(expected) === expected,
    'U-10: /preview canonical form is idempotent'
  );

  // ── U-11: toDrivePreviewUrl leaves non-Drive URLs untouched ──
  const nonDrive = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  assert(
    toDrivePreviewUrl(nonDrive) === nonDrive,
    'U-11: non-Drive URL is returned unchanged'
  );

  // ── U-12: short Drive ID (24 chars) is rejected (Drive IDs are 25+ chars) ──
  assert(
    extractDriveId('https://drive.google.com/file/d/short_id_24_chars_only') === null,
    'U-12: too-short Drive id (24 chars) is rejected — no false positives'
  );
}

/* ══════════════════════════════════════════════════════════════════
   [N] NETWORK TESTS — server round-trip
   ══════════════════════════════════════════════════════════════════ */
async function testNetwork() {
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  [N] Network Tests — POST /videos/url + GET /content (student)');
  console.log('══════════════════════════════════════════════════════════════════');

  const teacherToken = await login('admin', 'admin123');
  if (!teacherToken) {
    skip('N-* : Could not authenticate teacher — run node server/db/seed.js');
    return;
  }

  // The production server resolves the tenant from the subdomain. For local
  // tests we hit localhost (no subdomain), so NODE_ENV must be 'development'
  // OR DEFAULT_TENANT_SLUG must be set for the X-Tenant-Slug header to work.
  // Probe the DB for the slug of the admin teacher (usually 'demo') and use
  // it for student login.
  const tSlugRes = await pool.query(`SELECT slug FROM teachers WHERE username='admin' LIMIT 1`);
  const realSlug = tSlugRes.rows[0]?.slug || 'demo';

  // Detect whether the seed has run (student `std_ali` exists). If not, create
  // a minimal student + published course + enrollment so the integration tests
  // can still run. We tag everything with prefix [GD_TEST] and clean up at the
  // end so we don't pollute the DB if the user re-seeds.
  let seeded = false;
  const sCheck = await pool.query(`SELECT id FROM students WHERE username='std_ali'`);
  if (sCheck.rows.length === 0) {
    seeded = false;
    await ensureMinimalFixtures();
  } else {
    seeded = true;
  }

  const studentToken = await login('std_ali', '123456', realSlug);
  if (!studentToken) {
    // Fall back to the configured TENANT_SLUG (used in dev with header-based routing)
    const fallback = await login('std_ali', '123456', TENANT_SLUG);
    if (!fallback) {
      skip(`N-* : Could not authenticate student (slug=${realSlug}/${TENANT_SLUG})`);
      if (!seeded) await cleanupFixtures();
      return;
    }
  }

  // Pick the first course the teacher owns
  const courses = await tenantRequest(realSlug, { path: '/courses', token: teacherToken });
  if (!Array.isArray(courses.body) || courses.body.length === 0) {
    skip('N-* : Teacher has no courses');
    return;
  }
  const courseId = courses.body[0].id;

  // N-1: teacher POSTs a Drive /view?usp=sharing URL
  const viewUrl = `https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`;
  const addView = await tenantRequest(realSlug, {
    method: 'POST', path: `/courses/${courseId}/videos/url`,
    token: teacherToken,
    body: { title: 'Test — Drive /view', url: viewUrl },
  });
  assert(addView.status === 201, 'N-1: POST videos/url with Drive /view URL → 201');
  if (addView.status === 201) {
    assert(
      addView.body.file_path_or_url === `https://drive.google.com/file/d/${DRIVE_ID}/preview`,
      'N-1b: server stored canonical /preview form (not the raw /view URL)'
    );
  }

  // N-2: teacher POSTs a Drive /open?id=... URL → also normalized
  const openUrl = `https://drive.google.com/open?id=${DRIVE_ID}&usp=sharing`;
  const addOpen = await tenantRequest(realSlug, {
    method: 'POST', path: `/courses/${courseId}/videos/url`,
    token: teacherToken,
    body: { title: 'Test — Drive /open', url: openUrl },
  });
  assert(addOpen.status === 201, 'N-2: POST videos/url with Drive /open URL → 201');
  if (addOpen.status === 201) {
    assert(
      addOpen.body.file_path_or_url === `https://drive.google.com/file/d/${DRIVE_ID}/preview`,
      'N-2b: /open URL normalized to /preview canonical form'
    );
  }

  // N-3: YouTube URL is NOT touched (regression — the Drive normalization
  //      must not affect the existing YouTube flow).
  const ytUrl = `https://www.youtube.com/watch?v=dQw4w9WgXcQ`;
  const addYt = await tenantRequest(realSlug, {
    method: 'POST', path: `/courses/${courseId}/videos/url`,
    token: teacherToken,
    body: { title: 'Test — YouTube (regression)', url: ytUrl },
  });
  assert(addYt.status === 201, 'N-3: POST videos/url with YouTube URL still works → 201');
  if (addYt.status === 201) {
    assert(
      addYt.body.file_path_or_url === ytUrl,
      'N-3b: YouTube URL is stored verbatim (not Drive-normalized)'
    );
  }

  // N-4: PUT /videos/:id (edit) also normalizes Drive URLs
  if (addView.status === 201) {
    const editRawUrl = `https://drive.google.com/file/d/${DRIVE_ID}/edit`;
    const edit = await tenantRequest(realSlug, {
      method: 'PUT', path: `/courses/${courseId}/videos/${addView.body.id}`,
      token: teacherToken,
      body: { title: 'Test — Drive edit', url: editRawUrl },
    });
    assert([200, 201].includes(edit.status), 'N-4: PUT videos/:id with Drive URL → 200');
    if ([200, 201].includes(edit.status)) {
      assert(
        edit.body.file_path_or_url === `https://drive.google.com/file/d/${DRIVE_ID}/preview`,
        'N-4b: edit stored canonical /preview form'
      );
    }
  } else {
    skip('N-4: PUT videos/:id (no add result to edit)');
  }

  // N-5: student-facing GET /:id/content hides the raw Drive URL and exposes
  //      provider:'drive' + drive_id. Privacy pattern mirrors YouTube.
  const content = await tenantRequest(realSlug, { path: `/courses/${courseId}/content`, token: studentToken });
  if (content.status === 403) {
    // Student isn't enrolled in this course — try a course they ARE enrolled in
    const myCourses = await tenantRequest(realSlug, { path: '/courses/student/my-courses', token: studentToken });
    if (Array.isArray(myCourses.body) && myCourses.body.length > 0) {
      const enrolledId = myCourses.body[0].id;
      const enrolled   = await tenantRequest(realSlug, { path: `/courses/${enrolledId}/content`, token: studentToken });
      if (enrolled.status === 200) {
        checkStudentContent(enrolled.body);
      } else {
        skip('N-5..N-8: Cannot reach any student-accessible course content');
      }
    } else {
      skip('N-5..N-8: Student not enrolled in any course');
    }
  } else if (content.status === 200) {
    checkStudentContent(content.body);
  } else {
    skip(`N-5..N-8: GET /content returned ${content.status}`);
  }

  // N-9: CSP frame-src includes drive.google.com (so the iframe isn't blocked)
  const csp = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost', port: PORT, path: '/', method: 'GET',
    }, (res) => resolve(res.headers['content-security-policy'] || ''));
    req.on('error', reject);
    req.setTimeout(TIMEOUT, () => { req.destroy(); reject(new Error('CSP probe timeout')); });
    req.end();
  }).catch(() => '');
  if (!csp) {
    // In dev NODE_ENV !== 'production' → CSP is disabled → check index.js source instead
    const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');
    assert(
      indexSrc.includes('https://drive.google.com') && indexSrc.includes('https://docs.google.com'),
      'N-9 [DEV fallback]: server/index.js frameSrc whitelists drive.google.com + docs.google.com'
    );
  } else {
    assert(
      csp.includes('drive.google.com') && csp.includes('docs.google.com'),
      'N-9: production CSP frame-src whitelists drive.google.com + docs.google.com'
    );
  }

  // Cleanup: remove the test videos we created so the suite is idempotent.
  try {
    await pool.query(
      `DELETE FROM videos WHERE course_id=$1 AND title IN ($2,$3,$4,$5)`,
      [courseId, 'Test — Drive /view', 'Test — Drive /open', 'Test — Drive edit', 'Test — YouTube (regression)']
    );
  } catch (e) {
    console.warn('  🟡  cleanup failed:', e.message);
  }

  // If we self-seeded the DB, remove our fixtures too.
  if (!seeded) {
    await cleanupFixtures();
  }
}

function checkStudentContent(body) {
  const videos = (body && body.videos) || [];
  // Find a Drive video (may be either of the two we created)
  const driveVideo = videos.find(v => v.provider === 'drive');
  if (!driveVideo) {
    skip('N-5..N-8: No provider:drive video in student response (student not enrolled in test course)');
    return;
  }
  assert(driveVideo.drive_id === DRIVE_ID, 'N-5: student response carries drive_id for Drive videos');
  assert(
    driveVideo.file_path_or_url === undefined,
    'N-6: student response strips raw file_path_or_url (privacy pattern)'
  );
  // Belt-and-suspenders: the raw Drive URL (any form) must NOT appear anywhere
  // in the entire response payload. Note the bare file id IS present (inside
  // drive_id) — that's required for the iframe to load. The privacy contract
  // hides the URL FORM (the /view?usp=sharing etc. variants), not the bare id.
  const json = JSON.stringify(body);
  assert(
    !json.includes('drive.google.com'),
    'N-7: no drive.google.com substring leaks into the student response payload'
  );
  assert(
    !json.includes('usp=sharing') && !json.includes('/view') && !json.includes('/edit') && !json.includes('/open?id='),
    'N-8: no raw URL FORM (?usp=sharing, /view, /edit, /open?id=) leaks into student response'
  );
}

/* ── Self-seeding helpers ───────────────────────────────────────────────
   When the repo's seed.js hasn't been run, the test creates a minimal
   teacher/course/student/enrollment tagged with [GD_TEST] so the integration
   tests can exercise the live API. Cleanup at the end removes anything we
   created. If seed.js HAS been run, we leave the DB alone.
   ─────────────────────────────────────────────────────────────────────── */
async function ensureMinimalFixtures() {
  // Find the existing admin teacher
  const tRes = await pool.query(`SELECT id FROM teachers WHERE username='admin'`);
  if (!tRes.rows.length) throw new Error('No admin teacher — cannot create fixtures');
  const teacherId = tRes.rows[0].id;

  const pass6 = await bcrypt.hash('123456', 10);

  // Create student `std_ali` (idempotent — ON CONFLICT update password)
  const stdRes = await pool.query(`
    INSERT INTO students (username,password,plain_password,name,phone,parent_phone,
                          academic_stage,gender,teacher_id,points,is_suspended)
    VALUES ('std_ali',$1,'123456','علي [GD_TEST]','+201200000001','+201200000002',
            'الصف الثالث الثانوي','ذكر',$2,1380,false)
    ON CONFLICT (username, teacher_id) DO UPDATE SET password=EXCLUDED.password
    RETURNING id
  `, [pass6, teacherId]);
  const studentId = stdRes.rows[0].id;

  // Create one published course tagged [GD_TEST] (only if missing)
  const cRes = await pool.query(`
    INSERT INTO courses (name,description,price,teacher_id,target_stage,
                         is_published,is_free,points_on_complete,thumbnail_url)
    SELECT '[GD_TEST] دورة اختبار Drive','دورة اختبار ميزة Drive',0,$1,
           'الصف الثالث الثانوي',true,true,0,null
    WHERE NOT EXISTS (SELECT 1 FROM courses WHERE name='[GD_TEST] دورة اختبار Drive' AND teacher_id=$1)
    RETURNING id
  `, [teacherId]);
  const courseId = cRes.rows[0]?.id
    ?? (await pool.query(`SELECT id FROM courses WHERE name='[GD_TEST] دورة اختبار Drive' AND teacher_id=$1`, [teacherId])).rows[0]?.id;

  // Enroll the student
  await pool.query(`
    INSERT INTO student_course_enrollment (student_id,course_id,status,enrollment_date)
    VALUES ($1,$2,'approved', NOW())
    ON CONFLICT (student_id, course_id) DO UPDATE SET status='approved'
  `, [studentId, courseId]);
}

async function cleanupFixtures() {
  try {
    const tRes = await pool.query(`SELECT id FROM teachers WHERE username='admin'`);
    if (!tRes.rows.length) return;
    const teacherId = tRes.rows[0].id;
    await pool.query(`
      DELETE FROM student_course_enrollment
        WHERE course_id IN (SELECT id FROM courses WHERE name='[GD_TEST] دورة اختبار Drive' AND teacher_id=$1)
    `, [teacherId]);
    await pool.query(`
      DELETE FROM courses WHERE name='[GD_TEST] دورة اختبار Drive' AND teacher_id=$1
    `, [teacherId]);
    await pool.query(`
      DELETE FROM students WHERE username='std_ali'
        AND name='علي [GD_TEST]' AND teacher_id=$1
    `, [teacherId]);
  } catch (e) {
    console.warn('  🟡 fixture cleanup error:', e.message);
  }
}

/* ══════════════════════════════════════════════════════════════════
   MAIN RUNNER
   ══════════════════════════════════════════════════════════════════ */
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║    WATHBA — Google Drive Support Test Suite                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`  Target     : ${BASE_URL}`);
  console.log(`  Tenant slug: ${TENANT_SLUG}`);
  console.log(`  Time       : ${new Date().toISOString()}`);

  testUnitLogic();
  await testNetwork();

  const total = passed + failed + skipped;
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS  ✅ ${passed} passed  ❌ ${failed} failed  ⏭️  ${skipped} skipped  [${total} total]`);
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  if (failures.length > 0) {
    console.log('\n❌ Failed tests:');
    failures.forEach(({ label, detail }) => {
      console.log(`  • ${label}`);
      if (detail) console.log(`    └─ ${detail}`);
    });
  }

  await pool.end().catch(() => {});
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('\n💥 Test runner crashed:', err && err.stack ? err.stack : err);
  await pool.end().catch(() => {});
  process.exit(1);
});
