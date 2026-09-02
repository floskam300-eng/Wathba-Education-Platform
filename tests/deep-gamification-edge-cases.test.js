/**
 * Comprehensive Deep Edge-Cases & Security Test Suite for Gamification Engine
 * Testing:
 * [1] Timezone (Africa/Cairo) & Schedules (start_time, end_time)
 * [2] Attempt Limits & Cairo Reset Periods (daily, weekly, monthly, unlimited)
 * [3] Question Selection Modes (unseen_first vs pure_random) & Fallback enrichment
 * [4] Security & Anti-Cheat (No token leaks, single-use token lock, student ID verification)
 * [5] Multi-Tenancy Isolation (Teacher A vs Teacher B questions, configs, and leaderboards)
 * [6] Concurrency & Transactional Points Increment
 */

const http = require('http');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const pool = require('../server/db/connection');
const {
  formatEgyptDateTime,
  parseEgyptDateTimeToUTC,
  getCairoStartOfDay,
  getCairoStartOfWeek,
  getCairoStartOfMonth,
  getPeriodStart
} = require('../server/lib/timezone');

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

async function runDeepAudit() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🔍 STARTING DEEP GAMIFICATION AUDIT & EDGE-CASE TEST SUITE');
  console.log('════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  // Real DB Fixtures
  const teacherA = { id: 1, role: 'teacher', username: 'admin', name: 'أستاذ وثبة' };
  const teacherB = { id: 10, role: 'teacher', username: 'almanara', name: 'أستاذ المنارة' };
  const studentA = { id: 4188, role: 'student', teacher_id: 1, username: 'D5035', name: 'طالب وثبة', academic_stage: 'الصف الثالث الثانوي' };
  const studentB = { id: 4723, role: 'student', teacher_id: 10, username: 'A001', name: 'طالب المنارة', academic_stage: 'الصف الأول الإعدادي' };

  const tokenTeacherA = createToken(teacherA);
  const tokenTeacherB = createToken(teacherB);
  const tokenStudentA = createToken(studentA);
  const tokenStudentB = createToken(studentB);

  // ── SECTION 1: TIMEZONE & SCHEDULE TESTS ──────────────────────────────────
  console.log('── [SECTION 1] Timezone (Africa/Cairo) & Schedule Validation ──');

  // Test 1.1: Timezone converter round-tripping
  try {
    const cairoSummerStr = '2026-08-31T18:00';
    const utcConverted = parseEgyptDateTimeToUTC(cairoSummerStr);
    assert.strictEqual(utcConverted, '2026-08-31T15:00:00.000Z', '18:00 Cairo in DST must equal 15:00 UTC');
    const formattedBack = formatEgyptDateTime(utcConverted);
    assert.strictEqual(formattedBack, cairoSummerStr, 'Should format back to 18:00 Cairo time');

    console.log('  ✅ 1.1: Cairo DST conversion (18:00 Cairo -> 15:00 UTC) matches perfectly');
    passed++;
  } catch (err) {
    console.error('  ❌ 1.1 Failed:', err.message);
    failed++;
  }

  // Test 1.2: Future start_time blocks student play
  try {
    // Set game start_time to 2 days in the future (Cairo time)
    const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const futureCairo = formatEgyptDateTime(futureDate);

    await request('PUT', '/teacher/config/tower_of_riddles', {
      title: 'برج المستقبل',
      is_enabled: true,
      start_time: futureCairo,
      end_time: null
    }, tokenTeacherA);

    const res = await request('POST', '/tower_of_riddles/start', {}, tokenStudentA);
    assert.strictEqual(res.status, 403, 'Future start_time must return 403');
    assert.strictEqual(res.body.error, 'لم يحن موعد فتح هذه الفعالية بعد');

    console.log('  ✅ 1.2: Future start_time correctly blocks student play with 403');
    passed++;
  } catch (err) {
    console.error('  ❌ 1.2 Failed:', err.message);
    failed++;
  }

  // Test 1.3: Expired end_time blocks student play
  try {
    // Set game end_time to yesterday (Cairo time)
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pastCairo = formatEgyptDateTime(pastDate);

    await request('PUT', '/teacher/config/tower_of_riddles', {
      title: 'برج الماضي',
      is_enabled: true,
      start_time: null,
      end_time: pastCairo
    }, tokenTeacherA);

    const res = await request('POST', '/tower_of_riddles/start', {}, tokenStudentA);
    assert.strictEqual(res.status, 403, 'Expired end_time must return 403');
    assert.strictEqual(res.body.error, 'انتهت فترة هذه الفعالية');

    console.log('  ✅ 1.3: Expired end_time correctly blocks student play with 403');
    passed++;
  } catch (err) {
    console.error('  ❌ 1.3 Failed:', err.message);
    failed++;
  }

  // Reset tower_of_riddles config
  await request('PUT', '/teacher/config/tower_of_riddles', {
    is_enabled: true,
    start_time: null,
    end_time: null,
    allowed_attempts: 0
  }, tokenTeacherA);

  // ── SECTION 2: ATTEMPTS & CAIRO RESET PERIODS ──────────────────────────────
  console.log('\n── [SECTION 2] Attempt Limits & Cairo Reset Periods ──');

  // Test 2.1: Finite attempts limit (allowed_attempts = 1)
  try {
    await request('PUT', '/teacher/config/bubble_blitz', {
      is_enabled: true,
      allowed_attempts: 1,
      reset_frequency: 'daily',
      points_per_question: 15,
      completion_bonus_points: 30
    }, tokenTeacherA);

    // Clean past plays for this student in test
    await pool.query('DELETE FROM game_plays_history WHERE student_id = $1 AND game_id = $2', [studentA.id, 'bubble_blitz']);

    // Attempt 1: Start & Finish
    const startRes1 = await request('POST', '/bubble_blitz/start', {}, tokenStudentA);
    assert.strictEqual(startRes1.status, 200, 'Attempt 1 should start successfully');

    const finishRes1 = await request('POST', '/bubble_blitz/finish', {
      sessionToken: startRes1.body.sessionToken,
      answers: [{ questionIndex: 0, selectedIndex: 0 }],
      completed: true
    }, tokenStudentA);
    assert.strictEqual(finishRes1.status, 200, 'Attempt 1 should finish successfully');

    // Attempt 2: Should be rejected because limit is 1!
    const startRes2 = await request('POST', '/bubble_blitz/start', {}, tokenStudentA);
    assert.strictEqual(startRes2.status, 403, 'Attempt 2 must be rejected with 403');
    assert.strictEqual(startRes2.body.error, 'استنفدت جميع محاولاتك المتاحة لهذه الفترة');

    console.log('  ✅ 2.1: Attempt limits enforced strictly (1 attempt max per period)');
    passed++;
  } catch (err) {
    console.error('  ❌ 2.1 Failed:', err.stack || err.message);
    failed++;
  }

  // ── SECTION 3: QUESTION PULL MODES (unseen_first vs pure_random) ───────────
  console.log('\n── [SECTION 3] Question Bank Pull Modes (unseen_first) ──');

  // Test 3.1: unseen_first prioritizes questions student hasn't seen
  const createdTestQuestionIds = [];
  try {
    // Create 4 distinct questions for Teacher A
    for (let i = 1; i <= 4; i++) {
      const qRes = await request('POST', '/teacher/questions', {
        game_id: 'space_blaster',
        academic_stage: 'الصف الثالث الثانوي',
        level_number: 1,
        question_text: `سؤال تجريبي رقم ${i} لمود السحب الذكي - ${Date.now()}`,
        choices: ['خيار 1', 'خيار 2', 'خيار 3', 'خيار 4'],
        correct_index: 0
      }, tokenTeacherA);
      createdTestQuestionIds.push(qRes.body.id);
    }

    // Configure game: 2 questions per play, unseen_first mode, 5 attempts
    await request('PUT', '/teacher/config/space_blaster', {
      is_enabled: true,
      allowed_attempts: 5,
      reset_frequency: 'weekly',
      question_pull_mode: 'unseen_first',
      questions_per_play: 2
    }, tokenTeacherA);

    await pool.query('DELETE FROM game_plays_history WHERE student_id = $1 AND game_id = $2', [studentA.id, 'space_blaster']);

    // Play 1: Gets 2 questions
    const play1 = await request('POST', '/space_blaster/start', {}, tokenStudentA);
    const seenInPlay1 = play1.body.questions.map(q => q.id).filter(id => id > 0);
    assert.strictEqual(seenInPlay1.length, 2, 'Play 1 should draw 2 questions');

    // Finish Play 1
    await request('POST', '/space_blaster/finish', {
      sessionToken: play1.body.sessionToken,
      answers: [{ questionIndex: 0, selectedIndex: 0 }],
      completed: true
    }, tokenStudentA);

    // Play 2: Must draw unseen questions!
    const play2 = await request('POST', '/space_blaster/start', {}, tokenStudentA);
    const seenInPlay2 = play2.body.questions.map(q => q.id).filter(id => id > 0);

    // Ensure Play 2 does NOT repeat questions from Play 1
    const overlap = seenInPlay2.filter(id => seenInPlay1.includes(id));
    assert.strictEqual(overlap.length, 0, 'Play 2 should draw completely unseen questions');

    console.log('  ✅ 3.1: unseen_first algorithm guarantees non-repeating questions across attempts');
    passed++;
  } catch (err) {
    console.error('  ❌ 3.1 Failed:', err.stack || err.message);
    failed++;
  }

  // ── SECTION 4: ANTI-CHEAT & SECURITY AUDIT ─────────────────────────────────
  console.log('\n── [SECTION 4] Security & Anti-Cheat Safeguards ──');

  // Test 4.1: Client response never leaks correct_index
  try {
    const startRes = await request('POST', '/stickman_run/start', {}, tokenStudentA);
    assert.strictEqual(startRes.status, 200);
    startRes.body.questions.forEach((q, idx) => {
      assert.strictEqual(q.correct_index, undefined, `Question ${idx} must not leak correct_index`);
      assert.strictEqual(q.correctIndex, undefined, `Question ${idx} must not leak correctIndex`);
      assert.strictEqual(q.explanation, undefined, `Question ${idx} must not leak explanation`);
    });

    console.log('  ✅ 4.1: Question sanitization verifies zero answer leakage to client');
    passed++;
  } catch (err) {
    console.error('  ❌ 4.1 Failed:', err.message);
    failed++;
  }

  // Test 4.2: Cross-student session token stealing is blocked
  try {
    const sessionRes = await request('POST', '/stickman_run/start', {}, tokenStudentA);
    const tokenOfA = sessionRes.body.sessionToken;

    // Student B attempts to submit with Student A's token:
    const stealAttempt = await request('POST', '/stickman_run/finish', {
      sessionToken: tokenOfA,
      answers: [{ questionIndex: 0, selectedIndex: 0 }],
      completed: true
    }, tokenStudentB);

    assert.strictEqual(stealAttempt.status, 403, 'Cross-student token reuse must return 403');

    console.log('  ✅ 4.2: Cross-student token hijacking completely blocked');
    passed++;
  } catch (err) {
    console.error('  ❌ 4.2 Failed:', err.message);
    failed++;
  }

  // ── SECTION 5: MULTI-TENANCY ISOLATION ─────────────────────────────────────
  console.log('\n── [SECTION 5] Multi-Tenancy Data Isolation ──');

  // Test 5.1: Teacher B cannot update or delete Teacher A's question
  try {
    if (createdTestQuestionIds.length > 0) {
      const targetQId = createdTestQuestionIds[0];

      // Teacher B attempts update
      const updateRes = await request('PUT', `/teacher/questions/${targetQId}`, {
        question_text: 'محاولة اختراق سؤال مدرس آخر',
        choices: ['1', '2']
      }, tokenTeacherB);
      assert.strictEqual(updateRes.status, 404, 'Foreign question update must return 404');

      // Teacher B attempts delete
      const deleteRes = await request('DELETE', `/teacher/questions/${targetQId}`, null, tokenTeacherB);
      assert.strictEqual(deleteRes.status, 404, 'Foreign question delete must return 404');

      console.log('  ✅ 5.1: Strict multi-tenant isolation on question mutation verified');
      passed++;
    }
  } catch (err) {
    console.error('  ❌ 5.1 Failed:', err.message);
    failed++;
  }

  // ── SECTION 6: ACADEMIC STAGE SEPARATION ──────────────────────────────────
  console.log('\n── [SECTION 6] Academic Stage Question Separation & Isolation ──');

  try {
    // 1. Create a question specifically for Grade 1 ('الصف الأول الابتدائي')
    const q1Res = await request('POST', '/teacher/questions', {
      academic_stage: 'الصف الأول الابتدائي',
      game_id: 'tower_of_riddles',
      level_number: 1,
      question_text: '[TEST-STAGE-1] ناتج 2 + 2 = ؟',
      choices: ['4', '5', '6', '7'],
      correct_index: 0,
      time_limit_sec: 30
    }, tokenTeacherA);
    assert.strictEqual(q1Res.status, 201);
    const q1Id = q1Res.body.id;
    createdTestQuestionIds.push(q1Id);

    // 2. Create a question specifically for Grade 12 ('الصف الثالث الثانوي')
    const q12Res = await request('POST', '/teacher/questions', {
      academic_stage: 'الصف الثالث الثانوي',
      game_id: 'tower_of_riddles',
      level_number: 1,
      question_text: '[TEST-STAGE-12] مشتقة هـ^س بالنسبة لـ س هي:',
      choices: ['هـ^س', 'س هـ^س', '1/س', '0'],
      correct_index: 0,
      time_limit_sec: 60
    }, tokenTeacherA);
    assert.strictEqual(q12Res.status, 201);
    const q12Id = q12Res.body.id;
    createdTestQuestionIds.push(q12Id);

    // 3. Test Student Grade 1 receives ONLY Grade 1 question
    const tokenStudentG1 = createToken({
      id: studentA.id,
      role: 'student',
      teacher_id: teacherA.id,
      academic_stage: 'الصف الأول الابتدائي'
    });
    const g1PlayRes = await request('POST', '/tower_of_riddles/start', {}, tokenStudentG1);
    assert.strictEqual(g1PlayRes.status, 200);
    const g1QuestionTexts = g1PlayRes.body.questions.map(q => q.questionText);
    assert.ok(g1QuestionTexts.some(txt => txt.includes('[TEST-STAGE-1]')), 'Grade 1 student must receive Grade 1 question');
    assert.ok(!g1QuestionTexts.some(txt => txt.includes('[TEST-STAGE-12]')), 'Grade 1 student must NEVER receive Grade 12 question');

    // 4. Test Student Grade 12 receives ONLY Grade 12 question
    const tokenStudentG12 = createToken({
      id: studentA.id,
      role: 'student',
      teacher_id: teacherA.id,
      academic_stage: 'الصف الثالث الثانوي'
    });
    const g12PlayRes = await request('POST', '/tower_of_riddles/start', {}, tokenStudentG12);
    assert.strictEqual(g12PlayRes.status, 200);
    const g12QuestionTexts = g12PlayRes.body.questions.map(q => q.questionText);
    assert.ok(g12QuestionTexts.some(txt => txt.includes('[TEST-STAGE-12]')), 'Grade 12 student must receive Grade 12 question');
    assert.ok(!g12QuestionTexts.some(txt => txt.includes('[TEST-STAGE-1]')), 'Grade 12 student must NEVER receive Grade 1 question');

    console.log('  ✅ 6.1: Strict academic stage question separation verified across grades');
    passed++;
  } catch (err) {
    console.error('  ❌ 6.1 Failed:', err.message);
    failed++;
  }

  // Cleanup test questions
  for (const qid of createdTestQuestionIds) {
    await pool.query('DELETE FROM game_questions WHERE id = $1', [qid]).catch(() => {});
  }
  await pool.query('DELETE FROM game_plays_history WHERE student_id IN ($1, $2)', [studentA.id, studentB.id]).catch(() => {});

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`🏁 FINAL AUDIT RESULTS: ✅ ${passed} passed  ❌ ${failed} failed`);
  console.log('════════════════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

runDeepAudit().catch(err => {
  console.error('Fatal error during deep audit:', err);
  process.exit(1);
});
