require('dotenv').config();
const pool = require('../server/db/connection');

async function main() {
  const examId = 774;
  console.log('Debugging examId:', examId);
  try {
    // 1. Verify exam exists
    console.log('Query 1: Fetching exam...');
    const examRow = await pool.query(
      `SELECT id, title, total_score, pass_score, duration_minutes, created_at, question_source, bank_id
       FROM exams WHERE id = $1`,
      [examId]
    );
    console.log('Exam query result rows:', examRow.rows);
    if (!examRow.rows.length) {
      console.log('Exam not found in database!');
      return;
    }
    const exam = examRow.rows[0];

    // 2. Overview stats
    console.log('Query 2: Fetching overview stats...');
    const overviewRow = await pool.query(`
      SELECT
        COUNT(DISTINCT er.student_id)::int AS total_students,
        COUNT(er.id) FILTER (WHERE er.is_absent = false)::int AS total_attempts,
        ROUND(AVG(er.score::numeric / NULLIF($2::int, 0) * 100) FILTER (WHERE er.is_absent = false), 1) AS avg_pct,
        ROUND(AVG(er.score::numeric) FILTER (WHERE er.is_absent = false), 1) AS avg_score,
        MAX(er.score) FILTER (WHERE er.is_absent = false) AS max_score,
        MIN(er.score) FILTER (WHERE er.is_absent = false) AS min_score,
        COUNT(er.id) FILTER (WHERE er.is_absent = false AND er.score >= $3::int)::int AS pass_count,
        COUNT(er.id) FILTER (WHERE er.is_absent = false AND er.score < $3::int)::int AS fail_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (er.end_time - er.start_time)) / 60.0)
              FILTER (WHERE er.is_absent = false AND er.start_time IS NOT NULL AND er.end_time IS NOT NULL), 1) AS avg_time_minutes,
        ROUND(MIN(EXTRACT(EPOCH FROM (er.end_time - er.start_time)) / 60.0)
              FILTER (WHERE er.is_absent = false AND er.start_time IS NOT NULL AND er.end_time IS NOT NULL), 1) AS fastest_time_minutes,
        ROUND(MAX(EXTRACT(EPOCH FROM (er.end_time - er.start_time)) / 60.0)
              FILTER (WHERE er.is_absent = false AND er.start_time IS NOT NULL AND er.end_time IS NOT NULL), 1) AS slowest_time_minutes
      FROM exam_results er
      WHERE er.exam_id = $1 AND er.is_latest = true
    `, [examId, exam.total_score, exam.pass_score]);
    console.log('Overview stats:', overviewRow.rows[0]);

    // 3. Score distribution
    console.log('Query 3: Fetching score distribution...');
    const scoreDist = await pool.query(`
      SELECT
        CASE
          WHEN pct BETWEEN 0 AND 39 THEN '0-39'
          WHEN pct BETWEEN 40 AND 59 THEN '40-59'
          WHEN pct BETWEEN 60 AND 74 THEN '60-74'
          WHEN pct BETWEEN 75 AND 89 THEN '75-89'
          WHEN pct BETWEEN 90 AND 100 THEN '90-100'
        END AS range,
        COUNT(*)::int AS count
      FROM (
        SELECT ROUND(er.score::numeric / NULLIF($2::int, 0) * 100)::int AS pct
        FROM exam_results er
        WHERE er.exam_id = $1 AND er.is_latest = true AND er.is_absent = false
      ) sub
      GROUP BY range
      ORDER BY range
    `, [examId, exam.total_score]);
    console.log('Score distribution:', scoreDist.rows);

    // 4. Per-question stats
    console.log('Query 4: Fetching question stats...');
    const qStats = await pool.query(`
      SELECT
        (ans->>'question_id')::int AS question_id,
        COALESCE(q.question_text, bq.question_text) AS question_text,
        COALESCE(q.question_image_url, bq.question_image_url) AS question_image_url,
        COALESCE(q.question_type, bq.question_type, 'mcq') AS question_type,
        COALESCE(q.option_a, bq.option_a) AS option_a,
        COALESCE(q.option_b, bq.option_b) AS option_b,
        COALESCE(q.option_c, bq.option_c) AS option_c,
        COALESCE(q.option_d, bq.option_d) AS option_d,
        COALESCE(q.correct_answer_letter, bq.correct_answer_letter) AS correct_answer,
        COUNT(*)::int AS total_attempts,
        COUNT(*) FILTER (WHERE (ans->>'is_correct')::boolean = true)::int AS correct_count,
        COUNT(*) FILTER (
          WHERE (ans->>'is_correct')::boolean = false
            AND ans->>'student_answer' IS NOT NULL
            AND ans->>'student_answer' != 'null'
            AND ans->>'student_answer' != ''
        )::int AS wrong_count,
        COUNT(*) FILTER (
          WHERE ans->>'student_answer' IS NULL
            OR ans->>'student_answer' = 'null'
            OR ans->>'student_answer' = ''
        )::int AS unanswered_count,
        COUNT(*) FILTER (WHERE UPPER(ans->>'student_answer') = 'A')::int AS ans_a,
        COUNT(*) FILTER (WHERE UPPER(ans->>'student_answer') = 'B')::int AS ans_b,
        COUNT(*) FILTER (WHERE UPPER(ans->>'student_answer') = 'C')::int AS ans_c,
        COUNT(*) FILTER (WHERE UPPER(ans->>'student_answer') = 'D')::int AS ans_d,
        COUNT(*) FILTER (WHERE UPPER(ans->>'student_answer') = 'T')::int AS ans_t,
        COUNT(*) FILTER (WHERE UPPER(ans->>'student_answer') = 'F')::int AS ans_f
      FROM exam_results er
      JOIN LATERAL jsonb_array_elements(er.answers) AS ans ON true
      LEFT JOIN questions q ON q.id = (ans->>'question_id')::integer AND $2 != 'bank'
      LEFT JOIN bank_questions bq ON bq.id = (ans->>'question_id')::integer AND $2 = 'bank'
      WHERE er.exam_id = $1
        AND er.is_latest = true
        AND er.is_absent = false
        AND jsonb_typeof(er.answers) = 'array'
        AND ans->>'is_correct' IS NOT NULL
        AND (q.id IS NOT NULL OR bq.id IS NOT NULL)
      GROUP BY (ans->>'question_id')::int, q.question_text, bq.question_text, q.question_image_url, bq.question_image_url,
               q.question_type, bq.question_type, q.option_a, bq.option_a, q.option_b, bq.option_b,
               q.option_c, bq.option_c, q.option_d, bq.option_d,
               q.correct_answer_letter, bq.correct_answer_letter
      ORDER BY wrong_count DESC, correct_count ASC
    `, [examId, exam.question_source || 'manual']);
    console.log('Question stats count:', qStats.rows.length);

    // 5. Student results
    console.log('Query 5: Fetching student results...');
    const studRes = await pool.query(`
      SELECT
        er.student_id,
        s.name AS student_name,
        s.academic_stage,
        er.score,
        ROUND(er.score::numeric / NULLIF($2::int, 0) * 100)::int AS pct,
        er.correct_count,
        er.wrong_count,
        er.unanswered_count,
        ROUND(EXTRACT(EPOCH FROM (er.end_time - er.start_time)) / 60.0, 1) AS time_minutes,
        er.score >= $3::int AS passed,
        er.created_at
      FROM exam_results er
      JOIN students s ON er.student_id = s.id
      WHERE er.exam_id = $1 AND er.is_latest = true AND er.is_absent = false AND s.deleted_at IS NULL
      ORDER BY er.score DESC, er.created_at ASC
    `, [examId, exam.total_score, exam.pass_score]);
    console.log('Student results count:', studRes.rows.length);

  } catch (err) {
    console.error('DATABASE ERROR DETECTED:', err);
  } finally {
    await pool.end();
  }
}

main();
