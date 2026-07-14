# خطة تطوير Admin Dashboard — منصة وثبة
### `dashboard.wathba.site`

> **الحالة:** خطة جاهزة للتنفيذ — لم يُنفَّذ أي كود بعد  
> **المنهجية:** هذا الملف prompt جاهز يُسلَّم لـ AI آخر لينفذ المهمة كاملة  
> **آخر تحديث:** يوليو 2026

---

## نظرة عامة على الفكرة

نريد بناء **لوحة تحكم خاصة بمالك المنصة** على `dashboard.wathba.site`، مستقلة تماماً عن لوحات المدرسين والطلاب. هذه اللوحة تتيح إدارة كل مدرس (tenant) مشترك في المنصة، من إنشاء حسابه وتخصيصه، إلى متابعة اشتراكاته ومدفوعاته، وتفعيل أو تعطيل الميزات.

---

## القرارات المعمارية الأساسية

### 1. هيكل المشروع

```
/ (جذر المشروع)
├── server/                     ← Backend مشترك (Express) — يُضاف عليه
├── client/                     ← الـ React app الأصلية للمدرسين/الطلاب
├── admin-client/               ← ✨ React app جديدة للـ Admin Dashboard
│   ├── src/
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
```

**لماذا app منفصلة؟**  
لأن `dashboard.wathba.site` جمهوره مختلف تماماً (أنت فقط، وليس المدرسون أو الطلاب)، وله auth مستقل، وبناؤه منفصلاً يعني أن أي تعديل في Admin لا يؤثر على build الـ app الرئيسية، والعكس صحيح.

**الـ Backend مشترك:** لا نحتاج server منفصل — نضيف routes تحت `/api/admin/` في نفس Express server الموجود.

---

### 2. الـ Cloudflare DNS

> **توضيح مهم:** الـ wildcard record `*.wathba.site` في Cloudflare يغطي `dashboard.wathba.site` تلقائياً (لأنه subdomain من مستوى واحد). لا تحتاج إنشاء record منفصل لـ `dashboard`.  
> **لكن** يجب إضافة `dashboard` كـ reserved slug في الـ middleware حتى لا يُعامَل كـ slug مدرس.

---

### 3. الـ Auth للـ Admin

- جدول `platform_admins` منفصل في الـ DB (username, password_hash, name, role)
- JWT منفصل بـ secret مختلف أو claim مختلف `role: platform_admin`
- الأدمنز يُضافون يدوياً في الـ DB (لا واجهة تسجيل)
- عدد الأدمنز: صغير (1–3)، لا يحتاج نظام معقد

---

## التعديلات على الكود الموجود

### أ. `server/middleware/subdomainTenant.js`

أضف `dashboard` لقائمة الـ slugs المحجوزة حتى لا يُعامَل كـ tenant:

```js
// في دالة extractSubdomainSlug، بعد فحص www
const RESERVED_SUBDOMAINS = ['dashboard', 'admin', 'api', 'www', 'mail'];
if (RESERVED_SUBDOMAINS.includes(parts[0])) return null;
```

---

### ب. `server/db/schema.sql` أو `server/db/migrate.sql`

**جداول جديدة:**

