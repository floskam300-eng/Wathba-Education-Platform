# Wathba Educational Platform — وثبة
منصة تعليمية متكاملة لمراكز الدروس الخصوصية في مصر — تتيح للمعلمين إدارة الكورسات والامتحانات وتتبع أداء الطلاب بشكل احترافي.

---

## Run & Operate
| أمر | الوصف |
|-----|-------|
| `npm run dev` | يشغل الـ backend (port 3001) والـ frontend (port 5000) معاً |
| `npm run server` | يشغل الـ backend فقط |
| `cd client && npm run dev` | يشغل الـ frontend فقط |
| `npm run build` | يبني الـ frontend للإنتاج |
| `node server/db/seed.js` | يملأ قاعدة البيانات ببيانات تجريبية شاملة |

**Env vars required**: `DATABASE_URL`, `JWT_SECRET`, `PORT`

---

## Stack
- **Frontend**: React 18 + Vite 5 + Tailwind CSS 3 + React Router 6
- **Backend**: Node.js 20 + Express 4
- **Database**: PostgreSQL (Replit managed) via `pg` pool
- **Auth**: JWT (jsonwebtoken) + bcryptjs — stored in localStorage
- **Real-time**: SSE (Server-Sent Events) + Firebase Cloud Messaging (FCM)
- **Charts**: ECharts (echarts-for-react)
- **PDF**: jsPDF + jspdf-autotable
- **File uploads**: Multer → `/uploads/`
- **Live Stream**: LiveKit (livekit-server-sdk + livekit-client)

---

## Full Project Structure

