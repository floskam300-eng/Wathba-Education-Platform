# خطة تحسين منصة وثبة — Optimization Plan

> **تاريخ المراجعة:** يوليو 2026  
> **الحالة:** خطة جاهزة للتنفيذ — لم يُنفَّذ أي تعديل بعد  
> **المنهجية:** مراجعة شاملة للـ Backend + Frontend + Database + Security/Spam

---

## ملخص سريع للنتائج

| المجال | المشاكل الحرجة | المشاكل المتوسطة | ✅ موجود ومظبوط |
|---|---|---|---|
| Backend | 3 | 4 | caching, SSE cleanup, error handling |
| Frontend | 1 (كبيرة جداً) | 4 | tree-shaking, TanStack Query |
| Database | 2 | 3 | parameterized queries, partial indexes |
| Security/Spam | 5 | 3 | login lockout, CORS, Helmet, SQLi |

---

## الأولويات — ترتيب التنفيذ

```
المرحلة 1 → أسرع وأقوى حماية (الأثر الأكبر)
المرحلة 2 → تحسينات Backend والـ DB
المرحلة 3 → Frontend وتجربة المستخدم
المرحلة 4 → تحسينات متقدمة للإنتاج
```

---

## المرحلة الأولى — 🔴 حرج (نفّذ قبل الرفع)

### [S1] إضافة gzip compression للـ API responses
**الملف:** `server/index.js`  
**المشكلة:** مفيش compression middleware خالص. كل response JSON بيتبعت raw — لو عندك 200 طالب بيعملوا requests في نفس الوقت، الـ bandwidth والـ response time بيتضاعفوا بدون لازمة.  
**الحل:** تثبيت `compression` package وإضافته أول middleware في الـ stack.

```js
// قبل أي route
const compression = require('compression');
app.use(compression({ threshold: 1024 })); // compress responses > 1KB
```

**التأثير المتوقع:** تقليل حجم الـ JSON responses بنسبة 60–80%، يعني الصفحات هتفتح أسرع وبandwidth أقل.

---

### [S2] تحديد حجم PostgreSQL Connection Pool
**الملف:** `server/db/connection.js`  
**المشكلة:** الـ `pg.Pool` شغال بالـ default (max: 10 connections). لو فيه 50+ طالب بيعملوا requests في نفس اللحظة، الطلبات الزيادة هتستنى في queue — والـ response time هيطول بشكل ملحوظ.  
**الحل:**

```js
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 25,                    // ارفعه لـ 25 على KVM 2
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,   // اقتل أي query أكتر من 30 ثانية
});
```

**ملاحظة:** على KVM 1 اجعله 15، على KVM 4 اجعله 40.

---

### [S3] Rate Limiting على نقاط الـ Spam الحرجة
**الملف:** `server/routes/payments.js`, `server/routes/exams.js`, `server/routes/recitation.js`  
**المشكلة:** الطالب يقدر يبعت طلبات دفع unlimited بدون أي تأخير، ونفس الكلام لـ retry-request للامتحانات وsubmit الاستذكار.

**الحل — إضافة limiters مخصصة:**

```js
// payments.js - طلب الدفع: 3 مرات كل 10 دقايق لكل طالب
const paymentRequestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => `pay_${req.user?.id}`,
  message: { error: 'كتير أوي، استنى شوية' }
});

// exams.js - retry request: مرة واحدة كل 5 دقايق
const retryRequestLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 1,
  keyGenerator: (req) => `retry_${req.user?.id}_${req.params.id}`,
});

// recitation.js - submit: 5 مرات كل دقيقة
const recitationSubmitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) => `rec_submit_${req.user?.id}`,
});
```

---

### [S4] إصلاح Memory Leak في viewerCache و _captureLog
**الملف:** `server/routes/live.js`, `server/routes/events.js`  
**المشكلة:** `viewerCache` و`_captureLog` بيكبروا بدون أي eviction — يعني السيرفر هيستهلك RAM أكتر وأكتر مع الوقت لحد ما يوصل لحاجة تعبانة.  
**الحل:** إضافة cleanup دوري:

