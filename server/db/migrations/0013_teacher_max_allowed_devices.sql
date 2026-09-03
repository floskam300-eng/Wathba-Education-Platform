-- Migration: 0013_teacher_max_allowed_devices.sql
-- Allow teachers to configure the maximum number of devices allowed per student (default 1).

ALTER TABLE teachers ADD COLUMN IF NOT EXISTS max_allowed_devices INT DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_teachers_max_allowed_devices'
  ) THEN
    ALTER TABLE teachers ADD CONSTRAINT chk_teachers_max_allowed_devices CHECK (max_allowed_devices >= 1 AND max_allowed_devices <= 10);
  END IF;
END $$;
