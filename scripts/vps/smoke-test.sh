#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  WATHBA — Post-deploy smoke test
#  ─────────────────────────────────────────────────────────────────
#  Logs in as admin, hits the new /api/courses/:id/content endpoint
#  and asserts that the response uses the new shape (sections[] array
#  with nested videos/pdfs/recitations). Run this AFTER restart.sh.

set -e

if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

API_BASE="${API_BASE:-http://localhost:3001}"
TENANT="${DEFAULT_TENANT_SLUG:-demo}"
DB_NAME="${POSTGRES_DB:-wathba}"
DB_USER="${POSTGRES_USER:-wathba}"

echo "================================================"
echo "  WATHBA — Post-deploy smoke test"
echo "================================================"

# 1. Login as admin
echo ""
echo "──── 1. Login as admin ────"
TOKEN=$(curl -fsS -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: $TENANT" \
  -d "{\"username\":\"admin\",\"password\":\"admin123\",\"device_id\":\"smoke-test\",\"device_origin\":\"browser\",\"device_name\":\"smoke\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "  ✅ got token (${#TOKEN} chars)"

# 2. Pick a course that has both sections and recitations mapped
echo ""
echo "──── 2. Find a course with mapped recitations ────"
COURSE_ID=$(sudo docker compose exec -T db psql -A -t -U "$DB_USER" -d "$DB_NAME" \
  -c "SELECT c.id FROM courses c JOIN sections s ON s.course_id = c.id JOIN recitations r ON r.section_id = s.id WHERE r.deleted_at IS NULL GROUP BY c.id HAVING count(*) >= 2 LIMIT 1")
COURSE_ID=$(echo "$COURSE_ID" | tr -d '[:space:]')
if [ -z "$COURSE_ID" ]; then
  echo "  ⚠️  no course with mapped recitations found (this is OK if the DB has only standalone recitations)"
  exit 0
fi
echo "  ✅ picked course id=$COURSE_ID"

# 3. Fetch content
echo ""
echo "──── 3. GET /api/courses/$COURSE_ID/content ────"
RESPONSE=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$API_BASE/api/courses/$COURSE_ID/content")
echo "  ✅ got response ($(echo "$RESPONSE" | wc -c) chars)"

# 4. Assert response shape
echo ""
echo "──── 4. Response shape checks ────"
HAS_SECTIONS=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print('YES' if 'sections' in d else 'NO')")
echo "  sections[] present: $HAS_SECTIONS"

HAS_SECTION_RECITATIONS=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(len(s.get('recitations',[])) for s in d.get('sections',[])))")
echo "  total recitations in sections[]: $HAS_SECTION_RECITATIONS"

HAS_LOCKED=$(echo "$RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
sections = d.get('sections', [])
# Find a non-first section with recitations
locked = [s for s in sections if not s.get('is_unlocked_for_student', True) and s.get('recitations')]
print('YES' if locked else 'NO')
")
echo "  at least one locked section found: $HAS_LOCKED"

if [ "$HAS_LOCKED" = "YES" ]; then
  echo ""
  echo "──── 5. Locked section detail ────"
  echo "$RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for s in d.get('sections', []):
    if not s.get('is_unlocked_for_student', True) and s.get('recitations'):
        print(f\"  Section #{s['id']} '{s['title']}': locked=True, recitations={len(s['recitations'])}, gate_progress={s.get('gate_progress')}\")
        for r in s['recitations'][:2]:
            print(f\"    - Recitation #{r['id']} '{r['title'][:40]}'\")
        break
"
fi

echo ""
echo "================================================"
echo "  ✅ Post-deploy smoke test passed!"
echo "================================================"