```js
// كل ساعة امسح entries أكبر من 2 ساعة
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [key, entry] of viewerCache.entries()) {
    if (entry.timestamp < cutoff) viewerCache.delete(key);
  }
}, 60 * 60 * 1000);
```

---

### [S5] تحديد حجم لصور الأسئلة (Multer)
**الملف:** `server/routes/recitation.js`, `server/routes/exams.js`  
**المشكلة:** مفيش quota لعدد أو حجم الصور اللي المدرس يرفعها. ممكن حد يرفع آلاف صور كبيرة ويملأ الـ disk.  
**الحل:**

```js
const questionImageStorage = multer({
  limits: {
    fileSize: 5 * 1024 * 1024,  // 5 MB max لكل صورة
    files: 1
  },
  // إضافة فحص magic bytes موجود بالفعل ✅
});
```

وإضافة total count check في الـ route:

```js
// قبل الرفع: فحص إن المدرس معندوش أكتر من 500 صورة
const { rows } = await pool.query(
  'SELECT COUNT(*) FROM questions WHERE teacher_id = $1 AND image_url IS NOT NULL',
  [teacherId]
);
if (parseInt(rows[0].count) >= 500) {
  return res.status(429).json({ error: 'وصلت للحد الأقصى من الصور' });
}
```

---

## المرحلة الثانية — 🟠 مهم (خلال أول أسبوع من الرفع)

### [B1] استبدال SELECT * بأعمدة محددة
**الملف:** `server/routes/exams.js` (lines 585, 1715 وأماكن أخرى)  
**المشكلة:** `SELECT *` بيجيب كل الأعمدة من الجدول حتى اللي مش محتاجها. على جداول كبيرة زي `exam_results` ده بيزود الـ data transfer بين PostgreSQL والـ Node.js.  
**الحل:** استبدل بأعمدة محددة في كل query.

```sql
-- بدل كده:
SELECT * FROM exam_results WHERE exam_id = $1

-- كده:
SELECT id, student_id, score, submitted_at, is_latest FROM exam_results WHERE exam_id = $1
```

**الأولوية:** ابدأ بالـ queries اللي على جداول فيها JSONB كبير (answers, questions_snapshot).

---

### [B2] تشغيل PM2 Cluster Mode على السيرفر
**الملف:** جديد — `ecosystem.config.js` في root  
**المشكلة:** Node.js بيشتغل على single thread واحد بس — يعني لو فيه امتحان كبير وجه requests كتير في نفس الوقت، الـ event loop بيتعبأ والكل حاسس ببطء.  
**الحل:**

```js
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'wathba',
    script: 'server/index.js',
    instances: 'max',        // عدد الـ CPU cores
    exec_mode: 'cluster',
    max_memory_restart: '1G',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
```

**ملاحظة مهمة:** الـ in-memory caching (Maps) مش هيتشارك بين الـ workers. بعد ما يكون عندك أكتر من 2000 طالب نشط، فكّر في Redis للـ shared cache.

---

### [B3] تحسين bcrypt من blocking لـ async صح
**الملف:** `server/routes/auth.js`  
**المشكلة:** bcrypt بـ 10 rounds بطيء by design (علشان الأمان)، لكن لو 20 حد بيعملوا login في نفس الوقت، الـ event loop بيتعبأ.  
**الحل:** التأكد إن كل calls لـ bcrypt هي `bcrypt.compare()` async مش sync، وإضافة `setImmediate` wrapper لو لزم:

```js
// استخدم دايماً النسخة الـ async
const isValid = await bcrypt.compare(password, hashedPassword);
// مش bcrypt.compareSync(...)
```

---

### [B4] تحسين WhatsApp Per-Tenant Rate Limiting
**الملف:** `server/routes/whatsapp.js`  
**المشكلة:** مفيش حد لعدد رسائل WhatsApp اللي المدرس يبعتها في اليوم من خلال الـ API — ممكن حد يطلع request بـ 1000 رسالة فجأة.  
**الحل:** إضافة limiter بـ keyGenerator يعتمد على الـ teacher ID:

```js
const waSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // ساعة
  max: 500,                  // 500 رسالة في الساعة لكل مدرس
  keyGenerator: (req) => `wa_${req.user?.id}`,
});
```

