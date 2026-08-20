# Deployment Guide — Chapters & Section-Gated Recitations

This guide explains how to safely deploy the new chapter-gating feature
to your Hostinger KMV4 VPS. The migration is **additive only** — it
won't break existing data.

---

## TL;DR

```bash
# 1. SSH into your VPS
ssh root@187.127.91.76

# 2. Run the diagnostics FIRST (read-only, safe)
cd /path/to/Wathba-Education-Platform
sudo docker compose exec -T db psql -U wathba -d wathba -f /dev/stdin < scripts/vps/diagnostics.sql

# 3. Look at the output. If section_id column is NOT in the result,
#    the migration hasn't been applied yet. That's expected.

# 4. Deploy the new code (this automatically runs the migration)
bash scripts/vps/deploy.sh

# 5. (Optional but recommended) Backfill section_id from existing video_ids
sudo docker compose exec -T db psql -U wathba -d wathba -f /dev/stdin < scripts/vps/backfill-recitations-by-video-ids.sql

# 6. Verify
sudo docker compose exec -T db psql -U wathba -d wathba -c "
  SELECT
    COUNT(*) FILTER (WHERE section_id IS NOT NULL) AS gated,
    COUNT(*) FILTER (WHERE section_id IS NULL) AS ungated
  FROM recitations WHERE deleted_at IS NULL;
"
```

---

## What's already deployed?

**File changes** (in your repo on the VPS):
- Migration script: `server/db/migrations/0007_recitations_section.sql`
- New API routes: `PUT /api/courses/:id/recitations/:r/section`
- Updated `/api/courses/:id/content` response shape
- Updated teacher UI: `CourseContent.jsx` (recitations tab + drag-drop)
- Updated student UI: `CourseView.jsx` (chapter cards)
- Updated recitation form: `Recitations.jsx` (section dropdown)
- New scripts: `scripts/vps/diagnostics.sql`, `scripts/vps/backfill-recitations-by-video-ids.sql`

**Database changes** (only happens when the migration runs):
- Adds `section_id INTEGER REFERENCES sections(id)` column to `recitations`
- Adds `idx_recitations_section` index
- **Does NOT** delete or alter `video_ids` column
- **Does NOT** delete any existing data

---

## The migration is SAFE — here's why

`0007_recitations_section.sql` is a single ALTER TABLE that adds a
nullable column. PostgreSQL completes this in milliseconds on a
table of any size. The migration is:

| Property | Value |
|---|---|
| Idempotent | ✅ (uses `IF NOT EXISTS`) |
| Reversible | ✅ (`DROP COLUMN section_id`) |
| Affects existing rows | ❌ (all get `section_id = NULL`) |
| Affects other columns | ❌ (only adds) |
| Locks the table | Briefly (milliseconds) |
| Touches `video_ids` | ❌ (column stays) |
| Deletes data | ❌ |

**Worst case scenario**: migration fails halfway. PostgreSQL rolls
back the transaction automatically. The table is unchanged.

---

## Step-by-step deployment

### Step 1: Run diagnostics BEFORE deploying

This is the most important step. It shows you exactly what data you
have right now.

```bash
# Option A: Run via docker exec
sudo docker compose exec -T db psql -U wathba -d wathba \
  -f /dev/stdin < scripts/vps/diagnostics.sql

# Option B: Run via psql directly (if you have it installed)
psql -U wathba -d wathba -f scripts/vps/diagnostics.sql

# Option C: Copy the file into the container first
sudo docker compose cp scripts/vps/diagnostics.sql db:/tmp/diag.sql
sudo docker compose exec -T db psql -U wathba -d wathba -f /tmp/diag.sql
```

The output will show:
1. Whether `section_id` column exists in `recitations`
2. How many recitations use `video_ids` (legacy)
3. How many videos/PDFs already have `section_id`
4. How many courses have no sections
5. A sample of 5 recitations with their full context

Save this output. You'll need it for the backfill decision.

### Step 2: Review the results

**Scenario A** — "I have lots of recitations already using video_ids"
- → Run the backfill script after deployment (Step 5)
- → The script will auto-set section_id based on the videos' actual sections

**Scenario B** — "I have recitations but no sections yet"
- → Migration alone is fine. Recitations will have `section_id = NULL`
- → Teachers will need to assign sections manually via the UI

**Scenario C** — "Most of my recitations are standalone (no course)"
- → Most will have `section_id = NULL` after backfill, which is correct
- → No action needed

### Step 3: Deploy the new code (auto-applies migration)

```bash
cd /path/to/Wathba-Education-Platform
bash scripts/vps/deploy.sh
```

This will:
1. Pull latest code from GitHub
2. Build the new app and admin images
3. Run `scripts/vps/run-migrations.sh` (applies `0007_recitations_section.sql`)
4. Restart the containers
5. Show you the logs

**Total downtime**: ~2-5 seconds during container restart.

### Step 4: Verify the migration was applied

```bash
sudo docker compose exec -T db psql -U wathba -d wathba -c "
  SELECT column_name, data_type
    FROM information_schema.columns
   WHERE table_name = 'recitations' AND column_name = 'section_id';
"
```

Expected output:
```
 column_name | data_type
-------------+-----------
 section_id  | integer
```

