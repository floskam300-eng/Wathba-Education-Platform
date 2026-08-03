---
name: Bulk import fill-down bleed and stale fixed-stage models
description: Why a "carry forward blank cells" helper in the student bulk-import mapper was actively dangerous, and why saved import models with a fixed academic_stage need explicit re-confirmation on every reuse.
---

## The bug

`applyModelToRows()` in `client/src/pages/teacher/Students.jsx` (the column-mapping
step for teacher bulk student import) used to carry forward the last non-blank
value of name/phone/parent_phone/username/password/gender/academic_stage into
any row where that field was blank — intended to compensate for Excel merged
cells where only the first cell of a merge holds a value.

This was already solved upstream: `parseSheetSmart()` fully expands real merged
cells onto every cell they cover via `ws['!merges']` before `applyModelToRows`
ever runs. So any blank `applyModelToRows` sees is a genuinely empty field for
a distinct student, not a merge continuation. The fill-down therefore smeared
one student's name/stage/credentials onto the next unrelated row whenever a
sheet simply had an empty cell — producing wrong academic-stage assignments
and duplicate-username INSERT failures that looked like students silently
disappearing (only the first few import errors were toasted).

**Why:** any "fill down blank cells" helper placed *after* a merge-expansion
step is redundant at best and a silent data-corruption source at worst — a
blank at that point is real, not a technicality of the spreadsheet format.

**How to apply:** if a future import/spreadsheet feature seems to need
fill-down behavior, verify first whether merge expansion already happened
earlier in the pipeline. Don't add row-to-row carry-forward state into a
per-row mapping function; map each row independently and let a blank stay
blank (server-side, `''`/absent already resolves to `NULL` / auto-generated
value as appropriate — that fallback is correct and sufficient).

## The compounding footgun: reusable models with a fixed stage

The teacher can save a reusable import model that pins `academic_stage` to a
"fixed value" instead of a mapped column. Since models are designed to be
reused indefinitely across future imports, reusing one with a stale fixed
stage from a previous class silently stamps every student in an unrelated new
file with that old stage, with no warning.

**Why:** a setting meant to save re-mapping effort for a *recurring* one-class
workflow becomes a footgun the moment the same model is reused for a
*different* class/grade file.

**How to apply:** any "sticky"/reusable config that hardcodes a value applied
to every future run needs a visible warning + explicit re-confirmation step at
the point of reuse, not just at creation time. In this codebase that surfaces
as a warning banner + required checkbox in the Import Preview modal, and a
smaller banner in the saved-model view, whenever `mappings.academic_stage`
starts with the `__fixed__:` sentinel.
