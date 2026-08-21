const test = require('node:test');
const assert = require('node:assert');
const { calculateRecitationScore } = require('../lib/recitationScoring');

test('Recitation progress scoring - calculateRecitationScore unit tests', async (t) => {
  const sampleSnapshot = [
    {
      id: 101,
      question_type: 'mcq',
      points: 5,
      correct_answer_letter: 'A',
    },
    {
      id: 102,
      question_type: 'true_false',
      points: 5,
      correct_answer_letter: 'A', // A = صح
    },
    {
      id: 103,
      question_type: 'image_multi',
      points: 10,
      sub_questions: [
        { label: '1', correct: 'A', points: 5, type: 'mcq' },
        { label: '2', correct: 'B', points: 5, type: 'true_false' },
      ],
    },
  ];

  const recMeta = {
    total_score: 100,
    pass_score: 50,
    points_on_attempt: 5,
    points_on_pass: 15,
  };

  await t.test('Recitation: partial answers before closing app', () => {
    const studentAnswers = {
      101: 'A', // Correct (+5 raw)
      102: 'B', // Wrong (0 raw)
      // 103 is unanswered
    };

    const res = calculateRecitationScore(sampleSnapshot, studentAnswers, recMeta);
    // Total raw = 5 + 5 + (5+5) = 20
    // Earned raw = 5
    // Final score = (5 / 20) * 100 = 25
    assert.strictEqual(res.rawScore, 5);
    assert.strictEqual(res.totalPoints, 20);
    assert.strictEqual(res.finalScore, 25);
    assert.strictEqual(res.correct, 1);
    assert.strictEqual(res.wrong, 1);
    assert.strictEqual(res.unanswered, 2); // Q103 sub-questions
    assert.strictEqual(res.passed, false);
    assert.strictEqual(res.pointsEarned, 5); // points_on_attempt only
  });

  await t.test('Recitation: all questions answered correctly', () => {
    const studentAnswers = {
      101: 'A',
      102: 'A',
      103: { '1': 'A', '2': 'B' },
    };

    const res = calculateRecitationScore(sampleSnapshot, studentAnswers, recMeta);
    assert.strictEqual(res.rawScore, 20);
    assert.strictEqual(res.finalScore, 100);
    assert.strictEqual(res.correct, 4);
    assert.strictEqual(res.wrong, 0);
    assert.strictEqual(res.unanswered, 0);
    assert.strictEqual(res.passed, true);
    assert.strictEqual(res.pointsEarned, 20); // 5 attempt + 15 pass
  });

  await t.test('Recitation: array format payload support (as sent by submit route)', () => {
    const studentPayload = [
      { question_id: 101, answer: 'A' },
      { question_id: 102, answer: 'A' },
      { question_id: 103, answer: JSON.stringify({ '1': 'A', '2': 'B' }) },
    ];

    const res = calculateRecitationScore(sampleSnapshot, studentPayload, recMeta);
    assert.strictEqual(res.rawScore, 20);
    assert.strictEqual(res.finalScore, 100);
    assert.strictEqual(res.passed, true);
  });
});
