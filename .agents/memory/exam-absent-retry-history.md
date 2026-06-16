---
name: Exam absent + retry history
description: Design decisions for is_absent marking, retry history visibility, and archive/analytics updates
---

## Schema
- `exam_results.is_absent BOOLEAN DEFAULT false NOT NULL` — row inserted by system, score=0, is_latest=true
- `exams.absent_marked BOOLEAN DEFAULT false NOT NULL` — prevents double-marking; reset to false on force_reset

## When absent is marked
1. **Manual unpublish** (`PUT /exams/:id/publish` with `is_published=false`): calls `markAbsentStudents()` async after SSE fan-out
2. **Scheduled end** (`runEndedExamCheck` in scheduler.js): runs every 5min; finds exams where `end_date <= NOW() AND absent_marked=false`; both paths use the same eligibility logic (course-enrolled or teacher's students)

## markAbsentStudents() eligibility
- If exam has `course_id`: uses `student_course_enrollment` where status='active'
- Else: uses `students` where `teacher_id=$1 AND deleted_at IS NULL AND is_suspended=false`
- Guard: `NOT EXISTS (SELECT 1 FROM exam_results WHERE student_id=X AND exam_id=Y)` — never double-inserts

## Archive changes
- `/api/archive/exam-results`: removed `is_latest=true` filter — shows ALL attempts (retries visible as separate rows)
- `/api/archive/students` examSub: `total_exams` counts `is_latest=true AND is_absent=false`; `absent_exams` counts `is_latest=true AND is_absent=true`; analytics filters `is_absent=false`
- `status=absent` filter added alongside `pass`/`fail`
- `student/:id/exam-results` uses LEFT JOIN on courses (exams without course_id previously crashed with JOIN)

## Frontend
- **StudentArchiveModal**: gray border+icon (`Clock`) for absent rows; "غائب" badge; "محاولة قديمة" badge for `is_latest=false` non-absent; no expand/review for absent rows
- **Archive.jsx** (teacher): shows absent count below PassBar in both table and mobile card views
- **student/Exams.jsx**: collapsible "سجل اختباراتي" section using `GET /exams/student/my-results` endpoint; shows all attempts and absent records with appropriate badges

**Why:** Teacher needs to track who was absent; students need full history visibility including retries.
