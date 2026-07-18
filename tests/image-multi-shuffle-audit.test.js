/**
 * image_multi shuffle & review audit — covers 5 bugs fixed:
 *
 * BUG-1  exams.js /take: shuffle_options for image_multi NOT applied to bank exams
 * BUG-2  recitations.js review: sub_results missing option_labels
 * BUG-3  Exams.jsx: phantom option buttons (hardcoded 4 letters for 2-option sub-q)
 *        → verified server-side: server must return exactly the right option_labels count
 * BUG-4  ExamReviewModal: phantom listLetters (same root; validated via /review response)
 * BUG-5  RecitationReviewPage: wrong answered/wrong/unanswered counts for image_multi
 *        → validated indirectly via correct sub_results.student_answer shape
 *
 * Run: node tests/image-multi-shuffle-audit.test.js
 * Prerequisites: server running on PORT (default 3001)
 */

'use strict';
require('dotenv').config();
const pool   = require('../server/db/connection');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const http   = require('http');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
const PORT = parseInt(process.env.PORT || '3001', 10);

let passed = 0, failed = 0;
const T = {};

// ── helpers ─────────────────────────────────────────────────────────────────

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

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function assertDeepEqual(a, b, msg) { assertEqual(a, b, msg); }

function request(method, path, body, token, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    };
    const req = http.request({ hostname: 'localhost', port: PORT, path, method, headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function slug() { return `_im_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
function makeToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h', jwtid: crypto.randomUUID() });
}

// ── seededShuffle — must exactly mirror server/routes/recitations.js & exams.js ─
// Server uses:  s = (s * 1664525 + 1013904223) >>> 0;  j = s % (i + 1)
// NOT the fraction-division variant — they produce different j values.
function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleImgMultiSubQs(subQs, baseSeed, questionId) {
  const LETTERS = ['A', 'B', 'C', 'D'];
  return subQs.map((sub, subIdx) => {
    if (sub.type === 'true_false') return sub;
    const optCount = sub.option_labels ? Math.min(sub.option_labels.length, 4) : 4;
    if (optCount < 2) return sub;
    const origPositions = Array.from({ length: optCount }, (_, i) => i);
    const subSeed = ((baseSeed >>> 0) ^ ((questionId * 1000003) >>> 0) ^ ((subIdx * 31337) >>> 0)) >>> 0;
    const shuffled = seededShuffle(origPositions, subSeed || 1);
    const origCorrectIdx = LETTERS.indexOf(String(sub.correct || '').toUpperCase());
    const newCorrectIdx  = shuffled.indexOf(origCorrectIdx);
    const newCorrect     = (origCorrectIdx >= 0 && newCorrectIdx >= 0) ? LETTERS[newCorrectIdx] : sub.correct;
    const newOptionLabels = sub.option_labels
      ? shuffled.map(origIdx => sub.option_labels[origIdx] !== undefined ? sub.option_labels[origIdx] : null)
      : null;
    return { ...sub, option_labels: newOptionLabels, correct: newCorrect };
  });
}

// ── setup ────────────────────────────────────────────────────────────────────

async function setup() {
  console.log('\n[setup] Creating test fixtures for image_multi shuffle audit …\n');
  const pw = await bcrypt.hash('Test_Im2026!', 10);
  const sl = slug();

  // Teacher
  const [t] = (await pool.query(
    "INSERT INTO teachers (username,password,name,slug) VALUES ($1,$2,'IM Shuffle Teacher',$3) RETURNING id",
    [sl, pw, sl]
  )).rows;
  T.teacherId = t.id;
  T.teacherToken = makeToken({ id: T.teacherId, role: 'teacher', username: sl, name: 'IM Shuffle Teacher' });

  // Student
  const [s] = (await pool.query(
    "INSERT INTO students (username,password,name,teacher_id) VALUES ($1,$2,'IM Student',$3) RETURNING id",
    [`s_${sl}`, pw, T.teacherId]
  )).rows;
  T.studentId   = s.id;
  T.studentToken = makeToken({ id: T.studentId, role: 'student', teacher_id: T.teacherId, username: `s_${sl}`, name: 'IM Student' });

  // Course
  const [c] = (await pool.query(
    "INSERT INTO courses (name,teacher_id,price,is_published) VALUES ('IM Course',$1,0,true) RETURNING id",
    [T.teacherId]
  )).rows;
  T.courseId = c.id;
  await pool.query(
    "INSERT INTO student_course_enrollment (student_id,course_id,status) VALUES ($1,$2,'active')",
    [T.studentId, T.courseId]
  );

  // ── Question bank with 1 image_multi question (2-option sub-questions) ────
  const [bk] = (await pool.query(
    "INSERT INTO question_banks (name,teacher_id) VALUES ('IM Bank',$1) RETURNING id",
    [T.teacherId]
  )).rows;
  T.bankId = bk.id;

  const imgMultiSubQs_2opts = [
    { label: 'أ', type: 'mcq', correct: 'A', points: 2, option_labels: ['خيار 1', 'خيار 2'] },
    { label: 'ب', type: 'mcq', correct: 'B', points: 2, option_labels: ['خيار أ', 'خيار ب'] },
  ];
  // option_a/option_b/correct_answer_letter are NOT NULL in schema even for image_multi;
  // use placeholder values — server ignores them for image_multi scoring.
  const [bq] = (await pool.query(
    `INSERT INTO bank_questions
       (question_text,question_type,points,bank_id,sub_questions,
        option_a,option_b,correct_answer_letter)
     VALUES ('صورة مع سؤالين','image_multi',4,$1,$2,'_','_','A') RETURNING id`,
    [T.bankId, JSON.stringify(imgMultiSubQs_2opts)]
  )).rows;
  T.bankQuestionId = bq.id;

  // ── Bank exam with shuffle_options=true ───────────────────────────────────
  const [bex] = (await pool.query(
    `INSERT INTO exams
       (title,duration_minutes,total_score,teacher_id,pass_score,is_published,
        start_date,end_date,question_source,bank_id,bank_question_count,shuffle_options)
     VALUES ('Bank Exam IM',60,100,$1,50,true,
             NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days',
             'bank',$2,1,true) RETURNING id`,
    [T.teacherId, T.bankId]
  )).rows;
  T.bankExamId = bex.id;

  // ── Manual exam with shuffle_options=true and image_multi ─────────────────
  const [mex] = (await pool.query(
    `INSERT INTO exams
       (title,duration_minutes,total_score,teacher_id,pass_score,is_published,
        start_date,end_date,shuffle_options)
     VALUES ('Manual Exam IM',60,100,$1,50,true,
             NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days',true) RETURNING id`,
    [T.teacherId]
  )).rows;
  T.manualExamId = mex.id;

  const imgMultiSubQs_4opts = [
    { label: '1', type: 'mcq', correct: 'A', points: 1, option_labels: ['إجابة 1', 'إجابة 2', 'إجابة 3', 'إجابة 4'] },
    { label: '2', type: 'mcq', correct: 'C', points: 1, option_labels: ['اختيار أ', 'اختيار ب', 'اختيار ج', 'اختيار د'] },
    { label: '3', type: 'true_false', correct: 'T', points: 1, option_labels: null },
  ];
  const [mq] = (await pool.query(
    `INSERT INTO questions
       (question_text,question_type,points,exam_id,sub_questions,
        option_a,option_b,correct_answer_letter)
     VALUES ('سؤال مع 4 خيارات','image_multi',3,$1,$2,'_','_','A') RETURNING id`,
    [T.manualExamId, JSON.stringify(imgMultiSubQs_4opts)]
  )).rows;
  T.manualQuestionId = mq.id;

  // ── Recitation with image_multi (2-option sub-question) ───────────────────
  const [rec] = (await pool.query(
    `INSERT INTO recitations
       (title,teacher_id,total_score,pass_score,is_published,shuffle_options,
        start_date,end_date)
     VALUES ('IM Recitation',$1,10,5,true,true,
             NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days') RETURNING id`,
    [T.teacherId]
  )).rows;
  T.recitationId = rec.id;

  const recSubQs = [
    { label: 'س1', type: 'mcq', correct: 'A', points: 2, option_labels: ['صواب', 'خطأ'] },
    { label: 'س2', type: 'true_false', correct: 'T', points: 2, option_labels: null },
  ];
  await pool.query(
    `INSERT INTO recitation_questions
       (question_text,question_type,points,recitation_id,sub_questions,sort_order,
        correct_answer_letter,option_a,option_b)
     VALUES ('سؤال تسميع','image_multi',4,$1,$2,1,'A','_','_')`,
    [T.recitationId, JSON.stringify(recSubQs)]
  );

  console.log('[setup] Done.\n');
}

// ── teardown ─────────────────────────────────────────────────────────────────

async function teardown() {
  try {
    // Clean up in dependency order
    await pool.query('DELETE FROM exam_sessions WHERE student_id=$1', [T.studentId]);
    await pool.query('DELETE FROM exam_results  WHERE student_id=$1', [T.studentId]);
    await pool.query('DELETE FROM recitation_sessions WHERE student_id=$1', [T.studentId]);
    await pool.query('DELETE FROM recitation_results  WHERE student_id=$1', [T.studentId]);
    await pool.query('DELETE FROM student_course_enrollment WHERE student_id=$1', [T.studentId]);
    await pool.query('DELETE FROM students WHERE id=$1', [T.studentId]);
    await pool.query('DELETE FROM questions   WHERE exam_id IN ($1,$2)', [T.bankExamId, T.manualExamId]);
    await pool.query('DELETE FROM exams       WHERE id IN ($1,$2)', [T.bankExamId, T.manualExamId]);
    await pool.query('DELETE FROM recitation_questions WHERE recitation_id=$1', [T.recitationId]);
    await pool.query('DELETE FROM recitations WHERE id=$1', [T.recitationId]);
    await pool.query('DELETE FROM bank_questions WHERE bank_id=$1', [T.bankId]);
    await pool.query('DELETE FROM question_banks WHERE id=$1', [T.bankId]);
    await pool.query('DELETE FROM courses WHERE id=$1', [T.courseId]);
    await pool.query('DELETE FROM teachers WHERE id=$1', [T.teacherId]);
  } catch (e) {
    console.error('[teardown error]', e.message);
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

async function runTests() {

  // ══════════════════════════════════════════════════════════════════════════
  // Section A: BUG-1 — Bank exam image_multi gets shuffle_options applied
  // ══════════════════════════════════════════════════════════════════════════
  console.log('── Section A: Bank exam image_multi shuffle (BUG-1) ──');

  let bankTakeData;
  await test('A1 GET /take on bank exam succeeds for student', async () => {
    const r = await request('GET', `/api/exams/${T.bankExamId}/take`, null, T.studentToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(Array.isArray(r.body.questions), 'questions must be array');
    assert(r.body.questions.length > 0, 'questions must not be empty');
    bankTakeData = r.body;
  });

  await test('A2 Bank exam image_multi question is present in take response', async () => {
    const imgQ = (bankTakeData?.questions || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi question not found in bank exam take response');
    assert(Array.isArray(imgQ.sub_questions), 'sub_questions must be array');
    assert(imgQ.sub_questions.length === 2, `Expected 2 sub_questions, got ${imgQ.sub_questions.length}`);
  });

  await test('A3 Bank exam image_multi sub_questions have option_labels shuffled (BUG-1 fix)', async () => {
    const imgQ = (bankTakeData?.questions || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi question not found');
    // Compute the expected shuffled result using the same seed formula as server
    const imgMultiSeed = ((T.studentId * 31 + T.bankExamId * 17) >>> 0);
    const origSubQs = [
      { label: 'أ', type: 'mcq', correct: 'A', points: 2, option_labels: ['خيار 1', 'خيار 2'] },
      { label: 'ب', type: 'mcq', correct: 'B', points: 2, option_labels: ['خيار أ', 'خيار ب'] },
    ];
    const expectedShuffled = shuffleImgMultiSubQs(origSubQs, imgMultiSeed, imgQ.id);
    // Verify that the option_labels in take response match expected shuffle
    imgQ.sub_questions.forEach((sub, i) => {
      assert(
        JSON.stringify(sub.option_labels) === JSON.stringify(expectedShuffled[i].option_labels),
        `sub_question[${i}] option_labels mismatch: got ${JSON.stringify(sub.option_labels)}, expected ${JSON.stringify(expectedShuffled[i].option_labels)}`
      );
    });
  });

  await test('A4 Bank exam image_multi sub_questions have correct stripped from client response', async () => {
    const imgQ = (bankTakeData?.questions || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi question not found');
    // Server must strip `correct` from each sub_question before sending to student (security fix)
    imgQ.sub_questions.forEach((sub, i) => {
      assert(sub.option_labels !== null, `sub_question[${i}] option_labels should not be null`);
      assert(!('correct' in sub), `correct must be stripped from sub_question[${i}] in client response`);
    });
  });

  await test('A5 Bank exam image_multi has exactly 2 option_labels per sub-question (not 4)', async () => {
    const imgQ = (bankTakeData?.questions || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi question not found');
    imgQ.sub_questions.forEach((sub, i) => {
      assert(
        sub.option_labels.length === 2,
        `sub_question[${i}] should have 2 option_labels, got ${sub.option_labels.length}`
      );
    });
  });

  // Submit bank exam (correct answers in shuffled space)
  let bankResultId;
  await test('A6 Submit bank exam with image_multi answer and get result', async () => {
    const imgQ = (bankTakeData?.questions || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi question not found');
    // correct is stripped from sub_questions by server (fix applied in /take).
    // Derive the expected shuffled order using the same seed formula as server
    // to compute which letter each sub_question's correct answer maps to.
    const imgMultiSeed = ((T.studentId * 31 + T.bankExamId * 17) >>> 0);
    const origSubQs = [
      { label: 'أ', type: 'mcq', correct: 'A', points: 2, option_labels: ['خيار 1', 'خيار 2'] },
      { label: 'ب', type: 'mcq', correct: 'B', points: 2, option_labels: ['خيار أ', 'خيار ب'] },
    ];
    const shuffled = shuffleImgMultiSubQs(origSubQs, imgMultiSeed, imgQ.id);

    // Build correct answer object using remapped correct letters
    const imgAnswer = {};
    shuffled.forEach(sub => { imgAnswer[sub.label] = sub.correct; });

    const r = await request('POST', `/api/exams/${T.bankExamId}/submit`, {
      answers: { [imgQ.id]: imgAnswer },
    }, T.studentToken);
    assert(r.status === 200, `Submit failed: ${r.status} ${JSON.stringify(r.body)}`);
    // Submit response: { result: { id, score, ... }, detailedAnswers, ... }
    assert(r.body.result && r.body.result.id, `result.id missing from submit response: ${JSON.stringify(r.body)}`);
    bankResultId = r.body.result.id;
  });

  await test('A7 Bank exam image_multi review returns option_labels and sub_results (BUG-1 fix)', async () => {
    if (!bankResultId) { throw new Error('No bankResultId from A6'); }
    const r = await request('GET', `/api/exams/results/${bankResultId}/review`, null, T.teacherToken);
    assert(r.status === 200, `Review failed: ${r.status} ${JSON.stringify(r.body)}`);
    const imgQ = (r.body.questions || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi question not found in review');
    assert(Array.isArray(imgQ.sub_results), 'sub_results must be array in review');
    imgQ.sub_results.forEach((sr, i) => {
      assert(sr.option_labels !== undefined, `sub_results[${i}] must have option_labels field`);
    });
    // The student answered correctly so all sub_results should be is_correct=true
    assert(imgQ.is_correct === true, `image_multi question should be is_correct=true when all sub-answers correct`);
  });

  await test('A8 Bank exam review option order matches take snapshot (shuffle consistency check)', async () => {
    if (!bankResultId) { throw new Error('No bankResultId from A6'); }
    const r = await request('GET', `/api/exams/results/${bankResultId}/review`, null, T.teacherToken);
    assert(r.status === 200, `Review failed: ${r.status}`);
    const imgQ = (r.body.questions || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi question not found in review');

    // Compute expected shuffled order
    const imgMultiSeed = ((T.studentId * 31 + T.bankExamId * 17) >>> 0);
    const origSubQs = [
      { label: 'أ', type: 'mcq', correct: 'A', points: 2, option_labels: ['خيار 1', 'خيار 2'] },
      { label: 'ب', type: 'mcq', correct: 'B', points: 2, option_labels: ['خيار أ', 'خيار ب'] },
    ];
    const expectedShuffled = shuffleImgMultiSubQs(origSubQs, imgMultiSeed, imgQ.id);

    // sub_questions in review response must match the shuffle applied at take time
    (imgQ.sub_questions || []).forEach((sub, i) => {
      assert(
        JSON.stringify(sub.option_labels) === JSON.stringify(expectedShuffled[i].option_labels),
        `Review sub_question[${i}] option_labels mismatch — review seed differs from take seed`
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Section B: Manual exam image_multi shuffle still works
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── Section B: Manual exam image_multi shuffle ──');

  let manualTakeData;
  await test('B1 GET /take on manual exam succeeds for student', async () => {
    const r = await request('GET', `/api/exams/${T.manualExamId}/take`, null, T.studentToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    manualTakeData = r.body;
    const imgQ = (r.body.questions || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi question not found in manual exam take');
  });

  await test('B2 Manual exam image_multi sub_questions have shuffled option_labels', async () => {
    const imgQ = (manualTakeData?.questions || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi question not found');
    const imgMultiSeed = ((T.studentId * 31 + T.manualExamId * 17) >>> 0);
    const origSubQs = [
      { label: '1', type: 'mcq', correct: 'A', points: 1, option_labels: ['إجابة 1', 'إجابة 2', 'إجابة 3', 'إجابة 4'] },
      { label: '2', type: 'mcq', correct: 'C', points: 1, option_labels: ['اختيار أ', 'اختيار ب', 'اختيار ج', 'اختيار د'] },
      { label: '3', type: 'true_false', correct: 'T', points: 1, option_labels: null },
    ];
    const expectedShuffled = shuffleImgMultiSubQs(origSubQs, imgMultiSeed, imgQ.id);
    imgQ.sub_questions.forEach((sub, i) => {
      if (sub.type === 'true_false') return; // T/F not shuffled
      assert(
        JSON.stringify(sub.option_labels) === JSON.stringify(expectedShuffled[i].option_labels),
        `Manual exam sub_question[${i}] option_labels mismatch`
      );
    });
  });

  await test('B3 Manual exam image_multi 4-option sub_question returns exactly 4 option_labels', async () => {
    const imgQ = (manualTakeData?.questions || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi not found');
    const mcqSub = imgQ.sub_questions.find(s => s.type !== 'true_false');
    assert(mcqSub, 'MCQ sub-question not found');
    assert(mcqSub.option_labels.length === 4, `Expected 4, got ${mcqSub.option_labels.length}`);
  });

  let manualResultId;
  await test('B4 Submit manual exam with image_multi and score correctly', async () => {
    const imgQ = (manualTakeData?.questions || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi not found');
    const imgMultiSeed = ((T.studentId * 31 + T.manualExamId * 17) >>> 0);
    const origSubQs = [
      { label: '1', type: 'mcq', correct: 'A', points: 1, option_labels: ['إجابة 1', 'إجابة 2', 'إجابة 3', 'إجابة 4'] },
      { label: '2', type: 'mcq', correct: 'C', points: 1, option_labels: ['اختيار أ', 'اختيار ب', 'اختيار ج', 'اختيار د'] },
      { label: '3', type: 'true_false', correct: 'T', points: 1, option_labels: null },
    ];
    const shuffled = shuffleImgMultiSubQs(origSubQs, imgMultiSeed, imgQ.id);
    const imgAnswer = {};
    shuffled.forEach(sub => {
      imgAnswer[sub.label] = sub.type === 'true_false' ? 'A' : sub.correct;
    });
    const r = await request('POST', `/api/exams/${T.manualExamId}/submit`, {
      answers: { [imgQ.id]: imgAnswer },
    }, T.studentToken);
    assert(r.status === 200, `Submit failed: ${r.status} ${JSON.stringify(r.body)}`);
    assert(r.body.result && r.body.result.id, `result.id missing: ${JSON.stringify(r.body)}`);
    manualResultId = r.body.result.id;
  });

  await test('B5 Manual exam review shows correct sub_results with option_labels', async () => {
    if (!manualResultId) throw new Error('No manualResultId from B4');
    const r = await request('GET', `/api/exams/results/${manualResultId}/review`, null, T.teacherToken);
    assert(r.status === 200, `Review failed: ${r.status}`);
    const imgQ = (r.body.questions || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi not found in review');
    assert(Array.isArray(imgQ.sub_results), 'sub_results must be array');
    imgQ.sub_results.forEach((sr, i) => {
      if (sr.type === 'true_false') return;
      assert(sr.option_labels !== undefined, `sub_results[${i}] must have option_labels`);
      assert(Array.isArray(sr.option_labels), `sub_results[${i}].option_labels must be array`);
      // Must have exactly 4 items (4-option sub-questions)
      assert(sr.option_labels.length === 4, `Expected 4 option_labels, got ${sr.option_labels.length}`);
    });
  });

  await test('B6 Manual exam review is_correct=true when all sub-answers correct', async () => {
    if (!manualResultId) throw new Error('No manualResultId from B4');
    const r = await request('GET', `/api/exams/results/${manualResultId}/review`, null, T.teacherToken);
    assert(r.status === 200);
    const imgQ = (r.body.questions || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi not found');
    assert(imgQ.is_correct === true, 'Expected is_correct=true for all-correct answers');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Section C: Recitation image_multi — option_labels in sub_results (BUG-2)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── Section C: Recitation review option_labels in sub_results (BUG-2) ──');

  let recTakeData;
  await test('C1 GET /take on recitation with image_multi succeeds', async () => {
    const r = await request('GET', `/api/recitations/${T.recitationId}/take`, null, T.studentToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    recTakeData = r.body;
    const imgQ = (r.body.questions || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi question not found in recitation take');
  });

  await test('C2 Recitation image_multi 2-option sub-question returns 2 option_labels (not 4)', async () => {
    const imgQ = (recTakeData?.questions || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi not found');
    const mcqSub = imgQ.sub_questions.find(s => s.type !== 'true_false');
    assert(mcqSub, 'MCQ sub-question not found');
    assert(Array.isArray(mcqSub.option_labels), 'option_labels must be array');
    assert(mcqSub.option_labels.length === 2, `Expected 2 option_labels, got ${mcqSub.option_labels.length}`);
  });

  await test('C3 Recitation image_multi sub_questions shuffle applied when shuffle_options=true', async () => {
    const imgQ = (recTakeData?.questions || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi not found');
    const recSeed = (T.studentId * 73856093) ^ (T.recitationId * 19349663);
    const origSubQs = [
      { label: 'س1', type: 'mcq', correct: 'A', points: 2, option_labels: ['صواب', 'خطأ'] },
      { label: 'س2', type: 'true_false', correct: 'T', points: 2, option_labels: null },
    ];
    const expectedShuffled = shuffleImgMultiSubQs(origSubQs, recSeed, imgQ.id);
    const mcqSub = imgQ.sub_questions.find(s => s.type !== 'true_false');
    const expectedMcqSub = expectedShuffled.find(s => s.type !== 'true_false');
    assert(
      JSON.stringify(mcqSub.option_labels) === JSON.stringify(expectedMcqSub.option_labels),
      `option_labels mismatch: got ${JSON.stringify(mcqSub.option_labels)}, expected ${JSON.stringify(expectedMcqSub.option_labels)}`
    );
  });

  let recResultId;
  await test('C4 Submit recitation with correct image_multi answers', async () => {
    const imgQ = (recTakeData?.questions || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi not found');
    const recSeed = (T.studentId * 73856093) ^ (T.recitationId * 19349663);
    const origSubQs = [
      { label: 'س1', type: 'mcq', correct: 'A', points: 2, option_labels: ['صواب', 'خطأ'] },
      { label: 'س2', type: 'true_false', correct: 'T', points: 2, option_labels: null },
    ];
    const shuffled = shuffleImgMultiSubQs(origSubQs, recSeed, imgQ.id);
    const imgAnswer = {};
    shuffled.forEach(sub => { imgAnswer[sub.label] = sub.type === 'true_false' ? 'A' : sub.correct; });

    const r = await request('POST', `/api/recitations/${T.recitationId}/submit`, {
      answers: [{ question_id: imgQ.id, answer: JSON.stringify(imgAnswer) }],
    }, T.studentToken);
    assert(r.status === 200, `Submit failed: ${r.status} ${JSON.stringify(r.body)}`);
    // Recitation submit response: { result: { id, score, ... }, score, ... }
    assert(r.body.result && r.body.result.id, `result.id missing: ${JSON.stringify(r.body)}`);
    recResultId = r.body.result.id;
  });

  await test('C5 Recitation review sub_results include option_labels (BUG-2 fix)', async () => {
    if (!recResultId) throw new Error('No recResultId from C4');
    const r = await request('GET', `/api/recitations/results/${recResultId}/review`, null, T.teacherToken);
    assert(r.status === 200, `Review failed: ${r.status} ${JSON.stringify(r.body)}`);
    const imgQ = (r.body.review || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi not found in review');
    assert(Array.isArray(imgQ.sub_results), 'sub_results must be array');
    const mcqSubResult = imgQ.sub_results.find(sr => sr.type !== 'true_false');
    assert(mcqSubResult, 'MCQ sub_result not found');
    assert(
      'option_labels' in mcqSubResult,
      'sub_results entry must have option_labels field (BUG-2 fix)'
    );
    assert(
      Array.isArray(mcqSubResult.option_labels),
      `option_labels must be array, got ${typeof mcqSubResult.option_labels}`
    );
    assert(
      mcqSubResult.option_labels.length === 2,
      `MCQ sub_result option_labels length should be 2, got ${mcqSubResult.option_labels.length}`
    );
  });

  await test('C6 Recitation review sub_results is_correct=true for correct answers', async () => {
    if (!recResultId) throw new Error('No recResultId from C4');
    const r = await request('GET', `/api/recitations/results/${recResultId}/review`, null, T.teacherToken);
    assert(r.status === 200);
    const imgQ = (r.body.review || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi not found');
    imgQ.sub_results.forEach((sr, i) => {
      assert(sr.is_correct === true, `sub_results[${i}] should be correct, got is_correct=${sr.is_correct}`);
    });
    assert(imgQ.is_correct === true, 'image_multi question should be is_correct=true');
  });

  await test('C7 Recitation review sub_results option_labels match shuffled order from take', async () => {
    if (!recResultId) throw new Error('No recResultId from C4');
    const imgQ_take = (recTakeData?.questions || []).find(q => q.question_type === 'image_multi');
    const r = await request('GET', `/api/recitations/results/${recResultId}/review`, null, T.teacherToken);
    assert(r.status === 200);
    const imgQ_rev = (r.body.review || []).find(q => q.question_type === 'image_multi');
    assert(imgQ_rev, 'image_multi not found in review');

    // The sub_questions in review (from snapshot) must have same option_labels as the take snapshot
    // (they were both shuffled with the same seed)
    imgQ_rev.sub_questions.forEach((sub, i) => {
      if (sub.type === 'true_false') return;
      const takeSubQ = imgQ_take.sub_questions[i];
      assert(
        JSON.stringify(sub.option_labels) === JSON.stringify(takeSubQ.option_labels),
        `Review sub_questions[${i}] option_labels differ from take snapshot`
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Section D: Edge cases — wrong answers, partial answers, T/F sub-questions
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── Section D: Edge cases ──');

  await test('D1 Recitation review student_answer correctly stored as JSON string', async () => {
    if (!recResultId) throw new Error('No recResultId from C4');
    const r = await request('GET', `/api/recitations/results/${recResultId}/review`, null, T.teacherToken);
    assert(r.status === 200);
    const imgQ = (r.body.review || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi not found');
    // student_answer for image_multi is a JSON string
    assert(imgQ.student_answer !== null, 'student_answer must not be null when answered');
    // Must be parseable as JSON object with sub-question keys
    let parsed;
    try { parsed = JSON.parse(imgQ.student_answer); } catch { throw new Error('student_answer is not valid JSON'); }
    assert(typeof parsed === 'object' && parsed !== null, 'student_answer must parse to object');
    assert(Object.keys(parsed).length > 0, 'parsed answer must have at least one key');
  });

  await test('D2 Recitation review sub_results student_answer is single letter (A/B/C/D/T/F normalized)', async () => {
    if (!recResultId) throw new Error('No recResultId from C4');
    const r = await request('GET', `/api/recitations/results/${recResultId}/review`, null, T.teacherToken);
    assert(r.status === 200);
    const imgQ = (r.body.review || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi not found');
    imgQ.sub_results.forEach((sr, i) => {
      if (!sr.student_answer) return; // unanswered is fine
      assert(
        /^[A-D]$/.test(sr.student_answer),
        `sub_results[${i}].student_answer should be A/B/C/D, got ${sr.student_answer}`
      );
    });
  });

  await test('D3 T/F sub-question in recitation review has no option_labels (correctly null)', async () => {
    if (!recResultId) throw new Error('No recResultId from C4');
    const r = await request('GET', `/api/recitations/results/${recResultId}/review`, null, T.teacherToken);
    assert(r.status === 200);
    const imgQ = (r.body.review || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi not found');
    const tfSubResult = imgQ.sub_results.find(sr => sr.type === 'true_false');
    if (tfSubResult) {
      // T/F sub-questions don't have option_labels — they use صح/خطأ
      assert(
        !tfSubResult.option_labels || tfSubResult.option_labels === null,
        'T/F sub_result should have null option_labels'
      );
    }
  });

  await test('D4 Bank exam review correct_count matches number of all-correct image_multi questions', async () => {
    if (!bankResultId) throw new Error('No bankResultId from A6');
    const r = await request('GET', `/api/exams/results/${bankResultId}/review`, null, T.teacherToken);
    assert(r.status === 200);
    const correctCount = r.body.result?.correct_count;
    const correctFromQs = (r.body.questions || []).filter(q => q.is_correct === true).length;
    // DB-stored count should match derived count from questions array
    assert(
      correctCount === correctFromQs,
      `correct_count mismatch: DB says ${correctCount}, questions array has ${correctFromQs}`
    );
  });

  await test('D5 Manual exam review correct_count for image_multi matches sub_results', async () => {
    if (!manualResultId) throw new Error('No manualResultId from B4');
    const r = await request('GET', `/api/exams/results/${manualResultId}/review`, null, T.teacherToken);
    assert(r.status === 200);
    const imgQ = (r.body.questions || []).find(q => q.question_type === 'image_multi');
    assert(imgQ, 'image_multi not found');
    // is_correct on the question should equal (all sub_results are is_correct)
    const allSubCorrect = imgQ.sub_results.every(sr => sr.is_correct === true);
    assert(
      imgQ.is_correct === allSubCorrect,
      `image_multi is_correct (${imgQ.is_correct}) should match allSubCorrect (${allSubCorrect})`
    );
  });

  await test('D6 shuffle_options=false on bank exam: sub_questions NOT shuffled', async () => {
    // Create a second bank exam with shuffle_options=false
    const [bex2] = (await pool.query(
      `INSERT INTO exams
         (title,duration_minutes,total_score,teacher_id,pass_score,is_published,
          start_date,end_date,question_source,bank_id,bank_question_count,shuffle_options)
       VALUES ('Bank Exam IM NoShuffle',60,100,$1,50,true,
               NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days',
               'bank',$2,1,false) RETURNING id`,
      [T.teacherId, T.bankId]
    )).rows;
    try {
      const r = await request('GET', `/api/exams/${bex2.id}/take`, null, T.studentToken);
      assert(r.status === 200, `Expected 200, got ${r.status}`);
      const imgQ = (r.body.questions || []).find(q => q.question_type === 'image_multi');
      assert(imgQ, 'image_multi not found');
      // With no shuffle, option_labels should be in original order
      const origLabels = ['خيار 1', 'خيار 2'];
      const mcqSub = imgQ.sub_questions.find(s => s.type !== 'true_false');
      assert(
        JSON.stringify(mcqSub.option_labels) === JSON.stringify(origLabels),
        `No-shuffle exam: option_labels should be original order, got ${JSON.stringify(mcqSub.option_labels)}`
      );
    } finally {
      await pool.query('DELETE FROM exams WHERE id=$1', [bex2.id]);
    }
  });

  await test('D7 Student cannot take same bank exam twice without retry approval', async () => {
    // Already took T.bankExamId in A6 — should be blocked
    const r = await request('GET', `/api/exams/${T.bankExamId}/take`, null, T.studentToken);
    assert(r.status === 403, `Expected 403 (already took), got ${r.status}`);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Section E: Security / boundary checks
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── Section E: Security & boundary checks ──');

  await test('E1 Recitation review is accessible by teacher', async () => {
    if (!recResultId) throw new Error('No recResultId from C4');
    const r = await request('GET', `/api/recitations/results/${recResultId}/review`, null, T.teacherToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test('E2 Exam review is accessible by teacher', async () => {
    if (!bankResultId) throw new Error('No bankResultId from A6');
    const r = await request('GET', `/api/exams/results/${bankResultId}/review`, null, T.teacherToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test('E3 Another student cannot access exam review result', async () => {
    if (!bankResultId) throw new Error('No bankResultId from A6');
    const sl2 = slug();
    const pw2 = await bcrypt.hash('pw2', 10);
    const [s2] = (await pool.query(
      "INSERT INTO students (username,password,name,teacher_id) VALUES ($1,$2,'Other Student',$3) RETURNING id",
      [`o_${sl2}`, pw2, T.teacherId]
    )).rows;
    const tok2 = makeToken({ id: s2.id, role: 'student', teacher_id: T.teacherId, username: `o_${sl2}`, name: 'Other' });
    try {
      const r = await request('GET', `/api/exams/results/${bankResultId}/review`, null, tok2);
      assert(r.status === 403, `Expected 403, got ${r.status}`);
    } finally {
      await pool.query('DELETE FROM students WHERE id=$1', [s2.id]);
    }
  });

  await test('E4 Recitation review is accessible by the student who took it', async () => {
    if (!recResultId) throw new Error('No recResultId from C4');
    const r = await request('GET', `/api/recitations/results/${recResultId}/review`, null, T.studentToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test('E5 Recitation correct_count in review result matches sub_results is_correct count', async () => {
    if (!recResultId) throw new Error('No recResultId from C4');
    const r = await request('GET', `/api/recitations/results/${recResultId}/review`, null, T.studentToken);
    assert(r.status === 200);
    const result = r.body.result;
    const review = r.body.review || [];
    // Recompute correct count
    const correctQs = review.filter(q => q.is_correct).length;
    assert(
      result.correct_count == null || result.correct_count === correctQs,
      `correct_count mismatch: result.correct_count=${result.correct_count}, derived=${correctQs}`
    );
  });
}

// ── main ──────────────────────────────────────────────────────────────────────

(async () => {
  try {
    await setup();
    await runTests();
  } catch (e) {
    console.error('[FATAL]', e.stack);
  } finally {
    await teardown();
    await pool.end();
    console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
    process.exit(failed > 0 ? 1 : 0);
  }
})();