```sql
-- ── 1. مديرو المنصة ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_admins (
  id              SERIAL PRIMARY KEY,
  username        VARCHAR(100) UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  name            VARCHAR(200),
  role            VARCHAR(50) DEFAULT 'admin',  -- 'admin' | 'super_admin'
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. باقات الاشتراك (قابلة للتخصيص الكامل) ────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,           -- 'Wathba Start', 'Social Media Package', إلخ
  description     TEXT,
  category        VARCHAR(50) NOT NULL,            -- 'platform' | 'service' | 'social_media'
  max_students    INTEGER,                         -- NULL = غير محدود (للخدمات)
  price           NUMERIC(10,2) NOT NULL,
  first_month_price NUMERIC(10,2),               -- سعر الشهر الأول لو مختلف
  billing_type    VARCHAR(20) NOT NULL,            -- 'monthly' | 'annual' | 'one_time'
  is_active       BOOLEAN DEFAULT true,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. اشتراكات المدرسين ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_subscriptions (
  id              SERIAL PRIMARY KEY,
  teacher_id      INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  plan_id         INTEGER NOT NULL REFERENCES subscription_plans(id),
  billing_type    VARCHAR(20) NOT NULL,            -- قد يختلف عن الـ plan (اتفاق خاص)
  price_override  NUMERIC(10,2),                  -- لو السعر اتفق عليه بشكل مختلف عن الـ plan
  start_date      DATE NOT NULL,
  end_date        DATE,                           -- NULL للـ one_time
  status          VARCHAR(20) DEFAULT 'active',   -- 'active' | 'expired' | 'cancelled'
  notes           TEXT,
  created_by      INTEGER REFERENCES platform_admins(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. سجل المدفوعات ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_payments (
  id              SERIAL PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES teacher_subscriptions(id) ON DELETE CASCADE,
  teacher_id      INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  amount          NUMERIC(10,2) NOT NULL,
  currency        VARCHAR(10) DEFAULT 'EGP',
  paid_at         TIMESTAMPTZ NOT NULL,
  period_start    DATE,
  period_end      DATE,
  payment_method  VARCHAR(100),                   -- 'instapay' | 'vodafone_cash' | 'bank' | إلخ
  notes           TEXT,
  recorded_by     INTEGER REFERENCES platform_admins(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. فريق الدعم على الـ Landing Page ───────────────────────────
CREATE TABLE IF NOT EXISTS teacher_team_members (
  id              SERIAL PRIMARY KEY,
  teacher_id      INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  role_title      VARCHAR(200),                   -- 'مسؤول الدعم الفني' مثلاً
  photo_url       TEXT,
  whatsapp_phone  VARCHAR(30),
  display_order   INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_teacher ON teacher_subscriptions(teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_teacher ON subscription_payments(teacher_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_team_teacher ON teacher_team_members(teacher_id, display_order);
```

**أعمدة جديدة على جدول `teachers`:**

```sql
-- تعليق المدرس من طرف المنصة (مختلف عن suspension الطالب)
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS is_platform_suspended BOOLEAN DEFAULT false;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS platform_suspended_at TIMESTAMPTZ;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS platform_suspended_reason TEXT;

-- Feature flags لكل مدرس
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS features_enabled JSONB DEFAULT '{"live_streaming": true, "stickman_run": true}'::jsonb;

-- بيانات إضافية للبروفايل
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS hero_image_url TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS background_color VARCHAR(20);  -- hex color fallback
```

---

### ج. `server/middleware/auth.js`

أضف دعم role جديد `platform_admin`:

```js
// في دالة requireRole، اعمل platform_admin يعدي على أي role check
// مع JWT منفصل بـ secret خاص بالـ admin
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET + '_admin';
```

---

### د. `server/routes/public.js`

**تعديل endpoint الـ landing page** ليجيب بيانات فريق الدعم:

```js
// في GET /api/public/landing
// أضف JOIN على teacher_team_members
const teamResult = await pool.query(
  'SELECT name, role_title, photo_url, whatsapp_phone FROM teacher_team_members WHERE teacher_id = $1 ORDER BY display_order',
  [teacherId]
);
// أضف team: teamResult.rows في الـ response
```

---

### هـ. حماية API المدرس لما يكون `is_platform_suspended`

في `server/middleware/auth.js`، بعد التحقق من الـ token:

```js
// لو المدرس أو الطالب في tenant مُعلَّق من المنصة
if (req.tenantTeacherId) {
  const { rows } = await pool.query(
    'SELECT is_platform_suspended FROM teachers WHERE id = $1', [req.tenantTeacherId]
  );
  if (rows[0]?.is_platform_suspended) {
    return res.status(403).json({ error: 'هذه المنصة موقوفة مؤقتاً' });
  }
}
```

---

### و. حماية الـ Feature Flags على مستوى الـ API

في الـ routes المتأثرة:

```js
// server/routes/live.js — في أول كل route للـ live streaming
const { rows } = await pool.query(
  "SELECT features_enabled FROM teachers WHERE id = $1", [req.tenantTeacherId]
);
const features = rows[0]?.features_enabled || {};
if (!features.live_streaming) {
  return res.status(403).json({ error: 'خاصية البث المباشر غير مفعلة' });
}

// server/routes/events.js — نفس المنطق للـ Stickman Run
if (!features.stickman_run) {
  return res.status(403).json({ error: 'خاصية الفعاليات غير مفعلة' });
}
```

