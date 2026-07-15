#!/bin/bash
# ─────────────────────────────────────────
#  WATHBA — Stop all containers (VPS)
# ─────────────────────────────────────────

set -e

cd "$(dirname "$0")/../.."

echo "================================================"
echo "  WATHBA Stop"
echo "================================================"

echo ""
echo "Stopping all containers..."
sudo docker compose down

echo ""
echo "================================================"
echo "  All containers stopped."
echo "================================================"
