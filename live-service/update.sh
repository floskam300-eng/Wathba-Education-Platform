#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Update LiveKit to latest version
# شغّل: bash update.sh
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "🔄 Pulling latest LiveKit image..."
docker compose pull

echo "🔄 Restarting services..."
docker compose up -d

echo "✅ Update complete"
docker compose ps
