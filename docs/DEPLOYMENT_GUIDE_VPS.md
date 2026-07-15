# 🚀 دليل الـ Deployment على VPS — وثبة (Docker + Cloudflare Tunnel)

## المتطلبات
- VPS: Hostinger KVM4 / Ubuntu 22.04 LTS
- Domain: wathba.site (DNS مُدار بـ Cloudflare — موجود بالفعل ✅)
- Cloudflare Tunnel: wathba-tunnel (موجود بالفعل ✅)
- جهازك الشخصي: PostgreSQL مع بيانات المنصة

---

## المرحلة الأولى: إعداد الـ VPS من الصفر

### 1. الدخول على السيرفر
```bash
ssh root@YOUR_VPS_IP
```

### 2. تحديث النظام
```bash
apt update && apt upgrade -y
apt install -y git curl wget unzip ufw
```

### 3. إعداد الـ Firewall
```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```
> ملاحظة: البورت 3001 و3002 **مش محتاج تفتحهم** — Cloudflare Tunnel بيوصل إليهم داخلياً.

### 4. تثبيت Docker
```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# اختبر التثبيت
docker --version
docker compose version
```

---

## المرحلة الثانية: نقل الداتابيز من الـ PC للـ VPS

### على جهازك (Windows) — عمل Backup

افتح **PowerShell** أو **CMD**:
```cmd
pg_dump -U postgres -d wathba -F c -f wathba_backup.dump
```
لو postgres على port غير 5432:
```cmd
pg_dump -U postgres -p 5432 -d wathba -F c -f wathba_backup.dump
```

### نقل الملف للـ VPS
```cmd
scp wathba_backup.dump root@YOUR_VPS_IP:/root/
```

### نقل مجلد الـ Uploads (صور وPDFs)
```cmd
scp -r C:\path\to\wathba\uploads root@YOUR_VPS_IP:/root/uploads_backup
```

### نقل جلسات WhatsApp (لو عندك مدرسين متوصلين)
```cmd
scp -r C:\path\to\wathba\whatsapp-sessions root@YOUR_VPS_IP:/root/wa_backup
```

---

## المرحلة الثالثة: رفع الكود على الـ VPS

### على الـ VPS:
```bash
cd /opt
git clone https://github.com/YOUR_USERNAME/wathba.git
cd wathba
```

### إعداد ملف الـ Environment
```bash
cp .env.production.example .env
nano .env
```

عبي القيم دي:
```env
POSTGRES_DB=wathba
POSTGRES_USER=wathba
POSTGRES_PASSWORD=اكتب_باسورد_قوي_هنا

JWT_SECRET=اكتب_سكريت_طويل_عشوائي_هنا_64_حرف_على_الأقل

WILDCARD_DOMAIN=wathba.site
ALLOWED_ORIGINS=https://wathba.site,https://admin.wathba.site
```

لتوليد JWT_SECRET تلقائياً:
```bash
openssl rand -hex 32
```

---

## المرحلة الرابعة: بناء وتشغيل الـ Docker Containers

### بناء الـ Images
```bash
cd /opt/wathba
docker compose build
```
> أول مرة هتاخد 5-10 دقايق لأنه بيبني الـ React apps

### تشغيل الـ Containers
```bash
docker compose up -d
```

### التحقق إن كل حاجة شغالة
```bash
docker compose ps
```
المفروض يطلع:
```
NAME            STATUS
wathba-app-1    Up (healthy)
wathba-admin-1  Up
wathba-db-1     Up (healthy)
```

### مشاهدة الـ Logs
```bash
# كل الـ containers
docker compose logs -f

# Backend فقط
docker compose logs -f app

# Database فقط
docker compose logs -f db
```

---

## المرحلة الخامسة: استيراد الداتابيز

```bash
# الدخول على الـ PostgreSQL container
docker compose exec db psql -U wathba -d wathba -c "SELECT 1"

# استيراد الـ backup
docker compose exec -T db pg_restore \
  -U wathba -d wathba --clean --if-exists \
  < /root/wathba_backup.dump

echo "✅ Database imported successfully"
```

### نقل ملفات الـ Uploads
```bash
# إيجاد اسم الـ volume
docker volume ls | grep uploads

# نسخ الملفات للـ volume
docker run --rm \
  -v wathba_uploads_data:/dest \
  -v /root/uploads_backup:/src:ro \
  alpine sh -c "cp -r /src/. /dest/"

echo "✅ Uploads copied"
```

### نقل جلسات WhatsApp (اختياري)
```bash
docker run --rm \
  -v wathba_wa_sessions:/dest \
  -v /root/wa_backup:/src:ro \
  alpine sh -c "cp -r /src/. /dest/"

echo "✅ WhatsApp sessions copied"
```

---

## المرحلة السادسة: إعداد Cloudflare Tunnel على الـ VPS

### 1. تنزيل وتثبيت cloudflared
```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb \
  -o cloudflared.deb
dpkg -i cloudflared.deb
cloudflared --version
```

### 2. نسخ credentials الـ Tunnel من جهازك للـ VPS

على جهازك (Windows) — ابحث عن الملف ده:
```
C:\Users\YOUR_USERNAME\.cloudflared\YOUR_TUNNEL_ID.json
```