If you see this row, the migration ran successfully.

### Step 5: (Optional) Backfill section_id from video_ids

This script is the **smart** part. It looks at each recitation's existing
`video_ids` array, and infers the right `section_id` based on where
those videos actually live.

```bash
sudo docker compose exec -T db psql -U wathba -d wathba \
  -f /dev/stdin < scripts/vps/backfill-recitations-by-video-ids.sql
```

The script does two things internally:

**Phase 1 — Preview (no writes)**: Shows what WILL change for each
recitation. Look for:
- `✅ will set section_id = N` — good, will be updated
- `⏭️ already set` — skip (already migrated)
- `⏭️ no video_ids` — skip (standalone recitation)
- `⏭️ all videos broken` — skip (videos don't exist)
- `⚠️ videos span N sections` — manual fix needed

**Phase 2 — Apply (in a transaction)**: Updates only the recitations
that pass the smart-inference check. Wrapped in BEGIN/COMMIT so
it's atomic.

### Step 6: Final verification

```bash
sudo docker compose exec -T db psql -U wathba -d wathba -c "
  SELECT
    COUNT(*) FILTER (WHERE section_id IS NOT NULL) AS gated_recitations,
    COUNT(*) FILTER (WHERE section_id IS NULL) AS ungated_recitations
  FROM recitations WHERE deleted_at IS NULL;
"
```

Expected: a number for each. The exact split depends on your data.

---

## Rollback plan

If something goes wrong (very unlikely since the migration is additive):

```bash
# 1. Revert the code
git reset --hard origin/main~1

# 2. Rebuild and restart
sudo docker compose build app admin
sudo docker compose up -d --force-recreate app admin

# 3. If you also ran the backfill, undo it:
sudo docker compose exec -T db psql -U wathba -d wathba -c "
  UPDATE recitations SET section_id = NULL;
"

# 4. Only if really desperate: drop the column
sudo docker compose exec -T db psql -U wathba -d wathba -c "
  ALTER TABLE recitations DROP COLUMN section_id;
"
```

---

## FAQ

### Q: Will the migration affect my existing students' progress?
**A: No.** The migration only adds a column. No existing rows are
modified. Student progress (recitation_results, video_progress) is
completely untouched.

### Q: What if a recitation has video_ids that span multiple sections?
**A: The backfill script will skip it.** You'll see a "manual fix
needed" warning. The teacher can manually drag-drop the
recitation to the correct section via the UI.

### Q: What if a video doesn't exist anymore (deleted)?
**A: The backfill script skips it.** No section_id will be set.
The teacher can manually fix via the UI.

### Q: Can I undo the migration?
**A: Yes.** `ALTER TABLE recitations DROP COLUMN section_id` is
safe. The `video_ids` column is untouched so the old behavior
is preserved.

### Q: Does the new code break the old video_ids lock logic?
**A: No.** The new `/api/courses/:id/content` endpoint computes lock
based on `section_id` only. The `video_ids` column is still in the
schema but is ignored. The old `/api/recitations/student/course/:id`
endpoint still queries `video_ids` for sorting, but it's a no-op
since current data has `video_ids` with valid values.

### Q: My DB has millions of recitations. Will the migration timeout?
**A: No.** `ALTER TABLE ADD COLUMN` with a constant default (NULL
in our case) is a metadata-only operation in PostgreSQL 11+ —
it completes in milliseconds regardless of table size. The
index creation takes longer but doesn't block reads/writes.

### Q: Should I run the migration during peak hours?
**A: Recommended to run during low-traffic** (just to be safe). The
downtime is only during container restart (~5s), not during the
migration itself.

### Q: How do I verify the new feature is working?
**A:**

1. Log in as a teacher (admin / admin123)
2. Open any course → click "📂 الفصول" tab
3. Open any course → click "📖 التسميعات" tab (new!)
4. Log in as a student (std_ali / 123456)
5. Open the course → see chapter cards (not flat tabs!)

---

## Files added in this update

| File | Purpose |
|---|---|
| `server/db/migrations/0007_recitations_section.sql` | Migration (additive) |
| `scripts/vps/diagnostics.sql` | Pre-deploy inspection |
| `scripts/vps/backfill-recitations-by-video-ids.sql` | Smart backfill |
| `docs/CHAPTERS_AND_SECTION_GATED_RECITATIONS.md` | Feature documentation |
| `docs/CHAPTERS_DEPLOYMENT_GUIDE.md` | This file |

## Files modified

| File | Why |
|---|---|
| `server/routes/courses.js` | New /content response shape + new PUT route |
| `server/routes/recitations.js` | POST/PUT support section_id |
| `server/routes/students.js` | Section lock check on video progress |
| `server/index.js` | Section lock check on uploaded videos |
| `server/db/seed.js` | Demo section_id values |
| `client/src/pages/teacher/CourseContent.jsx` | Recitations tab + drag-drop |
| `client/src/pages/teacher/Recitations.jsx` | Section dropdown |
| `client/src/pages/student/CourseView.jsx` | Chapter cards UI |
| `tests/chapter-e2e/teacher-test.js` | 14 e2e tests |
| `tests/chapter-e2e/student-test.js` | 11 e2e tests |