```
wathba/
├── client/                          # React frontend (Vite)
│   ├── index.html                   # HTML entry — sets title, favicon, Google Fonts
│   ├── vite.config.js               # Vite config — proxy /api → port 3001, host: true
│   ├── tailwind.config.js           # Tailwind config — RTL, custom colors
│   ├── public/
│   │   ├── favicon.png              # لوجو وثبة (transparent)
│   │   ├── wathba-logo.png          # نسخة أخرى من اللوجو
│   │   ├── default-course.svg       # صورة افتراضية للكورس
│   │   ├── teacher-normal.png       # صور المعلم للـ Boss game
│   │   ├── teacher-sad.png
│   │   ├── teacher-fury.png
│   │   └── firebase-messaging-sw.js # Service worker للـ FCM notifications
│   └── src/
│       ├── main.jsx                 # React entry point — QueryClient, AuthProvider
│       ├── App.jsx                  # React Router — كل الـ routes والـ ProtectedRoute
│       ├── index.css                # Global styles — scrollbar, animations
│       ├── assets/
│       │   ├── wathba_logo_new.png          # لوجو رئيسي
│       │   ├── wathba_logo_transparent.png  # لوجو شفاف (favicon + login)
│       │   ├── wathba_logo_full.png
│       │   └── wathba_logo.png
│       ├── context/
│       │   ├── AuthContext.jsx      # JWT auth — login/logout/user state
│       │   ├── ThemeContext.jsx     # Dark/light mode
│       │   └── LiveStreamContext.jsx # حالة البث المباشر
│       ├── lib/
│       │   ├── api.js               # Axios instance — base URL + JWT header
│       │   └── queryClient.js       # React Query config
│       ├── layouts/
│       │   ├── TeacherLayout.jsx    # Sidebar + navbar للمعلم
│       │   ├── AssistantLayout.jsx  # Sidebar + navbar للمساعد
│       │   └── StudentLayout.jsx    # Sidebar + navbar للطالب
│       ├── components/
│       │   ├── ProtectedRoute.jsx   # Guards routes by role
│       │   ├── VideoPlayer.jsx      # مشغل الفيديو مع تتبع التقدم
│       │   ├── PdfViewer.jsx        # عارض PDF
│       │   ├── ExamTimer.jsx        # مؤقت الامتحان
│       │   ├── NotificationBell.jsx # جرس الإشعارات
│       │   └── ...                  # مكونات مشتركة أخرى
│       └── pages/
│           ├── Login.jsx            # صفحة تسجيل الدخول (معلم + مساعد + طالب)
│           ├── Landing.jsx          # الصفحة الرئيسية (public)
│           ├── teacher/
│           │   ├── Dashboard.jsx    # لوحة التحكم الرئيسية + إحصائيات
│           │   ├── Students.jsx     # إدارة الطلاب (بحث، فلترة، تصدير)
│           │   ├── StudentProfile.jsx # بروفايل الطالب التفصيلي
│           │   ├── Courses.jsx      # إدارة الكورسات
│           │   ├── CourseDetail.jsx # تفاصيل الكورس — رفع فيديوهات/PDF
│           │   ├── Exams.jsx        # إدارة الامتحانات
│           │   ├── ExamCreate.jsx   # إنشاء امتحان + أسئلة
│           │   ├── ExamResults.jsx  # نتائج الامتحانات والتحليل
│           │   ├── Payments.jsx     # طلبات الدفع والتحقق
│           │   ├── Requests.jsx     # طلبات تسجيل الطلاب في الكورسات
│           │   ├── Analytics.jsx    # تحليلات الأداء بالرسوم البيانية
│           │   ├── LiveStream.jsx   # إدارة البث المباشر (LiveKit)
│           │   ├── Notifications.jsx # إرسال إشعارات للطلاب وأولياء الأمور
│           │   ├── Assistants.jsx   # إدارة المساعدين وصلاحياتهم
│           │   ├── Leaderboard.jsx  # متصدرو الطلاب
│           │   ├── Backup.jsx       # تصدير/استيراد بيانات الطلاب
│           │   └── Settings.jsx     # إعدادات المعلم والمنصة
│           ├── assistant/
│           │   ├── Dashboard.jsx    # لوحة تحكم المساعد
│           │   ├── Students.jsx     # إدارة الطلاب (حسب الصلاحيات)
│           │   ├── Exams.jsx        # إدارة الامتحانات (حسب الصلاحيات)
│           │   └── Payments.jsx     # المدفوعات (حسب الصلاحيات)
│           └── student/
│               ├── Dashboard.jsx    # لوحة الطالب — نقاط، كورسات، آخر نشاط
│               ├── Courses.jsx      # قائمة الكورسات المتاحة والمسجّلة
│               ├── CourseView.jsx   # مشاهدة الكورس — فيديو + PDF + امتحانات
│               ├── Exams.jsx        # الامتحانات المتاحة
│               ├── ExamTake.jsx     # تأدية الامتحان
│               ├── ExamReview.jsx   # مراجعة الإجابات بعد الامتحان
│               ├── Leaderboard.jsx  # ترتيب الطلاب بالنقاط
│               ├── MyStats.jsx      # إحصائيات الطالب الشخصية
│               ├── LiveStream.jsx   # مشاهدة البث المباشر
│               ├── Events.jsx       # الفعاليات والألعاب التعليمية
│               └── games/
│                   ├── StickmanRunPage.jsx # صفحة لعبة الجري
│                   ├── StickmanRun.jsx     # لعبة الـ canvas — هروب + Boss fights
│                   └── gameConfig.js       # أسئلة الـ boss حسب المرحلة الدراسية
│
├── server/                          # Node.js/Express backend
│   ├── index.js                     # Entry point — Express setup, initDB, routes, SSE
│   ├── sse.js                       # Server-Sent Events — real-time updates
│   ├── db/
│   │   ├── connection.js            # pg Pool — DATABASE_URL
│   │   ├── schema.sql               # كل الجداول (CREATE TABLE IF NOT EXISTS)
│   │   └── seed.js                  # بيانات تجريبية شاملة (31 طالب، 6 كورسات، ...)
│   ├── middleware/
│   │   ├── auth.js                  # JWT verification — requireAuth, requireRole
│   │   └── validate.js              # Input validation helpers
│   ├── lib/
│   │   ├── fcm.js                   # Firebase Cloud Messaging — push notifications
│   │   ├── permissionsCache.js      # Cache صلاحيات المساعدين
│   │   └── cache.js                 # General caching utilities
│   └── routes/
│       ├── auth.js                  # POST /api/auth/login, GET /api/auth/me
│       ├── teachers.js              # GET/PUT /api/teachers/me — profile & settings
│       ├── students.js              # CRUD /api/students — + bulk import, analytics
│       ├── assistants.js            # CRUD /api/assistants — + permissions management
│       ├── courses.js               # CRUD /api/courses — + sections, videos, PDFs
│       ├── exams.js                 # CRUD /api/exams — + questions, results, retry
│       ├── payments.js              # GET/POST /api/payments — enrollment & verification
│       ├── notifications.js         # POST /api/notifications — send + log
│       ├── live.js                  # GET/POST /api/live — LiveKit tokens, chat, hand-raise
│       ├── events.js                # GET/POST /api/events — Stickman game scores
│       └── leaderboard.js           # GET /api/leaderboard — rankings + history
│
├── uploads/                         # ملفات المرفوعة (صور، PDFs، فيديوهات)
│   ├── images/
│   ├── pdfs/
│   └── videos/
│
├── package.json                     # Root — scripts: dev (concurrently), build
├── .env                             # DATABASE_URL, JWT_SECRET, PORT (لا يُرفع على git)
└── replit.md                        # هذا الملف
```

