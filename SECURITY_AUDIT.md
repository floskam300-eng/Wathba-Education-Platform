# تقرير الأمان والإصلاحات — وثبة
## Security Audit Report & Test Cases

---

## الثغرات المكتشفة والإصلاحات المُطبَّقة

---

### BUG-1: `verified_at` تُضبط حتى عند رفض الدفع
**الملف:** `server/routes/payments.js` — PUT `/:id/verify`

**المشكلة:**
```js
// قبل الإصلاح — تُضبط دائماً بغض النظر عن الحالة
const updateFields = ['status=$1', 'verified_at=NOW()'];
```
عند ضبط الحالة على `rejected`، كانت `verified_at` تُسجَّل وهي تعني ضمنياً أن الدفع قد جرى التحقق منه.

**الإصلاح:**
```js
const updateFields = ['status=$1'];
if (status === 'verified') updateFields.push('verified_at=NOW()');
```

**حالات الاختبار:**

| # | الإجراء | المدخل | النتيجة المتوقعة |
|---|---------|--------|-----------------|
| T1.1 | PUT `/api/payments/:id/verify` | `{ status: "verified" }` | `verified_at` تُسجَّل بالوقت الحالي ✅ |
| T1.2 | PUT `/api/payments/:id/verify` | `{ status: "rejected" }` | `verified_at = NULL` (لا تُسجَّل) ✅ |
| T1.3 | PUT `/api/payments/:id/verify` | `{ status: "pending" }` | `verified_at = NULL` ✅ |
| T1.4 | PUT `/api/payments/:id/verify` | `{ status: "invalid_val" }` | 400 Bad Request — قيمة غير صحيحة ✅ |
| T1.5 | رجوع حالة `verified → pending` | `{ status: "pending" }` | يُرفض 400 (محمي بفحص التحقق) ✅ |

**التحقق من قاعدة البيانات:**
```sql
SELECT id, status, verified_at FROM payments WHERE id = <payment_id>;
-- عند rejected: verified_at يجب أن يكون NULL
-- عند verified: verified_at يجب أن يحتوي على timestamp
```

---

### BUG-2: video-progress لا يتحقق من ملكية الفيديو (IDOR)
**الملف:** `server/routes/students.js` — POST `/me/video-progress`

**المشكلة:**
كان الطالب يستطيع إرسال `video_id` لأي فيديو في المنصة، حتى لو لم يكن مسجلاً في الكورس، وكان السيرفر يُسجّل التقدم بدون تحقق من الملكية.

**الإصلاح:**
```js
const ownershipCheck = await pool.query(
  `SELECT v.id, v.duration_minutes FROM videos v
   JOIN student_course_enrollment sce ON v.course_id = sce.course_id
   WHERE v.id = $1 AND sce.student_id = $2 AND sce.status = 'active'`,
  [video_id, studentId]
);
if (!ownershipCheck.rows.length) {
  return res.status(403).json({ error: 'Access denied: video not in your enrolled courses' });
}
```

**حالات الاختبار:**

| # | السيناريو | النتيجة المتوقعة |
|---|-----------|-----------------|
| T2.1 | طالب يُرسل `video_id` من كورس مسجّل فيه | 200 OK — يُسجَّل التقدم ✅ |
| T2.2 | طالب يُرسل `video_id` من كورس **غير** مسجّل | 403 Forbidden ✅ |
| T2.3 | طالب يُرسل `video_id` عشوائي غير موجود | 403 Forbidden ✅ |
| T2.4 | طالب مسجّل لكن enrollment بحالة `inactive` | 403 Forbidden ✅ |
| T2.5 | `video_id` غير محدد | 400 Bad Request ✅ |
| T2.6 | `actual_watched_seconds` = 999999 (تجاوز) | يُكبَّت عند 86400 ثانية ✅ |
| T2.7 | `progress_percentage` مُرسَلة من العميل | تُتجاهل — تُحسب من الخادم فقط ✅ |

---

### BUG-3: تسريب رسائل الخطأ الداخلية في events.js
**الملف:** `server/routes/events.js`

