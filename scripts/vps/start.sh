#!/bin/bash
# ─────────────────────────────────────────
#  WATHBA — Start all containers (VPS)
# ─────────────────────────────────────────

set -e

cd "$(dirname "$0")/../.."

echo "================================================"
echo "  WATHBA Start"
echo "================================================"

echo ""
echo "Starting all containers..."
sudo docker compose up -d

echo ""
echo "Container status:"
sudo docker compose ps

echo ""
echo "App logs (last 20 lines):"
sudo docker compose logs app --tail=20

echo ""
echo "================================================"
echo "  All containers started!"
echo "================================================"
