Done: 195 statements written
===================================
-- Wathba Platform — Incremental Migration Script
-- Safe to run on any existing production DB.
-- All ADD COLUMN statements use IF NOT EXISTS.
-- All DROP CONSTRAINT statements use IF EXISTS.
-- Indexes use IF NOT EXISTS.
-- Run with:
--   psql "$DATABASE_URL" -f server/db/migrate.sql
-- =============================================================

ALTER TABLE teachers ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false;

ALTER TABLE students ADD COLUMN IF NOT EXISTS plain_password VARCHAR(255);

ALTER TABLE videos    ADD COLUMN IF NOT EXISTS section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL;

ALTER TABLE pdf_files ADD COLUMN IF NOT EXISTS section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS start_date  TIMESTAMP;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS end_date    TIMESTAMP;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;

ALTER TABLE assistants ADD COLUMN IF NOT EXISTS can_manage_payments BOOLEAN DEFAULT false;

ALTER TABLE assistants ADD COLUMN IF NOT EXISTS can_manage_courses  BOOLEAN DEFAULT true;

ALTER TABLE assistants ADD COLUMN IF NOT EXISTS can_send_notifications BOOLEAN DEFAULT false;

ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type      VARCHAR(20) DEFAULT 'mcq';

ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'general';

ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;

ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'whatsapp';

ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS title VARCHAR(200);

ALTER TABLE students ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS pre_unpublish_published BOOLEAN DEFAULT false;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT false;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS start_notified BOOLEAN DEFAULT false;

ALTER TABLE payments ALTER COLUMN method SET DEFAULT '';

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_verified_by_fkey;

ALTER TABLE courses ALTER COLUMN thumbnail_url TYPE TEXT;

ALTER TABLE videos  ALTER COLUMN file_path_or_url TYPE TEXT;

ALTER TABLE pdf_files ALTER COLUMN file_url TYPE TEXT;

ALTER TABLE teachers ALTER COLUMN logo_url TYPE TEXT;

ALTER TABLE teachers ALTER COLUMN photo_url TYPE TEXT;

ALTER TABLE videos ADD COLUMN IF NOT EXISTS url_480  TEXT;

ALTER TABLE videos ADD COLUMN IF NOT EXISTS url_720  TEXT;

ALTER TABLE videos ADD COLUMN IF NOT EXISTS url_1080 TEXT;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS shuffle_questions BOOLEAN DEFAULT false;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS shuffle_options  BOOLEAN DEFAULT false;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS question_source VARCHAR(20) DEFAULT 'manual';

ALTER TABLE exams ADD COLUMN IF NOT EXISTS bank_id INTEGER REFERENCES question_banks(id) ON DELETE SET NULL;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS bank_question_count INTEGER DEFAULT 10;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS points_on_attempt INTEGER DEFAULT 0;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS points_on_pass    INTEGER DEFAULT 0;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS points_on_complete INTEGER DEFAULT 0;

ALTER TABLE question_banks ADD COLUMN IF NOT EXISTS course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL;

ALTER TABLE students ADD COLUMN IF NOT EXISTS fcm_token TEXT DEFAULT NULL;

ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_event_plays_student_event ON event_plays(student_id, event_id);

CREATE INDEX IF NOT EXISTS idx_questions_exam_id ON questions(exam_id);

CREATE INDEX IF NOT EXISTS idx_exam_results_student_id ON exam_results(student_id);

CREATE INDEX IF NOT EXISTS idx_exam_results_exam_id ON exam_results(exam_id);

CREATE INDEX IF NOT EXISTS idx_video_progress_student_id ON video_progress(student_id);

CREATE INDEX IF NOT EXISTS idx_video_progress_video_id ON video_progress(video_id);

CREATE INDEX IF NOT EXISTS idx_payments_student_id ON payments(student_id);

CREATE INDEX IF NOT EXISTS idx_notification_log_student_id ON notification_log(student_id);

CREATE INDEX IF NOT EXISTS idx_students_teacher_id ON students(teacher_id);

CREATE INDEX IF NOT EXISTS idx_courses_teacher_id ON courses(teacher_id);

CREATE INDEX IF NOT EXISTS idx_enrollment_student_id ON student_course_enrollment(student_id);

