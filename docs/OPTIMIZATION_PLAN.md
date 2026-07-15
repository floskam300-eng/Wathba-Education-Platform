# خطة تحسين الأداء — منصة وثبة (WATHBA)
### الهدف: أعلى استفادة من Hostinger VPS **KVM 4** (4 vCPU / 16GB RAM / 200GB NVMe)

> آخر تحديث: 2026-07-15
> المصدر: تدقيق كامل على الكود (backend + frontend + schema) + قياس أنماط الاستعلامات الفعلية

---

## 0) ما تم تطبيقه بالفعل ✅

البنود التالية مُطبَّقة ومغلقة — لا تحتاج عمل:

| البند | التفاصيل |
|---|---|
| Pool size رُفع لـ 20 + timeouts صريحة | `server/db/connection.js` |
| Migration loop → single UPDATE | `server/index.js` |
| Broadcast WhatsApp مع `waSendDelay()` | `server/routes/whatsapp.js` |
| Notifications SELECT محدد الأعمدة + LIMIT 100 | `server/routes/notifications.js` |
| Video progress LIMIT 15 | `server/routes/students.js` |
| Dashboard analytics → SQL aggregation بدل fetch-all | `server/routes/teachers.js` |
| SELECT * أُزيل من exams + recitations queries | `server/routes/exams.js`, `recitations.js` |
| Magic-byte check → async | `server/lib/validateFileMagic.js` |
| analyticsCache مفعّل على course-stats + recitation analytics | `server/routes/teachers.js` |
| `idx_live_chat_stream_sent` composite index | `server/db/schema.sql` |
| `idx_live_streams_status` index | `server/db/schema.sql` |
| compression() middleware | `server/index.js` |
| GET /health endpoint | `server/index.js` |
| postgres.conf مضبوط لـ 16GB RAM + مربوط في docker-compose | `postgres.conf`, `docker-compose.yml` |
| React.lazy على كل الصفحات | `client/src/App.jsx` |
| manualChunks: echarts, firebase, pdfjs, livekit | `client/vite.config.js` |
| xlsx → dynamic import | `client/src/pages/teacher/Students.jsx` |
| staleTime موحّد 5 دقائق في QueryClient | `client/src/main.jsx` |
| Bulk import طلاب → batch EXISTS check + parallel bcrypt + unnest INSERT | `server/routes/teachers.js` |
| Retention scheduler يشمل exam_results + recitation_results | `server/scheduler.js` |
| `loading="lazy" decoding="async"` على صور المحتوى | ExamQuestions, Recitations, QuestionBanks... |
| WhatsApp history polling: 5s → 30s | `client/src/components/WhatsAppTab.jsx` |

---

## 1) قيود معمارية — يجب قراءتها قبل أي تغيير

| المكوّن | الموقع | القيد |
|---|---|---|
| SSE / live-stream viewers | `server/index.js`, `server/routes/live.js` | كل `Map()` محلي — مع أكثر من process، الأحداث لا تصل للـ instance الصح |
| WhatsApp (Baileys) | `server/lib/whatsapp.js` | Session stateful مربوطة بالقرص — process واحد فقط |
| Analytics / Permissions cache | `server/lib/analyticsCache.js`, `server/lib/permissionsCache.js` | Cache محلي — غير متسق مع أكثر من process |
| File-access cache | `server/index.js` (`_fileAccessCache`) | نفس المشكلة |

**التوصية المعمارية لـ KVM4:**
- **قصير المدى:** process واحد + ضبط DB + إصلاح الـ queries (هذه الخطة بأكملها).
- **متوسط المدى (اختياري):** نقل الحالة المشتركة إلى Redis ثم PM2 cluster (2–3 workers). لا تبدأ هذا قبل قياس فعلي يثبت أن CPU هو العنق الزجاجة.

---

## 2) قاعدة البيانات — Indexes ناقصة

### 2.1 حرجة (Critical)

| # | الجدول | المشكلة | الحل |
|---|---|---|---|
| DB-1 | `students.name` | كل بحث بالاسم (`ILIKE '%...%'`) يُنتج **full table scan** — B-tree index لا يفيد مع leading wildcard | تفعيل `pg_trgm` extension وإضافة GIN trigram index (شرح أدناه) |

```sql
-- يُضاف في server/db/schema.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_students_name_trgm
  ON students USING GIN (name gin_trgm_ops);
-- يُستخدم تلقائياً مع: WHERE name ILIKE '%محمد%'
```

> **لماذا هذا حرج؟** البحث بالاسم هو العملية الأكثر تكراراً في المنصة (students.js, whatsapp.js, archive.js). مع 500+ طالب لكل معلم وعشرات المعلمين، كل بحث يقرأ الجدول كاملاً.

### 2.2 عالية (High)

