#!/bin/bash
# ─────────────────────────────────────────
#  WATHBA — Seed database inside Docker (VPS)
#  ⚠️  يمسح كل البيانات ويعيد زرع بيانات تجريبية
# ─────────────────────────────────────────

cd "$(dirname "$0")/../.."

echo "⚠️  هذا سيمسح كل البيانات ويزرع بيانات تجريبية!"
echo "   admin / admin123"
echo "   asst_nour / 123456"
echo "   std_ali / 123456"
echo ""
read -p "متأكد؟ (y/N): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "تم الإلغاء."
    exit 0
fi

echo ""
echo "🌱 Running seed script inside app container..."
sudo docker compose exec app node server/db/seed.js

echo ""
echo "✅ Seed complete!"
