 // Run the updated inspect script directly via node pg to verify
// the bug fix and confirm the section_id backfill analysis works.

const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:5432/wathba',
});

async function main() {
  // ── Section 1: Total counts ──
  console.log('=== 1. Total counts ===');
  let r = await pool.query(`
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
         AND (video_ids IS NULL OR video_ids = '[]'::jsonb))         AS recitations_without_video_links
  `);
  console.log(`  courses=${r.rows[0].total_courses} sections=${r.rows[0].total_sections} videos=${r.rows[0].total_videos} pdfs=${r.rows[0].total_pdfs}`);
  console.log(`  recitations: ${r.rows[0].total_recitations} total, ${r.rows[0].active_recitations} active`);
  console.log(`  with video links: ${r.rows[0].recitations_with_video_links}, without: ${r.rows[0].recitations_without_video_links}`);

  // ── Section 6: Is section_id already on recitations? ──
  console.log('\n=== 6. Has section_id been added to recitations? ===');
  r = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'recitations' AND column_name IN ('section_id', 'video_ids')
    ORDER BY column_name
  `);
  for (const row of r.rows) console.log(`  ${row.column_name}: ${row.data_type} (nullable=${row.is_nullable})`);

  // ── Section 9: Auto-migration summary ──
  console.log('\n=== 9. Auto-migration candidates (summary) ===');
  r = await pool.query(`
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
    ORDER BY 1
  `);
  for (const row of r.rows) console.log(`  ${row.migration_status}: ${row.recitation_count}`);

  // ── Section 9b: Auto-mappable detail ──
  console.log('\n=== 9b. Auto-mappable detail (recitation → section) ===');
  r = await pool.query(`
    WITH locked AS (
      SELECT
        r.id AS recitation_id,
        v.section_id AS locked_sec_id,
        COUNT(*) AS video_count,
        s.title AS section_title,
        c.name AS course_name,
        r.title AS recitation_title
      FROM recitations r
      CROSS JOIN LATERAL jsonb_array_elements_text(r.video_ids) AS vid_text
      JOIN videos v ON v.id = vid_text::int
      JOIN sections s ON s.id = v.section_id
      JOIN courses c ON c.id = r.course_id
      WHERE r.deleted_at IS NULL
        AND r.section_id IS NULL
        AND r.video_ids IS NOT NULL
        AND r.video_ids != '[]'::jsonb
      GROUP BY r.id, v.section_id, s.title, c.name, r.title
    ),
    agg AS (
      SELECT
        recitation_id,
        COUNT(DISTINCT locked_sec_id) AS distinct_sections,
        SUM(video_count) AS total_videos,
        MAX(locked_sec_id) FILTER (WHERE rnk = 1) AS best_section_id,
        MAX(section_title) FILTER (WHERE rnk = 1) AS best_section_title,
        MAX(course_name) AS course_name,
        MAX(recitation_title) AS recitation_title
      FROM (
        SELECT
          l.*,
          ROW_NUMBER() OVER (PARTITION BY l.recitation_id
                            ORDER BY l.video_count DESC, l.locked_sec_id ASC) AS rnk
        FROM locked l
      ) ranked
      GROUP BY recitation_id
    )
    SELECT
      agg.recitation_id,
      agg.recitation_title,
      agg.course_name,
      agg.best_section_id,
      agg.best_section_title,
      agg.distinct_sections,
      agg.total_videos,
      CASE
        WHEN agg.distinct_sections = 1 THEN '🟢 AUTO-MAP'
        WHEN agg.distinct_sections >  1 THEN '🟡 SKIP (cross-section)'
        ELSE                              '⚪ SKIP (no locked videos)'
      END AS action
    FROM agg
    WHERE agg.distinct_sections = 1
    ORDER BY agg.recitation_id
  `);
  for (const row of r.rows) {
    console.log(`  #${row.recitation_id} "${row.recitation_title.slice(0, 35)}" → section ${row.best_section_id} "${row.best_section_title.slice(0, 30)}" (${row.action})`);
  }

  // ── Section 10: FK integrity ──
  console.log('\n=== 10. Orphaned FK integrity ===');
  r = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM videos v WHERE v.section_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sections s WHERE s.id = v.section_id)) AS orphaned_video_sections,
      (SELECT COUNT(*) FROM pdf_files p WHERE p.section_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sections s WHERE s.id = p.section_id)) AS orphaned_pdf_sections,
      (SELECT COUNT(*) FROM recitations r WHERE r.section_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sections s WHERE s.id = r.section_id)) AS orphaned_recitation_sections
  `);
  console.log(`  orphaned videos: ${r.rows[0].orphaned_video_sections}, pdfs: ${r.rows[0].orphaned_pdf_sections}, recitations: ${r.rows[0].orphaned_recitation_sections}`);

  // ── Section 8: Course → sections → content layout ──
  console.log('\n=== 8. Course → sections → content layout ===');
  r = await pool.query(`
    WITH c AS (SELECT id, name FROM courses ORDER BY id LIMIT 5)
    SELECT
      c.id AS course_id, c.name AS course_name,
      s.id AS section_id, s.title AS section_title, s.sort_order,
      (SELECT COUNT(*) FROM videos v WHERE v.section_id = s.id) AS videos_in_section,
      (SELECT COUNT(*) FROM pdf_files p WHERE p.section_id = s.id) AS pdfs_in_section,
      (SELECT COUNT(*) FROM recitations r WHERE r.section_id = s.id AND r.deleted_at IS NULL) AS recitations_in_section
    FROM c
    LEFT JOIN sections s ON s.course_id = c.id
    ORDER BY c.id, s.sort_order
  `);
  for (const row of r.rows) {
    console.log(`  course=${row.course_id} "${row.course_name.slice(0, 30)}" sec=${row.section_id} sort=${row.sort_order} videos=${row.videos_in_section} pdfs=${row.pdfs_in_section} recs=${row.recitations_in_section}`);
  }

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });