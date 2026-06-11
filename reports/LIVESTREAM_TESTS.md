# Wathba Live Stream — Test Cases
وثيقة حالات الاختبار الشاملة لنظام البث المباشر

---

## 1. Authentication & Access Control

### TC-01: Teacher-only endpoints reject non-teachers
- **How**: POST `/api/live/start` with student JWT
- **Expected**: 403 Forbidden
- **Covers**: `requireRole('teacher')` middleware

### TC-02: Student cannot award points
- **How**: POST `/api/live/:id/award-points` with student JWT
- **Expected**: 403 Forbidden

### TC-03: Student cannot kick other students
- **How**: POST `/api/live/:id/kick/:studentId` with student JWT
- **Expected**: 403 Forbidden

### TC-04: Unauthenticated request blocked
- **How**: Any `/api/live/*` without Authorization header
- **Expected**: 401 Unauthorized

### TC-05: Teacher cannot see another teacher's viewers
- **How**: GET `/api/live/:othersStreamId/viewers` with valid teacher JWT but stream belongs to another teacher
- **Expected**: 404 or 403

---

## 2. Stream Lifecycle

### TC-10: Start stream — success
- **How**: POST `/api/live/start` with `{ title, access: 'all', chat_enabled: true }`
- **Expected**: 200, `stream` object with `status='active'`, `room_id` set

### TC-11: Starting a new stream auto-ends previous active stream
- **How**: Start stream A, then POST `/api/live/start` again (or start scheduled stream B)
- **Expected**: Stream A status → `ended`; SSE `live_ended` sent to A's viewers

### TC-12: End stream — success
- **How**: POST `/api/live/:id/end`
- **Expected**: 200; stream `status='ended'`; all viewers `is_active=false`; SSE `live_ended` sent to all viewers

### TC-13: End stream that is already ended
- **How**: POST `/api/live/:id/end` after it was already ended
- **Expected**: 404 "البث غير نشط"

### TC-14: Schedule stream in the past
- **How**: POST `/api/live/schedule` with `scheduled_at` = 1 minute ago
- **Expected**: 400 "يجب أن يكون الموعد في المستقبل"

### TC-15: Cancel scheduled stream
- **How**: DELETE `/api/live/scheduled/:id`
- **Expected**: 200; stream deleted from DB

### TC-16: Start a scheduled stream (activate it)
- **How**: POST `/api/live/scheduled/:id/start`
- **Expected**: 200; stream `status='active'`; SSE `live_started` broadcast to eligible students

---

## 3. LiveKit Token

### TC-20: Student gets token for active stream
- **How**: POST `/api/live/:id/livekit-token` with student JWT, stream is `status='active'`
- **Expected**: 200, `{ token, serverUrl }`

### TC-21: Student cannot get token for scheduled (not yet started) stream
- **How**: POST `/api/live/:id/livekit-token` with student JWT, stream is `status='scheduled'`
- **Expected**: 404 "البث غير نشط أو انتهى"

### TC-22: Student cannot get token for ended stream
- **How**: POST `/api/live/:id/livekit-token`, stream `status='ended'`
- **Expected**: 404 "البث غير نشط أو انتهى"

### TC-23: Token rate limiter — 11th request within 60s blocked
- **How**: POST `/api/live/:id/livekit-token` 11 times within 60 seconds as same student
- **Expected**: First 10 → 200; 11th → 429 "طلبات كثيرة جداً"

### TC-24: Token encodes correct canPublish based on permissions
- **How**: Decode the returned JWT (without signature verification)
- **Expected**: `video.roomPublish=false` when student has no `can_speak`/`can_share_screen`;
  `video.roomPublish=true` when either permission is granted

### TC-25: Token for kicked student
- **How**: Kick student, then POST `/api/live/:id/livekit-token`
- **Expected**: 403 (student will be blocked at `/join` before requesting token normally, but direct API call should fail)

---

## 4. Join / Leave / Kick