**المشكلة:**
```js
res.status(500).json({ error: err.message }); // يكشف تفاصيل DB/Stack
```
كانت رسائل الخطأ من الـ database تصل مباشرة للمستخدم، مما يكشف عن بنية الجداول وتفاصيل الخادم.

**الإصلاح:** استبدال بـ `'Server error'` مع الاحتفاظ بـ `console.error` للـ debugging الداخلي.

**حالات الاختبار:**

| # | السيناريو | النتيجة المتوقعة |
|---|-----------|-----------------|
| T3.1 | قطع اتصال DB أثناء `/weekly-run/start` | `{ error: "Server error" }` — لا تفاصيل DB ✅ |
| T3.2 | بيانات معطوبة في جدول event_plays | `{ error: "Server error" }` ✅ |
| T3.3 | `console.error` يسجّل التفاصيل داخلياً | يظهر في server logs ✅ |

---

### BUG-4: طلب إعادة اختبار بدون التحقق من تسجيل الطالب في الكورس
**الملف:** `server/routes/exams.js` — POST `/:id/retry-request`

**المشكلة:**
كان الطالب يستطيع طلب إعادة امتحان لكورس غير مسجّل فيه، طالما أن الامتحان ينتمي لنفس المعلم.

**الإصلاح:**
```js
const examCourseId = examCheck.rows[0].course_id;
if (examCourseId) {
  const enrollCheck = await pool.query(
    "SELECT id FROM student_course_enrollment WHERE student_id=$1 AND course_id=$2 AND status='active'",
    [studentId, examCourseId]
  );
  if (!enrollCheck.rows.length) {
    return res.status(403).json({ error: 'Access denied: not enrolled in the course for this exam' });
  }
}
```

**حالات الاختبار:**

| # | السيناريو | النتيجة المتوقعة |
|---|-----------|-----------------|
| T4.1 | طالب مسجّل → يطلب إعادة امتحان الكورس | 201 Created ✅ |
| T4.2 | طالب **غير** مسجّل → يطلب إعادة امتحان الكورس | 403 Forbidden ✅ |
| T4.3 | امتحان بدون كورس (`course_id = NULL`) | لا يتحقق من التسجيل — يسمح للطالب ✅ |
| T4.4 | طالب enrollment = `inactive` | 403 Forbidden ✅ |
| T4.5 | طالب يُرسل `examId` من معلم آخر | 403 Forbidden (فحص teacher_id) ✅ |
| T4.6 | طلب متكرر في 24 ساعة بعد رفض | 429 Too Many Requests ✅ |
| T4.7 | طالب لم يؤدِ الاختبار أصلاً | 400 Bad Request ✅ |

---

### BUG-5: CSV/Excel Injection في تصدير بيانات الطلاب
**الملف:** `client/src/pages/teacher/Students.jsx` — `sanitizeCell`

**المشكلة:**
كانت الدالة تتحقق فقط من `=+\-@|` لكن لا تتحقق من `\t` (tab) و `\r` (carriage return) التي تُستخدم أيضاً في هجمات CSV injection.

**الإصلاح:**
```js
const sanitizeCell = (val) => {
  if (typeof val === 'string' && val.length > 0 && /^[=+\-@|\t\r]/.test(val)) return `'${val}`;
  return val;
};
```

**حالات الاختبار:**

| # | قيمة الخلية | النتيجة المتوقعة |
|---|-------------|-----------------|
| T5.1 | `"=SUM(A1:A100)"` | `'=SUM(A1:A100)` — مُبادَرة بـ apostrophe ✅ |
| T5.2 | `"+HYPERLINK(...)"` | `'+HYPERLINK(...)` ✅ |
| T5.3 | `"\t=EXEC()"` | `'\t=EXEC()` ✅ |
| T5.4 | `"\r=EXEC()"` | `'\r=EXEC()` ✅ |
| T5.5 | `"محمد أحمد"` | `"محمد أحمد"` — لا تعديل ✅ |
| T5.6 | `"@username"` | `'@username` ✅ |

