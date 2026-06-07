---
name: Exams deep audit phase-3
description: 8 bugs fixed in third pass of exams section (server + client)
---

## Bugs fixed

**BUG-1 (Security)** — `POST /:id/questions` added `getExamForOwner()` check; returns 409 if `is_published=true`.
**BUG-2 (Security)** — `PUT /questions/:qid` uses `getExamForQuestion()` + 409 if published.
**BUG-3 (Security)** — `DELETE /questions/:qid` uses `getExamForQuestion()` + 409 if published.
**BUG-4 (Security/Logic)** — MCQ question create/update: validates `correct_answer_letter` C/D only when the corresponding option is non-null; returns 400 otherwise.
**BUG-5 (Logic)** — `POST /:id/retry-request` now fetches `end_date` in the exam check query and returns 400 if the exam window is already closed.
**BUG-6/serverStartedAt (Logic)** — `GET /:id/take` now returns `serverStartedAt` from `exam_sessions`; client timer init uses this as authoritative start time. If localStorage start is >60s newer than server session, it's stale (retry scenario) and answers are cleared.
**BUG-7 (UX)** — "لا، مراجعة الإجابات" button on fail result screen now navigates to `/student/exam-review/{resultId}`.
**BUG-8 (Logic)** — `stuckExamIds` useMemo now has `[taking, exams]` deps so banner disappears when exam opens.

## Key helpers added (server/routes/exams.js)

```js
getExamForOwner(examId, teacherId)   // → { id, is_published } | null
getExamForQuestion(qid, teacherId)   // → { id, is_published } | null (joins questions→exams)
```

## Why
- Published exam question mutations could corrupt in-progress student sessions.
- `correct_answer_letter='D'` with no option_d stored a broken question silently.
- Students could request retries on expired exams; teacher approval would be useless.
- Timer relied solely on localStorage — failed on retry (old start time reused).

## How to apply
- Any new question mutation endpoint must call `getExamForQuestion`/`getExamForOwner` and gate on `is_published`.
- Always return `serverStartedAt` from `/take` so client timer stays server-authoritative.