انسخه للـ VPS:
```cmd
scp C:\Users\YOUR_USERNAME\.cloudflared\YOUR_TUNNEL_ID.json root@YOUR_VPS_IP:/root/
```

على الـ VPS:
```bash
mkdir -p /etc/cloudflared
mv /root/YOUR_TUNNEL_ID.json /etc/cloudflared/
```

### 3. إنشاء ملف إعداد الـ Tunnel
```bash
nano /etc/cloudflared/config.yml
```

الحط الكود ده (غير YOUR_TUNNEL_ID بالـ ID الحقيقي):
```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /etc/cloudflared/YOUR_TUNNEL_ID.json

ingress:
  # لوحة تحكم صاحب المنصة
  - hostname: admin.wathba.site
    service: http://localhost:3002

  # API مباشر (اختياري)
  - hostname: api.wathba.site
    service: http://localhost:3001

  # كل الـ subdomains الخاصة بالمدرسين
  - hostname: "*.wathba.site"
    service: http://localhost:3001

  # الدومين الرئيسي
  - hostname: wathba.site
    service: http://localhost:3001

  # Catch-all مطلوب دايماً
  - service: http_status:404
```

### 4. إضافة admin.wathba.site في Cloudflare DNS

روح Cloudflare Dashboard → DNS → Add record:
| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | `admin` | `YOUR_TUNNEL_ID.cfargotunnel.com` | ✅ Proxied |

> الـ records التانية (`*`, `wathba.site`, `api`) موجودة بالفعل ✅

### 5. تثبيت cloudflared كـ System Service
```bash
cloudflared service install
systemctl enable cloudflared
systemctl start cloudflared
systemctl status cloudflared
```

المفروض يطلع `active (running)` ✅

---

## المرحلة السابعة: التحقق النهائي

```bash
# اختبر الـ Backend مباشرة على السيرفر
curl -s http://localhost:3001/api/public/teachers | head -c 200

# اختبر الـ Admin container
curl -s http://localhost:3002 | grep -c "html"
```

ثم من متصفحك:
| الرابط | المتوقع |
|--------|---------|
| `https://wathba.site` | Landing page المنصة |
| `https://admin.wathba.site` | لوحة تحكم صاحب المنصة |
| `https://YOUR_SLUG.wathba.site` | لوحة تحكم المدرس |

---

## إدارة السيرفر بعد الإعداد

### تحديث الكود (Deploy جديد)
```bash
cd /opt/wathba

# سحب أحدث كود
git pull origin main

# إعادة البناء والتشغيل (بدون توقف الداتابيز)
docker compose build app admin
docker compose up -d --no-deps app admin

echo "✅ Deployed successfully"
```

### إعادة تشغيل سريعة بدون rebuild
```bash
docker compose restart app
```

### مشاهدة الـ Logs في الوقت الحقيقي
```bash
docker compose logs -f app --tail=100
```

### الدخول على الداتابيز مباشرة
```bash
docker compose exec db psql -U wathba -d wathba
```

### Backup يدوي للداتابيز
```bash
docker compose exec db pg_dump -U wathba wathba > \
  /root/backup_$(date +%Y%m%d_%H%M%S).sql
echo "✅ Backup saved"
```

### إيقاف كل حاجة
```bash
docker compose down
```

### إيقاف مع حذف الداتا (⚠️ خطر)
```bash
docker compose down -v  # يحذف الـ volumes — لا تعمله إلا لو عارف إيه بتعمل
```

---

## استكشاف المشاكل (Troubleshooting)

### الموقع مش بيفتح
```bash
# تحقق من الـ containers
docker compose ps

# تحقق من الـ Tunnel
systemctl status cloudflared
journalctl -u cloudflared -n 50

# تحقق من إن البورتات شغالة
ss -tlnp | grep -E '3001|3002'
```

### مشكلة في الداتابيز
```bash
docker compose logs db --tail=50
docker compose exec db psql -U wathba -d wathba -c "\dt"
```

### مشكلة في الـ WhatsApp
```bash
# مشاهدة logs الـ WhatsApp
docker compose logs app | grep -i whatsapp

# مسح session مدرس معين (رقم 1 مثلاً)
docker run --rm -v wathba_wa_sessions:/sessions alpine \
  rm -rf /sessions/teacher_1
docker compose restart app
```

### إعادة بناء كل حاجة من الصفر
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

## ملاحظات مهمة

- **الـ Uploads والـ WhatsApp sessions** محفوظة في Docker Volumes — مش بتتحذف لما تعمل `docker compose down`
- **لما تعدل كود** — لازم تعمل `docker compose build` من جديد
- **الـ Daily Backups** من Hostinger هتعمل backup للـ VPS كله — بس عمل backup يدوي للداتابيز كمان كل أسبوع
- **إذا وقف cloudflared** — الموقع بيوقف. هو configured كـ system service يرجع لوحده تلقائياً

---

## ملف الـ .env على الـ VPS — الموقع
```
/opt/wathba/.env
```
عدّله بـ `nano /opt/wathba/.env` ثم `docker compose up -d` لتطبيق التغييرات.
