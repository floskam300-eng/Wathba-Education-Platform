---
name: SecurePdfViewer round-3 audit
description: 6 bugs fixed across 4 files in the third full audit pass of the SecurePdfViewer feature; 40/40 tests pass.
---

## Fixes

**F-1 — `isLoading` stuck at `true` (SecurePdfViewer.jsx)**
When `pdf.file_url` is null/empty the load `useEffect` returns early without
resetting state. `isLoading` is initialised `true`, so the spinner shows forever.
Fix: unified early-return that calls `setIsLoading(false)` (+ resets all related
state + cancels any in-flight render/doc) when `!pdf?.file_url || !user?.id`.

**S-1 — Unknown role bypasses `verifyFullToken` (server/middleware/auth.js)**
Three `if (decoded.role === ...)` blocks cover teacher/student/assistant.
Any other role (e.g. `role='superadmin'`) fell through all blocks and returned
the decoded token — `checkFileAccess` then returned `false` (403), not 401.
Fix: add `KNOWN_ROLES = ['teacher','student','assistant']` guard after the three
role blocks; throw `{ statusCode: 401 }` for anything else.
**Why:** The semantically correct response for an unrecognised credential is
Unauthorized (401), not Forbidden (403).  Also closes a theoretical privilege
escalation where a crafted token could reach `checkFileAccess` directly.

**A-1 — 403 response body says "Unauthorized" (server/index.js)**
`makeProtectedUploadsMiddleware` caught `verifyFullToken` errors and always sent
`res.send('Unauthorized')` regardless of the `statusCode`. Suspended students
get 403, whose correct body is "Forbidden".
Fix: `const body = status === 403 ? 'Forbidden' : 'Unauthorized';`

**A-2 — `withToken` breaks if URL already has query params (mediaAccess.js)**
`${url}?token=…` produced `…?foo=bar?token=…` (two `?`) when the URL already
contained a query string.
Fix: `const sep = url.includes('?') ? '&' : '?';`

**A-3 — `refreshMediaToken` race condition (mediaAccess.js)**
Concurrent callers (multiple layout components mounting simultaneously) each
fired a separate POST /api/auth/media-token before any resolved. N requests
instead of 1.
Fix: `let _pendingFetch = null;` promise coalescing — if a fetch is already
in flight, return the same Promise; clear `_pendingFetch` in `.finally()`.

**T-1 — `cleanStudentByUsername` only deleted first match (tests/)**
`r.rows[0]` — if prior run left both a soft-deleted and an active student with
the same username, only the first was cleaned, leaving the active one behind
and causing the seed INSERT to fail.
Fix: `for (const row of r.rows) { … }` loop.

## Test suite progression
- Round 1: 26 tests
- Round 2: 31 tests
- Round 3 (this pass): 40 tests (9 new in Suite J)
