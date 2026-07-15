#!/bin/bash
# ─────────────────────────────────────────
#  WATHBA — Show status and logs (VPS)
# ─────────────────────────────────────────

cd "$(dirname "$0")/../.."

echo "Container status:"
sudo docker compose ps

echo ""
echo "App logs (last 30 lines):"
sudo docker compose logs app --tail=30
