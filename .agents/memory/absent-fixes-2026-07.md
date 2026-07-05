---
name: Absent marking and review button fixes
description: Root causes and fixes for absent-not-marking bug and review button shown for absent students
---

## markAbsentStudents NOT EXISTS must use is_latest=true

**Rule:** The `NOT EXISTS` subquery in `markAbsentStudents` (and the inner INSERT guard) must filter by `AND er.is_latest=true`.

**Why:** Without this, after `force_reset` archives old results (`is_latest=false`), those archived rows remain in `exam_results`. The old `NOT EXISTS` found them and skipped absent-marking for those students in the new publish cycle — no absent record was created even though the student never took the exam in the new window.

**How to apply:** Any time `markAbsentStudents` logic is modified, ensure both the eligibility query and the INSERT guard use `is_latest=true` in their NOT EXISTS subqueries.

## Review button must be hidden for absent students

**Rule:** Absent records (`is_absent=true`) must never show a review button in the student UI. The server already returns 403 for absent reviews, but we also hide it client-side.

**Where fixed:**
- `Dashboard.jsx` recentResults — isAbsent check, gray styling, "غائب" badge
- `MyStats.jsx` exam results list — same pattern
- `CourseView.jsx` course exam results — same pattern
- `Exams.jsx` history rows — was already guarded by `!isAbsent`
- `Exams.jsx` available list — safe: `already_taken` query excludes absent with `er.is_absent=false`

**Why:** Absent students answered nothing; clicking review caused a confusing 403 error.

## /me/stats summary must exclude absents from pass/fail/avg

**Rule:** `passCount`, `failCount`, and `avgScore` in `/students/me/stats` summary should be computed over `takenExams` (non-absent results) only. A separate `absentCount` and `takenCount` are returned.

**Why:** Including absent (score=0) rows inflated the fail count and depressed avgScore, making the student's performance appear worse than it actually was.

**How to apply:** `er.is_absent` must be included in the `/me/stats` exam SELECT; frontend uses `summary.takenCount` (falls back to `totalExams`) for pass rate denominator.
