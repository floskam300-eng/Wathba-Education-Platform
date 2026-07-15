---
name: Add-Teacher flow audit 2026-07
description: 7 bugs fixed in the add-teacher / subdomain-creation flow; 40 new test cases all pass
---

## Bugs fixed

**BUG-1 — invalidateCache called before COMMIT**  
`admin.js` was clearing the tenant cache inside the transaction before `COMMIT`.  
A concurrent request arriving in that gap would query DB (no row yet), cache null for 30 s, and get a "tenant not found" for half a minute.  
**Fix:** moved `invalidateCache(slug)` to after `await client.query('COMMIT')`.

**BUG-2 — 23505 unique-violation returned as 500**  
Race-condition duplicate slug hit the PostgreSQL `unique_violation` (code 23505) which fell through to the generic `catch` → 500.  
**Fix:** explicit `if (err.code === '23505')` guard → 409 with Arabic message.

**BUG-3 — Subdomain preview not normalized**  
`TeacherForm.jsx` showed `{username}.wathba.site` raw, so typing `Mr Ahmed` showed `Mr Ahmed.wathba.site` instead of `mr-ahmed.wathba.site`.  
**Fix:** `previewSlug` computed with same regex as server: `.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')`.

**BUG-4 — No server-side minimum password length**  
Backend accepted 1-char passwords.  
**Fix:** `password.length < 8` → 400 before any DB work.

**BUG-5 — No slug DNS max-length validation**  
DNS labels cap at 63 chars. Very long usernames were silently stored.  
**Fix:** `slug.length > 63` → 400.

**BUG-6 — force_password_change not wired in admin creation**  
DB column existed and auth.js returned the flag, but admin creation always wrote `false`.  
**Fix:** `force_password_change` param accepted from body and stored at INSERT time; checkbox added to TeacherForm.jsx.

**BUG-7 — No admin password-reset endpoint**  
Teachers who forgot password had no recovery path without direct DB access.  
**Fix:** `POST /api/admin/teachers/:id/reset-password` added (bcrypt, invalidateTeacherAuthCache, defaults force_password_change=true).

## RESERVED_SUBDOMAINS
Both `admin.js` and `subdomainTenant.js` now share the same list:
`['dashboard', 'admin', 'api', 'www', 'mail', 'app', 'static', 'cdn', 'assets']`

## Tests
`tests/add-teacher-flow.test.js` — 40 cases covering:
A happy path, B validation, C reserved slugs (×9), D duplicates + race, E slug normalization, F force_password_change, G reset-password (6 cases), H suspension, I cache, J delete, K injection/XSS.
All 40/40 pass.
