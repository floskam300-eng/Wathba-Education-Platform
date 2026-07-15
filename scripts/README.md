# Wathba Scripts

## 📁 هيكل المجلد

```
scripts/
├── windows/          ← سكريبتات للـ PC (Windows)
│   ├── start-all.bat     تشغيل السيرفر + Cloudflare Tunnel
│   ├── start-dev.bat     وضع التطوير (backend + frontend hot-reload)
│   ├── start-tunnel.bat  تشغيل Cloudflare Tunnel فقط
│   ├── seed-db.bat       زرع بيانات تجريبية في قاعدة البيانات
│   └── reset-db.bat      مسح قاعدة البيانات (مع الحفاظ على admin)
│
├── vps/              ← سكريبتات للـ VPS Server (Ubuntu + Docker)
│   ├── start.sh          تشغيل جميع الـ containers
│   ├── stop.sh           إيقاف جميع الـ containers
│   ├── restart.sh        إعادة تشغيل جميع الـ containers
│   ├── status.sh         عرض حالة الـ containers + آخر logs
│   ├── logs.sh           متابعة الـ logs مباشرة (live)
│   ├── deploy.sh         سحب آخر تحديث من GitHub وإعادة البناء
│   └── seed-db.sh        زرع بيانات تجريبية داخل Docker
│
└── create-admin.js   ← إنشاء admin جديد (يعمل على PC أو VPS)
```

---

## 🖥️ Windows (PC المحلي)

```bat
scripts\windows\start-all.bat      :: تشغيل المنصة كاملة
scripts\windows\start-dev.bat      :: وضع التطوير
scripts\windows\start-tunnel.bat   :: تشغيل Cloudflare Tunnel فقط
scripts\windows\seed-db.bat        :: بيانات تجريبية
scripts\windows\reset-db.bat       :: مسح البيانات
```

---

## 🐧 VPS Server (Ubuntu)

```bash
bash scripts/vps/start.sh        # تشغيل السيرفر
bash scripts/vps/stop.sh         # إيقاف السيرفر
bash scripts/vps/restart.sh      # إعادة التشغيل
bash scripts/vps/status.sh       # الحالة والـ logs
bash scripts/vps/logs.sh         # logs مباشرة (Ctrl+C للخروج)
bash scripts/vps/logs.sh admin   # logs الـ admin panel
bash scripts/vps/deploy.sh       # تحديث من GitHub
bash scripts/vps/seed-db.sh      # بيانات تجريبية
```

---

## 🔄 workflow التحديث على VPS

```
1. عدّل الكود في Replit
2. push لـ GitHub
3. على الـ VPS:
   bash /opt/wathba/scripts/vps/deploy.sh
```

> ⚠️ **deploy.sh** يسبّب انقطاعًا بسيطًا مدته **2-5 ثواني** أثناء إعادة تشغيل الـ container.

---

## 👤 إنشاء admin جديد

```bash
# على الـ PC
node scripts/create-admin.js <username> <password> [name]

# على الـ VPS (داخل Docker)
sudo docker compose exec app node scripts/create-admin.js <username> <password> [name]
```
