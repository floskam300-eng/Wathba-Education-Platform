# Wathba Education Platform - Features

## 1. Multi-Tenant SaaS Architecture
Each teacher receives a dedicated subdomain (e.g., `mr-ahmed.wathba.site`) with complete data isolation, custom branding (platform name, logo), and a separate installable PWA. Tenant resolution is handled via subdomain middleware with in-memory caching.

## 2. Role-Based Access Control (RBAC)
Three distinct roles with tailored interfaces and permissions:
- **Teacher** — Full platform ownership with 23 dedicated management pages.
- **Assistant** — 9 granular permission flags (add/edit/delete students, manage exams/courses/payments, send notifications, view analytics).
- **Student** — Enrolled course access, exams, leaderboard, games, personal statistics.

## 3. Unified Authentication System
JWT-based authentication with 7-day token expiry, server-side token blacklisting (persistent across restarts via DB), proactive token refresh within 24 hours of expiry, and support for all three roles through a single login page.

## 4. Course Management System
Full CRUD for courses with pricing (free/paid), target academic stage filtering, published/draft status, section organization (sortable units/chapters), video content with multi-quality support (480p/720p/1080p), PDF document attachments, course thumbnail management, and completion points system.

## 5. Advanced Exam Engine
Multi-question-type support (MCQ with 4 options, True/False, Image_Multi with grouped context questions), configurable duration/start-end dates/pass scores, question shuffling, server-side exam sessions with enforced timers and question snapshots for anti-cheat, auto-scoring with full attempt history, and instant exam review.

## 6. Question Banks
Reusable question banks linked to courses, with individual bank questions tagged by difficulty level (easy/medium/hard) and support for random question selection from banks during exam creation.

## 7. Exam Retry Workflow
Students can request exam retries; teachers/assistants can approve or reject requests. Workflow includes retry request management pages and status tracking.

## 8. Badge & Points System
Exam-based achievement badges (gold/silver/bronze with custom name/color), points awarded for exam attempts, passing exams, course completion, and game events. Badges and points are displayed on student profiles and dashboards.

## 9. Recitations System (Recurring Quizzes)
Scheduled recurring quiz system supporting once, daily, and weekly cadences. Includes auto-advancing time windows, video-linked quizzes, server-side sessions with question snapshots, streak tracking (current streak, max streak, total completed), and automated absent marking.

## 10. Live Streaming (LiveKit Integration)
Self-hosted WebRTC live streaming via LiveKit (Docker Compose + Caddy reverse proxy). Features include teacher mic/camera toggle and screen sharing, student speak/screen permissions (teacher-granted), chat system, hand-raise queue, kick student moderation, stream locking to prevent late joins, access control by student group (all/stage/specific), scheduled streams with auto-notifications, and live viewer tracking.

## 11. Gamification — Stickman Run Game
Canvas-based educational platformer game with boss fights. Math questions (configured by academic stage) are integrated into boss encounters. Features include weekly play limit (once per week per student), anti-cheat game session tokens, score contribution to leaderboard, and multiple teacher mood animations.

## 12. Leaderboard System
Monthly student rankings with historical snapshots, auto-reset scheduling, and teacher-facing leaderboard page with ranking visualization. Scores accumulate from exams, recitations, game events, and course completions.

## 13. Student Dashboard & Profiles
Personal student dashboard displaying points, rank, enrolled courses, and upcoming exams. Detailed student profiles (accessible by teachers) with exam history, badge collections, progress charts, and PDF report generation.

## 14. Course Video Player & Progress Tracking
Video player with resume functionality (position, percentage, watch count tracking), multi-quality support, and section-based organization. Teachers can view per-student video progress analytics.

## 15. Secure PDF Viewer
JWT-protected PDF viewing requiring valid authentication and ownership/enrollment verification. Videos, PDFs, and question images are served through protected middleware with role-scoped and user-scoped caching.

