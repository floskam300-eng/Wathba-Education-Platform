#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  WATHBA — Pre-migration inspection for the sections/recitations feature
#  ─────────────────────────────────────────────────────────────────
#  Runs a series of READ-ONLY diagnostic queries against the production
#  database so you can see the shape of existing data BEFORE applying
#  the migration. No data is modified.
#
#  Usage (on the VPS, from the repo root):
#    bash scripts/vps/inspect-recitations.sh
# ─────────────────────────────────────────────────────────────────

set -e

cd "$(dirname "$0")/../.."

echo "================================================"
echo "  WATHBA — Pre-migration inspection"
echo "================================================"

# Ensure the DB container is up
if ! sudo docker compose ps db --status running | grep -q db; then
  echo "[inspect] ERROR: 'db' container is not running."
  echo "    sudo docker compose up -d db"
  exit 1
fi

# Discover DB credentials
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

DB_NAME="${POSTGRES_DB:-wathba}"
DB_USER="${POSTGRES_USER:-wathba}"
SQL_FILE="scripts/vps/inspect-recitations.sql"

if [ ! -f "$SQL_FILE" ]; then
  echo "[inspect] ERROR: $SQL_FILE not found."
  exit 1
fi

echo "[inspect] Running $SQL_FILE against $DB_NAME as $DB_USER ..."
echo ""

sudo docker compose exec -T db psql \
  -v ON_ERROR_STOP=1 \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -f "/dev/stdin" < "$SQL_FILE"

echo ""
echo "================================================"
echo "  Inspection complete. Review the output above"
echo "  before running scripts/vps/run-migrations.sh"
echo "================================================"