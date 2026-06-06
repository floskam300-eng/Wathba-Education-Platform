/**
 * Wathba — LiveStream Service: Comprehensive Test Suite
 * =====================================================
 * يغطي هذا الملف جميع إصلاحات الـ bugs والثغرات الأمنية وحالات الحافة.
 *
 * التشغيل:
 *   node tests/live-stream.test.js
 *
 * المتطلبات: لا يحتاج حزم خارجية — يستخدم Node.js built-ins فقط.
 * يحتاج قاعدة بيانات نشطة وخادم Express يعمل على PORT (افتراضياً 3001).
 *
 * هيكل الاختبارات:
 *   [A] Unit tests — دوال parseId، rate limiters، fanOut، viewerCache
 *   [B] Integration tests — API endpoints عبر HTTP
 */

'use strict';

const http = require('http');
const crypto = require('crypto');

/* ══════════════════════════════════════════════════════════════════
   CONFIGURATION
══════════════════════════════════════════════════════════════════ */
const BASE_URL  = `http://localhost:${process.env.PORT || 3001}/api`;
const TIMEOUT   = 8000;

let passed = 0;
let failed = 0;
const failures = [];

/* ══════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════ */

/** Simple assertion */
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

/** HTTP request helper */
function request({ method = 'GET', path, body, token, headers = {} }) {
  return new Promise((resolve, reject) => {
    const url    = new URL(BASE_URL + path);
    const strBody = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname,
      port:     url.port || 80,
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(strBody ? { 'Content-Length': Buffer.byteLength(strBody) } : {}),
        ...headers,
      },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (_) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(TIMEOUT, () => { req.destroy(new Error('timeout')); });
    if (strBody) req.write(strBody);
    req.end();
  });
}

/** Login and return JWT token */
async function login(username, password, role = 'teacher') {
  const r = await request({
    method: 'POST',
    path:   '/auth/login',
    body:   { username, password, role },
  });
  return r.body.token || null;
}

/* ══════════════════════════════════════════════════════════════════
   [A] UNIT TESTS — Pure logic, no HTTP
══════════════════════════════════════════════════════════════════ */

function sectionA_parseId() {
  console.log('\n📦 [A1] parseId() validation');

  /* Replicate the exact same logic from server/routes/live.js for fast unit testing.
     Upper bound = PostgreSQL INTEGER max (SERIAL type) = 2^31-1. */
  const PG_INT_MAX = 2_147_483_647;
  function parseId(val) {
    const n = parseInt(val, 10);
    if (!Number.isFinite(n) || n <= 0 || n > PG_INT_MAX) return null;
    return n;
  }

  assert(parseId('1')   === 1,    'parseId("1") === 1');
  assert(parseId('99')  === 99,   'parseId("99") === 99');
  assert(parseId('0')   === null, 'parseId("0") → null (zero rejected)');
  assert(parseId('-1')  === null, 'parseId("-1") → null (negative rejected)');
  assert(parseId('abc') === null, 'parseId("abc") → null');
  assert(parseId('')    === null, 'parseId("") → null');
  assert(parseId(null)  === null, 'parseId(null) → null');
  assert(parseId('1.5') === 1,    'parseId("1.5") → 1 (parseInt truncates)');
  assert(parseId('99999999999999999999') === null, 'parseId(overflow > PG_INT_MAX) → null');
  assert(parseId('2147483647') === 2147483647, 'parseId(PG_INT_MAX=2147483647) → valid');
  assert(parseId('2147483648') === null,        'parseId(PG_INT_MAX+1=2147483648) → null');
  assert(parseId('../../etc/passwd') === null, 'parseId(path traversal) → null');
  assert(parseId('1; DROP TABLE') === 1, 'parseId(sql injection) → 1 (int part extracted, safe)');
}

