# خطة تحسين الأداء الشاملة — منصة وثبة (WATHBA)
### الهدف: أعلى استفادة من Hostinger VPS **KVM 4** (4 vCPU / 16GB RAM / 200GB NVMe) + كود Clean & Optimized

> تاريخ التحليل: 2026-07-15
> نطاق التحليل: كامل الـ backend (`server/`)، الـ frontend (`client/`)، الـ schema، وبيئة الـ deployment الحالية (Docker + Cloudflare Tunnel، راجع `docs/DEPLOYMENT_GUIDE_VPS.md`).

---

## 0) ملخص تنفيذي

المنصة مبنية بشكل سليم معماريًا (soft-deletes، rate limiting، caching جزئي، migrations، تدقيقات أمان سابقة موثقة في `.agents/memory/`)، لكنها حاليًا:
- تعمل بـ **Node process واحد فقط** على سيرفر بـ 4 أنوية — أي 3 أنوية معطّلة تمامًا وقت التشغيل الطبيعي.
- تعتمد على **state داخل الذاكرة (in-memory Maps)** في أكثر من مكان حرج (SSE viewers، WhatsApp sessions، rate-limit counters، analytics/permissions cache) — وهذا **يمنع** التوسّع لأكثر من process واحد بدون إعادة هيكلة.
- فيها استعلامات DB غير محسّنة (N+1، `SELECT *`، استعلامات بلا `LIMIT`) على جداول متنامية.
- الـ frontend يحمّل الكل في bundle واحد (لا `React.lazy`)، وفيه polling بفواصل قصيرة (5–30 ثانية) بدل الاعتماد الكامل على SSE الموجود فعليًا.
- لا يوجد ضبط لـ PostgreSQL يستفيد من الـ 16GB RAM المتاحة (still على القيم الافتراضية لـ `postgres:16-alpine`).

الخطة أدناه مقسّمة لمراحل بالأولوية، كل بند فيه: المكان بالكود، المشكلة، والحل المحدد.

---

## 1) قيود معمارية يجب معرفتها قبل أي تغيير (اقرأها أولاً)

هذه نقاط **تمنع** حلول سطحية زي "شغّل PM2 cluster وخلص" بدون تعديل مرافق:

| المكوّن | الموقع | القيد |
|---|---|---|
| SSE / live-stream viewers | `server/index.js` (SSE clients)، `server/routes/live.js` (`viewerCache`, `leaveTicketMap`, `chatRateMap`, `tokenRateMap`, `handRateMap`) | كل هذا `Map()` محلي داخل الـ process. مع أكثر من instance، الطالب المتصل بـ instance A لن يستقبل event لو الحدث حصل على instance B. |
| WhatsApp (Baileys) | `server/lib/whatsapp.js` (`connections` Map) + ملفات session في `whatsapp-sessions/` | جلسة WhatsApp per-teacher **stateful** ومربوطة بملفات على القرص وباتصال socket مفتوح — **لا يجوز** تشغيلها على أكثر من process/instance في نفس الوقت (سيحصل تعارض في الجلسة أو قطع اتصال). |
| Analytics / Permissions cache | `server/lib/analyticsCache.js`, `server/lib/permissionsCache.js` | Cache محلي بالذاكرة — يعمل صح مع process واحد فقط؛ مع أكثر من process يصبح غير متسق (كل process له نسخة كاش مختلفة). |
| File-access cache | `server/index.js:119` (`_fileAccessCache`) | نفس المشكلة — TTL cache محلي. |

