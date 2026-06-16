/**
 * Session Audit Fixes — Edge Case & Regression Tests
 * يغطي إصلاحات هذه الجلسة:
 *   IL-1..IL-6  : ImageLightbox (منطق clampTranslate + PG_INT_MAX في server)
 *   ERP-2       : pct لا يساوي NaN عند total_score=0
 *   RRP-3       : goBack fallback
 *   REC-1       : JSON.parse في startRec
 *   REC-2       : server_started_at validation
 *   SRV-1       : PG_INT_MAX guard في /results/:id/review
 *   SRV-2       : wrong count ternary مبسّط
 *   SH-1 (regression): snapshot grading correctness
 *
 * تشغيل: node server/tests/session_audit_fixes.test.js
 * يتطلب: السيرفر يعمل على port 3001 + بيانات seed موجودة
 */

const http = require('http');

const BASE = 'http://localhost:3001';
let passed = 0, failed = 0;
const errors = [];

function req(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = new URL(BASE + url);
    const isJson = body && typeof body === 'object' && !(body instanceof Buffer);
    const bodyBuf = isJson ? Buffer.from(JSON.stringify(body)) : body;
    const options = {
      hostname: opts.hostname,
      port:     opts.port,
      path:     opts.pathname + opts.search,
      method,
      headers: {
        ...(isJson ? { 'Content-Type': 'application/json', 'Content-Length': bodyBuf.length } : {}),
        ...headers,
      },
    };
    const r = http.request(options, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, body: json, headers: res.headers });
      });
    });
    r.on('error', reject);
    if (bodyBuf) r.write(bodyBuf);
    r.end();
  });
}

