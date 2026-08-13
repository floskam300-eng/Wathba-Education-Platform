-- Support paginated teacher/assistant recitation participant summaries.
-- The student and timestamp columns keep latest/first-attempt grouping ordered
-- without scanning unrelated recitations.
CREATE INDEX IF NOT EXISTS idx_recitation_results_rec_student_created
  ON recitation_results(recitation_id, student_id, created_at DESC, id DESC);
