---
name: Permission audit M1-M8
description: 8 security/permission fixes for assistants, WhatsApp QR, tenant header, and enrollment payment bypass
---

## M-1: GET /api/students — PII exposure to any assistant
- `checkPermission('can_view_analytics')` added to GET / route in students.js
- **Why:** No permission gate existed; any assistant could list all students with phone/parent_phone/fcm_token
- Route order: `checkPermission` is defined AFTER the route but works because closures resolve at call-time not definition-time

## M-2: GET /api/exams/:id/questions — correct_answer_letter exposed
- `checkManageExamsPerm` added to GET /:id/questions in exams.js
- **Why:** POST/PUT/DELETE questions had the guard but GET did not — assistant without can_manage_exams could harvest answer keys

## M-3: GET /api/exams/retry-requests — unrestricted assistant access
- `checkManageExamsPerm` added to GET /retry-requests
- **Why:** Same pattern as M-2 — write operations were guarded, read was not

## M-4: GET /api/exams/results/:id/review — no auth middleware
- Added inline guard middleware for assistants: requires `can_view_analytics`
- Students still access own results; teachers access all of their exams; assistants need can_view_analytics
- Route had no `requireRole` at all (only `authenticate` via router.use)

## M-5: GET /api/teachers/analytics/wrong-questions — exposes correct_answer_letter
- Added `getPermissions` import to teachers.js (was missing)
- Inline assistant perm check: requires `can_view_analytics`
- **Why:** wrong-questions analytics includes correct_answer_letter column from questions table

## M-6: WhatsApp QR code exposed to assistants
- `qrBase64` conditionally returned in GET /api/whatsapp/status: `isTeacher ? qrBase64 : undefined`
- **Why:** Scanning the QR code hijacks the teacher's WhatsApp session — irreversible damage
- `isTeacher` flag still returned to let UI adapt

## M-7: X-Tenant-Slug header spoofing in production
- `subdomainTenant.js`: header fallback only runs when `NODE_ENV !== 'production'`
- In production → subdomain required (custom domain like `ahmed.wathba.com`)
- In dev → header accepted for local testing
- **Why:** Any HTTP client could set X-Tenant-Slug to target a different teacher's tenant

## M-8: Enrollment approve without payment verification
- In `PUT /courses/enrollment-requests/:id` (action='approve'): checks `payments` table for `status='verified'` for paid courses
- Returns `402 PAYMENT_NOT_VERIFIED` if no verified payment found
- Free courses (`is_free=true`) bypass this check — can be approved freely
- Reject action also bypasses (no payment needed to reject)
- **Why:** Teacher could approve enrollment for paid courses without the student paying — free access to paid content
