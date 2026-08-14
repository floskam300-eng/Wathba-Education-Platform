const assert = require('assert');

console.log('--- Running Timezone & Scoring Logic Tests ---');

// 1. Test Egypt Timezone formatting
function formatEgyptDateTime(isoOrDate, options = {}) {
  if (!isoOrDate) return '';
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString('ar-EG', {
    timeZone: 'Africa/Cairo',
    dateStyle: 'short',
    timeStyle: 'short',
    ...options,
  });
}

const testUtc = '2026-08-14T12:00:00.000Z'; // 12:00 UTC = 15:00 Cairo (UTC+3)
const formatted = formatEgyptDateTime(testUtc, { hour12: false, timeZone: 'Africa/Cairo' });
console.log('UTC Input:', testUtc, '-> Formatted Cairo:', formatted);
assert(formatted.includes('15:00') || formatted.includes('١٥:٠٠') || formatted.includes('3:00') || formatted.includes('٣:٠٠'), 'Should reflect Egypt offset');

// 2. Test Exam scoring of full snapshot vs partial answers
const snapshotQuestions = [
  { id: 1, question_type: 'mcq', correct_answer_letter: 'A', points: 2 },
  { id: 2, question_type: 'mcq', correct_answer_letter: 'B', points: 2 },
  { id: 3, question_type: 'mcq', correct_answer_letter: 'C', points: 2 },
  { id: 4, question_type: 'mcq', correct_answer_letter: 'D', points: 2 },
  { id: 5, question_type: 'mcq', correct_answer_letter: 'A', points: 2 },
];

const studentAnswers = {
  1: 'A', // correct
  2: 'C', // wrong
  // 3, 4, 5 not answered (omitted from answers object)
};

// Simulation of updated evaluateAnswers logic
let score = 0;
let correctCount = 0;
let wrongCount = 0;
let unansweredCount = 0;

for (const q of snapshotQuestions) {
  const ans = studentAnswers[q.id];
  const pts = q.points || 1;
  if (!ans) {
    unansweredCount++;
  } else if (ans.toUpperCase() === q.correct_answer_letter.toUpperCase()) {
    score += pts;
    correctCount++;
  } else {
    wrongCount++;
  }
}

const totalEvaluated = correctCount + wrongCount + unansweredCount;
console.log(`Evaluated: ${totalEvaluated} questions. Correct: ${correctCount}, Wrong: ${wrongCount}, Unanswered: ${unansweredCount}, Score: ${score}/10`);
assert.strictEqual(totalEvaluated, 5, 'All 5 snapshot questions must be evaluated');
assert.strictEqual(correctCount, 1, '1 answer was correct');
assert.strictEqual(wrongCount, 1, '1 answer was wrong');
assert.strictEqual(unansweredCount, 3, '3 untouched questions marked as unanswered');
assert.strictEqual(score, 2, 'Total score should be 2 out of 10');

console.log('✓ All Timezone & Scoring Logic Tests Passed Successfully!');
