#!/bin/bash
# ─────────────────────────────────────────
#  WATHBA — Pull latest code & redeploy (VPS)
#
#  NOTE: There will be ~2-5 seconds of downtime
#        while the new container is starting.
# ─────────────────────────────────────────

set -e

cd "$(dirname "$0")/../.."

echo "================================================"
echo "  WATHBA Deploy"
echo "================================================"

echo ""
echo "[1/6] Pulling latest code from GitHub..."
git fetch origin
git reset --hard origin/main

echo ""
echo "[2/6] Building app & admin images..."
sudo docker compose build app admin

echo ""
echo "[3/6] Running incremental DB migrations (idempotent, safe to re-run)..."
bash scripts/vps/run-migrations.sh || {
  echo "[deploy] WARNING: migrations script failed. The new code expects the"
  echo "         schema changes to be in place. Re-run 'bash scripts/vps/run-migrations.sh'"
  echo "         manually once the issue is resolved."
}

echo ""
echo "[4/6] Restarting containers..."
echo "  NOTE: Site will be unavailable for ~2-5 seconds..."
sudo docker compose up -d --force-recreate app admin

echo ""
echo "[5/6] Checking status..."
sudo docker compose ps

echo ""
echo "App logs (last 20 lines):"
sudo docker compose logs app --tail=20

echo ""
echo "[6/6] Verifying deploy (schema + lock-math integration test)..."
bash scripts/vps/verify.sh || {
  echo "[deploy] WARNING: verification failed. The app is running but the lock"
  echo "         feature may be in a broken state. Check the output above."
}

echo ""
echo "================================================"
echo "  Deploy complete!"
echo "================================================"
