const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateRecitationScore } = require('../lib/recitationScoring');

test('Recitation review answer mapping & stats computation', async (t) => {
  await t.test('storedAnswers contains answer, student_answer, correct, and is_correct for MCQ and true_false', () => {
    const questions = [
      { id: 1, question_type: 'mcq', correct_answer_letter: 'A', points: 1 },
      { id: 2, question_type: 'true_false', correct_answer_letter: 'T', points: 1 },
      { id: 3, question_type: 'mcq', correct_answer_letter: 'C', points: 1 },
    ];
    const answers = {
      1: 'A', // correct
      2: 'A', // 'A' stands for True -> correct
      3: 'B', // wrong
    };
    const rec = { total_score: 30, pass_score: 15, points_on_attempt: 2, points_on_pass: 5 };
    const res = calculateRecitationScore(questions, answers, rec);

    assert.equal(res.correct, 2);
    assert.equal(res.wrong, 1);
    assert.equal(res.unanswered, 0);
    assert.equal(res.finalScore, 20);
    assert.equal(res.passed, true);

    // Verify storedAnswers
    const q1 = res.storedAnswers.find(a => a.question_id === 1);
    assert.equal(q1.answer, 'A');
    assert.equal(q1.student_answer, 'A');
    assert.equal(q1.correct, true);
    assert.equal(q1.is_correct, true);

    const q3 = res.storedAnswers.find(a => a.question_id === 3);
    assert.equal(q3.answer, 'B');
    assert.equal(q3.student_answer, 'B');
    assert.equal(q3.correct, false);
    assert.equal(q3.is_correct, false);

    // Now simulate the review endpoint parsing logic
    const answerMap = {};
    const storedCorrectMap = {};
    res.storedAnswers.forEach(a => {
      if (a.question_id != null) {
        const ans = a.answer != null ? a.answer : (a.student_answer != null ? a.student_answer : null);
        answerMap[a.question_id] = ans;
        if (a.correct != null) storedCorrectMap[a.question_id] = !!a.correct;
        else if (a.is_correct != null) storedCorrectMap[a.question_id] = !!a.is_correct;
      }
    });

    assert.equal(answerMap[1], 'A');
    assert.equal(answerMap[2], 'A');
    assert.equal(answerMap[3], 'B');
    assert.equal(storedCorrectMap[1], true);
    assert.equal(storedCorrectMap[2], true);
    assert.equal(storedCorrectMap[3], false);
  });

  await t.test('review parser also handles legacy records that only had student_answer & is_correct', () => {
    const legacyAnswers = [
      { question_id: 10, student_answer: 'B', is_correct: true, question_type: 'mcq' },
      { question_id: 11, student_answer: 'C', is_correct: false, question_type: 'mcq' },
      { question_id: 12, student_answer: null, is_correct: false, question_type: 'mcq' },
    ];

    const answerMap = {};
    const storedCorrectMap = {};
    legacyAnswers.forEach(a => {
      if (a.question_id != null) {
        const ans = a.answer != null ? a.answer : (a.student_answer != null ? a.student_answer : null);
        answerMap[a.question_id] = ans;
        if (a.correct != null) storedCorrectMap[a.question_id] = !!a.correct;
        else if (a.is_correct != null) storedCorrectMap[a.question_id] = !!a.is_correct;
      }
    });

    assert.equal(answerMap[10], 'B');
    assert.equal(storedCorrectMap[10], true);
    assert.equal(answerMap[11], 'C');
    assert.equal(storedCorrectMap[11], false);
    assert.equal(answerMap[12], null);
    assert.equal(storedCorrectMap[12], false);
  });
});
