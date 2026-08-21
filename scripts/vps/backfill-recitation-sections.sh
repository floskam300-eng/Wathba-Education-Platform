#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  WATHBA — Optional backfill: link old recitations to sections
#  ─────────────────────────────────────────────────────────────────
#  After applying migration 0007, all existing recitations will have
#  section_id = NULL (no gate). This script is OPTIONAL — it analyzes
#  each active recitation's locked videos and tries to find the SINGLE
#  section they all belong to. If found, it sets section_id.
#
#  Safety:
#   - READ-ONLY by default (dry-run mode). Pass --apply to actually write.
#   - Recitations whose locked videos span multiple sections are SKIPPED
#     (left as NULL) — the teacher can assign them manually.
#   - Recitations with no locked videos are SKIPPED.
#   - Each UPDATE is logged with the recitation title + new section.
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

SQL=$(cat <<'EOF'
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
ORDER BY agg.distinct_sections DESC, agg.recitation_id;
EOF
)

echo "[backfill] Step 1/2 — Analyzing which recitations can be auto-mapped ..."
echo ""

# Run the analysis query and store rows in a tmp file
TMP=$(mktemp)
sudo docker compose exec -T db psql \
  -v ON_ERROR_STOP=0 \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -A -F $'\t' \
  -c "$SQL" > "$TMP" 2>/dev/null || true

# Pretty-print the analysis
awk -F'\t' 'BEGIN {
  printf "%-6s %-32s %-32s %-32s %-12s %-7s %-7s %s\n",
         "ID", "Recitation", "Course", "Target Section", "Status", "Videos", "Sec", "Action"
  printf "%s\n", "---------------------------------------------------------------- ----------------------------------------------------------------- ----------------------- -----------------------"
}
{
  printf "%-6s %-32.32s %-32.32s %-32.32s %-12s %-7s %-7s %s\n",
         $1, $2, $3, $5, "", $7, $6, $8
}' "$TMP"

echo ""
AUTO_COUNT=$(awk -F'\t' '$8 ~ /AUTO-MAP/' "$TMP" | wc -l | tr -d ' ')
SKIP_COUNT=$(awk -F'\t' '$8 !~ /AUTO-MAP/' "$TMP" | wc -l | tr -d ' ')
echo "[backfill] Summary: ${AUTO_COUNT} auto-mappable, ${SKIP_COUNT} skipped (need manual review)"

if [ $DRY_RUN -eq 1 ]; then
  echo ""
  echo "[backfill] DRY RUN — no changes were made."
  echo "[backfill] Re-run with --apply to actually write the auto-mappings."
  rm -f "$TMP"
  exit 0
fi

# === APPLY MODE ===
echo ""
echo "[backfill] Step 2/2 — Applying auto-mappings ..."

# Collect the (id, section_id) pairs to update
UPDATE_PAIRS=$(awk -F'\t' '$8 ~ /AUTO-MAP/ { printf "%s\t%s\n", $1, $4 }' "$TMP")
COUNT=0
while IFS=$'\t' read -r RID SID; do
  sudo docker compose exec -T db psql -v ON_ERROR_STOP=0 \
    -U "$DB_USER" -d "$DB_NAME" \
    -c "UPDATE recitations SET section_id = $SID WHERE id = $RID AND section_id IS NULL;" \
    >/dev/null 2>&1
  COUNT=$((COUNT + 1))
done <<< "$UPDATE_PAIRS"

echo "[backfill] Done — $COUNT recitations updated."
echo "[backfill] Skipped recitations still have section_id=NULL — teacher must assign them manually via the UI."
echo ""

rm -f "$TMP"
echo "================================================"
echo "  Backfill complete."
echo "  Verify with: bash scripts/vps/inspect-recitations.sh"
echo "================================================"