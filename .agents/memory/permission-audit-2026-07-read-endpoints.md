---
name: Permission audit 2026-07 — unguarded read endpoints
description: Recurring bug class where GET/list endpoints ship without the permission gate their write-side siblings have, or without the gate the frontend already assumes
---

## The recurring bug class
In this codebase, write endpoints for a feature (create/update/delete) reliably get the
correct `checkXPerm`/`checkPermission` gate for assistants, but the read/list endpoint for
the same feature is frequently left ungated — either with no `requireRole` at all, or with
`requireRole('teacher','assistant')` and no inline permission check. This was true again in
this pass (`teachers.js` at-risk-students, `notifications.js` /students + /log,
`courses.js` GET /:id/content) after several earlier passes (M-1..M-8, security-audit-m9-m18)
already fixed the same class of bug in other files.

**Why:** Read endpoints feel "less dangerous" than mutations, so the permission check gets
added to the mutation route during code review and the analogous list/detail route is missed.
Several of these endpoints return real PII (phone, parent_phone) or content that should be
gated behind a specific granted permission (e.g. course content behind `can_manage_courses`).

**How to apply:** When auditing or adding a new assistant-permission-gated feature, always
check the READ endpoint(s) for that feature with the same scrutiny as the mutation endpoints
— grep every route in the file for `requireRole` and confirm each one that touches
assistant-visible data also has a permission check, not just the POST/PUT/DELETE ones.
Also cross-check the frontend route/nav gate against the backend: a frontend-only permission
gate on a content page (e.g. `can_manage_courses` gating `/courses/:id` in the UI) is not a
security boundary if the underlying API has no matching backend check — direct API calls
bypass it entirely.

## Permission-combination design tension
A single boolean permission is sometimes used to gate BOTH "can view the list" and
"can perform one specific mutation on list items" (e.g. `can_view_analytics` gating
`GET /students`, action-only assistants with `can_add_students` but not
`can_view_analytics` couldn't ever see the roster to operate on it). When fixing an
unguarded read endpoint, don't reflexively add the single "most related" permission —
check whether OTHER permissions also legitimately need list access to function, and gate
with an any-of check across all of them if so.

## Cache invalidation is already correct
`invalidatePermissions()` (assistants.js) and `invalidateAssistantAuthCache()` are already
wired correctly into the permission-update and assistant-delete endpoints — permission
changes and deletions take effect immediately, no TTL delay. Confirmed via tests that
grant/revoke and delete-then-reuse-token scenarios behave correctly. Don't re-audit this
unless a new caching layer is introduced.
