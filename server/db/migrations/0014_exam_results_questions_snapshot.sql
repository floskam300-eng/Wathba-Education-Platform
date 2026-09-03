-- 0014_exam_results_questions_snapshot.sql
-- Store the authoritative questions snapshot (with exact question and option order)
-- on exam_results so that student and teacher reviews always reproduce the exact
-- sequence seen during the exam attempt.
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS questions_snapshot JSONB DEFAULT NULL;
