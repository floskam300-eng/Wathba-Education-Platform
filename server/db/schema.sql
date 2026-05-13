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
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS can_manage_courses  BOOLEAN DEFAULT false;
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
ALTER TABLE students ADD COLUMN IF NOT EXISTS plain_password VARCHAR(20) DEFAULT NULL;

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
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS can_manage_courses BOOLEAN DEFAULT true;

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
