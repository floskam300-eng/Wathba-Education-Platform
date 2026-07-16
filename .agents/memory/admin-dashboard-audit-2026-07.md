---
name: Admin Dashboard Audit 2026-07
description: 18 bugs/security issues fixed in admin.js and admin-client; 51 tests added.
---

## Security Fixes
- **S1** `POST /api/admin/auth/login` — added `adminLoginLimiter` (10 req / 15 min per IP, skip on success)
- **S2** Upload filename now uses `crypto.randomBytes(8).toString('hex')` instead of `Math.random()`
- **S3** Admin JWT now includes `jti: crypto.randomBytes(16).toString('hex')` — prevents same-second token collision
- **S4** `POST /api/admin/upload/image` — added `adminUploadLimiter` (30 req / 10 min per IP)

## Backend Logic Fixes
- **B1** `GET /payments?teacher_id=abc` and `GET /subscriptions?teacher_id=abc` — validate with `parseInt(...,10)` + `isNaN` check; return 400 not DB error
- **B2** `price_override = 0` was falsy → stored as null; fix: `(price_override !== undefined && price_override !== null && price_override !== '') ? parseFloat(...) : null`
- **B3** `PUT /teachers/:id/features` overwrote entire `features_enabled` JSON; fix: fetch existing, spread, then set known keys only (`{ ...existing, live_streaming, stickman_run }`)
- **B4** Stats cache (`_statsCache`) not invalidated on mutations; fix: `_statsCache.ts = 0` added to suspend, create-teacher, delete-teacher, and features-update handlers
- **B5** `status` in `PUT /subscriptions/:id` accepted any string; fix: validate against `['active','expired','cancelled']` with 400 on unknown value; same guard added to `GET /subscriptions?status=` filter
- **B6** `getTeacherStats()` ran 3 DB queries sequentially; fix: wrapped in `Promise.all([...])`
- **Duplicate slug** pre-check returned 400, should be 409 Conflict; fixed the pre-check at line 347

## Frontend Fixes
- **F1** `<select>` ID type mismatch (number state, string option value) in TeacherForm, SubscriptionsList, PaymentsList; fix: `String(id)` in all setters and option values
- **F2** `ImageCropper` canvas sized to display pixels (small), then drew natural-res image onto it → blurry output; fix: `canvas.width/height = Math.round(completedCrop.width/height * scaleX/Y)` (natural pixels)
- **F3** `ImageCropper` used `alert()` on upload error; replaced with `toast.error()` from `react-hot-toast`
- **F4** `Login.jsx` showed login form to already-authenticated admin; fix: `useEffect` redirects to `/` when `admin && !loading`
- **F5** `calculateTotalThisMonth/Year()` in `PaymentsList` recalculated every render; replaced with `useMemo([payments])`
- **F6** `TeachersList` search called `.toLowerCase()` on `t.name/username/slug` without null-guard; fix: `(t.name || '').toLowerCase()`
- **F7** `whatsappPhone` input had `required` for both create AND edit modes; backend doesn't require it on PUT; fix: `required={!isEdit}`

## How to Apply
- Duplicate slug 409 is now a pre-check (line ~347) AND a 23505 catch below — both paths return 409.
- Stats cache key is `_statsCache.ts = 0` to invalidate; TTL is 5 min. Touch it any time teacher count or suspension state changes.
- `getTeacherStats()` is now parallel — any new queries added there should be added inside the `Promise.all` array.
- All admin upload filenames: `admin_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`

## Tests
File: `tests/admin-dashboard-audit.test.js` — 51 tests covering S/B/P/E categories; all pass.
