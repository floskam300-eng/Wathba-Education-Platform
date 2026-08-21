#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────
#  WATHBA — One-shot post-migration analysis
#  ─────────────────────────────────────────────────────────────────────────
#  After applying migration 0007, this script shows:
#    1. How many recitations were auto-mapped to sections (dry-run preview)
#    2. Exactly which recitation → which section
#    3. How many still need manual teacher review
#
#  READ-ONLY. Does NOT modify any data.
#
#  Usage (on the VPS, from the repo root):
#    bash scripts/vps/post-migration-check.sh
# ─────────────────────────────────────────────────────────────────────────

set -e

cd "$(dirname "$0")/../.."

if ! sudo docker compose ps db --status running | grep -q db; then
  echo "[check] ERROR: 'db' container is not running."
  exit 1
fi

if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

DB_NAME="${POSTGRES_DB:-wathba}"
DB_USER="${POSTGRES_USER:-wathba}"

echo "================================================"
echo "  WATHBA — Post-migration analysis (read-only)"
echo "================================================"
echo ""

# ── 1. Total counts ──
echo "──── 1. Total counts ────"
sudo docker compose exec -T db psql -v ON_ERROR_STOP=0 \
  -U "$DB_USER" -d "$DB_NAME" -A -F $'\t' \
  -c "
    SELECT
      (SELECT COUNT(*) FROM courses)              AS total_courses,
      (SELECT COUNT(*) FROM sections)             AS total_sections,
      (SELECT COUNT(*) FROM recitations WHERE deleted_at IS NULL)  AS active_recitations,
      (SELECT COUNT(*) FROM recitations WHERE deleted_at IS NULL
         AND section_id IS NOT NULL)              AS mapped_to_section,
      (SELECT COUNT(*) FROM recitations WHERE deleted_at IS NULL
         AND section_id IS NULL)                  AS unmapped;
  "
echo ""

# ── 2. Is section_id column there? ──
echo "──── 2. Migration sanity check ────"
sudo docker compose exec -T db psql -v ON_ERROR_STOP=0 \
  -U "$DB_USER" -d "$DB_NAME" -A -F $'\t' \
  -c "
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'recitations' AND column_name IN ('section_id', 'video_ids')
    ORDER BY column_name;
  "
echo ""

# ── 3. Auto-mappable detail ──
echo "──── 3. Auto-mappable recitations (will be assigned when you run the backfill) ────"
sudo docker compose exec -T db psql -v ON_ERROR_STOP=0 \
  -U "$DB_USER" -d "$DB_NAME" -A -F $'\t' \
  -c "
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
        MAX(locked_sec_id) FILTER (WHERE rnk = 1) AS best_section_id,
        MAX(section_title) FILTER (WHERE rnk = 1) AS best_section_title,
        MAX(course_name) AS course_name,
        MAX(recitation_title) AS recitation_title
      FROM (
        SELECT l.*,
          ROW_NUMBER() OVER (PARTITION BY l.recitation_id
                            ORDER BY l.video_count DESC, l.locked_sec_id ASC) AS rnk
        FROM locked l
      ) ranked
      GROUP BY recitation_id
    )
    SELECT
      recitation_id,
      recitation_title,
      course_name,
      best_section_id,
      best_section_title
    FROM agg
    WHERE distinct_sections = 1
    ORDER BY recitation_id;
  "
echo ""

# ── 4. Skipped (cross-section) — needs manual review ──
echo "──── 4. Cross-section recitations (NEEDS MANUAL REVIEW — backfill will SKIP these) ────"
sudo docker compose exec -T db psql -v ON_ERROR_STOP=0 \
  -U "$DB_USER" -d "$DB_NAME" -A -F $'\t' \
  -c "
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
        MAX(course_name) AS course_name,
        MAX(recitation_title) AS recitation_title
      FROM locked
      GROUP BY recitation_id
    )
    SELECT recitation_id, recitation_title, course_name, distinct_sections
    FROM agg
    WHERE distinct_sections > 1
    ORDER BY recitation_id;
  "

echo ""
echo "================================================"
echo "  Next steps:"
echo "  • If the auto-mappable list above looks correct, run:"
echo "      bash scripts/vps/backfill-recitation-sections.sh --apply"
echo "  • Cross-section recitations above need a teacher to assign"
echo "    them via the CourseContent UI (drag & drop)."
echo "================================================"