---

## Backend — Routes الجديدة (`/api/admin/`)

**ملف جديد:** `server/routes/admin.js`

```
Auth:
  POST   /api/admin/auth/login           → login بـ username+password للأدمن
  POST   /api/admin/auth/logout          → logout
  GET    /api/admin/auth/me              → بيانات الأدمن الحالي

Teachers:
  GET    /api/admin/teachers             → قائمة كل المدرسين مع إحصائياتهم
  POST   /api/admin/teachers             → إضافة مدرس جديد
  GET    /api/admin/teachers/:id         → بيانات مدرس + إحصائياته التفصيلية
  PUT    /api/admin/teachers/:id         → تعديل بيانات مدرس
  DELETE /api/admin/teachers/:id         → حذف مدرس (مع كل بياناته)
  POST   /api/admin/teachers/:id/suspend → تعليق/رفع تعليق المدرس
  PUT    /api/admin/teachers/:id/features → تحديث الـ feature flags

Teacher Stats:
  GET    /api/admin/teachers/:id/stats   → عدد الطلاب، حجم الملفات، آخر نشاط، إلخ

Team Members (فريق الدعم):
  GET    /api/admin/teachers/:id/team    → قائمة أعضاء فريق الدعم
  POST   /api/admin/teachers/:id/team    → إضافة عضو
  PUT    /api/admin/teachers/:id/team/:memberId → تعديل عضو
  DELETE /api/admin/teachers/:id/team/:memberId → حذف عضو

Plans (الباقات):
  GET    /api/admin/plans                → كل الباقات
  POST   /api/admin/plans               → إنشاء باقة جديدة
  PUT    /api/admin/plans/:id            → تعديل باقة
  DELETE /api/admin/plans/:id            → حذف باقة (لو مفيش اشتراكات عليها)

Subscriptions (اشتراكات المدرسين):
  GET    /api/admin/subscriptions        → كل الاشتراكات (فلترة: teacher, status, plan)
  POST   /api/admin/subscriptions        → ربط مدرس بباقة
  PUT    /api/admin/subscriptions/:id    → تعديل اشتراك (تمديد، تغيير سعر، إلخ)
  DELETE /api/admin/subscriptions/:id    → إلغاء اشتراك

Payments:
  GET    /api/admin/payments             → كل المدفوعات (فلترة: teacher, date range)
  POST   /api/admin/payments             → تسجيل دفعة جديدة يدوياً
  DELETE /api/admin/payments/:id         → حذف دفعة (تصحيح خطأ)

Platform Stats:
  GET    /api/admin/stats                → إحصائيات المنصة الكلية

File Uploads:
  POST   /api/admin/upload/image         → رفع صورة (لوجو، خلفية، صور الفريق)
                                            Returns: { url: '/uploads/admin/...' }
```

---

## الـ Stats اللي بترجعها `/api/admin/stats`

```json
{
  "teachers": {
    "total": 12,
    "active": 10,
    "suspended": 2
  },
  "students": {
    "total": 3420,
    "active_today": 187
  },
  "sse_connections": 143,
  "subscriptions": {
    "active": 18,
    "expiring_soon": 3,
    "expired": 2
  },
  "payments": {
    "collected_this_month": 45000,
    "pending_renewals": 3
  }
}
```

> **ملاحظة:** إحصائيات CPU/RAM/Disk مش محتاجها هنا — Hostinger بيجيبها في لوحتها تلقائياً. ركّز على المقاييس الخاصة بالتطبيق فقط.

---

## Frontend — Admin Dashboard (`admin-client/`)

### التقنيات

```json
{
  "framework": "React 18 + Vite",
  "styling": "Tailwind CSS (RTL, عربي)",
  "routing": "React Router v6",
  "data": "TanStack Query v5",
  "http": "Axios",
  "image_crop": "react-image-crop",
  "icons": "lucide-react",
  "direction": "RTL (dir='rtl')"
}
```

### هيكل الملفات

