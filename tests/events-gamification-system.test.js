/**
 * Comprehensive Test Suite for Events & Gamification System
 * Pure Node.js (http/fetch) — Zero external dependencies.
 */

const http = require('http');
const assert = require('assert');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'اكتب_هنا_اي_كلام_طويل_جداً_مثلاً_50_حرف';
const BASE_URL = `http://localhost:${process.env.PORT || 3001}/api/events`;

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
}

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${path}`);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) { json = data; }
        resolve({ status: res.statusCode, body: json });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🎮 Starting Events & Gamification System Test Suite...\n');
  let passed = 0;
  let failed = 0;

  // Use real DB users
  const teacherA = { id: 1, role: 'teacher', username: 'admin', name: 'أستاذ وثبة' };
  const teacherB = { id: 10, role: 'teacher', username: 'almanara', name: 'أستاذ المنارة' };
  const studentA = { id: 4188, role: 'student', teacher_id: 1, username: 'D5035', name: 'طالب وثبة', academic_stage: 'الصف الثالث الثانوي' };
  const assistantAllow = { id: 10, role: 'assistant', teacher_id: 1, username: 'asst_nour', name: 'مساعد نور', can_manage_events: true };

  const tokenTeacherA = createToken(teacherA);
  const tokenTeacherB = createToken(teacherB);
  const tokenStudentA = createToken(studentA);
  const tokenAsstAllow = createToken(assistantAllow);

  // Test 1: GET /api/events/list for Student
  try {
    const res = await request('GET', '/list', null, tokenStudentA);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(Array.isArray(res.body.games), true);
    assert.strictEqual(res.body.games.length, 4, 'Expected 4 games in catalog');
    const ids = res.body.games.map(g => g.id);
    assert(ids.includes('stickman_run'), 'Should include stickman_run');
    assert(ids.includes('space_blaster'), 'Should include space_blaster');
    assert(ids.includes('tower_of_riddles'), 'Should include tower_of_riddles');
    assert(ids.includes('bubble_blitz'), 'Should include bubble_blitz');

    console.log('  ✓ Test 1: Student events list returns all 4 games in catalog');
    passed++;
  } catch (err) {
    console.error('  ✗ Test 1 Failed:', err.message);
    failed++;
  }

  // Test 2: Teacher A creates custom game questions
  let createdQId = null;
  try {
    const res = await request('POST', '/teacher/questions', {
      game_id: 'space_blaster',
      academic_stage: 'جميع المراحل',
      level_number: 1,
      question_text: 'ما هو أسرع حيوان بري في العالم؟',
      choices: ['الفهد', 'الأسد', 'الحصان', 'الغزال'],
      correct_index: 0,
      time_limit_sec: 40,
      enemy_label: 'سفينة الاستطلاع'
    }, tokenTeacherA);

    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    assert(res.body.id > 0);
    assert.strictEqual(res.body.question_text, 'ما هو أسرع حيوان بري في العالم؟');
    createdQId = res.body.id;

    console.log('  ✓ Test 2: Teacher can create a custom game question');
    passed++;
  } catch (err) {
    console.error('  ✗ Test 2 Failed:', err.message);
    failed++;
  }

  // Test 3: Multi-Tenancy Isolation — Teacher B cannot see Teacher A's questions
  try {
    const resA = await request('GET', '/teacher/questions', null, tokenTeacherA);
    const resB = await request('GET', '/teacher/questions', null, tokenTeacherB);

    assert.strictEqual(resA.status, 200);
    assert.strictEqual(resB.status, 200);

    assert(resA.body.some(q => q.id === createdQId), 'Teacher A must see their question');
    assert(!resB.body.some(q => q.id === createdQId), 'Teacher B must NOT see Teacher A question');

    console.log('  ✓ Test 3: Multi-Tenancy isolation verified across teachers');
    passed++;
  } catch (err) {
    console.error('  ✗ Test 3 Failed:', err.message);
    failed++;
  }

  // Test 4: Student starts a game session
  let testSessionToken = null;
  try {
    const res = await request('POST', '/space_blaster/start', {}, tokenStudentA);

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.success, true);
    assert(res.body.sessionToken && res.body.sessionToken.length > 20, 'Should return session token');
    assert(Array.isArray(res.body.questions) && res.body.questions.length > 0, 'Should return questions');
    // Ensure security: correct_index is NOT leaked to client!
    assert.strictEqual(res.body.questions[0].correct_index, undefined, 'Must not leak correct_index to client');

    testSessionToken = res.body.sessionToken;
    console.log('  ✓ Test 4: Game session start issues secure token & delivers sanitized questions');
    passed++;
  } catch (err) {
    console.error('  ✗ Test 4 Failed:', err.message);
    failed++;
  }

  // Test 5: Student finishes game session with verified points
  try {
    const res = await request('POST', '/space_blaster/finish', {
      sessionToken: testSessionToken,
      answers: [{ questionIndex: 0, selectedIndex: 0 }],
      completed: true,
      rawScore: 800
    }, tokenStudentA);

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.strictEqual(res.body.success, true);
    assert(res.body.pointsEarned > 0, 'Should award calculated points');

    console.log('  ✓ Test 5: Game finish validates session token and awards verified points');
    passed++;
  } catch (err) {
    console.error('  ✗ Test 5 Failed:', err.message);
    failed++;
  }

  // Test 6: Anti-Cheat — Reusing the same session token is rejected
  try {
    const res = await request('POST', '/space_blaster/finish', {
      sessionToken: testSessionToken,
      answers: [{ questionIndex: 0, selectedIndex: 0 }],
      completed: true
    }, tokenStudentA);

    assert.strictEqual(res.status, 403, 'Reused session token must return 403 forbidden');
    console.log('  ✓ Test 6: Anti-cheat token replay rejection verified');
    passed++;
  } catch (err) {
    console.error('  ✗ Test 6 Failed:', err.message);
    failed++;
  }

  // Test 7: Teacher updates game rules & points
  try {
    const res = await request('PUT', '/teacher/config/stickman_run', {
      title: 'سباق الستيكمان المطور',
      points_per_question: 30,
      completion_bonus_points: 75,
      allowed_attempts: 3,
      reset_frequency: 'weekly',
      question_pull_mode: 'unseen_first'
    }, tokenTeacherA);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.title, 'سباق الستيكمان المطور');
    assert.strictEqual(res.body.points_per_question, 30);
    assert.strictEqual(res.body.completion_bonus_points, 75);

    console.log('  ✓ Test 7: Teacher can configure game rules, attempts, and points');
    passed++;
  } catch (err) {
    console.error('  ✗ Test 7 Failed:', err.message);
    failed++;
  }

  // Test 8: Assistant Permission check (can_manage_events)
  try {
    const resAllow = await request('GET', '/teacher/config', null, tokenAsstAllow);
    assert.strictEqual(resAllow.status, 200, `Assistant with permission should pass, got ${resAllow.status}`);

    console.log('  ✓ Test 8: Assistant permissions check (can_manage_events) verified');
    passed++;
  } catch (err) {
    console.error('  ✗ Test 8 Failed:', err.message);
    failed++;
  }

  // Test 9: Teacher Analytics Endpoint
  try {
    const res = await request('GET', '/teacher/analytics', null, tokenTeacherA);
    assert.strictEqual(res.status, 200);
    assert(res.body.overall !== undefined, 'Should return overall KPI object');
    assert(Array.isArray(res.body.perGame), 'Should return perGame array');
    assert(Array.isArray(res.body.topStudents), 'Should return topStudents array');

    console.log('  ✓ Test 9: Teacher analytics & KPI aggregation verified');
    passed++;
  } catch (err) {
    console.error('  ✗ Test 9 Failed:', err.message);
    failed++;
  }

  // Test 10: Delete question cleanup
  if (createdQId) {
    try {
      const res = await request('DELETE', `/teacher/questions/${createdQId}`, null, tokenTeacherA);
      assert.strictEqual(res.status, 200);
      console.log('  ✓ Test 10: Question deletion verified');
      passed++;
    } catch (err) {
      console.error('  ✗ Test 10 Failed:', err.message);
      failed++;
    }
  }

  console.log(`\n🎉 Test Suite Completed: ${passed} passed, ${failed} failed.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal error in tests:', err);
  process.exit(1);
});