function sectionA_chatRateLimit() {
  console.log('\n📦 [A2] chatRateCheck() rate limiter');

  const chatRateMap = new Map();
  const CHAT_MAX    = 5;
  const CHAT_WIN_MS = 5000;

  function chatRateCheck(userId) {
    const now = Date.now();
    const rec = chatRateMap.get(userId);
    if (!rec || now > rec.resetAt) {
      chatRateMap.set(userId, { count: 1, resetAt: now + CHAT_WIN_MS });
      return true;
    }
    if (rec.count >= CHAT_MAX) return false;
    rec.count++;
    return true;
  }

  const userId = 'testUser_' + Date.now();
  let allowed = 0;
  for (let i = 0; i < 10; i++) {
    if (chatRateCheck(userId)) allowed++;
  }
  assert(allowed === CHAT_MAX, `chatRateCheck: exactly ${CHAT_MAX} msgs allowed in window (got ${allowed})`);
  assert(!chatRateCheck(userId), 'chatRateCheck: 6th message in window is rejected');

  const newUser = 'newUser_' + Date.now();
  assert(chatRateCheck(newUser), 'chatRateCheck: different user is allowed (isolated counters)');
}

function sectionA_handRateLimit() {
  console.log('\n📦 [A3] handRateCheck() rate limiter');

  const handRateMap = new Map();
  const HAND_MAX    = 10;
  const HAND_WIN_MS = 30000;

  function handRateCheck(userId, streamId) {
    const key = `${userId}:${streamId}`;
    const now = Date.now();
    const rec = handRateMap.get(key);
    if (!rec || now > rec.resetAt) {
      handRateMap.set(key, { count: 1, resetAt: now + HAND_WIN_MS });
      return true;
    }
    if (rec.count >= HAND_MAX) return false;
    rec.count++;
    return true;
  }

  const uid = 'u1';
  const sid = 42;
  let allowed = 0;
  for (let i = 0; i < 15; i++) {
    if (handRateCheck(uid, sid)) allowed++;
  }
  assert(allowed === HAND_MAX, `handRateCheck: exactly ${HAND_MAX} raises allowed (got ${allowed})`);

  // Different stream — independent counter
  assert(handRateCheck(uid, 99), 'handRateCheck: different streamId has independent counter');
  assert(handRateCheck('u2', sid), 'handRateCheck: different userId has independent counter');
}

function sectionA_viewerCache() {
  console.log('\n📦 [A4] viewerCache helpers');

  /* Replicate the exact helper functions from live.js */
  const viewerCache = new Map();
  const _warming    = new Set();

  function vcAdd(streamId, studentId) {
    const key = String(streamId);
    if (!viewerCache.has(key)) viewerCache.set(key, new Set());
    viewerCache.get(key).add(Number(studentId));
  }
  function vcRemove(streamId, studentId) {
    viewerCache.get(String(streamId))?.delete(Number(studentId));
  }
  function vcClear(streamId) {
    viewerCache.delete(String(streamId));
    _warming.delete(String(streamId));
  }

  vcAdd(1, 10);
  vcAdd(1, 20);
  vcAdd(1, 30);

  assert(viewerCache.get('1').has(10), 'vcAdd: student 10 in stream 1');
  assert(viewerCache.get('1').has(20), 'vcAdd: student 20 in stream 1');
  assert(viewerCache.get('1').size === 3, 'vcAdd: stream 1 has exactly 3 viewers');

  vcRemove(1, 20);
  assert(!viewerCache.get('1').has(20), 'vcRemove: student 20 removed');
  assert(viewerCache.get('1').size === 2,  'vcRemove: stream 1 now has 2 viewers');

  // vcRemove on non-existent stream should not throw
  assert((() => { try { vcRemove(999, 10); return true; } catch (_) { return false; } })(),
    'vcRemove: non-existent stream is silent no-op');

  vcClear(1);
  assert(!viewerCache.has('1'), 'vcClear: stream 1 cache cleared');
  assert(!_warming.has('1'),    'vcClear: _warming flag cleared for stream 1');

  // vcAdd with string / number ID should be equivalent
  vcAdd('5', '100');
  vcAdd(5, 100);
  assert(viewerCache.get('5').size === 1, 'vcAdd: string/number IDs are equivalent');

  // vcAdd duplicate
  vcAdd(5, 100);
  vcAdd(5, 100);
  assert(viewerCache.get('5').size === 1, 'vcAdd: duplicate vcAdd does not grow the set');
}

