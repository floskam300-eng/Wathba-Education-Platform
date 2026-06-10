---
name: Archive section audit 2026-06
description: 12 bugs fixed in archive backend (archive.js) and frontend (Archive.jsx, StudentArchiveModal.jsx)
---

## Bugs Fixed

### Backend (server/routes/archive.js)
- **A1**: Invalid `date_from`/`date_to` strings caused 500 (PostgreSQL cast error) — added `isValidDate()` with regex + `Date.parse()` validation → 400 with Arabic error msg. Also validates `date_from <= date_to`.
- **A2**: `avg_score` in `/student/:id/summary` returned raw score (e.g. 16) not percentage (80%) — fixed SQL: `AVG(er.score::numeric / NULLIF(e.total_score,0) * 100)`. Same fix for recitations.
- **A3**: `getTeacherId()` could return `undefined` for malformed JWTs — added explicit check: must be positive int ≤ PG_INT_MAX, else return 400.
- **A4**: Text search was client-side only — works only on current page. Added server-side `q` param using `ILIKE $N` reusing same param index for 3 columns (name, username, title).

### Frontend — StudentArchiveModal.jsx
- **F1** (CRITICAL): `pending` variable referenced on 3 lines but never declared — caused `ReferenceError` crash whenever modal opened. Removed all `pending ? ...` ternaries, replaced with `passed ? ... : 'bg-red-500'` (no yellow/pending state exists anymore).
- **F2**: `baseRole` prop received but never used — removed from signature.

### Frontend — Archive.jsx
- **F3**: `useNavigate`/`navigate` imported and declared but never called — removed.
- **F4**: `i` loop variable in `map((r, i) =>` never used — removed.
- **F5**: `avgScore` in `handlePrintExams` / `handlePrintRecs` computed as average of raw scores → showed as `%` in PDF (e.g. "16%"). Fixed to use `scorePct(score, total)` helper.
- **F6**: Search input was a client-side filter on current page results — renamed state key `search` → `q`, passed as API param, removed client-side `filteredExamResults`/`filteredRecResults` useMemo.
- **F7**: No date range validation in UI — added `min`/`max` HTML attributes on date inputs + toast warning in `setDateFilter` handler.
- **F8**: Quick stats labels updated to "ناجح (هذه الصفحة)" / "راسب (هذه الصفحة)" to make clear they reflect current page, not all results.

## Key Patterns
- PostgreSQL accepts `$N` repeated in same query with same value — one `params.push()` per condition, same `$p` index referenced multiple times in ILIKE OR chain.
- `avg_score` in any summary endpoint must normalize: `score / NULLIF(total_score, 0) * 100`, never raw `AVG(score)`.
- JSX comments `{/* ... */}` don't cause ReferenceError even if they mention variable names — only actual JS expressions do.
