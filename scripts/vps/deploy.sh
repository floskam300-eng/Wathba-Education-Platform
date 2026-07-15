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
echo "[1/4] Pulling latest code from GitHub..."
git fetch origin
git reset --hard origin/main

echo ""
echo "[2/4] Building app image..."
sudo docker compose build app

echo ""
echo "[3/4] Restarting app container..."
echo "  NOTE: Site will be unavailable for ~2-5 seconds..."
sudo docker compose up -d --force-recreate app

echo ""
echo "[4/4] Checking status..."
sudo docker compose ps

echo ""
echo "App logs (last 20 lines):"
sudo docker compose logs app --tail=20

echo ""
echo "================================================"
echo "  Deploy complete!"
echo "================================================"
