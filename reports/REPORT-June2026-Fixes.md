# Wathba Education Platform — June 2026 Bug-Fix Report

## Overview

This report documents 5 bugs (2 critical, 2 high, 1 medium) discovered during a comprehensive codebase audit and their corresponding fixes. Each fix was verified with automated tests.

---

## FIX-1 (CRITICAL): `teachers.js` — Import endpoint loses generated passwords

### File
- `server/routes/teachers.js:698–810`

### Bug
The `/api/import` endpoint generates random passwords for imported students (via `crypto.randomInt(100000, 1000000).toString()`) and correctly hashes them with `bcrypt` before storing. However, the plaintext passwords were **never returned to the teacher**, making it impossible to communicate login credentials to the newly imported students. The response only contained `{ success: true, stats }` with aggregate counts.

### Fix
Added a `generatedPasswords` array that collects `{ username, name, generated_password }` tuples for every student whose password was auto-generated (i.e., those without a `plain_password` field in the import payload). This array is included in the response alongside `stats`.

### Before
```json
{ "success": true, "stats": { "students": 50, ... } }
```

### After
```json
{ "success": true, "stats": { "students": 50, ... }, "generated_passwords": [{ "username": "std_3sec_001", "name": "أحمد", "generated_password": "847291" }, ...] }
```

---

## FIX-2 (CRITICAL): `exams.js` — Standalone exam publishes notifications to ALL students, including suspended ones

### File
- `server/routes/exams.js:326–330`

### Bug
When publishing a standalone exam (no `course_id`), the notification query selects **all** students of the teacher (`SELECT id FROM students WHERE teacher_id=$1 AND deleted_at IS NULL`). Suspended students (`is_suspended = true`) receive exam notifications even though they cannot log in or take exams.

### Fix
Added `AND is_suspended = false` to the query, matching the existing pattern used in other notification and enrollment queries throughout the codebase.

### Before
```sql
SELECT id FROM students WHERE teacher_id=$1 AND deleted_at IS NULL
```

### After
```sql
SELECT id FROM students WHERE teacher_id=$1 AND deleted_at IS NULL AND is_suspended = false
```

---

## FIX-3 (HIGH): `courses.js` — Dead `ON CONFLICT DO NOTHING` on payments table (no unique constraint)

### File
- `server/routes/courses.js:808–815`

### Bug
When a student requests enrollment in a paid course, the code auto-creates a payment record with `ON CONFLICT DO NOTHING`. However, the `payments` table **has no unique constraint** on `(student_id, course_id)`, so the conflict clause never fires. Every enrollment request creates a **duplicate** payment row, polluting the payments list.

### Fix
Replaced the dead `ON CONFLICT DO NOTHING` with a `WHERE NOT EXISTS` subquery that checks for an existing non-rejected payment for the same `(student_id, course_id)`. This ensures only one active pending payment exists per student per course.

### Before
```sql
INSERT INTO payments (student_id, course_id, amount, method, status)
VALUES ($1, $2, $3, '', 'pending')
ON CONFLICT DO NOTHING
```

### After
```sql
INSERT INTO payments (student_id, course_id, amount, method, status)
SELECT $1, $2, $3, '', 'pending'
WHERE NOT EXISTS (
  SELECT 1 FROM payments
  WHERE student_id = $1 AND course_id = $2 AND status != 'rejected'
)
```

---

## FIX-4 (HIGH): `students.js` — Missing `return` after 409 retry exhaustion

### File
- `server/routes/students.js:186`

### Bug
After exhausting retries (5 attempts) in the single-student creation endpoint, the code calls `res.status(409).json(...)` **without** a `return` statement. While this does not cause a crash (no code follows in the current version), it is fragile and could lead to `ERR_HTTP_HEADERS_SENT` if any future developer adds code after the `while` loop.

### Fix
Added `return` before `res.status(409).json(...)` to stop execution immediately.

### Before
```js
    res.status(409).json({ error: '...' });
  } catch (err) {
```

### After
```js
    return res.status(409).json({ error: '...' });
  } catch (err) {
```

---

## FIX-5 (MEDIUM): `exams.js` — NaN date validation in create/update exam

### Files
- `server/routes/exams.js:138–142` (POST create)
- `server/routes/exams.js:199–203` (PUT update)

### Bug
The date-duration validation `new Date(end_date) - new Date(start_date)` produces `NaN` when invalid date strings are passed. The `NaN` comparison `NaN < parseInt(...)` evaluates to `false`, so the validation silently passes and stores garbage dates in the database.

### Fix
Added explicit date validity checks using `.getTime()` on both dates before computing the difference. Invalid dates return a `400` error immediately.

### Before
```js
if (start_date && end_date) {
  const diffMin = (new Date(end_date) - new Date(start_date)) / 60000;
  if (diffMin < parseInt(duration_minutes || 60))
    return res.status(400).json({ ... });
}
```

### After
```js
if (start_date && end_date) {
  const startDt = new Date(start_date);
  const endDt = new Date(end_date);
  if (isNaN(startDt.getTime()) || isNaN(endDt.getTime())) {
    return res.status(400).json({ error: 'تنسيق التاريخ غير صالح' });
  }
  const diffMin = (endDt - startDt) / 60000;
  if (diffMin < parseInt(duration_minutes || 60))
    return res.status(400).json({ ... });
}
```

---

## Verification Tests

All fixes have corresponding automated tests in `tests/fixes-june-2026.test.js`:

| Test | File | Description |
|------|------|-------------|
| FIX-1 | teachers.js import | Verifies `generated_passwords` array is present in import response with correct length |
| FIX-2 | exams.js publish | Creates a suspended student + standalone exam, verifies no notification is sent to suspended student |
| FIX-3 | courses.js payment | Requests enrollment twice in a paid course, verifies exactly 1 payment row exists |
| FIX-4 | students.js create | Sends multiple duplicate-create requests, verifies 409 (not 500) response |
| FIX-5 | exams.js dates | Sends invalid date strings, verifies 400 response with error message |

Run with:
```bash
node tests/fixes-june-2026.test.js
```
*Prerequisite: Server must be running with the updated code.*