---

### BUG-6: إمكانية إغراق جدول game_session_tokens
**الملف:** `server/routes/events.js` — POST `/weekly-run/start`

**المشكلة:**
كان الطالب يستطيع استدعاء `/start` آلاف المرات خلال ساعتين، مما يُنشئ آلاف السجلات في `game_session_tokens` (table flooding / DoS).

**الإصلاح:**
1. إعادة الـ token الحالي غير المستخدم بدلاً من إنشاء جديد
2. حذف جميع الـ tokens القديمة قبل إنشاء token جديد

```js
// إرجاع token موجود إن وُجد (يمنع الفلود)
const existingToken = await pool.query(
  `SELECT token FROM game_session_tokens
   WHERE student_id=$1 AND event_id='weekly_run'
     AND used_at IS NULL AND created_at > NOW() - INTERVAL '2 hours'`,
  [req.user.id]
);
if (existingToken.rows.length > 0) {
  return res.json({ success: true, sessionToken: existingToken.rows[0].token });
}
// حذف كل القديم قبل الإنشاء
await pool.query(
  `DELETE FROM game_session_tokens WHERE student_id=$1 AND event_id='weekly_run'`,
  [req.user.id]
);
```

**حالات الاختبار:**

| # | السيناريو | النتيجة المتوقعة |
|---|-----------|-----------------|
| T6.1 | استدعاء `/start` مرة واحدة | يُنشئ token ويُعيده ✅ |
| T6.2 | استدعاء `/start` 100 مرة متتالية | يُعيد نفس الـ token (لا سجلات جديدة) ✅ |
| T6.3 | عدد سجلات `game_session_tokens` للطالب | دائماً ≤ 1 سجل نشط ✅ |
| T6.4 | `/start` بعد انتهاء token (> ساعتين) | يُنشئ token جديد ✅ |
| T6.5 | `/start` بعد اللعب وإتمام `/finish` | `{ already_played: true }` ✅ |
| T6.6 | تسليم نتيجة بـ token مُستخدم | 403 Forbidden ✅ |

---

## ملخص الإصلاحات

| # | الملف | الثغرة | الخطورة | الحالة |
|---|-------|--------|---------|--------|
| BUG-1 | `server/routes/payments.js` | `verified_at` تُسجَّل عند الرفض | متوسطة | ✅ مُصلَح |
| BUG-2 | `server/routes/students.js` | IDOR في video-progress | عالية | ✅ مُصلَح |
| BUG-3 | `server/routes/events.js` | تسريب رسائل خطأ داخلية | منخفضة | ✅ مُصلَح |
| BUG-4 | `server/routes/exams.js` | طلب retry بدون enrollment | متوسطة | ✅ مُصلَح |
| BUG-5 | `client/src/pages/teacher/Students.jsx` | Excel injection ناقص | منخفضة | ✅ مُصلَح |
| BUG-6 | `server/routes/events.js` | game token flooding | متوسطة | ✅ مُصلَح |

---

## إجراءات الاختبار اليدوي

### إعداد البيئة
```bash
node server/db/seed.js   # بيانات اختبار
# معلم:   admin / admin123
# مساعد:  asst_nour / 123456
# طالب:   std_ali / 123456
```

### T2 — اختبار Video Progress Ownership (IDOR)
```bash
# 1. سجّل دخول كطالب وأحصل على JWT
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"std_ali","password":"123456","role":"student"}' | jq -r .token)

# 2. احصل على video_id من كورس آخر (لا تتسجّل فيه)
# مثلاً video_id = 999 من كورس غير مسجّل

# 3. حاول تحديث التقدم — يجب أن يُرفض بـ 403
curl -X POST http://localhost:3001/api/students/me/video-progress \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"video_id":999,"watched_minutes":10}'
# Expected: {"error":"Access denied: video not in your enrolled courses"}
```

