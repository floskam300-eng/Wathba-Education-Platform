---
name: Archive & Analytics audit July 2026
description: 5 bugs fixed in archive/analytics sections; server/db/connection.js made env-agnostic; 53 tests written and passing.
---

## Fixed bugs

**BUG-ARC-FILTERS** (`server/routes/archive.js`)
INNER JOIN in `/archive/filters` exams query silently dropped standalone exams (course_id = NULL).  
**Fix:** Changed to LEFT JOIN + `ORDER BY c.name NULLS LAST, e.title`.

**BUG-ANA-DIST-T / BUG-ANA-DIST-A** (`server/routes/teachers.js`, `server/routes/assistants.js`)
`stageDistribution` and `genderDistribution` charts on both Analytics pages were derived from `topStudents` (LIMIT 50 by points), skewing distributions for teachers with many students.  
**Fix:** Added two lightweight aggregate queries (`stageDistribution`, `genderDistribution`) covering ALL students to both analytics endpoints. Frontend (both `teacher/Analytics.jsx` and `assistant/Analytics.jsx`) updated to use these new fields instead of `topStudents`.

**BUG-ANA-KPD** (`client/src/pages/teacher/Analytics.jsx`)
`keepPreviousData: true` is a React Query v4 option silently ignored in v5 (`^5.28.4`). The trend chart blanked out when changing the period filter.  
**Fix:** Imported `keepPreviousData` from `@tanstack/react-query` and changed to `placeholderData: keepPreviousData`.

**BUG-ANA-WRONGQ** (`client/src/pages/teacher/Analytics.jsx`)
`wrongQExamIdx` was never reset when `wrongQData` changed; after data reload with fewer exams the index was stale, making `wrongQData[wrongQExamIdx]` undefined and crashing on `.questions`.  
**Fix:** Added `useEffect(() => { setWrongQExamIdx(0); }, [wrongQData.length])`. Also added `useEffect` to imports.

**BUG-REC-CACHE** (`server/routes/recitations.js`)
`/recitations/analytics` was the only analytics endpoint with no caching, running 6 parallel DB queries on every page visit.  
**Fix:** Added `getCached`/`setCache` import from `analyticsCache` and a 5-minute per-teacher cache (key: `t${teacherId}_rec_analytics`).

## DB connection robustness

`server/db/connection.js` updated to fall back to individual `PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`/`PGPORT` env vars when `DATABASE_URL` is not a full `postgresql://` URL. This lets the server run in the Replit dev environment where `DATABASE_URL` is a short internal reference, not a full connection string.

**Why:** Without this, the server was crashing with `ENOTFOUND base` when the user's DATABASE_URL secret was invalid.

## Test file

`tests/archive-analytics-audit.test.js` — 53 tests, all passing.  
Covers BUG-ARC-FILTERS, BUG-ANA-DIST-T, BUG-ANA-DIST-A, BUG-REC-CACHE, BUG-ANA-WRONGQ, BUG-ANA-KPD plus archive/analytics sanity and isolation checks.