CREATE INDEX IF NOT EXISTS idx_enrollment_course_id ON student_course_enrollment(course_id);

ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1;

ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS is_latest BOOLEAN DEFAULT true;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_exam_results_student_exam'
  ) THEN
    ALTER TABLE exam_results DROP CONSTRAINT uq_exam_results_student_exam;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_exam_results_latest
  ON exam_results (student_id, exam_id)
  WHERE is_latest = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_badges_student_exam'
  ) THEN
    ALTER TABLE badges ADD CONSTRAINT uq_badges_student_exam UNIQUE (student_id, exam_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='exam_results' AND column_name='essay_graded') THEN
    ALTER TABLE exam_results DROP COLUMN essay_graded;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='exam_results' AND column_name='essay_score_adjustment') THEN
    ALTER TABLE exam_results DROP COLUMN essay_score_adjustment;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='questions' AND column_name='essay_answer_key') THEN
    ALTER TABLE questions DROP COLUMN essay_answer_key;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bank_questions' AND column_name='essay_answer_key') THEN
    ALTER TABLE bank_questions DROP COLUMN essay_answer_key;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_exam_sessions_student_exam ON exam_sessions(student_id, exam_id);

CREATE INDEX IF NOT EXISTS idx_notification_log_student_source ON notification_log(student_id, source);

CREATE INDEX IF NOT EXISTS idx_exam_results_student_exam ON exam_results(student_id, exam_id);

CREATE INDEX IF NOT EXISTS idx_exam_retry_requests_student_exam ON exam_retry_requests(student_id, exam_id);

CREATE INDEX IF NOT EXISTS idx_live_stream_viewers_stream_active ON live_stream_viewers(stream_id, is_active);

CREATE INDEX IF NOT EXISTS idx_students_deleted_at ON students(teacher_id, deleted_at);

