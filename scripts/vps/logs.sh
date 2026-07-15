#!/bin/bash
# ─────────────────────────────────────────
#  WATHBA — Follow live logs (VPS)
#  اضغط Ctrl+C للخروج
# ─────────────────────────────────────────

cd "$(dirname "$0")/../.."

SERVICE=${1:-app}   # default: app | يمكن تمرير: admin أو db

echo "📝 Following logs for: $SERVICE  (Ctrl+C to exit)"
echo ""
sudo docker compose logs "$SERVICE" --follow --tail=50
