-- ── Class Attendance Feature Migration ──────────────────────────────────────
-- Adds offline (in-person) daily attendance tracking separate from video-watch attendance.

-- 1. Subject definitions per teacher (e.g. "رياضيات — الثالث الإعدادي")
CREATE TABLE IF NOT EXISTS class_subjects (
  id              SERIAL PRIMARY KEY,
  teacher_id      INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  academic_stage  VARCHAR(100),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_class_subjects_teacher ON class_subjects(teacher_id);

-- 2. Daily attendance record per student per subject per date
CREATE TABLE IF NOT EXISTS class_attendance_records (
  id              SERIAL PRIMARY KEY,
  teacher_id      INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  student_id      INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id      INTEGER NOT NULL REFERENCES class_subjects(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'present',   -- present | absent
  exam_score      INTEGER DEFAULT NULL,                     -- student score (nullable = no exam today)
  exam_total      INTEGER DEFAULT NULL,                     -- shared total for the whole class on that day
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, subject_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS idx_class_att_teacher      ON class_attendance_records(teacher_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_class_att_student      ON class_attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_class_att_subject_date ON class_attendance_records(subject_id, attendance_date DESC);

-- 3. New assistant permission column
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS can_manage_attendance BOOLEAN DEFAULT false;
