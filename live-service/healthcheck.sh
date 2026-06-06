#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LiveKit Health Check — Wathba Live Service
# شغّل: bash healthcheck.sh
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo ""
echo "══════════════════════════════════════════════"
echo "  Wathba LiveKit Health Check"
echo "══════════════════════════════════════════════"
echo ""

# 1. Docker containers
echo "▸ Docker containers:"
docker compose ps
echo ""

# 2. LiveKit HTTP port
echo "▸ LiveKit local port (7880):"
if curl -sf http://localhost:7880 > /dev/null 2>&1; then
  echo "  ✅ LiveKit responding on port 7880"
else
  echo "  ⚠️  LiveKit not responding on 7880 (may be normal — try HTTPS)"
fi
echo ""

# 3. Caddy HTTPS
DOMAIN=$(grep -m1 'live\.' Caddyfile 2>/dev/null | tr -d ' {}' || echo "live.wathba.site")
echo "▸ HTTPS via Caddy ($DOMAIN):"
if curl -sf "https://$DOMAIN" > /dev/null 2>&1; then
  echo "  ✅ HTTPS reachable"
else
  echo "  ❌ HTTPS not reachable — check DNS and Caddy logs"
  echo "     docker compose logs caddy"
fi
echo ""

# 4. UDP ports check
echo "▸ UDP ports (50000-50200) — critical for WebRTC:"
if command -v ss > /dev/null; then
  UDP_COUNT=$(ss -ulnp | grep -c '500[0-9][0-9]' || true)
  if [ "$UDP_COUNT" -gt 0 ]; then
    echo "  ✅ UDP media ports open"
  else
    echo "  ⚠️  UDP ports may not be open — check firewall"
  fi
else
  echo "  ℹ️  'ss' not available — check manually with: ufw status"
fi
echo ""

# 5. Recent logs
echo "▸ Last 10 LiveKit log lines:"
docker compose logs livekit --tail=10 2>/dev/null || echo "  No logs available"
echo ""
echo "══════════════════════════════════════════════"
