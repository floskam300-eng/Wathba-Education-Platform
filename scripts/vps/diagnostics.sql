-- ════════════════════════════════════════════════════════════════════════════
--  WATHBA — Production DB Diagnostic Script
--  ════════════════════════════════════════════════════════════════════════════
--  Purpose:  Inspect the current shape of recitations, videos, PDFs, and
--            sections BEFORE applying the new chapter-gating feature.
--            Lets you (1) see what data exists, (2) estimate the migration
--            impact, (3) plan a backfill if you want.
--
--  Usage:    psql -U <user> -d <database> -f diagnostics.sql
--            (or run queries one-by-one in pgAdmin)
--
--  Safe:     Read-only. No INSERT/UPDATE/DELETE.
-- ════════════════════════════════════════════════════════════════════════════

\echo '════════════════════════════════════════════════════════════════════════════'
\echo '  1. SCHEMA CHECK — verify the new section_id column'
\echo '════════════════════════════════════════════════════════════════════════════'

-- 1.1 Does the recitations table have a section_id column yet?
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'recitations'
  AND column_name IN ('section_id', 'video_ids', 'course_id')
ORDER BY column_name;

\echo ''
\echo 'If section_id is NOT in the result → migration NOT applied yet.'
\echo 'If video_ids is in the result → existing data uses video_ids (legacy).'

\echo ''
\echo '════════════════════════════════════════════════════════════════════════════'
\echo '  2. RECITATIONS OVERVIEW'
\echo '════════════════════════════════════════════════════════════════════════════'

-- 2.1 Total recitations + breakdown by state
SELECT
  COUNT(*) AS total_recitations,
  COUNT(*) FILTER (WHERE deleted_at IS NULL) AS active,
  COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS soft_deleted,
  COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_published = true) AS published,
  COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_published = false) AS drafts,
  COUNT(*) FILTER (WHERE deleted_at IS NULL AND course_id IS NOT NULL) AS linked_to_course,
  COUNT(*) FILTER (WHERE deleted_at IS NULL AND course_id IS NULL) AS standalone,
  COUNT(*) FILTER (WHERE video_ids IS NOT NULL AND video_ids != '[]'::jsonb) AS using_video_ids_legacy,
  COUNT(*) FILTER (WHERE section_id IS NOT NULL) AS using_section_id_new
FROM recitations;

\echo ''
\echo '════════════════════════════════════════════════════════════════════════════'
\echo '  3. RECITATIONS DETAIL — video_ids values currently in use'
\echo '════════════════════════════════════════════════════════════════════════════'

-- 3.1 Show what video_ids actually looks like (top 20 active recitations)
SELECT
  r.id,
  r.title,
  r.course_id,
  c.name AS course_name,
  r.section_id,
  -- Show video_ids as JSONB for inspection
  r.video_ids,
  jsonb_array_length(r.video_ids) AS num_videos_linked,
  r.is_published,
  r.deleted_at IS NULL AS is_active
FROM recitations r
LEFT JOIN courses c ON c.id = r.course_id
WHERE r.deleted_at IS NULL
  AND r.video_ids IS NOT NULL
  AND r.video_ids != '[]'::jsonb
ORDER BY r.id
LIMIT 20;

\echo ''
\echo '════════════════════════════════════════════════════════════════════════════'
\echo '  4. DO THESE video_ids REFERENCE REAL VIDEOS?'
\echo '════════════════════════════════════════════════════════════════════════════'

-- 4.1 Find video_ids entries that point to non-existent videos (broken links)
SELECT
  r.id AS recitation_id,
  r.title,
  video_id,
  CASE WHEN v.id IS NULL THEN '❌ BROKEN — video does not exist' ELSE '✅ exists' END AS status
FROM recitations r
CROSS JOIN LATERAL jsonb_array_elements_text(r.video_ids) AS video_id
LEFT JOIN videos v ON v.id = (video_id)::int
WHERE r.deleted_at IS NULL
  AND r.video_ids IS NOT NULL
  AND r.video_ids != '[]'::jsonb
  AND v.id IS NULL
ORDER BY r.id;

\echo ''
\echo '════════════════════════════════════════════════════════════════════════════'
\echo '  5. SECTION COVERAGE — how many videos and PDFs already sit in sections'
\echo '════════════════════════════════════════════════════════════════════════════'

SELECT
  'videos' AS resource,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE section_id IS NOT NULL) AS in_section,
  COUNT(*) FILTER (WHERE section_id IS NULL) AS uncategorized,
  ROUND(100.0 * COUNT(*) FILTER (WHERE section_id IS NOT NULL) / GREATEST(COUNT(*), 1), 1) AS pct_in_section
FROM videos
UNION ALL
SELECT
  'pdf_files' AS resource,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE section_id IS NOT NULL) AS in_section,
  COUNT(*) FILTER (WHERE section_id IS NULL) AS uncategorized,
  ROUND(100.0 * COUNT(*) FILTER (WHERE section_id IS NOT NULL) / GREATEST(COUNT(*), 1), 1) AS pct_in_section
