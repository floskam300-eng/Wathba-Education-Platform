-- WATHBA Educational Platform Schema

CREATE TABLE IF NOT EXISTS teachers (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(200) NOT NULL,
  bio TEXT,
  classification VARCHAR(100),
  logo_url VARCHAR(500),
  photo_url VARCHAR(500),
  whatsapp_phone VARCHAR(20),
  force_password_change BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
-- [M-16] Add force_password_change if upgrading from older schema
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS assistants (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(20),
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
  can_add_students BOOLEAN DEFAULT true,
  can_edit_students BOOLEAN DEFAULT true,
  can_delete_students BOOLEAN DEFAULT false,
  can_manage_exams BOOLEAN DEFAULT true,
  can_view_analytics BOOLEAN DEFAULT true,
  can_send_reports BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(20),
  parent_phone VARCHAR(20),
  academic_stage VARCHAR(100),
  gender VARCHAR(10),
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
  points INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  name VARCHAR(300) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) DEFAULT 0,
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
  thumbnail_url VARCHAR(500),
  target_stage VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS videos (
  id SERIAL PRIMARY KEY,
  title VARCHAR(300) NOT NULL,
  file_path_or_url VARCHAR(500),
  duration_minutes INTEGER DEFAULT 0,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pdf_files (
  id SERIAL PRIMARY KEY,
  title VARCHAR(300) NOT NULL,
  file_url VARCHAR(500),
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exams (
  id SERIAL PRIMARY KEY,
  title VARCHAR(300) NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  total_score INTEGER DEFAULT 100,
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
  pass_score INTEGER DEFAULT 50,
  badge_name VARCHAR(100),
  badge_color VARCHAR(20) DEFAULT '#FF8C00',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  question_text TEXT NOT NULL,
  question_image_url VARCHAR(500),
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT,
  option_d TEXT,
  correct_answer_letter CHAR(1) NOT NULL,
  points INTEGER DEFAULT 1,
  exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exam_results (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
  score INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  wrong_count INTEGER DEFAULT 0,
  unanswered_count INTEGER DEFAULT 0,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  answers JSONB,
  points_earned INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS video_progress (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE,
  watch_count INTEGER DEFAULT 0,
  watched_minutes INTEGER DEFAULT 0,
  progress_percentage DECIMAL(5,2) DEFAULT 0,
  last_watched_at TIMESTAMP DEFAULT NOW(),
  last_position DECIMAL(10,2) DEFAULT 0,
  actual_watched_seconds INTEGER DEFAULT 0,
  UNIQUE(student_id, video_id)
);
-- last_position and actual_watched_seconds already defined in CREATE TABLE above — no ALTER needed

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  method VARCHAR(50) NOT NULL,
  payment_date TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'pending',
  reference_number VARCHAR(100),
  notes TEXT,
  verified_by INTEGER REFERENCES assistants(id) ON DELETE SET NULL,
  verified_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_course_enrollment (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  enrollment_date TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'active',
  UNIQUE(student_id, course_id)
);

CREATE TABLE IF NOT EXISTS sections (
  id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE videos    ADD COLUMN IF NOT EXISTS section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL;
ALTER TABLE pdf_files ADD COLUMN IF NOT EXISTS section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS start_date  TIMESTAMP;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS end_date    TIMESTAMP;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;
-- ALTER TABLE questions ALTER COLUMN question_text DROP NOT NULL;

-- essay_graded and essay_score_adjustment removed — essay questions not supported

ALTER TABLE assistants ADD COLUMN IF NOT EXISTS can_manage_payments BOOLEAN DEFAULT false;
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS can_manage_courses  BOOLEAN DEFAULT true;
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS can_send_notifications BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS course_enrollment_requests (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  course_id  INTEGER REFERENCES courses(id)  ON DELETE CASCADE,
  status     VARCHAR(20) DEFAULT 'pending',
  message    TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  handled_at TIMESTAMP,
  UNIQUE(student_id, course_id)
);

ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type      VARCHAR(20) DEFAULT 'mcq';
-- essay_answer_key removed — essay questions not supported

CREATE TABLE IF NOT EXISTS notification_log (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  recipient_phone VARCHAR(20),
  recipient_type  VARCHAR(20) DEFAULT 'student',
  message TEXT NOT NULL,
  sent_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS badges (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
  badge_name VARCHAR(100),
  badge_color VARCHAR(20),
  earned_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'general';
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'whatsapp';
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS title VARCHAR(200);

ALTER TABLE students ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
-- ALTER TABLE students ADD COLUMN IF NOT EXISTS plain_password VARCHAR(255) DEFAULT NULL;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS pre_unpublish_published BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS exam_retry_requests (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending',
  message TEXT,
  teacher_note TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  handled_at TIMESTAMP
);

ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT false;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;
-- Note: can_manage_courses already added above with DEFAULT true — no duplicate needed

ALTER TABLE exams ADD COLUMN IF NOT EXISTS start_notified BOOLEAN DEFAULT false;

-- ALTER TABLE payments ALTER COLUMN method DROP NOT NULL;
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

CREATE TABLE IF NOT EXISTS question_banks (
  id SERIAL PRIMARY KEY,
  name VARCHAR(300) NOT NULL,
  subject VARCHAR(200),
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_questions (
  id SERIAL PRIMARY KEY,
  bank_id INTEGER REFERENCES question_banks(id) ON DELETE CASCADE,
  question_text TEXT,
  question_image_url TEXT,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT,
  option_d TEXT,
  correct_answer_letter CHAR(1) NOT NULL,
  points INTEGER DEFAULT 1,
  question_type VARCHAR(20) DEFAULT 'mcq',
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE exams ADD COLUMN IF NOT EXISTS question_source VARCHAR(20) DEFAULT 'manual';
ALTER TABLE exams ADD COLUMN IF NOT EXISTS bank_id INTEGER REFERENCES question_banks(id) ON DELETE SET NULL;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS bank_question_count INTEGER DEFAULT 10;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS points_on_attempt INTEGER DEFAULT 0;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS points_on_pass    INTEGER DEFAULT 0;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS points_on_complete INTEGER DEFAULT 0;
CREATE TABLE IF NOT EXISTS course_completion_points (
  student_id    INTEGER REFERENCES students(id) ON DELETE CASCADE,
  course_id     INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  points_awarded INTEGER DEFAULT 0,
  awarded_at    TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (student_id, course_id)
);

ALTER TABLE question_banks ADD COLUMN IF NOT EXISTS course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL;

ALTER TABLE students ADD COLUMN IF NOT EXISTS fcm_token TEXT DEFAULT NULL;

CREATE TABLE IF NOT EXISTS leaderboard_history (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
  month_label VARCHAR(100) NOT NULL,
  reset_at TIMESTAMP DEFAULT NOW(),
  rankings JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS leaderboard_reset_tracker (
  teacher_id INTEGER PRIMARY KEY REFERENCES teachers(id) ON DELETE CASCADE,
  last_reset_at TIMESTAMP DEFAULT NOW(),
  next_reset_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days')
);

-- ── Live Streaming ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_streams (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
  room_id VARCHAR(300) NOT NULL UNIQUE,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  access VARCHAR(20) DEFAULT 'all',
  allowed_stages JSONB DEFAULT '[]',
  allowed_student_ids JSONB DEFAULT '[]',
  chat_enabled BOOLEAN DEFAULT true,
  hand_raise_enabled BOOLEAN DEFAULT true,
  status VARCHAR(20) DEFAULT 'active',
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  scheduled_at TIMESTAMP
);
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS live_stream_viewers (
  id SERIAL PRIMARY KEY,
  stream_id INTEGER REFERENCES live_streams(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT NOW(),
  left_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(stream_id, student_id)
);

CREATE TABLE IF NOT EXISTS live_chat_messages (
  id SERIAL PRIMARY KEY,
  stream_id INTEGER REFERENCES live_streams(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL,
  sender_type VARCHAR(20) NOT NULL,
  sender_name VARCHAR(200),
  message TEXT NOT NULL,
  sent_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS live_hand_raises (
  id SERIAL PRIMARY KEY,
  stream_id INTEGER REFERENCES live_streams(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  raised_at TIMESTAMP DEFAULT NOW(),
  lowered_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(stream_id, student_id)
);

-- ── Events / Gamification ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_plays (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  event_id VARCHAR(100) NOT NULL,
  played_at TIMESTAMP DEFAULT NOW(),
  score INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_event_plays_student_event ON event_plays(student_id, event_id);

-- ── Performance indexes ──────────────────────────────────────────────────────
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

-- ── Exam result attempt tracking (preserve retry history) — must come before index ──
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1;
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS is_latest BOOLEAN DEFAULT true;

-- ── Prevent duplicate LATEST submissions (partial unique index) ──────────────
-- Drop the old full UNIQUE constraint that blocked retry history rows
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_exam_results_student_exam'
  ) THEN
    ALTER TABLE exam_results DROP CONSTRAINT uq_exam_results_student_exam;
  END IF;
END $$;
-- Only one is_latest=true row per (student, exam) — history rows (is_latest=false) are unrestricted
CREATE UNIQUE INDEX IF NOT EXISTS uidx_exam_results_latest
  ON exam_results (student_id, exam_id)
  WHERE is_latest = true;

-- ── Prevent duplicate badges per student per exam ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_badges_student_exam'
  ) THEN
    ALTER TABLE badges ADD CONSTRAINT uq_badges_student_exam UNIQUE (student_id, exam_id);
  END IF;
END $$;

-- ── Remove essay columns (no longer used) ────────────────────────────────────
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

-- ── Server-side exam sessions (prevents timer cheating + bank question tampering) ──
CREATE TABLE IF NOT EXISTS exam_sessions (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  exam_id    INTEGER REFERENCES exams(id) ON DELETE CASCADE,
  started_at TIMESTAMP DEFAULT NOW(),
  questions_snapshot JSONB DEFAULT '[]',
  UNIQUE(student_id, exam_id)
);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_student_exam ON exam_sessions(student_id, exam_id);

-- ── Additional performance indexes ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notification_log_student_source ON notification_log(student_id, source);
CREATE INDEX IF NOT EXISTS idx_exam_results_student_exam ON exam_results(student_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_retry_requests_student_exam ON exam_retry_requests(student_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_live_stream_viewers_stream_active ON live_stream_viewers(stream_id, is_active);
CREATE INDEX IF NOT EXISTS idx_students_deleted_at ON students(teacher_id, deleted_at);

-- ── Cleanup stale exam_sessions (older than 14 days with no result) ──────────
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

-- [H-2] plain_password column has been REMOVED — see DROP COLUMN migration at end of file

-- ── CHECK constraints on correct_answer_letter ────────────────────────────────
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

-- ── Live stream viewer permissions & moderation ───────────────────────────────
ALTER TABLE live_stream_viewers ADD COLUMN IF NOT EXISTS can_speak        BOOLEAN DEFAULT false;
ALTER TABLE live_stream_viewers ADD COLUMN IF NOT EXISTS can_share_screen BOOLEAN DEFAULT false;
ALTER TABLE live_stream_viewers ADD COLUMN IF NOT EXISTS is_kicked        BOOLEAN DEFAULT false;
ALTER TABLE live_streams        ADD COLUMN IF NOT EXISTS is_locked        BOOLEAN DEFAULT false;

-- ── Additional performance indexes ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payments_student_status   ON payments(student_id, status);
CREATE INDEX IF NOT EXISTS idx_exams_teacher_published   ON exams(teacher_id, is_published);
CREATE INDEX IF NOT EXISTS idx_notification_log_unread   ON notification_log(student_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_students_username         ON students(username);
CREATE INDEX IF NOT EXISTS idx_assistants_teacher        ON assistants(teacher_id);

-- ── Missing performance indexes identified in audit ───────────────────────────
CREATE INDEX IF NOT EXISTS idx_exams_course_id           ON exams(course_id);
CREATE INDEX IF NOT EXISTS idx_pdf_files_course_id       ON pdf_files(course_id);
CREATE INDEX IF NOT EXISTS idx_videos_course_id          ON videos(course_id);
CREATE INDEX IF NOT EXISTS idx_bank_questions_bank_id    ON bank_questions(bank_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_created_at   ON exam_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_date             ON payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_live_chat_stream_id       ON live_chat_messages(stream_id);

-- ── Missing FK indexes for frequent JOIN queries ──
CREATE INDEX IF NOT EXISTS idx_payments_course_id ON payments(course_id);
CREATE INDEX IF NOT EXISTS idx_payments_verified_by ON payments(verified_by);
CREATE INDEX IF NOT EXISTS idx_sections_course_id ON sections(course_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollment_requests_student ON course_enrollment_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollment_requests_course ON course_enrollment_requests(course_id);
CREATE INDEX IF NOT EXISTS idx_question_banks_teacher ON question_banks(teacher_id);
CREATE INDEX IF NOT EXISTS idx_question_banks_course ON question_banks(course_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_history_teacher ON leaderboard_history(teacher_id);

-- ── Partial unique index: allow username reuse after soft-delete ──────────────
-- Drop the old global UNIQUE constraint so the partial index below can take over
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

-- ── Missing performance indexes (audit fix) ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_students_phone         ON students(phone);
CREATE INDEX IF NOT EXISTS idx_students_parent_phone  ON students(parent_phone);
CREATE INDEX IF NOT EXISTS idx_exams_dates            ON exams(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_enrollment_req_status  ON course_enrollment_requests(status);
CREATE INDEX IF NOT EXISTS idx_exam_results_is_latest ON exam_results(student_id, exam_id) WHERE is_latest = true;

-- ── CHECK constraint: enforce valid payment status values ─────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_status') THEN
    ALTER TABLE payments ADD CONSTRAINT chk_payment_status
      CHECK (status IN ('pending', 'verified', 'rejected'));
  END IF;
END $$;

-- ── CHECK constraints for enum-like columns ──
DO $$ BEGIN
  ALTER TABLE student_course_enrollment ADD CONSTRAINT chk_enrollment_status CHECK (status IN ('active', 'inactive'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  -- Note: code uses 'approved', not 'accepted' — must match
  ALTER TABLE course_enrollment_requests ADD CONSTRAINT chk_enrollment_req_status CHECK (status IN ('pending', 'approved', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
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

-- essay_answer_key removed from bank_questions — essay questions not supported

-- ── Difficulty level for bank questions ──────────────────────────────────────
ALTER TABLE bank_questions ADD COLUMN IF NOT EXISTS difficulty VARCHAR(10) DEFAULT 'medium';
DO $$ BEGIN
  ALTER TABLE bank_questions ADD CONSTRAINT chk_bank_difficulty CHECK (difficulty IN ('easy', 'medium', 'hard'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Difficulty-based question count columns for bank exams ───────────────────
ALTER TABLE exams ADD COLUMN IF NOT EXISTS bank_easy_count   INTEGER DEFAULT 0;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS bank_medium_count INTEGER DEFAULT 0;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS bank_hard_count   INTEGER DEFAULT 0;

-- ── SaaS multi-tenant: teacher slug + platform branding ───────────────────────
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS slug VARCHAR(100) UNIQUE;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS platform_name VARCHAR(200);
-- Auto-generate slug from username for teachers that don't have one yet
UPDATE teachers
   SET slug = regexp_replace(lower(trim(username)), '[^a-z0-9]+', '-', 'g')
 WHERE slug IS NULL OR slug = '';

-- ── Ensure logo_url / photo_url always have fallback values (never NULL) ───────
ALTER TABLE teachers ALTER COLUMN logo_url SET DEFAULT '/wathba-logo.png';
ALTER TABLE teachers ALTER COLUMN photo_url SET DEFAULT '/uploads/images/default-avatar.png';
UPDATE teachers SET logo_url  = '/wathba-logo.png'                       WHERE logo_url  IS NULL OR logo_url  = '';
UPDATE teachers SET photo_url = '/uploads/images/default-avatar.png'     WHERE photo_url IS NULL OR photo_url = '';

-- ── Activity / Audit Log ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
  id           SERIAL PRIMARY KEY,
  teacher_id   INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  actor_type   VARCHAR(20)  NOT NULL,   -- 'teacher' | 'assistant'
  actor_id     INTEGER      NOT NULL,
  actor_name   VARCHAR(200),
  action       VARCHAR(80)  NOT NULL,   -- e.g. 'add_student', 'verify_payment'
  entity_type  VARCHAR(50),             -- 'student' | 'exam' | 'payment' | 'course' | 'assistant'
  entity_id    INTEGER,
  entity_name  VARCHAR(300),
  details      JSONB,
  ip_address   VARCHAR(45),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_teacher
  ON activity_logs (teacher_id, created_at DESC);

-- ── Additional index for exam result attempt tracking ────────────────────────
CREATE INDEX IF NOT EXISTS idx_exam_results_latest
  ON exam_results (student_id, exam_id, is_latest);

-- ── Game session tokens (anti-cheat for Stickman Run) ────────────────────────
CREATE TABLE IF NOT EXISTS game_session_tokens (
  id          SERIAL PRIMARY KEY,
  student_id  INTEGER REFERENCES students(id) ON DELETE CASCADE,
  token       VARCHAR(64) UNIQUE NOT NULL,
  event_id    VARCHAR(50) NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  used_at     TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_game_tokens_student
  ON game_session_tokens (student_id, event_id, created_at DESC);

-- ── Bug-fix: indexes missing from second-round audit ──────────────────────────
-- Teacher notification history queries (ORDER BY sent_at DESC, WHERE teacher_id=?)
CREATE INDEX IF NOT EXISTS idx_notification_log_teacher_sent
  ON notification_log (teacher_id, sent_at DESC);

-- Teacher exam-results view: all results for one exam
CREATE INDEX IF NOT EXISTS idx_exam_results_exam_latest
  ON exam_results (exam_id, is_latest);

-- Course participant list / enrolled-count aggregation
CREATE INDEX IF NOT EXISTS idx_enrollment_course_status
  ON student_course_enrollment (course_id, status);

-- ── Bug-fix: leaderboard_reset_tracker should default to first day of NEXT
--    calendar month, not "30 days from now", so resets stay aligned to months.
ALTER TABLE leaderboard_reset_tracker
  ALTER COLUMN next_reset_at
    SET DEFAULT (DATE_TRUNC('month', NOW()) + INTERVAL '1 month');

-- ── Data integrity: CHECK constraints on score/percentage columns ─────────────
-- These use DO $$ blocks so they are idempotent (no error if constraint already exists)
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

-- ── Device-based account protection ──────────────────────────────────────────
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS student_devices (
  id         SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  device_id  VARCHAR(128) NOT NULL,
  device_name VARCHAR(300),
  user_agent TEXT,
  ip_address VARCHAR(45),
  first_seen TIMESTAMP DEFAULT NOW(),
  last_seen  TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, device_id)
);
CREATE INDEX IF NOT EXISTS idx_student_devices_student ON student_devices(student_id);

CREATE TABLE IF NOT EXISTS device_alerts (
  id          SERIAL PRIMARY KEY,
  teacher_id  INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
  student_id  INTEGER REFERENCES students(id) ON DELETE CASCADE,
  alert_type  VARCHAR(50) DEFAULT 'device_limit_exceeded',
  device_id   VARCHAR(128),
  device_name VARCHAR(300),
  ip_address  VARCHAR(45),
  status      VARCHAR(20) DEFAULT 'pending',
  created_at  TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_device_alerts_teacher ON device_alerts(teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_device_alerts_student ON device_alerts(student_id);
DO $$ BEGIN
  ALTER TABLE device_alerts ADD CONSTRAINT chk_alert_type CHECK (alert_type IN ('device_limit_exceeded'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE device_alerts DROP CONSTRAINT IF EXISTS chk_alert_status;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE device_alerts ADD CONSTRAINT chk_alert_status CHECK (status IN ('pending', 'resolved', 'reactivated', 'dismissed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Grouped (multi-part) questions ────────────────────────────────────────────
-- A group_id ties multiple sub-questions to one shared context (text + image).
-- group_context / group_context_image hold the shared passage/image shown above every sub-question in the group.
ALTER TABLE questions      ADD COLUMN IF NOT EXISTS group_id             INTEGER DEFAULT NULL;
ALTER TABLE questions      ADD COLUMN IF NOT EXISTS group_context        TEXT    DEFAULT NULL;
ALTER TABLE questions      ADD COLUMN IF NOT EXISTS group_context_image  TEXT    DEFAULT NULL;
ALTER TABLE questions      ADD COLUMN IF NOT EXISTS sub_questions        JSONB   DEFAULT '[]';
ALTER TABLE questions DROP CONSTRAINT IF EXISTS chk_question_type;
ALTER TABLE questions ADD CONSTRAINT chk_question_type CHECK (question_type IN ('mcq', 'true_false', 'image_multi'));
ALTER TABLE bank_questions ADD COLUMN IF NOT EXISTS group_id             INTEGER DEFAULT NULL;
ALTER TABLE bank_questions ADD COLUMN IF NOT EXISTS group_context        TEXT    DEFAULT NULL;
ALTER TABLE bank_questions ADD COLUMN IF NOT EXISTS group_context_image  TEXT    DEFAULT NULL;

-- GIN index to speed up JSONB lateral expansion on exam_results.answers
-- (used by wrong-questions analytics and exam review queries)
CREATE INDEX IF NOT EXISTS idx_exam_results_answers_gin
  ON exam_results USING GIN (answers jsonb_path_ops);

-- ── JWT token revocation — persistent across server restarts ──────────────────
CREATE TABLE IF NOT EXISTS revoked_tokens (
  id         SERIAL PRIMARY KEY,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens (expires_at);

-- ── Missing performance indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_students_stage_teacher
  ON students (teacher_id, academic_stage);

CREATE INDEX IF NOT EXISTS idx_videos_section
  ON videos (section_id);

CREATE INDEX IF NOT EXISTS idx_pdfs_section
  ON pdf_files (section_id);

CREATE INDEX IF NOT EXISTS idx_live_chat_stream_sent
  ON live_chat_messages (stream_id, sent_at DESC);

-- LiveStream performance indexes
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

-- FIX: prevent race condition — only one active stream per teacher at a time
-- If two simultaneous POST /live/start requests slip past the UPDATE check,
-- the second INSERT will fail with a unique constraint violation (→ 409).
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_stream_per_teacher
  ON live_streams (teacher_id)
  WHERE status = 'active';

-- Cleanup job: purge expired revoked tokens (runs safely every restart)
DELETE FROM revoked_tokens WHERE expires_at < NOW();

-- ── WhatsApp Integration ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_schedules (
  id            SERIAL PRIMARY KEY,
  teacher_id    INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
  name          VARCHAR(200) NOT NULL,
  message       TEXT NOT NULL,
  target_type   VARCHAR(20)  DEFAULT 'parents',
  stage_filter  VARCHAR(100) DEFAULT 'all',
  interval_days INTEGER      NOT NULL DEFAULT 30,
  next_run_at   TIMESTAMPTZ,
  last_run_at   TIMESTAMPTZ,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_schedules_teacher  ON whatsapp_schedules(teacher_id);
CREATE INDEX IF NOT EXISTS idx_wa_schedules_next_run ON whatsapp_schedules(next_run_at, is_active);
DO $$ BEGIN
  ALTER TABLE whatsapp_schedules ADD CONSTRAINT chk_wa_target_type CHECK (target_type IN ('parents', 'students'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS whatsapp_send_log (
  id            SERIAL PRIMARY KEY,
  teacher_id    INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
  schedule_id   INTEGER REFERENCES whatsapp_schedules(id) ON DELETE SET NULL,
  message       TEXT NOT NULL,
  total_count   INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  fail_count    INTEGER DEFAULT 0,
  status        VARCHAR(20) DEFAULT 'sending',
  send_type     VARCHAR(20) DEFAULT 'manual',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  finished_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wa_log_teacher ON whatsapp_send_log(teacher_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_send_log_schedule ON whatsapp_send_log(schedule_id);
DO $$ BEGIN
  ALTER TABLE whatsapp_send_log ADD CONSTRAINT chk_wa_log_status CHECK (status IN ('sending', 'completed', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE whatsapp_send_log ADD CONSTRAINT chk_wa_send_type CHECK (send_type IN ('manual', 'scheduled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cleanup job: mark any stuck WhatsApp send logs as failed on restart
UPDATE whatsapp_send_log SET status='failed', finished_at=NOW() WHERE status='sending';

-- ── [H-2] Security fix: wipe & drop plain_password column ─────────────────────
-- Plaintext passwords must never be persisted. Existing values are zeroed first,
-- then the column is dropped so no backup / SELECT * can ever expose them again.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'plain_password'
  ) THEN
    UPDATE students SET plain_password = NULL WHERE plain_password IS NOT NULL;
    ALTER TABLE students DROP COLUMN plain_password;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Bug-fix batch: L-1 through S-5 (June 2026 audit)
-- ════════════════════════════════════════════════════════════════════════════

-- ── [S-1] Prevent duplicate pending retry requests ───────────────────────────
-- Without this, a student can spam "request retry" and create many pending rows
-- for the same exam — teacher sees duplicates, accept/reject logic races.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_retry_req_pending
  ON exam_retry_requests(student_id, exam_id)
  WHERE status = 'pending';

-- ── Prevent duplicate approved retry requests ────────────────────────────────
-- A student should only ever have at most one approved retry per exam.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_retry_req_approved
  ON exam_retry_requests(student_id, exam_id)
  WHERE status = 'approved';

-- ── [S-2] payments.verified_by — re-add FK + preserve audit name ─────────────
-- The FK was dropped earlier to avoid cascade-delete issues.
-- Fix: re-add with ON DELETE SET NULL (orphan-safe) + add verified_by_name TEXT
-- so the auditor name is preserved even after the assistant account is removed.
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

-- ── [S-3] Enforce score <= total_score via trigger ────────────────────────────
-- PostgreSQL can't do cross-table CHECK constraints, so we use a trigger.
-- This catches both direct DB writes and application bugs.
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
DROP TRIGGER IF EXISTS trg_check_exam_result_score ON exam_results;
CREATE TRIGGER trg_check_exam_result_score
  BEFORE INSERT OR UPDATE OF score ON exam_results
  FOR EACH ROW EXECUTE FUNCTION fn_check_exam_result_score();

-- ── [S-4] students.username unique per teacher — not globally ─────────────────
-- The old partial index was globally unique (any two teachers couldn't have a
-- student with the same username). Fix: make it unique per (teacher_id, username).
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

-- ── [S-5] live_chat_messages.sender_id — polymorphic FK via trigger ───────────
-- sender_id references either students or teachers depending on sender_type.
-- A single FK column can't reference two tables, so we enforce it with a trigger.
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
DROP TRIGGER IF EXISTS trg_validate_chat_sender ON live_chat_messages;
CREATE TRIGGER trg_validate_chat_sender
  BEFORE INSERT ON live_chat_messages
  FOR EACH ROW EXECUTE FUNCTION fn_validate_chat_sender();

-- ─── RECITATIONS SYSTEM ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recitations (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  academic_stage VARCHAR(100),
  duration_minutes INTEGER DEFAULT 10 CHECK (duration_minutes BETWEEN 1 AND 60),
  total_score INTEGER DEFAULT 10,
  pass_score INTEGER DEFAULT 5,
  points_on_attempt INTEGER DEFAULT 0,
  points_on_pass INTEGER DEFAULT 5,
  schedule_type VARCHAR(20) DEFAULT 'once',
  schedule_day INTEGER,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  is_published BOOLEAN DEFAULT false,
  start_notified BOOLEAN DEFAULT false,
  shuffle_questions BOOLEAN DEFAULT false,
  shuffle_options BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
DO $$ BEGIN
  ALTER TABLE recitations ADD CONSTRAINT chk_recitation_schedule_type CHECK (schedule_type IN ('once', 'daily', 'weekly'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS recitation_questions (
  id SERIAL PRIMARY KEY,
  recitation_id INTEGER NOT NULL REFERENCES recitations(id) ON DELETE CASCADE,
  question_text TEXT,
  question_image_url VARCHAR(500),
  question_type VARCHAR(20) DEFAULT 'mcq',
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  correct_answer_letter CHAR(1) NOT NULL,
  points INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  CONSTRAINT rq_correct_letter CHECK (correct_answer_letter IN ('A','B','C','D','T','F'))
);

CREATE INDEX IF NOT EXISTS idx_recitation_questions_recitation ON recitation_questions(recitation_id);
ALTER TABLE recitation_questions ADD COLUMN IF NOT EXISTS sub_questions JSONB DEFAULT '[]';
DO $$ BEGIN
  ALTER TABLE recitation_questions DROP CONSTRAINT IF EXISTS chk_recitation_question_type;
  ALTER TABLE recitation_questions ADD CONSTRAINT chk_recitation_question_type CHECK (question_type IN ('mcq', 'true_false', 'image_multi'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS recitation_sessions (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  recitation_id INTEGER NOT NULL REFERENCES recitations(id) ON DELETE CASCADE,
  started_at TIMESTAMP DEFAULT NOW(),
  questions_snapshot JSONB DEFAULT '[]',
  UNIQUE(student_id, recitation_id)
);

CREATE TABLE IF NOT EXISTS recitation_results (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  recitation_id INTEGER NOT NULL REFERENCES recitations(id) ON DELETE CASCADE,
  score INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  wrong_count INTEGER DEFAULT 0,
  unanswered_count INTEGER DEFAULT 0,
  answers JSONB DEFAULT '[]',
  points_earned INTEGER DEFAULT 0,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  passed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recitation_streaks (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  current_streak INTEGER DEFAULT 0,
  max_streak INTEGER DEFAULT 0,
  last_completed_at TIMESTAMP,
  total_completed INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, teacher_id)
);

ALTER TABLE assistants ADD COLUMN IF NOT EXISTS can_manage_recitations BOOLEAN DEFAULT false;

-- Video-linked recitations
ALTER TABLE recitations ADD COLUMN IF NOT EXISTS course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL;
ALTER TABLE recitations ADD COLUMN IF NOT EXISTS video_ids JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_recitations_teacher ON recitations(teacher_id);
CREATE INDEX IF NOT EXISTS idx_recitations_course ON recitations(course_id);
-- [L1-FIX] GIN index for JSONB containment queries on video_ids
CREATE INDEX IF NOT EXISTS idx_recitations_video_ids ON recitations USING GIN (video_ids);
CREATE INDEX IF NOT EXISTS idx_recitation_results_student ON recitation_results(student_id);
CREATE INDEX IF NOT EXISTS idx_recitation_results_recitation ON recitation_results(recitation_id);
-- [SH-1] Store shuffled questions snapshot so review endpoint uses correct correct_answer_letter
ALTER TABLE recitation_results ADD COLUMN IF NOT EXISTS questions_snapshot JSONB DEFAULT NULL;

-- image_multi support for bank_questions
ALTER TABLE bank_questions ADD COLUMN IF NOT EXISTS sub_questions JSONB DEFAULT '[]';
ALTER TABLE bank_questions DROP CONSTRAINT IF EXISTS chk_bank_question_type;
ALTER TABLE bank_questions ADD CONSTRAINT chk_bank_question_type CHECK (question_type IN ('mcq', 'true_false', 'image_multi'));

-- Absent marking: track students who missed a published exam
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS is_absent BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS absent_marked BOOLEAN DEFAULT false NOT NULL;

-- Import model: per-teacher column mapping for Excel imports
CREATE TABLE IF NOT EXISTS teacher_import_models (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  headers JSONB NOT NULL DEFAULT '[]',
  sample_row JSONB DEFAULT '{}',
  mappings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(teacher_id)
);