**القرار المعماري الموصى به لـ KVM4:**
- **لا** تُشغّل عدة نسخ Node عشوائيًا. الاستراتيجية الصحيحة للاستفادة من 4 الأنوية بدون كسر الحالة المشتركة:
  1. **قصير المدى (لا تغيير هيكلي):** عملية Node واحدة، لكن بضبط event-loop نظيف (إزالة أي كود متزامن/blocking) + Postgres مضبوط جيدًا يستخدم باقي الأنوية والـ RAM لتنفيذ الاستعلامات بالتوازي. هذا يعطي أغلب الفايدة بأقل خطر.
  2. **متوسط المدى (اختياري، فيه هيكلة):** فصل عملية WhatsApp (Baileys) في service منفصل (Node process ثاني ثابت العدد = 1)، وتشغيل باقي الـ API عبر PM2 **cluster mode** (2–3 workers) بعد نقل الحالة المشتركة (SSE viewers، rate-limit counters، الكاش) إلى **Redis** بدل `Map()` المحلي. لا تفعل هذا قبل الخطوة السابقة ولا بدون Redis — التوسّع بدون نقل الحالة سيُنتج أخطاء تسجيل دخول للبث/الشات بشكل متقطع يصعب تتبعه.

---

## 2) أخطاء وقضايا أداء في الـ Backend

### 2.1 حرجة (Critical)

| # | الموقع | المشكلة | الحل |
|---|---|---|---|
| B1 | `server/db/connection.js` (pool config) | حجم الـ pool الافتراضي (10) منخفض جدًا مقارنة بـ 4 vCPU/16GB و`statement_timeout`/`query_timeout` = 30s قد يخنق طلبات ثقيلة زي تصدير CSV | رفع `max` إلى ~20 (صيغة تقريبية: `عدد الأنوية × 2` إلى `× 4` كبداية، مع قياس فعلي بعدها)، وإضافة `idleTimeoutMillis`, `connectionTimeoutMillis` صريحة، وفصل timeout الاستعلامات الثقيلة (تصدير، تقارير) عن الافتراضي |
| B2 | `server/index.js` (تشغيل عام) | عملية Node واحدة على 4 أنوية — 75% من الـ CPU غير مستخدم وقت الحمل العادي | تطبيق القرار المعماري في القسم (1) — الأولوية للضبط الرأسي (vertical) قبل الأفقي (horizontal) |
| B3 | `server/routes/teachers.js:843-1064` (bulk import/sync) | حلقات `for` بها `await pool.query(...)` لكل طالب (N+1) أثناء الاستيراد الجماعي — استيراد 500 طالب = 500+ رحلة DB متتابعة | تحويلها لـ **batched INSERT** (`INSERT ... VALUES ($1,$2),($3,$4)...` أو `unnest()`) داخل transaction واحدة، أو استخدام `pg-promise` batch helpers |
| B4 | `server/index.js:643-646` (migration loop عند الإقلاع) | حلقة migration تمشي على كل الطلاب بـ query منفصل لكل واحد وقت startup | تحويلها لاستعلام UPDATE واحد بشرط WHERE بدل حلقة، أو تشغيلها كـ one-off script بدل تنفيذها في كل إقلاع |
| B5 | `server/routes/whatsapp.js:227` | حلقة إرسال رسائل جماعية (broadcast) تنتظر `wa.sendMessage` لكل مستلم بالتتابع — بطء شديد مع أعداد كبيرة، وخطر حظر الرقم من واتساب لو السرعة غير محسوبة | إضافة **rate-limited queue** (delay عشوائي بين كل رسالة، batch صغير + توقف، تسجيل تقدم) بدل حلقة `await` مباشرة؛ استخدام مكتبة queue خفيفة (`p-queue`) بدل حلقة يدوية |

### 2.2 عالية (High)