---

### [D1] إضافة Missing Database Indexes
**الملف:** `server/db/migrate.sql` أو ملف جديد `server/db/optimize.sql`  
**المشكلة:** بعض الأعمدة اللي بتتفلتر عليها كتير مش عندها index.

```sql
-- indexes مقترحة بناءً على المراجعة
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_exam_results_student_latest
  ON exam_results(student_id, is_latest) WHERE is_latest = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recitation_sessions_student
  ON recitation_sessions(student_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_student_status
  ON payments(student_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, user_role, is_read) WHERE is_read = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_teacher_active
  ON students(teacher_id, is_suspended, deleted_at) WHERE deleted_at IS NULL;

-- لو فيه JSONB columns بدون GIN index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_exam_results_answers_gin
  ON exam_results USING GIN(answers);
```

**ملاحظة:** استخدم `CONCURRENTLY` علشان ما توقفش الـ production DB أثناء إنشاء الـ index.

---

### [D2] إضافة pagination للـ Dashboard Queries
**الملف:** `server/routes/teachers.js`, `server/routes/assistants.js`  
**المشكلة:** بعض endpoints بتجيب كل الـ students أو analytics بدون LIMIT — لو المدرس عنده 2000 طالب، الـ query ده ممكن يرجع 2000 row كلها.  
**الحل:** إضافة `LIMIT $n OFFSET $m` لكل list query مع الـ pagination params:

```js
const page = Math.max(1, parseInt(req.query.page) || 1);
const limit = Math.min(50, parseInt(req.query.limit) || 20);
const offset = (page - 1) * limit;
// في الـ query: LIMIT $x OFFSET $y
```

---

## المرحلة الثالثة — 🟡 مهم للـ UX (خلال أول شهر)

### [F1] Code Splitting بـ React.lazy() — الأهم في الـ Frontend
**الملف:** `client/src/App.jsx`  
**المشكلة الحرجة:** كل الـ 50+ صفحات (Teacher, Student, Assistant, Admin) بيتحملوا في نفس الـ JavaScript bundle — ده معناه إن الطالب اللي بيفتح المنصة على موبايل هيحمّل كود صفحة المدرس كلها وهو مش محتاجها أبداً. الـ initial bundle ممكن يكون 2-4 MB.

**الحل:**

```jsx
// قبل:
import StudentDashboard from './pages/student/Dashboard';
import TeacherDashboard from './pages/teacher/Dashboard';
// ... 50+ import ثابتة

// بعد:
import { lazy, Suspense } from 'react';
const StudentDashboard = lazy(() => import('./pages/student/Dashboard'));
const TeacherDashboard = lazy(() => import('./pages/teacher/Dashboard'));

// وف App.jsx حوّل الـ Routes بـ Suspense:
<Suspense fallback={<div className="flex items-center justify-center h-screen">
  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
</div>}>
  <Routes>...</Routes>
</Suspense>
```

**التأثير المتوقع:** تقليل الـ initial bundle بنسبة 60–75% — الصفحة الأولى هتفتح بشكل أسرع بكتير خصوصاً على موبايل.

---

### [F2] تحسين Vite Build Config
**الملف:** `client/vite.config.js`  
**المشكلة:** مفيش manual chunks config — كل الـ vendor libraries في bundle واحد.  
**الحل:**

```js
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-ui': ['framer-motion', 'lucide-react'],
          'vendor-charts': ['echarts', 'echarts-for-react'],
          'vendor-pdf': ['jspdf', 'pdfjs-dist'],
          'vendor-livekit': ['livekit-client'],
        }
      }
    },
    chunkSizeWarningLimit: 600,
    sourcemap: false, // production
  }
});
```

---

### [F3] تحسين TanStack Query لكل نوع بيانات
**الملف:** `client/src/main.jsx` وفي الـ hooks  
**المشكلة:** `staleTime: 30000` عام على كل حاجة — بعض البيانات محتاجة تتحدث أسرع (زي الإشعارات)، وبعضها ممكن تفضل cached أطول (زي قائمة الكورسات).

