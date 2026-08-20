# Chapters & Section-Gated Recitations — Test Cases

This document covers the end-to-end test cases for the new "chapters as
first-class containers" feature, where each recitation is tied to a
section (`recitations.section_id`) and a student must pass the recitation
to unlock that section.

## Lock semantic

> **Gate Next Section**: A recitation linked to section X means the
> student must pass it to unlock section X (the section it GATES).
> Section 1 (lowest `sort_order`) is always unlocked by design, so the
> student can start the course.

## DB migration

- **`server/db/migrations/0007_recitations_section.sql`** — adds the
  `section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL` column
  + `idx_recitations_section` index. Idempotent.

Apply with:
```bash
node apply-migrations.js   # one-off script
# OR in production:
bash scripts/vps/run-migrations.sh
```

## Test data (seed)

The seed creates these edge-case scenarios:

| Course | Section | Content | Gate-recitations |
|---|---|---|---|
| c1 (الجبر والمثلثات) | c1s1 (sort=1) | videos + pdfs | none (always open) |
| c1 | c1s2 (sort=2) | videos + pdfs | r1, r2, rt1, rt2 (3 in DB) |
| c1 | c1s3 (sort=3) | videos + pdfs | none (always open) |
| c2 (التفاضل) | c2s1, c2s2 | videos + pdfs | r3, rt3, rt4 |
| c4 (الهندسة) | c4s1, c4s2 | videos + pdfs | r5 |
| c7 (الاستاتيكا) | c7s1 (sort=1) | videos + pdfs | r7, r9 |
| c7 | **c7s2 (sort=2)** | **EMPTY** | **rt5** ← empty chapter edge case |
| c8 (الهندسة الفراغية) | c8s1 | videos + pdfs | r8 |

The "empty chapter" case (c7s2) is the smoking-gun edge case: a teacher
creates the section ahead of time, ties rt5 to it, and the student has
to pass rt5 to unlock an empty chapter. When the teacher later adds
content to c7s2 (videos, PDFs, recitations), it immediately becomes
accessible to students who've passed rt5.

## Test cases

### A. Backend validation

| # | Test | Expected | Status |
|---|---|---|---|
| A1 | `GET /api/courses` (teacher) | 200, returns list | ✅ |
| A2 | `GET /api/courses/:id/content` (teacher) | 200, sections[] array with nested videos/pdfs/recitations | ✅ |
| A3 | All sections have `is_unlocked_for_student: true` for teacher | true | ✅ |
| A4 | `PUT /api/courses/abc/recitations/1/section` (B2) | 400 (was 500) | ✅ |
| A5 | `PUT /api/courses/:id/recitations/abc/section` (B3) | 400 (was 500) | ✅ |
| A6 | `PUT /:id/recitations/:r/section` with `section_id` from another course | 400 + "ينتمي" | ✅ |
| A7 | `PUT /:id/recitations/:r/section` valid move | 200 | ✅ |
| A8 | `PUT /:id/recitations/:r/section` with `section_id: null` to clear gate | 200 | ✅ |
| A9 | `POST /api/recitations` with `section_id` but no `course_id` | 400 + "كورس" | ✅ |
| A10 | `POST /api/recitations` with `section_id` from another course | 400 + "ينتمي" | ✅ |
| A11 | `POST /api/recitations` valid (course_id + section_id) | 201, returns section_id in body | ✅ |
| A12 | `GET /api/courses/c7/content` (teacher) | c7s2 has 0 videos + 0 pdfs + 1 recitation (rt5) | ✅ |

### B. Student-side lock enforcement

| # | Test | Expected | Status |
|---|---|---|---|
| B1 | `GET /api/courses/:id/content` (student) | first section unlocked, second section locked | ✅ |
| B2 | Second section has `gate_progress` with `required > 0` | Yes | ✅ |
| B3 | Section with no gate-recitations is unlocked | true | ✅ |
| B4 | `POST /me/video-progress` for video in LOCKED section | **403 with "فصل مقفل" message** (B1 fix) | ✅ |
| B5 | `POST /me/video-progress` for video in UNLOCKED section | 200 | ✅ |
| B6 | `GET /uploads/videos/:file` for video in LOCKED section | **403** (B11 fix) | ✅ |

### C. Edge cases

| # | Test | Expected | Status |
|---|---|---|---|
| C1 | Empty chapter (c7s2) has videos=0, pdfs=0 | true | ✅ |
| C2 | Empty chapter is locked when it has gate-recitations | true | ✅ |
| C3 | Section with no gate-recitations has `gate_progress: null` | true | ✅ |
| C4 | Course with no sections returns empty sections[] | true | ✅ |
| C5 | Course with no sections + content has `uncategorized` bucket | true | ✅ |
| C6 | Deleted section nullifies recitations.section_id | transactional, no orphans | ✅ |
| C7 | Section DELETE happens in a transaction (videos + pdfs + recs all updated atomically) | true | ✅ |

### D. Migration safety

| # | Test | Expected | Status |
|---|---|---|---|
| D1 | Migration is idempotent (can run twice) | Yes | ✅ |
| D2 | ON DELETE SET NULL — deleting a section doesn't cascade-delete recitations | recitations preserved with section_id=NULL | ✅ |
| D3 | Index `idx_recitations_section` created | yes | ✅ |

