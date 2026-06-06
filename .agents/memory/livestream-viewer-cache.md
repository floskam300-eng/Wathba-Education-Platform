---
name: LiveStream viewer cache pattern
description: In-memory viewer cache eliminates DB query on every chat fan-out; maintained by join/leave/kick/end endpoints; token endpoint rate-limited.
---

## Rule
`server/routes/live.js` maintains `viewerCache: Map<string, Set<number>>` (streamId → Set of studentIds).
Every chat message fan-out calls `getActiveViewerIds(streamId)` which reads the cache, not the DB.

## Cache lifecycle
- **join** → `vcAdd(streamId, studentId)`
- **leave** → `vcRemove(streamId, studentId)`
- **kick** → `vcRemove(streamId, studentId)`
- **end** → `vcClear(streamId)`
- **start / scheduled-start** (ending old active streams) → `vcClear(oldStreamId)`

## Cold-start / DB fallback
On server restart the cache is empty. `getActiveViewerIds` checks `viewerCache.has(key)`:
- Cache hit → return `[...viewerCache.get(key)]` (O(1), no DB)
- Cache miss → query `live_stream_viewers WHERE is_active=true`, warm cache, return ids

## Token rate limiting
`tokenRateCheck(userId, streamId)` — max 5 LiveKit token requests per student per stream per 60 s.
Key: `"${studentId}:${streamId}"` in `tokenRateMap`. Stale entries cleaned every 2 minutes
alongside `chatRateMap`.

**Why:** Without the cache, every chat message caused a SELECT on `live_stream_viewers`. With many
concurrent students chatting, this created a flood of small queries proportional to viewers × messages.
The cache reduces that to O(1) memory lookup per message.

**How to apply:** Any new endpoint that changes viewer active-state must call the corresponding
`vcAdd` / `vcRemove` / `vcClear` helper — otherwise the cache drifts from DB truth.
