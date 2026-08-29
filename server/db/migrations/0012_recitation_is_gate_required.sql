-- ────────────────────────────────────────────────────────────────────────────
-- Migration 0012: Add is_gate_required to recitations
-- Allows teachers to specify whether a recitation is required to unlock the next chapter.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE recitations
  ADD COLUMN IF NOT EXISTS is_gate_required BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_recitations_gate_required ON recitations(section_id, is_gate_required)
  WHERE is_gate_required = true AND deleted_at IS NULL;
