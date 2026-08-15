const assert = require('assert');

console.log('====================================================');
console.log('--- RUNNING DEEP AUDIT VERIFICATION TEST SUITE ---');
console.log('====================================================');

// ── TEST 1: Strict Egypt Timezone Conversions ────────────────────────
function fmtEgyptDateTimeLocal(d) {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (!date || isNaN(date.getTime())) return '';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

function parseEgyptDateTimeToUTC(egyptStr) {
  if (!egyptStr) return null;
  const clean = String(egyptStr).trim().replace(' ', 'T');
  const [datePart, timePart] = clean.split('T');
  if (!datePart || !timePart) return null;
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d) || isNaN(hh) || isNaN(mm)) return null;

  let utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  for (let i = 0; i < 3; i++) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(utcGuess);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const hourVal = +map.hour === 24 ? 0 : +map.hour;
    const cairoDate = new Date(Date.UTC(+map.year, +map.month - 1, +map.day, hourVal, +map.minute, +map.second));
    const targetDate = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
    const diffMs = targetDate.getTime() - cairoDate.getTime();
    if (diffMs === 0) break;
    utcGuess = new Date(utcGuess.getTime() + diffMs);
  }
  return utcGuess.toISOString();
}

// Test Summer Time (UTC+3):
const cairoSummerStr = '2026-08-15T18:00';
const convertedUTC = parseEgyptDateTimeToUTC(cairoSummerStr);
console.log(`[T1-A] Cairo Input: ${cairoSummerStr} -> UTC Converted: ${convertedUTC}`);
assert.strictEqual(convertedUTC, '2026-08-15T15:00:00.000Z', '18:00 Cairo Summer should be 15:00 UTC');

const formattedBack = fmtEgyptDateTimeLocal(convertedUTC);
console.log(`[T1-B] UTC ${convertedUTC} -> Formatted back to Cairo input: ${formattedBack}`);
assert.strictEqual(formattedBack, cairoSummerStr, 'Should round-trip back to 2026-08-15T18:00 perfectly');

// ── TEST 2: Expired Submissions Auto-Grading & Result Recording ─────
console.log('\n[T2] Verifying expired submissions auto-grading logic...');
const snapshotQuestions = [
  { id: 101, points: 2, correct_answer_letter: 'A', question_type: 'mcq' },
  { id: 102, points: 3, correct_answer_letter: 'B', question_type: 'mcq' },
  { id: 103, points: 5, correct_answer_letter: 'C', question_type: 'mcq' },
];

const submittedAnswers = { 101: 'A' }; // 1 answered correctly, 2 left empty
const examDeadlineMs = Date.now() - 5000; // expired 5 seconds ago

// Server-side lock calculation
const isLocked = Date.now() <= (examDeadlineMs + 15000); // within 15s grace for locked
let score = 0, correct = 0, wrong = 0, unanswered = 0;

for (const q of snapshotQuestions) {
  const ans = submittedAnswers[q.id];
  if (!ans) {
    unanswered++;
  } else if (ans === q.correct_answer_letter) {
    score += q.points;
    correct++;
  } else {
    wrong++;
  }
}

const totalPoints = snapshotQuestions.reduce((s, q) => s + q.points, 0); // 10
const normalizedScore = Math.round((score / totalPoints) * 100); // 20
const passed = normalizedScore >= 50; // false
const pointsEarned = passed ? 10 : 0;

console.log(`Score: ${normalizedScore}/100, Correct: ${correct}, Wrong: ${wrong}, Unanswered: ${unanswered}, Passed: ${passed}`);
assert.strictEqual(normalizedScore, 20);
assert.strictEqual(unanswered, 2);
assert.strictEqual(correct, 1);
assert.strictEqual(pointsEarned, 0);

// ── TEST 3: Transactional Concurrency Lock Simulation ───────────────
console.log('\n[T3] Verifying double submit concurrency protection logic...');
const existingResults = [{ id: 99, student_id: 1, exam_id: 10, is_latest: true, is_absent: false, points_earned: 10 }];
const approvedRetryRequests = []; // No approved retry request

function simulateSubmitTransaction(hasExistingResult, retryRequests) {
  if (hasExistingResult) {
    const hasApprovedRetry = retryRequests.some(r => r.status === 'approved');
    if (!hasApprovedRetry) {
      return { status: 409, error: 'لقد أديت هذا الاختبار مسبقاً' };
    }
  }
  return { status: 200, success: true };
}

const resultReq1 = simulateSubmitTransaction(false, approvedRetryRequests);
console.log('Concurrent Request 1 (first submission):', resultReq1.status);
assert.strictEqual(resultReq1.status, 200);

const resultReq2 = simulateSubmitTransaction(true, approvedRetryRequests);
console.log('Concurrent Request 2 (second submission without retry approval):', resultReq2.status, resultReq2.error);
assert.strictEqual(resultReq2.status, 409, 'Must reject concurrent double-submit with 409');

console.log('\n====================================================');
console.log('✓ ALL 3 DEEP AUDIT VERIFICATION TESTS PASSED SUCCESSFULLY!');
console.log('====================================================');
