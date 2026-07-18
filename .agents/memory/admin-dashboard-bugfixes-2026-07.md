---
name: Admin dashboard bug fixes — July 2026
description: 6 bugs fixed in admin.js, auth.js, TeacherForm.jsx; 131 tests pass across 4 suites
---

## Bugs fixed

**SQL-1 (Critical)**: `server/routes/admin.js` line ~377 — plan validation IN-clause used bare index numbers (`1, 2, 3`) not `$1, $2, $3`. Fixed via `sed` (Edit tool escapes `$` in template literals, breaking `$${i+1}` → must use sed for this pattern).

**SQL-2 (Critical)**: same file lines ~842, ~848 — dynamic subscriptions filter used `${values.length}` (bare number) instead of `$${values.length}`. Same sed fix required.

**SQL-3**: `getTeacherStats` storage calc queried `logo_url, photo_url, hero_image_url` but not `logo_wide_url` — file size was silently underreported. Fixed by adding `logo_wide_url` to the SELECT and the filePaths push.

**SEC-1**: Admin logout was client-only (no server-side revocation). Fixed in two parts:
1. `requireAdminAuth` in `auth.js` now checks `_tokenBlacklist` before JWT.verify.
2. Admin logout route now calls `blacklistToken()` from auth.js (not manual DB insert).
Note: the `blacklistToken` function already existed and maintained the in-memory Map; it just wasn't wired into requireAdminAuth.

**UI-1 (Frontend)**: `handleSlugChange` in TeacherForm.jsx didn't normalize in real-time — user saw raw input but preview showed normalized. Fixed by applying `normalizeSlug()` on every keystroke.

**UI-2 (Frontend)**: `handleSubmit` in TeacherForm.jsx didn't validate `whatsappPhone` client-side. Fixed by adding explicit checks for phone + password length before form submission.

## Key lesson: Edit tool and $ in template literals
The Edit tool's `old_string`/`new_string` does NOT correctly round-trip `$${i+1}` in JS template literals — the `$$` gets collapsed to `$`, so the fix appears applied but the file still has the bug. Always use `sed -i` for fixes involving `$N` placeholder patterns in JS files:
```bash
sed -i 's/map((\_, i) => `\${i + 1}`)/map((_, i) => `\$\${i + 1}`)/' server/routes/admin.js
```

## Test suites
- `tests/add-teacher-flow.test.js` — 40/40
- `tests/admin-dashboard-audit.test.js` — 51/51
- `tests/admin-dashboard.test.js` — 11/11
- `tests/admin-teacher-bugfixes.test.js` — 29/29 (new, covers all 6 bugs above)

## platform_admins table
Seed does NOT insert into `platform_admins` — it only creates a teacher (`username=admin`). Admin dashboard uses `platform_admins` table. Must create manually:
```js
bcrypt.hash('admin123', 10).then(h =>
  pool.query("INSERT INTO platform_admins (username, password_hash, name, role) VALUES ($1,$2,$3,$4)", ['superadmin', h, 'Super Admin', 'super_admin'])
)
```
