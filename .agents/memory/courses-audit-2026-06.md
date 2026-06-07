---
name: Courses section audit 2026-06
description: 7 bugs fixed in the course upload/view/player system across courses.js, CourseView.jsx, CourseContent.jsx
---

## Rules / lessons

**Why:** Full audit of student course display, teacher upload, video player, and navigation.

### BUG-01: `student/my-courses` missing teacher_id isolation
- Query must JOIN `students st ON st.id = $1 AND st.teacher_id = c.teacher_id`
- Without it, a student enrolled in another teacher's course (via direct DB) would see it

### BUG-02: `student/available-all` inactive enrollment shows as is_enrolled
- LEFT JOIN condition must include `AND sce.status = 'active'`
- Without it, inactive enrollment returns `is_enrolled = true` but the student can't access

### BUG-03: `GET /enrollment-requests` missing checkManageCoursesPerm
- Assistants without can_manage_courses could view all student enrollment data via direct API call
- Fix: add `checkManageCoursesPerm` to the GET route (was only on PUT)

### BUG-04: URL params not validated as integers
- Added `parseParamId(val)` helper: parseInt + check > 0 and <= 2147483647
- Applied to `/:id/content` — returns 400 instead of 500 on invalid input

### BUG-05: Teacher VideoPreviewModal missing JWT for local videos
- `withToken()` helper added to CourseContent.jsx (same pattern as CourseView.jsx)
- Applied to `<video src={withToken(video.file_path_or_url)}>` in VideoPreviewModal

### BUG-06: Access guard in CourseView fires only when courses.length > 0
- Changed: `if (!coursesLoading && courses.length > 0 && courseId)` → `if (!coursesLoading && courseId)`
- Without fix: student with 0 enrollments bypasses client-side redirect (server still blocks with 403)

### BUG-07: handleProgressUpdate uses content from closure for auto-advance
- Added `contentRef = useRef(null)` + `useEffect(() => { contentRef.current = content; }, [content])`
- Auto-advance reads `contentRef.current?.videos` instead of `content?.videos`

### Key architecture facts (do not re-derive):
- `withToken` adds `?token=<jwt>` to `/uploads/` URLs only — external URLs untouched
- `GET /:id/content` for students ALREADY has `c.teacher_id = s.teacher_id` check — not a gap
- Video progress server-side: progress_percentage is recomputed from actual_watched_seconds when duration_minutes > 0 — client value is untrusted
- Test cases written to `.local/course-bug-fixes-verification.md`
