-- ────────────────────────────────────────────────────────────────────────────
-- Migration 0008: Hardware Identity Matrix & Similarity Scoring
-- Adds hardware profile telemetry and similarity scoring for zero-false-positive
-- device identification across browsers, PWAs, and storage wipes.
-- Idempotent and safe to run on production.
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Add hardware telemetry columns to student_devices
ALTER TABLE student_devices ADD COLUMN IF NOT EXISTS hardware_profile JSONB DEFAULT '{}'::jsonb;
ALTER TABLE student_devices ADD COLUMN IF NOT EXISTS hardware_hash VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_student_devices_hardware_hash ON student_devices(student_id, hardware_hash);

-- 2. Add telemetry & similarity score to device_alerts
ALTER TABLE device_alerts ADD COLUMN IF NOT EXISTS hardware_profile JSONB DEFAULT '{}'::jsonb;
ALTER TABLE device_alerts ADD COLUMN IF NOT EXISTS similarity_score INTEGER DEFAULT 0;

-- 3. Add functional index for fast case-insensitive username lookups
CREATE INDEX IF NOT EXISTS idx_students_lower_username_teacher ON students(LOWER(username), teacher_id) WHERE deleted_at IS NULL;
