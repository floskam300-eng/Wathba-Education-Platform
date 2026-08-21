-- ============================================================================
--  WATHBA — Pre-migration diagnostic queries for the sections/recitations feature
--  ─────────────────────────────────────────────────────────────────────────
--  Run these on the PRODUCTION database BEFORE applying the migration to
--  understand the shape of your existing data.
--
--  All queries are READ-ONLY. Safe to run multiple times. They will NOT
--  modify any data.
--
--  Usage (from VPS):
--    sudo docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" \
--      -f /path/to/inspect-recitations.sql
-- ============================================================================

\echo '═══════════════════════════════════════════════════════════════════════'
\echo '  1. Total counts (sanity check)'
\echo '═══════════════════════════════════════════════════════════════════════'

SELECT
  (SELECT COUNT(*) FROM courses)              AS total_courses,
  (SELECT COUNT(*) FROM sections)             AS total_sections,
  (SELECT COUNT(*) FROM videos)               AS total_videos,
  (SELECT COUNT(*) FROM pdf_files)            AS total_pdfs,
  (SELECT COUNT(*) FROM recitations)          AS total_recitations,
  (SELECT COUNT(*) FROM recitations WHERE deleted_at IS NULL)    AS active_recitations,
  (SELECT COUNT(*) FROM recitations WHERE deleted_at IS NULL
     AND video_ids IS NOT NULL AND video_ids != '[]'::jsonb)     AS recitations_with_video_links,
  (SELECT COUNT(*) FROM recitations WHERE deleted_at IS NULL
     AND (video_ids IS NULL OR video_ids = '[]'::jsonb))         AS recitations_without_video_links;

\echo ''
\echo '═══════════════════════════════════════════════════════════════════════'
\echo '  2. Distribution of recitations per course'
\echo '═══════════════════════════════════════════════════════════════════════'

SELECT
  c.id, c.name,
  COUNT(r.id) AS total_recitations,
  COUNT(r.id) FILTER (WHERE r.deleted_at IS NULL) AS active,
  COUNT(r.id) FILTER (WHERE r.deleted_at IS NULL
                       AND r.video_ids IS NOT NULL AND r.video_ids != '[]'::jsonb) AS with_videos,
  COUNT(r.id) FILTER (WHERE r.deleted_at IS NULL
                       AND (r.video_ids IS NULL OR r.video_ids = '[]'::jsonb)) AS without_videos
FROM courses c
LEFT JOIN recitations r ON r.course_id = c.id
GROUP BY c.id, c.name
ORDER BY total_recitations DESC NULLS LAST
LIMIT 30;

\echo ''
\echo '═══════════════════════════════════════════════════════════════════════'
\echo '  3. Sections per course — who already has chapters, who does not'
\echo '═══════════════════════════════════════════════════════════════════════'

SELECT
  c.id, c.name,
  COUNT(s.id) AS section_count,
  COALESCE(STRING_AGG(s.title, ' | ' ORDER BY s.sort_order), '(لا توجد فصول)') AS sections
FROM courses c
LEFT JOIN sections s ON s.course_id = c.id
GROUP BY c.id, c.name
ORDER BY section_count DESC, c.name;

\echo ''
\echo '═══════════════════════════════════════════════════════════════════════'
\echo '  4. Sample of existing video_ids — what do the locks look like today?'
\echo '═══════════════════════════════════════════════════════════════════════'

SELECT
  r.id, r.title,
  jsonb_array_length(r.video_ids) AS video_count,
  LEFT(r.video_ids::text, 80)     AS video_ids_preview
FROM recitations r
WHERE r.deleted_at IS NULL
  AND r.video_ids IS NOT NULL
  AND r.video_ids != '[]'::jsonb
ORDER BY r.id
LIMIT 10;

\echo ''
\echo '═══════════════════════════════════════════════════════════════════════'
\echo '  5. Do the locked video IDs all belong to the recitation course?'
\echo '  (cross-course video locks are an a security smell)'
\echo '═══════════════════════════════════════════════════════════════════════'

SELECT
  r.id AS recitation_id, r.title AS recitation_title, c1.name AS course,
  COUNT(*) FILTER (
    WHERE v.course_id != r.course_id
  ) AS cross_course_video_count,
  COUNT(*) AS total_locked_videos
FROM recitations r
JOIN courses c1 ON c1.id = r.course_id
CROSS JOIN LATERAL jsonb_array_elements_text(r.video_ids) AS vid_text
LEFT JOIN videos v ON v.id = vid_text::int
WHERE r.deleted_at IS NULL
  AND r.video_ids IS NOT NULL
  AND r.video_ids != '[]'::jsonb
GROUP BY r.id, r.title, c1.name
HAVING COUNT(*) FILTER (WHERE v.course_id != r.course_id) > 0
LIMIT 20;

