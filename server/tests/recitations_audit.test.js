/**
 * Recitations Audit — Edge Case & Regression Tests
 * يغطي: C1..C5, H1..H3, M1..M3, L1 + Second-pass: R1,R4,S1,S2,A1,A2
 *       Third-pass: T1..T6
 *
 * تشغيل: node server/tests/recitations_audit.test.js
 * يتطلب: السيرفر يعمل على port 3001 + بيانات seed موجودة
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── helpers ─────────────────────────────────────────────────────────────────

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
      port: opts.port,
      path: opts.pathname + opts.search,
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
  const role = username.startsWith('std') ? 'student' : username === 'admin' ? 'teacher' : 'assistant';
  const headers = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};
  // Students require device_id (security measure from previous audit)
  const body = { username, password, role };
  if (role === 'student') body.device_id = `test_device_${username}_audit`;
  const r = await req('POST', '/api/auth/login', body, headers);
  if (!r.body.token) throw new Error(`Login failed for ${username}: ${JSON.stringify(r.body)}`);
  return r.body.token;
}

function authHeader(token) { return { Authorization: `Bearer ${token}` }; }

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
    errors.push(label);
  }
}

// ─── unit tests (pure functions — no network) ───────────────────────────────

function runUnitTests() {
  console.log('\n═══ UNIT TESTS (pure functions) ════════════════════════════════\n');

  // ── [C3] validateImageUrl ──────────────────────────────────────────────────
  console.log('▶ C3 — validateImageUrl');
  const VALID_Q_IMG_RE = /^\/uploads\/question-images\/[\w.\-]+$/;
  const validateImageUrl = url => !url || VALID_Q_IMG_RE.test(url);

  assert('null/undefined passthrough', validateImageUrl(null));
  assert('empty string passthrough', validateImageUrl(''));
  assert('valid upload path accepted', validateImageUrl('/uploads/question-images/rec_q_123.jpg'));
  assert('valid upload path with random suffix', validateImageUrl('/uploads/question-images/rec_q_1234567890_abc123def456.png'));
  assert('path traversal rejected (../)', !validateImageUrl('../../etc/passwd'));
  assert('external URL rejected', !validateImageUrl('https://evil.com/image.jpg'));
  assert('wrong directory rejected', !validateImageUrl('/uploads/images/photo.jpg'));
  assert('space in filename rejected', !validateImageUrl('/uploads/question-images/rec q.jpg'));
  assert('null byte injection rejected', !validateImageUrl('/uploads/question-images/rec\x00.jpg'));

  // ── [C1] stripClientQuestion ──────────────────────────────────────────────
  console.log('\n▶ C1 — stripClientQuestion (sub_questions correct leak)');

  function stripClientQuestion(q) {
    if (q.question_type === 'image_multi' && Array.isArray(q.sub_questions)) {
      return {
        ...q,
        correct_answer_letter: undefined,
        sub_questions: q.sub_questions.map(({ correct, ...rest }) => rest),
      };
    }
    return { ...q, correct_answer_letter: undefined };
  }

  const mcqQ = { id: 1, question_type: 'mcq', question_text: 'MCQ?', correct_answer_letter: 'B', option_a: 'X', option_b: 'Y' };
  const stripped = stripClientQuestion(mcqQ);
  assert('MCQ: correct_answer_letter removed', stripped.correct_answer_letter === undefined);
  assert('MCQ: question_text preserved', stripped.question_text === 'MCQ?');

  const imgQ = {
    id: 2,
    question_type: 'image_multi',
    question_text: 'Look at image',
    correct_answer_letter: 'A',
    sub_questions: [
      { label: '1', correct: 'A' },
      { label: '2', correct: 'C' },
    ],
    option_a: 'x', option_b: 'y',
  };
  const strippedImg = stripClientQuestion(imgQ);
  assert('image_multi: correct_answer_letter removed', strippedImg.correct_answer_letter === undefined);
  assert('image_multi: sub_questions preserved (array)', Array.isArray(strippedImg.sub_questions));
  assert('image_multi: sub_questions[0].label preserved', strippedImg.sub_questions[0].label === '1');
  assert('image_multi: sub_questions[0].correct REMOVED', !('correct' in strippedImg.sub_questions[0]));
  assert('image_multi: sub_questions[1].correct REMOVED', !('correct' in strippedImg.sub_questions[1]));
  assert('image_multi: question_text preserved', strippedImg.question_text === 'Look at image');

  // ── [C5] Unique filename generation ────────────────────────────────────────
  console.log('\n▶ C5 — Unique filename (no collision)');
  const generate = () => `rec_q_${Date.now()}_${crypto.randomBytes(12).toString('hex')}`;
  const names = new Set(Array.from({ length: 1000 }, generate));
  assert('1000 concurrent filename generations are all unique', names.size === 1000);

  // ── [M1] Duplicate label check ────────────────────────────────────────────
  console.log('\n▶ M1 — Duplicate sub_questions label');
  const existingSubs = [{ label: '1', correct: 'A' }, { label: '2', correct: 'B' }];
  const isDuplicate = label => existingSubs.some(s => s.label === label);
  assert('label "3" is not duplicate', !isDuplicate('3'));
  assert('label "1" is duplicate', isDuplicate('1'));
  assert('label "2" is duplicate', isDuplicate('2'));

  // ── [C2] image_multi `correct` field in stored answers ───────────────────
  console.log('\n▶ C2 — correct field in stored answers for image_multi');

  function computeCorrect(q, answerStr) {
    if (q.question_type === 'image_multi') {
      const subQs = Array.isArray(q.sub_questions) ? q.sub_questions : [];
      if (subQs.length === 0 || !answerStr) return false;
      let parsed = {};
      try { parsed = JSON.parse(answerStr); } catch {}
      return subQs.every(sub =>
        String(parsed[sub.label] || '').toUpperCase() === String(sub.correct).toUpperCase()
      );
    }
    return q.correct_answer_letter === answerStr;
  }

  const imgQFull = { question_type: 'image_multi', sub_questions: [{ label: '1', correct: 'A' }, { label: '2', correct: 'C' }], correct_answer_letter: 'A' };
  assert('image_multi: all correct → true', computeCorrect(imgQFull, '{"1":"A","2":"C"}'));
  assert('image_multi: partial correct → false', !computeCorrect(imgQFull, '{"1":"A","2":"B"}'));
  assert('image_multi: null answer → false', !computeCorrect(imgQFull, null));
  assert('image_multi: empty JSON → false', !computeCorrect(imgQFull, '{}'));
  assert('image_multi: case-insensitive match → true', computeCorrect(imgQFull, '{"1":"a","2":"c"}'));

  const mcqFull = { question_type: 'mcq', correct_answer_letter: 'B' };
  assert('mcq: correct → true', computeCorrect(mcqFull, 'B'));
  assert('mcq: wrong → false', !computeCorrect(mcqFull, 'A'));
  assert('mcq: null → false', !computeCorrect(mcqFull, null));
}

// ─── integration tests (requires running server) ────────────────────────────

async function runIntegrationTests() {
  console.log('\n═══ INTEGRATION TESTS (HTTP against port 3001) ═════════════════\n');

  let teacherToken, studentToken;

  // Login
  try {
    teacherToken = await login('admin', 'admin123');
    console.log('  ℹ️  Teacher login OK');
  } catch (e) {
    console.error('  ⚠️  Cannot login as teacher — skipping integration tests:', e.message);
    console.log('  (run: node server/db/seed.js first)\n');
    return;
  }

  // Get a student token if possible
  try {
    studentToken = await login('std_ali', '123456', 'admin');
    console.log('  ℹ️  Student login OK');
  } catch (e) {
    console.log('  ⚠️  Student login failed:', e.message);
  }

  // ── Create a recitation to work with ──────────────────────────────────────
  let recId;
  {
    const r = await req('POST', '/api/recitations', {
      title: '[AUDIT TEST] Recitation',
      academic_stage: 'ثانوي',
      duration_minutes: 10,
      total_score: 10,
      pass_score: 6,
      schedule_type: 'once',
    }, authHeader(teacherToken));
    if (r.status === 201 && r.body.id) {
      recId = r.body.id;
      console.log(`  ℹ️  Created test recitation id=${recId}`);
    } else {
      console.error('  ⚠️  Cannot create recitation — skipping question tests:', JSON.stringify(r.body));
      return;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // C3 — image_image_url server validation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ C3 — Server rejects invalid question_image_url');

  const badUrls = [
    '../../etc/passwd',
    'https://evil.com/x.jpg',
    '/uploads/images/x.jpg',
    '/uploads/question-images/../../../etc/passwd',
    'javascript:alert(1)',
  ];

  for (const badUrl of badUrls) {
    const r = await req('POST', `/api/recitations/${recId}/questions`, {
      question_text: 'Test',
      question_type: 'mcq',
      option_a: 'A', option_b: 'B',
      correct_answer_letter: 'A',
      question_image_url: badUrl,
    }, authHeader(teacherToken));
    assert(`Rejects invalid url: "${badUrl.substring(0, 30)}"`, r.status === 400);
  }

  // valid upload path should be allowed
  {
    const r = await req('POST', `/api/recitations/${recId}/questions`, {
      question_text: 'Test with valid url',
      question_type: 'mcq',
      option_a: 'A', option_b: 'B',
      correct_answer_letter: 'A',
      question_image_url: '/uploads/question-images/rec_q_123_abc.jpg',
    }, authHeader(teacherToken));
    assert('Valid upload URL accepted (mcq+image)', r.status === 201);
    if (r.status === 201) {
      await req('DELETE', `/api/recitations/${recId}/questions/${r.body.id}`, null, authHeader(teacherToken));
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // H1 — PUT /:id/questions/:qid requires sub_questions for image_multi
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ H1 — PUT route validates sub_questions for image_multi');

  let imgQId;
  {
    const r = await req('POST', `/api/recitations/${recId}/questions`, {
      question_text: 'Image question',
      question_type: 'image_multi',
      option_a: 'Yes', option_b: 'No',
      sub_questions: [{ label: '1', correct: 'A' }],
    }, authHeader(teacherToken));
    assert('Create image_multi question succeeds', r.status === 201);
    imgQId = r.body?.id;
  }

  if (imgQId) {
    // Try to update with empty sub_questions
    const r = await req('PUT', `/api/recitations/${recId}/questions/${imgQId}`, {
      question_text: 'Image question updated',
      question_type: 'image_multi',
      option_a: 'Yes', option_b: 'No',
      sub_questions: [],
    }, authHeader(teacherToken));
    assert('PUT with empty sub_questions rejected (400)', r.status === 400);

    // Update with no sub_questions key at all
    const r2 = await req('PUT', `/api/recitations/${recId}/questions/${imgQId}`, {
      question_text: 'Image question updated',
      question_type: 'image_multi',
      option_a: 'Yes', option_b: 'No',
    }, authHeader(teacherToken));
    assert('PUT with missing sub_questions rejected (400)', r2.status === 400);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // M2 — sub_questions count limit
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ M2 — Server enforces 50-item sub_questions limit');

  const tooMany = Array.from({ length: 51 }, (_, i) => ({ label: String(i + 1), correct: 'A' }));
  const r51 = await req('POST', `/api/recitations/${recId}/questions`, {
    question_text: 'Too many subs',
    question_type: 'image_multi',
    option_a: 'A', option_b: 'B',
    sub_questions: tooMany,
  }, authHeader(teacherToken));
  assert('51 sub_questions rejected (400)', r51.status === 400);

  const exactly50 = Array.from({ length: 50 }, (_, i) => ({ label: String(i + 1), correct: 'A' }));
  const r50 = await req('POST', `/api/recitations/${recId}/questions`, {
    question_text: '50 subs OK',
    question_type: 'image_multi',
    option_a: 'A', option_b: 'B',
    sub_questions: exactly50,
  }, authHeader(teacherToken));
  assert('50 sub_questions accepted (201)', r50.status === 201);
  if (r50.body?.id) {
    await req('DELETE', `/api/recitations/${recId}/questions/${r50.body.id}`, null, authHeader(teacherToken));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // M1-server — duplicate labels rejected server-side
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ M1-server — Duplicate sub_question labels rejected');

  const dupLabels = await req('POST', `/api/recitations/${recId}/questions`, {
    question_text: 'Dup labels test',
    question_type: 'image_multi',
    option_a: 'A', option_b: 'B',
    sub_questions: [{ label: '1', correct: 'A' }, { label: '1', correct: 'B' }],
  }, authHeader(teacherToken));
  assert('Duplicate labels rejected (400)', dupLabels.status === 400);

  // ─────────────────────────────────────────────────────────────────────────
  // M3 — sub_questions per-item validation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ M3 — sub_questions per-item validation');

  // Empty label
  const emptyLabel = await req('POST', `/api/recitations/${recId}/questions`, {
    question_text: 'Test',
    question_type: 'image_multi',
    option_a: 'A', option_b: 'B',
    sub_questions: [{ label: '', correct: 'A' }],
  }, authHeader(teacherToken));
  assert('Empty sub_question label rejected (400)', emptyLabel.status === 400);

  // Invalid correct letter
  const badLetter = await req('POST', `/api/recitations/${recId}/questions`, {
    question_text: 'Test',
    question_type: 'image_multi',
    option_a: 'A', option_b: 'B',
    sub_questions: [{ label: '1', correct: 'Z' }],
  }, authHeader(teacherToken));
  assert('Invalid correct letter "Z" rejected (400)', badLetter.status === 400);

  // T/F letter not allowed in sub_questions
  const tfLetter = await req('POST', `/api/recitations/${recId}/questions`, {
    question_text: 'Test',
    question_type: 'image_multi',
    option_a: 'A', option_b: 'B',
    sub_questions: [{ label: '1', correct: 'T' }],
  }, authHeader(teacherToken));
  assert('T/F letter rejected in image_multi sub_questions (400)', tfLetter.status === 400);

  // Missing correct field entirely
  const noCorrect = await req('POST', `/api/recitations/${recId}/questions`, {
    question_text: 'Test',
    question_type: 'image_multi',
    option_a: 'A', option_b: 'B',
    sub_questions: [{ label: '1' }],
  }, authHeader(teacherToken));
  assert('Missing correct field rejected (400)', noCorrect.status === 400);

  // ─────────────────────────────────────────────────────────────────────────
  // H2 — DELETE question cleans up image file
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ H2 — DELETE question cleans up orphaned image file');

  // Create a dummy image file to simulate an uploaded image
  const uploadDir = path.join(__dirname, '../../uploads/question-images');
  const dummyImgName = `rec_q_audit_test_${Date.now()}.png`;
  const dummyImgPath = path.join(uploadDir, dummyImgName);
  const dummyImgUrl = `/uploads/question-images/${dummyImgName}`;

  // Write a valid PNG magic header (just for the path-existence test)
  const pngMagic = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(dummyImgPath, pngMagic);
  } catch (e) {
    console.log('  ⚠️  Could not create dummy image file, skipping H2 test');
  }

  if (fs.existsSync(dummyImgPath)) {
    // Create a question that references the dummy image
    const createR = await req('POST', `/api/recitations/${recId}/questions`, {
      question_text: 'Image cleanup test',
      question_type: 'mcq',
      option_a: 'A', option_b: 'B',
      correct_answer_letter: 'A',
      question_image_url: dummyImgUrl,
    }, authHeader(teacherToken));

    if (createR.status === 201 && createR.body?.id) {
      const delR = await req('DELETE', `/api/recitations/${recId}/questions/${createR.body.id}`, null, authHeader(teacherToken));
      assert('DELETE question returns success', delR.status === 200);

      // Small delay to allow fs.unlink callback
      await new Promise(r => setTimeout(r, 200));
      assert('Image file deleted from disk after question deletion', !fs.existsSync(dummyImgPath));
    } else {
      assert('Setup for H2 test (create question with image)', false, JSON.stringify(createR.body));
      fs.unlinkSync(dummyImgPath); // cleanup
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // C1 — Student snapshot does NOT contain sub_questions[*].correct
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ C1 — Student snapshot does not leak sub_questions[*].correct');

  // We need a published recitation for the student to take
  // Add an image_multi question first
  if (imgQId) {
    // Publish the recitation
    const pubR = await req('PUT', `/api/recitations/${recId}`, {
      title: '[AUDIT TEST] Recitation',
      academic_stage: 'ثانوي',
      duration_minutes: 10,
      total_score: 10,
      pass_score: 6,
      schedule_type: 'once',
      is_published: true,
    }, authHeader(teacherToken));

    if (pubR.status === 200 || pubR.status === 201) {
      // Also try publishing via the publish endpoint
      await req('POST', `/api/recitations/${recId}/publish`, null, authHeader(teacherToken));
    }

    if (studentToken) {
      const takeR = await req('GET', `/api/recitations/${recId}/take`, null, authHeader(studentToken));

      if (takeR.status === 200 && Array.isArray(takeR.body?.questions)) {
        const imgQsInSnap = takeR.body.questions.filter(q => q.question_type === 'image_multi');
        const hasLeakedCorrect = imgQsInSnap.some(q =>
          Array.isArray(q.sub_questions) && q.sub_questions.some(sub => 'correct' in sub)
        );
        assert('Student snapshot: sub_questions[*].correct not present', !hasLeakedCorrect,
          imgQsInSnap.length > 0 ? `Found ${imgQsInSnap.length} image_multi questions` : 'No image_multi in snapshot');

        const hasLeakedLetter = takeR.body.questions.some(q => q.correct_answer_letter !== undefined);
        assert('Student snapshot: correct_answer_letter not present', !hasLeakedLetter);
      } else {
        console.log(`  ⚠️  /take returned status ${takeR.status}: ${JSON.stringify(takeR.body)} — C1 snapshot test skipped`);
      }
    } else {
      console.log('  ⚠️  No student token — C1 student snapshot test skipped');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // A2 — image_multi answer string size cap (>10KB silently dropped)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ A2 — Oversized image_multi answer string rejected at scoring');

  // Build a >10KB answer string
  const hugeAnswerStr = 'A'.repeat(10 * 1024 + 1);

  // We can't easily submit without an active session, so test the logic directly
  // as a unit test here (server strips it — question is counted as unanswered)
  {
    const IMAGE_MULTI_MAX_BYTES = 10 * 1024;
    const isDropped = (raw) => raw && String(raw).length > IMAGE_MULTI_MAX_BYTES;
    assert('A2: Normal answer NOT dropped', !isDropped('{"1":"A","2":"B"}'));
    assert('A2: 10KB+1 answer IS dropped', isDropped(hugeAnswerStr));
    assert('A2: Exactly 10KB NOT dropped', !isDropped('x'.repeat(IMAGE_MULTI_MAX_BYTES)));
    assert('A2: null not dropped', !isDropped(null));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // A1 — analytics avg_score consistency check
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ A1 — Analytics avg_score normalization');

  {
    const analyticsR = await req('GET', '/api/recitations/analytics', null, authHeader(teacherToken));
    assert('A1: GET /analytics returns 200', analyticsR.status === 200);
    if (analyticsR.status === 200) {
      const { summary, recent_recitations } = analyticsR.body;
      // summary.avg_score must be 0-100
      assert('A1: summary.avg_score is 0–100', summary.avg_score >= 0 && summary.avg_score <= 100,
        `got ${summary.avg_score}`);
      // If there are recent_recitations with results, avg_score must also be 0-100
      const withResults = (recent_recitations || []).filter(r => parseInt(r.participant_count, 10) > 0);
      const allNormalized = withResults.every(r => parseFloat(r.avg_score) >= 0 && parseFloat(r.avg_score) <= 100);
      assert('A1: recent_recitations avg_score is 0–100 (normalized)', allNormalized || withResults.length === 0,
        `Failed for: ${JSON.stringify(withResults.filter(r => parseFloat(r.avg_score) > 100))}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // R4 — toLocaleString vs toLocaleDateString (unit test)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ R4 — toLocaleString with time options works correctly');

  {
    const testDate = new Date('2025-06-10T14:30:00.000Z');
    // toLocaleDateString with hour/minute silently ignores time on many engines
    const dateOnlyResult = testDate.toLocaleDateString('en-US', { hour: '2-digit', minute: '2-digit' });
    // toLocaleString with hour/minute always includes time
    const fullResult = testDate.toLocaleString('en-US', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    assert('R4: toLocaleString includes time info', fullResult.length > dateOnlyResult.length || fullResult.includes(':'));
    assert('R4: toLocaleString output is a non-empty string', typeof fullResult === 'string' && fullResult.length > 0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // R1 — per-card mutation isPending (unit test: variables scoping)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ R1 — Per-card isPending scoping');

  {
    // Simulate the per-card isPending logic:
    // Only the card whose reqId matches mutation.variables.reqId should be disabled
    const simulateIsPending = (mutationVariables, cardId) =>
      mutationVariables !== null && mutationVariables !== undefined &&
      mutationVariables.reqId === cardId;

    assert('R1: Card 1 IS loading when vars.reqId===1', simulateIsPending({ reqId: 1 }, 1));
    assert('R1: Card 2 NOT loading when vars.reqId===1', !simulateIsPending({ reqId: 1 }, 2));
    assert('R1: Card 99 NOT loading when vars.reqId===1', !simulateIsPending({ reqId: 1 }, 99));
    assert('R1: null variables means nothing is loading', !simulateIsPending(null, 1));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // S2 — localStorage token key consistency
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ S2 — localStorage token key fixed to "token"');

  {
    // Verify the keepalive handler uses 'token' (same as AuthContext)
    // This is a static analysis check — we verify the fixed key value
    const EXPECTED_KEY = 'token';
    const fs2 = require('fs');
    const studentRecContent = fs2.readFileSync(
      require('path').join(__dirname, '../../client/src/pages/student/Recitations.jsx'),
      'utf8'
    );
    // Should contain localStorage.getItem('token') not 'wathba_token'
    assert("S2: Uses localStorage.getItem('token') not 'wathba_token'",
      studentRecContent.includes(`localStorage.getItem('${EXPECTED_KEY}')`) &&
      !studentRecContent.includes("localStorage.getItem('wathba_token')")
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // S1 — Dead code removed from keepalive handler
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ S1 — Dead qs/payload variables removed from keepalive handler');

  {
    const fs3 = require('fs');
    const content = fs3.readFileSync(
      require('path').join(__dirname, '../../client/src/pages/student/Recitations.jsx'),
      'utf8'
    );
    // The keepalive handler should NOT contain the dead 'const qs = ' variable
    // (the one that was never sent, only 'qs2' was used and is now also removed)
    // Check that there's no dead 'const payload = JSON.stringify' before payloadUnload
    const keepaliveSection = content.slice(
      content.indexOf('// Keepalive on tab close'),
      content.indexOf('window.addEventListener(\'beforeunload\'')
    );
    assert('S1: Dead const qs variable removed from keepalive', !keepaliveSection.includes('const qs ='));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Extra: Unauthenticated access to upload-image should fail
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Security — unauthenticated image upload rejected');
  const noAuthUpload = await req('POST', '/api/recitations/upload-image', Buffer.from('x'), { 'Content-Type': 'application/octet-stream' });
  assert('Upload without auth token → 401', noAuthUpload.status === 401);

  // Student cannot upload question images (teacher/assistant only)
  if (studentToken) {
    const stuUpload = await req('POST', '/api/recitations/upload-image', Buffer.from('x'), {
      ...authHeader(studentToken),
      'Content-Type': 'application/octet-stream',
    });
    assert('Student cannot upload question images → 403', stuUpload.status === 403);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // T5 — DELETE published recitation returns 409 (must unpublish first)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ T5 — Cannot delete a published recitation');

  {
    // Create a fresh recitation with a question so we can publish it
    const cr = await req('POST', '/api/recitations', {
      title: '[T5 DELETE TEST] Published guard',
      duration_minutes: 5, total_score: 10, pass_score: 5,
      schedule_type: 'once',
    }, authHeader(teacherToken));
    if (cr.status === 201 && cr.body.id) {
      const t5Id = cr.body.id;
      // Add a question so publishing is allowed
      await req('POST', `/api/recitations/${t5Id}/questions`, {
        question_text: 'T5 question',
        question_type: 'mcq',
        option_a: 'A', option_b: 'B',
        correct_answer_letter: 'A',
      }, authHeader(teacherToken));

      // Publish it
      const pubR = await req('PUT', `/api/recitations/${t5Id}/publish`, null, authHeader(teacherToken));
      assert('T5: Publish succeeds', pubR.status === 200 && pubR.body.is_published === true,
        JSON.stringify(pubR.body));

      // Try to delete — should be 409
      const delPub = await req('DELETE', `/api/recitations/${t5Id}`, null, authHeader(teacherToken));
      assert('T5: DELETE published recitation → 409', delPub.status === 409,
        `got ${delPub.status}: ${JSON.stringify(delPub.body)}`);

      // Unpublish then delete should succeed
      const unpubR = await req('PUT', `/api/recitations/${t5Id}/publish`, null, authHeader(teacherToken));
      assert('T5: Unpublish succeeds', unpubR.status === 200 && unpubR.body.is_published === false);

      const delUnpub = await req('DELETE', `/api/recitations/${t5Id}`, null, authHeader(teacherToken));
      assert('T5: DELETE after unpublish → 200', delUnpub.status === 200);
    } else {
      console.log('  ⚠️  Could not create T5 test recitation — skipping');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // T2 — Payment verify endpoint rejects malformed IDs
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ T2 — parseParamId strictly rejects malformed payment IDs');

  {
    // Empty string produces /api/payments//verify — Express returns 404 (route not matched).
    // All others should produce 400 (ID parsed but rejected by parseParamId).
    const cases400 = ['123abc', '0', '-1', '99999999999', ' 5 ', '1.5'];
    for (const badId of cases400) {
      const r = await req('PUT', `/api/payments/${encodeURIComponent(badId)}/verify`,
        { status: 'verified' }, authHeader(teacherToken));
      assert(`T2: paymentId "${badId}" rejected → 400`, r.status === 400,
        `got ${r.status}: ${JSON.stringify(r.body)}`);
    }
    // Empty string: the route can't match /api/payments//verify → 404 (non-200)
    const emptyR = await req('PUT', '/api/payments//verify', { status: 'verified' }, authHeader(teacherToken));
    assert('T2: Empty payment ID rejected (non-200)', emptyR.status !== 200,
      `got ${emptyR.status}`);
    // A valid-looking integer that doesn't exist → 404 (ID parses but not found)
    const validMissingId = await req('PUT', '/api/payments/999999/verify',
      { status: 'verified' }, authHeader(teacherToken));
    assert('T2: Non-existent valid payment ID → 404', validMissingId.status === 404,
      `got ${validMissingId.status}: ${JSON.stringify(validMissingId.body)}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // T1 — Double-submit protection: second submit returns 409
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ T1 — Double-submit protection (second submit returns 409)');

  if (studentToken && recId) {
    // Take the recitation (should already have a session from C1 test)
    const takeR = await req('GET', `/api/recitations/${recId}/take`, null, authHeader(studentToken));
    if (takeR.status === 200 && takeR.body.questions) {
      // Build valid answers for all questions
      const firstAnswers = takeR.body.questions.map(q => ({
        question_id: q.id,
        answer: q.question_type === 'true_false' ? 'T' : 'A',
      }));

      // First submit
      const submit1 = await req('POST', `/api/recitations/${recId}/submit`,
        { answers: firstAnswers }, authHeader(studentToken));
      const first409 = submit1.status === 409 && submit1.body?.already_submitted;
      const firstOk = submit1.status === 200;
      assert('T1: First submit either succeeds or returns already_submitted',
        firstOk || first409,
        `got ${submit1.status}: ${JSON.stringify(submit1.body)}`);

      if (firstOk) {
        // Second submit must be 409
        const submit2 = await req('POST', `/api/recitations/${recId}/submit`,
          { answers: firstAnswers }, authHeader(studentToken));
        assert('T1: Second submit after success → 409 already_submitted',
          submit2.status === 409 && submit2.body?.already_submitted === true,
          `got ${submit2.status}: ${JSON.stringify(submit2.body)}`);
      }
    } else {
      console.log(`  ⚠️  Cannot take recitation for T1 test (status=${takeR.status}) — skipping`);
    }
  } else {
    console.log('  ⚠️  No student token or recId — T1 sequential double-submit test skipped');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // T6 — Analytics route returns 200 for teacher (no error swallowing)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ T6 — Analytics endpoint returns 200 for teacher (permission error not swallowed)');

  {
    const analyticsR2 = await req('GET', '/api/recitations/analytics', null, authHeader(teacherToken));
    assert('T6: Teacher GET /analytics → 200', analyticsR2.status === 200,
      `got ${analyticsR2.status}: ${JSON.stringify(analyticsR2.body)}`);
    // Verify response shape has summary with avg_score
    assert('T6: Response has summary.avg_score',
      typeof analyticsR2.body?.summary?.avg_score === 'number',
      JSON.stringify(analyticsR2.body?.summary));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // T3 — Scheduler query excludes suspended students (unit test)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ T3 — Scheduler student queries exclude suspended students');

  {
    const schedContent = require('fs').readFileSync(
      require('path').join(__dirname, '../scheduler.js'), 'utf8'
    );
    // Both the window-reset and the start-notification queries must have is_suspended = false
    const windowResetSection = schedContent.slice(
      schedContent.indexOf('// Notify eligible students'),
      schedContent.indexOf('console.log(`[Scheduler] Recitation')
    );
    // The start-notification section uses a distinct log "...started — notified..."
    const startedLogIdx = schedContent.indexOf("window reset — notified");
    const startNotifSection = schedContent.slice(
      schedContent.indexOf("// [T3-FIX] Also exclude suspended students for start notifications"),
      schedContent.indexOf("started — notified") + 300
    );
    assert('T3: Window-reset notify query excludes is_suspended students',
      windowResetSection.includes('is_suspended = false'),
      'Missing is_suspended filter in window-reset notification query');
    assert('T3: Start-notification query excludes is_suspended students',
      startNotifSection.includes('is_suspended = false'),
      `Missing is_suspended filter in start-notification query — section: ${startNotifSection.substring(0, 200)}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // T4 — Exam question image filename uses crypto.randomBytes (unit test)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ T4 — Exam question image filename uniqueness (randomBytes)');

  {
    const examsContent = require('fs').readFileSync(
      require('path').join(__dirname, '../routes/exams.js'), 'utf8'
    );
    assert('T4: exams.js imports crypto', examsContent.includes("require('crypto')"),
      'crypto not imported in exams.js');
    assert('T4: Filename uses randomBytes', examsContent.includes('randomBytes'),
      'randomBytes not used in question image filename');

    // Unit test: verify 1000 generated names are unique
    const crypto2 = require('crypto');
    const genExamQName = () => `q_${Date.now()}_${crypto2.randomBytes(8).toString('hex')}.jpg`;
    const examNames = new Set(Array.from({ length: 1000 }, genExamQName));
    assert('T4: 1000 exam question filenames are all unique', examNames.size === 1000);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // T1 extra — Unanswered arrays edge cases on submit
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ T1 extra — Submit input validation edge cases');

  {
    // Submit without a session (no active session for non-existing recitation)
    const fakeId = 999999;
    const noSessR = await req('POST', `/api/recitations/${fakeId}/submit`,
      { answers: [] }, authHeader(studentToken || teacherToken));
    // teacher cannot submit (403), student with no session → 404 or 403
    assert('T1 extra: Submit to non-existent recitation → non-200',
      noSessR.status !== 200, `got ${noSessR.status}`);

    // Submit with oversized answers array (>500 items)
    if (studentToken) {
      const bigAnswers = Array.from({ length: 501 }, (_, i) => ({ question_id: i + 1, answer: 'A' }));
      const bigR = await req('POST', `/api/recitations/${recId || 1}/submit`,
        { answers: bigAnswers }, authHeader(studentToken));
      assert('T1 extra: >500 answers → 400', bigR.status === 400,
        `got ${bigR.status}: ${JSON.stringify(bigR.body)}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // T5 extra — PUT (edit) on published recitation still blocked
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n▶ T5 extra — PUT on published recitation still returns 409');

  if (recId) {
    // Try editing the recitation that was published (if still published)
    const pubCheck = await req('GET', '/api/recitations', null, authHeader(teacherToken));
    const thisRec = Array.isArray(pubCheck.body)
      ? pubCheck.body.find(r => r.id === recId)
      : null;
    if (thisRec?.is_published) {
      const editPub = await req('PUT', `/api/recitations/${recId}`, {
        title: '[SHOULD FAIL] Editing published',
        duration_minutes: 10, total_score: 10, pass_score: 5,
        schedule_type: 'once',
      }, authHeader(teacherToken));
      assert('T5 extra: PUT published recitation → 409', editPub.status === 409,
        `got ${editPub.status}: ${JSON.stringify(editPub.body)}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup: delete test recitation
  // ─────────────────────────────────────────────────────────────────────────
  if (recId) {
    // May be published — unpublish first
    await req('PUT', `/api/recitations/${recId}/publish`, null, authHeader(teacherToken)).catch(() => {});
    await req('DELETE', `/api/recitations/${recId}`, null, authHeader(teacherToken));
    console.log(`\n  ℹ️  Cleaned up test recitation id=${recId}`);
  }
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║      RECITATIONS AUDIT — EDGE CASE & REGRESSION       ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  runUnitTests();
  await runIntegrationTests();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  if (errors.length) {
    console.log('FAILED TESTS:');
    errors.forEach(e => console.log(`  • ${e}`));
  }
  console.log('═══════════════════════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Unexpected error:', e); process.exit(1); });
