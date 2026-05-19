<div align="center">
  <img src="client/src/assets/wathba_logo_transparent.png" alt="وثبة" width="120" />

  # وثبة — Wathba Educational Platform

  **منصة تعليمية متكاملة لمراكز الدروس الخصوصية في مصر**

  ![Node.js](https://img.shields.io/badge/Node.js-20-green?logo=node.js)
  ![React](https://img.shields.io/badge/React-18-blue?logo=react)
  ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql)
  ![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-cyan?logo=tailwindcss)
  ![License](https://img.shields.io/badge/License-Private-red)
</div>

---

## نظرة عامة

**وثبة** هي منصة تعليمية شاملة مصممة خصيصاً لمراكز الدروس الخصوصية في مصر. تتيح للمعلمين إدارة الكورسات، الامتحانات، وتتبع أداء الطلاب بشكل احترافي — مع نظام نقاط وشارات، بث مباشر، وفعاليات تفاعلية.

### المستخدمون الرئيسيون
| الدور | الوصف |
|-------|-------|
| 👨‍🏫 **معلم** | لوحة تحكم كاملة — إنشاء كورسات وامتحانات، إدارة طلاب ومساعدين، تحليلات، بث مباشر |
| 🧑‍💼 **مساعد** | صلاحيات قابلة للتخصيص من المعلم (9 نوع من الصلاحيات) |
| 🎓 **طالب** | مشاهدة فيديوهات، تأدية امتحانات، متصدرين، فعاليات أسبوعية |

---

## التقنيات المستخدمة

| الطبقة | التقنية |
|--------|---------|
| Frontend | React 18 + Vite 5 + Tailwind CSS 3 + React Router 6 |
| Backend | Node.js 20 + Express 4 |
| Database | PostgreSQL (Replit managed) via `pg` pool |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Real-time | SSE (Server-Sent Events) + Firebase Cloud Messaging |
| Charts | ECharts + ApexCharts + Recharts |
| Live Stream | Jitsi Meet |
| PDF | jsPDF + jspdf-autotable |
| File Uploads | Multer → `/uploads/` |

---

## هيكل المشروع

```
wathba/
├── client/                          # React frontend (Vite)
│   ├── index.html                   # HTML entry — title, favicon, Google Fonts
│   ├── vite.config.js               # proxy /api → port 3001, host: true
│   ├── tailwind.config.js           # RTL, custom colors
│   ├── public/
│   │   ├── favicon.png              # لوجو وثبة (transparent) — browser tab icon
│   │   ├── wathba-logo.png
│   │   ├── default-course.svg       # صورة افتراضية للكورس
│   │   ├── teacher-{normal,sad,fury}.png  # صور المعلم للـ Boss game
│   │   └── firebase-messaging-sw.js # Service worker للـ FCM
│   └── src/
│       ├── main.jsx                 # React entry — QueryClient, AuthProvider
│       ├── App.jsx                  # React Router — كل الـ routes
│       ├── assets/                  # الـ logos بصيغ مختلفة
│       ├── context/
│       │   ├── AuthContext.jsx      # JWT auth state — login / logout / user
│       │   ├── ThemeContext.jsx     # Dark/Light mode
│       │   └── LiveStreamContext.jsx
│       ├── lib/
│       │   ├── api.js               # Axios instance + JWT Authorization header
│       │   └── queryClient.js       # React Query config
│       ├── layouts/
│       │   ├── TeacherLayout.jsx    # Sidebar + navbar للمعلم
│       │   ├── AssistantLayout.jsx  # Sidebar + navbar للمساعد
│       │   └── StudentLayout.jsx    # Sidebar + navbar للطالب
│       ├── components/
│       │   ├── ProtectedRoute.jsx   # Route guard by role
│       │   ├── VideoPlayer.jsx      # مشغل الفيديو مع تتبع التقدم
│       │   ├── PdfViewer.jsx        # عارض ملفات PDF
│       │   ├── ExamTimer.jsx        # مؤقت الامتحان
│       │   ├── NotificationBell.jsx # جرس الإشعارات
│       │   └── ...
│       └── pages/
│           ├── Login.jsx            # تسجيل دخول موحّد (3 أدوار)
│           ├── Landing.jsx          # الصفحة الرئيسية (public)
│           ├── teacher/             # صفحات المعلم
│           │   ├── Dashboard.jsx        # إحصائيات + ملخص سريع
│           │   ├── Students.jsx         # إدارة الطلاب (بحث، فلترة، تصدير)
│           │   ├── StudentProfile.jsx   # بروفايل الطالب التفصيلي
│           │   ├── Courses.jsx          # إدارة الكورسات
│           │   ├── CourseDetail.jsx     # رفع فيديوهات + PDF + أقسام
│           │   ├── Exams.jsx            # قائمة الامتحانات
│           │   ├── ExamCreate.jsx       # إنشاء امتحان + أسئلة
│           │   ├── ExamResults.jsx      # نتائج + تحليل
│           │   ├── Payments.jsx         # طلبات الدفع والتحقق
│           │   ├── Requests.jsx         # طلبات تسجيل الطلاب في الكورسات
│           │   ├── Analytics.jsx        # تحليلات أداء الطلاب (رسوم بيانية)
│           │   ├── LiveStream.jsx       # إدارة البث المباشر (Jitsi)
│           │   ├── Notifications.jsx    # إرسال إشعارات
│           │   ├── Assistants.jsx       # إدارة المساعدين + صلاحياتهم
│           │   ├── Leaderboard.jsx      # متصدرو الطلاب
│           │   ├── Backup.jsx           # تصدير/استيراد بيانات
│           │   └── Settings.jsx         # إعدادات المنصة
│           ├── assistant/           # صفحات المساعد (مشروطة بالصلاحيات)
│           │   ├── Dashboard.jsx
│           │   ├── Students.jsx
│           │   ├── Exams.jsx
│           │   └── Payments.jsx
│           └── student/             # صفحات الطالب
│               ├── Dashboard.jsx        # نقاط، كورسات، آخر نشاط
│               ├── Courses.jsx          # الكورسات المتاحة والمسجّلة
│               ├── CourseView.jsx       # مشاهدة الكورس — فيديو + PDF + امتحانات
│               ├── Exams.jsx            # الامتحانات المتاحة
│               ├── ExamTake.jsx         # تأدية الامتحان
│               ├── ExamReview.jsx       # مراجعة الإجابات
│               ├── Leaderboard.jsx      # ترتيب الطلاب
│               ├── MyStats.jsx          # إحصائيات الطالب الشخصية
│               ├── LiveStream.jsx       # مشاهدة البث المباشر
│               ├── Events.jsx           # الفعاليات الأسبوعية
│               └── games/
│                   ├── StickmanRunPage.jsx   # صفحة اللعبة
│                   ├── StickmanRun.jsx       # لعبة canvas — هروب + Boss fights
│                   └── gameConfig.js         # أسئلة الـ Boss حسب المرحلة الدراسية
│
├── server/                          # Node.js / Express backend
│   ├── index.js                     # Entry — Express، initDB، routes، static files
│   ├── sse.js                       # Server-Sent Events — real-time push للـ client
│   ├── db/
│   │   ├── connection.js            # pg Pool — DATABASE_URL
│   │   ├── schema.sql               # كل الجداول (CREATE TABLE IF NOT EXISTS)
│   │   └── seed.js                  # بيانات تجريبية شاملة
│   ├── middleware/
│   │   ├── auth.js                  # JWT verification — requireAuth, requireRole
│   │   └── validate.js              # Input validation helpers
│   ├── lib/
│   │   ├── fcm.js                   # Firebase Cloud Messaging
│   │   ├── permissionsCache.js      # Cache صلاحيات المساعدين
│   │   └── cache.js                 # General caching
│   └── routes/
│       ├── auth.js                  # /api/auth — login, /me
│       ├── teachers.js              # /api/teachers — profile, settings
│       ├── students.js              # /api/students — CRUD، analytics، video progress
│       ├── assistants.js            # /api/assistants — CRUD، permissions
│       ├── courses.js               # /api/courses — CRUD، sections، videos، PDFs
│       ├── exams.js                 # /api/exams — CRUD، questions، submit، results
│       ├── payments.js              # /api/payments — enrollment، verification
│       ├── notifications.js         # /api/notifications — send، log
│       ├── live.js                  # /api/live — Jitsi rooms، chat، hand-raise
│       ├── events.js                # /api/events — Stickman game scores
│       └── leaderboard.js           # /api/leaderboard — rankings، history
│
├── uploads/                         # ملفات المرفوعة (صور، PDFs، فيديوهات)
├── package.json                     # Root scripts: dev، build، server
├── .env                             # DATABASE_URL، JWT_SECRET، PORT
└── replit.md                        # توثيق الـ agent
```

---

## قاعدة البيانات

<details>
<summary>عرض كل الجداول (22 جدول)</summary>

| الجدول | الأعمدة الرئيسية | الوصف |
|--------|-----------------|-------|
| `teachers` | id, username, password, name, bio, classification, logo_url, photo_url, whatsapp_phone | المعلمون |
| `assistants` | id, username, password, name, teacher_id, 9×can_* | المساعدون + صلاحياتهم |
| `students` | id, username, password, name, phone, parent_phone, academic_stage, points, deleted_at | الطلاب |
| `courses` | id, name, description, price, is_free, target_stage, thumbnail_url, teacher_id | الكورسات |
| `sections` | id, course_id, title, sort_order | أقسام الكورس |
| `videos` | id, course_id, section_id, title, file_path_or_url, duration_minutes, sort_order | الفيديوهات |
| `pdf_files` | id, course_id, section_id, title, file_url, sort_order | ملفات PDF |
| `exams` | id, course_id, title, duration_minutes, total_score, pass_score, status, start_date, end_date | الامتحانات |
| `questions` | id, exam_id, text, type (mcq/true_false/essay), choices, correct_index | الأسئلة |
| `exam_results` | id, exam_id, student_id, score, correct_count, wrong_count, unanswered_count, essay_pending | النتائج |
| `exam_retry_requests` | id, exam_id, student_id, status (pending/accepted/rejected) | طلبات الإعادة |
| `student_course_enrollment` | student_id, course_id, enrolled_at, status | التسجيل في الكورسات |
| `course_enrollment_requests` | id, student_id, course_id, receipt_image_url, status, payment_method | طلبات التسجيل |
| `payments` | id, student_id, course_id, amount, method, status, receipt_url, verified_at | المدفوعات |
| `video_progress` | student_id, video_id, watched_minutes, progress_percentage, last_position, watch_count | تقدم الفيديو |
| `badges` | id, student_id, exam_id, badge_type (gold/silver/bronze) | الشارات |
| `live_streams` | id, teacher_id, title, jitsi_room, status, started_at, ended_at | البث المباشر |
| `live_chat_messages` | id, stream_id, sender_id, sender_role, message, sent_at | رسائل الشات |
| `notification_log` | id, student_id, type, message, sent_at, read_at | سجل الإشعارات |
| `leaderboard_history` | id, student_id, points, rank, month_year | سجل المتصدرين |
| `leaderboard_reset_tracker` | id, next_reset_at | موعد إعادة الضبط |
| `event_plays` | id, student_id, week_key, score, bosses_defeated, played_at | نتائج الألعاب |

</details>

---

## API الرئيسية

<details>
<summary>عرض كل الـ Endpoints</summary>

### Auth
| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/api/auth/login` | تسجيل دخول — يُعيد JWT + بيانات المستخدم |
| GET | `/api/auth/me` | بيانات المستخدم الحالي من الـ token |

### Students
| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/api/students` | قائمة الطلاب |
| POST | `/api/students` | إضافة طالب |
| PUT | `/api/students/:id` | تعديل طالب |
| DELETE | `/api/students/:id` | حذف (soft delete) |
| GET | `/api/students/:id/analytics` | تحليلات أداء الطالب |
| POST | `/api/students/me/video-progress` | تحديث تقدم الفيديو |

### Courses
| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/api/courses` | قائمة الكورسات |
| POST | `/api/courses` | إنشاء كورس |
| GET | `/api/courses/:id/content` | محتوى الكورس (فيديوهات + PDF + امتحانات) |
| GET | `/api/courses/student/my-courses` | كورسات الطالب المسجّلة |

### Exams
| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/api/exams` | قائمة الامتحانات |
| POST | `/api/exams` | إنشاء امتحان |
| POST | `/api/exams/:id/submit` | تسليم الامتحان |
| GET | `/api/exams/student/results` | نتائج الطالب |
| POST | `/api/exams/:id/retry-request` | طلب إعادة الامتحان |

### Payments & Enrollment
| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/api/payments/request` | طلب تسجيل في كورس |
| PUT | `/api/payments/:id/verify` | تأكيد الدفع |
| GET | `/api/payments` | قائمة المدفوعات |

### Live Stream
| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/api/live/current` | الجلسة المباشرة الحالية |
| POST | `/api/live/start` | بدء بث جديد |
| POST | `/api/live/end` | إنهاء البث |

### Events (Game)
| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/api/events/weekly-run/status` | هل لعب الطالب هذا الأسبوع؟ |
| POST | `/api/events/weekly-run/score` | تسجيل نتيجة اللعبة |

</details>

---

## كيف تتصل الأجزاء

```
المتصفح
  │
  ├── HTTPS/443 ──► Replit Proxy
  │                     ├── port 5000 ──► Vite Dev Server ──► React App
  │                     └── port 3001 ──► Express API
  │
  └── /api/* (proxied by Vite) ──► Express
          ├── JWT Middleware ──────────────────► AuthContext (client)
          ├── SSE /api/sse ────────────────────► real-time updates (exam published, retry)
          ├── FCM lib ──► Firebase ────────────► Mobile push notifications
          ├── Multer ──► /uploads/ ────────────► Static file serving
          └── pg Pool ──► DATABASE_URL ────────► PostgreSQL
```

---

## التثبيت والتشغيل

```bash
# 1. تثبيت الـ dependencies
npm install
cd client && npm install && cd ..

# 2. متغيرات البيئة (Replit env vars)
DATABASE_URL=...
JWT_SECRET=...
PORT=3001

# 3. تشغيل في وضع التطوير
npm run dev

# 4. ملء قاعدة البيانات ببيانات تجريبية (اختياري)
node server/db/seed.js
```

---

## بيانات الدخول التجريبية (بعد seed.js)

| الدور | اليوزرنيم | كلمة السر |
|-------|-----------|-----------|
| معلم | `admin` | `admin123` |
| مساعد (صلاحيات كاملة) | `asst_nour` | `123456` |
| مساعد (بدون كورسات) | `asst_karim` | `123456` |
| مساعد (عرض فقط) | `asst_heba` | `123456` |
| طالب ثالثة (متفوق) | `std_ali` | `123456` |
| طالب ثالثة (ضعيف) | `std_mona` | `123456` |
| طالب ثانية | `std_mostafa` | `123456` |
| طالب أولى | `std_nour2` | `123456` |

---

## مميزات المنصة

- 📹 **رفع فيديوهات** مع تتبع تقدم الطالب (نسبة مشاهدة + آخر موضع)
- 📄 **ملفات PDF** مع عارض مدمج وإمكانية التحميل
- 📝 **امتحانات** MCQ + صح/خطأ + مقالي — مع تصحيح تلقائي
- 🏆 **نظام نقاط وشارات** (ذهب/فضة/برونز) على الامتحانات
- 📊 **تحليلات مفصلة** لأداء كل طالب وكل كورس
- 📡 **بث مباشر** بتقنية Jitsi مع شات ورفع يد
- 🎮 **فعاليات أسبوعية** — لعبة Stickman Run مع أسئلة رياضيات
- 💰 **نظام مدفوعات** Vodafone Cash / Instapay مع تحقق يدوي
- 🔔 **إشعارات** للطلاب وأولياء الأمور (داخل التطبيق + FCM)
- 🔐 **نظام صلاحيات** متدرج: معلم ← مساعد ← طالب
- 📱 **تصميم متجاوب** يعمل على الموبايل والتابلت والديسكتوب

---

<div align="center">
  <sub>صُنع بـ ❤️ لمراكز الدروس الخصوصية في مصر</sub>
</div>