| # | الموقع | المشكلة | الحل |
|---|---|---|---|
| B6 | `server/routes/notifications.js:179` | `SELECT *` بلا `LIMIT` على `notification_log` — الجدول سريع النمو | تحديد الأعمدة المطلوبة فقط + `LIMIT`/`pagination` (نفس نموذج `activityLogs.js` الموجود) |
| B7 | `server/routes/students.js:942` | سحب كامل سجل تقدم الفيديو للطالب بلا `LIMIT` | Pagination أو تحديد بحد أقصى (آخر N سجل) |
| B8 | `server/routes/teachers.js:716-727` | سحب `payments` + `enrollment` + `video_progress` لكل الطلاب تحت المعلم دفعة واحدة بلا حد — خطر استهلاك ذاكرة مع عدد طلاب كبير | Pagination على مستوى الطالب، أو تجميع (aggregate) في SQL بدل سحب كل الصفوف للتجميع في JS |
| B9 | `server/routes/exams.js:585,1377`, `server/routes/recitations.js:1094,1239` | `SELECT *` على `questions`/`recitation_sessions` يسحب أعمدة نصية/صور ثقيلة غير مطلوبة في كل السياقات | تحديد الأعمدة صريحًا في كل استعلام حسب الاستخدام الفعلي |
| B10 | `server/routes/recitations.js:378-380` | قراءة ملف بالتزامن (`fs.openSync/readSync/closeSync`) للتحقق من magic bytes **داخل مسار الطلب** — يوقف event loop لحظيًا لكل رفع | تحويلها لنسخة async (`fs.promises` أو stream-based magic-byte check) |
| B11 | `server/lib/analyticsCache.js` / لوحات المعلم | لا يوجد كاش لـ leaderboard والتحليلات على صفحات لوحة التحكم رغم وجود بنية تحتية للكاش أصلًا (`analyticsCache.js`) — كل تحميل صفحة = استعلامات تجميع (`COUNT`, `SUM`, `GROUP BY`) طازجة | تفعيل/توسيع استخدام `analyticsCache` على الـ endpoints الأكثر طلبًا (leaderboard, dashboard stats) بـ TTL قصير (30–60 ثانية) — التغيير بسيط ومكسبه كبير لأنه أكثر مسار يتكرر ضغطه |

### 2.3 متوسطة (Medium)

| # | الموقع | المشكلة | الحل |
|---|---|---|---|
| B12 | `server/index.js` (لوجات متعددة، مثل الأسطر حول 509, 513, 606-649) | حجم `console.log` كبير في مسارات ساخنة وعند كل إقلاع/migration | استبدال بمكتبة logging خفيفة (`pino`) بمستويات (`debug`/`info`/`warn`) تُضبط بمتغيّر بيئة، وتعطيل مستوى `debug` في production |
| B13 | `live_streams(status)` | فلترة متكررة بلا index مخصص (`live.js:1074, 1351`) | إضافة `CREATE INDEX idx_live_streams_status ON live_streams(status);` |
| B14 | `live_chat_messages` | ترتيب بـ `sent_at ASC` بدون composite index مع `stream_id` (`live.js:1320`) | `CREATE INDEX idx_live_chat_stream_sent ON live_chat_messages(stream_id, sent_at);` |
| B15 | لا يوجد retention/archival لـ `notification_log`, `exam_results`, `recitation_results` | نمو غير محدود لهذه الجداول (فقط `activity_logs` له تنظيف حاليًا في `activityLogs.js:94`) | إضافة scheduler مشابه (موجود نموذجه أصلًا في `server/index.js` لبقية الـ schedulers) لأرشفة/حذف السجلات الأقدم من فترة معقولة (مثلاً نقل النتائج القديمة لجدول `_archive` بدل الحذف، حفاظًا على تاريخ الطالب) |
| B16 | `students.points` (تحديث يدوي في أكثر من مكان، مثل `live.js:1255`) | لا يوجد قيد DB يربط `points` بمجموع مصادرها — خطر "drift" مع الوقت | إضافة job دوري (weekly) يعيد حساب/يتحقق من التطابق، أو نقل المنطق لدالة DB واحدة تُستخدم من كل نقاط المنح بدل تكرار المنطق في كل route |

---

## 3) قاعدة البيانات (PostgreSQL) — استفادة من 16GB RAM

الصورة الحالية: `postgres:16-alpine` بالقيم الافتراضية (مبنية لأجهزة صغيرة جدًا، غالبًا `shared_buffers=128MB`). هذا **أكبر فرصة أداء غير مستغلة** على KVM4.