```
admin-client/
├── public/
│   └── favicon.ico
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── api/
│   │   └── axios.js             ← Axios instance بـ /api/admin base URL
│   ├── contexts/
│   │   └── AuthContext.jsx      ← Admin auth state
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── AdminLayout.jsx  ← Sidebar + Header
│   │   │   └── Sidebar.jsx
│   │   ├── ImageCropper.jsx     ← react-image-crop wrapper
│   │   ├── StatCard.jsx
│   │   ├── TeacherCard.jsx
│   │   └── ConfirmModal.jsx
│   └── pages/
│       ├── Login.jsx
│       ├── Overview.jsx         ← الصفحة الرئيسية
│       ├── teachers/
│       │   ├── TeachersList.jsx
│       │   ├── TeacherForm.jsx  ← إضافة / تعديل مدرس
│       │   └── TeacherDetail.jsx
│       ├── plans/
│       │   ├── PlansList.jsx
│       │   └── PlanForm.jsx
│       ├── subscriptions/
│       │   └── SubscriptionsList.jsx
│       └── payments/
│           └── PaymentsList.jsx
├── vite.config.js
├── tailwind.config.js
├── index.html
└── package.json
```

---

## تفاصيل كل صفحة

### 1. صفحة Login
- Form بسيط: username + password
- POST `/api/admin/auth/login`
- يحفظ الـ JWT في `localStorage`
- Redirect لـ Overview بعد النجاح
- تصميم مختلف عن صفحة login المدرسين

---

### 2. صفحة Overview (الرئيسية)

**Cards إحصائية:**
- إجمالي المدرسين / النشطين / المُعلَّقين
- إجمالي الطلاب عبر المنصة
- الاشتراكات المنتهية قريباً (خلال 7 أيام)
- المبلغ المحصّل هذا الشهر

**قائمة "تحتاج انتباه":**
- اشتراكات انتهت ولم تُجدَّد
- مدرسون وصلوا لحد الطلاب في باقتهم (تحذير فقط)
- اشتراكات تنتهي خلال أسبوع

---

### 3. صفحة قائمة المدرسين

**جدول يعرض:**
- اسم المدرس + الـ subdomain
- الباقات المشتركة فيها
- عدد الطلاب + الحد الأقصى للباقة
- حالة الحساب (نشط / مُعلَّق)
- الميزات المفعلة (live / stickman run) — toggle مباشر
- أزرار: عرض تفاصيل، تعديل، تعليق/تفعيل، حذف

**فلاتر:**
- بحث بالاسم أو الـ slug
- فلتر: كل / نشط / مُعلَّق

---

### 4. صفحة إضافة / تعديل مدرس

**القسم الأول: بيانات الحساب**
- Username (الـ slug — يُستخدَم كـ subdomain)
- كلمة المرور (عند الإضافة فقط)
- الاسم الكامل
- رقم الهاتف

**القسم الثاني: تخصيص المنصة**
- اسم المنصة (platform_name) — اللي بيظهر للطلاب
- اللوجو: رفع صورة مع **أداة crop** (react-image-crop)
  - crop shape: مربع أو دائري (اختيار الأدمن)
  - resize للأبعاد المناسبة قبل الرفع
- صورة الخلفية/الـ Hero: رفع + crop بنسبة 16:9
- لون الخلفية (hex) — fallback لو ما فيش صورة
- الوصف / Bio
- رقم WhatsApp للتواصل

**القسم الثالث: فريق الدعم (landing page)**
- إضافة أعضاء: اسم + لقب وظيفي + صورة + رقم WhatsApp
- إمكانية ترتيب الأعضاء بالـ drag أو السهام
- حذف أي عضو

**القسم الرابع: الميزات**
- Toggle: Live Streaming (مفعّل / معطّل)
- Toggle: Stickman Run (مفعّل / معطّل)

**عند الحفظ:**
- يُنشئ teacher record في الـ DB
- الـ subdomain يشتغل فوراً (wildcard DNS موجود)
- يُعاد توجيه المدرس لصفحة التفاصيل

---

### 5. صفحة تفاصيل المدرس

**بيانات الحساب** (عرض + زر تعديل)

**إحصائيات سريعة:**
- عدد الطلاب الكلي + الحد في الباقة
- عدد الكورسات / الاختبارات / الاستذكارات
- حجم الملفات المرفوعة (PDFs + صور الأسئلة)
- آخر تسجيل دخول للمدرس