FROM pdf_files
UNION ALL
SELECT
  'recitations' AS resource,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE section_id IS NOT NULL) AS in_section,
  COUNT(*) FILTER (WHERE section_id IS NULL) AS uncategorized,
  ROUND(100.0 * COUNT(*) FILTER (WHERE section_id IS NOT NULL) / GREATEST(COUNT(*), 1), 1) AS pct_in_section
FROM recitations;

\echo ''
\echo '════════════════════════════════════════════════════════════════════════════'
\echo '  6. SECTIONS — is the sections table populated?'
\echo '════════════════════════════════════════════════════════════════════════════'

SELECT
  COUNT(*) AS total_sections,
  COUNT(DISTINCT course_id) AS courses_with_sections,
  COUNT(*) FILTER (WHERE sort_order = 1) AS first_sections,
  COUNT(*) FILTER (WHERE sort_order = 2) AS second_sections,
  COUNT(*) FILTER (WHERE sort_order >= 3) AS third_or_later
FROM sections;

\echo ''
\echo '════════════════════════════════════════════════════════════════════════════'
\echo '  7. CRITICAL — How many courses have NO sections at all?'
\echo '════════════════════════════════════════════════════════════════════════════'

-- These courses will fall back to the "uncategorized" bucket after migration.
SELECT
  c.id,
  c.name,
  COUNT(v.id) AS num_videos,
  COUNT(p.id) AS num_pdfs,
  COUNT(r.id) AS num_recitations
FROM courses c
LEFT JOIN sections s ON s.course_id = c.id
LEFT JOIN videos v ON v.course_id = c.id AND v.section_id = s.id
LEFT JOIN pdf_files p ON p.course_id = c.id AND p.section_id = s.id
LEFT JOIN recitations r ON r.course_id = c.id AND r.section_id = s.id
GROUP BY c.id, c.name
HAVING COUNT(s.id) = 0
ORDER BY num_recitations DESC, num_videos DESC;

\echo ''
\echo '════════════════════════════════════════════════════════════════════════════'
\echo '  8. CRITICAL — How many recitations would CURRENTLY be locked if you'
\echo '     migrated without backfill?'
\echo '════════════════════════════════════════════════════════════════════════════'

-- If section_id is NULL everywhere (no backfill done), this returns 0.
-- After backfill, this will show how many recitations would gate a section.
SELECT
  CASE WHEN section_id IS NULL THEN '⚠️ NOT BACKFILLED' ELSE '✅ backfilled' END AS state,
  COUNT(*) AS count
FROM recitations
WHERE deleted_at IS NULL
GROUP BY (section_id IS NULL)
ORDER BY (section_id IS NULL) DESC;

\echo ''
\echo '════════════════════════════════════════════════════════════════════════════'
\echo '  9. SAMPLE — show 5 recitations with their full context'
\echo '════════════════════════════════════════════════════════════════════════════'

SELECT
  r.id,
  r.title AS recitation,
  c.name AS course,
  s_title.title AS lesson_section,
  r.section_id,
  r.video_ids,
  CASE WHEN r.section_id IS NOT NULL THEN 'GATES section_id' ELSE 'NO GATE (mentor should set)' END AS gate_status
FROM recitations r
JOIN courses c ON c.id = r.course_id
LEFT JOIN sections s_title ON s_title.id = r.section_id
WHERE r.deleted_at IS NULL
ORDER BY r.id
LIMIT 5;

\echo ''
\echo '════════════════════════════════════════════════════════════════════════════'
\echo '  10. MIGRATION READINESS — final checklist'
\echo '════════════════════════════════════════════════════════════════════════════'

SELECT
  (SELECT COUNT(*) FROM sections) AS sections_count,
  (SELECT COUNT(*) FROM recitations WHERE deleted_at IS NULL) AS active_recitations,
  (SELECT COUNT(*) FROM videos) AS total_videos,
  (SELECT COUNT(*) FROM pdf_files) AS total_pdfs,
  (SELECT COUNT(*) FROM recitations WHERE deleted_at IS NULL AND video_ids IS NOT NULL AND video_ids != '[]'::jsonb) AS old_video_locked_recitations,
  (SELECT COUNT(*) FROM recitations WHERE deleted_at IS NULL AND section_id IS NOT NULL) AS new_section_locked_recitations;

\echo ''
\echo 'Migration is SAFE if:'
\echo '  - sections_count > 0  (you have sections to gate)'
\echo '  - Migration is idempotent (can be run twice without breaking)'
\echo '  - Old video_ids data is preserved (column stays)'
\echo '  - New section_id is NULL by default (no recitations gated until you backfill)'
\echo ''
\echo 'NEXT STEPS:'
\echo '  1. Apply migration: bash scripts/vps/run-migrations.sh'
\echo '  2. Re-run this diagnostic to confirm section_id column exists'
\echo '  3. (Optional) Run backfill-recitations-by-video-ids.sql to auto-set section_id'
\echo '  4. (Optional) Verify with: SELECT COUNT(*) FROM recitations WHERE section_id IS NOT NULL;'
