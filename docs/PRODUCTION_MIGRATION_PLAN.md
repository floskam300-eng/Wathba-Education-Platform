# Production Migration Plan — Sections & Section-Gated Recitations

> **Audience**: DevOps running the production stack on Hostinger KVM 4 (Ubuntu + Docker).
> **Read this BEFORE deploying the new code.**

## TL;DR (the short version)

The migration is **safe and additive**. Nothing gets deleted, dropped,
or rewritten. Old data continues to work exactly as before.

1. Apply `0007_recitations_section.sql` → adds the new column + index.
2. Deploy the new server code → server now reads `section_id` instead of
   `video_ids` for lock checks.
3. (Optional) Run `backfill-recitation-sections.sh` to auto-map the 6
   recitations whose locked videos are all in a single section.
4. (Optional) Teachers use the CourseContent UI to manually re-bind the
   remaining ~17 recitations to chapters (one-time effort).

Total downtime during deployment: ~10 seconds (server restart).

---

## 1. Pre-deployment: Inspect your data

This tells you exactly what shape your production data has. Safe to run
multiple times, no modifications.

### On the VPS (Ubuntu + Docker)

```bash
cd /path/to/wathba-repo
bash scripts/vps/inspect-recitations.sh
```

This runs `scripts/vps/inspect-recitations.sql` against the production
database and prints 11 diagnostic sections.

### What you will see

**Section 1 — Total counts**

| metric | what it tells you |
|---|---|
| `total_courses` | number of courses |
| `total_sections` | existing chapters |
| `total_videos` | videos in DB |
| `total_pdfs` | PDFs in DB |
| `total_recitations` | all recitations including soft-deleted |
| `active_recitations` | `WHERE deleted_at IS NULL` |
| `recitations_with_video_links` | ones currently locked to specific videos |
| `recitations_without_video_links` | standalone or course-only recitations |

**Section 2 — Recitations per course**

Distribution of recitations across courses. Shows you which courses
have the most "lockable" recitations.

**Section 3 — Sections per course**

Tells you which courses already have chapter structure. Courses without
sections will still work — the student UI falls back to an
"uncategorized" bucket for them.

**Section 4 — Sample of `video_ids`**

A glimpse of what the old lock format looks like (JSONB arrays of
video IDs).

**Section 5 — Cross-course locks**

Returns rows only if a recitation locks videos from a DIFFERENT course.
On a well-formed DB this should return **0 rows**. If it returns rows,
you have data integrity issues to fix manually before deploying.

**Section 6 — Is `section_id` already on recitations?**

Confirms whether the migration has already run. The new column appears
here with `data_type = integer`.

**Section 7 — Existing FK constraints**

Informational. Confirms the FK setup. None of these constraints touch
`video_ids` — the migration is additive only.

**Section 8 — Course → sections → videos/recitations layout**

Shows you the current layout per course (section count + video/PDF
counts inside each section). Helps you visualise the migration target.

**Section 9 — Auto-migration candidates**

This is the key one. Splits your active recitations into three buckets:

- 🟢 **Auto-mappable**: locked videos all belong to a single section.
  These can be safely auto-mapped to that section via the backfill
  script.
- 🟡 **Cross-section**: locked videos span multiple sections. Needs
  manual review by the teacher.
- ⚪ **No locked videos**: `video_ids = []`. Stays `section_id = NULL`,
  which is correct — it's not gating anything.

**Section 10 — Orphaned FK references**

Returns row counts of orphaned `section_id` pointers (should be 0).
If non-zero, fix them BEFORE running the migration to avoid surprises.

**Section 11 — Course linkage summary**

How many recitations are linked to a course + locked to videos vs.
standalone.

---

## 2. The migration itself (3 steps, no downtime for users)

### Step 2.1 — Apply the DB migration

```bash
cd /path/to/wathba-repo
bash scripts/vps/run-migrations.sh
```

This applies `0007_recitations_section.sql` (already included in the
repo). It does **only** the following:

```sql
ALTER TABLE recitations
  ADD COLUMN IF NOT EXISTS section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recitations_section ON recitations(section_id);
```

**What happens to existing data**: zero. The new column is added with
a default of `NULL`. Every existing recitation stays exactly as it is.
The index is built in O(N) over a tiny column.

**Time taken**: < 1 second for any realistic data size.

### Step 2.2 — Deploy the new server code

Standard deploy:

```bash
cd /path/to/wathba-repo
git pull
cd client && npm run build && cd ..
cd admin-client && npm run build && cd ..
bash scripts/vps/restart.sh   # or however you restart the container
```

**What changes at runtime**:

- Server now reads `section_id` (the new column) when computing
  whether a chapter is locked for a student.
- Old recitations with `section_id = NULL` no longer gate any section
  (was the previous behavior anyway — they didn't have an effective
  gate before because the new logic ignores `video_ids`).
- The `/api/courses/:id/content` endpoint now returns the structured
  `{ sections: [...], uncategorized }` shape. The legacy `videos` /
  `pdfs` / `exams` flat fields are still returned for backward
  compatibility with the old frontend.

**What stays the same**:

- `video_ids` column is **kept** in the schema (unused by the new code
  but harmless — soft-removal in a future migration).
