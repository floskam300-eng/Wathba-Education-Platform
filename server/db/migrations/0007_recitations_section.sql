-- ────────────────────────────────────────────────────────────────────────────
-- Migration 0007: Link recitations to sections (drop video_ids concept)
-- Idempotent and safe to run on any existing production database.
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Add section_id to recitations. NULL means "not tied to a chapter" (still
--    valid — student sees the recitation, it just doesn't gate any chapter).
ALTER TABLE recitations
  ADD COLUMN IF NOT EXISTS section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL;

-- 2. Index for fast lookup of "all recitations gating chapter X".
CREATE INDEX IF NOT EXISTS idx_recitations_section ON recitations(section_id);

-- 3. (No data migration needed: video_ids stays in the schema for backward
--    compatibility but is ignored by the new logic. New recitations should
--    set video_ids = '[]'. The application layer no longer reads video_ids
--    to compute locks; lock is computed purely from section_id.)