أضف ملف `postgres.conf` مخصص ومونته في `docker-compose.yml` (خدمة `db`) بقيم مبدئية معقولة لـ 16GB RAM مخصصة جزئيًا للـ DB (نفترض ~4GB للـ Postgres لأن الـ 16GB مشتركة مع Node + الحاويات الأخرى):

```conf
# postgres.conf — قيم مبدئية لـ VPS بـ 16GB RAM (نصيب DB ~4GB)
shared_buffers = 1GB              # ~25% من نصيب DB
effective_cache_size = 3GB        # ~75% من نصيب DB
work_mem = 16MB                   # لكل عملية sort/hash — احذر الرفع الزائد مع تعدد الاتصالات
maintenance_work_mem = 256MB
max_connections = 60              # يتماشى مع pool الجديد (20) + هامش أدوات إدارية
random_page_cost = 1.1            # القرص NVMe سريع، خليه قريب من SSD/NVMe لا HDD
effective_io_concurrency = 200
checkpoint_completion_target = 0.9
wal_buffers = 16MB
```

**تعديل `docker-compose.yml`:**
```yaml
  db:
    image: postgres:16-alpine
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./postgres.conf:/etc/postgresql/postgresql.conf
    command: ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
```

بعد التطبيق، قِس الأداء بـ `EXPLAIN ANALYZE` على أثقل 5 استعلامات (لوحة المعلم، leaderboard، تقارير) وضبط `work_mem`/`shared_buffers` حسب النتائج الفعلية بدل تركها نظرية.

### فهارس مطلوبة (تُضاف في `server/db/schema.sql` كملحق migration، لا تُعدَّل الجداول الأساسية القديمة مباشرة):
```sql
CREATE INDEX IF NOT EXISTS idx_live_streams_status ON live_streams(status);
CREATE INDEX IF NOT EXISTS idx_live_chat_stream_sent ON live_chat_messages(stream_id, sent_at);
```

---

## 4) الـ Frontend (React + Vite)

| # | الملف | المشكلة | الحل |
|---|---|---|---|
| F1 | `client/src/App.jsx` | كل الصفحات (40+) مستوردة بشكل static — bundle واحد ضخم | تحويل كل صفحة route لـ `React.lazy(() => import('./pages/...'))` + `<Suspense fallback={...}>` حول الـ Router. هذا أعلى أثر أداء ممكن على الواجهة بأقل مجهود |
| F2 | `client/vite.config.js` | لا `manualChunks` — مكتبات ثقيلة (`echarts`, `firebase`, `pdfjs-dist`, `livekit-client`) تدخل ضمن كل الصفحات | إضافة `build.rollupOptions.output.manualChunks` تفصل: `vendor-echarts`, `vendor-firebase`, `vendor-pdf`, `vendor-livekit` — كل واحدة تُحمّل فقط مع الصفحة التي تحتاجها |
| F3 | `xlsx`, `jspdf` (استخدام في `client/src/lib/pdfReport.js` وغيره) | مستوردة بشكل ثابت حتى لو المستخدم لم يفتح شاشة التصدير أبدًا | تحويلها لـ dynamic import (`const { default: jsPDF } = await import('jspdf')`) وقت الحاجة فقط (عند الضغط على "تصدير") |
| F4 | صور `<img>` في كل الصفحات (لا `loading="lazy"` باستثناء prop منفصل بنفس الاسم في `WhatsAppTab.jsx`) | كل الصور تُحمّل فورًا حتى لو خارج الشاشة | إضافة `loading="lazy"` + `decoding="async"` على كل صور المحتوى غير الحرجة (شعارات صغيرة/أفاتار تبقى عادية) |
| F5 | React Query — `staleTime: 0` في `Payments.jsx`, `Courses.jsx` وتباين كبير في باقي الصفحات | إعادة جلب عدوانية عند كل تركيز نافذة | توحيد `staleTime` الافتراضي (مثلاً 30–60 ثانية) في `QueryClient` المركزي، مع استثناءات صريحة فقط للشاشات الحساسة (المدفوعات المباشرة وقت المراجعة) |
| F6 | Polling بفواصل قصيرة: `Students.jsx` (30-60s)، `Courses.jsx` (20-30s)، `WhatsAppTab.jsx` (5s) | حمل متكرر على السيرفر بلا داعٍ رغم وجود بنية SSE فعلية (`useSSE.js`) | استبدال الـ polling القصير (وخصوصًا 5 ثانية) بالاعتماد على event عبر SSE الموجود، والاحتفاظ بـ polling طويل (60s+) فقط كـ fallback احتياطي |
| F7 | غياب `React.memo`/`useCallback`/`useMemo` في قوائم كبيرة (طلاب، نتائج، سجل نشاط) | إعادة render غير ضرورية لعناصر القوائم الطويلة | تطبيق `React.memo` على مكوّنات الصفوف (`StudentRow`, `LogRow`, ...) + `useCallback` للـ handlers المُمرَّرة كـ props لهذه الصفوف |

