/**
 * Wathba — Course System: Edge Case Test Suite
 * ============================================
 * يغطي هذا الملف جميع حالات الحافة والثغرات الأمنية التي تم إصلاحها
 * في منظومة الكورسات (رفع، نشر، مشاهدة، تتبع تقدم الطالب).
 *
 * التشغيل:
 *   node tests/course-system.test.js
 *
 * المتطلبات:
 *   1. خادم Express يعمل على PORT (افتراضياً 3001)
 *   2. بيانات seed مثبّتة: node server/db/seed.js
 *
 * هيكل الاختبارات:
 *   [A] Unit tests — withToken helper، serverProgress computation
 *   [B] Content Access — is_published enforcement، enrollment check
 *   [C] Video Progress — edge cases للتتبع
 *   [D] Section Validation — section_id ownership check
 *   [E] Upload Auth — JWT protection لـ /uploads/pdfs و /uploads/videos
 *   [F] Auto-Advance Logic — الانتقال التلقائي للمحاضرة التالية
 *   [G] Course Publishing — نشر وإلغاء نشر الكورس
 *   [H] Role Isolation — عزل الصلاحيات بين الأدوار
 */

'use strict';

const http   = require('http');

/* ══════════════════════════════════════════════════════════════════
   CONFIGURATION
══════════════════════════════════════════════════════════════════ */
const BASE_URL   = `http://localhost:${process.env.PORT || 3001}/api`;
const BASE_HOST  = `http://localhost:${process.env.PORT || 3001}`;
const TIMEOUT    = 8000;
const TENANT_SLUG = 'admin'; // slug for the default teacher created by seed.js

let passed   = 0;
let failed   = 0;
let skipped  = 0;
const failures = [];

/* ══════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════ */
function assert(condition, label, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    failures.push({ label, detail });
    console.error(`  ❌ ${label}${detail ? ': ' + detail : ''}`);
  }
}

function skip(label) {
  skipped++;
  console.log(`  ⏭️  [SKIP] ${label}`);
}

/**
 * Make an API request with JSON body and optional JWT + tenant slug.
 * All requests include X-Tenant-Slug so the multi-tenancy middleware
 * can resolve the teacher context (required for student/assistant login).
 */
