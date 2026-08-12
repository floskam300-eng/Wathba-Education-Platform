#!/bin/bash
# ─────────────────────────────────────────
#  WATHBA — Run incremental DB migrations inside the running db container (VPS)
#  - All statements are idempotent (uses IF EXISTS / IF NOT EXISTS).
#  - Safe to run on every deploy.
#  - Run from the repo root:
#      bash scripts/vps/run-migrations.sh
# ─────────────────────────────────────────

set -e

cd "$(dirname "$0")/../.."

echo "================================================"
echo "  WATHBA — Incremental DB migrations"
echo "================================================"

# Ensure the DB container is up
if ! sudo docker compose ps db --status running | grep -q db; then
  echo "[run-migrations] ERROR: 'db' container is not running. Start it first:"
  echo "    sudo docker compose up -d db"
  exit 1
fi

# Discover the DB credentials from .env so this script doesn't hardcode them.
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

DB_NAME="${POSTGRES_DB:-wathba}"
DB_USER="${POSTGRES_USER:-wathba}"

MIG_DIR="server/db/migrations"
if [ ! -d "$MIG_DIR" ]; then
  echo "[run-migrations] ERROR: migration directory $MIG_DIR not found."
  exit 1
fi

# Apply each .sql migration in lexical order. Files are idempotent — re-running
# them is safe and a no-op after the first successful apply.
shopt -s nullglob
MIG_FILES=("$MIG_DIR"/*.sql)
shopt -u nullglob

if [ ${#MIG_FILES[@]} -eq 0 ]; then
  echo "[run-migrations] No migration files in $MIG_DIR — nothing to do."
  exit 0
fi

echo "[run-migrations] Found ${#MIG_FILES[@]} migration file(s)."

for f in "${MIG_FILES[@]}"; do
  echo ""
  echo "──── Applying: $f ────"
  sudo docker compose exec -T db psql \
    -v ON_ERROR_STOP=1 \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -f "/dev/stdin" < "$f"
done

echo ""
echo "================================================"
echo "  Migrations applied successfully."
echo "================================================"
