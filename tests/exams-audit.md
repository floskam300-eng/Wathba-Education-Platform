# Exams Section — Comprehensive Audit & Edge-Case Tests
*Audit date: 2026-06-07 | Scope: server/routes/exams.js, student/Exams.jsx, ExamReviewPage.jsx*

---

## Summary

| # | Bug | Location | Fix | Verified |
|---|-----|----------|-----|---------|
| BUG-1 | Add question to published exam (no guard) | `POST /:id/questions` | Reject 409 if `is_published=true` | ✅ |
| BUG-2 | Edit question on published exam (no guard) | `PUT /questions/:qid` | Reject 409 if parent exam `is_published=true` | ✅ |
| BUG-3 | Delete question on published exam (no guard) | `DELETE /questions/:qid` | Reject 409 if parent exam `is_published=true` | ✅ |
| BUG-4 | MCQ `correct_answer_letter` C/D validated against null option | `POST/PUT` question endpoints | Validate letter matches non-null option cell | ✅ |
| BUG-5 | Retry request allowed for expired exam | `POST /:id/retry-request` | Fetch `end_date`, reject 400 if past | ✅ |
| BUG-6 | `openExam()` cleared all localStorage (wiped other exam state) | `student/Exams.jsx` | Replaced with server-authoritative `serverStartedAt` diffing | ✅ |
| BUG-7 | "مراجعة الإجابات" button navigated AFTER `setResult(null)` (unmount race) | `student/Exams.jsx` result screen | Call `navigate()` before `setResult(null)` | ✅ |
| BUG-8 | `stuckExamIds` `useMemo` had empty deps `[]` | `student/Exams.jsx` | Changed to `[taking, exams]` | ✅ |

---

## Edge-Case Test Cases

All tests use: **teacher** `admin/admin123`, **student** `std_fatma/123456` with `X-Tenant-Slug: admin`.

---

### GROUP A — Published Exam Question Guard (BUG-1/2/3)

#### A-1: Add question to published exam → 409
```
POST /api/exams/{published_id}/questions
Auth: Teacher token
Body: { question_text: "...", question_type: "true_false", correct_answer_letter: "A", option_a: "صح", option_b: "خطأ", points: 5 }
Expected: 409 { error: "لا يمكن تعديل أسئلة اختبار منشور — قم بإلغاء نشره أولاً" }
```

#### A-2: Edit question on published exam → 409
```
PUT /api/exams/questions/{qid}   (qid belongs to published exam)
Auth: Teacher token
Body: { question_text: "changed" }
Expected: 409
```

#### A-3: Delete question on published exam → 409
```
DELETE /api/exams/questions/{qid}
Auth: Teacher token
Expected: 409
```

#### A-4: Add/edit/delete question on DRAFT exam → succeeds
```
POST/PUT/DELETE on draft exam questions
Expected: 200/201/204 — no restriction on unpublished exams
```

#### A-5: Publish exam → then try to add question → 409
```
1. POST /api/exams/{id}/publish  → 200
2. POST /api/exams/{id}/questions → 409
```

#### A-6: Unpublish exam → then add question → 201
```
1. PUT /api/exams/{id} (is_published→false or unpublish endpoint) → 200
2. POST /api/exams/{id}/questions → 201 (guard lifted)
```

#### A-7: Teacher isolation — cannot modify another teacher's exam question
```
POST /api/exams/{other_teacher_exam_id}/questions
Auth: Teacher A token
Expected: 404 (exam not found in that teacher's context)
```

---

### GROUP B — MCQ Letter Validation (BUG-4)

#### B-1: Letter C with no option_c → 400
```
POST /api/exams/{draft_id}/questions
Body: { correct_answer_letter: "C", option_a: "x", option_b: "y" }
Expected: 400 { error contains "option_c" }
```

#### B-2: Letter D with no option_d → 400
```
Body: { correct_answer_letter: "D", option_a: "x", option_b: "y", option_c: "z" }
Expected: 400
```

#### B-3: Letter A with no option_a → 400
```
Body: { correct_answer_letter: "A" }    ← option_a is null/missing
Expected: 400
```

#### B-4: Letter B with option_b present → 201
```
Body: { correct_answer_letter: "B", option_a: "x", option_b: "y" }
Expected: 201
```

#### B-5: PUT edit — change letter to D when option_d is null → 400
```
PUT /api/exams/questions/{qid}
Body: { correct_answer_letter: "D", option_a: "x", option_b: "y" }  ← no option_d
Expected: 400
```

#### B-6: true_false question with letter A (صح) → 201
```
Body: { question_type: "true_false", correct_answer_letter: "A", option_a: "صح", option_b: "خطأ" }
Expected: 201 — A/B always valid for true_false
```

---

### GROUP C — Retry Request on Expired Exam (BUG-5)

**Prerequisite**: student has an `exam_result` for the expired exam.

#### C-1: Retry request on expired exam → 400
```
POST /api/exams/{expired_exam_id}/retry-request
Auth: Student token (X-Tenant-Slug: admin)
Body: { message: "want retry" }
Expected: 400 { error: "لا يمكن طلب إعادة اختبار انتهت مدته" }
```

