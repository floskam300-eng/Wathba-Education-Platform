# خطة تحسين الأداء — Wathba LMS

> آخر تحديث: 2026-07-15  
> حالة المراحل السابقة: Phase 1 + Phase 2 ✅ مكتملتان (راجع نهاية الملف)

---

## نتائج التحليل الشامل (الجولة الثانية — 2026-07-15)

تحليل من 5 محاور متوازية: Bundle/Rendering، Network/UX، Backend Routes، DB Patterns، SSE/Realtime.

---

## 🔴 حرج — تأثير فوري

### C-1: Feature Flag يضرب قاعدة البيانات على **كل** request في صفحات البث
**الملف:** `server/routes/live.js:23-36`  
**المشكلة:**  
```js
router.use(async (req, res, next) => {
  const { rows } = await pool.query(
    "SELECT features_enabled FROM teachers WHERE id = $1", [teacherId]
  );
```
كل طلب لأي endpoint تحت `/api/live` — سواء كان رسالة chat، heartbeat، SSE ticket، أو جلب قائمة البث — يُطلق query على جدول `teachers`. في بث نشط مع 50 طالب، هذا يعني عشرات الـ queries في الثانية مقابل قيمة لا تتغير إلا نادراً.

**الحل:** Cache بسيط في الذاكرة بـ TTL دقيقة واحدة فقط — مطابق لنمط analyticsCache الموجود فعلاً.

---

### C-2: ثلاث صفحات تُعيد الجلب كل 30 ثانية رغم وجود SSE
**الملفات:**
| الملف | السطر | السلوك |
|---|---|---|
| `Payments.jsx` | 75-76 | `refetchInterval: 30000` + `staleTime: 0` |
| `Requests.jsx` | 142, 148 | `refetchInterval: 30000` (استعلامين) |
| `RetryRequests.jsx` | 81 | `refetchInterval: 30000` |

**المشكلة:** كل مدرس مفتوح عنده إحدى هذه الصفحات يُطلق طلب HTTP كل 30 ثانية حتى لو لم يحدث شيء. مع عشرة مدرسين = 120 طلب/دقيقة بدون قيمة.  
**الأسوأ:** `staleTime: 0` على Payments.jsx يعني إعادة جلب إضافية عند **كل** نقرة للمدرس على نافذة المتصفح.

**الحل:**
- رفع `staleTime` لـ 30-60 ثانية على الأقل
- إضافة SSE event `new_payment` / `new_request` / `new_retry` لإبطال الـ cache فوراً عند الحاجة فقط — البنية التحتية موجودة في `server/sse.js`

---

## 🟠 عالي — تأثير واضح على المستخدم

### H-1: مؤشر مركّب مفقود على `exam_results` للفلتر الثلاثي
**المشكلة:**  
الاستعلامات الأكثر تكراراً في المنصة تستخدم:
```sql
WHERE exam_id = $1 AND is_latest = true AND is_absent = false
```
الـ index الموجود `idx_exam_results_exam_latest` يغطي `(exam_id, is_latest)` فقط — يبقى PostgreSQL يفلتر `is_absent=false` manually على الـ result set. نمط ظهر في:
- `teachers.js:585, 678`
- `archive.js:381`
- `exams.js:1158, 1324`

**الحل:** Index جزئي واحد يُزيل خطوة الفلترة:
```sql
CREATE INDEX IF NOT EXISTS idx_exam_results_active
  ON exam_results (exam_id, student_id)
  WHERE is_latest = true AND is_absent = false;
```

---

### H-2: مؤشر مفقود على `students(teacher_id, points DESC)` للـ Leaderboard
**المشكلة:**  
```sql
ORDER BY s.points DESC LIMIT 50  -- teachers.js:340
ORDER BY s.points DESC            -- students.js leaderboard
```
الـ index الموجود `idx_students_teacher_id` يُمكّن فلترة الـ teacher_id لكنه لا يدعم الترتيب على `points` — يُنتج Bitmap Heap Scan + Sort بدلاً من Index Scan.

**الحل:**
```sql
CREATE INDEX IF NOT EXISTS idx_students_teacher_points
  ON students (teacher_id, points DESC)
  WHERE deleted_at IS NULL;
```

---