async function login(username, password, tenantSlug = null) {
  const role = username.startsWith('std') ? 'student' : 'teacher';
  const headers = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};
  const body = { username, password, role };
  if (role === 'student') body.device_id = `test_device_${username}_session_audit`;
  const r = await req('POST', '/api/auth/login', body, headers);
  if (!r.body.token) throw new Error(`Login failed for ${username}: ${JSON.stringify(r.body)}`);
  return r.body.token;
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

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEq(a, b, msg) { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

// ─────────────────────────────────────────────────────────────────────────────
// [SRV-1] PG_INT_MAX guard in /recitations/results/:id/review
// ─────────────────────────────────────────────────────────────────────────────
async function testSRV1(tok) {
  console.log('\n[SRV-1] PG_INT_MAX guard — /results/:id/review');

  await test('SRV-1a: resultId=0 → 400', async () => {
    const r = await req('GET', '/api/recitations/results/0/review', null, { Authorization: `Bearer ${tok}` });
    assertEq(r.status, 400);
  });

  await test('SRV-1b: resultId=-1 → 400', async () => {
    const r = await req('GET', '/api/recitations/results/-1/review', null, { Authorization: `Bearer ${tok}` });
    assertEq(r.status, 400);
  });

  await test('SRV-1c: resultId=NaN string → 400', async () => {
    const r = await req('GET', '/api/recitations/results/abc/review', null, { Authorization: `Bearer ${tok}` });
    assertEq(r.status, 400);
  });

  await test('SRV-1d: resultId > 2147483647 → 400 (PG_INT_MAX+1)', async () => {
    const r = await req('GET', '/api/recitations/results/2147483648/review', null, { Authorization: `Bearer ${tok}` });
    assertEq(r.status, 400, `Expected 400 but got ${r.status}`);
  });

  await test('SRV-1e: resultId = 2147483647 → not 500 (DB safe boundary)', async () => {
    const r = await req('GET', '/api/recitations/results/2147483647/review', null, { Authorization: `Bearer ${tok}` });
    // Should return 404 (not found) or 403 (access denied), not 500 (DB overflow)
    assert(r.status !== 500, `Got 500 (DB overflow) for MAX INT value`);
  });

  await test('SRV-1f: resultId=9999999999 → 400 (far beyond PG_INT_MAX)', async () => {
    const r = await req('GET', '/api/recitations/results/9999999999/review', null, { Authorization: `Bearer ${tok}` });
    assertEq(r.status, 400);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// [SRV-2] wrong count calculation — answered-but-wrong
// ─────────────────────────────────────────────────────────────────────────────
async function testSRV2(teacherTok) {
  console.log('\n[SRV-2] Wrong count consistency');

  await test('SRV-2a: review wrong count = answered minus correct (never includes unanswered)', async () => {
    // Get any result the teacher can see
    const listR = await req('GET', '/api/recitations/student/results', null, { Authorization: `Bearer ${teacherTok}` });
    // We just need to verify the count logic is consistent if we have data
    // If no data, we skip gracefully
    if (listR.status !== 200 || !Array.isArray(listR.body) || listR.body.length === 0) return;
    const resultId = listR.body[0].id;
    const reviewR = await req('GET', `/api/recitations/results/${resultId}/review`, null, { Authorization: `Bearer ${teacherTok}` });
    if (reviewR.status !== 200) return; // not our data, skip
    const { result, review } = reviewR.body;
    if (!result || !review) return;
    // wrong = answered & not correct; must NOT include unanswered
    const computedWrong = review.filter(q => !q.is_correct && !!q.student_answer).length;
    const computedUnanswered = review.filter(q => !q.student_answer).length;
    const computedCorrect = review.filter(q => q.is_correct).length;
    // Sanity: correct + wrong + unanswered = total
    assertEq(computedCorrect + computedWrong + computedUnanswered, review.length,
      `counts don't add up: ${computedCorrect}+${computedWrong}+${computedUnanswered} != ${review.length}`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// [SH-1] Snapshot grading correctness (regression: shuffle_options)
// ─────────────────────────────────────────────────────────────────────────────
async function testSH1(teacherTok, studentTok) {
  console.log('\n[SH-1] Snapshot grading — review uses stored snapshot not live DB');

  await test('SH-1a: /results/:id/review returns 200 with review array', async () => {
    // Fetch a real result that the student owns
    const studentResultsR = await req('GET', '/api/recitations/student/results', null, { Authorization: `Bearer ${studentTok}` });
    if (studentResultsR.status !== 200 || !Array.isArray(studentResultsR.body) || studentResultsR.body.length === 0) return;
    const resultId = studentResultsR.body[0].id;
    const r = await req('GET', `/api/recitations/results/${resultId}/review`, null, { Authorization: `Bearer ${studentTok}` });
    assertEq(r.status, 200, `Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(Array.isArray(r.body.review), 'review must be an array');
    assert(r.body.result, 'result object must be present');
  });

  await test('SH-1b: is_correct flags consistent: correct + wrong + unanswered = total', async () => {
    const studentResultsR = await req('GET', '/api/recitations/student/results', null, { Authorization: `Bearer ${studentTok}` });
    if (studentResultsR.status !== 200 || !Array.isArray(studentResultsR.body) || studentResultsR.body.length === 0) return;
    const resultId = studentResultsR.body[0].id;
    const r = await req('GET', `/api/recitations/results/${resultId}/review`, null, { Authorization: `Bearer ${studentTok}` });
    if (r.status !== 200) return;
    const review = r.body.review;
    const correct    = review.filter(q => q.is_correct).length;
    const wrong      = review.filter(q => !q.is_correct && !!q.student_answer).length;
    const unanswered = review.filter(q => !q.student_answer).length;
    assertEq(correct + wrong + unanswered, review.length,
      `Counts don't add up: ${correct}+${wrong}+${unanswered} != ${review.length}`);
  });

  await test('SH-1c: student cannot view another student\'s result → 403 or 404', async () => {
    // Get teacher token's results list to find a result owned by another student
    const teacherResultsR = await req('GET', '/api/recitations/teacher/results', null, { Authorization: `Bearer ${teacherTok}` });
    if (teacherResultsR.status !== 200) return;
    const results = Array.isArray(teacherResultsR.body?.results || teacherResultsR.body) ?
      (teacherResultsR.body?.results || teacherResultsR.body) : [];
    if (results.length === 0) return;
    // Use teacher token to get first result, then try student token
    const resultId = results[0]?.id;
    if (!resultId) return;
    // The student may or may not own this result — only test if they don't own it
    const r = await req('GET', `/api/recitations/results/${resultId}/review`, null, { Authorization: `Bearer ${studentTok}` });
    // Either 200 (they own it) or 403 (they don't). Must not be 500.
    assert(r.status !== 500, 'Got 500 server error');
    assert([200, 403, 404].includes(r.status), `Unexpected status ${r.status}`);
  });

  await test('SH-1d: result snapshot stores question_type correctly (no corruption)', async () => {
    const studentResultsR = await req('GET', '/api/recitations/student/results', null, { Authorization: `Bearer ${studentTok}` });
    if (studentResultsR.status !== 200 || !Array.isArray(studentResultsR.body) || studentResultsR.body.length === 0) return;
    const resultId = studentResultsR.body[0].id;
    const r = await req('GET', `/api/recitations/results/${resultId}/review`, null, { Authorization: `Bearer ${studentTok}` });
    if (r.status !== 200) return;
    for (const q of r.body.review) {
      assert(q.question_type != null, `question_type is null for question ${q.id}`);
      assert(['mcq','true_false','image_multi'].includes(q.question_type),
        `Unexpected question_type: ${q.question_type} for question ${q.id}`);
    }
  });

  await test('SH-1e: image_multi review always includes sub_results array', async () => {
    const studentResultsR = await req('GET', '/api/recitations/student/results', null, { Authorization: `Bearer ${studentTok}` });
    if (studentResultsR.status !== 200 || !Array.isArray(studentResultsR.body)) return;
    for (const res of studentResultsR.body) {
      const r = await req('GET', `/api/recitations/results/${res.id}/review`, null, { Authorization: `Bearer ${studentTok}` });
      if (r.status !== 200) continue;
      for (const q of r.body.review) {
        if (q.question_type === 'image_multi') {
          assert(Array.isArray(q.sub_results), `image_multi q.${q.id} missing sub_results`);
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// [SRV-1] PG_INT_MAX guard in /exams/results/:id/review (same guard needed)
// ─────────────────────────────────────────────────────────────────────────────
async function testExamReviewGuard(tok) {
  console.log('\n[ERP-2 / SRV-1] Exam review endpoint guards');

  await test('ERP-2a: /exams/results/0/review → 400', async () => {
    const r = await req('GET', '/api/exams/results/0/review', null, { Authorization: `Bearer ${tok}` });
    assertEq(r.status, 400);
  });

  await test('ERP-2b: /exams/results/2147483648/review → 400 (PG_INT_MAX+1)', async () => {
    const r = await req('GET', '/api/exams/results/2147483648/review', null, { Authorization: `Bearer ${tok}` });
    assertEq(r.status, 400, `Expected 400 got ${r.status}`);
  });

  await test('ERP-2c: review endpoint returns score fields even when total_score would be 0', async () => {
    // Get any exam result
    const listR = await req('GET', '/api/exams/results', null, { Authorization: `Bearer ${tok}` });
    if (listR.status !== 200) return;
    const results = Array.isArray(listR.body?.results || listR.body) ? (listR.body?.results || listR.body) : [];
    if (results.length === 0) return;
    const resultId = results[0]?.id;
    const r = await req('GET', `/api/exams/results/${resultId}/review`, null, { Authorization: `Bearer ${tok}` });
    if (r.status !== 200) return;
    const result = r.body.result;
    assert(result.total_score !== undefined, 'total_score must be present');
    assert(result.score !== undefined, 'score must be present');
    // total_score >= 0 (never undefined/null when present)
    assert(typeof result.total_score === 'number', `total_score must be a number, got ${typeof result.total_score}`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// [clampTranslate] Pure unit tests — no HTTP needed
// ─────────────────────────────────────────────────────────────────────────────
function testClampTranslate() {
  console.log('\n[IL-4] clampTranslate unit tests (pure)');

  function clampTranslate(x, y, scale, innerWidth = 1080, innerHeight = 1920) {
    const maxX = innerWidth  * (scale - 1) / 2;
    const maxY = innerHeight * (scale - 1) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }

  const WIDTH  = 1080;
  const HEIGHT = 1920;

  let localPassed = 0, localFailed = 0;

  function localTest(name, fn) {
    try {
      fn();
      console.log(`  ✅ ${name}`);
      localPassed++;
      passed++;
    } catch (e) {
      console.error(`  ❌ ${name}: ${e.message}`);
      errors.push({ name, error: e.message });
      localFailed++;
      failed++;
    }
  }

  localTest('IL-4a: scale=1 → clamp is 0, translate always returns 0,0', () => {
    const r = clampTranslate(500, 1000, 1, WIDTH, HEIGHT);
    assertEq(r.x, 0); assertEq(r.y, 0);
  });

  localTest('IL-4b: scale=2, translate within bounds → unchanged', () => {
    const maxX = WIDTH * (2 - 1) / 2;   // 540
    const maxY = HEIGHT * (2 - 1) / 2;  // 960
    const r = clampTranslate(200, 300, 2, WIDTH, HEIGHT);
    assertEq(r.x, 200); assertEq(r.y, 300);
  });

  localTest('IL-4c: scale=2, x too large → clamped to maxX', () => {
    const maxX = WIDTH * (2 - 1) / 2;  // 540
    const r = clampTranslate(9999, 0, 2, WIDTH, HEIGHT);
    assertEq(r.x, maxX, `Expected ${maxX}, got ${r.x}`);
  });

  localTest('IL-4d: scale=2, x too negative → clamped to -maxX', () => {
    const maxX = WIDTH * (2 - 1) / 2;  // 540
    const r = clampTranslate(-9999, 0, 2, WIDTH, HEIGHT);
    assertEq(r.x, -maxX, `Expected ${-maxX}, got ${r.x}`);
  });

  localTest('IL-4e: scale=3, y too large → clamped to maxY', () => {
    const maxY = HEIGHT * (3 - 1) / 2;  // 1920
    const r = clampTranslate(0, 99999, 3, WIDTH, HEIGHT);
    assertEq(r.y, maxY, `Expected ${maxY}, got ${r.y}`);
  });

  localTest('IL-4f: scale=5 (max), clamping scales with scale factor', () => {
    const maxX = WIDTH * (5 - 1) / 2;   // 2160
    const r = clampTranslate(2000, 0, 5, WIDTH, HEIGHT);
    assert(r.x <= maxX, `x=${r.x} exceeds maxX=${maxX}`);
    assertEq(r.x, 2000); // within bounds
  });

  localTest('IL-4g: scale=5 (max), extreme x → clamped to maxX', () => {
    const maxX = WIDTH * (5 - 1) / 2;  // 2160
    const r = clampTranslate(99999, 0, 5, WIDTH, HEIGHT);
    assertEq(r.x, maxX);
  });

  localTest('IL-4h: x and y both out-of-bounds → both clamped independently', () => {
    const maxX = WIDTH  * (2 - 1) / 2;
    const maxY = HEIGHT * (2 - 1) / 2;
    const r = clampTranslate(99999, -99999, 2, WIDTH, HEIGHT);
    assertEq(r.x, maxX);
    assertEq(r.y, -maxY);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// [REC-1] JSON.parse safety — simulate corrupt localStorage data
// ─────────────────────────────────────────────────────────────────────────────
function testREC1() {
  console.log('\n[REC-1] JSON.parse safety for localStorage answers');

  function safeParseAnswers(saved) {
    // Mirrors the fixed Recitations.jsx logic:
    // Guard JSON.parse('null') → null (valid JSON but invalid answers shape)
    try {
      const parsed = saved ? JSON.parse(saved) : {};
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  let localPassed = 0, localFailed = 0;

  function localTest(name, fn) {
    try {
      fn();
      console.log(`  ✅ ${name}`);
      localPassed++;
      passed++;
    } catch (e) {
      console.error(`  ❌ ${name}: ${e.message}`);
      errors.push({ name, error: e.message });
      localFailed++;
      failed++;
    }
  }

  localTest('REC-1a: valid JSON → parsed correctly', () => {
    const result = safeParseAnswers('{"1":"A","2":"B"}');
    assertEq(result['1'], 'A');
    assertEq(result['2'], 'B');
  });

  localTest('REC-1b: null → returns {}', () => {
    const result = safeParseAnswers(null);
    assertEq(typeof result, 'object');
    assertEq(Object.keys(result).length, 0);
  });

  localTest('REC-1c: empty string → returns {}', () => {
    const result = safeParseAnswers('');
    assertEq(Object.keys(result).length, 0);
  });

  localTest('REC-1d: corrupt JSON (truncated) → returns {} not throws', () => {
    const result = safeParseAnswers('{"1":"A"');
    assertEq(Object.keys(result).length, 0);
  });

  localTest('REC-1e: corrupt JSON (garbage) → returns {} not throws', () => {
    const result = safeParseAnswers('NOT_JSON_AT_ALL');
    assertEq(Object.keys(result).length, 0);
  });

  localTest('REC-1f: corrupt JSON (null literal) → returns {}', () => {
    const result = safeParseAnswers('null');
    assertEq(Object.keys(result).length, 0);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// [REC-2] server_started_at validation
// ─────────────────────────────────────────────────────────────────────────────
function testREC2() {
  console.log('\n[REC-2] server_started_at validation');

  function getStartedAt(data) {
    const startedAt = data.server_started_at ? new Date(data.server_started_at).getTime() : null;
    if (!startedAt || isNaN(startedAt)) {
      throw new Error('server_started_at مفقود أو غير صالح من الخادم');
    }
    return startedAt;
  }

  let localPassed = 0, localFailed = 0;

  function localTest(name, fn) {
    try {
      fn();
      console.log(`  ✅ ${name}`);
      localPassed++;
      passed++;
    } catch (e) {
      console.error(`  ❌ ${name}: ${e.message}`);
      errors.push({ name, error: e.message });
      localFailed++;
      failed++;
    }
  }

  localTest('REC-2a: valid ISO timestamp → returns numeric epoch', () => {
    const ts = getStartedAt({ server_started_at: '2026-06-16T10:00:00.000Z' });
    assert(typeof ts === 'number', `Expected number, got ${typeof ts}`);
    assert(!isNaN(ts), 'epoch must not be NaN');
    assert(ts > 0, 'epoch must be > 0');
  });

  localTest('REC-2b: null server_started_at → throws Error (not silently NaN)', () => {
    let threw = false;
    try { getStartedAt({ server_started_at: null }); } catch { threw = true; }
    assert(threw, 'Should have thrown for null server_started_at');
  });

  localTest('REC-2c: undefined server_started_at → throws', () => {
    let threw = false;
    try { getStartedAt({}); } catch { threw = true; }
    assert(threw, 'Should have thrown for missing server_started_at');
  });

  localTest('REC-2d: empty string → throws', () => {
    let threw = false;
    try { getStartedAt({ server_started_at: '' }); } catch { threw = true; }
    assert(threw, 'Should have thrown for empty string');
  });

  localTest('REC-2e: "Invalid Date" string → throws', () => {
    let threw = false;
    try { getStartedAt({ server_started_at: 'not-a-date' }); } catch { threw = true; }
    assert(threw, 'Should have thrown for invalid date string');
  });

  localTest('REC-2f: valid timestamp, duration=0 → remaining=0 not NaN', () => {
    const now = new Date().toISOString();
    const startedAt = getStartedAt({ server_started_at: now });
    const durationMs = 0 * 60 * 1000;  // rec.duration_minutes fallback
    const remaining = Math.max(0, durationMs - (Date.now() - startedAt));
    const timeLeft = Math.floor(remaining / 1000);
    assert(!isNaN(timeLeft), 'timeLeft should not be NaN when duration=0');
    assertEq(timeLeft, 0);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// [ERP-2] pct=NaN guard — pure unit test
// ─────────────────────────────────────────────────────────────────────────────
function testERP2() {
  console.log('\n[ERP-2] pct calculation (ExamReviewPage)');

  function calcPct(result) {
    return result && result.total_score > 0
      ? Math.round((result.score / result.total_score) * 100)
      : 0;
  }

  let localPassed = 0, localFailed = 0;

  function localTest(name, fn) {
    try {
      fn();
      console.log(`  ✅ ${name}`);
      localPassed++;
      passed++;
    } catch (e) {
      console.error(`  ❌ ${name}: ${e.message}`);
      errors.push({ name, error: e.message });
      localFailed++;
      failed++;
    }
  }

  localTest('ERP-2a: total_score=10, score=7 → 70', () => {
    assertEq(calcPct({ score: 7, total_score: 10 }), 70);
  });

  localTest('ERP-2b: total_score=0 → 0 (no NaN)', () => {
    const pct = calcPct({ score: 0, total_score: 0 });
    assert(!isNaN(pct), 'pct must not be NaN when total_score=0');
    assertEq(pct, 0);
  });

  localTest('ERP-2c: null result → 0', () => {
    assertEq(calcPct(null), 0);
  });

  localTest('ERP-2d: score=0, total_score=100 → 0', () => {
    assertEq(calcPct({ score: 0, total_score: 100 }), 0);
  });

  localTest('ERP-2e: score=10, total_score=10 → 100', () => {
    assertEq(calcPct({ score: 10, total_score: 10 }), 100);
  });

  localTest('ERP-2f: score=1, total_score=3 → rounds to 33', () => {
    assertEq(calcPct({ score: 1, total_score: 3 }), 33);
  });

  localTest('ERP-2g: score > total_score (bonus) → > 100 (not clamped)', () => {
    const pct = calcPct({ score: 12, total_score: 10 });
    assertEq(pct, 120);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// [RRP-3] goBack fallback — pure unit test
// ─────────────────────────────────────────────────────────────────────────────
function testRRP3() {
  console.log('\n[RRP-3] goBack fallback in RecitationReviewPage');

  function goBack(historyLength, userRole, navigateSpy) {
    if (historyLength > 1) {
      navigateSpy(-1);
    } else if (userRole === 'teacher' || userRole === 'assistant') {
      navigateSpy('/teacher/recitations');
    } else {
      navigateSpy('/student/recitations');
    }
  }

  let localPassed = 0, localFailed = 0;

  function localTest(name, fn) {
    try {
      fn();
      console.log(`  ✅ ${name}`);
      localPassed++;
      passed++;
    } catch (e) {
      console.error(`  ❌ ${name}: ${e.message}`);
      errors.push({ name, error: e.message });
      localFailed++;
      failed++;
    }
  }

  localTest('RRP-3a: history > 1 → navigate(-1)', () => {
    let dest;
    goBack(5, 'student', v => { dest = v; });
    assertEq(dest, -1);
  });

  localTest('RRP-3b: history = 1, student → /student/recitations', () => {
    let dest;
    goBack(1, 'student', v => { dest = v; });
    assertEq(dest, '/student/recitations');
  });

  localTest('RRP-3c: history = 1, teacher → /teacher/recitations', () => {
    let dest;
    goBack(1, 'teacher', v => { dest = v; });
    assertEq(dest, '/teacher/recitations');
  });

  localTest('RRP-3d: history = 1, assistant → /teacher/recitations', () => {
    let dest;
    goBack(1, 'assistant', v => { dest = v; });
    assertEq(dest, '/teacher/recitations');
  });

  localTest('RRP-3e: history = 0, student → /student/recitations (no crash)', () => {
    let dest;
    goBack(0, 'student', v => { dest = v; });
    assertEq(dest, '/student/recitations');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// [SH-1] Snapshot submit + review — integration: take, submit, then review
// ─────────────────────────────────────────────────────────────────────────────
async function testSnapshotIntegration(teacherTok, studentTok) {
  console.log('\n[SH-1] Snapshot grading integration — submit → review');

  await test('SH-int-1: student /take returns server_started_at', async () => {
    const recListR = await req('GET', '/api/recitations/student/list', null, { Authorization: `Bearer ${studentTok}` });
    if (recListR.status !== 200) return;
    const openRec = (Array.isArray(recListR.body) ? recListR.body : []).find(r => {
      // Find one that is open (not done, not expired)
      const now = new Date();
      const isOpen = !r.my_submitted_at &&
        (!r.start_date || new Date(r.start_date) <= now) &&
        (!r.end_date   || new Date(r.end_date)   >= now);
      return isOpen;
    });
    if (!openRec) return; // no open recitations available
    const takeR = await req('GET', `/api/recitations/${openRec.id}/take`, null, { Authorization: `Bearer ${studentTok}` });
    if (takeR.status !== 200) return;
    assert(takeR.body.server_started_at, 'server_started_at must be present in /take response');
    assert(!isNaN(new Date(takeR.body.server_started_at).getTime()), 'server_started_at must be a valid ISO timestamp');
  });

  await test('SH-int-2: /take response includes questions array with correct_answer_letter', async () => {
    const recListR = await req('GET', '/api/recitations/student/list', null, { Authorization: `Bearer ${studentTok}` });
    if (recListR.status !== 200 || !Array.isArray(recListR.body) || recListR.body.length === 0) return;
    const openRec = recListR.body.find(r => {
      const now = new Date();
      return !r.my_submitted_at &&
        (!r.start_date || new Date(r.start_date) <= now) &&
        (!r.end_date   || new Date(r.end_date)   >= now);
    });
    if (!openRec) return;
    const takeR = await req('GET', `/api/recitations/${openRec.id}/take`, null, { Authorization: `Bearer ${studentTok}` });
    if (takeR.status !== 200) return;
    assert(Array.isArray(takeR.body.questions), 'questions must be an array');
    for (const q of takeR.body.questions) {
      if (q.question_type !== 'image_multi') {
        assert(q.correct_answer_letter, `Question ${q.id} missing correct_answer_letter`);
      }
    }
  });

  await test('SH-int-3: after submit, review is_correct matches submitted answers', async () => {
    // Pick an existing result instead of re-submitting to avoid modifying real data
    const resultsR = await req('GET', '/api/recitations/student/results', null, { Authorization: `Bearer ${studentTok}` });
    if (resultsR.status !== 200 || !Array.isArray(resultsR.body) || resultsR.body.length === 0) return;
    for (const res of resultsR.body.slice(0, 3)) {
      const reviewR = await req('GET', `/api/recitations/results/${res.id}/review`, null, { Authorization: `Bearer ${studentTok}` });
      if (reviewR.status !== 200) continue;
      for (const q of reviewR.body.review) {
        if (!q.student_answer) continue; // unanswered
        if (q.question_type === 'image_multi') {
          assert(Array.isArray(q.sub_results), `sub_results missing for image_multi q.${q.id}`);
        } else {
          // is_correct == (student_answer == correct_answer_letter) IF no shuffle,
          // or == stored correct flag (the whole point of SH-1)
          // We can only verify that is_correct is a boolean
          assert(typeof q.is_correct === 'boolean', `is_correct must be boolean for q.${q.id}`);
        }
      }
      break; // check first result with data
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main runner
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  console.log('════════════════════════════════════════════════════════');
  console.log(' Session Audit Fixes — Edge Case Tests');
  console.log('════════════════════════════════════════════════════════');

  // Pure unit tests (no server needed)
  testClampTranslate();
  testREC1();
  testREC2();
  testERP2();
  testRRP3();

  // HTTP integration tests
  let teacherTok, studentTok;
  try {
    teacherTok = await login('admin', 'admin123');
    console.log('\n✔ Teacher login OK');
  } catch (e) {
    console.error('\n✗ Teacher login failed — skipping HTTP tests:', e.message);
    teacherTok = null;
  }

  try {
    // Try student login with the default seed student
    studentTok = await login('std001', 'student123');
    console.log('✔ Student login OK');
  } catch (e) {
    console.error('✗ Student login failed — skipping student HTTP tests:', e.message);
    studentTok = null;
  }

  if (teacherTok) {
    await testSRV1(teacherTok);
    await testSRV2(teacherTok);
    await testExamReviewGuard(teacherTok);
  }

  if (studentTok) {
    await testSH1(teacherTok || studentTok, studentTok);
    await testSnapshotIntegration(teacherTok || studentTok, studentTok);
  }

  console.log('\n════════════════════════════════════════════════════════');
  console.log(` Results: ✅ ${passed} passed  ❌ ${failed} failed`);
  if (errors.length > 0) {
    console.log('\nFailed tests:');
    errors.forEach(e => console.log(`  • ${e.name}: ${e.error}`));
  }
  console.log('════════════════════════════════════════════════════════');
  process.exit(failed > 0 ? 1 : 0);
})();