#### C-2: Retry request on open exam (end_date in future) → 201
```
POST /api/exams/{open_exam_id}/retry-request
Auth: Student who already has a result
Expected: 201 (request created)
```

#### C-3: Retry request on exam with no end_date → 201
```
POST /api/exams/{no_end_date_exam_id}/retry-request
Expected: 201 (no expiry date = always allowed)
```

#### C-4: Duplicate pending retry request → 409
```
POST /api/exams/{id}/retry-request  (already pending)
Expected: 409 { error: "طلب إعادة معلّق بالفعل" }
```

#### C-5: Student without a prior result cannot request retry → 403
```
POST /api/exams/{id}/retry-request  (no exam_result for this student)
Expected: 403 or 400 — must have taken the exam first
```

---

### GROUP D — Server-Authoritative Timer (BUG-6)

#### D-1: /take returns serverStartedAt
```
GET /api/exams/{id}/take
Auth: Student token
Expected: 200 { exam: {...}, questions: [...], serverStartedAt: "<ISO datetime>" }
```

#### D-2: Repeated /take calls return identical serverStartedAt (idempotent session)
```
GET /api/exams/{id}/take  → serverStartedAt = T1
(wait 1+ second)
GET /api/exams/{id}/take  → serverStartedAt = T1  ← same, not NOW()
Expected: T1 === T1  (ON CONFLICT DO NOTHING preserves original start time)
```

#### D-3: correct_answer_letter NOT leaked in /take response
```
GET /api/exams/{id}/take
Expected: questions[].correct_answer_letter === undefined for all questions
```

#### D-4: After retry approval, /take returns NEW serverStartedAt
```
1. Teacher approves retry → DELETE exam_sessions for that student/exam
2. Student calls GET /api/exams/{id}/take → new session created → serverStartedAt = T2
Expected: T2 > T1  (fresh session after retry approval)
```

#### D-5: Submit after duration + 90s grace → 409
```
1. Artificially set exam_sessions.started_at = NOW() - (duration + 100s)
2. POST /api/exams/{id}/submit
Expected: 409 { error: "انتهت مدة الاختبار" }
```

---

### GROUP E — Double-Submit & Submission Integrity

#### E-1: Submit exam → 200; submit again → 409
```
POST /api/exams/{id}/submit  (first time)  → 200
POST /api/exams/{id}/submit  (second time) → 409 { error: "لقد أديت هذا الاختبار مسبقاً" }
```

#### E-2: Submit with no answers → scored as 0 (all unanswered)
```
POST /api/exams/{id}/submit  { answers: {} }
Expected: 200, normalizedScore=0, unanswered_count=<question_count>
```

#### E-3: Submit with >500 answer keys → 400
```
POST /api/exams/{id}/submit  { answers: { "1":"A", "2":"B", ... 501 keys } }
Expected: 400 { error: "عدد الإجابات يتجاوز الحد المسموح (500)" }
```

#### E-4: Submit with answer value > 5000 chars → 400
```
POST /api/exams/{id}/submit  { answers: { "1": "A".repeat(5001) } }
Expected: 400 { error: "طول إحدى الإجابات يتجاوز الحد المسموح (5000 حرف)" }
```

#### E-5: Submit bank exam with forged question IDs (not in session snapshot) → silently ignored
```
POST /api/exams/{bank_exam_id}/submit  { answers: { "99999": "A" } }
Expected: 200, all forged question IDs scored as unanswered (not as correct)
```

#### E-6: Points deducted on retry submission (old points removed, new earned)
```
1. Student takes exam, passes, earns 50pts → student.points += 50
2. Retry approved; student retakes and fails (0pts earned)
Expected: student.points -= 50 (old) + 0 (new) → net = 0 change
student.points >= 0 always (GREATEST(0, points - old))
```

---

### GROUP F — Security & Isolation

#### F-1: Unauthenticated access to any exam endpoint → 401
```
GET /api/exams                    → 401
GET /api/exams/{id}/take          → 401
GET /api/exams/results/{id}/review → 401
POST /api/exams/{id}/submit       → 401
```

#### F-2: Student cannot access another student's review
```
GET /api/exams/results/{other_student_result_id}/review
Auth: Student A token
Expected: 403 { error: "Access denied" }
```

#### F-3: Teacher cannot access another teacher's exam results
```
GET /api/exams/results/{result_id}/review   (result belongs to teacher B's exam)
Auth: Teacher A token
Expected: 403 { error: "Access denied" }
```

#### F-4: Student cannot access draft (unpublished) exam
```
GET /api/exams/{draft_exam_id}/take
Auth: Student token
Expected: 403 (exam not visible without is_published=true)
```

#### F-5: Student cannot access exam from a different teacher
```
GET /api/exams/{other_teacher_exam_id}/take
Auth: Student token (belongs to teacher A)
Expected: 403
```