## 16. Payment & Enrollment System
Supports InstaPay, Vodafone Cash, and Fawry payment methods. Student enrollment workflow: upload payment receipt image → teacher/assistant verification → automatic enrollment. Includes payment status tracking (pending/verified/rejected) and verification audit trail.

## 17. WhatsApp Integration
WhatsApp Web pairing via QR code (Baileys library), sending custom messages to individual students or parents, scheduled broadcast campaigns (daily/weekly/monthly) with template variables ({name}, {student_name}, {avg_score}, {exam_count}, {stage}), anti-spam protection with 8–16 second random delays between messages, send progress tracking (success/fail counts), status monitoring (connected/disconnected), and automatic reconnection on server restart.

## 18. Notification System
Three-channel notification delivery:
- **Server-Sent Events (SSE)** — Real-time in-app notifications (exam started, retry approved, new content). Per-user connection pooling (max 5 per user) with heartbeat.
- **Firebase Cloud Messaging (FCM)** — Push notifications to mobile devices via service worker.
- **Platform In-App** — Notification history log with read tracking.

## 19. Analytics & Reporting
Teacher dashboard with active students, course stats, revenue, and new enrollment metrics. Performance analytics with average scores, pass/fail rates, and ECharts trend charts. Most-wrong-questions analysis to identify student weak points. PDF report generation (jsPDF) for individual student reports. Excel/CSV bulk import/export for student management.

## 20. Attendance & Absent Marking
Automated absent marking for students who miss published exams and recitations within their scheduled windows. Manual attendance management through a dedicated teacher page.

## 21. Archive System
Archiving of students and exams to maintain a clean active workspace while preserving historical data for future reference or restoration.

## 22. Activity Log (Audit Trail)
Complete audit logging for all sensitive operations across the platform, capturing actor type/ID, action performed, entity type/ID, IP address, and timestamp. Teacher-facing activity log page with search and filtering.

## 23. Data Backup & Export
Teacher data export/import functionality for backup purposes, supporting Excel/CSV column mapping per teacher, and database seed/reset scripts for development and disaster recovery.

## 24. Parent Portal
Dedicated parent access page allowing parents to view their children's academic progress, exam results, and performance metrics.

## 25. Progressive Web App (PWA) Support
Service worker for offline capability, dynamic PWA manifest generated per teacher subdomain (enabling separate installable apps), Firebase Cloud Messaging service worker for push notifications, and install banner for mobile users.

## 26. Anti-Cheat & Security Measures
Server-side exam sessions with enforced timers, question snapshots to prevent backtracking, game session tokens for Stickman Run, student device tracking with suspicious device alerts, account suspension capability, JWT token revocation, rate limiting at multiple layers (120 req/min API, 10 req/min SSE, 120 req/min uploads), Helmet security headers (CSP in production), CORS with wildcard subdomain support, input validation middleware, and file access control (JWT + ownership/enrollment check for protected uploads).

## 27. Multi-Quality Video Support
Video content stored and served in multiple resolutions (480p, 720p, 1080p) to accommodate varying internet speeds and device capabilities, with automatic selection or manual switching.

## 28. Teacher Notifications (Broadcast)
Teachers can compose and send notifications to specific students, entire courses, or targeted groups, with delivery through platform in-app notifications and optional WhatsApp/FCM push.

## 29. Assistant Management
Teacher-controlled assistant accounts with fine-grained permission toggles for each operational area (students, exams, courses, payments, notifications, analytics, etc.). Permissions are cached for performance.

## 30. Platform Settings
Teacher-configurable platform settings including custom platform name, branding, visual identity, and other tenant-level configurations.

## 31. Privacy Policy & Terms
Public-facing privacy policy and terms-and-conditions pages compliant with data protection requirements.

## 32. Landing Page & Public Site
Public landing page for the platform with multi-tenant navigation, allowing visitors to browse and access teacher-specific portals. Includes a 404 not-found page.
