-- ────────────────────────────────────────────────────────────────────────────
--  Schema-drift catch-up (idempotent)
--
--  Cause: schema.sql declares some columns only inside CREATE TABLE blocks
--  using `CREATE TABLE IF NOT EXISTS`. On databases that already had the
--  table (without those columns) from an earlier schema.sql run, the
--  CREATE TABLE statement is a no-op and those columns are never added.
--
--  This migration back-fills every drift-prone column for prod DBs that
--  pre-date the corresponding `ALTER TABLE … ADD COLUMN IF NOT EXISTS`
--  statement. Safe to re-run.
--
--  Run via:
--    bash scripts/vps/run-migrations.sh
-- ────────────────────────────────────────────────────────────────────────────

-- ── [H-4 fix] device-tracking columns missing from older DBs ──────────────
ALTER TABLE student_devices         ADD COLUMN IF NOT EXISTS device_origin VARCHAR(20) DEFAULT 'browser';
ALTER TABLE student_active_sessions ADD COLUMN IF NOT EXISTS device_origin VARCHAR(20) DEFAULT 'browser';

-- ── Defensive back-fills for any other CREATE-TABLE-only columns that
--    app code reads but whose ALTER-TABLE IF-NOT-EXISTS was added later. ──
-- All statements are idempotent (ADD COLUMN IF NOT EXISTS) and emit only
-- NOTICE messages when the column already exists, then succeed.

-- teachers
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS slug VARCHAR(100);

-- students
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_suspended           BOOLEAN DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS failed_device_attempts INTEGER DEFAULT 0;
ALTER TABLE students ADD COLUMN IF NOT EXISTS plain_password         VARCHAR(255);

-- exams
ALTER TABLE exams   ADD COLUMN IF NOT EXISTS is_published       BOOLEAN DEFAULT false;
ALTER TABLE exams   ADD COLUMN IF NOT EXISTS points_on_attempt  INTEGER DEFAULT 0;
ALTER TABLE exams   ADD COLUMN IF NOT EXISTS points_on_pass     INTEGER DEFAULT 0;
ALTER TABLE exams   ADD COLUMN IF NOT EXISTS max_retry_attempts INT DEFAULT NULL;
ALTER TABLE exams   ADD COLUMN IF NOT EXISTS is_absent          BOOLEAN DEFAULT false;
ALTER TABLE exams   ADD COLUMN IF NOT EXISTS absent_marked      BOOLEAN DEFAULT false;

-- courses
ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_free             BOOLEAN DEFAULT false;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_published       BOOLEAN DEFAULT false;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS points_on_complete  INTEGER DEFAULT 0;

-- videos
ALTER TABLE videos  ADD COLUMN IF NOT EXISTS url_480  TEXT;
ALTER TABLE videos  ADD COLUMN IF NOT EXISTS url_720  TEXT;
ALTER TABLE videos  ADD COLUMN IF NOT EXISTS url_1080 TEXT;

-- recitations
ALTER TABLE recitations ADD COLUMN IF NOT EXISTS course_id           INTEGER REFERENCES courses(id) ON DELETE SET NULL;
ALTER TABLE recitations ADD COLUMN IF NOT EXISTS video_ids           JSONB DEFAULT '[]';
ALTER TABLE recitations ADD COLUMN IF NOT EXISTS allow_retry         BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE recitations ADD COLUMN IF NOT EXISTS max_retry_attempts  INT DEFAULT NULL;
ALTER TABLE recitations ADD COLUMN IF NOT EXISTS deleted_at          TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE recitations ADD COLUMN IF NOT EXISTS absent_marked       BOOLEAN DEFAULT false NOT NULL;

-- exam_results
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1;
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS is_latest       BOOLEAN DEFAULT true;
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS is_absent       BOOLEAN DEFAULT false;

-- recitation_results
ALTER TABLE recitation_results ADD COLUMN IF NOT EXISTS is_absent           BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE recitation_results ADD COLUMN IF NOT EXISTS questions_snapshot   JSONB DEFAULT NULL;
