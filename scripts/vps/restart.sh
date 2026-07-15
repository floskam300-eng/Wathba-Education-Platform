#!/bin/bash
# ─────────────────────────────────────────
#  WATHBA — Restart all containers (VPS)
# ─────────────────────────────────────────

cd "$(dirname "$0")/../.."

echo "🔄 Restarting Wathba..."
sudo docker compose restart

echo ""
echo "📋 Status:"
sudo docker compose ps

echo ""
echo "📝 App logs (last 20 lines):"
sudo docker compose logs app --tail=20
