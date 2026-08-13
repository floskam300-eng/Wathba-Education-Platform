-- ────────────────────────────────────────────────────────────────────────────
--  Teacher-granted one-time retakes for recitations
--
--  Allow teachers (and assistants with can_manage_recitations) to grant
--  a student an extra attempt at a recitation, even when allow_retry is
--  false, the student has exhausted max_retry_attempts, or the student
--  has already passed. Each grant row is consumed the first time the
--  student successfully submits after the grant was issued.
--
--  Multiple grants per (recitation, student) are intentionally allowed —
--  the teacher may decide to grant another after the first is consumed.
--
--  Run via:
--    bash scripts/vps/run-migrations.sh
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recitation_retake_grants (
  id              SERIAL PRIMARY KEY,
  recitation_id   INTEGER NOT NULL REFERENCES recitations(id) ON DELETE CASCADE,
  student_id      INTEGER NOT NULL REFERENCES students(id)    ON DELETE CASCADE,
  granted_by      INTEGER REFERENCES teachers(id)             ON DELETE SET NULL,
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at         TIMESTAMPTZ,
  used_result_id  INTEGER REFERENCES recitation_results(id)   ON DELETE SET NULL,
  note            TEXT
);

-- Partial index keeps "does this student have an unused grant?" O(1) without
-- duplicating rows for used grants (which the WHERE used_at IS NULL filter
-- prunes away). The take/submit endpoints both rely on this lookup.
CREATE INDEX IF NOT EXISTS idx_rrg_unused
  ON recitation_retake_grants(recitation_id, student_id)
  WHERE used_at IS NULL;

-- Helpful for the modal "show me the history of grants for this recitation".
CREATE INDEX IF NOT EXISTS idx_rrg_recitation
  ON recitation_retake_grants(recitation_id, granted_at DESC);