| # | الجدول | المشكلة | الحل |
|---|---|---|---|
| DB-2 | `activity_logs` | فلترة بـ `actor_id + actor_type` بدون index — الجدول ينمو بسرعة | `CREATE INDEX IF NOT EXISTS idx_activity_logs_actor ON activity_logs(actor_id, actor_type);` |
| DB-3 | `videos` | JOIN متكرر على `section_id` في عمليات export بدون index | `CREATE INDEX IF NOT EXISTS idx_videos_section_id ON videos(section_id);` |

### 2.3 منخفضة (Low)

| # | الجدول | المشكلة | الحل |
|---|---|---|---|
| DB-4 | `recitation_sessions` | `UNIQUE(student_id, recitation_id)` بلا اسم صريح | تحويله لـ `CREATE UNIQUE INDEX IF NOT EXISTS uq_recitation_sessions_student_rec ON recitation_sessions(student_id, recitation_id)` في schema.sql |
| DB-5 | `students` | `idx_students_username` (B-tree عادي) **زائد تماماً** مع وجود `uq_students_username_active` | حذف `idx_students_username` — الـ Postgres لا يستخدمهما معاً وهو استهلاك إضافي في الكتابة |

---

## 3) نظام البحث (Search)

### الوضع الحالي

**البحث server-side مع pagination ✅** — مطبّق بشكل صح على:
- قائمة الطلاب الكاملة (`GET /students`)
- الأرشيف (`GET /archive/exams`, `/archive/recitations`)
- سجل النشاط (`GET /activity-logs`)

**المشكلة الجوهرية: كل البحث النصي يستخدم ILIKE بدون trigram**

```sql
-- النمط الحالي في كل الـ routes — غير فعّال مع leading wildcard
WHERE s.name ILIKE '%' || $1 || '%'
WHERE e.title ILIKE '%' || $1 || '%'
```

الـ B-tree index لا يُستخدم مع `%query%` — النتيجة: Sequential Scan على الجدول بالكامل في كل بحث. بعد تفعيل `pg_trgm` في DB-1 أعلاه، نفس الاستعلام يعمل تلقائياً بدون تعديل في الكود.

### Client-Side Filtering — خطر مستقبلي

| الصفحة | البيانات | الخطر |
|---|---|---|
| `client/src/pages/teacher/Payments.jsx` | **كل مدفوعات** المعلم (بلا pagination) | مع 1000+ دفعة: الـ browser يفلتر كل البيانات على كل ضغطة مفتاح |
| `client/src/pages/teacher/Analytics.jsx` | كل الطلاب + نتائجهم | نفس المشكلة مع عدد طلاب كبير |

الحل طويل المدى: نقل الفلترة لـ server-side مع query params + pagination (نفس نموذج archive.js).

---

## 4) الـ Backend — Requests غير محسَّنة

### 4.1 حرجة (Critical)

#### R-1: لوحة تحكم المعلم — 16 query في كل تحميل، بدون cache

**الموقع:** `server/routes/teachers.js:29–47` و`322–370`

```javascript
// يُنفَّذ في كل فتح للداشبورد — بدون أي cache
Promise.all([
  COUNT(students),              // 1
  COUNT(courses),               // 2
  COUNT(exams),                 // 3
  COUNT(assistants),            // 4
  SUM(payments WHERE verified), // 5 — subquery داخلي
  COUNT(enrollment_requests pending), // 6
  COUNT(payments pending),      // 7
  COUNT(retry_requests pending),// 8
  // ثم Promise.all آخر:
  COUNT(students) مرة ثانية,   // 9 — تكرار
  top_students,                 // 10
  recent_results,               // 11
  stage_distribution,           // 12
  gender_distribution,          // 13
  course_stats (loop),          // 14+
  recitations_analytics,        // 15+
  ...                           // 16+
])
```

**الحل:** تطبيق `getCached/setCache` من `analyticsCache.js` على هذا الـ endpoint بـ TTL = 60 ثانية. البنية التحتية موجودة — فقط يحتاج wrapping.

```javascript
// في /dashboard handler:
const cacheKey = `t${teacherId}_dashboard_v1`;
const cached = getCached(cacheKey);
if (cached) return res.json(cached);
// ... run all queries ...
setCache(cacheKey, payload, 60_000); // 60 ثانية
```

**الأثر المتوقع:** من 16 DB round-trips لكل طلب → 0 round-trips لمدة 60 ثانية.

#### R-2: إحصائيات الأدمن — Full table scans بدون cache

**الموقع:** `server/routes/admin.js:974–1007`

```javascript
// في كل طلب لصفحة /stats — بلا cache
COUNT(all teachers)    // full scan
COUNT(all students)    // full scan
COUNT(subscriptions)   // full scan
SUM(revenue)           // full scan
```