### TC-30: Student joins active stream
- **How**: POST `/api/live/:id/join`
- **Expected**: 200; row in `live_stream_viewers` with `is_active=true`; teacher receives SSE `live_viewer_update {action:'joined'}`

### TC-31: Student joins stream locked by teacher
- **How**: Lock stream via `/lock`, then student POST `/api/live/:id/join`
- **Expected**: 403 "الغرفة مقفلة"

### TC-32: Kicked student cannot rejoin — concurrent requests
- **How**: Kick student. Then immediately send 2 concurrent `/join` requests
- **Expected**: Both blocked with 403 — the atomic UPSERT ensures no race window

### TC-33: Student leaves stream
- **How**: POST `/api/live/:id/leave`
- **Expected**: 200; viewer row `is_active=false`, `left_at` set

### TC-34: Teacher kicks student
- **How**: POST `/api/live/:id/kick/:studentId`
- **Expected**: 200; viewer `is_kicked=true`, `is_active=false`; student receives SSE `live_kicked`

### TC-35: Student joins stream restricted by academic stage
- **How**: Stream with `access='stages', allowed_stages=['الصف الأول']`; student has `academic_stage='الصف الثاني'`
- **Expected**: 403 "هذا البث مخصص لمراحل دراسية أخرى"

### TC-36: Student joins stream restricted to specific IDs, not in list
- **How**: Stream with `access='specific', allowed_student_ids=[99, 100]`; student has `id=5`
- **Expected**: 403 "لم تُضَف إلى قائمة المشاركين"

---

## 5. Chat

### TC-40: Send chat message
- **How**: POST `/api/live/:id/chat` with `{ message: 'مرحبا' }`
- **Expected**: 200; message stored; SSE `live_chat` fired to all active viewers

### TC-41: Send message when chat disabled
- **How**: Disable chat on stream; student POST `/api/live/:id/chat`
- **Expected**: 403 "الدردشة معطلة"

### TC-42: Message over 1000 chars rejected
- **How**: POST `/api/live/:id/chat` with 1001-char message
- **Expected**: 400

### TC-43: GET chat with valid `since` param
- **How**: GET `/api/live/:id/chat?since=1717000000000`
- **Expected**: 200; only messages after that timestamp

### TC-44: GET chat with non-numeric `since` param
- **How**: GET `/api/live/:id/chat?since=abc`
- **Expected**: 200 with full message list (since ignored, no crash)
- **Covers**: BUG-7 fix — `parseInt('abc')` returns NaN, query ignores it

### TC-45: GET chat with `since=0` (zero)
- **How**: GET `/api/live/:id/chat?since=0`
- **Expected**: 200 with full message list (zero treated as invalid/ignored)

### TC-46: Teacher chat message stored with sender_type='teacher'
- **How**: Teacher POST `/api/live/:id/chat`
- **Expected**: Row has `sender_type='teacher'`; displayed with teacher styling in client

---

## 6. Permissions (Mic / Screen Share)

### TC-50: Teacher grants student mic permission
- **How**: POST `/api/live/:id/permissions/:studentId` `{ can_speak: true }`
- **Expected**: 200; student row updated; student receives SSE `live_permission_update`

### TC-51: Permission grant triggers LiveKitRoom remount
- **How**: Student is watching (canSpeak=false). Teacher grants mic.
- **Expected**: Client receives SSE, `wasGranted=true`, `livekitKey` bumps, LiveKitRoom remounts with new canPublish=true token

### TC-52: Permission revoke does NOT trigger LiveKitRoom remount
- **How**: Teacher grants mic (step 51), then revokes it.
- **Expected**: Client receives SSE, `wasGranted=false`, `livekitKey` stays same; LiveKitRoom's auto-mute effect calls `setMicrophoneEnabled(false)` locally

### TC-53: Revoked student cannot publish (auto-muted)
- **How**: After TC-52, student's mic button is disabled; LiveKitRoom auto-mute effect fires
- **Expected**: `canSpeak=false` prop triggers `setMicrophoneEnabled(false)` in LiveKitRoom `useEffect`

