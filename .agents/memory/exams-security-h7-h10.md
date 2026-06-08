---
name: Exams security fixes H7-H10
description: Four security fixes for the exams section — device bypass, JWT in URLs, snapshot mismatch, bank exam submit fallback
---

## H-7: device_id required for student logins
- Added check in `server/routes/auth.js` AFTER the suspension check but BEFORE the device tracking block
- If `!device_id` for a student → 400 `DEVICE_ID_REQUIRED`
- The client (Login.jsx) already calls `getOrCreateDeviceId()` and sends it — so real users are unaffected
- **Why:** The `if (device_id)` guard let API callers bypass device limits by omitting the field

## H-8: JWT in query string
### SSE Tickets
- Added in-memory `_sseTickets` Map in `server/routes/auth.js` with 30s TTL, one-time use
- `POST /api/auth/sse-ticket` → returns `{ ticket }` (requires Bearer JWT)
- `GET /api/sse` accepts `?ticket=` first, falls back to `?token=` for backward compat
- `consumeSSETicket` is exported via `module.exports.consumeSSETicket` AFTER `module.exports = router` (important — assigning before the module.exports override is a no-op)
- `client/src/hooks/useSSE.js` fetches ticket first via fetch() then connects EventSource with ticket URL

### Media Access Tokens
- `POST /api/auth/media-token` → issues 15-min JWT with same user payload + `media_only: true`
- Client module: `client/src/lib/mediaAccess.js` — stores token in memory, auto-refresh every 12min
- Layouts (Teacher/Student/Assistant) call `refreshMediaToken()` on mount with `useEffect`
- `AuthContext.logout()` calls `clearMediaToken()` to wipe the in-memory token
- All `withToken()` usages replaced: import from `mediaAccess.js` instead of local localStorage reads

## H-9: Snapshot mismatch on re-entry
- In `GET /:id/take`, changed `ON CONFLICT DO NOTHING` to `RETURNING started_at`
- If `insertRes.rows.length === 0` (session existed), re-read the stored snapshot and set `questions = storedSnap`
- Ensures client always gets the same questions that are stored for scoring — critical for shuffled/bank exams
- **Why:** Old code used DO NOTHING (preserving old snapshot) but returned freshly generated questions array — mismatch on re-entry

## H-10: Bank exam submit without snapshot
- In `POST /:id/submit`, replaced the `else` fallback (DB lookup by submitted IDs) with a 409 rejection
- Error code: `NO_SESSION_SNAPSHOT`
- **Why:** The fallback let attackers forge question IDs from the bank that were never shown to them
- A valid exam session always has a snapshot (created by GET /take) — no snapshot = student bypassed the normal flow
