-- ────────────────────────────────────────────────────────────────────────────
-- Migration 0006: Fix device alerts constraints, unique indexes, and active sessions
-- Idempotent and safe to run on any existing production database.
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Ensure students table has device & suspension columns
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS failed_device_attempts INTEGER DEFAULT 0;

-- 2. Ensure student_devices table and columns exist
CREATE TABLE IF NOT EXISTS student_devices (
  id            SERIAL PRIMARY KEY,
  student_id    INTEGER REFERENCES students(id) ON DELETE CASCADE,
  device_id     VARCHAR(128) NOT NULL,
  device_name   VARCHAR(300),
  user_agent    TEXT,
  ip_address    VARCHAR(45),
  device_origin VARCHAR(20) DEFAULT 'browser',
  first_seen    TIMESTAMP DEFAULT NOW(),
  last_seen     TIMESTAMP DEFAULT NOW()
);

ALTER TABLE student_devices ADD COLUMN IF NOT EXISTS device_origin VARCHAR(20) DEFAULT 'browser';
ALTER TABLE student_devices ADD COLUMN IF NOT EXISTS device_name   VARCHAR(300);
ALTER TABLE student_devices ADD COLUMN IF NOT EXISTS user_agent    TEXT;
ALTER TABLE student_devices ADD COLUMN IF NOT EXISTS ip_address    VARCHAR(45);

-- Ensure UNIQUE constraint on (student_id, device_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'student_devices'::regclass
      AND contype = 'u'
  ) THEN
    ALTER TABLE student_devices ADD CONSTRAINT student_devices_student_id_device_id_key UNIQUE(student_id, device_id);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_student_devices_student ON student_devices(student_id);

-- 3. Ensure device_alerts table, columns, and updated CHECK constraints
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

ALTER TABLE device_alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP;
ALTER TABLE device_alerts ADD COLUMN IF NOT EXISTS device_name VARCHAR(300);
ALTER TABLE device_alerts ADD COLUMN IF NOT EXISTS ip_address  VARCHAR(45);

-- Update chk_alert_status to allow 'reactivated' and 'dismissed'
DO $$ BEGIN
  ALTER TABLE device_alerts DROP CONSTRAINT IF EXISTS chk_alert_status;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE device_alerts ADD CONSTRAINT chk_alert_status CHECK (status IN ('pending', 'resolved', 'reactivated', 'dismissed'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Update chk_alert_type to allow 'auto_suspended' and 'concurrent_session_kick'
DO $$ BEGIN
  ALTER TABLE device_alerts DROP CONSTRAINT IF EXISTS chk_alert_type;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE device_alerts ADD CONSTRAINT chk_alert_type CHECK (alert_type IN ('device_limit_exceeded', 'capture_attempt', 'auto_suspended', 'concurrent_session_kick'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_device_alerts_teacher ON device_alerts(teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_device_alerts_student ON device_alerts(student_id);

-- 4. Ensure student_active_sessions table exists
CREATE TABLE IF NOT EXISTS student_active_sessions (
  id              SERIAL PRIMARY KEY,
  student_id      INTEGER REFERENCES students(id) ON DELETE CASCADE,
  jti             VARCHAR(64) NOT NULL,
  device_id       VARCHAR(128) NOT NULL,
  device_origin   VARCHAR(20)  DEFAULT 'browser',
  ip_address      VARCHAR(45),
  user_agent      TEXT,
  logged_in_at    TIMESTAMPTZ  DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ  DEFAULT NOW(),
  kicked_at       TIMESTAMPTZ,
  kicked_reason   VARCHAR(100),
  UNIQUE(jti)
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_student     ON student_active_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_last_active ON student_active_sessions(last_active_at);
CREATE INDEX IF NOT EXISTS idx_active_sessions_device      ON student_active_sessions(student_id, device_id);
