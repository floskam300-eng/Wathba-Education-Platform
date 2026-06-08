---
name: L1-L6 S1-S5 audit fixes
description: 11 bugs fixed in June 2026 second pass — auth cache, SSE, JWT refresh, seed, schema integrity, security
---

## Fixed bugs

**[L-1]** `_studentCache` now stores `{ valid, suspended, at }`. Cache-hit path checks `cached.suspended` and returns 403+account_suspended (was always 401). Both `authenticate()` and `verifyFullToken()` updated. `api.js` intercepts 403+account_suspended separately from 401 and dispatches `wathba_account_suspended` event.

**[L-2]** `sse.js`: `MAX_SSE_CONNECTIONS_PER_USER=5`; `addClient()` evicts oldest connection (Set insertion order) before admitting new one. `server/index.js`: `sseLimiter` (10 req/min per IP, skip localhost) applied to `GET /api/sse`. `getTotalConnections()` exported.

**[L-3]** `POST /api/auth/refresh` in `auth.js` routes: blacklists old token and issues fresh 7-day JWT when TTL ≤ 24h; returns `{refreshed:false}` otherwise. Client `api.js` calls `maybeRefreshToken()` on each request (once per tab, no-op if >24h left).

**[L-4]** `seed.js` whatsapp block (section 23) wrapped in `try { … } catch(waErr)` — seed no longer crashes on schemas that don't have `whatsapp_schedules` yet.

**[L-5]** `useAntiCapture.js`: added `reportAttemptToServer(type)` (debounced 3s, fire-and-forget) that POSTs to `/api/events/capture-attempt`. New event `visibilitychange` detected. `events.js`: new `POST /capture-attempt` endpoint inserts into `device_alerts` (debounced 10s server-side).

**[L-6]** `PlatformHome.jsx` `isDevHost`: removed `.replit.dev`, `.replit.app`, `.repl.co` — only `localhost` / `127.0.0.1` show the DevAccessPanel.

**[S-1]** `CREATE UNIQUE INDEX uidx_retry_req_pending ON exam_retry_requests(student_id,exam_id) WHERE status='pending'` — blocks duplicate pending retries.

**[S-2]** `ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_by_name TEXT` + FK `payments_verified_by_fkey` re-added with `ON DELETE SET NULL`. `payments.js` verify endpoint populates both `verified_by` and `verified_by_name` at verification time.

**Why:** verified_by_name preserves audit trail after assistant deletion; ON DELETE SET NULL prevents orphan FK violation.

**[S-3]** Trigger `trg_check_exam_result_score` via `fn_check_exam_result_score()` — BEFORE INSERT OR UPDATE OF score on exam_results, raises exception if score > exams.total_score.

**[S-4]** Dropped global partial index `uq_students_username_active`; created `uq_students_username_teacher_active ON students(teacher_id,username) WHERE deleted_at IS NULL` — two different teachers can now have students with the same username.

**[S-5]** Trigger `trg_validate_chat_sender` via `fn_validate_chat_sender()` — BEFORE INSERT on live_chat_messages; checks sender_id exists in students (if sender_type='student') or teachers (if 'teacher').
