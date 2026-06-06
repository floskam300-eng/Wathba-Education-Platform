#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# توليد API secret قوي لـ LiveKit
# شغّل: bash generate-secret.sh
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SECRET=$(openssl rand -base64 48 | tr -d '=/+' | head -c 48)

echo ""
echo "══════════════════════════════════════════════"
echo "  LiveKit API Credentials"
echo "══════════════════════════════════════════════"
echo ""
echo "  LIVEKIT_API_KEY   =  wathba-key"
echo "  LIVEKIT_API_SECRET=  $SECRET"
echo "  LIVEKIT_URL       =  https://live.wathba.site"
echo ""
echo "══════════════════════════════════════════════"
echo ""
echo "1. ضع LIVEKIT_API_SECRET في livekit/config.yaml"
echo "   (في السطر: wathba-key: YOUR_SECRET)"
echo ""
echo "2. ضع الثلاث قيم كـ Environment Variables"
echo "   في المنصة الرئيسية على Replit"
echo ""