---

## 5) البنية التحتية والنشر (VPS / Docker)

الوضع الحالي موصوف في `docs/DEPLOYMENT_GUIDE_VPS.md`: Docker Compose (app + db + admin) خلف **Cloudflare Tunnel** (فلا حاجة لـ nginx/SSL محلي — الـ Tunnel يتولى TLS والتوجيه من الإنترنت للخادم).

| # | البند | الحالة | الحل |
|---|---|---|---|
| I1 | Gzip/Brotli compression | غير مفعّل على مستوى Express (لا `compression` middleware) | إضافة `app.use(compression())` في `server/index.js` قبل الـ routes — تأثير فوري على حجم الردود (JSON APIs + أي static لم يخدمه Cloudflare cache) |
| I2 | استغلال الأنوية | Node process واحد فقط | تطبيق التوصية المعمارية في القسم (1) — أولوية لضبط Postgres والاستعلامات أولًا، ثم تقييم PM2/فصل خدمات لاحقًا |
| I3 | Health check | لا يوجد `/health` مخصص في `server/index.js` — فقط `pg_isready` على مستوى Compose | إضافة `GET /health` يرجع حالة DB (`SELECT 1`) وحالة WhatsApp connections، ليُستخدم مع Uptime monitoring خارجي |
| I4 | Logging / rotation | `console.log` مباشر بلا rotation | التحويل لـ `pino` (أو `winston`) + `docker-compose.yml`: `logging: { driver: "json-file", options: { max-size: "10m", max-file: "3" } }` لكل خدمة، لمنع امتلاء القرص بمرور الوقت |
| I5 | نسخ احتياطي | لا استراتيجية backup موثقة لـ Postgres أو `/uploads` | إضافة سكريبت cron يومي: `pg_dump` مضغوط + `rsync`/`tar` لمجلد `uploads_data` إلى تخزين خارجي (أو حساب S3-compatible)، مع الاحتفاظ بآخر 7-14 نسخة |
| I6 | ضبط Postgres للـ RAM | القيم الافتراضية لـ `postgres:16-alpine` (مبنية لأجهزة صغيرة) | انظر القسم (3) أعلاه |
| I7 | مراقبة الموارد | لا أداة مراقبة CPU/RAM/Disk للـ VPS | تركيب أداة خفيفة (`netdata` أو `docker stats` + تنبيه بسيط عبر cron+webhook) لرصد استهلاك الموارد بعد كل تغيير في هذه الخطة، للتحقق الفعلي من الأثر |

---

## 6) خارطة التنفيذ بالأولوية (Roadmap)

### المرحلة 1 — إصلاحات سريعة منخفضة الخطر (أسبوع 1)
- [ ] B1: رفع pool size + timeouts منفصلة
- [ ] B6, B7, B8, B9: تحديد أعمدة الاستعلامات + إضافة LIMIT/pagination
- [ ] B10: تحويل magic-byte check لـ async
- [ ] B13, B14: إضافة الفهارس الناقصة
- [ ] I1: تفعيل `compression` middleware
- [ ] F1: `React.lazy` على كل الصفحات (أعلى أثر ممكن بأقل كود)
- [ ] F4: `loading="lazy"` على الصور
- [ ] F5: توحيد `staleTime`

