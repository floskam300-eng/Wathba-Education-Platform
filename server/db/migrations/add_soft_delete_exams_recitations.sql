-- Migration: Soft delete for exams and recitations
-- Run this once on any existing database before deploying the new server code.
-- New databases built from schema.sql pick up these columns automatically.

ALTER TABLE exams       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE recitations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Partial indexes: only the undeleted rows need fast teacher_id lookups.
CREATE INDEX IF NOT EXISTS idx_exams_not_deleted
  ON exams (teacher_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_recitations_not_deleted
  ON recitations (teacher_id, created_at DESC)
  WHERE deleted_at IS NULL;
