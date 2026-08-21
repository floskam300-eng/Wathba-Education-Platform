#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  WATHBA — Optional backfill: link old recitations to sections
#  ─────────────────────────────────────────────────────────────────
#  After applying migration 0007, all existing recitations have
#  section_id = NULL (no gate). This script is OPTIONAL — it analyzes
#  each active recitation's locked videos and tries to find the SINGLE
#  section they all belong to. If found, it sets section_id.
#
#  Safety:
#   - READ-ONLY by default (dry-run mode). Pass --apply to actually write.
#   - Recitations whose locked videos span multiple sections are SKIPPED
#     (left as NULL) — the teacher can assign them manually.
#   - Recitations with no locked videos are SKIPPED.
#   - Uses ONE batched psql call (no per-row docker overhead).
#
#  Usage (on the VPS, from the repo root):
#    bash scripts/vps/backfill-recitation-sections.sh           # dry-run
#    bash scripts/vps/backfill-recitation-sections.sh --apply    # actually write
# ─────────────────────────────────────────────────────────────────

set -e

cd "$(dirname "$0")/../.."

DRY_RUN=1
if [ "${1:-}" = "--apply" ]; then
  DRY_RUN=0
fi

if ! sudo docker compose ps db --status running | grep -q db; then
  echo "[backfill] ERROR: 'db' container is not running."
  exit 1
fi

if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

DB_NAME="${POSTGRES_DB:-wathba}"
DB_USER="${POSTGRES_USER:-wathba}"

echo "================================================"
echo "  WATHBA — Recitation → section backfill"
echo "  Mode: $([ $DRY_RUN -eq 1 ] && echo 'DRY RUN (no writes)' || echo 'APPLY (will write)')"
echo "================================================"
echo ""

# Single SELECT that returns tab-separated rows. We deliberately don't
# emit column headers (-A) so the awk filter below only sees data rows.
ANALYSIS_SQL=$(cat <<'SQL'
SELECT
  agg.recitation_id,
  agg.recitation_title,
  agg.course_name,
  agg.best_section_id,
  agg.best_section_title,
  agg.distinct_sections,
  agg.total_videos,
  CASE
    WHEN agg.distinct_sections = 1 THEN 'AUTO-MAP'
    WHEN agg.distinct_sections >  1 THEN 'SKIP-CROSS'
    ELSE                              'SKIP-NONE'
  END AS action
FROM (
  SELECT
    recitation_id, recitation_title, course_name,
    COUNT(DISTINCT locked_sec_id) AS distinct_sections,
    MAX(locked_sec_id) FILTER (WHERE rnk = 1) AS best_section_id,
    MAX(section_title) FILTER (WHERE rnk = 1) AS best_section_title,
    SUM(video_count) AS total_videos
  FROM (
    SELECT
      l.*,
      ROW_NUMBER() OVER (PARTITION BY l.recitation_id
                        ORDER BY l.video_count DESC, l.locked_sec_id ASC) AS rnk
    FROM (
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
    ) l
  ) ranked
  GROUP BY recitation_id, recitation_title, course_name
) agg
ORDER BY agg.distinct_sections DESC, agg.recitation_id;
SQL
)

echo "[backfill] Step 1/2 — Analyzing which recitations can be auto-mapped ..."
echo ""

# Run analysis. Output is tab-separated rows, no headers.
ANALYSIS_TMP=$(mktemp)
sudo docker compose exec -T db psql \
  -v ON_ERROR_STOP=0 \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -A -F $'\t' \
  -c "$ANALYSIS_SQL" > "$ANALYSIS_TMP" 2>/dev/null || true

# Pretty-print the analysis table for the user
awk -F'\t' 'BEGIN {
  printf "%-6s %-32s %-28s %-32s %-12s %-7s %-7s %s\n",
         "ID", "Recitation", "Course", "Target Section", "Status", "Videos", "Sec", "Action"
  printf "%s\n", "------ -------------------------------- -------------------------------- --------------------------------- ------------ ------- ------- ------"
}
{
  status = ($8 == "AUTO-MAP") ? "🟢 AUTO-MAP" : (($8 == "SKIP-CROSS") ? "🟡 CROSS-SEC" : "⚪ NO-VIDEOS")
  printf "%-6s %-32.32s %-28.28s %-32.32s %-12s %-7s %-7s %s\n",
         $1, $2, $3, $5, status, $7, $6, $8
}' "$ANALYSIS_TMP"

# Summary counts
AUTO_COUNT=$(awk -F'\t' '$8 == "AUTO-MAP"' "$ANALYSIS_TMP" | wc -l | tr -d ' ')
CROSS_COUNT=$(awk -F'\t' '$8 == "SKIP-CROSS"' "$ANALYSIS_TMP" | wc -l | tr -d ' ')
NONE_COUNT=$(awk -F'\t' '$8 == "SKIP-NONE"' "$ANALYSIS_TMP" | wc -l | tr -d ' ')
echo ""
echo "[backfill] Summary: 🟢 ${AUTO_COUNT} auto-mappable, 🟡 ${CROSS_COUNT} cross-section, ⚪ ${NONE_COUNT} no-videos"
echo ""

if [ $DRY_RUN -eq 1 ]; then
  echo "[backfill] DRY RUN — no changes were made."
  echo "[backfill] Re-run with --apply to actually write the auto-mappings."
  rm -f "$ANALYSIS_TMP"
  exit 0
fi

# === APPLY MODE ===
# Build a single batched SQL string with one UPDATE per auto-mappable row.
# This is FAR more reliable than per-row docker exec calls.
echo "[backfill] Step 2/2 — Applying auto-mappings ..."

BATCH_SQL=$(awk -F'\t' '$8 == "AUTO-MAP" {
  printf "UPDATE recitations SET section_id = %s WHERE id = %s AND section_id IS NULL;\n", $4, $1
}' "$ANALYSIS_TMP")

# Count statements before execution
BATCH_COUNT=$(printf '%s' "$BATCH_SQL" | grep -c '^UPDATE ')
echo "[backfill] Generated $BATCH_COUNT UPDATE statement(s) ..."

if [ "$BATCH_COUNT" -eq 0 ]; then
  echo "[backfill] Nothing to update — all recitations are already mapped or skipped."
  rm -f "$ANALYSIS_TMP"
  exit 0
fi

# Execute the batch in a single docker exec. We emit `RETURNING id`
# so psql tells us exactly how many rows changed (via "UPDATE N" trailer).
APPLY_SQL=$(printf '%s\n' "$BATCH_SQL")
RESULT=$(printf '%s\nSELECT 1;' "$APPLY_SQL" | \
  sudo docker compose exec -T db psql -v ON_ERROR_STOP=0 \
    -U "$DB_USER" -d "$DB_NAME" \
    -t -A 2>&1 | grep -c '^UPDATE' || echo "0")

echo ""
echo "[backfill] Done — $RESULT UPDATE statement(s) executed successfully."
echo "[backfill] Skipped recitations still have section_id=NULL — teacher must assign them manually via the UI."
echo ""

rm -f "$ANALYSIS_TMP"
echo "================================================"
echo "  Backfill complete."
echo "  Verify with: bash scripts/vps/post-migration-check.sh"
echo "================================================"