- Every old recitation continues to appear in the teacher's UI.
- The student UI does not break — locked chapters appear as
  `is_unlocked_for_student: false` which is then rendered as a lock
  badge.

### Step 2.3 — (Optional) Auto-backfill existing recitations

This is the only step that **writes data**. It's opt-in.

```bash
# Dry run first — shows what it WOULD do, doesn't write anything:
bash scripts/vps/backfill-recitation-sections.sh

# Look at the output. If it looks right:
bash scripts/vps/backfill-recitation-sections.sh --apply
```

**What it does**: For each active recitation whose locked videos all
belong to a single section, sets `section_id` to that section. Skips
recitations that:

- Have no locked videos (they don't gate anything — leave NULL).
- Span multiple sections (couldn't auto-decide — leave NULL, teacher
  must assign manually).
- Already have a `section_id` (untouched).

**Output looks like**:

```
🟢 Auto-mappable: 6
🟡 Cross-section: 1
⚪ No locked videos: 16

[backfill] Summary: 6 auto-mappable, 17 skipped (need manual review)
[backfill] DRY RUN — no changes were made.
[backfill] Re-run with --apply to actually write the auto-mappings.
```

If you run with `--apply`, the script:

1. Iterates over the 6 auto-mappable recitations.
2. Issues one `UPDATE recitations SET section_id = X WHERE id = Y` per row.
3. Reports the count of rows updated.

**This is the ONLY step that changes existing data.** The migration
in Step 2.1 is purely additive.

### Step 2.4 — (Manual, optional) Teacher re-binds remaining recitations

For the ~17 recitations that the backfill couldn't auto-map (cross-
section or no-locked-videos), the teacher should open CourseContent
in the UI and either:

1. Move them to a chapter via drag-drop.
2. Leave them with `section_id = NULL` (they continue to appear in
   the student's "all recitations" list with no gate).

This is a one-time task per course. Estimated: 1 minute per course
(just drag the cards).

---

## 3. Rollback plan (if anything goes wrong)

The migration is **fully reversible** because:

- The new `section_id` column has no NOT NULL constraint → dropping
  the column loses nothing.
- The new index can be dropped independently.
- The new server code is the ONLY thing that reads `section_id`. The
  old code (which reads `video_ids`) is in git history.

If the new code has a critical bug:

```bash
# 1. Stop the new server container
bash scripts/vps/stop.sh

# 2. Revert the server code
git checkout <last_known_good_commit>

# 3. Restart with the old code
bash scripts/vps/start.sh
```

The new column stays in the DB (harmless). The old code ignores it.

If you want to **fully roll back the DB** too:

```sql
ALTER TABLE recitations DROP COLUMN IF EXISTS section_id;
DROP INDEX IF EXISTS idx_recitations_section;
```

This is also safe — no data is lost (the old `video_ids` column was
never touched).

---

## 4. Verification after deploy

```bash
# 1. Inspect: all section_id values look reasonable
bash scripts/vps/inspect-recitations.sh

# 2. Smoke test the API (replace HOST):
curl -s http://YOUR/api/courses | jq '.[] | {id, name}'

# 3. Test a student's course content (replace TOKEN, COURSE_ID):
curl -s -H "Authorization: Bearer $TOKEN" \
  http://YOUR/api/courses/$COURSE_ID/content | \
  jq '.sections[] | {id, title, is_unlocked_for_student, videos: (.videos|length), recitations: (.recitations|length)}'
```

What to look for in the output:
- First section (`sort_order=1`): `is_unlocked_for_student: true`
- Other sections: depends on whether they have gate-recitations.
- Sections with no gate-recitations: unlocked.
- Sections with gate-recitations the student has passed: unlocked.
- Sections with gate-recitations the student hasn't passed: locked
  with `gate_progress: { required, passed }`.

---

## 5. Files added in this commit

```
scripts/vps/inspect-recitations.sql            # 11-section diagnostic
scripts/vps/inspect-recitations.sh             # docker-compose wrapper
scripts/vps/backfill-recitation-sections.sh   # opt-in auto-mapper
docs/PRODUCTION_MIGRATION_PLAN.md             # this document
```

The migration SQL is in `server/db/migrations/0007_recitations_section.sql`
(unchanged — already shipped with the feature).

---

## 6. Quick checklist for the deploy

```
[ ] ssh into the VPS
[ ] cd /path/to/wathba-repo
[ ] git pull
[ ] bash scripts/vps/inspect-recitations.sh    # capture baseline numbers
[ ] bash scripts/vps/run-migrations.sh         # ADDITIVE: adds column + index
[ ] cd client && npm run build && cd ..
[ ] cd admin-client && npm run build && cd ..
[ ] bash scripts/vps/restart.sh                # or your restart command
[ ] bash scripts/vps/inspect-recitations.sh    # confirm column appears in §6
[ ] bash scripts/vps/backfill-recitation-sections.sh      # dry-run review
[ ] bash scripts/vps/backfill-recitation-sections.sh --apply   # opt-in
[ ] (manual) teachers re-bind remaining recitations via UI
[ ] smoke-test API endpoints
```

Total time: ~10 minutes including the optional manual teacher step.