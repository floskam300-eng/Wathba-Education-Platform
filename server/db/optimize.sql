-- Wathba Database Optimization Indexes

-- 1. Index on exam_results for latest student scores (Stage 1 / Stage 2)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_exam_results_student_latest
  ON exam_results(student_id, is_latest) WHERE is_latest = true;

-- 2. Index on recitation_sessions for student sessions sorted by started_at DESC (started_at exists, created_at does not)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recitation_sessions_student
  ON recitation_sessions(student_id, started_at DESC);

-- 3. Index on recitation_results for student results sorted by created_at DESC (created_at exists on results)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recitation_results_student
  ON recitation_results(student_id, created_at DESC);

-- 4. Index on payments for tracking student status chronologically (payment_date exists, created_at does not)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_student_status
  ON payments(student_id, status, payment_date DESC);

-- 5. Index on notification_log (actual table name) for unread student platform notifications
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notification_log_student_unread
  ON notification_log(student_id, is_read) WHERE is_read = false AND source = 'platform';

-- 6. Index on students for active students per teacher
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_teacher_active
  ON students(teacher_id, is_suspended, deleted_at) WHERE deleted_at IS NULL;

-- 7. GIN index on exam_results.answers JSONB column for lateral querying performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_exam_results_answers_gin
  ON exam_results USING GIN(answers);
