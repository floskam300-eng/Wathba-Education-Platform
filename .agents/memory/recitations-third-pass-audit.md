---
name: Recitations third-pass audit
description: 6 bugs fixed in third full audit pass covering recitations, payments, scheduler, and exams routes
---

## Bugs Fixed

### T1 — recitation_results race condition (HIGH)
- `recitation_results` has NO UNIQUE constraint on `(student_id, recitation_id)`.
- The pre-TX duplicate check could be bypassed by concurrent submits, awarding double points.
- **Fix**: Added `SELECT ... FOR UPDATE` on `recitation_sessions` inside the transaction before inserting results. Two concurrent submits now serialize — the second finds no session row and gets a 400.
- **Why**: Without the lock, two simultaneous requests both pass the pre-check, both enter the TX, both insert.
- **How to apply**: Any idempotent endpoint that (1) checks for a duplicate, (2) deletes/modifies a controlling row, and (3) inserts a result must hold a row lock on the controlling row inside the TX.

### T2 — payments.js parseParamId strict check (MEDIUM)
- `parseInt("123abc", 10)` returns `123`; the original check used `.trim()` so `" 5 "` also passed.
- **Fix**: Local `parseParamId` in `payments.js` now uses `String(n) !== String(raw)` (no `.trim()`), rejecting padded IDs.
- **Why**: `encodeURIComponent(' 5 ')` decodes to ` 5 ` in `req.params.id`; server must reject whitespace-padded IDs.

### T3 — Scheduler suspended-students filter (MEDIUM)
- Both `runRecitationSchedule()` student queries (window-reset notifications + start notifications) were missing `AND is_suspended = false`.
- Suspended students received SSE events and `notification_log` entries for new recitation windows.
- **Fix**: Added `AND is_suspended = false` to both query paths in `scheduler.js`.

### T4 — Exam question image filename collision (MEDIUM)
- `exams.js` used `q_${Date.now()}${ext}` — no random suffix. Two concurrent uploads with the same timestamp would produce the same filename (second silently overwrites first).
- **Fix**: Added `const crypto = require('crypto')` and changed filename to `q_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`.

### T5 — Delete published recitation allowed (MEDIUM)
- `DELETE /:id` in `recitations.js` had no `is_published` check, unlike `PUT /:id` (returns 409 if published).
- A teacher could delete a published recitation while students were mid-session, losing their answers via CASCADE.
- **Fix**: Added `if (rec.is_published) return 409` guard before the DELETE, consistent with the PUT guard.

### T6 — Analytics permission error swallowed as 403 (MEDIUM)
- `GET /analytics` used `.catch(() => null)` for the assistant permissions lookup.
- A DB error on permissions lookup returned null → the route returned 403 instead of 500.
- **Fix**: Changed to `try/catch` that returns 500 on DB error and 403 only when permissions are genuinely denied.

## Test Results
- 85/85 tests pass after all fixes.
- New tests cover T1–T6 including T5 publish/unpublish lifecycle, T2 all malformed ID variants, T3/T4 static analysis.
