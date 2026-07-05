---
name: Publish points-sum enforcement
description: Exam/recitation publish endpoints block on points mismatch, not just warn
---
Both `PUT /exams/:id/publish` and `PUT /recitations/:id/publish` now hard-block publishing (400 response, `field: 'points_mismatch'`) when the sum of individual question points doesn't equal the exam's/recitation's `total_score`.

**Why:** Previously only a client-side visual warning banner existed on the question-management pages (ExamQuestions.jsx / RecitationQuestions.jsx); teachers/assistants could still publish with mismatched points, leading to incorrect grading totals.

**How to apply:** The check only applies to manual-source exams (`question_source !== 'bank'`) since bank-sourced exams generate per-student randomized question sets and can't be summed the same way. Frontend publish mutations in Exams.jsx/Recitations.jsx already surface `e.response?.data?.error` via toast, so no extra frontend wiring was needed to display the new error — just keep that pattern when adding new backend validation errors on these publish routes.
