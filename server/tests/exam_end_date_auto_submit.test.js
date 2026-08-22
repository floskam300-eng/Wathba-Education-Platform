const test = require('node:test');
const assert = require('node:assert');
const pool = require('../db/connection');
const { calculateExamScore } = require('../lib/examScoring');
const { markAbsentStudents } = require('../routes/exams');

test('Exam end_date auto-submission and absence isolation', async (t) => {
  await t.test('Unit: Capping remaining time by end_date when entering late', () => {
    // Exam duration 60 mins (3600s), but end_date is only 15 mins (900s) away
    const serverNow = new Date('2026-08-22T13:45:00.000Z');
    const endDate = new Date('2026-08-22T14:00:00.000Z');
    const durationMinutes = 60;

    const timeUntilEndSec = Math.max(0, Math.floor((endDate.getTime() - serverNow.getTime()) / 1000));
    const timeByDurationSec = durationMinutes * 60;
    const remainingSeconds = Math.min(timeByDurationSec, timeUntilEndSec);

    assert.strictEqual(remainingSeconds, 900); // exactly 15 minutes
  });

  await t.test('Unit: Grading incomplete exam session with missed questions', () => {
    const questions = [
      { id: 1, question_type: 'mcq', points: 10, correct_answer_letter: 'A' },
      { id: 2, question_type: 'mcq', points: 10, correct_answer_letter: 'B' },
      { id: 3, question_type: 'mcq', points: 10, correct_answer_letter: 'C' },
      { id: 4, question_type: 'mcq', points: 10, correct_answer_letter: 'D' },
    ];
    const examMeta = { total_score: 100, pass_score: 50, points_on_pass: 10 };

    // Student answered Q1 and Q2, missed Q3 and Q4
    const partialAnswers = {
      1: 'A', // correct (10 pts)
      2: 'C', // wrong (0 pts)
    };

    const graded = calculateExamScore(questions, partialAnswers, examMeta);
    // Raw score: 10 / 40 -> normalized 25 / 100
    assert.strictEqual(graded.score, 10);
    assert.strictEqual(graded.normalizedScore, 25);
    assert.strictEqual(graded.correct, 1);
    assert.strictEqual(graded.wrong, 1);
    assert.strictEqual(graded.unanswered, 2); // Q3 and Q4
    assert.strictEqual(graded.passed, false);
    assert.strictEqual(graded.detailedAnswers.length, 4);
    assert.strictEqual(graded.detailedAnswers[0].student_answer, 'A');
    assert.strictEqual(graded.detailedAnswers[0].is_correct, true);
    assert.strictEqual(graded.detailedAnswers[1].student_answer, 'C');
    assert.strictEqual(graded.detailedAnswers[1].is_correct, false);
    assert.strictEqual(graded.detailedAnswers[2].student_answer, null);
    assert.strictEqual(graded.detailedAnswers[2].is_correct, false);
    assert.strictEqual(graded.detailedAnswers[3].student_answer, null);
    assert.strictEqual(graded.detailedAnswers[3].is_correct, false);
  });

  await t.test('Integration: markAbsentStudents auto-submits active session and marks only non-taker as absent', async () => {
    // 1. Setup temporary test teacher, exam, questions, and students
    const teacherRes = await pool.query(
      `INSERT INTO teachers (username, password, name)
       VALUES ('_test_late_exam_teacher', 'hash123', 'Teacher Late Exam')
       RETURNING id`
    );
    const teacherId = teacherRes.rows[0].id;

    const student1Res = await pool.query(
      `INSERT INTO students (username, password, name, teacher_id)
       VALUES ('_test_s1_late', 'hash', 'Student Taking Exam', $1)
       RETURNING id`,
      [teacherId]
    );
    const s1Id = student1Res.rows[0].id;

    const student2Res = await pool.query(
      `INSERT INTO students (username, password, name, teacher_id)
       VALUES ('_test_s2_absent', 'hash', 'Student Missed Exam', $1)
       RETURNING id`,
      [teacherId]
    );
    const s2Id = student2Res.rows[0].id;

    // Exam started 1 hour ago, ended 5 minutes ago
    const examRes = await pool.query(
      `INSERT INTO exams (title, duration_minutes, total_score, pass_score, teacher_id, is_published, start_date, end_date)
       VALUES ('Late Entry Exam', 60, 100, 50, $1, true, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '5 minutes')
       RETURNING id`,
      [teacherId]
    );
    const examId = examRes.rows[0].id;

    const q1 = await pool.query(
      `INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_answer_letter, points)
       VALUES ($1, 'Q1', 'Opt A', 'Opt B', 'Opt C', 'Opt D', 'A', 50) RETURNING id`,
      [examId]
    );
    const q2 = await pool.query(
      `INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_answer_letter, points)
       VALUES ($1, 'Q2', 'Opt A', 'Opt B', 'Opt C', 'Opt D', 'B', 50) RETURNING id`,
      [examId]
    );

    const questionsSnapshot = [
      { id: q1.rows[0].id, question_text: 'Q1', points: 50, correct_answer_letter: 'A' },
      { id: q2.rows[0].id, question_text: 'Q2', points: 50, correct_answer_letter: 'B' },
    ];

    // Student 1 entered 15 mins ago and answered Q1 correctly, left Q2 blank
    const s1Answers = { [q1.rows[0].id]: 'A' };
    await pool.query(
      `INSERT INTO exam_sessions (student_id, exam_id, started_at, questions_snapshot, answers)
       VALUES ($1, $2, NOW() - INTERVAL '15 minutes', $3, $4)`,
      [s1Id, examId, JSON.stringify(questionsSnapshot), JSON.stringify(s1Answers)]
    );

    // Student 2 has NO session and NO result (truly absent)

    // Run markAbsentStudents (which now auto-submits active sessions first)
    const absentCount = await markAbsentStudents(pool, examId, teacherId);

    // Assertions:
    // Only Student 2 was marked absent
    assert.strictEqual(absentCount, 1);

    // Verify Student 1 (taking the exam when it ended)
    const s1Result = await pool.query(
      'SELECT * FROM exam_results WHERE student_id=$1 AND exam_id=$2 AND is_latest=true',
      [s1Id, examId]
    );
    assert.strictEqual(s1Result.rows.length, 1);
    const res1 = s1Result.rows[0];
    assert.strictEqual(res1.is_absent, false);
    assert.strictEqual(res1.score, 50); // Normalized 50/100
    assert.strictEqual(res1.correct_count, 1);
    assert.strictEqual(res1.wrong_count, 0);
    assert.strictEqual(res1.unanswered_count, 1); // Q2 missed

    // Student 1's session in exam_sessions should be cleaned up
    const s1Session = await pool.query(
      'SELECT * FROM exam_sessions WHERE student_id=$1 AND exam_id=$2',
      [s1Id, examId]
    );
    assert.strictEqual(s1Session.rows.length, 0);

    // Verify Student 2 (never entered)
    const s2Result = await pool.query(
      'SELECT * FROM exam_results WHERE student_id=$1 AND exam_id=$2 AND is_latest=true',
      [s2Id, examId]
    );
    assert.strictEqual(s2Result.rows.length, 1);
    const res2 = s2Result.rows[0];
    assert.strictEqual(res2.is_absent, true);
    assert.strictEqual(res2.score, 0);

    // Clean up
    await pool.query('DELETE FROM teachers WHERE id=$1', [teacherId]);
  });
});
