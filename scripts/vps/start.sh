#!/bin/bash
# ─────────────────────────────────────────
#  WATHBA — Start all containers (VPS)
# ─────────────────────────────────────────

cd "$(dirname "$0")/../.."

echo "🚀 Starting Wathba..."
sudo docker compose up -d

echo ""
echo "📋 Status:"
sudo docker compose ps

echo ""
echo "📝 App logs (last 20 lines):"
sudo docker compose logs app --tail=20
