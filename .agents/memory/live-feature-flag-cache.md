---
name: Live feature flag cache
description: server/routes/live.js — feature flag now cached in-memory; how to bust it when toggling the feature.
---

## Rule
`server/routes/live.js` caches `features_enabled.live_streaming` per teacher in `_liveFeatureCache` (Map) with TTL 60 s.

**Why:** Without the cache every request to any `/api/live` route (SSE tickets, chat, heartbeat, token refresh) hit `SELECT features_enabled FROM teachers WHERE id=$1`. In an active stream with 50 students this was dozens of DB queries per second for a value that almost never changes.

## How to apply
- If an admin endpoint toggles `features_enabled` on a teacher, call `invalidateLiveFeatureCache(teacherId)` (exported from `live.js`) to bust the cache immediately instead of waiting 60 s.
- Import pattern: `const { invalidateLiveFeatureCache } = require('./live');`
- The cache is module-level — it resets on server restart, which is fine (feature flags are rare changes).