```js
// في main.jsx — defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // 30 ثانية default
      gcTime: 5 * 60_000,     // 5 دقايق في الـ cache
      retry: 1,
      refetchOnWindowFocus: false, // مهم جداً - منع requests زيادة
    }
  }
});

// في كل useQuery حسب نوع البيانات:
// بيانات ثابتة نسبياً (courses, exams list)
useQuery({ ..., staleTime: 5 * 60_000 })  // 5 دقايق

// بيانات realtime (notifications) → استخدم SSE مش polling
useQuery({ ..., staleTime: Infinity, refetchInterval: false })

// leaderboard
useQuery({ ..., staleTime: 60_000 })  // دقيقة
```

---

### [F4] إضافة refetchOnWindowFocus: false بشكل global
**الملف:** `client/src/main.jsx`  
**المشكلة:** بـ default، TanStack Query بيعمل refetch لكل query لما الـ window يرجع active — يعني لما الطالب يروح لـ YouTube ويرجع للمنصة، هتلاقي عشرات requests في نفس اللحظة.  
**الحل:** إضافة `refetchOnWindowFocus: false` في الـ QueryClient defaults (موضح فوق في F3).

---

### [F5] Virtualization للقوائم الطويلة
**الملف:** أي صفحة بتعرض قائمة طلاب أو أسئلة كتيرة  
**المشكلة:** لو المدرس عنده 1000 طالب، الـ DOM هيبني 1000 row في نفس الوقت — ده بيبطأ المتصفح بشكل ملحوظ.  
**الحل:** استخدام `@tanstack/react-virtual` أو `react-window` للقوائم اللي ممكن تتخطى 100 عنصر:

```jsx
import { useVirtualizer } from '@tanstack/react-virtual';

// بدل .map() العادي على قوائم الطلاب الكبيرة
const virtualizer = useVirtualizer({
  count: students.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 60,
});
```

---

## المرحلة الرابعة — 🟢 تحسينات الإنتاج المتقدمة

### [P1] Nginx كـ Reverse Proxy مع Static File Serving
**الملف:** جديد — `/etc/nginx/sites-available/wathba`  
**الهدف:** Nginx أسرع بكتير من Node.js في serve الـ static files (HTML, JS, CSS, صور).

```nginx
server {
    listen 80;
    server_name ~^(?<tenant>.+)\.wathba\.site$;

    # Gzip على مستوى Nginx
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
    gzip_min_length 1000;

    # Cache headers للـ static assets
    location /assets/ {
        root /var/www/wathba/client/dist;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # الـ React app (SPA)
    location / {
        root /var/www/wathba/client/dist;
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }

    # الـ API
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }

    # SSE
    location /api/notifications/stream {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        chunked_transfer_encoding on;
    }

    # Uploads (PDFs, صور)
    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_read_timeout 30s;
    }
}
```

---

### [P2] إضافة Health Check Endpoint
**الملف:** `server/index.js`  
**الهدف:** Nginx أو monitoring tool يقدر يعرف إن السيرفر شغال.

```js
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', uptime: process.uptime() });
  } catch (e) {
    res.status(503).json({ status: 'db_error' });
  }
});
```

---

### [P3] PostgreSQL Settings للإنتاج
**الملف:** `/etc/postgresql/16/main/postgresql.conf`  
**الهدف:** تحسين أداء PostgreSQL على الـ VPS.

```ini
# على KVM 2 (8GB RAM):
shared_buffers = 2GB              # 25% من الـ RAM
effective_cache_size = 6GB        # 75% من الـ RAM
work_mem = 16MB                   # للـ sorting والـ joins
maintenance_work_mem = 256MB      # للـ VACUUM والـ indexes
max_connections = 50              # مش محتاج أكتر
random_page_cost = 1.1            # لو NVMe SSD

# Logging للـ slow queries
log_slow_queries = on
log_min_duration_statement = 1000  # log أي query > 1 ثانية
```

---

### [P4] Log Rotation وMonitoring
**الملف:** جديد — `ecosystem.config.js` + PM2 monitoring  
**الهدف:** منع الـ logs من ملء الـ disk.

