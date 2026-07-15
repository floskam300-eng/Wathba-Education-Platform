#!/bin/bash
# ─────────────────────────────────────────
#  WATHBA — Follow live logs (VPS)
#  Press Ctrl+C to exit
# ─────────────────────────────────────────

cd "$(dirname "$0")/../.."

SERVICE=${1:-app}   # default: app | options: app, admin, db

echo "Following logs for: $SERVICE  (Ctrl+C to exit)"
echo ""
sudo docker compose logs "$SERVICE" --follow --tail=50
