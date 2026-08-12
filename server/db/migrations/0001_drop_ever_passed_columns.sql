-- Drop the dead `ever_passed` column from recitation_results and exam_results.
-- The column was added but never written to by any code path:
--   * Both INSERT paths (recitations.js, exams submit) omit it.
--   * No UPDATE … SET ever_passed = true runs on submission.
-- Readers silently fall back to bool_or(passed) subqueries, so dropping is safe.
ALTER TABLE recitation_results DROP COLUMN IF EXISTS ever_passed;
ALTER TABLE exam_results       DROP COLUMN IF EXISTS ever_passed;
