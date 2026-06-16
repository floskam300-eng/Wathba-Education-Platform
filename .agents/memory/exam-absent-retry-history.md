---
name: Exam absent + retry history
description: Design decisions, bugs fixed, and test suite for is_absent marking, retry history, and archive/analytics
---

## Schema
- `exam_results.is_absent BOOLEAN DEFAULT false NOT NULL` — row inserted by system, score=0, is_latest=true
- `exams.absent_marked BOOLEAN DEFAULT false NOT NULL` — prevents double-marking; reset to false on force_reset

## When absent is marked
1. **Manual unpublish** (`PUT /exams/:id/publish` with `is_published=false`): calls `markAbsentStudents()` async after SSE fan-out
2. **Scheduled end** (`runEndedExamCheck` in scheduler.js): runs every 5min; finds exams where `end_date <= NOW() AND absent_marked=false AND is_published=true`; both paths use the same eligibility logic (course-enrolled or teacher's students)

## markAbsentStudents() eligibility
- If exam has `course_id`: uses `student_course_enrollment` where status='active'
- Else: uses `students` where `teacher_id=$1 AND deleted_at IS NULL AND is_suspended=false`
- Guard: `NOT EXISTS (SELECT 1 FROM exam_results WHERE student_id=X AND exam_id=Y)` — never double-inserts
- **Exported** from exams.js: `module.exports.markAbsentStudents = markAbsentStudents`

## Archive changes
- `/api/archive/exam-results`: removed `is_latest=true` filter — shows ALL attempts (retries visible as separate rows)
- `/api/archive/students` examSub: `total_exams` counts `is_latest=true AND is_absent=false`; `absent_exams` counts `is_latest=true AND is_absent=true`; analytics filters `is_absent=false`
- `status=absent` filter added alongside `pass`/`fail`
- Archive students endpoint returns `students` key (not `results`)
- `student/:id/exam-results` uses LEFT JOIN on courses (exams without course_id previously crashed with JOIN)
- `has_type=exams` and default `has_type=''` filters include `absent_exams` in the count so absent-only students are visible

## 9 bugs fixed (audit pass)
| # | File | Issue | Fix |
|---|------|-------|-----|
| BUG-1 | scheduler.js | Marked absent for never-published exams | Added `AND e.is_published = true` |
| BUG-2 | student/Exams.jsx | Review button shown for absent records | Added `&& !isAbsent` |
| BUG-3 | exams.js review endpoint | Student could review absent result | 403 + Arabic message if `is_absent=true` and role=student |
| BUG-4 | archive.js default filter | Absent-only students invisible | `(total_exams + absent_exams) > 0` |
| BUG-5 | exams.js publish 409 | "N took exam" when N are absent records | Separate `real_cnt` count; different messages |
| BUG-6 | archive.js has_type=exams | Same as BUG-4 for exams filter | Same fix |
| BUG-7 | exams.js my-results | No LIMIT on query | `LIMIT 500` |
| BUG-8 | teachers.js analytics | Dead `OR is_absent IS NULL` + no is_latest filter | `AND er.is_latest = true`; FILTER clauses on aggregates |
| BUG-9 | exams.js course-results | is_absent missing from SELECT | Added `er.is_absent` |

## Frontend
- **StudentArchiveModal**: gray border+icon (`Clock`) for absent rows; "غائب" badge; no expand/review for absent rows
- **Archive.jsx** (teacher): shows absent count below PassBar in both table and mobile card views
- **student/Exams.jsx**: collapsible "سجل اختباراتي" section using `GET /exams/student/my-results`; review button hidden for absent records

## Key constraints
- `student_course_enrollment.status` CHECK: only 'active' or 'inactive' (not 'suspended')
- Tests use `generateToken` directly (not HTTP login) — student HTTP login needs device_id + X-Tenant-Slug + slug cache warm-up which is fragile in test context
- Test file: `server/tests/absent_retry_test.js` — 75 tests / 10 sections; all pass

**Why:** Teacher tracks who was absent; students see full history including retries and absences.
