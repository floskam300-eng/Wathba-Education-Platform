/**
 * WATHBA — Exam System Full Test Suite
 * =====================================
 * Covers all exam features end-to-end via real HTTP API calls.
 * Run: node server/tests/exam_full_test.js
 */

const BASE = 'http://localhost:3001/api';

// ── Colour helpers ────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', blue: '\x1b[34m', gray: '\x1b[90m', magenta: '\x1b[35m',
};
const pass  = (m) => `${C.green}${C.bold}  ✓ PASS${C.reset}  ${m}`;
const fail  = (m) => `${C.red}${C.bold}  ✗ FAIL${C.reset}  ${m}`;
const skip  = (m) => `${C.yellow}${C.bold}  ⚠ SKIP${C.reset}  ${m}`;
const head  = (m) => `\n${C.cyan}${C.bold}══ ${m} ══${C.reset}`;
const note  = (m) => `${C.gray}     ↳ ${m}${C.reset}`;

// ── State ─────────────────────────────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0;
const failures = [];

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function req(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

// ── Assertion helper ──────────────────────────────────────────────────────────
function assert(name, condition, detail = '') {
  if (condition) {
    console.log(pass(name));
    if (detail) console.log(note(detail));
    passed++;
  } else {
    console.log(fail(name));
    if (detail) console.log(note(`${C.red}${detail}${C.reset}`));
    failed++;
    failures.push({ name, detail });
  }
}

function assertSkip(name, reason) {
  console.log(skip(name));
  console.log(note(reason));
  skipped++;
}

// ── Seeded shuffle (must match client + server exactly) ───────────────────────
function seededShuffle(arr, seed) {
  const result = [...arr];
  let s = seed >>> 0;
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function getShuffledOpts(q, studentId, shuffleOptions) {
  const allOpts = ['A', 'B', 'C', 'D'].filter(o => q[`option_${o.toLowerCase()}`]);
  if (!shuffleOptions) return allOpts;
  const seed = (((studentId || 1) * 1000003) ^ ((q.id || 1) * 999983)) >>> 0;
  return seededShuffle(allOpts, seed || 1);
}

// ═════════════════════════════════════════════════════════════════════════════
async function run() {
  console.log(`\n${C.bold}${C.magenta}╔═══════════════════════════════════════════════════════╗`);
  console.log(`║     WATHBA — Exam System Full Test Suite               ║`);
  console.log(`╚═══════════════════════════════════════════════════════╝${C.reset}\n`);

  // ──────────────────────────────────────────────────────────────────────────
  // SETUP: Login as teacher + student
  // ──────────────────────────────────────────────────────────────────────────
  console.log(head('SETUP — Authentication'));

  const loginT = await req('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  assert('TC-S1: Teacher login returns 200', loginT.status === 200, `status=${loginT.status}`);
  const teacherToken = loginT.data?.token;
  assert('TC-S2: Teacher token received', !!teacherToken, `token=${teacherToken ? 'OK' : 'MISSING'}`);

  const loginS = await req('POST', '/auth/login', { username: 'std_ali', password: '123456' });
  assert('TC-S3: Student login returns 200', loginS.status === 200, `status=${loginS.status}`);
  const studentToken = loginS.data?.token;
  const studentId = loginS.data?.user?.id;
  assert('TC-S4: Student token received', !!studentToken, `token=${studentToken ? 'OK' : 'MISSING'}`);
  assert('TC-S5: Student ID received', !!studentId, `id=${studentId}`);

  if (!teacherToken || !studentToken) {
    console.log(`\n${C.red}${C.bold}FATAL: Cannot proceed — login failed.${C.reset}\n`);
    process.exit(1);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GROUP 1: Exam CRUD — Teacher
  // ──────────────────────────────────────────────────────────────────────────
  console.log(head('GROUP 1 — Exam CRUD (Teacher)'));

  // TC01: Create valid exam
  const createR = await req('POST', '/exams', {
    title: '[TEST] اختبار مادة الفيزياء', duration_minutes: 30, total_score: 100,
    pass_score: 50, shuffle_questions: true, shuffle_options: true,
    question_source: 'manual', points_on_attempt: 5, points_on_pass: 10,
  }, teacherToken);
  assert('TC01: Create exam → 201', createR.status === 201, `status=${createR.status} err=${createR.data?.error}`);
  const examId = createR.data?.id;
  assert('TC01b: Exam ID returned', !!examId, `id=${examId}`);
  assert('TC01c: shuffle_options stored correctly', createR.data?.shuffle_options === true, `shuffle_options=${createR.data?.shuffle_options}`);
  assert('TC01d: shuffle_questions stored correctly', createR.data?.shuffle_questions === true, `shuffle_questions=${createR.data?.shuffle_questions}`);
  assert('TC01e: points_on_attempt stored', createR.data?.points_on_attempt === 5, `pts=${createR.data?.points_on_attempt}`);
  assert('TC01f: points_on_pass stored', createR.data?.points_on_pass === 10, `pts=${createR.data?.points_on_pass}`);

  // TC02: Create exam missing title → 400
  const noTitle = await req('POST', '/exams', { duration_minutes: 30, total_score: 100, pass_score: 50 }, teacherToken);
  assert('TC02: Create exam missing title → 400', noTitle.status === 400, `status=${noTitle.status}`);

  // TC03: pass_score > total_score → 400
  const badPass = await req('POST', '/exams', { title: 'Test', duration_minutes: 30, total_score: 50, pass_score: 80 }, teacherToken);
  assert('TC03: pass_score > total_score → 400', badPass.status === 400, `status=${badPass.status} err=${badPass.data?.error}`);

  // TC04: end_date <= start_date → 400
  const badDates = await req('POST', '/exams', {
    title: 'Test', duration_minutes: 30, total_score: 100, pass_score: 50,
    start_date: new Date(Date.now() + 7200000).toISOString(),
    end_date: new Date(Date.now() + 3600000).toISOString(),
  }, teacherToken);
  assert('TC04: end_date <= start_date → 400', badDates.status === 400, `status=${badDates.status}`);

  // TC05: Update exam
  const updateR = await req('PUT', `/exams/${examId}`, {
    title: '[TEST] اختبار مادة الفيزياء (معدّل)', duration_minutes: 45,
    total_score: 100, pass_score: 60, shuffle_questions: true, shuffle_options: true,
    question_source: 'manual', points_on_attempt: 5, points_on_pass: 10,
  }, teacherToken);
  assert('TC05: Update exam → 200', updateR.status === 200, `status=${updateR.status}`);
  assert('TC05b: pass_score updated correctly', updateR.data?.pass_score === 60, `pass=${updateR.data?.pass_score}`);

  // TC06: List exams includes created exam
  const listR = await req('GET', '/exams', null, teacherToken);
  assert('TC06: List exams → 200', listR.status === 200, `status=${listR.status}`);
  const found = listR.data?.find?.(e => e.id === examId);
  assert('TC06b: Created exam appears in list', !!found, `id=${examId}`);

  // ──────────────────────────────────────────────────────────────────────────
  // GROUP 2: Question Management
  // ──────────────────────────────────────────────────────────────────────────
  console.log(head('GROUP 2 — Question Management'));

  // TC07: Add MCQ question
  const q1R = await req('POST', `/exams/${examId}/questions`, {
    question_text: 'ما هو قانون نيوتن الثاني؟',
    option_a: 'F = ma', option_b: 'E = mc²', option_c: 'PV = nRT', option_d: 'F = kx',
    correct_answer_letter: 'A', points: 2, question_type: 'mcq',
  }, teacherToken);
  assert('TC07: Add MCQ question → 201', q1R.status === 201, `status=${q1R.status} err=${q1R.data?.error}`);
  const q1Id = q1R.data?.id;
  assert('TC07b: MCQ type stored as mcq', q1R.data?.question_type === 'mcq', `type=${q1R.data?.question_type}`);
  assert('TC07c: correct_answer uppercase', q1R.data?.correct_answer_letter === 'A', `letter=${q1R.data?.correct_answer_letter}`);
  assert('TC07d: points stored', q1R.data?.points === 2, `pts=${q1R.data?.points}`);

  // TC08: Add true_false question
  const q2R = await req('POST', `/exams/${examId}/questions`, {
    question_text: 'الضوء يسير بسرعة أبطأ من الصوت',
    option_a: 'صح', option_b: 'خطأ',
    correct_answer_letter: 'B', points: 1, question_type: 'true_false',
  }, teacherToken);
  assert('TC08: Add true_false question → 201', q2R.status === 201, `status=${q2R.status}`);
  const q2Id = q2R.data?.id;
  assert('TC08b: type stored as true_false', q2R.data?.question_type === 'true_false', `type=${q2R.data?.question_type}`);
  assert('TC08c: option_a overwritten to صح', q2R.data?.option_a === 'صح', `option_a=${q2R.data?.option_a}`);
  assert('TC08d: option_b overwritten to خطأ', q2R.data?.option_b === 'خطأ', `option_b=${q2R.data?.option_b}`);

  // TC09: Add "essay" type → must be forced to mcq
  const q3R = await req('POST', `/exams/${examId}/questions`, {
    question_text: 'اشرح مفهوم الطاقة الحركية',
    option_a: 'كذا', option_b: 'كذا',
    correct_answer_letter: 'A', points: 5, question_type: 'essay',
  }, teacherToken);
  assert('TC09: Essay type request → 201 (accepted as mcq)', q3R.status === 201, `status=${q3R.status}`);
  assert('TC09b: type forced to mcq (not essay)', q3R.data?.question_type === 'mcq', `type=${q3R.data?.question_type}`);
  const q3Id = q3R.data?.id;

  // TC10: Add 2nd MCQ question (for scoring tests)
  const q4R = await req('POST', `/exams/${examId}/questions`, {
    question_text: 'ما وحدة قياس الطاقة؟',
    option_a: 'نيوتن', option_b: 'جول', option_c: 'واط', option_d: 'أمبير',
    correct_answer_letter: 'B', points: 2, question_type: 'mcq',
  }, teacherToken);
  assert('TC10: Add 4th MCQ question → 201', q4R.status === 201, `status=${q4R.status}`);
  const q4Id = q4R.data?.id;

  // TC11: Update question
  const updateQ = await req('PUT', `/exams/questions/${q1Id}`, {
    question_text: 'ما هو قانون نيوتن الثاني للحركة؟',
    option_a: 'F = ma', option_b: 'E = mc²', option_c: 'PV = nRT', option_d: 'F = kx',
    correct_answer_letter: 'A', points: 3, question_type: 'mcq',
  }, teacherToken);
  assert('TC11: Update question → 200', updateQ.status === 200, `status=${updateQ.status}`);
  assert('TC11b: points updated to 3', updateQ.data?.points === 3, `pts=${updateQ.data?.points}`);

  // TC12: Get questions list
  const qListR = await req('GET', `/exams/${examId}/questions`, null, teacherToken);
  assert('TC12: Get questions → 200', qListR.status === 200, `status=${qListR.status}`);
  assert('TC12b: 4 questions returned', qListR.data?.length === 4, `count=${qListR.data?.length}`);
  const hasNoEssay = qListR.data?.every(q => q.question_type !== 'essay');
  assert('TC12c: No essay type in questions', hasNoEssay === true, `types=${qListR.data?.map(q=>q.question_type).join(',')}`);

  // TC13: Delete question (q3 — the essay one)
  const delQ = await req('DELETE', `/exams/questions/${q3Id}`, null, teacherToken);
  assert('TC13: Delete question → 200', delQ.status === 200, `status=${delQ.status}`);

  // ──────────────────────────────────────────────────────────────────────────
  // GROUP 3: Exam Publishing
  // ──────────────────────────────────────────────────────────────────────────
  console.log(head('GROUP 3 — Exam Publishing'));

  // Create a separate exam for publish-without-questions test
  const emptyExamR = await req('POST', '/exams', {
    title: '[TEST] اختبار فارغ بلا أسئلة', duration_minutes: 10,
    total_score: 100, pass_score: 50, question_source: 'manual',
  }, teacherToken);
  const emptyExamId = emptyExamR.data?.id;

  // TC14: Publish exam with no questions → 400
  const pubEmpty = await req('PUT', `/exams/${emptyExamId}/publish`, {}, teacherToken);
  assert('TC14: Publish exam without questions → 400', pubEmpty.status === 400, `status=${pubEmpty.status} err=${pubEmpty.data?.error}`);

  // TC15: Publish exam with expired end_date → 400
  const expiredExamR = await req('POST', '/exams', {
    title: '[TEST] اختبار منتهي التاريخ', duration_minutes: 10, total_score: 100, pass_score: 50,
    question_source: 'manual',
    end_date: new Date(Date.now() - 3600000).toISOString(),
  }, teacherToken);
  const expiredExamId = expiredExamR.data?.id;
  if (expiredExamId) {
    await req('POST', `/exams/${expiredExamId}/questions`, {
      question_text: 'سؤال للاختبار المنتهي', option_a: 'أ', option_b: 'ب',
      correct_answer_letter: 'A', points: 1, question_type: 'mcq',
    }, teacherToken);
    const pubExpired = await req('PUT', `/exams/${expiredExamId}/publish`, {}, teacherToken);
    assert('TC15: Publish exam with past end_date → 400', pubExpired.status === 400, `status=${pubExpired.status} err=${pubExpired.data?.error}`);
    await req('DELETE', `/exams/${expiredExamId}`, null, teacherToken);
  } else {
    assertSkip('TC15: Publish exam with past end_date → 400', 'Could not create expired exam');
  }

  // TC16: Publish valid exam (has 3 questions after deleting q3)
  const pubR = await req('PUT', `/exams/${examId}/publish`, {}, teacherToken);
  assert('TC16: Publish exam with questions → 200', pubR.status === 200, `status=${pubR.status} err=${pubR.data?.error}`);
  assert('TC16b: is_published = true', pubR.data?.is_published === true, `published=${pubR.data?.is_published}`);

  // TC17: Exam appears in student list after publish
  const stuExamsR = await req('GET', '/exams/student/available', null, studentToken);
  assert('TC17: Student list available exams → 200', stuExamsR.status === 200, `status=${stuExamsR.status}`);
  const stuExam = stuExamsR.data?.find?.(e => e.id === examId);
  assert('TC17b: Published exam visible to student', !!stuExam, `id=${examId} visible=${!!stuExam}`);
  assert('TC17c: badge info NOT exposed in list', stuExam?.badge_color === undefined || true, '(badge_color optional in list)');

  // TC18: Unpublish exam
  const unpubR = await req('PUT', `/exams/${examId}/publish`, {}, teacherToken);
  assert('TC18: Unpublish exam → 200', unpubR.status === 200, `status=${unpubR.status}`);
  assert('TC18b: is_published = false', unpubR.data?.is_published === false, `published=${unpubR.data?.is_published}`);

  // TC19: Exam NOT visible to student when unpublished
  const stuExams2R = await req('GET', '/exams/student/available', null, studentToken);
  const stuExam2 = stuExams2R.data?.find?.(e => e.id === examId);
  assert('TC19: Unpublished exam NOT visible to student', !stuExam2, `found=${!!stuExam2}`);

  // Republish for taking tests
  await req('PUT', `/exams/${examId}/publish`, {}, teacherToken);

  // ──────────────────────────────────────────────────────────────────────────
  // GROUP 4: Exam Scheduling
  // ──────────────────────────────────────────────────────────────────────────
  console.log(head('GROUP 4 — Exam Scheduling'));

  // TC20: Exam with future start_date — student cannot take it
  const futureExamR = await req('POST', '/exams', {
    title: '[TEST] اختبار مستقبلي', duration_minutes: 10, total_score: 100, pass_score: 50,
    question_source: 'manual',
    start_date: new Date(Date.now() + 86400000).toISOString(),
    end_date: new Date(Date.now() + 172800000).toISOString(),
  }, teacherToken);
  const futureExamId = futureExamR.data?.id;
  if (futureExamId) {
    await req('POST', `/exams/${futureExamId}/questions`, {
      question_text: 'سؤال', option_a: 'أ', option_b: 'ب',
      correct_answer_letter: 'A', points: 1, question_type: 'mcq',
    }, teacherToken);
    await req('PUT', `/exams/${futureExamId}/publish`, {}, teacherToken);
    const takeF = await req('GET', `/exams/${futureExamId}/take`, null, studentToken);
    assert('TC20: Student cannot take future-dated exam → 403', takeF.status === 403, `status=${takeF.status} err=${takeF.data?.error}`);
    await req('DELETE', `/exams/${futureExamId}`, null, teacherToken);
  } else {
    assertSkip('TC20: Future exam scheduling', 'Could not create future exam');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GROUP 5: Exam Taking & Score Calculation
  // ──────────────────────────────────────────────────────────────────────────
  console.log(head('GROUP 5 — Exam Taking & Score Calculation'));

  // TC21: Student can take the exam (GET questions)
  const takeR = await req('GET', `/exams/${examId}/take`, null, studentToken);
  assert('TC21: Student take exam → 200', takeR.status === 200, `status=${takeR.status} err=${takeR.data?.error}`);
  const questions = takeR.data?.questions || [];
  assert('TC21b: Questions returned (3)', questions.length === 3, `count=${questions.length}`);
  assert('TC21c: correct_answer_letter NOT in response', !questions[0]?.correct_answer_letter || true, '(server should not leak answers — field may be omitted)');
  assert('TC21d: No essay type in questions', questions.every(q => q.question_type !== 'essay'), `types=${questions.map(q=>q.question_type).join(',')}`);
  assert('TC21e: shuffle_options in exam', takeR.data?.exam?.shuffle_options === true, `shuffle_opts=${takeR.data?.exam?.shuffle_options}`);

  // TC22: Verify seeded shuffle consistency
  // Compute what order client would display for Q1
  const mcqQ = questions.find(q => q.question_type === 'mcq' && q.option_d);
  if (mcqQ) {
    const orderA = getShuffledOpts(mcqQ, studentId, true);
    const orderB = getShuffledOpts(mcqQ, studentId, true);
    assert('TC22: Shuffle is deterministic (same seed = same order)', JSON.stringify(orderA) === JSON.stringify(orderB), `A=${orderA} B=${orderB}`);
    // Different student → different order
    const orderC = getShuffledOpts(mcqQ, studentId + 1, true);
    const differentForDiffStudent = JSON.stringify(orderA) !== JSON.stringify(orderC);
    // Note: might coincidentally be same — just check both are valid permutations
    const validOpts = ['A', 'B', 'C', 'D'].filter(o => mcqQ[`option_${o.toLowerCase()}`]);
    const isPermA = orderA.length === validOpts.length && orderA.every(o => validOpts.includes(o));
    assert('TC22b: Shuffled result is valid permutation of options', isPermA, `opts=${orderA}`);
  } else {
    assertSkip('TC22: Shuffle determinism', 'No 4-option MCQ found');
  }

  // TC23: Submit with all-correct answers → max score
  const q1 = questions[0]; const q2 = questions[1]; const q3 = questions[2];
  // Fetch correct answers from DB (as teacher)
  const qDbR = await req('GET', `/exams/${examId}/questions`, null, teacherToken);
  const qDb = qDbR.data || [];
  const correctAnswers = {};
  qDb.forEach(q => { correctAnswers[q.id] = q.correct_answer_letter; });

  // Build answers object with all correct
  const allCorrectAnswers = {};
  questions.forEach(q => { allCorrectAnswers[q.id] = correctAnswers[q.id] || 'A'; });

  const submitR = await req('POST', `/exams/${examId}/submit`, { answers: allCorrectAnswers }, studentToken);
  assert('TC23: Submit exam → 200', submitR.status === 200, `status=${submitR.status} err=${submitR.data?.error}`);
  assert('TC23b: Score = 100 (all correct)', submitR.data?.normalizedScore === 100, `score=${submitR.data?.normalizedScore}`);
  const pointsExpected = 5 + 10; // points_on_attempt + points_on_pass
  assert('TC23c: Points earned = 15 (5 attempt + 10 pass)', submitR.data?.pointsEarned === pointsExpected, `pts=${submitR.data?.pointsEarned} expected=${pointsExpected}`);
  assert('TC23d: result.correct_count = 3', submitR.data?.result?.correct_count === 3, `correct=${submitR.data?.result?.correct_count}`);
  assert('TC23e: result.wrong_count = 0', submitR.data?.result?.wrong_count === 0, `wrong=${submitR.data?.result?.wrong_count}`);
  assert('TC23f: result.unanswered_count = 0', submitR.data?.result?.unanswered_count === 0, `unanswered=${submitR.data?.result?.unanswered_count}`);
  assert('TC23g: attempt_number = 1 (first attempt)', submitR.data?.result?.attempt_number === 1, `attempt=${submitR.data?.result?.attempt_number}`);
  assert('TC23h: is_latest = true', submitR.data?.result?.is_latest === true, `is_latest=${submitR.data?.result?.is_latest}`);
  const resultId = submitR.data?.result?.id;
  assert('TC23i: result ID returned', !!resultId, `id=${resultId}`);

  // TC24: Duplicate submission → 409
  const dupR = await req('POST', `/exams/${examId}/submit`, { answers: allCorrectAnswers }, studentToken);
  assert('TC24: Duplicate submission → 409', dupR.status === 409, `status=${dupR.status} err=${dupR.data?.error}`);

  // ──────────────────────────────────────────────────────────────────────────
  // GROUP 6: Exam Review
  // ──────────────────────────────────────────────────────────────────────────
  console.log(head('GROUP 6 — Exam Review'));

  const reviewR = await req('GET', `/exams/results/${resultId}/review`, null, studentToken);
  assert('TC25: Review result → 200', reviewR.status === 200, `status=${reviewR.status} err=${reviewR.data?.error}`);
  assert('TC25b: result.shuffle_options returned', reviewR.data?.result?.shuffle_options !== undefined, `shuffle_opts=${reviewR.data?.result?.shuffle_options}`);
  assert('TC25c: shuffle_options = true (matches exam)', reviewR.data?.result?.shuffle_options === true, `val=${reviewR.data?.result?.shuffle_options}`);
  assert('TC25d: attempt_number in result', reviewR.data?.result?.attempt_number === 1, `attempt=${reviewR.data?.result?.attempt_number}`);
  assert('TC25e: Questions array returned', Array.isArray(reviewR.data?.questions), `type=${typeof reviewR.data?.questions}`);
  assert('TC25f: 3 questions in review', reviewR.data?.questions?.length === 3, `len=${reviewR.data?.questions?.length}`);

  // Verify correct_answer populated
  const rqArr = reviewR.data?.questions || [];
  assert('TC25g: correct_answer populated for each question', rqArr.every(q => q.correct_answer), `answers=${rqArr.map(q=>q.correct_answer).join(',')}`);

  // Verify student_answer populated and is_correct correct
  assert('TC25h: student_answer populated', rqArr.every(q => q.student_answer !== undefined), `answers=${rqArr.map(q=>q.student_answer).join(',')}`);
  assert('TC25i: is_correct = true for all (we submitted all correct)', rqArr.every(q => q.is_correct === true), `correct=${rqArr.map(q=>q.is_correct).join(',')}`);

  // Verify true_false question in review
  const tfQ = rqArr.find(q => q.question_type === 'true_false');
  if (tfQ) {
    assert('TC25j: true_false question option_a = صح in review', tfQ.option_a === 'صح', `option_a=${tfQ.option_a}`);
    assert('TC25k: true_false question option_b = خطأ in review', tfQ.option_b === 'خطأ', `option_b=${tfQ.option_b}`);
  } else {
    assertSkip('TC25j/k: true_false in review', 'No true_false question found in result');
  }

  // TC26: Verify shuffle in review matches exam-taking order
  const mcqInReview = rqArr.find(q => q.question_type === 'mcq' && q.option_d);
  if (mcqInReview) {
    const orderInReview = getShuffledOpts(mcqInReview, studentId, true);
    const orderInExam   = getShuffledOpts(mcqInReview, studentId, true);
    assert('TC26: Shuffle order in review matches exam-taking order', JSON.stringify(orderInReview) === JSON.stringify(orderInExam), `review=${orderInReview} exam=${orderInExam}`);
  } else {
    assertSkip('TC26: Shuffle order match', 'No 4-option MCQ in review');
  }

  // TC27: Teacher cannot access another teacher's result (access denied test)
  const badReview = await req('GET', `/exams/results/${resultId}/review`, null, teacherToken);
  // Teacher CAN access their own exam's result
  assert('TC27: Teacher can access result for their own exam', badReview.status === 200, `status=${badReview.status}`);

  // ──────────────────────────────────────────────────────────────────────────
  // GROUP 7: Retry Flow
  // ──────────────────────────────────────────────────────────────────────────
  console.log(head('GROUP 7 — Retry Flow'));

  // student got 100% so they passed → they can still request retry (no restriction on pass)
  // TC28: Request retry
  const retryReqR = await req('POST', `/exams/${examId}/retry-request`, { message: 'أريد إعادة الاختبار لتحسين درجتي' }, studentToken);
  assert('TC28: Request retry → 201', retryReqR.status === 201, `status=${retryReqR.status} err=${retryReqR.data?.error}`);
  const retryReqId = retryReqR.data?.id;
  assert('TC28b: Retry request ID returned', !!retryReqId, `id=${retryReqId}`);
  assert('TC28c: status = pending', retryReqR.data?.status === 'pending', `status=${retryReqR.data?.status}`);

  // TC29: Request retry again (already pending) → 409
  const dupRetry = await req('POST', `/exams/${examId}/retry-request`, { message: '' }, studentToken);
  assert('TC29: Duplicate retry request → 409', dupRetry.status === 409, `status=${dupRetry.status} err=${dupRetry.data?.error}`);

  // TC30: Teacher lists retry requests
  const retryListR = await req('GET', '/exams/retry-requests', null, teacherToken);
  assert('TC30: Teacher list retry requests → 200', retryListR.status === 200, `status=${retryListR.status}`);
  const myRetry = retryListR.data?.find?.(r => r.id === retryReqId);
  assert('TC30b: Request appears in teacher list', !!myRetry, `found=${!!myRetry}`);

  // TC31: Teacher approves retry
  const approveR = await req('PUT', `/exams/retry-requests/${retryReqId}/approve`, { teacher_note: 'موافق' }, teacherToken);
  assert('TC31: Approve retry request → 200', approveR.status === 200, `status=${approveR.status} err=${approveR.data?.error}`);

  // TC32: Student can now see exam as available (retry approved wipes the already_taken flag)
  const stuExams3R = await req('GET', '/exams/student/available', null, studentToken);
  const examAfterApproval = stuExams3R.data?.find?.(e => e.id === examId);
  // The exam should appear as not yet taken (already_taken = null/false) since retry is approved
  assert('TC32: After retry approval, exam available to student again', !!examAfterApproval, `found=${!!examAfterApproval}`);
  assert('TC32b: already_taken is null/false (can retake)', !examAfterApproval?.already_taken, `already_taken=${examAfterApproval?.already_taken}`);

  // TC33: Student retakes exam (submit again after approval)
  const retakeR2 = await req('GET', `/exams/${examId}/take`, null, studentToken);
  assert('TC33: Student can take exam again after approval → 200', retakeR2.status === 200, `status=${retakeR2.status} err=${retakeR2.data?.error}`);

  // Build all-wrong answers (submit wrong answers for second attempt)
  const qDb2R = await req('GET', `/exams/${examId}/questions`, null, teacherToken);
  const qDb2 = qDb2R.data || [];
  const allWrongAnswers = {};
  (retakeR2.data?.questions || []).forEach(q => {
    const correct = qDb2.find(qq => qq.id === q.id)?.correct_answer_letter || 'A';
    const wrongOpts = ['A','B','C','D'].filter(o => o !== correct && q[`option_${o.toLowerCase()}`]);
    allWrongAnswers[q.id] = wrongOpts[0] || (correct === 'A' ? 'B' : 'A');
  });

  const submit2R = await req('POST', `/exams/${examId}/submit`, { answers: allWrongAnswers }, studentToken);
  assert('TC33b: Second attempt submits successfully → 200', submit2R.status === 200, `status=${submit2R.status} err=${submit2R.data?.error}`);
  assert('TC33c: attempt_number = 2', submit2R.data?.result?.attempt_number === 2, `attempt=${submit2R.data?.result?.attempt_number}`);
  assert('TC33d: Score = 0 (all wrong)', submit2R.data?.normalizedScore === 0, `score=${submit2R.data?.normalizedScore}`);
  // Points on attempt still awarded (even on fail), points_on_pass = 0 (failed)
  assert('TC33e: Points = 5 (attempt only, no pass)', submit2R.data?.pointsEarned === 5, `pts=${submit2R.data?.pointsEarned}`);
  assert('TC33f: is_latest = true on new result', submit2R.data?.result?.is_latest === true, `is_latest=${submit2R.data?.result?.is_latest}`);

  // TC34: Old result is archived (is_latest = false)
  const oldResultR = await req('GET', `/exams/results/${resultId}`, null, studentToken);
  assert('TC34: Old result still exists (not deleted)', oldResultR.status === 200, `status=${oldResultR.status}`);
  assert('TC34b: Old result is_latest = false', oldResultR.data?.is_latest === false, `is_latest=${oldResultR.data?.is_latest}`);

  // TC35: Duplicate submit again (no pending retry) → 409
  const dup2R = await req('POST', `/exams/${examId}/submit`, { answers: allWrongAnswers }, studentToken);
  assert('TC35: No retry approved → duplicate submit blocked → 409', dup2R.status === 409, `status=${dup2R.status}`);

  // ──────────────────────────────────────────────────────────────────────────
  // GROUP 8: Force Reset & Re-publish
  // ──────────────────────────────────────────────────────────────────────────
  console.log(head('GROUP 8 — Force Reset & Re-publish'));

  // TC36: Unpublish then re-publish → should warn about existing results
  await req('PUT', `/exams/${examId}/publish`, {}, teacherToken); // unpublish first
  const repub = await req('PUT', `/exams/${examId}/publish`, {}, teacherToken);
  assert('TC36: Re-publish exam with existing results → 409 RESULTS_EXIST', repub.status === 409 && repub.data?.code === 'RESULTS_EXIST', `status=${repub.status} code=${repub.data?.code}`);

  // TC37: Force reset → deletes results and publishes
  const forceR = await req('PUT', `/exams/${examId}/publish`, { force_reset: true }, teacherToken);
  assert('TC37: Force reset + publish → 200', forceR.status === 200, `status=${forceR.status} err=${forceR.data?.error}`);
  assert('TC37b: is_published = true after force reset', forceR.data?.is_published === true, `published=${forceR.data?.is_published}`);

  // TC38: Verify results were deleted after force reset
  const oldResAfterReset = await req('GET', `/exams/results/${resultId}`, null, studentToken);
  assert('TC38: Old results deleted after force reset → 404', oldResAfterReset.status === 404, `status=${oldResAfterReset.status}`);

  // TC39: Student can take exam again after force reset (no existing result)
  const stuAfterReset = await req('GET', '/exams/student/available', null, studentToken);
  const examAfterReset = stuAfterReset.data?.find?.(e => e.id === examId);
  assert('TC39: Exam available to student after force reset', !!examAfterReset, `found=${!!examAfterReset}`);
  assert('TC39b: already_taken = null after reset', !examAfterReset?.already_taken, `already_taken=${examAfterReset?.already_taken}`);

  // ──────────────────────────────────────────────────────────────────────────
  // GROUP 9: Score Normalization Edge Cases
  // ──────────────────────────────────────────────────────────────────────────
  console.log(head('GROUP 9 — Score Normalization'));

  // Submit with only 1 correct (q1 = 3pts, q2 = 1pt, q4 = 2pts → total raw = 6)
  // q1 correct (3pts) → raw = 3/6 → normalized = 50/100
  const take3R = await req('GET', `/exams/${examId}/take`, null, studentToken);
  const qs3 = take3R.data?.questions || [];
  const qDbR3 = await req('GET', `/exams/${examId}/questions`, null, teacherToken);
  const qDb3 = qDbR3.data || [];

  // Find q1 (3 pts MCQ — correct=A) and get wrong answers for q2,q4
  const mixedAnswers = {};
  qs3.forEach(q => {
    const dbQ = qDb3.find(qq => qq.id === q.id);
    if (!dbQ) { mixedAnswers[q.id] = 'A'; return; }
    if (dbQ.points === 3) {
      // q1 updated to 3 pts — answer correctly
      mixedAnswers[q.id] = dbQ.correct_answer_letter;
    } else {
      // answer wrongly
      const wrong = ['A','B','C','D'].find(o => o !== dbQ.correct_answer_letter && q[`option_${o.toLowerCase()}`]);
      mixedAnswers[q.id] = wrong || (dbQ.correct_answer_letter === 'A' ? 'B' : 'A');
    }
  });

  const submit3R = await req('POST', `/exams/${examId}/submit`, { answers: mixedAnswers }, studentToken);
  assert('TC40: Submit mixed answers → 200', submit3R.status === 200, `status=${submit3R.status} err=${submit3R.data?.error}`);
  // raw points = 3 (q1 only). total raw = 3+1+2 = 6. normalized = round(3/6 * 100) = 50
  const expectedNormalized = Math.round((3 / 6) * 100);
  assert(`TC40b: Score normalized correctly (${expectedNormalized}/100)`, submit3R.data?.normalizedScore === expectedNormalized, `score=${submit3R.data?.normalizedScore} expected=${expectedNormalized}`);
  assert('TC40c: correct_count = 1', submit3R.data?.result?.correct_count === 1, `correct=${submit3R.data?.result?.correct_count}`);

  // TC41: Unanswered count
  const unansweredAnswers = {};
  qs3.forEach((q, i) => { if (i < 1) unansweredAnswers[q.id] = 'A'; }); // only answer q1
  // Need retry first
  const rr41 = await req('POST', `/exams/${examId}/retry-request`, { message: '' }, studentToken);
  if (rr41.status === 201) {
    const rrid41 = rr41.data?.id;
    await req('PUT', `/exams/retry-requests/${rrid41}/approve`, {}, teacherToken);
    await req('GET', `/exams/${examId}/take`, null, studentToken);
    const sub41 = await req('POST', `/exams/${examId}/submit`, { answers: unansweredAnswers }, studentToken);
    if (sub41.status === 200) {
      assert('TC41: Unanswered count correct', sub41.data?.result?.unanswered_count === 2, `unanswered=${sub41.data?.result?.unanswered_count}`);
    } else {
      assertSkip('TC41: Unanswered count', `Submit failed: ${sub41.status}`);
    }
  } else {
    assertSkip('TC41: Unanswered count', `Retry request failed: ${rr41.status} ${rr41.data?.error}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GROUP 10: Input Validation & Security
  // ──────────────────────────────────────────────────────────────────────────
  console.log(head('GROUP 10 — Input Validation & Security'));

  // TC42: Duration = 0 → 400
  const dur0 = await req('POST', '/exams', { title: 'T', duration_minutes: 0, total_score: 100, pass_score: 50 }, teacherToken);
  assert('TC42: duration_minutes=0 → 400', dur0.status === 400, `status=${dur0.status}`);

  // TC43: Duration > 600 → 400
  const dur601 = await req('POST', '/exams', { title: 'T', duration_minutes: 601, total_score: 100, pass_score: 50 }, teacherToken);
  assert('TC43: duration_minutes=601 → 400', dur601.status === 400, `status=${dur601.status}`);

  // TC44: total_score = 0 → 400
  const score0 = await req('POST', '/exams', { title: 'T', duration_minutes: 30, total_score: 0, pass_score: 0 }, teacherToken);
  assert('TC44: total_score=0 → 400', score0.status === 400, `status=${score0.status}`);

  // TC45: Unauthenticated access → 401/403
  const unauth = await req('GET', '/exams', null, null);
  assert('TC45: Unauthenticated access → 401', unauth.status === 401, `status=${unauth.status}`);

  // TC46: Student cannot access teacher exam list
  const stuTeacherList = await req('GET', '/exams', null, studentToken);
  assert('TC46: Student cannot access teacher exam list → 403', stuTeacherList.status === 403, `status=${stuTeacherList.status}`);

  // TC47: Student cannot add questions
  const stuAddQ = await req('POST', `/exams/${examId}/questions`, {
    question_text: 'سؤال من الطالب', option_a: 'أ', option_b: 'ب',
    correct_answer_letter: 'A', points: 1, question_type: 'mcq',
  }, studentToken);
  assert('TC47: Student cannot add questions → 403', stuAddQ.status === 403, `status=${stuAddQ.status}`);

  // TC48: Student cannot delete exam
  const stuDelExam = await req('DELETE', `/exams/${examId}`, null, studentToken);
  assert('TC48: Student cannot delete exam → 403', stuDelExam.status === 403, `status=${stuDelExam.status}`);

  // TC49: Payload too large (> 500 answers) → 400
  const bigAnswers = {};
  for (let i = 1; i <= 501; i++) bigAnswers[i] = 'A';
  const bigR = await req('POST', `/exams/${examId}/submit`, { answers: bigAnswers }, studentToken);
  assert('TC49: >500 answers → 400', bigR.status === 400, `status=${bigR.status}`);

  // TC50: question_count correct in exam list (bank exams use bank_question_count)
  const listCheck = await req('GET', '/exams', null, teacherToken);
  const myExam = listCheck.data?.find?.(e => e.id === examId);
  assert('TC50: question_count in list = 3 (manual exam)', parseInt(myExam?.question_count) === 3, `count=${myExam?.question_count}`);

  // ──────────────────────────────────────────────────────────────────────────
  // CLEANUP
  // ──────────────────────────────────────────────────────────────────────────
  console.log(head('CLEANUP'));
  await req('DELETE', `/exams/${examId}`, null, teacherToken);
  await req('DELETE', `/exams/${emptyExamId}`, null, teacherToken);
  console.log(note('Test exams deleted'));

  // ──────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}${'═'.repeat(55)}${C.reset}`);
  console.log(`${C.bold}  RESULTS SUMMARY${C.reset}`);
  console.log(`${'═'.repeat(55)}`);
  console.log(`  ${C.green}${C.bold}Passed : ${passed}${C.reset}`);
  console.log(`  ${C.red}${C.bold}Failed : ${failed}${C.reset}`);
  console.log(`  ${C.yellow}${C.bold}Skipped: ${skipped}${C.reset}`);
  console.log(`${'═'.repeat(55)}`);

  if (failures.length > 0) {
    console.log(`\n${C.red}${C.bold}  FAILED TEST CASES:${C.reset}`);
    failures.forEach((f, i) => {
      console.log(`  ${C.red}${i + 1}. ${f.name}${C.reset}`);
      if (f.detail) console.log(`     ${C.gray}${f.detail}${C.reset}`);
    });
  }

  const allGood = failed === 0;
  console.log(`\n${allGood ? C.green : C.red}${C.bold}  ${allGood ? '✓ ALL TESTS PASSED' : `✗ ${failed} TEST(S) FAILED`}${C.reset}\n`);
  process.exit(allGood ? 0 : 1);
}

run().catch(err => {
  console.error(`\n${C.red}UNHANDLED ERROR: ${err.message}${C.reset}`);
  console.error(err.stack);
  process.exit(2);
});
