#!/bin/bash
# ─────────────────────────────────────────
#  WATHBA — Pull latest code & redeploy (VPS)
#
#  ⚠️  يحدث انقطاع بسيط (2-5 ثواني) أثناء
#      إعادة تشغيل الـ container الجديد.
# ─────────────────────────────────────────

set -e  # stop on any error

cd "$(dirname "$0")/../.."

echo "📥 Pulling latest code from GitHub..."
git stash           # حفظ أي تعديلات محلية مؤقتًا
git pull origin main
git stash pop 2>/dev/null || true   # استعادة التعديلات المحلية

echo ""
echo "🔨 Rebuilding app image..."
sudo docker compose build app

echo ""
echo "🚀 Restarting app container..."
echo "   ⚠️  الموقع سيكون غير متاح لمدة 2-5 ثواني..."
sudo docker compose up -d --force-recreate app

echo ""
echo "📋 Status:"
sudo docker compose ps

echo ""
echo "📝 App logs (last 20 lines):"
sudo docker compose logs app --tail=20

echo ""
echo "✅ Deploy complete!"
