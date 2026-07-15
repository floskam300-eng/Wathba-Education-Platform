---
name: Activity log coverage audit
description: How teacher/assistant Activity History gaps were found and the pattern for adding new logged actions
---

Found by diffing every `router.post/put/patch/delete` in `server/routes/*.js` against which ones call `logActivity()` (there's no automated check for this — it's easy for a new mutating route to silently skip logging).

Confirmed bugs: `ACTION_LABELS` in `server/lib/activityLog.js` had entries (`reset_leaderboard`, `reject_retry`, `device_alert_review`) defined but never actually called from any route — the label existed but nobody logged the action.

Whole features had zero activity logging: question banks (`questionBanks.js`), teacher profile/password changes (`teachers.js`), and live-streaming teacher actions (`live.js` — schedule/start/end/kick/permissions/mute/lock/award-points).

**Why:** Student-initiated routes (submit exam, join stream, mark notification read) are intentionally NOT logged — `activity_logs.actor_type` is constrained to `'teacher'|'assistant'` only. Per-question CRUD inside exams/recitations/banks is also intentionally left unlogged for consistency with the existing convention (only top-level entity create/edit/delete/publish is logged, not every sub-item edit) — don't add per-question logging unless the user asks for finer granularity.

**How to apply:** When adding a new teacher/assistant-facing mutating route, call `logActivity({ teacherId, actor: getActor(req), ip: getIp(req), action, entity, details })` from `../lib/activityLog`, add the action to `ACTION_LABELS` in that same file, AND mirror the label/color/entity-icon/filter-dropdown entry in `client/src/pages/teacher/ActivityLog.jsx` — the frontend keeps its own duplicate hardcoded maps and ignores the `action_labels` the backend already returns in the API response.