### H-3: مؤشر مفقود على `video_progress(student_id, last_watched_at)`
**المشكلة:**  
```sql
ORDER BY last_watched_at DESC  -- notifications.js:961
```
لا يوجد index على `last_watched_at`. الـ indexes الموجودة على `video_progress` هي `(student_id)` و`(video_id)` فقط.

**الحل:**
```sql
CREATE INDEX IF NOT EXISTS idx_video_progress_student_watched
  ON video_progress (student_id, last_watched_at DESC);
```

---

### H-4: `autoPlay` على `<video>` في صفحة المعلم يُطلق جلب الملف فوراً
**الملف:** `client/src/pages/teacher/CourseContent.jsx:221`  
```jsx
<video src={withToken(url)} ... autoPlay />
```
المدرس يفتح صفحة المحتوى لمراجعة القائمة — المتصفح يبدأ تحميل الفيديو فوراً بسبب `autoPlay`. مع فيديوهات بحجم 100-500 MB هذا عبء شبكة كبير بدون طلب من المستخدم.

**الحل:** إزالة `autoPlay` أو إضافة `preload="none"`.

---

## 🟡 متوسط — تحسين تدريجي

### M-1: XLSX في Vite manualChunks رغم استخدام Dynamic Import
**الملف:** `client/vite.config.js:57` + `client/src/pages/teacher/Students.jsx:618`  
XLSX مُستورد بـ `import()` ديناميكي في Students.jsx (ممتاز!) لكنه أيضاً مذكور في `manualChunks` — مما يُنشئ chunk منفصل يُحمَّل مسبقاً بدلاً من عند الطلب فقط. يتعارضان.

**الحل:** حذف XLSX من `manualChunks` والاكتفاء بالـ dynamic import.

---

### M-2: `staleTime` قصير جداً على قوائم ثابتة
| الملف | القيمة | السبب |
|---|---|---|
| `Payments.jsx:76` | `staleTime: 0` | إعادة جلب في كل focus |
| `Courses.jsx:125` | `staleTime: 15000` | 15 ثانية لقائمة كورسات نادراً تتغير |

**الحل:** رفع كليهما لـ 60 ثانية على الأقل. Payments تعتمد على refetchInterval فلا داعي لـ staleTime=0.

---

### M-3: Subquery في IN يمكن تحويله لـ JOIN
**الملف:** `teachers.js:39`  
```sql
WHERE status='verified' AND student_id IN (
  SELECT id FROM students WHERE teacher_id=$1 AND deleted_at IS NULL
)
```
**الحل:** `JOIN students s ON s.id = p.student_id AND s.teacher_id=$1 AND s.deleted_at IS NULL` — يُمكّن القاعدة من استخدام الـ index المركّب مباشرة.

---

### M-4: طلبات متتالية بدون سبب في صفحة Notifications الطالب
**الملف:** `client/src/pages/student/Notifications.jsx:39`  
Polling كل 60 ثانية رغم أن الـ SSE يُرسل بالفعل events عند الإشعار الجديد.

---

### M-5: `Archive.jsx` يجلب كائنات كاملة لقائمة تعرض حقولاً محدودة
الـ archive endpoints ترجع كل الـ columns بما فيها `answers` JSONB الضخم — بينما القائمة تعرض فقط الاسم والتاريخ والدرجة.

---

### M-6: قوائم طويلة بدون Virtualization
**الملف:** `client/src/pages/teacher/Students.jsx`  
مدرس بـ 500 طالب = 500 DOM node في نفس الوقت. لا يوجد `react-window` أو `react-virtual`.

---

## 🟢 منخفض — تنظيف

### L-1: Inline style objects في JSX تُعيد إنشاء مرجع جديد كل render
**الملفات:** `StickmanRunPage.jsx:12-72`, `LiveStream.jsx:532,534,673`  
لا تسبب مشكلة ملحوظة إلا في صفحات تُعيد الرسم بتواتر عالٍ كـ LiveStream.

### L-2: `video_progress` SUM aggregates بدون covering index
```sql
SUM(watched_minutes) ... WHERE student_id=$1
```
الـ index على `(student_id)` يُخدم الفلترة لكن `watched_minutes` خارج الـ index — يتطلب Heap fetch. منخفض الأثر إلا مع طلاب لديهم آلاف السجلات.

