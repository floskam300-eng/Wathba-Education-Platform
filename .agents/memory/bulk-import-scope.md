---
name: Bulk import manualPassword Phase 2 scope bug
description: manualPassword must be included in the prepared object to be accessible in Phase 2
---

## Rule
In `server/routes/students.js` bulk import, the `prepared` object must include `manualPassword` (not just `finalPassword`) so Phase 2 can check `!manualPassword || !manualUsername` to decide whether to expose the generated password in `results.created`.

**Why:** The variable `manualPassword` is declared with `const` (block-scoped) inside the Phase 1 `for` loop. It is invisible in Phase 2. Accessing it throws `ReferenceError: manualPassword is not defined` *after* the DB INSERT succeeds, causing both `results.success++` AND `results.failed++` to fire for the same student — doubling the failed count and hiding the bug since the test only checked `success`.

**How to apply:** When splitting async work into phases via a `prepared[]` array, always explicitly list every field the consuming phase needs in the pushed object. Don't rely on closure variables across phase boundaries.
