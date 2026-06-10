---
name: Recitations audit 2026-06
description: 11 bugs fixed in server/routes/recitations.js, server/scheduler.js, client/src/pages/student/Recitations.jsx
---

## Bugs fixed

**R1 🔴 Route Shadowing (Critical)**
`GET /student/results` was registered at line 591, AFTER `GET /:id/results` at line 416.
Express matched `/student/results` as `/:id/results` with `:id='student'`, hitting the teacher/assistant middleware and returning 403 to every student.
**Fix:** All fixed-path student routes (`/student/list`, `/student/streak`, `/student/results`) and `/analytics` are now registered BEFORE any `/:id/*` parameterized routes.

**R2 🔴 Correct Answers Exposed on Session Resume (Security)**
When a student resumed an existing session, `sess.questions_snapshot` was sent to the client unstripped — including `correct_answer_letter` for every question. The new-session path correctly stripped answers but the resume path did not.
**Fix:** Both paths now map the snapshot through `{ ...q, correct_answer_letter: undefined }` before sending to client.

**R3 🔴 Broken Transaction in Scheduler (Critical)**
`scheduler.js` used `await _pool.query('BEGIN')` and `await _pool.query('COMMIT')` for the recitation window-reset transaction. With a connection pool, each `pool.query()` call can land on a different DB connection, making the transaction silently broken.
**Fix:** `const txClient = await _pool.connect()` before BEGIN; all statements use `txClient.query()`; `txClient.release()` in both success and catch paths.

**R4 🔴 sendBeacon Missing Authorization Header (High)**
`navigator.sendBeacon` does not support custom HTTP headers. The tab-close auto-submit used `sendBeacon`, which never sent the JWT Authorization header, causing the server to reject every auto-submit with 401.
**Fix:** Replaced with `fetch({ method:'POST', keepalive:true, headers:{Authorization:`Bearer ${token}`}, body })`. `keepalive:true` achieves the same fire-and-forget behavior while supporting auth headers.

**R5 🔴 Recurring Recitations — Double-Submit Check Too Broad (Critical)**
`SELECT id FROM recitation_results WHERE student_id=$1 AND recitation_id=$2` matched ALL historical results. For weekly/daily recitations (sessions cleared by scheduler, but results kept), a student who completed week 1 could NEVER take the same recitation again in week 2.
**Fix:** Query now adds `AND ($3::timestamp IS NULL OR created_at >= $3::timestamp)` using `rec.start_date` as the current-window lower bound. Same fix applied in both GET /take and POST /submit.

**R6 🟠 Streak Uses 24h Milliseconds Instead of Calendar Days (High)**
`Math.floor((todayDate - lastDate) / 86400000)` counts 24-hour periods, not calendar days. If a student submits at 11:59 PM and again at 12:01 AM, diffDays=0 — streak never increments for consecutive days.
**Fix:** Added `calendarDayDiff(a, b)` which computes `Date.UTC(y,m,d)` for both dates (stripping time) and divides by 86400000. Streak logic now compares actual calendar dates.

**R7 🟡 No Validation pass_score ≤ total_score (Medium)**
A teacher could create/update a recitation with `pass_score=100, total_score=10` making it impossible for any student to pass.
**Fix:** Added `if (passSc > totalSc) return 400` in both POST / and PUT /:id. Also validates `passSc >= 0` and `totalSc >= 1`.

**R8 🟡 Timer-Expired Submit Error Leaves Student Stuck (Medium)**
When the server-side timer expired and `POST /submit` returned `timer_expired: true`, the frontend `catch` block only called `toast.error(msg)` but left the view at `'take'`. Students were stuck with no way to exit except navigating away.
**Fix:** Added `else if (data.timer_expired)` branch that calls `toast.error`, clears localStorage answers, and `setView('list')`.

**R9 🟡 No Date Range Validation (Medium)**
No check that `end_date > start_date`. A teacher could set end before start, making the recitation immediately expired on creation.
**Fix:** Added `if (start_date && end_date && new Date(end_date) <= new Date(start_date)) return 400` in POST / and PUT /:id.

**R10 🟡 No Answer Sanitization in Submit (Medium)**
The `answers` array accepted any `a.answer` string (could be `"correct_answer_letter"` or arbitrary garbage), and had no size limit.
**Fix:** Added `answers.length > 500 → 400`. Each answer's letter is validated against `VALID_ANSWER_LETTERS = Set(['A','B','C','D','T','F'])`. Invalid letters stored as `null` (score as wrong/unanswered).

**R11 🔵 Dead Variable scorePerQ (Minor)**
`scorePerQ` was computed at the top of the scoring loop but never used inside — actual scoring used `q.points` directly.
**Fix:** Removed the variable entirely. Scoring logic now uses only `rawScore += (q.points || 1)` and the `totalPoints` normalization at the end.

## Where things are
- Backend: `server/routes/recitations.js` — complete rewrite with all fixes + correct route order
- Scheduler: `server/scheduler.js` — transaction uses `pool.connect()` dedicated client
- Frontend: `client/src/pages/student/Recitations.jsx` — sendBeacon → fetch keepalive, timer_expired redirect
