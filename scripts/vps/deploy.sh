#!/bin/bash
# ─────────────────────────────────────────
#  WATHBA — Pull latest code & redeploy (VPS)
#
#  NOTE: There will be ~2-5 seconds of downtime
#        while the new container is starting.
# ─────────────────────────────────────────

set -e

cd "$(dirname "$0")/../.."

echo "Pulling latest code from GitHub..."
git stash
git pull origin main
git stash pop 2>/dev/null || true

echo ""
echo "Building app image..."
sudo docker compose build app

echo ""
echo "Restarting app container..."
echo "  NOTE: Site will be unavailable for ~2-5 seconds..."
sudo docker compose up -d --force-recreate app

echo ""
echo "Container status:"
sudo docker compose ps

echo ""
echo "App logs (last 20 lines):"
sudo docker compose logs app --tail=20

echo ""
echo "Deploy complete!"