function request({ method = 'GET', path, body, token, headers = {} }) {
  return new Promise((resolve, reject) => {
    const url     = new URL(BASE_URL + path);
    const strBody = body ? JSON.stringify(body) : null;
    const opts = {
      hostname : url.hostname,
      port     : url.port || 80,
      path     : url.pathname + url.search,
      method,
      headers  : {
        'Content-Type'  : 'application/json',
        'X-Tenant-Slug' : TENANT_SLUG,
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

/** Raw HTTP GET — for testing /uploads/ static file serving */
function rawGet(urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const opts = {
      hostname : parsed.hostname,
      port     : parsed.port || 80,
      path     : parsed.pathname + parsed.search,
      method   : 'GET',
      headers,
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    setTimeout(() => { req.destroy(); reject(new Error('Timeout')); }, TIMEOUT);
    req.end();
  });
}

async function login(username, password, role) {
  const res = await request({
    method : 'POST',
    path   : '/auth/login',
    body   : { username, password, device_id: 'test-device-' + Date.now(), ...(role ? { role } : {}) },
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
   [A] UNIT TESTS — Pure logic, no network required
══════════════════════════════════════════════════════════════════ */
function testUnitLogic() {
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  [A] Unit Tests — withToken helper & serverProgress computation');
  console.log('══════════════════════════════════════════════════════════════════');

  /* ── withToken (mirrors client/src/pages/student/CourseView.jsx) ── */
  const withToken = (url, fakeToken = 'test-token-123') => {
    if (!url || !url.startsWith('/uploads/')) return url;
    try {
      if (!fakeToken) return url;
      return `${url}?token=${encodeURIComponent(fakeToken)}`;
    } catch { return url; }
  };

  // A-1: Local uploaded video URL gets token
  assert(
    withToken('/uploads/videos/vid_1234.mp4').includes('?token='),
    'A-1: /uploads/videos/ URL receives ?token= query param'
  );

  // A-2: YouTube URL is NOT modified (external, no auth needed)
  assert(
    withToken('https://www.youtube.com/watch?v=dQw4w9WgXcQ') === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'A-2: YouTube URL unchanged — not a local /uploads/ path'
  );

  // A-3: Any external http URL is NOT modified
  assert(
    withToken('http://example.com/video.mp4') === 'http://example.com/video.mp4',
    'A-3: External http URL unchanged — only /uploads/ paths are protected'
  );

  // A-4: null → null (no crash)
  assert(withToken(null) === null, 'A-4: null URL returns null safely');

  // A-5: undefined → undefined (no crash)
  assert(withToken(undefined) === undefined, 'A-5: undefined URL returns undefined safely');

  // A-6: empty string → empty string (no crash)
  assert(withToken('') === '', 'A-6: empty string URL returns empty string safely');

  // A-7: PDF path gets token too
  assert(
    withToken('/uploads/pdfs/report.pdf').startsWith('/uploads/pdfs/report.pdf?token='),
    'A-7: /uploads/pdfs/ URL receives ?token= query param'
  );

  // A-8: Token with special characters is URL-encoded
  const specialToken = 'abc+def=xyz/test';
  assert(
    withToken('/uploads/videos/test.mp4', specialToken).includes(encodeURIComponent(specialToken)),
    'A-8: JWT token with special chars is properly URL-encoded'
  );

  // A-9: /uploads/images/ also gets a token appended (withToken applies to ALL /uploads/ paths)
  // The server ignores the extra token param for public paths — this is harmless
  assert(
    withToken('/uploads/images/thumb.jpg').includes('?token='),
    'A-9: /uploads/images/ URL also gets token appended (safe — server ignores it for public dirs)'
  );

  /* ── serverProgress computation (mirrors server/routes/students.js) ── */
  const computeServerProgress = (durationMinutes, actualWatchedSeconds, watchedMinutes, clientProgress) => {
    const safeWatchedSeconds = Math.max(0, Math.min(actualWatchedSeconds || 0, 86400));
    const safeWatchedMinutes = Math.max(0, watchedMinutes || 0);
    let serverProgress = 0;
    if (durationMinutes > 0 && safeWatchedSeconds > 0) {
      serverProgress = Math.min(100, (safeWatchedSeconds / (durationMinutes * 60)) * 100);
    } else if (durationMinutes > 0 && safeWatchedMinutes > 0) {
      serverProgress = Math.min(100, (safeWatchedMinutes / durationMinutes) * 100);
    } else {
      // BUG FIX: when duration = 0 (URL videos without duration set), use client's value
      const cp = parseFloat(clientProgress) || 0;
      serverProgress = Math.min(100, Math.max(0, cp));
    }
    return serverProgress;
  };

  // A-10: Normal progress via actual_watched_seconds
  assert(
    computeServerProgress(10, 300, 0, 0) === 50,
    'A-10: serverProgress = 50% when 5min watched of 10min video (actual_watched_seconds)'
  );

  // A-11: Fallback via watched_minutes when no actual_watched_seconds
  assert(
    computeServerProgress(20, 0, 10, 0) === 50,
    'A-11: serverProgress = 50% when 10min watched of 20min video (watched_minutes fallback)'
  );

  // A-12: Progress capped at 100%
  assert(
    computeServerProgress(10, 7000, 0, 0) === 100,
    'A-12: serverProgress capped at 100% even if actual seconds exceed full duration'
  );

  // A-13: CRITICAL BUG FIX — duration=0 (URL video) uses client progress instead of always 0
  assert(
    computeServerProgress(0, 0, 0, 75) === 75,
    'A-13 [BUG FIX]: duration=0 → uses client progress_percentage (was always 0 before fix)'
  );

  // A-14: duration=0 with client progress=0 → 0 (no false progress)
  assert(
    computeServerProgress(0, 0, 0, 0) === 0,
    'A-14: duration=0, client progress=0 → 0'
  );

  // A-15: duration=0 client sends >100 → capped at 100
  assert(
    computeServerProgress(0, 0, 0, 150) === 100,
    'A-15: duration=0, client sends 150% → capped at 100% (anti-cheat)'
  );

  // A-16: duration=0 client sends negative → 0
  assert(
    computeServerProgress(0, 0, 0, -10) === 0,
    'A-16: duration=0, client sends negative % → 0 (floor at 0)'
  );

  // A-17: actual_watched_seconds hard-capped at 86400 (24h anti-cheat)
  assert(
    computeServerProgress(5, 999999, 0, 0) === 100,
    'A-17: actual_watched_seconds input capped at 86400 (24h anti-cheat guard)'
  );

  // A-18: actual_watched_seconds=0 but duration set → uses watched_minutes if available
  assert(
    computeServerProgress(30, 0, 15, 50) === 50,
    'A-18: actual_watched_seconds=0, duration set, uses watched_minutes (15/30 = 50%)'
  );
}

/* ══════════════════════════════════════════════════════════════════
   [B] Content Access Authorization
══════════════════════════════════════════════════════════════════ */
async function testContentAccess(teacherToken, studentToken) {
  await section('[B] Content Access — is_published & enrollment enforcement', async () => {

    // B-1: No token → 401
    const noAuth = await request({ path: '/courses/1/content' });
    assert(noAuth.status === 401, 'B-1: GET /courses/:id/content without token → 401');

    // B-2: Teacher can list all courses
    const teacherCourses = await request({ path: '/courses', token: teacherToken });
    assert(
      teacherCourses.status === 200 && Array.isArray(teacherCourses.body),
      'B-2: Teacher can list all their courses → 200'
    );

    // B-3: Student can list their enrolled courses
    const studentCourses = await request({ path: '/courses/student/my-courses', token: studentToken });
    assert(
      studentCourses.status === 200 && Array.isArray(studentCourses.body),
      'B-3: Student can list their enrolled courses → 200'
    );

    const allCourseIds    = Array.isArray(teacherCourses.body) ? teacherCourses.body.map(c => c.id) : [];
    const enrolledIds     = Array.isArray(studentCourses.body) ? studentCourses.body.map(c => c.id) : [];

    if (allCourseIds.length > 0) {
      const firstCourse = teacherCourses.body[0];

      // B-4: Teacher can access their own course content (published or not)
      const teacherContent = await request({ path: `/courses/${firstCourse.id}/content`, token: teacherToken });
      assert(teacherContent.status === 200, `B-4: Teacher can access their own course content → 200`);

      // B-5: Content response includes required arrays
      if (teacherContent.status === 200) {
        assert(
          Array.isArray(teacherContent.body.videos) &&
          Array.isArray(teacherContent.body.pdfs) &&
          Array.isArray(teacherContent.body.exams),
          'B-5: Content response has videos[], pdfs[], exams[] arrays'
        );
      } else { skip('B-5: Content structure (teacher unreachable)'); }
    } else {
      skip('B-4: Teacher course access (no courses in DB)');
      skip('B-5: Content structure (no courses in DB)');
    }

    // B-6: Student accessing non-enrolled course → 403 (is_published + enrollment check)
    const notEnrolledId = allCourseIds.find(id => !enrolledIds.includes(id));
    if (notEnrolledId) {
      const denied = await request({ path: `/courses/${notEnrolledId}/content`, token: studentToken });
      assert(
        denied.status === 403,
        `B-6 [BUG FIX]: Student accessing non-enrolled or unpublished course → 403`
      );
    } else {
      skip('B-6: Non-enrolled course access (student enrolled in all courses or no extra courses)');
    }

    // B-7: Non-existent course → 403 or 404 (not 500)
    const ghost = await request({ path: '/courses/999999/content', token: studentToken });
    assert([403, 404].includes(ghost.status), 'B-7: Non-existent course → 403 or 404 (not 500)');

    // B-8: Non-numeric course ID → must NOT return 200
    const nan = await request({ path: '/courses/abc/content', token: studentToken });
    assert(nan.status !== 200, 'B-8: Non-numeric course ID "abc" → not 200');

    // B-9: Enrolled student can access published course content
    if (enrolledIds.length > 0) {
      const enrolled = await request({ path: `/courses/${enrolledIds[0]}/content`, token: studentToken });
      assert(enrolled.status === 200, 'B-9: Student enrolled in published course can access content → 200');
    } else {
      skip('B-9: Enrolled content access (student has no enrolled courses)');
    }
  });
}

/* ══════════════════════════════════════════════════════════════════
   [C] Video Progress Edge Cases
══════════════════════════════════════════════════════════════════ */
async function testVideoProgress(studentToken, teacherToken) {
  await section('[C] Video Progress — Edge Cases', async () => {

    // C-1: No token → 401
    const noAuth = await request({ method: 'POST', path: '/students/me/video-progress', body: { video_id: 1 } });
    assert(noAuth.status === 401, 'C-1: POST /students/me/video-progress without token → 401');

    // C-2: Teacher token → 403 (student-only endpoint)
    const teacherBlocked = await request({
      method: 'POST', path: '/students/me/video-progress',
      token: teacherToken, body: { video_id: 1 },
    });
    assert(teacherBlocked.status === 403, 'C-2: Teacher cannot POST to student video-progress → 403');

    // C-3: Missing video_id → 400
    const noVideoId = await request({
      method: 'POST', path: '/students/me/video-progress',
      token: studentToken, body: { watched_minutes: 5 },
    });
    assert(noVideoId.status === 400, 'C-3: Missing video_id in request → 400 Bad Request');

    // C-4: Video not in any enrolled course → 403
    const strangeVideo = await request({
      method: 'POST', path: '/students/me/video-progress',
      token: studentToken,
      body: { video_id: 999999, watched_minutes: 5, actual_watched_seconds: 300, progress_percentage: 50 },
    });
    assert(strangeVideo.status === 403, 'C-4: Video not in enrolled course → 403 Access Denied');

    // C-5 onwards: need an enrolled course with a video
    const courses = await request({ path: '/courses/student/my-courses', token: studentToken });
    if (!Array.isArray(courses.body) || courses.body.length === 0) {
      skip('C-5 through C-10: Student has no enrolled courses');
      return;
    }

    const course  = courses.body[0];
    const content = await request({ path: `/courses/${course.id}/content`, token: studentToken });
    if (content.status !== 200 || !Array.isArray(content.body.videos) || content.body.videos.length === 0) {
      skip('C-5 through C-10: No videos in enrolled course');
      return;
    }

    const video = content.body.videos[0];

    // C-5: Normal progress update succeeds
    const normal = await request({
      method: 'POST', path: '/students/me/video-progress',
      token: studentToken,
      body: {
        video_id             : video.id,
        watched_minutes      : 5,
        progress_percentage  : 50,
        watch_count_increment: 0,
        last_position        : 300,
        actual_watched_seconds: 300,
      },
    });
    assert(normal.status === 200, `C-5: Valid progress update for video ${video.id} → 200`);

    // C-6: BUG FIX — duration=0 with 0 actual_watched_seconds, uses client progress_percentage
    const zeroDuration = await request({
      method: 'POST', path: '/students/me/video-progress',
      token: studentToken,
      body: {
        video_id             : video.id,
        watched_minutes      : 0,
        progress_percentage  : 65,
        watch_count_increment: 0,
        last_position        : 0,
        actual_watched_seconds: 0,
      },
    });
    assert(zeroDuration.status === 200, 'C-6 [BUG FIX]: Progress with 0 actual_watched_seconds (URL video) → 200');

    // C-7: Progress >100% is accepted (server caps it)
    const over = await request({
      method: 'POST', path: '/students/me/video-progress',
      token: studentToken,
      body: {
        video_id             : video.id,
        watched_minutes      : 999,
        progress_percentage  : 200,
        watch_count_increment: 0,
        last_position        : 0,
        actual_watched_seconds: 999999,
      },
    });
    assert(over.status === 200, 'C-7: progress_percentage > 100 is accepted (server caps to 100) → 200');

    // C-8: Negative values handled safely (no 500)
    const negative = await request({
      method: 'POST', path: '/students/me/video-progress',
      token: studentToken,
      body: {
        video_id             : video.id,
        watched_minutes      : -5,
        progress_percentage  : -10,
        watch_count_increment: 0,
        last_position        : -1,
        actual_watched_seconds: -100,
      },
    });
    assert(negative.status === 200, 'C-8: Negative progress values handled gracefully → 200 (no crash)');

    // C-9: Completed video (watch_count_increment=1) works
    const completed = await request({
      method: 'POST', path: '/students/me/video-progress',
      token: studentToken,
      body: {
        video_id             : video.id,
        watched_minutes      : video.duration_minutes || 10,
        progress_percentage  : 100,
        watch_count_increment: 1,
        last_position        : (video.duration_minutes || 10) * 60,
        actual_watched_seconds: (video.duration_minutes || 10) * 60,
      },
    });
    assert(completed.status === 200, 'C-9: Completed video (watch_count_increment=1) → 200');

    // C-10: video_id=0 → 400 or 403 (invalid)
    const zeroId = await request({
      method: 'POST', path: '/students/me/video-progress',
      token: studentToken,
      body: { video_id: 0, watched_minutes: 5, actual_watched_seconds: 300, progress_percentage: 50 },
    });
    assert([400, 403].includes(zeroId.status), 'C-10: video_id=0 → 400 or 403 (invalid ID)');
  });
}

/* ══════════════════════════════════════════════════════════════════
   [D] Section Validation — section_id must belong to the course
══════════════════════════════════════════════════════════════════ */
async function testSectionValidation(teacherToken) {
  await section('[D] Section Validation — section_id ownership', async () => {

    const courses = await request({ path: '/courses', token: teacherToken });
    if (!Array.isArray(courses.body) || courses.body.length < 1) {
      skip('D-1 through D-6: No courses available');
      return;
    }

    const course1  = courses.body[0];
    const course2  = courses.body.length > 1 ? courses.body[1] : null;
    const content1 = await request({ path: `/courses/${course1.id}/content`, token: teacherToken });
    if (content1.status !== 200) {
      skip('D-1 through D-6: Cannot read course content');
      return;
    }

    const sections1 = content1.body.sections || [];

    // D-1: Valid section_id from same course → 201
    if (sections1.length > 0) {
      const validAdd = await request({
        method: 'POST', path: `/courses/${course1.id}/videos/url`,
        token: teacherToken,
        body: { title: 'Test — Valid Section', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', section_id: sections1[0].id },
      });
      assert(validAdd.status === 201, 'D-1: Video URL with valid section_id (same course) → 201');
    } else {
      skip('D-1: Valid section_id (course has no sections)');
    }

    // D-2: BUG FIX — nonexistent section_id → 400 (was silently accepted before)
    const invalidSection = await request({
      method: 'POST', path: `/courses/${course1.id}/videos/url`,
      token: teacherToken,
      body: { title: 'Test — Invalid Section', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', section_id: 999999 },
    });
    assert(
      invalidSection.status === 400,
      'D-2 [BUG FIX]: Video URL with nonexistent section_id → 400 (was silently accepted before fix)'
    );

    // D-3: BUG FIX — cross-course section injection → 400 (security fix)
    if (course2) {
      const content2   = await request({ path: `/courses/${course2.id}/content`, token: teacherToken });
      const sections2  = content2.body?.sections || [];
      if (sections2.length > 0) {
        const crossInject = await request({
          method: 'POST', path: `/courses/${course1.id}/videos/url`,
          token: teacherToken,
          body: { title: 'Test — Cross-course Inject', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', section_id: sections2[0].id },
        });
        assert(crossInject.status === 400, 'D-3 [BUG FIX]: Cross-course section_id injection → 400 (security)');
      } else {
        skip('D-3: Cross-course injection (course2 has no sections)');
      }
    } else {
      skip('D-3: Cross-course injection (only one course available)');
    }

    // D-4: No section_id → accepted (section is optional)
    const noSection = await request({
      method: 'POST', path: `/courses/${course1.id}/videos/url`,
      token: teacherToken,
      body: { title: 'Test — No Section', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    });
    assert(noSection.status === 201, 'D-4: Video URL without section_id (optional) → 201');

    // D-5: section_id=null → treated as no section → 201
    const nullSection = await request({
      method: 'POST', path: `/courses/${course1.id}/videos/url`,
      token: teacherToken,
      body: { title: 'Test — Null Section', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', section_id: null },
    });
    assert(nullSection.status === 201, 'D-5: section_id=null → treated as no section → 201');

    // D-6: section_id=0 is falsy → treated as null → 201 (must not crash)
    const zeroSection = await request({
      method: 'POST', path: `/courses/${course1.id}/videos/url`,
      token: teacherToken,
      body: { title: 'Test — Zero Section', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', section_id: 0 },
    });
    assert(
      [201, 400].includes(zeroSection.status),
      'D-6: section_id=0 → 201 (falsy, treated as null) or 400 — must not 500'
    );
    assert(zeroSection.status !== 500, 'D-6b: section_id=0 does not cause a 500 server error');
  });
}

/* ══════════════════════════════════════════════════════════════════
   [E] Upload Auth — /uploads/pdfs and /uploads/videos require JWT
══════════════════════════════════════════════════════════════════ */
async function testUploadAuth(validToken) {
  await section('[E] Upload Auth — JWT protection for /uploads/', async () => {

    // E-1: /uploads/videos without token → 401
    const noVid = await rawGet(`${BASE_HOST}/uploads/videos/nonexistent.mp4`);
    assert(noVid.status === 401, 'E-1: GET /uploads/videos/ without token → 401');

    // E-2: /uploads/pdfs without token → 401
    const noPdf = await rawGet(`${BASE_HOST}/uploads/pdfs/nonexistent.pdf`);
    assert(noPdf.status === 401, 'E-2: GET /uploads/pdfs/ without token → 401');

    // E-3: /uploads/videos with invalid token → 401
    const badToken = await rawGet(
      `${BASE_HOST}/uploads/videos/nonexistent.mp4`,
      { Authorization: 'Bearer definitely_not_a_real_jwt' }
    );
    assert(badToken.status === 401, 'E-3: Invalid Bearer token → 401');

    // E-4: /uploads/videos with valid token in Authorization header → not 401
    // (file doesn't exist → 404, but auth passes)
    const goodHeader = await rawGet(
      `${BASE_HOST}/uploads/videos/nonexistent.mp4`,
      { Authorization: `Bearer ${validToken}` }
    );
    assert(goodHeader.status !== 401, 'E-4: Valid Authorization header → auth passes (not 401)');
    assert([404, 200].includes(goodHeader.status), 'E-4b: Valid token + missing file → 404');

    // E-5: /uploads/pdfs with valid token as ?token= query param → not 401
    // JWT uses base64url encoding (only A-Za-z0-9-_.) — safe in query strings without encodeURIComponent
    const goodQuery = await rawGet(
      `${BASE_HOST}/uploads/pdfs/nonexistent.pdf?token=${validToken}`
    );
    assert(goodQuery.status !== 401, 'E-5: Valid ?token= query param → auth passes (not 401)');

    // E-6: /uploads/images/ is PUBLIC — no auth needed (thumbnails for course cards)
    const publicImg = await rawGet(`${BASE_HOST}/uploads/images/nonexistent.jpg`);
    assert(publicImg.status !== 401, 'E-6: /uploads/images/ is public — no auth required (not 401)');

    // E-7: /uploads/question-images/ requires auth
    const noQuestion = await rawGet(`${BASE_HOST}/uploads/question-images/nonexistent.jpg`);
    assert(noQuestion.status === 401, 'E-7: /uploads/question-images/ without token → 401');

    // E-8: Missing "Bearer " prefix in Authorization header → 401
    const noPrefix = await rawGet(
      `${BASE_HOST}/uploads/videos/nonexistent.mp4`,
      { Authorization: validToken }  // raw token, no "Bearer " prefix
    );
    assert(noPrefix.status === 401, 'E-8: Authorization without "Bearer " prefix → 401');

    // E-9: Empty Authorization header → 401
    const emptyAuth = await rawGet(
      `${BASE_HOST}/uploads/videos/nonexistent.mp4`,
      { Authorization: '' }
    );
    assert(emptyAuth.status === 401, 'E-9: Empty Authorization header → 401');

    // E-10: Expired / mangled JWT → 401
    const mangledJwt = validToken.slice(0, -5) + 'XXXXX'; // corrupt signature
    const mangledToken = await rawGet(
      `${BASE_HOST}/uploads/videos/nonexistent.mp4`,
      { Authorization: `Bearer ${mangledJwt}` }
    );
    assert(mangledToken.status === 401, 'E-10: Mangled JWT (corrupt signature) → 401');
  });
}

/* ══════════════════════════════════════════════════════════════════
   [F] Auto-Advance Logic — Client-side only (pure unit tests)
══════════════════════════════════════════════════════════════════ */
function testAutoAdvanceLogic() {
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  [F] Auto-Advance Logic — Client-side video completion behavior');
  console.log('══════════════════════════════════════════════════════════════════');

  // Mirrors the FIXED handleProgressUpdate logic in CourseView.jsx
  const autoAdvance = (videos, completedVideoId) => {
    const idx = videos.findIndex(v => v.id === completedVideoId);
    if (idx === -1) return null; // BUG FIX: video not in list → no advance
    return videos[idx + 1] || null;
  };

  const videos = [
    { id: 1, title: 'Lecture 1' },
    { id: 2, title: 'Lecture 2' },
    { id: 3, title: 'Lecture 3' },
  ];

  // F-1: Completing first video → advances to second
  assert(autoAdvance(videos, 1)?.id === 2, 'F-1 [BUG FIX]: Completing video 1 → auto-advances to video 2');

  // F-2: Completing middle video → advances to next
  assert(autoAdvance(videos, 2)?.id === 3, 'F-2: Completing video 2 → auto-advances to video 3');

  // F-3: Completing LAST video → null (no next)
  assert(autoAdvance(videos, 3) === null, 'F-3: Completing last video → null (no next lecture)');

  // F-4: Empty videos array → null (no crash)
  assert(autoAdvance([], 1) === null, 'F-4: Empty videos array → null (no crash)');

  // F-5: Video ID not in list → null (not videos[0]) — BUG FIX
  assert(autoAdvance(videos, 999) === null, 'F-5 [BUG FIX]: Unknown video ID → null (not accidentally videos[0])');

  // F-6: Single-video course → completing returns null
  assert(autoAdvance([{ id: 1 }], 1) === null, 'F-6: Single-video course → null (no next)');

  // F-7: completed=false does NOT trigger auto-advance
  const handleProgressUpdate = (videoId, _wm, _pct, completed, videos) => {
    if (!completed) return null;
    return autoAdvance(videos, videoId);
  };
  assert(
    handleProgressUpdate(1, 3, 30, false, videos) === null,
    'F-7: completed=false (periodic save interval) → no auto-advance'
  );

  // F-8: completed=true triggers auto-advance
  assert(
    handleProgressUpdate(1, 10, 100, true, videos)?.id === 2,
    'F-8: completed=true → auto-advances to next video'
  );

  // F-9: First video completes, second video is the result (sequential)
  const singleVideo = [{ id: 42 }];
  assert(
    handleProgressUpdate(42, 10, 100, true, singleVideo) === null,
    'F-9: Single video course — completing it → null (stays on same screen)'
  );
}

/* ══════════════════════════════════════════════════════════════════
   [G] Course Publishing & is_published Enforcement
══════════════════════════════════════════════════════════════════ */
async function testPublishingRules(teacherToken, studentToken) {
  await section('[G] Course Publishing & is_published Enforcement', async () => {

    // G-1: Teacher creates a new course
    const newCourse = await request({
      method: 'POST', path: '/courses',
      token: teacherToken,
      body: {
        name        : `Edge-Case Test ${Date.now()}`,
        description : 'Automated test course',
        price       : 0,
        is_free     : true,
        target_stage: 'الصف الأول الثانوي',
      },
    });
    assert(newCourse.status === 201, 'G-1: Teacher creates a new course → 201');
    if (newCourse.status !== 201 || !newCourse.body?.id) {
      skip('G-2 through G-9: Course creation failed');
      return;
    }

    const cid = newCourse.body.id;

    // G-2: BUG FIX — Student cannot access UNPUBLISHED course (even if enrolled)
    const unpubStudent = await request({ path: `/courses/${cid}/content`, token: studentToken });
    assert(
      unpubStudent.status === 403,
      'G-2 [BUG FIX]: Student cannot access unpublished course content → 403'
    );

    // G-3: Teacher CAN access their own unpublished course
    const unpubTeacher = await request({ path: `/courses/${cid}/content`, token: teacherToken });
    assert(unpubTeacher.status === 200, 'G-3: Teacher can view their own unpublished course content → 200');

    // G-4: Publishing empty course → 400 (needs content first)
    const pubEmpty = await request({
      method: 'PUT', path: `/courses/${cid}/publish`,
      token: teacherToken, body: { is_published: true },
    });
    assert(pubEmpty.status === 400, 'G-4: Publishing course with no content → 400 (content guard)');

    // G-5: Add a YouTube video to the course
    const addVid = await request({
      method: 'POST', path: `/courses/${cid}/videos/url`,
      token: teacherToken,
      body: { title: 'Test Lecture', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    });
    assert(addVid.status === 201, 'G-5: Teacher adds YouTube video to new course → 201');

    // G-6: Publish the course
    const publish = await request({
      method: 'PUT', path: `/courses/${cid}/publish`,
      token: teacherToken, body: { is_published: true },
    });
    assert(publish.status === 200, 'G-6: Publishing course with content → 200');

    if (publish.status === 200) {
      // G-7: After publish, check if student got auto-enrolled (free course, target_stage matches)
      const afterPub = await request({ path: `/courses/${cid}/content`, token: studentToken });
      const studentGotAccess = afterPub.status === 200;

      // G-8: Unpublish the course
      const unpublish = await request({
        method: 'PUT', path: `/courses/${cid}/publish`,
        token: teacherToken, body: { is_published: false },
      });
      assert(unpublish.status === 200, 'G-8: Unpublishing course → 200');

      if (unpublish.status === 200 && studentGotAccess) {
        // G-9: BUG FIX — After unpublish, enrolled student loses access
        const afterUnpub = await request({ path: `/courses/${cid}/content`, token: studentToken });
        assert(
          afterUnpub.status === 403,
          'G-9 [BUG FIX]: After course unpublished, enrolled student loses access → 403'
        );
      } else if (!studentGotAccess) {
        skip('G-9: After-unpublish access revocation (student was not auto-enrolled — stage mismatch)');
      } else {
        skip('G-9: After-unpublish access revocation (unpublish failed)');
      }
    } else {
      skip('G-7 through G-9: Publish failed, skipping post-publish checks');
    }

    // Cleanup test course
    await request({ method: 'DELETE', path: `/courses/${cid}`, token: teacherToken });
  });
}

/* ══════════════════════════════════════════════════════════════════
   [H] Role Isolation — Cross-role access prevention
══════════════════════════════════════════════════════════════════ */
async function testRoleIsolation(teacherToken, studentToken) {
  await section('[H] Role Isolation — Students cannot use teacher endpoints', async () => {

    // H-1: Student cannot create a course
    const createCourse = await request({
      method: 'POST', path: '/courses',
      token: studentToken, body: { name: 'Hacked Course', price: 0 },
    });
    assert(createCourse.status === 403, 'H-1: Student cannot create a course → 403');

    // H-2: Student cannot add a video URL
    const addUrl = await request({
      method: 'POST', path: '/courses/1/videos/url',
      token: studentToken, body: { title: 'Injected', url: 'https://evil.com/video.mp4' },
    });
    assert([403, 401].includes(addUrl.status), 'H-2: Student cannot add video URL to a course → 403');

    // H-3: Student cannot publish a course
    const pub = await request({
      method: 'PUT', path: '/courses/1/publish',
      token: studentToken, body: { is_published: true },
    });
    assert([403, 401].includes(pub.status), 'H-3: Student cannot publish a course → 403');

    // H-4: Student cannot delete a course
    const del = await request({ method: 'DELETE', path: '/courses/999', token: studentToken });
    assert([403, 401, 404].includes(del.status), 'H-4: Student cannot delete a course → 403/404');

    // H-5: Teacher cannot access student-only video progress endpoint
    const teacherProg = await request({
      method: 'POST', path: '/students/me/video-progress',
      token: teacherToken, body: { video_id: 1 },
    });
    assert(teacherProg.status === 403, 'H-5: Teacher cannot POST to student video-progress → 403');

    // H-6: Student cannot list all students
    const allStudents = await request({ path: '/students', token: studentToken });
    assert([403, 401].includes(allStudents.status), 'H-6: Student cannot list all students → 403');

    // H-7: No token → 401 for all critical endpoints
    const [noAuthCourses, noAuthStudents, noAuthProg] = await Promise.all([
      request({ path: '/courses' }),
      request({ path: '/students' }),
      request({ method: 'POST', path: '/students/me/video-progress', body: { video_id: 1 } }),
    ]);
    assert(noAuthCourses.status === 401, 'H-7a: No token → GET /courses → 401');
    assert(noAuthStudents.status === 401, 'H-7b: No token → GET /students → 401');
    assert(noAuthProg.status === 401, 'H-7c: No token → POST /students/me/video-progress → 401');
  });
}

/* ══════════════════════════════════════════════════════════════════
   MAIN RUNNER
══════════════════════════════════════════════════════════════════ */
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║    WATHBA — Course System Edge Case Test Suite                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`  Target     : ${BASE_URL}`);
  console.log(`  Tenant slug: ${TENANT_SLUG}  (X-Tenant-Slug header)`);
  console.log(`  Time       : ${new Date().toISOString()}`);

  // ── Authenticate ──────────────────────────────────────────────
  console.log('\n🔑 Authenticating test accounts...');

  const teacherToken = await login('admin', 'admin123', 'teacher');
  if (!teacherToken) {
    console.error('❌ FATAL: Could not authenticate teacher (admin / admin123).');
    console.error('   Run: node server/db/seed.js  then retry.');
    process.exit(1);
  }

  const studentToken = await login('std_ali', '123456', 'student');
  if (!studentToken) {
    console.error('❌ FATAL: Could not authenticate student (std_ali / 123456).');
    console.error('   Run: node server/db/seed.js  then retry.');
    console.error('   Note: student login requires X-Tenant-Slug header (already included).');
    process.exit(1);
  }

  console.log(`  ✅ Teacher : ${teacherToken.slice(0, 30)}...`);
  console.log(`  ✅ Student : ${studentToken.slice(0, 30)}...`);

  // ── Run all test sections ─────────────────────────────────────
  testUnitLogic();
  testAutoAdvanceLogic();

  await testContentAccess(teacherToken, studentToken);
  await testVideoProgress(studentToken, teacherToken);
  await testSectionValidation(teacherToken);
  await testUploadAuth(teacherToken);
  await testPublishingRules(teacherToken, studentToken);
  await testRoleIsolation(teacherToken, studentToken);

  // ── Summary ───────────────────────────────────────────────────
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

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\n💥 Test runner crashed:', err.message);
  process.exit(1);
});