**اشتراكاته:**
- قائمة الباقات المشتركة فيها
- لكل باقة: تاريخ البداية والنهاية، الحالة، المبلغ المدفوع
- زر إضافة اشتراك جديد

**سجل المدفوعات:**
- آخر 10 دفعات مع زر "عرض الكل"

**خيارات التعليق/الحذف:**
- زر تعليق الحساب (مع تأكيد + سبب اختياري)
- زر حذف الحساب (تأكيد مكتوب باسم الـ slug)

---

### 6. صفحة الباقات (Plans)

**جدول الباقات الحالية:**
- الاسم، الفئة، نوع الفوترة، السعر، الحد الأقصى للطلاب، عدد المشتركين فيها، الحالة

**Form إنشاء/تعديل باقة:**
- اسم الباقة (عربي)
- الفئة: `platform` (منصة) / `social_media` (سوشيال) / `service` (خدمة فردية)
- الحد الأقصى للطلاب (فارغ = غير محدود)
- نوع الفوترة: شهري / سنوي / مرة واحدة
- السعر الأساسي
- سعر الشهر الأول (اختياري — مختلف عن الأساسي)
- وصف اختياري
- ترتيب العرض

**الباقات الافتراضية التي تُدخل عند أول تشغيل:**
```
Wathba Start       — platform — monthly — 699 EGP — 100 students — first_month: 1500
Wathba Plus        — platform — monthly — 1300 EGP — 300 students — first_month: 2000
Wathba Pro         — platform — monthly — 2999 EGP — 750 students — first_month: 4000
Wathba Business    — platform — monthly — 5500 EGP — 2000 students — first_month: 7000
Wathba Start (سنوي)   — platform — annual — 5500 EGP — 100 students
Wathba Plus (سنوي)    — platform — annual — 11500 EGP — 300 students
Wathba Pro (سنوي)     — platform — annual — 25999 EGP — 750 students
Wathba Business (سنوي) — platform — annual — 49000 EGP — 2000 students
إدارة السوشيال ميديا   — social_media — monthly — 5000 EGP — unlimited
تصميم (بوست)          — service — one_time — 150 EGP — unlimited
فيديو                 — service — one_time — 170 EGP — unlimited
ريل (Reel)            — service — one_time — 300 EGP — unlimited
```

---

### 7. صفحة الاشتراكات

**جدول يعرض:**
- اسم المدرس + اسم الباقة + الفئة
- نوع الفوترة + السعر (الفعلي، قد يختلف عن الـ plan)
- تاريخ البداية + النهاية
- الوقت المتبقي (مثل: "12 يوم متبقي")
- الحالة: نشط / منتهي / ملغي
- ملاحظات

**فلاتر:**
- بحث بالمدرس
- فلتر الحالة: كل / نشط / منتهي قريباً / منتهي
- فلتر الفئة: منصة / سوشيال / خدمة

**Form إضافة اشتراك:**
- اختر المدرس (dropdown)
- اختر الباقة
- نوع الفوترة (يجيب الـ default من الباقة ويقدر يغيره)
- السعر (يجيب الـ default ويقدر يغيره للاتفاقيات الخاصة)
- تاريخ البداية
- تاريخ النهاية (يُحسب تلقائياً، قابل للتعديل)
- ملاحظات

---

### 8. صفحة المدفوعات

**إحصائيات أعلى الصفحة:**
- إجمالي المحصّل هذا الشهر
- إجمالي المحصّل هذا العام
- المدفوعات المتوقعة خلال 30 يوم

**جدول المدفوعات:**
- اسم المدرس، الباقة، المبلغ، الفترة المدفوع عنها، طريقة الدفع، التاريخ، ملاحظات
- زر حذف (لتصحيح الأخطاء)

**Form تسجيل دفعة:**
- اختر المدرس
- اختر الاشتراك (من اشتراكاته النشطة)
- المبلغ
- تاريخ الدفع
- طريقة الدفع (instapay / vodafone cash / bank / cash / other)
- الفترة المدفوع عنها (from → to)
- ملاحظات

---

## Image Cropper — التفاصيل التقنية

**المكتبة:** `react-image-crop`

