---
name: Soft-delete audit 2026-07
description: 9 bugs fixed in soft-delete logic for students, exams, recitations, and courses. Test suite in tests/soft-delete-audit.test.js (55 tests).
---

# Soft-Delete Audit — July 2026

## Rule
Any soft-delete operation must immediately clean up all active **sessions** (exam_sessions / recitation_sessions) for the deleted entity. Results are intentionally preserved.

**Why:** ON DELETE CASCADE in the schema only fires on hard-DELETE. Soft-delete (setting deleted_at=NOW()) leaves sessions as orphans until the 14-day schema cleanup, causing students mid-session to get cryptic 404 errors on submit.

## Bugs Fixed

| ID | File | Fix |
|----|------|-----|
| BUG-1 | recitations.js DELETE /:id | Add `DELETE FROM recitation_sessions WHERE recitation_id=$1` after soft-delete |
| BUG-2 | exams.js DELETE /:id | Add `DELETE FROM exam_sessions WHERE exam_id=$1` after soft-delete |
| BUG-3 | scheduler.js N4-FIX | Add `OR r.deleted_at IS NOT NULL` to orphan session cleanup query |
| BUG-4 | students.js DELETE /:id | All cleanup queries used `[req.params.id]` (string); changed to `[studentId]` (validated integer) |
| BUG-5 | students.js /me/dashboard | Missing `AND e.deleted_at IS NULL` on recent exam results query |
| BUG-6 | students.js /me/dashboard | Total exam count didn't join exams table; added JOIN + deleted_at filter |
| BUG-7 | students.js /me/stats | Exam results for stats/summary included soft-deleted exams |
| BUG-8 | courses.js DELETE /:id | Course hard-delete left linked exams alive (ON DELETE SET NULL); now soft-deletes them + cleans exam_sessions |
| BUG-9 | courses.js DELETE /:id | Same as BUG-8 for recitations (course_id ON DELETE SET NULL) |

## How to Apply
- When adding any new soft-delete endpoint: always add a session cleanup step immediately after the UPDATE deleted_at.
- Course delete: soft-delete all linked exams and recitations BEFORE the hard-delete (so course_id is still known).
- The scheduler cleanup acts as safety net but is not the primary mechanism.

## Schema Note
`recitations.deleted_at` column was missing from the live DB on first deploy — needed manual `ALTER TABLE recitations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL`. The schema.sql has it at line 224 but it was inside a failing DO $$ block context. Schema re-run via psql applies it correctly.

## Test Suite
`tests/soft-delete-audit.test.js` — 55 tests, 7 sections (A-G). Creates isolated teacher+student fixtures, cleans up after itself. Run: `JWT_SECRET=<secret> node tests/soft-delete-audit.test.js`
