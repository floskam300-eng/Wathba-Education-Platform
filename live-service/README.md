# 🎥 Wathba Live Service — Self-Hosted LiveKit

خدمة البث المباشر المستقلة لمنصة وثبة.  
تعمل على VPS منفصل تماماً عن المنصة الرئيسية.

---

## المتطلبات

- VPS بـ Ubuntu 22.04 (Hostinger / DigitalOcean / Hetzner...)
- RAM: 2GB+ (4GB مستحسن لـ 100+ مشاهد)
- CPU: 2 vCPU+
- Ports مفتوحة: **80, 443, 7880, 7881, 50000-50200/UDP**
- Domain مضبوط: `live.wathba.site` → IP الـ VPS

---

## خطوات التثبيت

### 1. تثبيت Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### 2. رفع الملفات على الـ VPS

```bash
# على جهازك المحلي
scp -r live-service/ root@YOUR_VPS_IP:/opt/wathba-live/
```

أو:
```bash
git clone https://github.com/YOUR_REPO /opt/wathba-live
cd /opt/wathba-live/live-service
```

### 3. توليد الـ API Secret

```bash
cd /opt/wathba-live/live-service
bash generate-secret.sh
```

ستظهر لك:
```
LIVEKIT_API_KEY   =  wathba-key
LIVEKIT_API_SECRET=  xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LIVEKIT_URL       =  https://live.wathba.site
```

### 4. ضع الـ Secret في Config

افتح `livekit/config.yaml` وعدّل السطر ده:

```yaml
keys:
  wathba-key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 5. ضبط الـ Domain

في `Caddyfile`، عدّل `live.wathba.site` بالـ subdomain بتاعك.

تأكد إن DNS record بتاع `live.wathba.site` بيشاور على IP الـ VPS.

### 6. تشغيل الخدمة

```bash
cd /opt/wathba-live/live-service
docker compose up -d
```

تحقق إن كل حاجة شغالة:
```bash
docker compose ps
docker compose logs -f livekit
```

---

## ضبط المنصة الرئيسية (Replit)

بعد ما شغّلت الـ VPS، روح على **Replit Secrets** وضف:

| المتغير | القيمة |
|---------|--------|
| `LIVEKIT_URL` | `https://live.wathba.site` |
| `LIVEKIT_API_KEY` | `wathba-key` |
| `LIVEKIT_API_SECRET` | الـ secret اللي ولّدته |

---

## الـ Ports المطلوبة

| Port | البروتوكول | الغرض |
|------|-----------|-------|
| 80 | TCP | HTTP (Caddy redirect) |
| 443 | TCP | HTTPS (Caddy + LiveKit WS) |
| 7880 | TCP | LiveKit HTTP/WS (داخلي) |
| 7881 | TCP | LiveKit RTC TCP fallback |
| 50000-50200 | UDP | WebRTC Media (مهم جداً) |

> ⚠️ لو الـ UDP ports مش مفتوحة، الصوت والفيديو مش هيشتغلوا!

---

## Firewall (UFW)

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 7881/tcp
ufw allow 50000:50200/udp
ufw enable
```

---

## Systemd Service (تشغيل تلقائي بعد restart)

```bash
cat > /etc/systemd/system/wathba-live.service << 'EOF'
[Unit]
Description=Wathba Live Service
Requires=docker.service
After=docker.service

[Service]
WorkingDirectory=/opt/wathba-live/live-service
ExecStart=/usr/bin/docker compose up
ExecStop=/usr/bin/docker compose down
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl enable wathba-live
systemctl start wathba-live
```

---

## Monitoring

```bash
# شوف الـ logs
docker compose logs -f livekit

# شوف المشاركين الحاليين
docker compose logs livekit | grep "participant"

# Restart
docker compose restart livekit
```

---

## الـ Architecture

```
الطالب / المعلم (Browser)
       │
       ├─► HTTPS API ──► المنصة الرئيسية (Replit)
       │                  └─ يولّد LiveKit JWT Token
       │
       └─► WebRTC ──────► live.wathba.site (VPS)
                           └─ LiveKit Server
                              (فيديو + صوت فقط)
```

كل الـ business logic (Chat, Hand-raise, Permissions, SSE) لا يزال على المنصة الرئيسية.  
الـ VPS بيتعامل مع نقل الـ Media فقط.

---

## لو الـ VPS وقع

- المنصة الرئيسية تفضل شغالة تماماً
- الطلاب يشوفوا رسالة خطأ في نافذة البث بس
- باقي المنصة (كورسات، امتحانات، ...) مش بتتأثر خالص
