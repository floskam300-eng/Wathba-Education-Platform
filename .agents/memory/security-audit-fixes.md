---
name: Security audit fixes (June 2026)
description: Six security/logic bugs fixed in the Wathba platform — patterns to stay consistent with in future work.
---

## Fixed patterns

**Why:** Comprehensive security audit revealed these non-obvious patterns that must be enforced consistently in all future routes.

### 1. Video progress IDOR (students.js)
`POST /me/video-progress` — always JOIN `student_course_enrollment` to verify the video belongs to a course the student is actively enrolled in before recording progress. Never trust a bare `video_id` from the client.

### 2. Payment verified_at conditional (payments.js)
`verified_at=NOW()` must only be appended to UPDATE fields when `status === 'verified'`. Rejections and pending status changes must leave `verified_at = NULL`.

### 3. Never expose err.message to client (events.js pattern)
Use `console.error(prefix, err.message)` internally + `res.status(500).json({ error: 'Server error' })` to the client. Never send `err.message` directly — it leaks DB schema details.

### 4. Exam retry enrollment gate (exams.js)
`POST /:id/retry-request` — after verifying teacher_id match, also verify active enrollment for course-linked exams (`course_id IS NOT NULL`). Free exams (no course) bypass this check intentionally.

### 5. Game session token deduplication (events.js)
`POST /weekly-run/start` — check for an existing valid unused token first and return it. Only delete + create a new one if no valid token exists. Prevents `game_session_tokens` table flooding.

### 6. Excel/CSV injection sanitize tab+CR (Students.jsx)
`sanitizeCell` regex must include `\t` and `\r` alongside `=+\-@|`. XLSX library doesn't neutralize these automatically.

**How to apply:** Any new route that records user-submitted IDs (video_id, exam_id, course_id) must verify ownership via a JOIN before writing. Any new game/event with session tokens must check for existing valid tokens before issuing new ones.
