const test = require('node:test');
const assert = require('node:assert');
const { calculateExamScore } = require('../lib/examScoring');

test('Exam progress scoring - calculateExamScore unit tests', async (t) => {
  const sampleQuestions = [
    {
      id: 1,
      question_type: 'mcq',
      points: 5,
      correct_answer_letter: 'A',
    },
    {
      id: 2,
      question_type: 'mcq',
      points: 5,
      correct_answer_letter: 'B',
    },
    {
      id: 3,
      question_type: 'true_false',
      points: 5,
      correct_answer_letter: 'A', // A = صح
    },
    {
      id: 4,
      question_type: 'image_multi',
      points: 10,
      sub_questions: [
        { label: '1', correct: 'A', points: 5, type: 'mcq' },
        { label: '2', correct: 'B', points: 5, type: 'true_false' },
      ],
    },
  ];

  const examMeta = {
    total_score: 100,
    pass_score: 50,
    points_on_pass: 20,
    points_on_attempt: 10,
  };

  await t.test('Grading when student answered only 2 questions before closing the app', () => {
    // Student answered Q1 (correct) and Q2 (wrong), didn't answer Q3 and Q4
    const studentAnswers = {
      1: 'A',
      2: 'C',
    };

    const result = calculateExamScore(sampleQuestions, studentAnswers, examMeta);
    // Total raw points = 5 + 5 + 5 + 10 = 25
    // Earned raw points = 5 (from Q1)
    // Normalized score = (5 / 25) * 100 = 20
    assert.strictEqual(result.score, 5);
    assert.strictEqual(result.normalizedScore, 20);
    assert.strictEqual(result.correct, 1);
    assert.strictEqual(result.wrong, 1);
    assert.strictEqual(result.unanswered, 3); // Q3 + 2 sub-questions of Q4
    assert.strictEqual(result.passed, false);
    assert.strictEqual(result.detailedAnswers.length, 4);

    // Verify detailed answers
    assert.strictEqual(result.detailedAnswers[0].is_correct, true);
    assert.strictEqual(result.detailedAnswers[0].student_answer, 'A');
    assert.strictEqual(result.detailedAnswers[1].is_correct, false);
    assert.strictEqual(result.detailedAnswers[1].student_answer, 'C');
    assert.strictEqual(result.detailedAnswers[2].is_correct, false);
    assert.strictEqual(result.detailedAnswers[2].student_answer, null);
  });

  await t.test('Grading when student answered all questions correctly before closing', () => {
    const studentAnswers = {
      1: 'A',
      2: 'B',
      3: 'A',
      4: { '1': 'A', '2': 'B' },
    };

    const result = calculateExamScore(sampleQuestions, studentAnswers, examMeta);
    assert.strictEqual(result.score, 25);
    assert.strictEqual(result.normalizedScore, 100);
    assert.strictEqual(result.correct, 5); // 1 + 1 + 1 + 2 subs
    assert.strictEqual(result.wrong, 0);
    assert.strictEqual(result.unanswered, 0);
    assert.strictEqual(result.passed, true);
  });

  await t.test('Grading when student answered nothing at all', () => {
    const studentAnswers = {};
    const result = calculateExamScore(sampleQuestions, studentAnswers, examMeta);
    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.normalizedScore, 0);
    assert.strictEqual(result.correct, 0);
    assert.strictEqual(result.wrong, 0);
    assert.strictEqual(result.unanswered, 5);
    assert.strictEqual(result.passed, false);
  });
});