**تدفق العمل:**
1. المستخدم يختار صورة من جهازه
2. تظهر أداة الـ crop في modal
3. يختار النسبة: مربع (1:1) للوجو، أو 16:9 للخلفية
4. بعد التأكيد، يتم:
   - تحويل الـ crop لـ canvas
   - ضغط الصورة (quality: 0.85, max: 1200px)
   - رفعها لـ `/api/admin/upload/image`
   - الرابط المُرجَع يُستخدَم في الـ form

```jsx
// مثال استخدام في TeacherForm.jsx
<ImageCropper
  aspect={1}           // 1:1 للوجو
  onComplete={(url) => setLogoUrl(url)}
  label="رفع اللوجو"
  currentImage={logoUrl}
/>
```

---

## نقاط أمان مهمة

| النقطة | التفاصيل |
|---|---|
| JWT منفصل | استخدم `ADMIN_JWT_SECRET` منفصل في `.env` |
| Rate limiting | حد `loginLimiter` على `/api/admin/auth/login` (5 محاولات/15 دقيقة) |
| CORS | أضف `https://dashboard.wathba.site` لـ `ALLOWED_ORIGINS` |
| Middleware | كل routes في `/api/admin/` محمية بـ `requireAdminAuth` middleware |
| لا self-registration | مفيش endpoint لإنشاء أدمن — يُضاف يدوياً في الـ DB |
| Reserved slug | `dashboard` محجوز في `subdomainTenant.js` |

---

## `.env` — المتغيرات الجديدة

```env
# Admin Dashboard
ADMIN_JWT_SECRET=long-random-secret-different-from-jwt-secret
ALLOWED_ORIGINS=https://wathba.site,https://dashboard.wathba.site,...
```

---

## ترتيب التنفيذ المقترح

```
الخطوة 1 → DB migrations (الجداول الجديدة + الأعمدة الجديدة)
الخطوة 2 → تعديل subdomainTenant.js (reserved slugs)
الخطوة 3 → إنشاء admin.js route + auth middleware للأدمن
الخطوة 4 → باقي الـ API routes (teachers, plans, subscriptions, payments, stats)
الخطوة 5 → تعديل routes الموجودة (live.js, events.js) لفحص الـ feature flags
الخطوة 6 → إنشاء admin-client/ (Vite + Tailwind setup)
الخطوة 7 → صفحة Login
الخطوة 8 → صفحة Overview
الخطوة 9 → صفحة Teachers (قائمة + إضافة + تعديل + تفاصيل)
الخطوة 10 → ImageCropper component
الخطوة 11 → صفحة Plans
الخطوة 12 → صفحة Subscriptions
الخطوة 13 → صفحة Payments
الخطوة 14 → Nginx config لـ dashboard.wathba.site (serve الـ admin build)
الخطوة 15 → إدخال الباقات الافتراضية في الـ DB
الخطوة 16 → إنشاء أول admin account في الـ DB يدوياً
```

---

## Nginx — إعداد إضافي للـ Dashboard

```nginx
# في ملف الـ Nginx config على الـ VPS
server {
    listen 80;
    server_name dashboard.wathba.site;

    # Serve الـ Admin React app
    location / {
        root /var/www/wathba/admin-client/dist;
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }

    # ودّع الـ API requests للـ Express
    location /api/admin/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
    }
}
```

---

## إنشاء أول Admin يدوياً في الـ DB

```sql
-- بعد ما المنصة تشتغل، اتصل بالـ DB وشغّل الأمر ده
INSERT INTO platform_admins (username, password_hash, name, role)
VALUES (
  'your_username',
  -- اعمل hash بـ bcryptjs rounds=10 لكلمة المرور بتاعتك
  '$2b$10$...',
  'اسمك',
  'super_admin'
);
```

أو اعمل script بسيط:
```js
// scripts/create-admin.js
const bcrypt = require('bcryptjs');
const pool = require('../server/db/connection');

async function main() {
  const hash = await bcrypt.hash('كلمة_المرور_هنا', 10);
  await pool.query(
    'INSERT INTO platform_admins (username, password_hash, name) VALUES ($1, $2, $3)',
    ['your_username', hash, 'اسمك']
  );
  console.log('✅ Admin created');
  process.exit(0);
}
main();
```

---

*آخر تحديث: يوليو 2026*