### L-3: Notifications تُستطلع كل 60 ثانية (StudentLayout.jsx:78)
نظراً لأن SSE موجود وفعّال، هذا الـ polling زائد — لكنه 60 ثانية فقط فلا أثر كبير.

---

## ✅ مكتشفات ليست مشاكل (False Positives)

| الاكتشاف | التحقق |
|---|---|
| `(teacher_id, deleted_at)` مفقود | ✅ موجود: `idx_students_deleted_at` (schema.sql:449) |
| `(student_id, status)` مفقود | ✅ موجود: `idx_payments_student_status` (schema.sql:487) |
| `(student_id, exam_id, is_latest)` مفقود | ✅ موجود: `idx_exam_results_latest` (schema.sql:619-620) |
| Lottie غير مقسَّم | ✅ Lottie غير مستخدم في المشروع |
| SSE fan-out مكلف | ✅ يستخدم batching بـ setImmediate + فلتر للمتصلين فقط |
| SSE بلا exponential backoff | ✅ موجود في useSSE.js:81-89 |
| Chat messages بلا LIMIT | ✅ LIMIT 200 موجود في live.js:1342 |
| SSE بلا حد للاتصالات | ✅ MAX_SSE_CONNECTIONS_PER_USER=5 في sse.js:14 |

---

## الخطة التنفيذية

### Phase 3 — الأكثر تأثيراً (الأسبوع القادم)

| # | البند | الملف | الأولوية |
|---|---|---|---|
| C-1 | Cache feature flag في live routes | `server/routes/live.js` | 🔴 حرج |
| C-2 | رفع staleTime + إزالة refetchInterval من Payments/Requests/RetryRequests | 3 ملفات FE | 🔴 حرج |
| H-1 | Index جزئي `(exam_id, student_id) WHERE is_latest AND NOT is_absent` | `schema.sql` | 🟠 عالي |
| H-2 | Index `(teacher_id, points DESC)` على students | `schema.sql` | 🟠 عالي |
| H-3 | Index `(student_id, last_watched_at DESC)` على video_progress | `schema.sql` | 🟠 عالي |
| H-4 | إزالة `autoPlay` من CourseContent.jsx | `CourseContent.jsx:221` | 🟠 عالي |
| M-1 | حذف XLSX من manualChunks | `vite.config.js` | 🟡 متوسط |
| M-2 | رفع staleTime على Courses.jsx | `Courses.jsx:125` | 🟡 متوسط |
| M-3 | تحويل IN subquery → JOIN في dashboard | `teachers.js:39` | 🟡 متوسط |

### Phase 4 — بنية تحتية (لاحقاً)

| # | البند |
|---|---|
| I-1 | SSE events لـ new_payment / new_request / new_retry |
| I-2 | Virtualization لقائمة الطلاب (react-virtual) |
| I-3 | Logging pino + rotation |
| I-4 | Backup script تلقائي |
| I-5 | Redis لاستبدال in-memory Maps (للـ horizontal scaling مستقبلاً) |

---

## المراحل المكتملة

### Phase 1 + 2 ✅ (2026-07-15)

**DB Indexes:**
- [x] `pg_trgm` + `idx_students_name_trgm` (GIN) — بحث الأسماء
- [x] `idx_activity_logs_actor`
- [x] `idx_videos_section_id`
- [x] `uq_recitation_sessions_student_rec` (named)
- [x] Drop `idx_students_username` (superseded)

**Backend Caching:**
- [x] Teacher dashboard — `t{id}_dashboard_counts_v1` (5 min)
- [x] Admin `/stats` — `_statsCache` (5 min)
- [x] Public `/info` — `_pubCache` (5 min)
- [x] Public rank calculation — `_pubCache` (2 min)

**Query Cleanup:**
- [x] auth.js student login: `SELECT *` → أعمدة محددة
- [x] students.js badges: `SELECT *` → أعمدة محددة + `LIMIT 50`
- [x] recitations.js LATERAL: `SELECT *` → 6 أعمدة
- [x] teachers.js export: `LIMIT 10000`

**Backend misc (من الجولة الأولى):**
- [x] Bulk import N+1 → batch + unnest
- [x] `idx_live_streams_status`
- [x] Scheduler retention (exam + recitation results)
- [x] `loading="lazy"` على 10 صور محتوى
- [x] WhatsApp polling: 5s → 30s
