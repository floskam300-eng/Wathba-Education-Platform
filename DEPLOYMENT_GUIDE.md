# 🚀 دليل الـ Deployment على جهازك الشخصي (Windows)
## الهدف: wathba.site يشتغل من PC بتاعك عبر Cloudflare Tunnel

---

## المتطلبات الأساسية
- Windows 10 / 11
- Domain: wathba.site (من Hostinger)
- Cloudflare account (مجاني)

---

## 📋 المرحلة الأولى: تحضير الجهاز

### 1. تنزيل Node.js
- روح https://nodejs.org
- نزل النسخة **LTS** (مثلاً 20.x)
- شغل الـ installer وخليه يكمل

### 2. تنزيل PostgreSQL
- روح https://www.postgresql.org/download/windows/
- نزل الـ installer
- أثناء التثبيت:
  - اختار password للـ postgres user (احتفظ بيها)
  - الـ port يفضل 5432 (الافتراضي)
- بعد التثبيت، افتح **pgAdmin** أو **psql** وعمل database جديدة:
  ```sql
  CREATE DATABASE wathba;
  ```

### 3. تنزيل Git (لو مش موجود)
- روح https://git-scm.com/download/win
- نزل وثبت بالإعدادات الافتراضية

---

## 📋 المرحلة التانية: تحميل وتشغيل المشروع

### 1. Clone المشروع
افتح **Command Prompt** أو **PowerShell** واكتب:
```cmd
git clone https://github.com/YOUR_USERNAME/wathba.git
cd wathba
```

### 2. تثبيت الـ dependencies
```cmd
npm install
cd client
npm install
cd ..
```

### 3. بناء الـ Frontend
```cmd
cd client
npm run build
cd ..
```
ده هيعمل folder اسمه `client/dist` فيه الـ frontend المبني.

### 4. إعداد ملف الـ Environment
```cmd
copy .env.example .env
notepad .env
```
عبي القيم دي:
```
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/wathba
JWT_SECRET=اكتب هنا اي كلام طويل عشوائي مثلا 50 حرف
WILDCARD_DOMAIN=wathba.site
ALLOWED_ORIGINS=https://wathba.site,https://api.wathba.site
```

### 5. تشغيل السيرفر
```cmd
node server/index.js
```
المفروض تشوف:
```
Database schema initialized
WATHBA Server running on port 3001
```

---

## 📋 المرحلة التالتة: إعداد Cloudflare

### 1. نقل الـ DNS من Hostinger لـ Cloudflare
1. روح https://cloudflare.com وعمل account مجاني
2. اضغط **Add a Site** واكتب `wathba.site`
3. اختار **Free plan**
4. Cloudflare هيمسح الـ DNS records الحاليين ويطلب منك تغير الـ Nameservers
5. روح Hostinger dashboard → Domain → Nameservers
6. غير الـ nameservers للقيم اللي Cloudflare بيطلبها (حاجة زي):
   - `asha.ns.cloudflare.com`
   - `rick.ns.cloudflare.com`
7. استنى من 5 دقايق لـ 24 ساعة لحد ما يتفعل

### 2. تنزيل cloudflared (Tunnel client)
- روح https://github.com/cloudflare/cloudflared/releases/latest
- نزل `cloudflared-windows-amd64.exe`
- حطه في مكان سهل، مثلاً `C:\cloudflared\cloudflared.exe`

### 3. تسجيل الدخول
افتح CMD كـ Administrator في الـ folder بتاع cloudflared:
```cmd
cd C:\cloudflared
cloudflared.exe tunnel login
```
هيفتح المتصفح — سجل دخول بـ Cloudflare account بتاعك واختار `wathba.site`

### 4. إنشاء الـ Tunnel
```cmd
cloudflared.exe tunnel create wathba-tunnel
```
هيطلع رسالة فيها **Tunnel ID** — احتفظ بيه