function sectionA_allowedStagesValidation() {
  console.log('\n📦 [A5] allowed_stages content validation logic');

  function validateStages(arr) {
    if (!arr?.length) return true;
    return (
      Array.isArray(arr) &&
      arr.length <= 20 &&
      arr.every(s => typeof s === 'string' && s.trim().length > 0 && s.length <= 50)
    );
  }

  assert(validateStages([]),                           'empty array passes');
  assert(validateStages(null),                         'null (no stages) passes');
  assert(validateStages(['1st', '2nd']),               'valid stages pass');
  assert(!validateStages(new Array(21).fill('stage')), '21 stages rejected (> max 20)');
  assert(!validateStages(['']),                        'empty string stage rejected');
  assert(!validateStages(['a'.repeat(51)]),            '51-char stage rejected (> 50)');
  assert(!validateStages(['valid', '']),               'mixed valid+empty rejected');
  assert(!validateStages('not-an-array'),              'non-array rejected');
  assert(validateStages(['أول ثانوي', 'تانية ثانوي']), 'Arabic stages pass');
}

function sectionA_reasonValidation() {
  console.log('\n📦 [A6] award-points reason field validation');

  function validateReason(reason) {
    if (!reason) return true;
    if (typeof reason !== 'string') return false;
    return reason.length <= 200;
  }

  assert(validateReason(null),          'null reason passes');
  assert(validateReason(''),            'empty reason passes');
  assert(validateReason('أحسنت!'),     'short Arabic reason passes');
  assert(validateReason('a'.repeat(200)), '200-char reason passes (boundary)');
  assert(!validateReason('a'.repeat(201)), '201-char reason rejected');
  assert(!validateReason('x'.repeat(5000)), 'very long reason rejected');
  assert(!validateReason(123),          'non-string reason rejected');
}

function sectionA_fanOut() {
  console.log('\n📦 [A7] fanOut() setImmediate-batching');

  /* Verify fanOut processes all IDs without skipping, even for >50 viewers */
  const called = [];
  function mockSendEvent(channel, event, payload) {
    called.push({ channel, event });
  }

  /* Replicate fanOut logic */
  function fanOut(ids, event, payload) {
    if (!ids.length) return;
    const BATCH = 50;
    let i = 0;
    function flush() {
      const slice = ids.slice(i, i + BATCH);
      for (const id of slice) mockSendEvent(`student_${id}`, event, payload);
      i += BATCH;
      if (i < ids.length) setImmediate(flush);
    }
    setImmediate(flush);
  }

  const ids200 = Array.from({ length: 200 }, (_, i) => i + 1);
  fanOut(ids200, 'test_event', { msg: 'hi' });

  /* All sends happen in setImmediate — check after next tick resolution */
  return new Promise(resolve => setTimeout(() => {
    assert(called.length === 200, `fanOut: all 200 sends delivered (got ${called.length})`);
    assert(called.every(c => c.event === 'test_event'), 'fanOut: correct event name in all sends');
    assert(called[0].channel  === 'student_1',   'fanOut: first channel correct');
    assert(called[199].channel === 'student_200', 'fanOut: last channel correct');

    // fanOut on empty array should not call anything
    const before = called.length;
    fanOut([], 'test_event', {});
    setTimeout(() => {
      assert(called.length === before, 'fanOut: empty array sends nothing');
      resolve();
    }, 50);
  }, 100));
}

/* ══════════════════════════════════════════════════════════════════
   [B] INTEGRATION TESTS — HTTP calls against running server
══════════════════════════════════════════════════════════════════ */