```bash
# تثبيت pm2-logrotate
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

---

### [P5] Cloudflare أمام الـ VPS (مجاني)
**الهدف:** طبقة حماية إضافية مجانية.  
**الفوائد:**
- ✅ DDoS protection تلقائي
- ✅ CDN للـ static assets (JS/CSS/صور)
- ✅ SSL/TLS مجاني
- ✅ Bot protection
- ✅ Wildcard subdomain support

**الإعداد:**
1. أضف الدومين في Cloudflare
2. اضبط DNS Wildcard: `* → IP السيرفر` (Proxied 🟠)
3. في SSL/TLS: Full (strict)
4. في Rules: Cache JS/CSS لمدة 1 سنة، مش الـ API

---

## جدول الأولويات الكاملة

| # | الكود | الوصف | الأثر | الصعوبة | المرحلة |
|---|---|---|---|---|---|
| 1 | S1 | gzip compression | 🔴 كبير جداً | سهل (5 دقايق) | 1 |
| 2 | S2 | PostgreSQL pool max | 🔴 كبير | سهل (5 دقايق) | 1 |
| 3 | S3 | Rate limits للـ spam | 🔴 أمان | متوسط | 1 |
| 4 | S4 | Memory leak fix | 🔴 استقرار | سهل | 1 |
| 5 | S5 | Upload size quota | 🟠 أمان | متوسط | 1 |
| 6 | B1 | SELECT * → أعمدة محددة | 🟠 DB | متوسط | 2 |
| 7 | B2 | PM2 Cluster Mode | 🟠 كبير | سهل | 2 |
| 8 | B3 | bcrypt async check | 🟡 متوسط | سهل | 2 |
| 9 | B4 | WhatsApp rate limit | 🟡 أمان | سهل | 2 |
| 10 | D1 | Database indexes | 🟠 DB | متوسط | 2 |
| 11 | D2 | Pagination للـ dashboards | 🟠 DB | متوسط | 2 |
| 12 | **F1** | **React.lazy() code splitting** | 🔴 **Frontend** | **متوسط** | **3** |
| 13 | F2 | Vite manual chunks | 🟠 Bundle | سهل | 3 |
| 14 | F3 | TanStack Query staleTime | 🟡 متوسط | سهل | 3 |
| 15 | F4 | refetchOnWindowFocus: false | 🟡 متوسط | سهل (دقيقة) | 3 |
| 16 | F5 | List virtualization | 🟡 UX | صعب | 3 |
| 17 | P1 | Nginx config | 🟠 إنتاج | متوسط | 4 |
| 18 | P2 | Health check endpoint | 🟡 monitoring | سهل | 4 |
| 19 | P3 | PostgreSQL tuning | 🟠 DB | متوسط | 4 |
| 20 | P4 | Log rotation | 🟡 disk | سهل | 4 |
| 21 | P5 | Cloudflare | 🟠 حماية | سهل | 4 |

---

## ما هو موجود ومظبوط بالفعل ✅

> دي الحاجات اللي مش محتاج تتعب فيها

- ✅ **SQL Injection**: كل الـ queries parameterized — ممتاز
- ✅ **Login Brute Force**: lockout بعد 5 محاولات خاطئة — موجود
- ✅ **CORS**: مظبوط على الـ wildcard domain بشكل صح
- ✅ **Helmet + CSP + HSTS**: شغال في production
- ✅ **In-memory caching**: للـ auth, analytics, permissions, file access — كويس
- ✅ **SSE cleanup**: بيتنضف صح على disconnect
- ✅ **JWT blacklist**: محفوظ في DB
- ✅ **Magic bytes validation**: للـ uploads
- ✅ **Parameterized queries**: في كل الـ codebase
- ✅ **Global error handlers**: unhandledRejection + uncaughtException
- ✅ **Soft deletes + partial indexes**: للـ deleted records

---

## تقدير الوقت الكلي

| المرحلة | الوقت المقدر |
|---|---|
| المرحلة 1 (حرج) | 2–4 ساعات |
| المرحلة 2 (مهم) | 4–8 ساعات |
| المرحلة 3 (Frontend) | 4–6 ساعات |
| المرحلة 4 (إنتاج) | 2–4 ساعات |
| **الإجمالي** | **~12–22 ساعة عمل** |

---

*آخر تحديث: يوليو 2026*