## How to run the tests

```bash
# 1. Make sure the server is running on port 3001
cd server && node index.js

# 2. Run the teacher-side test suite
node e2e-test.js
# → 14 passed, 0 failed

# 3. Run the student-side test suite (requires temporarily un-suspending
#    student account, see setup below)
node student-test.js
# → 11 passed, 0 failed
```

### Setup helpers

```bash
# Whitelist a test device for std_ali (one-off)
node -e "const { Pool } = require('pg'); const p = new Pool({connectionString:'postgresql://postgres:postgres@127.0.0.1:5432/wathba'}); (async()=>{await p.query(\"INSERT INTO student_devices (student_id, device_id, device_name, first_seen, last_seen) SELECT id, 'test-stable-device-001', 'test-runner', NOW(), NOW() FROM students WHERE username='std_ali' ON CONFLICT (student_id, device_id) DO UPDATE SET last_seen = NOW()\"); await p.end();})();"

# Un-suspend std_ali (in case demo seed has it suspended)
node -e "const { Pool } = require('pg'); const p = new Pool({connectionString:'postgresql://postgres:postgres@127.0.0.1:5432/wathba'}); (async()=>{await p.query(\"UPDATE students SET is_suspended=false WHERE username='std_ali'\"); await p.end();})();"

# Reset failed_device_attempts
node -e "const { Pool } = require('pg'); const p = new Pool({connectionString:'postgresql://postgres:postgres@127.0.0.1:5432/wathba'}); (async()=>{await p.query('UPDATE students SET failed_device_attempts=0'); await p.end();})();"
```

## Bug fixes applied during this audit

| # | Bug | Fix | Severity |
|---|---|---|---|
| B1 | `/api/students/me/video-progress` didn't check section lock → stale browser could keep earning points on locked videos | Added gate-progress check in the handler | **CRITICAL** |
| B2 | `PUT /api/courses/:id/recitations/:r/section` bad input → 500 (PostgreSQL error) | Added `parseParamId` validation | HIGH |
| B3 | Same as B2 for `courseId` | Same fix | HIGH |
| B5 | Two SQL queries for gateRows + progressRows | Merged into single query with `FILTER` clause | MEDIUM |
| B6 | `onOpenRecitation` ignored the recitation ID | Now navigates with `?edit=<id>`; teacher page reads it | MEDIUM |
| B7 | `RecitationsTabPanel` with single recitation required 2 clicks | Auto-selects when length === 1 | MEDIUM |
| B8 | Dead `lv.linked_video_title` LATERAL queries `video_ids` | Removed from student endpoint | LOW |
| B9 | Dead `recitationsRef` in CourseView.jsx | Removed | LOW |
| B10 | `totalRecitations` useMemo recomputed on derived state | Cleaned deps to use `content` only | LOW |
| B11 | `/uploads/videos/*` middleware didn't check section lock | Added gate-progress check in `checkFileAccess` | **HIGH** |

## Manual UI tests

The following scenarios should be verified manually in the browser:

### Teacher (admin / admin123)
1. Open CourseContent → click "📂 الفصول" tab → add 3 new sections, rename them, drag-drop reorder, delete one (its videos/pdfs/recitations should remain but unassigned).
2. Drag a video from "بدون فصل" into a section → it should appear there.
3. Drag a recitation from one section to another → its `section_id` should change.
4. Open the "📖 التسميعات" tab → existing recitations should appear grouped by their section.
5. Go to `/teacher/recitations?edit=<id>` → the edit modal should open automatically.

### Student (std_ali / 123456)
1. Open CourseView for c1 (الجبر والمثلثات) →
   - Section 1 should be open with all content visible.
   - Section 2 should be locked with "🔒 requires 3 recitations" badge.
   - Section 3 should be open (no gate-recitations).
2. Try to click on a video in section 2 → should not navigate / should show toast error.
3. Navigate to a recitation in section 1 → start it → complete it → return to course → section 2 should now be unlocked.
4. Try c7 (الاستاتيكا) → section 2 (empty) should be locked. Pass rt5 → section 2 should unlock and show "no content" message.
5. Toggle dark mode → all chapter cards should flip colors correctly.
6. Resize browser to mobile → sidebar should collapse below content.

## Known limitations

- **Cache**: `db/migrations/0007_recitations_section.sql` is currently
  only data-migrating the column. The `video_ids` column is still in
  the schema for backward compatibility but is ignored by the new
  logic. Future cleanup migration can drop it after monitoring in prod.
- **YouTube IDs**: Only the `youtube_id` is exposed to students (not
  the raw URL), so the lock-check is moot for YouTube-hosted content.
  The check fires only for uploaded videos that go through
  `/uploads/videos/*`.
- **No background refresh**: The student UI only refreshes the gate
  state when they explicitly click a recitation. If a teacher unlocks
  a section while the student is on the page, they need to refresh
  to see the new state. (Acceptable trade-off — avoiding polling.)

## Future enhancements

- Bulk move: select multiple recitations and move them all at once.
- Time-based unlocks: "section unlocks at midnight on Friday".
- Prerequisite chains: a recitation depends on passing another
  recitation (not just a section).