### T4 — اختبار Exam Retry Enrollment Check
```bash
# 1. سجّل دخول كطالب غير مسجّل في كورس X
# 2. أرسل طلب retry لامتحان ينتمي لكورس X
curl -X POST http://localhost:3001/api/exams/5/retry-request \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"أريد إعادة الاختبار"}'
# Expected: {"error":"Access denied: not enrolled in the course for this exam"}
```

### T1 — اختبار Payment verified_at
```bash
# 1. سجّل دخول كمعلم
TEACHER_TOKEN=...

# 2. أنشئ دفع بحالة pending
PAY_ID=$(curl -s -X POST .../api/payments -d '...' | jq .id)

# 3. ارفض الدفع
curl -X PUT http://localhost:3001/api/payments/$PAY_ID/verify \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -d '{"status":"rejected"}'

# 4. تحقق من قاعدة البيانات
psql $DATABASE_URL -c "SELECT status, verified_at FROM payments WHERE id=$PAY_ID;"
# Expected: status=rejected, verified_at=NULL
```

### T6 — اختبار Game Token Anti-Flood
```bash
# استدعاء /start 5 مرات متتالية
for i in {1..5}; do
  curl -X POST http://localhost:3001/api/events/weekly-run/start \
    -H "Authorization: Bearer $TOKEN"
done
# كل الاستجابات يجب أن تُعيد نفس sessionToken
# وعدد السجلات في game_session_tokens يجب أن يبقى 1

psql $DATABASE_URL -c \
  "SELECT COUNT(*) FROM game_session_tokens WHERE student_id=<id> AND event_id='weekly_run';"
# Expected: count = 1
```

---

---

### BUG-7: تسريب `err.message` في `GET /students/stages`
**الملف:** `server/routes/students.js` — السطر 68 (سابقاً)

**المشكلة:**
```js
// قبل الإصلاح
res.status(500).json({ error: err.message });
```
تسريب رسالة خطأ قاعدة البيانات الخام للمستخدم — تكشف عن أسماء جداول وأعمدة وهيكل الـ schema.

**الإصلاح:**
```js
console.error('[students/stages]', err);
res.status(500).json({ error: 'Server error' });
```

**حالات الاختبار:**

| # | الإجراء | النتيجة المتوقعة |
|---|---------|-----------------|
| T7.1 | `GET /api/students/stages` بـ DB error مُصطنَع | `{"error":"Server error"}` فقط — لا رسائل DB |
| T7.2 | `GET /api/students/stages` طبيعي | قائمة المراحل الدراسية بشكل صحيح |

---

### BUG-8: حقل `action` في طلبات التسجيل بدون whitelist
**الملف:** `server/routes/courses.js` — `PUT /enrollment-requests/:id`

**المشكلة:**
```js
// قبل الإصلاح
if (action === 'approve') {
  // ...
} else {
  // أي قيمة ≠ "approve" تُنفّذ الـ reject، بما فيها null / undefined / "delete"
}
```
إرسال `action: null` أو `action: "anything"` يُنفّذ سلوك الرفض خفيةً بدون validation واضح.

**الإصلاح:**
```js
if (!['approve', 'reject'].includes(action))
  return res.status(400).json({ error: 'الإجراء غير صالح — يجب أن يكون approve أو reject' });
```

**حالات الاختبار:**

| # | المدخل | النتيجة المتوقعة |
|---|--------|-----------------|
| T8.1 | `{ action: "approve" }` | قبول الطالب + إشعار |
| T8.2 | `{ action: "reject" }` | رفض + إشعار |
| T8.3 | `{ action: null }` | 400 — "الإجراء غير صالح" |
| T8.4 | `{ action: "delete" }` | 400 — "الإجراء غير صالح" |
| T8.5 | `{}` (بدون action) | 400 — "الإجراء غير صالح" |

---

### BUG-9: لا توجد حدود لعدد سجلات الاستيراد (DoS)
**الملف:** `server/routes/teachers.js` — `POST /import`

