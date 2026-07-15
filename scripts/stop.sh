#!/bin/bash
# ─────────────────────────────────────────
#  WATHBA — Stop all containers
# ─────────────────────────────────────────

cd "$(dirname "$0")/.."

echo "🛑 Stopping Wathba..."
sudo docker compose down

echo ""
echo "✅ All containers stopped."
