#!/bin/bash
# ─────────────────────────────────────────
#  WATHBA — Seed database inside Docker (VPS)
#  WARNING: This will clear all data!
# ─────────────────────────────────────────

cd "$(dirname "$0")/../.."

echo "WARNING: This will clear ALL data and seed test data!"
echo "  Accounts: admin/admin123 | asst_nour/123456 | std_ali/123456"
echo ""
read -p "Are you sure? (y/N): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "Running seed script inside app container..."
sudo docker compose exec app node server/db/seed.js

echo ""
echo "Seed complete!"