**المشكلة:**
الـ JSON body محدود بـ 20MB، لكن ملف 20MB يمكن أن يحتوي على آلاف الكائنات الصغيرة مما يولّد عشرات الآلاف من استعلامات قاعدة البيانات، مما يتسبب في استنزاف موارد الخادم.

**الإصلاح:**
```js
const IMPORT_LIMITS = {
  courses: 500, sections: 2000, videos: 5000, pdfs: 2000,
  exams: 1000, questions: 50000, students: 5000,
  exam_results: 100000, payments: 20000, enrollments: 20000,
};
for (const [key, limit] of Object.entries(IMPORT_LIMITS)) {
  if (Array.isArray(data[key]) && data[key].length > limit)
    return res.status(400).json({ error: `عدد ${key} تجاوز الحد المسموح (${limit})` });
}
```

**حالات الاختبار:**

| # | المدخل | النتيجة المتوقعة |
|---|--------|-----------------|
| T9.1 | JSON به `courses` = مصفوفة 501 عنصر | 400 — "عدد courses تجاوز الحد المسموح (500)" |
| T9.2 | JSON طبيعي (أقل من الحدود) | يستمر الاستيراد بنجاح |
| T9.3 | JSON به `students` = 5001 | 400 — رسالة مناسبة |

---

### BUG-10: حقل `access` في البث المباشر بدون تحقق
**الملف:** `server/routes/live.js` — `POST /start` و `POST /schedule`

**المشكلة:**
```js
// قبل الإصلاح
access || 'all'  // أي قيمة تُقبل وتُحفظ في قاعدة البيانات
```
قيمة `access` تُحفظ مباشرةً بدون تحقق، مما قد يتسبب في سلوك غير متوقع في منطق تصفية الطلاب.

**الإصلاح:**
```js
if (access && !['all', 'stages', 'specific'].includes(access))
  return res.status(400).json({ error: 'قيمة access غير صالحة' });
```

**حالات الاختبار:**

| # | المدخل | النتيجة المتوقعة |
|---|--------|-----------------|
| T10.1 | `POST /live/start { access: "all" }` | البث يبدأ بنجاح |
| T10.2 | `POST /live/start { access: "stages" }` | البث يبدأ بنجاح |
| T10.3 | `POST /live/start { access: "specific" }` | البث يبدأ بنجاح |
| T10.4 | `POST /live/start { access: "everyone" }` | 400 — "قيمة access غير صالحة" |
| T10.5 | `POST /live/schedule { access: "invalid" }` | 400 — "قيمة access غير صالحة" |

---

### BUG-11: طول `message` و`title` في الإشعارات بدون حد أقصى
**الملف:** `server/routes/notifications.js` — `POST /platform`

**المشكلة:**
إمكانية إرسال رسائل إشعار بحجم ضخم جداً (عشرات الآلاف من الأحرف) لمئات الطلاب في آن واحد، مما يُثقل قاعدة البيانات وبروتوكول FCM.

**الإصلاح:**
```js
if (message.trim().length > 2000)
  return res.status(400).json({ error: 'الرسالة طويلة جداً (2000 حرف كحد أقصى)' });
if (title && title.length > 200)
  return res.status(400).json({ error: 'العنوان طويل جداً (200 حرف كحد أقصى)' });
```

**حالات الاختبار:**

| # | المدخل | النتيجة المتوقعة |
|---|--------|-----------------|
| T11.1 | `message` = 2001 حرف | 400 — "الرسالة طويلة جداً" |
| T11.2 | `title` = 201 حرف | 400 — "العنوان طويل جداً" |
| T11.3 | `message` ≤ 2000 حرف، `title` ≤ 200 حرف | يُرسل الإشعار بنجاح |
| T11.4 | `message` = رسالة عادية + `{name}` | يُستبدل الاسم لكل طالب بشكل صحيح |

---

### BUG-12: معامل `months` يُبنى في نص SQL مباشرةً بدون حد أقصى
**الملف:** `server/routes/teachers.js` — `GET /analytics/trend`