#### F-6: Non-integer / overflow exam IDs rejected
```
GET /api/exams/abc/questions               → 400
GET /api/exams/0/questions                 → 400
GET /api/exams/2147483648/questions        → 400  (above PG INT max)
GET /api/exams/99999999999999999/questions → 400
GET /api/exams/1%20OR%201=1/questions      → 400
```

#### F-7: Student cannot submit to an exam they are not enrolled in (course-linked)
```
POST /api/exams/{course_exam_id}/submit
Auth: Student not enrolled in that course
Expected: 403
```

---

### GROUP G — Scheduling Guards

#### G-1: /take before start_date → 403
```
GET /api/exams/{id}/take  (exam.start_date = tomorrow)
Expected: 403 { error: "الاختبار لم يبدأ بعد", start_date: "..." }
```

#### G-2: /take after end_date → 403
```
GET /api/exams/{id}/take  (exam.end_date = yesterday)
Expected: 403 { error: "انتهى وقت الاختبار" }
```

#### G-3: /submit after end_date → 409
```
POST /api/exams/{id}/submit  (exam.end_date = yesterday)
Expected: 409 { error: "انتهى وقت الاختبار — لا يمكن تسليم الإجابات بعد انقضاء المهلة" }
```

#### G-4: /submit before start_date → 409
```
POST /api/exams/{id}/submit  (exam.start_date = tomorrow)
Expected: 409 { error contains "لم يبدأ بعد" }
```

---

### GROUP H — Stuck Session / Client State (BUG-7/8)

#### H-1: Result screen "مراجعة الإجابات" button navigates correctly (failed exam)
```
MANUAL: After submitting a failed exam, click "لا، مراجعة الإجابات"
Expected: Browser navigates to /student/exam-review/{resultId} (NOT a blank page)
Note: Bug was navigate() called AFTER setResult(null) which unmounted the component first
```

#### H-2: Result screen "مراجعة الإجابات" button navigates correctly (passed exam)
```
MANUAL: After submitting a passed exam, click "مراجعة الإجابات"
Expected: Navigate to /student/exam-review/{resultId}
```

#### H-3: stuckExamIds updates when exam list loads
```
MANUAL: 
1. Create localStorage key exam_start_999 before page loads
2. Load /student/exams
3. Verify the yellow warning banner appears listing exam #999
4. Click "مسح" button → banner disappears, page reloads
Note: Bug was useMemo([]) — banner never appeared because exams hadn't loaded yet
```

#### H-4: stuckExamIds disappears once an exam is opened
```
MANUAL:
1. Have a stale localStorage key from a prior session
2. Open the stuck exam via "ابدأ الاختبار"
3. Verify: banner disappears immediately (stuckExamIds recomputes when taking changes)
```

---

### GROUP I — Retry Approval Flow

#### I-1: Approving retry deletes exam_sessions (fresh start guaranteed)
```
1. Student takes exam (session created at T1)
2. Teacher approves retry → DELETE exam_sessions
3. Student calls /take again → new session at T2 > T1
Expected: T2 !== T1
```

#### I-2: Retry result archives old result (is_latest=false), creates new (is_latest=true)
```
After retry submission:
SELECT * FROM exam_results WHERE student_id=X AND exam_id=Y ORDER BY attempt_number
Expected: 2 rows — old has is_latest=false, new has is_latest=true
```

#### I-3: Points correctly adjusted on retry
```
Old result: points_earned=100 → student.points += 100
New result (fail): points_earned=0
After retry submit:
student.points -= 100 (deduction) + 0 (new earn) → net -100
student.points = MAX(0, previous - 100)
```

#### I-4: Retry request status 'used' after submission
```
SELECT status FROM exam_retry_requests WHERE student_id=X AND exam_id=Y
Expected: 'used' (not 'approved' — so student cannot re-use the same approval)
```

---

## Test Execution Results (API Tests — 2026-06-07)

| Test | Status |
|------|--------|
| A-1: Add Q to published exam → 409 | ✅ PASS |
| A-2: Edit Q on published exam → 409 | ✅ PASS |
| A-3: Delete Q on published exam → 409 | ✅ PASS |
| B-1: Letter C with no option_c → 400 | ✅ PASS |
| B-2: Letter D with no option_d → 400 | ✅ PASS |
| B-5: PUT edit letter to D, no option_d → 400 | ✅ PASS |
| C-1: Retry on expired exam → 400 | ✅ PASS |
| C-2: Retry on open exam → 201 | ✅ PASS |
| D-1: /take returns serverStartedAt | ✅ PASS |
| D-2: Repeated /take → same serverStartedAt | ✅ PASS |
| D-3: correct_answer_letter not leaked | ✅ PASS |
| E-1: Double-submit → 409 | ✅ PASS |
| E-3: >500 answer keys → 400 | ✅ PASS (server enforces limit) |
| F-1: Unauthenticated → 401 | ✅ PASS |
| F-6: Non-integer/overflow IDs → 400 | ✅ PASS |
| F-5: Cross-teacher exam access → 403 | ✅ PASS |