### TC-54: Teacher cannot grant permissions for student not in stream
- **How**: POST `/api/live/:id/permissions/999` (student 999 not active viewer)
- **Expected**: 404 "الطالب غير موجود في البث أو غير نشط"

---

## 7. Award Points

### TC-60: Teacher awards points during active stream
- **How**: POST `/api/live/:id/award-points/:studentId` `{ points: 10 }`
- **Expected**: 200; `students.points += 10`; SSE `live_points_awarded` sent to student

### TC-61: Teacher cannot award points for ended stream
- **How**: End stream, then POST `/api/live/:id/award-points/:studentId`
- **Expected**: 403 "غير مصرح أو البث غير نشط"
- **Covers**: BUG-8 fix — `AND status='active'` guard

### TC-62: Points capped at 1000 per grant
- **How**: POST with `{ points: 1001 }`
- **Expected**: 400 "الحد الأقصى 1000 نقطة لكل منحة"

### TC-63: Zero or negative points rejected
- **How**: POST with `{ points: 0 }` or `{ points: -5 }`
- **Expected**: 400

---

## 8. Hand Raise

### TC-70: Student raises hand
- **How**: POST `/api/live/:id/hand-raise` `{ raised: true }`
- **Expected**: 200; teacher receives SSE `live_hand_raise`

### TC-71: Student raises hand when hand_raise_enabled=false
- **How**: Disable hand raise on stream; student POST
- **Expected**: 403 "رفع اليد معطل في هذا البث"

### TC-72: Student lowers hand even when hand_raise_enabled=false
- **How**: Stream has `hand_raise_enabled=false`; `{ raised: false }`
- **Expected**: 200 — lowering should always be allowed

---

## 9. Room Lock

### TC-80: Teacher locks room — new joins blocked
- **How**: POST `/api/live/:id/lock` `{ locked: true }`; then student POST `/api/live/:id/join`
- **Expected**: Student gets 403 "الغرفة مقفلة"

### TC-81: Teacher unlocks room — joins allowed again
- **How**: POST `/api/live/:id/lock` `{ locked: false }`; then student POST `/api/live/:id/join`
- **Expected**: 200

### TC-82: Existing viewers stay connected when room is locked
- **How**: Student joins, then teacher locks room
- **Expected**: Student already inside is not kicked; lock only prevents new joins

---

## 10. Input Validation

### TC-90: allowed_student_ids with non-integers rejected
- **How**: POST `/api/live/start` with `{ allowed_student_ids: ['abc', 'xyz'] }`
- **Expected**: 400 "allowed_student_ids يجب أن تكون أرقام صحيحة موجبة"
- **Covers**: BUG-6 fix

### TC-91: allowed_student_ids exceeding 500 entries rejected
- **How**: POST `/api/live/start` with array of 501 IDs
- **Expected**: 400

### TC-92: Title over 200 chars rejected
- **How**: POST `/api/live/start` with 201-char title
- **Expected**: 400

### TC-93: Empty title rejected
- **How**: POST `/api/live/start` with `{ title: '' }`
- **Expected**: 400 "عنوان البث مطلوب"

### TC-94: Invalid access value rejected
- **How**: POST `/api/live/start` with `{ access: 'private' }`
- **Expected**: 400 "قيمة access غير صالحة"

---

## 11. SSE Real-Time Events

### TC-100: Teacher receives viewer_update on student join/leave
- **Setup**: Teacher SSE connected; student joins then leaves
- **Expected**: Teacher SSE receives `live_viewer_update {action:'joined'}` then `{action:'left'}`

### TC-101: Student receives live_started when teacher starts
- **Setup**: Student SSE connected; teacher starts stream
- **Expected**: Student SSE receives `live_started` event

### TC-102: Student receives live_ended when teacher ends
- **Setup**: Student joined and watching; teacher ends stream
- **Expected**: Student SSE receives `live_ended`; client shows "انتهى البث"