**المشكلة:**
```js
// قبل الإصلاح
const months = parseInt(req.query.months) || 6;
const intervalClause = `AND er.created_at >= NOW() - INTERVAL '${months} months'`;
```
`parseInt` يجعله آمناً من SQL injection، لكن قيمة `months=10000` تُنتج استعلاماً يفحص كل التاريخ، وكل قيمة مختلفة تُسجَّل كـ cache key منفصل يملأ الذاكرة.

**الإصلاح:**
```js
const rawMonths = parseInt(req.query.months);
const months = (!isNaN(rawMonths) && rawMonths > 0) ? Math.min(rawMonths, 36) : 6;
```

**حالات الاختبار:**

| # | المدخل | النتيجة المتوقعة |
|---|--------|-----------------|
| T12.1 | `?months=6` | بيانات آخر 6 أشهر |
| T12.2 | `?months=36` | بيانات آخر 36 شهراً (الحد الأقصى) |
| T12.3 | `?months=10000` | يُعامَل كـ 36 شهراً (يُقيَّد) |
| T12.4 | `?months=abc` | يُستخدم الافتراضي 6 أشهر |
| T12.5 | `?months=-5` | يُستخدم الافتراضي 6 أشهر |
| T12.6 | بدون معامل | يُستخدم الافتراضي 6 أشهر |

---

## ثغرات تحليلية تم مراجعتها (لا تحتاج إصلاحاً)

| الموضوع | الاستنتاج |
|---------|-----------|
| Token blacklist fire-and-forget | مقبول — الإلغاء الفوري في الذاكرة، الـ DB للـ persistence عند restart |
| `wathba_teacher_slug` يبقى بعد logout | متعمَّد — لإبقاء المستخدم على نفس الـ tenant في بيئة التطوير |
| `exams/student/available` subquery NULL | آمن — إذا حُذف الطالب يُعيد مجموعة فارغة (لا تسريب بيانات) |
| `sanitizeCell` tab prefix | مُصلَح — أضيف `\t` و `\r` |
| JWT in localStorage | تصميم مقبول لهذا النوع من التطبيقات مع وجود server-side validation |
| Course re-publish duplicate enrollment | آمن — يستخدم `ON CONFLICT DO NOTHING` |
| Tenant slug change + active sessions | آمن — الجلسات الحالية تعمل بـ JWT مباشرةً بدون الحاجة لـ tenant؛ الـ slug القديم يُبطَل فوراً من cache |
| `analytics/trend` INTERVAL string interpolation | آمن من SQLi — `parseInt` يُصفّي القيمة؛ مُقيَّد الآن بـ 36 شهراً |
| Import `plain_password` في الـ export | مقصود — المعلم يُصدِّر بياناته الخاصة للنسخ الاحتياطية |
| `months` cache key exhaustion | مُقيَّد الآن بـ Math.min(months, 36) |

---

## الجولة الثالثة (3rd Pass) — BUG-13 إلى BUG-17

### BUG-13: Reserved Slug Blocklist Missing — تحقق من الكلمات المحجوزة للـ slug

**الملف:** `server/routes/teachers.js`  
**الخطورة:** متوسطة  
**الوصف:** لم يكن هناك قائمة كلمات محجوزة للـ slug، مما يتيح للمعلم حجز `www`, `api`, `admin`, `login`, `dashboard`، إلخ — وهي كلمات قد تتعارض مع البنية التحتية للمنصة أو تُسهّل التصيّد الاجتماعي.  
**الإصلاح:** إضافة `RESERVED_SLUGS` Set والتحقق منها قبل قبول الـ slug.

**حالات الاختبار:**