**الحل:** cache بـ TTL = 5 دقائق (إحصائيات الأدمن لا تحتاج تحديثاً فورياً).

---

### 4.2 عالية (High)

#### R-3: N+1 في badge check أثناء video progress

**الموقع:** `server/routes/students.js:928–934`

```javascript
// لكل فيديو في الكورس = query منفصل
for (const videoId of videoIds) {
  await pool.query(
    'SELECT id FROM badges WHERE student_id=$1 AND video_id=$2',
    [studentId, videoId]
  );
}
// 10 فيديوهات = 10 queries متتابعة
```

**الحل:** query واحد بـ `WHERE video_id = ANY($2::int[])` قبل الحلقة.

#### R-4: `SELECT *` في تسجيل الدخول

**الموقع:** `server/routes/auth.js:155`

```sql
-- يُنفَّذ في كل محاولة دخول
SELECT * FROM students WHERE username=$1 AND teacher_id=$2
-- يجيب password_hash + force_password_change + device_ids + كل الأعمدة
```

**الحل:** تحديد الأعمدة المطلوبة فعلاً للـ auth فقط (`id, username, password, name, teacher_id, is_suspended, force_password_change, ...`).

#### R-5: `SELECT *` على badges بدون LIMIT

**الموقع:** `server/routes/students.js:962`

```sql
SELECT * FROM badges WHERE student_id=$1 ORDER BY earned_at DESC
-- بلا LIMIT — كل شارات الطالب منذ البداية
```

**الحل:** أعمدة محددة + `LIMIT 50`.

#### R-6: حساب الـ Rank في الصفحة العامة — بدون cache

**الموقع:** `server/routes/public.js:139`

```sql
-- يُنفَّذ في كل طلب لصفحة أولياء الأمور
SELECT COUNT(*)+1 AS rank FROM students
WHERE points > $1 AND teacher_id=$2 AND deleted_at IS NULL
```

الصفحة العامة مفتوحة لأولياء الأمور الذين يفتحونها بشكل متكرر. Cache بـ TTL = 2 دقيقة كافٍ.

---

### 4.3 متوسطة (Medium)

#### R-7: Queries متتالية يمكن تحويلها لـ Promise.all

**الموقع:** `server/routes/exams.js:264, 278, 291`

```javascript
// sequential حالياً
const exam   = await pool.query(...);  // ثم
const count  = await pool.query(...);  // ثم
const bank   = await pool.query(...);
// هذه الثلاثة مستقلة تماماً → يمكن Promise.all
```

نفس النمط في `server/routes/courses.js:990, 999`.

#### R-8: Queries متكررة بدون cache — Public profile stats

**الموقع:** `server/routes/public.js:37–40`

```javascript
// كل طلب للصفحة العامة للمعلم (قد يكون مئات الزيارات يومياً)
COUNT(students), COUNT(courses), COUNT(exams)
// بلا cache — نفس الأرقام لكل زائر
```

**الحل:** cache بـ TTL = 5 دقائق.

#### R-9: `SELECT *` في LATERAL join على recitations

**الموقع:** `server/routes/recitations.js:512`

```sql
SELECT * FROM recitation_results rr2
WHERE rr2.student_id=$1 AND rr2.recitation_id=r.id ...
ORDER BY rr2.created_at DESC LIMIT 1
-- الـ LIMIT 1 يخفف الأثر، لكن لا يزال يجيب كل الأعمدة
```

**الحل:** تحديد الأعمدة المطلوبة فقط.

#### R-10: Export بلا LIMIT safety net

**الموقع:** `server/routes/teachers.js:741`

```sql
SELECT ... FROM students WHERE teacher_id=$1
-- للتصدير CSV — بلا LIMIT → خطر استهلاك ذاكرة مع آلاف الطلاب
```

**الحل:** `LIMIT 10000` كحد أقصى + إشعار في الـ response لو الرقم تخطاه.

---

## 5) الـ Frontend — مشاكل متبقية

| # | الملف | المشكلة | الحل |
|---|---|---|---|
| F-1 | `Payments.jsx` | Client-side filtering على كل المدفوعات | نقل البحث لـ server-side مع query params (أولوية متوسطة) |
| F-2 | `Analytics.jsx` | Client-side filtering على قوائم الطلاب | نفس الحل — أو على الأقل debounce 300ms على input البحث |
| F-3 | قوائم الطلاب الطويلة | لا يوجد `React.memo` على row components — إعادة render غير ضرورية عند أي تغيير في state الصفحة | `React.memo` على مكوّنات الصفوف المستقلة — مفيد بعد نقل الصفوف لملفات منفصلة |

---

## 6) البنية التحتية — مشاكل متبقية

