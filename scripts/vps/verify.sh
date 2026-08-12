#!/bin/bash
# ─────────────────────────────────────────
#  WATHBA — Verify a deploy (VPS)
#
#  1. Confirms the dead `ever_passed` columns are gone.
#  2. Runs the recitation lock integration test against the live API
#     to prove the link-recitation-to-video feature actually works.
#
#  Usage:
#    bash scripts/vps/verify.sh
# ─────────────────────────────────────────

set -e

cd "$(dirname "$0")/../.."

echo "================================================"
echo "  WATHBA — Deploy verification"
echo "================================================"

# — 1. Schema check — ─────────────────────────────────────────────────────────
echo ""
echo "[1/2] Checking that the dead ever_passed columns are gone..."

if ! sudo docker compose ps db --status running | grep -q db; then
  echo "  ERROR: 'db' container is not running."
  exit 1
fi

if [ -f .env ]; then set -a; . ./.env; set +a; fi
DB_NAME="${POSTGRES_DB:-wathba}"
DB_USER="${POSTGRES_USER:-wathba}"

RESULT=$(sudo docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -t -A -c \
  "SELECT table_name FROM information_schema.columns
    WHERE table_name IN ('recitation_results','exam_results')
      AND column_name = 'ever_passed';")

if [ -z "$RESULT" ]; then
  echo "  ✅ ever_passed is GONE from both recitation_results and exam_results."
else
  echo "  ⚠️  ever_passed still present on:"
  echo "$RESULT" | sed 's/^/     - /'
  echo "  Re-run: bash scripts/vps/run-migrations.sh"
  exit 1
fi

# — 2. Live integration test — ────────────────────────────────────────────────
echo ""
echo "[2/2] Running recitation_locks integration test against live API..."
echo "      (Server: http://localhost:3001)"

if ! sudo docker compose ps app --status running | grep -q app; then
  echo "  ERROR: 'app' container is not running."
  exit 1
fi

sudo docker compose exec -T app node server/tests/recitation_locks.test.js

echo ""
echo "================================================"
echo "  Verification complete."
echo "================================================"
