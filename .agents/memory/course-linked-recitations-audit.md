---
name: Course-linked recitations audit
description: 17 bugs fixed in the video-gated recitations feature (CourseView, recitations.js, courses.js)
---

## Summary
17 bugs fixed across server and client for the feature that links recitations to course videos as gatekeepers.

## Critical Fixes (C1-C3)

**C1 — Server-side video lock** (`courses.js` GET `/:id/content`):
- Before: lock was client-only; any student could bypass by calling the API directly.
- Fix: after fetching videos for students, run a second query with `bool_or(rr.passed) GROUP BY r.id, r.video_ids` to build a `lockedVideoIds` Set. Annotate each video (index > 0) with `is_locked: true/false`.
- Client now reads `v.is_locked` (server-authoritative); falls back to `courseRecitations` check for teacher preview.

**C2 — Standalone recitations access** (`CourseView.jsx` RecitationsTabPanel):
- Before: sidebar link removed left standalone (non-course-linked) recitations inaccessible.
- Fix: added "كل التسميعات (مستقلة)" link button at bottom of RecitationsTabPanel list view.

**C3 — video_ids ownership validation** (`recitations.js` POST + PUT):
- Before: teacher could set video_ids from another course.
- Fix: after course ownership check, run `SELECT id FROM videos WHERE id = ANY($1::int[]) AND course_id = $2` and return 400 if count mismatches.

## High Fixes (H1-H6)

**H1** — Removed stale `document.documentElement.classList.contains('dark')` read in RecitationsTabPanel (was evaluated once, never reactive; component uses hardcoded dark colors anyway).

**H2** — `JSON.parse(saved)` in `startRec` wrapped in try/catch; clears corrupted localStorage entry on parse error.

**H3** — Timer stale closure: added `handleSubmitRef` ref, assigned `handleSubmitRef.current = handleSubmit` synchronously in render body. Timer effect calls `handleSubmitRef.current?.(true)` instead of captured stale `handleSubmit`.

**H4** — Mobile "التالي" button: added `isVideoLocked(next, idx+1)` check; shows lock icon and redirects to recitations tab if locked.

**H5** — LATERAL join ordering: changed `ORDER BY rr2.created_at DESC` → `ORDER BY rr2.passed DESC, rr2.created_at DESC`. If student ever passed, `my_passed=true` is returned even if a later re-attempt failed — video stays unlocked.

**H6** — `isVideoLocked` converted to `useCallback`; uses `v.is_locked` (O(1) property access) rather than iterating courseRecitations per call.

## Medium Fixes (M1-M6)

**M1** — `getRecStatus(rec)` helper added to RecitationsTabPanel: shows "انتهى الوقت" / "لم يبدأ بعد" badges. "ابدأ" button hidden for expired/upcoming recitations.

**M2** — `parsedCourseId` NaN guard: `Number.isFinite(rawCourseId) && rawCourseId > 0 ? rawCourseId : null` in POST and PUT.

**M3** — `starting` (boolean) replaced with `startingId` (null|number) so only the clicked recitation's button is disabled/shows spinner.

**M4** — `onPassed` callback prop added to RecitationsTabPanel; called when `data.passed` after submit. Parent passes `() => { refetchRecitations(); setActiveTab('videos'); }` to auto-switch to the videos tab.

**M5** — RTL arrow: `← العودة للقائمة` → `العودة للقائمة →`.

**M6** — Dead `onStartRec` prop removed from RecitationsTabPanel signature and call site.

## Low / Schema Fixes (L1-L2)

**L1** — GIN index: `CREATE INDEX IF NOT EXISTS idx_recitations_video_ids ON recitations USING GIN (video_ids)` added to schema.sql.

**L2** — Teacher recitation list card shows `🔗 مرتبط بكورس` badge when `rec.course_id` is set.

## Key design decision
**Why:** Video lock must be server-authoritative. Client-side-only lock is trivially bypassed. The server computes it by checking `bool_or(passed)` across ALL results (not just latest), so once a student passes, the video stays unlocked permanently regardless of re-attempts.
