---
name: Performance audit Phase 3 2026-07
description: All performance fixes applied across Phase 1-3; what was changed and key decision notes.
---

## Indexes added (schema.sql)
- `idx_students_name_trgm` — GIN pg_trgm for ILIKE name search
- `idx_activity_logs_actor` — (actor_id, actor_type)
- `idx_videos_section_id`
- `uq_recitation_sessions_student_rec` — named unique
- DROP `idx_students_username` — superseded by uq_students_username_teacher_active
- `idx_exam_results_active` — partial (exam_id, student_id) WHERE is_latest=true AND is_absent=false
- `idx_students_teacher_points` — (teacher_id, points DESC) WHERE deleted_at IS NULL
- `idx_video_progress_student_watched` — (student_id, last_watched_at DESC)

## Caches added
- `t{id}_dashboard_counts_v1` — teacher dashboard 8-query result (analyticsCache, 5 min)
- `_statsCache` — admin /stats (module-level, 5 min)
- `_pubCache` — public /info (5 min) + parent-lookup rank (2 min)
- `_liveFeatureCache` — live route feature flag per teacher (60 s); see live-feature-flag-cache.md

## Other
- `autoPlay` removed from CourseContent.jsx:221 → `preload="none"`
- `staleTime` raised 15 s → 60 s on both queries in Courses.jsx
- Dashboard revenue query: `IN (subquery)` → `JOIN` for better index use
- Student login: `SELECT *` → explicit columns in auth.js
- Badges query: explicit columns + LIMIT 50 in students.js
- LATERAL subquery in recitations.js: `SELECT *` → 6 explicit columns
- Export students: LIMIT 10000 safety net in teachers.js

**Why C-2 (polling on Requests/Payments/RetryRequests) was NOT changed:** User confirmed this is intentional behavior, not a bug.
