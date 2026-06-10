---
name: Recitations audit round-2 2026-06
description: Second deep-audit pass on التسميعات section plus platform-wide payment bug — 7 new bugs fixed.
---

## N1 — ON CONFLICT resets started_at (race condition timer reset)
**File**: `server/routes/recitations.js`, GET `/:id/take` session INSERT  
**Rule**: `ON CONFLICT DO UPDATE SET started_at=NOW()` was wrong — two simultaneous GET /take requests could cause the second to reset the student's exam timer.  
**Fix**: Changed to `ON CONFLICT DO UPDATE SET questions_snapshot=EXCLUDED.questions_snapshot` — preserves the original started_at.

## N2 — Recurring recitations: student shows "done" in new window
**Files**: `server/routes/recitations.js` (student/list query) + `client/src/pages/student/Recitations.jsx` (getStatus)  
**Rule**: The `LEFT JOIN (SELECT DISTINCT ON (recitation_id) * FROM recitation_results ...)` fetched the most recent result regardless of which time window it belonged to. For weekly/daily recurring recitations, a student who completed week-1 would still appear as "done" in week-2's fresh window.  
**Fix (backend)**: Replaced `DISTINCT ON` subquery with `LEFT JOIN LATERAL (... WHERE r.start_date IS NULL OR rr2.created_at >= r.start_date ...)` so only results within the current window are joined.  
**Fix (frontend)**: Updated `getStatus()` to compute `doneInCurrentWindow = my_submitted_at && (!start_date || my_submitted_at >= start_date)` before returning 'done'.

## N3 — Analytics avg_score displays raw score as "%" instead of normalized percentage
**File**: `server/routes/recitations.js`, GET `/analytics`  
**Rule**: Three queries (summary avg, by_stage avg_score, top_students avg_score) used `AVG(rr.score)` — raw absolute scores. But the UI appended `%` after each value, so a student scoring 7/10 would show "7%" instead of "70%".  
**Fix**: All three queries changed to `AVG(CASE WHEN r.total_score > 0 THEN rr.score::float / r.total_score * 100 ELSE 0 END)` — normalized to 0–100%.

## N4 — Orphaned sessions from expired 'once' recitations never cleaned
**File**: `server/scheduler.js`, `runRecitationSchedule()`  
**Rule**: For recurring recitations the scheduler deletes sessions on window-reset. But for `schedule_type = 'once'` recitations that have ended, sessions from students who started but never submitted just pile up in `recitation_sessions` forever.  
**Fix**: Added a `DELETE FROM recitation_sessions` cleanup block in the scheduler for sessions belonging to expired `once`-type recitations, runs every 5 minutes.

## N5 — Edit button visible for published recitations
**File**: `client/src/pages/teacher/Recitations.jsx`  
**Rule**: The Edit (pencil) button was always visible. Clicking it on a published recitation opened the modal, and submitting returned a server 409. This UX mismatch confuses teachers.  
**Fix**: Wrapped the edit button in `{!rec.is_published && (...)}` — hidden when recitation is published.

## N6 — Unanswered T/F questions show letter code instead of option text
**File**: `client/src/pages/student/Recitations.jsx`, result review section  
**Rule**: For unanswered questions the review showed `الصحيح: A` or `الصحيح: B`. For True/False questions where options are "صح" / "خطأ", showing "A" or "B" is confusing.  
**Fix**: Added a lookup: `correct_answer_letter === 'A' ? option_a : 'B' ? option_b : ...` — shows the actual option text.

## P1 — Payment verify: amount check ran AFTER database UPDATE (inconsistent state)
**File**: `server/routes/payments.js`, PUT `/:id/verify`  
**Rule**: The `UPDATE payments SET status='verified'` ran at line 254, then the course price check ran at line 274. If the paid amount was less than the course price, the endpoint returned 400 but the DB row was already permanently `verified` — no rollback.  
**Fix**: Moved the course price fetch + amount comparison to BEFORE the UPDATE (using `paymentRes.rows[0].amount` and `paymentRes.rows[0].course_id` from the initial SELECT). The now-redundant duplicate check in the auto-enroll section was removed.

## Why these patterns recur
- Race-condition fixes need `DO NOTHING` or `DO UPDATE SET column=EXCLUDED.column` (never reset timestamps in ON CONFLICT)
- Any analytics field shown with `%` in UI must be normalized 0–100 in the query, not the raw score
- Pre-checks that guard side effects (DB writes, enrollment) must happen BEFORE those writes, not after