```bash
TOKEN="<teacher-jwt>"

# T13.1: slug محجوز — يجب أن يُرفض بـ 400
curl -s -X PUT http://localhost:3001/api/teachers/profile \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Test","slug":"admin"}' | jq .

# T13.2: slug محجوز آخر — يجب أن يُرفض بـ 400
curl -s -X PUT http://localhost:3001/api/teachers/profile \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Test","slug":"api"}' | jq .

# T13.3: slug محجوز — www
curl -s -X PUT http://localhost:3001/api/teachers/profile \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Test","slug":"www"}' | jq .

# T13.4: slug غير محجوز — يجب أن ينجح (200)
curl -s -X PUT http://localhost:3001/api/teachers/profile \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Test","slug":"mr-ahmed-math"}' | jq .

# T13.5: slug محجوز — login
curl -s -X PUT http://localhost:3001/api/teachers/profile \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Test","slug":"login"}' | jq .

# T13.6: slug محجوز — dashboard
curl -s -X PUT http://localhost:3001/api/teachers/profile \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Test","slug":"dashboard"}' | jq .
```

| # | الـ slug | النتيجة المتوقعة |
|---|---------|-----------------|
| T13.1 | `admin` | 400 — محجوز للمنصة |
| T13.2 | `api` | 400 — محجوز للمنصة |
| T13.3 | `www` | 400 — محجوز للمنصة |
| T13.4 | `mr-ahmed-math` | 200 — مقبول |
| T13.5 | `login` | 400 — محجوز للمنصة |
| T13.6 | `dashboard` | 400 — محجوز للمنصة |

---

### BUG-14: Slug Race Condition → 500 Instead of 409

**الملف:** `server/routes/teachers.js`  
**الخطورة:** عالية  
**الوصف:** طلبان متزامنان لحجز نفس الـ slug يتجاوزان فحص التكرار على مستوى التطبيق. الـ DB يرفع قيد UNIQUE (خطأ 23505) لكن الكود لم يكن يعالجه — فيرجع 500 بدلاً من 409 مناسبة.  
**الإصلاح:** إضافة `if (err.code === '23505' && err.constraint.includes('slug'))` في الـ catch.

**حالات الاختبار:**

```bash
T1="<teacher1-jwt>"
T2="<teacher2-jwt>"

# T14.1: طلبان متزامنان لنفس الـ slug — الأول ينجح، الثاني يعيد 409 (لا 500)
curl -s -X PUT http://localhost:3001/api/teachers/profile \
  -H "Authorization: Bearer $T1" -H "Content-Type: application/json" \
  -d '{"name":"T1","slug":"shared-slug"}' &

curl -s -X PUT http://localhost:3001/api/teachers/profile \
  -H "Authorization: Bearer $T2" -H "Content-Type: application/json" \
  -d '{"name":"T2","slug":"shared-slug"}' &
wait
# أحد الردين يجب 200، الآخر 409 — لا يجب أن يكون هناك 500

# T14.2: معلم واحد يطلب slug موجود مسبقاً (app-level check)
# يجب أن يعيد 409 من الفحص الاعتيادي
```

| # | السيناريو | النتيجة المتوقعة |
|---|----------|-----------------|
| T14.1 | طلبان متزامنان لنفس الـ slug | واحد 200، الآخر 409 |
| T14.2 | slug موجود (sequential) | 409 من الفحص الاعتيادي |
| T14.3 | slug فريد | 200 |

---

### BUG-15: Stale Null-Cache for New Slug After Slug Change

**الملف:** `server/routes/teachers.js`  
**الخطورة:** منخفضة-متوسطة  
**الوصف:** عند تغيير الـ slug، كان الكود يُبطل cache الـ slug القديم فقط. إذا كان أي طالب قد حاول الوصول إلى الـ slug الجديد قبل التغيير (فحصل على "404 غير موجود" مخزّن)، يظل الـ null-cache لمدة 5 دقائق، مما يجعل الطلاب يحصلون على "المستأجر غير موجود".  
**الإصلاح:** استدعاء `invalidateTenantCache(slug)` بعد استدعاء `invalidateTenantCache(oldSlug)`.

**حالات الاختبار:**