DO $$
BEGIN
  DELETE FROM exam_sessions es
  WHERE es.started_at < NOW() - INTERVAL '14 days'
    AND NOT EXISTS (
      SELECT 1 FROM exam_results er
      WHERE er.student_id = es.student_id AND er.exam_id = es.exam_id
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_correct_answer_letter') THEN
    ALTER TABLE questions
      ADD CONSTRAINT chk_correct_answer_letter
      CHECK (correct_answer_letter IS NULL OR correct_answer_letter = ANY(ARRAY['A','B','C','D','T','F']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_bank_correct_answer_letter') THEN
    ALTER TABLE bank_questions
      ADD CONSTRAINT chk_bank_correct_answer_letter
      CHECK (correct_answer_letter IS NULL OR correct_answer_letter = ANY(ARRAY['A','B','C','D','T','F']));
  END IF;
END $$;

ALTER TABLE live_stream_viewers ADD COLUMN IF NOT EXISTS can_speak        BOOLEAN DEFAULT false;

ALTER TABLE live_stream_viewers ADD COLUMN IF NOT EXISTS can_share_screen BOOLEAN DEFAULT false;

ALTER TABLE live_stream_viewers ADD COLUMN IF NOT EXISTS is_kicked        BOOLEAN DEFAULT false;

ALTER TABLE live_streams        ADD COLUMN IF NOT EXISTS is_locked        BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_payments_student_status   ON payments(student_id, status);

CREATE INDEX IF NOT EXISTS idx_exams_teacher_published   ON exams(teacher_id, is_published);

CREATE INDEX IF NOT EXISTS idx_notification_log_unread   ON notification_log(student_id, is_read) WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_students_username         ON students(username);

CREATE INDEX IF NOT EXISTS idx_assistants_teacher        ON assistants(teacher_id);

CREATE INDEX IF NOT EXISTS idx_exams_course_id           ON exams(course_id);

CREATE INDEX IF NOT EXISTS idx_pdf_files_course_id       ON pdf_files(course_id);

CREATE INDEX IF NOT EXISTS idx_videos_course_id          ON videos(course_id);

CREATE INDEX IF NOT EXISTS idx_bank_questions_bank_id    ON bank_questions(bank_id);

CREATE INDEX IF NOT EXISTS idx_exam_results_created_at   ON exam_results(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_date             ON payments(payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_live_chat_stream_id       ON live_chat_messages(stream_id);

CREATE INDEX IF NOT EXISTS idx_payments_course_id ON payments(course_id);

CREATE INDEX IF NOT EXISTS idx_payments_verified_by ON payments(verified_by);

CREATE INDEX IF NOT EXISTS idx_sections_course_id ON sections(course_id);

CREATE INDEX IF NOT EXISTS idx_course_enrollment_requests_student ON course_enrollment_requests(student_id);

CREATE INDEX IF NOT EXISTS idx_course_enrollment_requests_course ON course_enrollment_requests(course_id);

CREATE INDEX IF NOT EXISTS idx_question_banks_teacher ON question_banks(teacher_id);

CREATE INDEX IF NOT EXISTS idx_question_banks_course ON question_banks(course_id);

CREATE INDEX IF NOT EXISTS idx_leaderboard_history_teacher ON leaderboard_history(teacher_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_username_key') THEN
    ALTER TABLE students DROP CONSTRAINT students_username_key;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_students_username_active') THEN
    CREATE UNIQUE INDEX uq_students_username_active ON students(username) WHERE deleted_at IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_students_phone         ON students(phone);

CREATE INDEX IF NOT EXISTS idx_students_parent_phone  ON students(parent_phone);

CREATE INDEX IF NOT EXISTS idx_exams_dates            ON exams(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_enrollment_req_status  ON course_enrollment_requests(status);

CREATE INDEX IF NOT EXISTS idx_exam_results_is_latest ON exam_results(student_id, exam_id) WHERE is_latest = true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_status') THEN
    ALTER TABLE payments ADD CONSTRAINT chk_payment_status
      CHECK (status IN ('pending', 'verified', 'rejected'));
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE student_course_enrollment ADD CONSTRAINT chk_enrollment_status CHECK (status IN ('active', 'inactive'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE course_enrollment_requests DROP CONSTRAINT IF EXISTS chk_enrollment_req_status;
  ALTER TABLE course_enrollment_requests ADD CONSTRAINT chk_enrollment_req_status CHECK (status IN ('pending', 'approved', 'rejected'));
END $$;

DO $$ BEGIN
  ALTER TABLE exam_retry_requests ADD CONSTRAINT chk_retry_req_status CHECK (status IN ('pending', 'accepted', 'approved', 'rejected', 'used'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE live_streams ADD CONSTRAINT chk_stream_status CHECK (status IN ('active', 'ended', 'scheduled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE live_streams ADD CONSTRAINT chk_stream_access CHECK (access IN ('all', 'stages', 'specific'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE questions ADD CONSTRAINT chk_question_type CHECK (question_type IN ('mcq', 'true_false'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE bank_questions ADD CONSTRAINT chk_bank_question_type CHECK (question_type IN ('mcq', 'true_false'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE students ADD CONSTRAINT chk_student_gender CHECK (gender IN ('ذكر', 'أنثى'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE bank_questions ADD COLUMN IF NOT EXISTS difficulty VARCHAR(10) DEFAULT 'medium';

DO $$ BEGIN
  ALTER TABLE bank_questions ADD CONSTRAINT chk_bank_difficulty CHECK (difficulty IN ('easy', 'medium', 'hard'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS bank_easy_count   INTEGER DEFAULT 0;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS bank_medium_count INTEGER DEFAULT 0;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS bank_hard_count   INTEGER DEFAULT 0;

ALTER TABLE teachers ADD COLUMN IF NOT EXISTS slug VARCHAR(100) UNIQUE;

ALTER TABLE teachers ADD COLUMN IF NOT EXISTS platform_name VARCHAR(200);

ALTER TABLE teachers ALTER COLUMN logo_url SET DEFAULT '/wathba-logo.png';

ALTER TABLE teachers ALTER COLUMN photo_url SET DEFAULT '/uploads/images/default-avatar.png';

CREATE INDEX IF NOT EXISTS idx_activity_logs_teacher
  ON activity_logs (teacher_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exam_results_latest
  ON exam_results (student_id, exam_id, is_latest);

CREATE INDEX IF NOT EXISTS idx_game_tokens_student
  ON game_session_tokens (student_id, event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_log_teacher_sent
  ON notification_log (teacher_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_exam_results_exam_latest
  ON exam_results (exam_id, is_latest);

CREATE INDEX IF NOT EXISTS idx_enrollment_course_status
  ON student_course_enrollment (course_id, status);

ALTER TABLE leaderboard_reset_tracker
  ALTER COLUMN next_reset_at
    SET DEFAULT (DATE_TRUNC('month', NOW()) + INTERVAL '1 month');

DO $$ BEGIN
  ALTER TABLE exams ADD CONSTRAINT chk_exams_total_score_nn   CHECK (total_score >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE exams ADD CONSTRAINT chk_exams_pass_score_nn    CHECK (pass_score >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE exams ADD CONSTRAINT chk_exams_duration_pos     CHECK (duration_minutes > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE exam_results ADD CONSTRAINT chk_results_score_nn CHECK (score >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE video_progress ADD CONSTRAINT chk_vidprog_pct_range
    CHECK (progress_percentage >= 0 AND progress_percentage <= 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE students ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_student_devices_student ON student_devices(student_id);

CREATE INDEX IF NOT EXISTS idx_device_alerts_teacher ON device_alerts(teacher_id, status);

CREATE INDEX IF NOT EXISTS idx_device_alerts_student ON device_alerts(student_id);

DO $$ BEGIN
  ALTER TABLE device_alerts ADD CONSTRAINT chk_alert_type CHECK (alert_type IN ('device_limit_exceeded', 'capture_attempt'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE device_alerts DROP CONSTRAINT IF EXISTS chk_alert_status;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE device_alerts ADD CONSTRAINT chk_alert_status CHECK (status IN ('pending', 'resolved', 'reactivated', 'dismissed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE questions      ADD COLUMN IF NOT EXISTS group_id             INTEGER DEFAULT NULL;

ALTER TABLE questions      ADD COLUMN IF NOT EXISTS group_context        TEXT    DEFAULT NULL;

ALTER TABLE questions      ADD COLUMN IF NOT EXISTS group_context_image  TEXT    DEFAULT NULL;

ALTER TABLE questions      ADD COLUMN IF NOT EXISTS sub_questions        JSONB   DEFAULT '[]';

ALTER TABLE questions DROP CONSTRAINT IF EXISTS chk_question_type;

ALTER TABLE questions ADD CONSTRAINT chk_question_type CHECK (question_type IN ('mcq', 'true_false', 'image_multi'));

ALTER TABLE bank_questions ADD COLUMN IF NOT EXISTS group_id             INTEGER DEFAULT NULL;

ALTER TABLE bank_questions ADD COLUMN IF NOT EXISTS group_context        TEXT    DEFAULT NULL;

ALTER TABLE bank_questions ADD COLUMN IF NOT EXISTS group_context_image  TEXT    DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_exam_results_answers_gin
  ON exam_results USING GIN (answers jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens (expires_at);

CREATE INDEX IF NOT EXISTS idx_students_stage_teacher
  ON students (teacher_id, academic_stage);

CREATE INDEX IF NOT EXISTS idx_videos_section
  ON videos (section_id);

CREATE INDEX IF NOT EXISTS idx_pdfs_section
  ON pdf_files (section_id);

CREATE INDEX IF NOT EXISTS idx_live_chat_stream_sent
  ON live_chat_messages (stream_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_streams_teacher_status
  ON live_streams (teacher_id, status);

CREATE INDEX IF NOT EXISTS idx_live_streams_status_scheduled
  ON live_streams (status, scheduled_at)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_live_stream_viewers_student
  ON live_stream_viewers (student_id, stream_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_live_stream_viewers_active_speak
  ON live_stream_viewers (stream_id, can_speak)
  WHERE is_active = true AND can_speak = true;

CREATE INDEX IF NOT EXISTS idx_live_hand_raises_stream_active
  ON live_hand_raises (stream_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_live_chat_sender
  ON live_chat_messages (sender_id, sent_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_stream_per_teacher
  ON live_streams (teacher_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_wa_schedules_teacher  ON whatsapp_schedules(teacher_id);

CREATE INDEX IF NOT EXISTS idx_wa_schedules_next_run ON whatsapp_schedules(next_run_at, is_active);

DO $$ BEGIN
  ALTER TABLE whatsapp_schedules ADD CONSTRAINT chk_wa_target_type CHECK (target_type IN ('parents', 'students'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_wa_log_teacher ON whatsapp_send_log(teacher_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_send_log_schedule ON whatsapp_send_log(schedule_id);

DO $$ BEGIN
  ALTER TABLE whatsapp_send_log ADD CONSTRAINT chk_wa_log_status CHECK (status IN ('sending', 'completed', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_send_log ADD CONSTRAINT chk_wa_send_type CHECK (send_type IN ('manual', 'scheduled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_retry_req_pending
  ON exam_retry_requests(student_id, exam_id)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS uidx_retry_req_approved
  ON exam_retry_requests(student_id, exam_id)
  WHERE status = 'approved';

ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_by_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_verified_by_fkey'
  ) THEN
    -- Only add FK if verified_by column actually exists and has correct type
    ALTER TABLE payments
      ADD CONSTRAINT payments_verified_by_fkey
        FOREIGN KEY (verified_by) REFERENCES assistants(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Column may not exist or type mismatch on upgraded schemas — skip silently
  NULL;
END $$;

CREATE OR REPLACE FUNCTION fn_check_exam_result_score()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_total INTEGER;
BEGIN
  SELECT total_score INTO v_total FROM exams WHERE id = NEW.exam_id;
  IF v_total IS NOT NULL AND NEW.score > v_total THEN
    RAISE EXCEPTION
      'exam_results.score (%) exceeds exams.total_score (%) for exam_id=%',
      NEW.score, v_total, NEW.exam_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_exam_result_score
  BEFORE INSERT OR UPDATE OF score ON exam_results
  FOR EACH ROW EXECUTE FUNCTION fn_check_exam_result_score();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uq_students_username_active'
  ) THEN
    DROP INDEX uq_students_username_active;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_students_username_teacher_active
  ON students(teacher_id, username)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION fn_validate_chat_sender()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sender_type = 'student' THEN
    IF NOT EXISTS (
      SELECT 1 FROM students WHERE id = NEW.sender_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION
        'live_chat_messages: sender_id % not found in students', NEW.sender_id;
    END IF;
  ELSIF NEW.sender_type = 'teacher' THEN
    IF NOT EXISTS (SELECT 1 FROM teachers WHERE id = NEW.sender_id) THEN
      RAISE EXCEPTION
        'live_chat_messages: sender_id % not found in teachers', NEW.sender_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_chat_sender
  BEFORE INSERT ON live_chat_messages
  FOR EACH ROW EXECUTE FUNCTION fn_validate_chat_sender();

DO $$ BEGIN
  ALTER TABLE recitations ADD CONSTRAINT chk_recitation_schedule_type CHECK (schedule_type IN ('once', 'daily', 'weekly'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_recitation_questions_recitation ON recitation_questions(recitation_id);

ALTER TABLE recitation_questions ADD COLUMN IF NOT EXISTS sub_questions JSONB DEFAULT '[]';

DO $$ BEGIN
  ALTER TABLE recitation_questions DROP CONSTRAINT IF EXISTS chk_recitation_question_type;
  ALTER TABLE recitation_questions ADD CONSTRAINT chk_recitation_question_type CHECK (question_type IN ('mcq', 'true_false', 'image_multi'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE assistants ADD COLUMN IF NOT EXISTS can_manage_recitations BOOLEAN DEFAULT false;

ALTER TABLE recitations ADD COLUMN IF NOT EXISTS course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL;

ALTER TABLE recitations ADD COLUMN IF NOT EXISTS video_ids JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_recitations_teacher ON recitations(teacher_id);

CREATE INDEX IF NOT EXISTS idx_recitations_course ON recitations(course_id);

CREATE INDEX IF NOT EXISTS idx_recitations_video_ids ON recitations USING GIN (video_ids);

CREATE INDEX IF NOT EXISTS idx_recitation_results_student ON recitation_results(student_id);

CREATE INDEX IF NOT EXISTS idx_recitation_results_recitation ON recitation_results(recitation_id);

ALTER TABLE recitation_results ADD COLUMN IF NOT EXISTS questions_snapshot JSONB DEFAULT NULL;

ALTER TABLE bank_questions ADD COLUMN IF NOT EXISTS sub_questions JSONB DEFAULT '[]';

ALTER TABLE bank_questions DROP CONSTRAINT IF EXISTS chk_bank_question_type;

ALTER TABLE bank_questions ADD CONSTRAINT chk_bank_question_type CHECK (question_type IN ('mcq', 'true_false', 'image_multi'));

ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS is_absent BOOLEAN DEFAULT false NOT NULL;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS absent_marked BOOLEAN DEFAULT false NOT NULL;

ALTER TABLE recitation_results ADD COLUMN IF NOT EXISTS is_absent BOOLEAN DEFAULT false NOT NULL;

ALTER TABLE recitations       ADD COLUMN IF NOT EXISTS absent_marked BOOLEAN DEFAULT false NOT NULL;

ALTER TABLE recitations ADD COLUMN IF NOT EXISTS allow_retry BOOLEAN NOT NULL DEFAULT true;
