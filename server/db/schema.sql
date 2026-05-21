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
  created_at TIMESTAMP DEFAULT NOW()
);

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
ALTER TABLE video_progress ADD COLUMN IF NOT EXISTS last_position DECIMAL(10,2) DEFAULT 0;
ALTER TABLE video_progress ADD COLUMN IF NOT EXISTS actual_watched_seconds INTEGER DEFAULT 0;

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
ALTER TABLE questions ALTER COLUMN question_text DROP NOT NULL;

ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS essay_graded          BOOLEAN DEFAULT false;
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS essay_score_adjustment INTEGER DEFAULT 0;

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
ALTER TABLE questions ADD COLUMN IF NOT EXISTS essay_answer_key   TEXT;

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
ALTER TABLE students ADD COLUMN IF NOT EXISTS plain_password VARCHAR(255) DEFAULT NULL;

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

ALTER TABLE payments ALTER COLUMN method DROP NOT NULL;
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
  ended_at TIMESTAMP
);

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

-- ── Prevent duplicate exam submissions ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_exam_results_student_exam'
  ) THEN
    ALTER TABLE exam_results ADD CONSTRAINT uq_exam_results_student_exam UNIQUE (student_id, exam_id);
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

-- plain_password column is intentionally kept for teacher/assistant access

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

-- ── Partial unique index: allow username reuse after soft-delete ──────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_students_username_active') THEN
    CREATE UNIQUE INDEX uq_students_username_active ON students(username) WHERE deleted_at IS NULL;
  END IF;
END $$;

-- ── CHECK constraint: enforce valid payment status values ─────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_status') THEN
    ALTER TABLE payments ADD CONSTRAINT chk_payment_status
      CHECK (status IN ('pending', 'verified', 'rejected'));
  END IF;
END $$;

-- ── Add essay_answer_key to bank_questions to match questions table ───────────
ALTER TABLE bank_questions ADD COLUMN IF NOT EXISTS essay_answer_key TEXT;

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