---

## Database Schema — الجداول الرئيسية

| الجدول | الوصف |
|--------|-------|
| `teachers` | المعلمون — username, password, name, bio, logo_url, whatsapp |
| `assistants` | المساعدون — ينتمون لمعلم + 9 أعمدة صلاحيات |
| `students` | الطلاب — username, password, points, academic_stage, deleted_at |
| `courses` | الكورسات — name, price, target_stage, is_free, thumbnail_url |
| `sections` | أقسام الكورس — title, sort_order |
| `videos` | الفيديوهات — file_path_or_url, duration_minutes, section_id |
| `pdf_files` | ملفات PDF — title, file_url, section_id |
| `exams` | الامتحانات — duration, total_score, pass_score, status, dates |
| `questions` | الأسئلة — type (mcq/true_false/essay), choices, correct_index |
| `exam_results` | نتائج الامتحانات — score, correct_count, wrong_count, essay_pending |
| `exam_retry_requests` | طلبات إعادة الامتحان — pending/accepted/rejected |
| `student_course_enrollment` | تسجيل الطلاب في الكورسات — active/inactive |
| `course_enrollment_requests` | طلبات التسجيل مع صورة الإيصال |
| `payments` | المدفوعات — amount, method, status (verified/pending/rejected) |
| `video_progress` | تقدم الفيديو — watched_minutes, progress_percentage, last_position |
| `badges` | شارات الامتحانات — gold/silver/bronze |
| `live_streams` | جلسات البث المباشر — room_id, status, started_at |
| `live_chat_messages` | رسائل شات البث المباشر |
| `notification_log` | سجل الإشعارات المرسلة — type, recipient, read_at |
| `leaderboard_history` | سجل تاريخي للمتصدرين شهرياً |
| `leaderboard_reset_tracker` | موعد الإعادة التلقائية للمتصدرين |
| `event_plays` | نتائج لعبة Stickman Run الأسبوعية |

---

## API Endpoints — الـ Routes الرئيسية

| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/api/auth/login` | تسجيل دخول (معلم / مساعد / طالب) |
| GET | `/api/auth/me` | بيانات المستخدم الحالي |
| GET | `/api/students` | قائمة الطلاب (للمعلم/المساعد) |
| POST | `/api/students` | إضافة طالب جديد |
| GET | `/api/students/:id/analytics` | تحليلات أداء الطالب |
| POST | `/api/students/me/video-progress` | تحديث تقدم الفيديو |
| GET | `/api/courses` | قائمة الكورسات |
| GET | `/api/courses/student/my-courses` | كورسات الطالب المسجّلة |
| GET | `/api/courses/:id/content` | محتوى الكورس (فيديوهات + PDF + امتحانات) |
| GET | `/api/exams` | قائمة الامتحانات |
| POST | `/api/exams/:id/submit` | تسليم الامتحان |
| GET | `/api/exams/student/results` | نتائج الطالب |
| GET | `/api/leaderboard` | ترتيب الطلاب |
| POST | `/api/payments/request` | طلب تسجيل في كورس مع إيصال |
| GET | `/api/live/current` | الجلسة المباشرة الحالية |
| GET | `/api/events/weekly-run/status` | حالة لعبة الأسبوع للطالب |
| POST | `/api/events/weekly-run/score` | تسجيل نتيجة اللعبة |

---

## User Roles & Permissions

### معلم (Teacher)
- صلاحيات كاملة على كل شيء
- يُنشئ الكورسات والامتحانات والمساعدين
- يرى التحليلات الكاملة ويصدر تقارير PDF

### مساعد (Assistant)
صلاحيات قابلة للتخصيص من المعلم (9 أعمدة):
`can_add_students` | `can_edit_students` | `can_delete_students` | `can_manage_exams` | `can_view_analytics` | `can_send_reports` | `can_manage_payments` | `can_manage_courses` | `can_send_notifications`

### طالب (Student)
- يشاهد الكورسات المسجّلة فقط
- يؤدي الامتحانات ويرى نتائجه
- يراقب ترتيبه في المتصدرين
- يلعب الفعاليات الأسبوعية

---

## System Connections — كيف تتصل الأجزاء

```
Browser ──(HTTPS/443)──► Replit Proxy ──(port 5000)──► Vite Dev Server
                                        ──(port 3001)──► Express API

Express API
  ├── JWT Middleware ──► AuthContext (client)
  ├── SSE /api/sse ──► real-time events (exam published, retry approved)
  ├── FCM lib ──► Firebase ──► Student mobile notifications
  ├── Multer ──► /uploads/ ──► served as static files
  └── pg Pool ──► DATABASE_URL ──► PostgreSQL (Replit managed)
```

---

## Architecture Decisions
- Backend على port 3001، frontend على port 5000 (proxied externally على port 80)
- `dotenv` يُحمّل `.env` لكن Replit env vars تأخذ الأولوية
- الـ schema يُشغَّل كـ `CREATE TABLE IF NOT EXISTS` — آمن على كل restart
- الحساب الافتراضي للمعلم يُنشأ تلقائياً عند أول تشغيل: `admin / admin123`
- JWT يُخزَّن في localStorage في جانب الـ client

---

## User Preferences
- المشروع باللغة العربية بالكامل
- اتجاه RTL
- ألوان المنصة: برتقالي (#f97316) + بنفسجي (#7c3aed) على خلفية داكنة

---

## Gotchas
- `vite.config.js` يجب أن يسمح بـ `host: true` للـ preview على Replit
- الـ schema يُشغَّل كـ `CREATE TABLE IF NOT EXISTS` — آمن على كل إعادة تشغيل
- ملفات الرفع تُحفظ في `/uploads/` وتُقدَّم كـ static files
- لعبة Stickman Run مرة واحدة في الأسبوع per student — تُتتبَّع بجدول `event_plays`

---

## Pointers
- DB skill: `.local/skills/database/SKILL.md`
- Workflows skill: `.local/skills/workflows/SKILL.md`
- Default test accounts (بعد تشغيل seed.js):
  - معلم: `admin / admin123`
  - مساعد: `asst_nour / 123456`
  - طالب: `std_ali / 123456`