| # | البند | الحالة | الحل |
|---|---|---|---|
| I-1 | Logging / rotation | `console.log` مباشر بلا rotation | `pino` أو `winston` + `docker-compose logging` بـ `max-size: 10m, max-file: 3` لكل خدمة |
| I-2 | Backup | لا استراتيجية backup موثقة | cron يومي: `pg_dump` مضغوط + `rsync` لـ `uploads_data` إلى تخزين خارجي |
| I-3 | مراقبة الموارد | لا أداة مراقبة | `netdata` أو `docker stats` + تنبيه بسيط لرصد CPU/RAM/Disk |
| I-4 | استغلال الأنوية | Node process واحد على 4 vCPU | راجع القسم (1) — الأولوية لـ DB + cache أولاً |

---

## 7) خارطة التنفيذ بالأولوية

### المرحلة 1 — أداء فوري، خطر منخفض (أسبوع 1)

- [ ] **DB-1:** `pg_trgm` extension + GIN index على `students.name` — أعلى أثر واحد ممكن
- [ ] **DB-2:** `idx_activity_logs_actor`
- [ ] **DB-3:** `idx_videos_section_id`
- [ ] **R-1:** Cache لوحة المعلم (TTL 60s) — يُنهي 16 query لكل فتح صفحة
- [ ] **R-2:** Cache إحصائيات الأدمن (TTL 5min)
- [ ] **R-6:** Cache public rank (TTL 2min)
- [ ] **R-8:** Cache public profile stats (TTL 5min)

### المرحلة 2 — تنظيف الـ queries (أسبوع 2)

- [ ] **R-3:** إزالة N+1 في badge check → `ANY($2::int[])`
- [ ] **R-4:** `SELECT *` في auth login → أعمدة محددة
- [ ] **R-5:** `SELECT *` على badges → أعمدة محددة + `LIMIT 50`
- [ ] **R-7:** Queries متتالية → `Promise.all` في exams.js + courses.js
- [ ] **R-9:** `SELECT *` في recitations LATERAL → أعمدة محددة
- [ ] **R-10:** Export → `LIMIT 10000` safety net
- [ ] **DB-4:** تسمية `recitation_sessions` UNIQUE index صراحةً
- [ ] **DB-5:** حذف `idx_students_username` الزائد

### المرحلة 3 — بنية تحتية وعمليات (أسبوع 3)

- [ ] **I-1:** Logging → pino + log rotation في docker-compose
- [ ] **I-2:** Backup script تلقائي (DB + uploads)
- [ ] **I-3:** مراقبة موارد VPS
- [ ] **F-1/F-2:** نقل Payments + Analytics filtering لـ server-side

### المرحلة 4 — توسّع أفقي (اختياري — لاحقاً فقط إذا الحمل يتطلبه)

> **لا تبدأ هذه المرحلة قبل قياس فعلي يثبت أن CPU هو العنق الزجاجة بعد المراحل 1–3.**

- [ ] نقل SSE viewers + rate-limit counters + caches إلى **Redis**
- [ ] فصل خدمة WhatsApp (Baileys) في process/container منفصل (عدد ثابت = 1)
- [ ] تشغيل الـ API بـ PM2 cluster mode (2–3 workers) بعد نقل كل الحالة المحلية

---

## 8) طريقة قياس الأثر

```bash
# قبل/بعد كل مرحلة — قياس زمن أهم 5 مسارات
autocannon -c 50 -d 30 https://your-domain/api/students
autocannon -c 50 -d 30 https://your-domain/api/teachers/dashboard
autocannon -c 50 -d 30 https://your-domain/api/exams
autocannon -c 50 -d 30 https://your-domain/api/activity-logs
autocannon -c 50 -d 30 https://your-domain/api/archive/exams

# قبل/بعد DB-1 (pg_trgm)
EXPLAIN ANALYZE SELECT * FROM students WHERE name ILIKE '%محمد%' AND teacher_id=1;
-- يجب أن يتحول من Seq Scan → Bitmap Index Scan

# حجم الـ bundle
cd client && npm run build
# فحص dist/assets — الـ chunk الأولي يجب أن يكون < 200KB gzipped
```

---

## 9) ملاحظات

- **الأخطاء الوظيفية والأمنية** تمت تغطيتها في أكثر من 30 جولة تدقيق موثقة في `.agents/memory/` — هذا الملف يركز على الأداء فقط.
- **pg_trgm** آمن تماماً للإضافة على قاعدة بيانات production — `CREATE EXTENSION IF NOT EXISTS` لا يؤثر على الجداول أو البيانات الموجودة.
- **Cache TTLs** المقترحة (60s–5min) مبنية على طبيعة البيانات: إحصائيات التجميع لا تتغير بشكل فوري، وأي invalidation منطقي ممكن إضافته لاحقاً على mutation endpoints.
