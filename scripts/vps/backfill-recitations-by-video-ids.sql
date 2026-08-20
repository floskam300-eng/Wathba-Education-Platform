-- ════════════════════════════════════════════════════════════════════════════
--  WATHBA — Smart Backfill: video_ids → section_id
--  ════════════════════════════════════════════════════════════════════════════
--  Purpose:  After applying the migration, automatically populate
--            recitations.section_id based on the existing video_ids
--            linkages. This is the safest possible migration:
--
--              1. Run migration → section_id column added (NULL everywhere)
--              2. Run this script → section_id inferred from video_ids
--              3. (Optional) teacher can manually fix any wrong section_ids
--                 via the UI drag-drop
--
--  Inference rules:
--              If a recitation's video_ids all point to videos in the SAME
--              section → set section_id = that section (gates that section).
--              If videos span multiple sections → skip (need manual fix).
--              If no videos → skip (no gate).
--              If videos don't exist → skip (broken link).
--
--  Transaction-safe: run inside BEGIN/COMMIT.
--  Review-friendly:  includes a SELECT at the top showing what WILL change
--                    before the actual UPDATE runs.
-- ════════════════════════════════════════════════════════════════════════════

\echo '════════════════════════════════════════════════════════════════════════════'
\echo '  STEP 1 — Preview: what WOULD change (no writes yet)'
\echo '════════════════════════════════════════════════════════════════════════════'

-- For each active recitation:
--   - find the distinct section_ids of the videos it links to
--   - if exactly one distinct section, propose that as the new section_id
--   - if 0 or >1 distinct sections, skip and report why
WITH inferred AS (
  SELECT
    r.id AS recitation_id,
    r.title,
    r.section_id AS current_section_id,
    (
      SELECT array_agg(DISTINCT v.section_id ORDER BY v.section_id)
        FROM jsonb_array_elements_text(r.video_ids) AS jt(vid)
        JOIN videos v ON v.id = (jt.vid)::int
        WHERE v.section_id IS NOT NULL
    ) AS sections_referenced,
    (
      SELECT count(*) FROM jsonb_array_elements_text(r.video_ids) AS jt(vid)
        JOIN videos v ON v.id = (jt.vid)::int
    ) AS videos_found,
    (
      SELECT count(*) FROM jsonb_array_elements_text(r.video_ids) AS jt(vid)
    ) AS total_video_ids
  FROM recitations r
  WHERE r.deleted_at IS NULL
)
SELECT
  recitation_id,
  title,
  current_section_id,
  sections_referenced,
  CASE
    WHEN current_section_id IS NOT NULL THEN '⏭️  already set, skip'
    WHEN total_video_ids = 0 THEN '⏭️  no video_ids, skip'
    WHEN videos_found = 0 THEN '⏭️  all videos broken, skip'
    WHEN array_length(sections_referenced, 1) = 1 THEN '✅ will set section_id = ' || sections_referenced[1]
    ELSE '⚠️  videos span ' || array_length(sections_referenced, 1) || ' sections, manual fix needed'
  END AS action
FROM inferred
ORDER BY recitation_id;

\echo ''
\echo '════════════════════════════════════════════════════════════════════════════'
\echo '  STEP 2 — Run the backfill (inside a transaction)'
\echo '════════════════════════════════════════════════════════════════════════════'

BEGIN;

-- The same CTE, but now doing the UPDATE.
WITH inferred AS (
  SELECT
    r.id AS recitation_id,
    (
      SELECT MIN(v.section_id)
        FROM jsonb_array_elements_text(r.video_ids) AS jt(vid)
        JOIN videos v ON v.id = (jt.vid)::int
        WHERE v.section_id IS NOT NULL
        GROUP BY v.section_id
        HAVING COUNT(DISTINCT v.section_id) = 1
    ) AS inferred_section_id,
    (
      SELECT bool_or(v.section_id IS NOT NULL)
        FROM jsonb_array_elements_text(r.video_ids) AS jt(vid)
        JOIN videos v ON v.id = (jt.vid)::int
    ) AS has_any_video_with_section
  FROM recitations r
  WHERE r.deleted_at IS NULL
    AND r.section_id IS NULL
    AND r.video_ids IS NOT NULL
    AND r.video_ids != '[]'::jsonb
)
UPDATE recitations r
SET section_id = i.inferred_section_id
FROM inferred i
WHERE r.id = i.recitation_id
  AND r.section_id IS NULL
  AND i.inferred_section_id IS NOT NULL
  AND i.has_any_video_with_section = true;

\echo ''
\echo 'Rows updated:'
SELECT
  COUNT(*) AS rows_updated,
  COUNT(*) FILTER (WHERE section_id IS NOT NULL) AS total_with_section_id,
  COUNT(*) FILTER (WHERE section_id IS NULL AND deleted_at IS NULL) AS remaining_without_section_id
FROM recitations
WHERE deleted_at IS NULL;

COMMIT;

\echo ''
\echo '════════════════════════════════════════════════════════════════════════════'
\echo '  STEP 3 — Verify
\echo '════════════════════════════════════════════════════════════════════════════'

SELECT
  CASE WHEN section_id IS NULL THEN '⚠️  NULL' ELSE '✅ ' || section_id::text END AS section,
  COUNT(*) AS count
FROM recitations
WHERE deleted_at IS NULL
GROUP BY section_id IS NULL
ORDER BY section NULLS FIRST;

\echo ''
\echo 'If you see ✅ values above, the backfill worked.'
\echo 'If you still see ⚠️ NULL, those recitations need manual section assignment via UI.'
