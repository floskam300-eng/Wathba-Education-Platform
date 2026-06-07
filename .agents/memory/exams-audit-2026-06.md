---
name: Exams section audit 2026-06
description: 12 bugs/vulns fixed in exams.js + validate.js + ExamReviewPage; parseParamId applied throughout
---

## Rule
All routes in exams.js must parse and validate integer params using `parseParamId()` before passing to any DB query. `correct_answer_letter` must be validated as one of A/B/C/D (MCQ) or A/B (true_false) before DB insert/update.

**Why:** Raw `req.params.id` used in DB queries caused 500 crashes on non-numeric input and potential integer overflow. `correct_answer_letter` null/undefined caused `TypeError: Cannot read properties of undefined (reading 'toUpperCase')` → 500 on update endpoint.

**How to apply:** Any new route touching exam IDs, question IDs, result IDs, request IDs must call `parseParamId(req.params.X)` at the top and return 400 if null.

## Bugs Fixed

### Security
- **BUG-S1**: `req.params.id/qid/reqId/resultId/courseId` not validated in 14 routes → applied `parseParamId(raw)` with PG_INT_MAX=2147483647 guard to all
- **BUG-S2**: `correct_answer_letter.toUpperCase()` crash when `correct_answer_letter` is null/undefined in POST /:id/questions and PUT /questions/:qid
- **BUG-S3**: No server-side validation that `correct_answer_letter` ∈ {A,B,C,D} for MCQ or {A,B} for true_false

### Logical
- **BUG-L1**: Unpublish SSE sent to ALL course enrollments (not just `status='active'`) → added `AND status='active'` filter
- **BUG-L2**: `goBack()` in ExamReviewPage navigated assistant to `/teacher/exams` → fixed to `/assistant/exams`
- **BUG-L3**: `points_on_attempt` and `points_on_pass` accepted negative values → added validation (≥ 0) in validateExam
- **BUG-L4**: `bank_question_count` accepted 0 or negative → added validation (≥ 1) in validateExam
- **BUG-L5**: `question_source` accepted any string → added whitelist validation (['manual','bank']) in validateExam

### Edge Cases
- **BUG-E1**: `retry-requests/:reqId/approve` and `reject` — parseParamId applied to reqId
- **BUG-E2**: `/student/course-results/:courseId` — parseParamId applied to courseId
- **BUG-E3**: `/results/:resultId` and `/results/:resultId/review` — parseParamId applied to resultId
- **BUG-E4**: Remaining `req.params.id` references inside GET /:id/take body (seed calculations, query param, session INSERT) replaced with `examId`

## parseParamId definition (in exams.js top)
```js
const PG_INT_MAX = 2147483647;
const parseParamId = (raw) => {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0 || n > PG_INT_MAX || String(n) !== String(raw).trim()) return null;
  return n;
};
```