\echo ''
\echo '═══════════════════════════════════════════════════════════════════════'
\echo '  6. Is section_id already on recitations? (in case migration ran)'
\echo '═══════════════════════════════════════════════════════════════════════'

SELECT
  column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'recitations'
  AND column_name IN ('section_id', 'video_ids')
ORDER BY column_name;

\echo ''
\echo '═══════════════════════════════════════════════════════════════════════'
\echo '  7. Existing FK constraints on recitations.video_ids (informational)'
\echo '═══════════════════════════════════════════════════════════════════════'

SELECT
  conname, contype,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'recitations'::regclass
ORDER BY conname;

\echo ''
\echo '═══════════════════════════════════════════════════════════════════════'
\echo '  8. Sample of complete course → sections → videos → recitations layout'
\echo '  (to understand the structure we are migrating to)'
\echo '═══════════════════════════════════════════════════════════════════════'

WITH c AS (
  SELECT id, name FROM courses
  WHERE deleted_at IS NULL
  ORDER BY id LIMIT 5
)
SELECT
  c.id AS course_id, c.name AS course_name,
  s.id AS section_id, s.title AS section_title, s.sort_order,
  (SELECT COUNT(*) FROM videos v WHERE v.section_id = s.id) AS videos_in_section,
  (SELECT COUNT(*) FROM pdf_files p WHERE p.section_id = s.id) AS pdfs_in_section,
  (SELECT COUNT(*) FROM recitations r WHERE r.section_id = s.id
                                        AND r.deleted_at IS NULL) AS recitations_in_section
FROM c
LEFT JOIN sections s ON s.course_id = c.id
ORDER BY c.id, s.sort_order;

\echo ''
\echo '═══════════════════════════════════════════════════════════════════════'
\echo '  9. How many recitations can SAFELY auto-migrate to a section?'
\echo '  A recitation can be auto-mapped to section X if it locks videos that'
\echo '  ALL belong to section X (and no others). Anything else = manual.'
\echo '═══════════════════════════════════════════════════════════════════════'

WITH locked_videos AS (
  SELECT
    r.id AS recitation_id,
    v.section_id AS locked_section_id,
    COUNT(*) AS video_count
  FROM recitations r
  CROSS JOIN LATERAL jsonb_array_elements_text(r.video_ids) AS vid_text
  JOIN videos v ON v.id = vid_text::int
  WHERE r.deleted_at IS NULL
    AND r.video_ids IS NOT NULL
    AND r.video_ids != '[]'::jsonb
  GROUP BY r.id, v.section_id
),
section_counts AS (
  SELECT recitation_id, COUNT(DISTINCT locked_section_id) AS distinct_sections
  FROM locked_videos
  GROUP BY recitation_id
)
SELECT
  CASE
    WHEN sc.distinct_sections = 1 THEN '🟢 Auto-mappable (all locked videos in 1 section)'
    WHEN sc.distinct_sections IS NULL THEN '⚪ No videos locked — stays section_id=NULL'
    ELSE '🟡 Cross-section (needs manual review)'
  END AS migration_status,
  COUNT(*) AS recitation_count
FROM recitations r
LEFT JOIN section_counts sc ON sc.recitation_id = r.id
WHERE r.deleted_at IS NULL
GROUP BY 1
ORDER BY 1;

\echo ''
\echo '═══════════════════════════════════════════════════════════════════════'
\echo '  10. Foreign-key integrity — orphaned section_ids (should be 0)'
\echo '═══════════════════════════════════════════════════════════════════════'

SELECT
  (SELECT COUNT(*) FROM videos v
     WHERE v.section_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sections s WHERE s.id = v.section_id)) AS orphaned_video_sections,
  (SELECT COUNT(*) FROM pdf_files p
     WHERE p.section_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sections s WHERE s.id = p.section_id)) AS orphaned_pdf_sections,
  (SELECT COUNT(*) FROM recitations r
     WHERE r.section_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sections s WHERE s.id = r.section_id)) AS orphaned_recitation_sections;

\echo ''
\echo '═══════════════════════════════════════════════════════════════════════'
\echo '  11. How many recitations reference course + (optional) course+section?'
\echo '  (to plan how many will gate something after migration)'
\echo '═══════════════════════════════════════════════════════════════════════'

SELECT
  COUNT(*) FILTER (WHERE course_id IS NOT NULL) AS linked_to_course,
  COUNT(*) FILTER (WHERE course_id IS NOT NULL
                     AND video_ids IS NOT NULL
                     AND video_ids != '[]'::jsonb) AS course_plus_video_links,
  COUNT(*) FILTER (WHERE course_id IS NULL) AS standalone
FROM recitations
WHERE deleted_at IS NULL;