### المرحلة 2 — أداء الخادم والتخزين (أسبوع 2)
- [ ] B3, B4, B5: تحويل حلقات N+1 لـ batch operations / queue
- [ ] B11: تفعيل `analyticsCache` على لوحات المعلم/leaderboard
- [ ] القسم (3): ضبط `postgres.conf` كامل + قياس بـ `EXPLAIN ANALYZE`
- [ ] F2, F3: manualChunks + dynamic imports للمكتبات الثقيلة
- [ ] F6: استبدال polling القصير بـ SSE

### المرحلة 3 — بنية تحتية وعمليات (أسبوع 3)
- [ ] I3: endpoint صحة `/health`
- [ ] I4: تحويل logging لـ `pino` + log rotation في Compose
- [ ] I5: سكريبت backup تلقائي (DB + uploads)
- [ ] I7: مراقبة موارد VPS
- [ ] B12: تقليل console.log في المسارات الساخنة

### المرحلة 4 — توسّع أفقي (اختياري، لاحقًا فقط إذا الحمل يتطلبه)
- [ ] نقل الحالة المشتركة (SSE viewers، rate-limit counters، caches) إلى Redis
- [ ] فصل خدمة WhatsApp (Baileys) في process/container منفصل بعدد ثابت = 1
- [ ] تشغيل باقي الـ API بـ PM2 cluster mode (2-3 workers) بعد التأكد من نقل كل الحالة المحلية

> **لا تبدأ المرحلة 4 قبل قياس فعلي يوضح أن CPU الخادم أصبح هو العنق الزجاجة بعد تطبيق المراحل 1-3.** في أغلب حالات هذا النوع من التطبيقات (I/O-bound، أغلب الوقت بانتظار DB/الشبكة)، ضبط DB + الاستعلامات + الـ frontend يغطي الحمل المتوقع على KVM4 بدون الحاجة لتعقيد التوسّع الأفقي.

---

## 7) طريقة التحقق من الأثر بعد كل مرحلة

- **قبل/بعد كل مرحلة:** قياس زمن استجابة أهم 5 مسارات (`/api/students`, `/api/teachers/dashboard-stats`, `/api/exams`, `/api/activity-logs`, صفحة تسجيل الدخول) بأداة بسيطة (`autocannon` أو `k6`) بحمل ثابت (مثلاً 50 مستخدم متزامن لمدة 30 ثانية).
- **حجم الـ bundle:** `npm run build` في `client/` وفحص حجم `dist/` قبل وبعد المرحلة 1 (يجب أن ينخفض حجم الـ chunk الأولي بشكل ملحوظ بعد `React.lazy` + `manualChunks`).
- **استهلاك DB:** `EXPLAIN ANALYZE` على الاستعلامات المذكورة في القسم (2) و(3) قبل وبعد إضافة الفهارس/تحديد الأعمدة.
- **استهلاك الموارد:** `docker stats` قبل وبعد كل مرحلة لمقارنة استخدام CPU/RAM الفعلي على الـ VPS.

---

## 8) ملاحظة على النطاق

هذه الخطة تغطي الأداء والبنية التحتية فقط. الأخطاء الوظيفية/الأمنية في المنصة (صلاحيات، تحقق من المدخلات، إلخ) تمت تغطيتها بشكل مستقل في تدقيقات سابقة موثقة في `.agents/memory/` (أكثر من 15 جولة تدقيق شاملة على الطلاب، الاختبارات، التسميعات، البث المباشر، المدفوعات، سجل النشاط). لم تُكتشف في هذا التحليل أي ثغرة أمنية أو خطأ وظيفي جديد لم يُغطَّ سابقًا؛ التركيز هنا كان حصريًا على الأداء والاستعداد لبيئة KVM4.