### 5. إعداد ملف الـ Tunnel
عمل ملف اسمه `C:\cloudflared\config.yml` وحط فيه:
```yaml
tunnel: YOUR_TUNNEL_ID_HERE
credentials-file: C:\Users\YOUR_WINDOWS_USERNAME\.cloudflared\YOUR_TUNNEL_ID.json

ingress:
  # API backend
  - hostname: api.wathba.site
    service: http://localhost:3001

  # Main domain + any subdomain → نفس الـ backend (هو اللي بيخدم الـ frontend)
  - hostname: "*.wathba.site"
    service: http://localhost:3001

  - hostname: wathba.site
    service: http://localhost:3001

  # Catch-all مطلوب
  - service: http_status:404
```

### 6. إضافة DNS Records في Cloudflare
في Cloudflare dashboard → DNS → Add records:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | `wathba.site` | `YOUR_TUNNEL_ID.cfargotunnel.com` | ✅ Proxied |
| CNAME | `api` | `YOUR_TUNNEL_ID.cfargotunnel.com` | ✅ Proxied |
| CNAME | `*` | `YOUR_TUNNEL_ID.cfargotunnel.com` | ✅ Proxied |

> ملاحظة: الـ wildcard `*` بيغطي كل الـ subdomains (mr-ahmed.wathba.site, etc.)

### 7. تشغيل الـ Tunnel
```cmd
cloudflared.exe tunnel --config C:\cloudflared\config.yml run
```

---

## 📋 المرحلة الرابعة: تشغيل كل حاجة تلقائي مع Windows

عشان السيرفر يشتغل تلقائي لما تفتح الجهاز:

### إنشاء Batch Script
عمل ملف اسمه `start-wathba.bat` في folder المشروع:
```batch
@echo off
echo Starting WATHBA Backend...
start "WATHBA Backend" cmd /k "cd /d C:\path\to\wathba && node server/index.js"

timeout /t 3

echo Starting Cloudflare Tunnel...
start "Cloudflare Tunnel" cmd /k "C:\cloudflared\cloudflared.exe tunnel --config C:\cloudflared\config.yml run"

echo WATHBA is running!
echo Backend: http://localhost:3001
echo Public:  https://wathba.site
```

### إضافته لـ Windows Startup (اختياري)
1. اضغط `Win + R` وكتب `shell:startup`
2. حط shortcut للـ `.bat` file هناك

---

## 📋 إضافة مدرس جديد (Subdomain)

لما تضيف مدرس جديد (مثلاً Mr. Ahmed بـ slug `mr-ahmed`):

1. **في المنصة:** أضف المدرس وخلي الـ slug بتاعه `mr-ahmed`
2. **في Cloudflare DNS:** مش محتاج تضيف حاجة — الـ wildcard `*` بيغطي كل الـ subdomains تلقائياً ✅
3. **الطالب يدخل على:** `https://mr-ahmed.wathba.site` — هيشتغل فوراً

---

## ✅ التحقق إن كل حاجة شغالة

بعد ما تشغل كل حاجة:
1. افتح المتصفح وروح `https://wathba.site` — المفروض تشوف الـ landing page
2. روح `https://api.wathba.site/api/public/teachers` — المفروض ترجع JSON
3. لو عندك مدرس slug `admin` جرب `https://admin.wathba.site`

---

## ⚠️ تذكر دايماً

- لما تعدل أي حاجة في الكود → شغل `cd client && npm run build` من جديد
- الـ backend المفروض يكون شغال **قبل** الـ Tunnel
- لو الجهاز أتقفل، الموقع هيوقف — ده طبيعي لحد ما تجيب VPS

---

## 🔜 لما تجيب VPS لاحقاً
كل حاجة هتنقلها هي:
- نفس الكود
- نفس الـ `.env`
- PostgreSQL database (export/import)
- بدل Cloudflare Tunnel هتستخدم Nginx مباشرة