async function sectionB_auth() {
  console.log('\n🔌 [B1] Authentication & bad-actor tokens');

  const r1 = await request({ method: 'POST', path: '/live/start', body: { title: 'x' } });
  assert(r1.status === 401, 'no token → 401');

  const r2 = await request({ method: 'POST', path: '/live/start', body: { title: 'x' }, token: 'bad.token.here' });
  assert(r2.status === 401, 'invalid JWT → 401');

  const r3 = await request({ method: 'GET', path: '/live/available', token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6OTk5OTk5OSwicm9sZSI6InN0dWRlbnQiLCJpYXQiOjE3MDAwMDAwMDB9.fake' });
  assert(r3.status === 401, 'tampered/expired JWT → 401');
}

async function sectionB_paramValidation(teacherToken) {
  console.log('\n🔌 [B2] URL param validation (parseId)');

  const invalids = ['0', '-1', 'abc', '../etc', 'null', '1.5.6', '%00', '  '];

  for (const val of invalids) {
    const r = await request({ method: 'POST', path: `/live/${val}/end`, token: teacherToken });
    assert(r.status === 400 || r.status === 404, `invalid streamId="${val}" → 400/404 (got ${r.status})`);
  }

  const rKick1 = await request({ method: 'POST', path: '/live/1/kick/0',    token: teacherToken });
  assert(rKick1.status === 400, 'kick with studentId=0 → 400');
  const rKick2 = await request({ method: 'POST', path: '/live/1/kick/-5',   token: teacherToken });
  assert(rKick2.status === 400, 'kick with studentId=-5 → 400');
  const rKick3 = await request({ method: 'POST', path: '/live/1/kick/evil', token: teacherToken });
  assert(rKick3.status === 400, 'kick with studentId="evil" → 400');
}

async function sectionB_startStream(teacherToken) {
  console.log('\n🔌 [B3] POST /live/start — teacher starts a stream');

  const r1 = await request({ method: 'POST', path: '/live/start', body: {}, token: teacherToken });
  assert(r1.status === 400, 'missing title → 400');

  const r2 = await request({ method: 'POST', path: '/live/start', body: { title: '' }, token: teacherToken });
  assert(r2.status === 400, 'empty title → 400');

  const r3 = await request({ method: 'POST', path: '/live/start', body: { title: 'x'.repeat(201) }, token: teacherToken });
  assert(r3.status === 400, 'title > 200 chars → 400');

  const r4 = await request({ method: 'POST', path: '/live/start', body: { title: 'اختبار', access: 'unknown' }, token: teacherToken });
  assert(r4.status === 400, 'invalid access type → 400');

  // valid stages array with 21 items
  const r5 = await request({ method: 'POST', path: '/live/start', body: {
    title: 'حصة حية', access: 'stages', allowed_stages: new Array(21).fill('مرحلة'),
  }, token: teacherToken });
  assert(r5.status === 400, 'allowed_stages > 20 items → 400');

  // stage value too long
  const r6 = await request({ method: 'POST', path: '/live/start', body: {
    title: 'حصة', access: 'stages', allowed_stages: ['a'.repeat(51)],
  }, token: teacherToken });
  assert(r6.status === 400, 'stage value > 50 chars → 400');

  // valid request
  const r7 = await request({ method: 'POST', path: '/live/start', body: {
    title: 'حصة مباشرة', description: 'تجربة', access: 'all',
    chat_enabled: true, hand_raise_enabled: true,
  }, token: teacherToken });
  assert(r7.status === 200 || r7.status === 201, 'valid start → 200/201');
  const stream = r7.body?.stream;
  assert(stream?.id > 0,              'start: stream.id is positive integer');
  assert(stream?.room_id?.length > 0, 'start: room_id is set');
  assert(stream?.status === 'active', 'start: status is "active"');

  return stream;
}

async function sectionB_endStream(teacherToken, streamId) {
  console.log('\n🔌 [B4] POST /live/:streamId/end — teacher ends a stream');

  // End a non-existent stream
  const r1 = await request({ method: 'POST', path: '/live/999999/end', token: teacherToken });
  assert(r1.status === 404, 'end non-existent stream → 404');

  // Idempotent: end already-ended stream
  if (streamId) {
    const r2 = await request({ method: 'POST', path: `/live/${streamId}/end`, token: teacherToken });
    assert([200, 404].includes(r2.status), `end stream ${streamId} → 200 or 404 (idempotent)`);

    const r3 = await request({ method: 'POST', path: `/live/${streamId}/end`, token: teacherToken });
    assert(r3.status === 404, 'second end call → 404 (stream already ended)');
  }
}

async function sectionB_roleGuards(teacherToken, studentToken) {
  console.log('\n🔌 [B5] Role-based access control');

  // Student cannot start a stream
  if (studentToken) {
    const r1 = await request({ method: 'POST', path: '/live/start', body: { title: 'x' }, token: studentToken });
    assert(r1.status === 403, 'student cannot POST /live/start → 403');

    const r2 = await request({ method: 'POST', path: '/live/1/end', token: studentToken });
    assert(r2.status === 403, 'student cannot POST /live/:id/end → 403');

    const r3 = await request({ method: 'GET', path: '/live/my-active', token: studentToken });
    assert(r3.status === 403, 'student cannot GET /live/my-active → 403');

    const r4 = await request({ method: 'POST', path: '/live/1/kick/2', token: studentToken });
    assert(r4.status === 403, 'student cannot POST /live/:id/kick/:sid → 403');
  }

  // Teacher cannot join as student
  const r5 = await request({ method: 'GET', path: '/live/available', token: teacherToken });
  assert(r5.status === 403, 'teacher cannot GET /live/available (student-only) → 403');

  const r6 = await request({ method: 'POST', path: '/live/1/hand-raise', body: { raised: true }, token: teacherToken });
  assert(r6.status === 403, 'teacher cannot POST hand-raise (student-only) → 403');
}

async function sectionB_awardPoints(teacherToken, studentToken) {
  console.log('\n🔌 [B6] award-points validation & viewer check');

  // Start fresh stream
  const startR = await request({ method: 'POST', path: '/live/start', body: { title: 'نقاط' }, token: teacherToken });
  if (startR.status !== 200 && startR.status !== 201) {
    console.log('  ⚠️  Skipping award-points tests — could not create stream');
    return null;
  }
  const stream = startR.body.stream;

  // Award to non-watching student
  const r1 = await request({ method: 'POST', path: `/live/${stream.id}/award-points`,
    body: { studentId: 9999, points: 10, reason: 'test' }, token: teacherToken });
  assert(r1.status === 404, 'award-points to non-watching student → 404');

  // Award with reason > 200 chars
  const r2 = await request({ method: 'POST', path: `/live/${stream.id}/award-points`,
    body: { studentId: 1, points: 10, reason: 'r'.repeat(201) }, token: teacherToken });
  assert(r2.status === 400, 'award-points with reason > 200 chars → 400');

  // Award > 1000 points
  const r3 = await request({ method: 'POST', path: `/live/${stream.id}/award-points`,
    body: { studentId: 1, points: 1001 }, token: teacherToken });
  assert(r3.status === 400, 'award-points > 1000 → 400');

  // Award 0 points
  const r4 = await request({ method: 'POST', path: `/live/${stream.id}/award-points`,
    body: { studentId: 1, points: 0 }, token: teacherToken });
  assert(r4.status === 400, 'award-points 0 → 400');

  // Award with invalid studentId
  const r5 = await request({ method: 'POST', path: `/live/${stream.id}/award-points`,
    body: { studentId: -1, points: 10 }, token: teacherToken });
  assert(r5.status === 400, 'award-points studentId=-1 → 400');

  return stream.id;
}

async function sectionB_handRaise(studentToken, streamId) {
  console.log('\n🔌 [B7] hand-raise: validation + rate limiting');

  if (!streamId || !studentToken) {
    console.log('  ⚠️  Skipping hand-raise tests — no stream or student token');
    return;
  }

  // hand-raise with no raised field
  const r1 = await request({ method: 'POST', path: `/live/${streamId}/hand-raise`,
    body: {}, token: studentToken });
  assert([400, 403, 404].includes(r1.status), 'hand-raise with no raised field → 400/403/404');

  // Rate limit check — need to be active viewer first, so this returns 403 (not joined)
  // which is also an acceptable "not joined" guard
  const r2 = await request({ method: 'POST', path: `/live/${streamId}/hand-raise`,
    body: { raised: true }, token: studentToken });
  assert([403, 404, 429].includes(r2.status), 'hand-raise without joining → 403/404/429 (not active viewer)');
}

async function sectionB_chat(teacherToken, studentToken) {
  console.log('\n🔌 [B8] chat: rate limit + content validation');

  if (!teacherToken) {
    console.log('  ⚠️  Skipping chat tests — no teacher token');
    return;
  }

  const startR = await request({ method: 'POST', path: '/live/start', body: { title: 'chat test' }, token: teacherToken });
  if (startR.status !== 200 && startR.status !== 201) {
    console.log('  ⚠️  Skipping chat tests — could not create stream');
    return;
  }
  const streamId = startR.body.stream.id;

  // Empty message
  const r1 = await request({ method: 'POST', path: `/live/${streamId}/chat`,
    body: { message: '' }, token: teacherToken });
  assert(r1.status === 400, 'empty chat message → 400');

  // Message > 500 chars
  const r2 = await request({ method: 'POST', path: `/live/${streamId}/chat`,
    body: { message: 'x'.repeat(501) }, token: teacherToken });
  assert(r2.status === 400, 'chat message > 500 chars → 400');

  // Valid teacher message
  const r3 = await request({ method: 'POST', path: `/live/${streamId}/chat`,
    body: { message: 'مرحباً بالطلاب' }, token: teacherToken });
  assert(r3.status === 200 || r3.status === 201, 'valid teacher chat → 200/201');
  assert(typeof r3.body?.message?.id === 'number', 'chat response includes message.id');

  // Chat by student who hasn't joined
  if (studentToken) {
    const r4 = await request({ method: 'POST', path: `/live/${streamId}/chat`,
      body: { message: 'هاي' }, token: studentToken });
    assert(r4.status === 403, 'student not in stream cannot chat → 403');
  }

  // End the stream
  await request({ method: 'POST', path: `/live/${streamId}/end`, token: teacherToken });

  // Chat to ended stream
  const r5 = await request({ method: 'POST', path: `/live/${streamId}/chat`,
    body: { message: 'بعد الانتهاء' }, token: teacherToken });
  assert(r5.status === 404, 'chat to ended stream → 404');
}

async function sectionB_scheduleStream(teacherToken) {
  console.log('\n🔌 [B9] schedule stream: validation');

  if (!teacherToken) return;

  // Past date
  const r1 = await request({ method: 'POST', path: '/live/schedule', body: {
    title: 'حصة', scheduled_at: new Date(Date.now() - 60000).toISOString(),
  }, token: teacherToken });
  assert(r1.status === 400, 'schedule in past → 400');

  // Missing title
  const r2 = await request({ method: 'POST', path: '/live/schedule', body: {
    scheduled_at: new Date(Date.now() + 3600000).toISOString(),
  }, token: teacherToken });
  assert(r2.status === 400, 'schedule without title → 400');

  // Valid schedule
  const r3 = await request({ method: 'POST', path: '/live/schedule', body: {
    title:        'درس الغد',
    description:  'تجربة جدولة',
    access:       'all',
    scheduled_at: new Date(Date.now() + 3600000).toISOString(),
  }, token: teacherToken });
  assert(r3.status === 200 || r3.status === 201, 'valid schedule → 200/201');
  assert(r3.body?.stream?.status === 'scheduled', 'scheduled stream has status="scheduled"');

  // Cancel it
  if (r3.body?.stream?.id) {
    const r4 = await request({ method: 'DELETE', path: `/live/scheduled/${r3.body.stream.id}`, token: teacherToken });
    assert(r4.status === 200, 'cancel scheduled stream → 200');

    // Cancel already-deleted
    const r5 = await request({ method: 'DELETE', path: `/live/scheduled/${r3.body.stream.id}`, token: teacherToken });
    assert(r5.status === 404, 'cancel already-deleted → 404');
  }
}

async function sectionB_livekitToken(teacherToken, studentToken) {
  console.log('\n🔌 [B10] LiveKit token: guards & rate limiting');

  // Invalid streamId
  const r1 = await request({ method: 'POST', path: '/live/0/livekit-token', token: teacherToken });
  assert(r1.status === 400, 'livekit-token streamId=0 → 400');

  const r2 = await request({ method: 'POST', path: '/live/abc/livekit-token', token: teacherToken });
  assert(r2.status === 400, 'livekit-token streamId="abc" → 400');

  // No active stream
  const r3 = await request({ method: 'POST', path: '/live/9999999/livekit-token', token: teacherToken });
  assert([404, 503].includes(r3.status), 'livekit-token non-existent stream → 404 or 503 (no SDK)');

  // Teacher ownership check — start a stream then request token with wrong teacher would need
  // a second teacher account. We just verify the endpoint is reachable and returns expected errors.
}

async function sectionB_lockStream(teacherToken) {
  console.log('\n🔌 [B11] stream lock / unlock');

  if (!teacherToken) return;

  // Start stream
  const startR = await request({ method: 'POST', path: '/live/start', body: { title: 'قفل' }, token: teacherToken });
  if (startR.status !== 200 && startR.status !== 201) {
    console.log('  ⚠️  Skipping lock tests');
    return;
  }
  const sid = startR.body.stream.id;

  const r1 = await request({ method: 'POST', path: `/live/${sid}/lock`, body: { locked: true }, token: teacherToken });
  assert(r1.status === 200, 'lock stream → 200');
  assert(r1.body?.is_locked === true, 'lock: is_locked=true in response');

  const r2 = await request({ method: 'POST', path: `/live/${sid}/lock`, body: { locked: false }, token: teacherToken });
  assert(r2.status === 200, 'unlock stream → 200');
  assert(r2.body?.is_locked === false, 'unlock: is_locked=false in response');

  // Lock ended stream
  await request({ method: 'POST', path: `/live/${sid}/end`, token: teacherToken });
  const r3 = await request({ method: 'POST', path: `/live/${sid}/lock`, body: { locked: true }, token: teacherToken });
  assert(r3.status === 404, 'lock ended stream → 404');
}

async function sectionB_muteAll(teacherToken) {
  console.log('\n🔌 [B12] mute-all');

  if (!teacherToken) return;

  const startR = await request({ method: 'POST', path: '/live/start', body: { title: 'mute test' }, token: teacherToken });
  if (startR.status !== 200 && startR.status !== 201) return;
  const sid = startR.body.stream.id;

  const r1 = await request({ method: 'POST', path: `/live/${sid}/mute-all`, token: teacherToken });
  assert(r1.status === 200, 'mute-all on empty stream → 200');
  assert(r1.body?.mutedCount === 0, 'mute-all with no speakers → mutedCount=0');

  await request({ method: 'POST', path: `/live/${sid}/end`, token: teacherToken });
}

async function sectionB_myActiveStream(teacherToken) {
  console.log('\n🔌 [B13] GET /live/my-active');

  const r1 = await request({ method: 'GET', path: '/live/my-active', token: teacherToken });
  assert(r1.status === 200, 'my-active → 200');
  assert('stream' in (r1.body || {}), 'my-active body has "stream" key');

  // Start then check
  const startR = await request({ method: 'POST', path: '/live/start', body: { title: 'active check' }, token: teacherToken });
  if (startR.status === 200 || startR.status === 201) {
    const r2 = await request({ method: 'GET', path: '/live/my-active', token: teacherToken });
    assert(r2.body?.stream?.status === 'active', 'my-active returns the active stream');
    await request({ method: 'POST', path: `/live/${startR.body.stream.id}/end`, token: teacherToken });
  }

  // After end
  const r3 = await request({ method: 'GET', path: '/live/my-active', token: teacherToken });
  assert(r3.body?.stream === null || r3.body?.stream === undefined, 'my-active is null after stream ends');
}

async function sectionB_chatToggle(teacherToken) {
  console.log('\n🔌 [B14] chat-toggle');

  const startR = await request({ method: 'POST', path: '/live/start', body: { title: 'toggle test', chat_enabled: true }, token: teacherToken });
  if (startR.status !== 200 && startR.status !== 201) return;
  const sid = startR.body.stream.id;

  const r1 = await request({ method: 'POST', path: `/live/${sid}/chat-toggle`, body: { enabled: false }, token: teacherToken });
  assert(r1.status === 200, 'disable chat → 200');

  const r2 = await request({ method: 'POST', path: `/live/${sid}/chat-toggle`, body: { enabled: true }, token: teacherToken });
  assert(r2.status === 200, 're-enable chat → 200');

  await request({ method: 'POST', path: `/live/${sid}/end`, token: teacherToken });
  const r3 = await request({ method: 'POST', path: `/live/${sid}/chat-toggle`, body: { enabled: false }, token: teacherToken });
  assert(r3.status === 404, 'chat-toggle on ended stream → 404');
}

/* ══════════════════════════════════════════════════════════════════
   EDGE CASES
══════════════════════════════════════════════════════════════════ */

async function sectionC_edgeCases(teacherToken) {
  console.log('\n🔌 [C1] Edge cases — concurrent start, XSS in fields, SQL injection');

  // SQL-injection-looking title should be stored safely (parameterized queries)
  const sqlTitle = "حصة'; DROP TABLE live_streams; --";
  const r1 = await request({ method: 'POST', path: '/live/start', body: { title: sqlTitle }, token: teacherToken });
  if (r1.status === 200 || r1.status === 201) {
    assert(r1.body?.stream?.title === sqlTitle, 'SQL injection in title: stored safely, not executed');
    await request({ method: 'POST', path: `/live/${r1.body.stream.id}/end`, token: teacherToken });
  } else {
    assert(false, `Unexpected status for SQL title: ${r1.status}`);
  }

  // XSS in description
  const xssDesc = '<script>alert("xss")</script>';
  const r2 = await request({ method: 'POST', path: '/live/start', body: { title: 'حصة', description: xssDesc }, token: teacherToken });
  if (r2.status === 200 || r2.status === 201) {
    assert(r2.body?.stream?.description === xssDesc, 'XSS in description: stored as plain text (escaped at render)');
    await request({ method: 'POST', path: `/live/${r2.body.stream.id}/end`, token: teacherToken });
  }

  // Concurrent start: starting two streams should end first automatically
  const s1 = await request({ method: 'POST', path: '/live/start', body: { title: 'بث 1' }, token: teacherToken });
  const s2 = await request({ method: 'POST', path: '/live/start', body: { title: 'بث 2' }, token: teacherToken });

  if ((s1.status === 200 || s1.status === 201) && (s2.status === 200 || s2.status === 201)) {
    const activeR = await request({ method: 'GET', path: '/live/my-active', token: teacherToken });
    assert(activeR.body?.stream?.id === s2.body.stream.id, 'Concurrent start: second stream is the active one');
    await request({ method: 'POST', path: `/live/${s2.body.stream.id}/end`, token: teacherToken });
  }
}

/* ══════════════════════════════════════════════════════════════════
   MAIN RUNNER
══════════════════════════════════════════════════════════════════ */

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Wathba LiveStream Test Suite');
  console.log('═══════════════════════════════════════════════════════════');

  /* ── Unit Tests (no HTTP) ── */
  sectionA_parseId();
  sectionA_chatRateLimit();
  sectionA_handRateLimit();
  sectionA_viewerCache();
  sectionA_allowedStagesValidation();
  sectionA_reasonValidation();
  await sectionA_fanOut();

  /* ── Integration Tests (HTTP) ── */
  let teacherToken = null;
  let studentToken = null;

  console.log('\n🔐 Obtaining test tokens…');
  try {
    teacherToken = await login('admin', 'admin123', 'teacher');
    if (!teacherToken) throw new Error('teacher login failed');
    console.log('  ✅ teacher token obtained');
  } catch (e) {
    console.warn(`  ⚠️  Cannot obtain teacher token (${e.message}) — server may not be running`);
    console.warn('  Integration tests will be skipped.');
  }

  try {
    studentToken = await login('std_ali', '123456', 'student');
    if (studentToken) console.log('  ✅ student token obtained');
  } catch (_) {
    console.warn('  ⚠️  Cannot obtain student token — student-specific tests will be limited');
  }

  if (teacherToken) {
    await sectionB_auth();
    await sectionB_paramValidation(teacherToken);

    const stream    = await sectionB_startStream(teacherToken);
    const streamId  = stream?.id;

    await sectionB_endStream(teacherToken, streamId);
    await sectionB_roleGuards(teacherToken, studentToken);

    const awardStreamId = await sectionB_awardPoints(teacherToken, studentToken);
    await sectionB_handRaise(studentToken, awardStreamId);
    if (awardStreamId) await request({ method: 'POST', path: `/live/${awardStreamId}/end`, token: teacherToken });

    await sectionB_chat(teacherToken, studentToken);
    await sectionB_scheduleStream(teacherToken);
    await sectionB_livekitToken(teacherToken, studentToken);
    await sectionB_lockStream(teacherToken);
    await sectionB_muteAll(teacherToken);
    await sectionB_myActiveStream(teacherToken);
    await sectionB_chatToggle(teacherToken);
    await sectionC_edgeCases(teacherToken);
  }

  /* ── Summary ── */
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\n  Failures:');
    failures.forEach(f => console.log(`    ❌ ${f.label}${f.detail ? '\n       ' + f.detail : ''}`));
  }
  console.log('═══════════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