```bash
TOKEN="<teacher-jwt>"

# T15.1: طالب يحاول تسجيل الدخول بـ new-slug قبل التغيير (يُخزَّن null)
# ثم المعلم يغيّر slug إلى new-slug
# T15.1a: محاولة طالب بـ new-slug (يحصل على 404 — يُخزَّن null)
curl -s -H "X-Tenant-Slug: new-slug" http://localhost:3001/api/auth/me | jq .error

# T15.1b: المعلم يغيّر slug إلى new-slug
curl -s -X PUT http://localhost:3001/api/teachers/profile \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Test","slug":"new-slug"}' | jq .slug

# T15.1c: فوراً بعد التغيير — طالب يجب أن يجد الـ tenant (لا 5 دق انتظار)
curl -s -X POST http://localhost:3001/api/auth/login \
  -H "X-Tenant-Slug: new-slug" -H "Content-Type: application/json" \
  -d '{"username":"std_ali","password":"123456"}' | jq .
# يجب أن ينجح فوراً — لا "المستأجر غير موجود"
```

| # | السيناريو | النتيجة المتوقعة |
|---|----------|-----------------|
| T15.1 | null-cache للـ new slug ثم تغيير الـ slug | تسجيل الدخول ينجح فوراً بعد التغيير |
| T15.2 | slug لا يتغيّر | لا invalidation (لا تأثير) |

---

### BUG-16: Payment Creation for Soft-Deleted Student

**الملف:** `server/routes/payments.js`  
**الخطورة:** منخفضة  
**الوصف:** `POST /api/payments` لم يكن يتحقق من `deleted_at IS NULL` في فحص ملكية الطالب، مما يتيح إنشاء دفعة لطالب تم حذفه soft-delete.  
**الإصلاح:** إضافة `AND deleted_at IS NULL` إلى استعلام التحقق.

**حالات الاختبار:**

```bash
TOKEN="<teacher-jwt>"

# T16.1: إنشاء دفعة لطالب محذوف — يجب أن يُرفض بـ 403
DELETED_STUDENT_ID=<id-of-soft-deleted-student>
curl -s -X POST http://localhost:3001/api/payments \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"student_id\":$DELETED_STUDENT_ID,\"amount\":100,\"method\":\"cash\"}" | jq .

# T16.2: إنشاء دفعة لطالب نشط — يجب أن ينجح
ACTIVE_STUDENT_ID=<id-of-active-student>
curl -s -X POST http://localhost:3001/api/payments \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"student_id\":$ACTIVE_STUDENT_ID,\"amount\":100,\"method\":\"cash\"}" | jq .
```

| # | السيناريو | النتيجة المتوقعة |
|---|----------|-----------------|
| T16.1 | طالب محذوف (deleted_at != NULL) | 403 — "student not yours or has been deleted" |
| T16.2 | طالب نشط | 201 — دفعة أُنشئت |
| T16.3 | طالب لمعلم آخر | 403 — "student not yours" |

---

### BUG-17: Soft-Deleted Students Appear in Attendance View

**الملف:** `server/routes/students.js`  
**الخطورة:** منخفضة  
**الوصف:** `GET /api/students/attendance/:courseId` لم يكن يُصفّي الطلاب المحذوفين (deleted_at IS NOT NULL)، فكان الطلاب المحذوفون يظهرون في قوائم الحضور مع احتساب تقدمهم.  
**الإصلاح:** إضافة `AND s.deleted_at IS NULL` في استعلام الطلاب.

**حالات الاختبار:**

```bash
TOKEN="<teacher-jwt>"
COURSE_ID=<course-id>

# T17.1: قائمة الحضور — الطلاب المحذوفون لا يجب أن يظهروا
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/students/attendance/$COURSE_ID | jq '.students | length'
# بعد حذف طالب: العدد يجب أن ينخفض

# T17.2: حذف طالب مسجّل في كورس ثم جلب الحضور
# الطالب المحذوف لا يجب أن يُدرج في القائمة
```

| # | السيناريو | النتيجة المتوقعة |
|---|----------|-----------------|
| T17.1 | طالب محذوف مسجّل في الكورس | لا يظهر في قائمة الحضور |
| T17.2 | طلاب نشطون فقط | يظهرون جميعاً |
| T17.3 | كورس لمعلم آخر | 403 — Access denied |

