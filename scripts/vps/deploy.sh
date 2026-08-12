#!/bin/bash
# ─────────────────────────────────────────
#  WATHBA — Pull latest code & redeploy (VPS)
#
#  Default flow: pull → build → migrate → restart → log tail.
#  Quickest possible deploy. No integration tests are run.
#
#  To also run the post-deploy verification (schema check + lock-math test):
#      WITH_VERIFY=1 bash scripts/vps/deploy.sh
#
#  To run only the verification (without redeploying):
#      bash scripts/vps/verify.sh
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
echo "[1/5] Pulling latest code from GitHub..."
git fetch origin
git reset --hard origin/main

echo ""
echo "[2/5] Building app & admin images..."
sudo docker compose build app admin

echo ""
echo "[3/5] Running incremental DB migrations (idempotent, safe to re-run)..."
bash scripts/vps/run-migrations.sh || {
  echo "[deploy] WARNING: migrations script failed. The new code expects the"
  echo "         schema changes to be in place. Re-run 'bash scripts/vps/run-migrations.sh'"
  echo "         manually once the issue is resolved."
}

echo ""
echo "[4/5] Restarting containers..."
echo "  NOTE: Site will be unavailable for ~2-5 seconds..."
sudo docker compose up -d --force-recreate app admin

echo ""
echo "[5/5] Checking status..."
sudo docker compose ps

echo ""
echo "App logs (last 20 lines):"
sudo docker compose logs app --tail=20

# Optional post-deploy verification. Off by default so deploys stay fast.
if [ "${WITH_VERIFY:-0}" = "1" ]; then
  echo ""
  echo "[verify] Running schema + lock-math integration test..."
  bash scripts/vps/verify.sh || {
    echo "[deploy] WARNING: verification failed. App is running but lock math may be broken."
  }
fi

echo ""
echo "================================================"
echo "  Deploy complete!"
echo "================================================"