### TC-103: Student not in stream does not receive chat messages
- **How**: Student B not joined; teacher sends chat message
- **Expected**: Student B's SSE receives no `live_chat` event

---

## 12. Frontend — LiveKitRoom Component

### TC-110: Toggle mic — state only changes on SDK success
- **How**: Deny browser mic permission; click mic button
- **Expected**: Mic button stays in current state (not toggled); no toast error shown
- **Covers**: FE-BUG-4 fix

### TC-111: Toggle camera — state only changes on SDK success
- **How**: Deny browser camera permission; click camera button
- **Expected**: Camera button stays disabled; state not flipped
- **Covers**: FE-BUG-4 fix

### TC-112: Toggle screen share (stop) — state only changes on SDK success
- **How**: Share screen, then stop it — SDK call fails
- **Expected**: `screenSharing` state stays `true`; button shows "إيقاف العرض"
- **Covers**: FE-BUG-3 fix

### TC-113: Student permission revoke — no video interruption
- **How**: Teacher grants mic, student uses it, teacher revokes mic
- **Expected**: Video stream continues uninterrupted; `livekitKey` unchanged; mic disabled locally

### TC-114: Student permission grant — LiveKitRoom remounts once
- **How**: Teacher grants mic to student who had no permissions
- **Expected**: `livekitKey` bumps by 1 exactly; one token request; new token has canPublish=true

### TC-115: Audio autoplay blocked — unlock button appears
- **How**: Student joins in a browser with strict autoplay policy
- **Expected**: "فعّل الصوت" button appears; clicking it calls `room.startAudio()`

### TC-116: Reconnecting overlay on temporary disconnection
- **How**: Simulate network interruption (DevTools → offline briefly)
- **Expected**: Overlay "جارٍ إعادة الاتصال..." appears; disappears when reconnected

### TC-117: Max manual retries reached — no more retry button
- **How**: Force 3 connection failures in a row
- **Expected**: After 3rd failure, retry button disappears; advisory message shown

---

## 13. Docker / VPS Infrastructure

### TC-120: LiveKit port 7880 not exposed to internet
- **How**: `curl http://VPS_IP:7880` from external machine
- **Expected**: Connection refused — only Caddy (443) exposes it via TLS

### TC-121: WebSocket signaling works through Caddy TLS
- **How**: Connect LiveKit client to `wss://live.wathba.site`
- **Expected**: Successful WebSocket handshake; no 400/502 errors

### TC-122: UDP media ports reachable
- **How**: Check firewall: `nc -uz VPS_IP 50000`
- **Expected**: Port is open (no "connection refused")

### TC-123: LiveKit healthcheck passes
- **How**: `docker compose ps` on VPS
- **Expected**: `livekit` service shows `healthy`

### TC-124: node_ip set correctly — ICE candidates resolved
- **How**: Check LiveKit logs for `using node IP`
- **Expected**: Shows your VPS public IPv4, not 0.0.0.0 or 127.0.0.1

---

## 14. Edge Cases & Race Conditions

### TC-130: Student sends 2 concurrent join requests while kicked
- **Scenario**: Kicked student immediately sends 2 parallel POST `/join` requests
- **Expected**: Both receive 403 — atomic UPSERT prevents race (BUG-1 fix)

### TC-131: Teacher ends stream while student is joining
- **Scenario**: Teacher ends stream at exact moment student hits `/join`
- **Expected**: Student gets 404 "البث غير نشط" (stream status check before upsert)

### TC-132: Points awarded 1 ms before stream ends
- **Scenario**: Race between `/award-points` and `/end`
- **Expected**: Points awarded succeeds if stream still `active` at time of DB check; fails if already ended

### TC-133: Chat `since` is a floating-point number
- **How**: GET `/api/live/:id/chat?since=1717000000000.5`
- **Expected**: `parseInt` truncates to valid integer; works correctly

### TC-134: Chat `since` is a negative number
- **How**: GET `/api/live/:id/chat?since=-1`
- **Expected**: `since <= 0` guard ignores it; returns full chat history
