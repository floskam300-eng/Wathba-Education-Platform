---
name: Teacher-side pages missed withToken() on question images
description: Pattern to check when protected /uploads/* images fail to load on a specific page but work elsewhere
---

When question/recitation images fail to load only on certain pages (broken image icon) while working fine on others, check whether that page renders `<img src={...question_image_url}>` raw instead of wrapping with `withToken()` from `client/src/lib/mediaAccess.js`. All `/uploads/*` routes require an auth token as a query param (server/index.js makeProtectedUploadsMiddleware); a raw src gets a 401 and shows as a broken image.

**Why:** ExamQuestions.jsx and QuestionBanks.jsx (teacher pages) had two raw-src spots each (form preview + list view) that were missed when withToken() was rolled out elsewhere (student Exams.jsx, ExamReviewPage.jsx, ExamReviewModal.jsx, RecitationQuestions.jsx already had it correctly).

**How to apply:** When adding/auditing any new UI that displays a `question_image_url`/`file_path_or_url`/`file_url` from `/uploads/`, grep for raw `src={...}` usages across all role-specific copies of the page (teacher/assistant/student variants often duplicate this logic) and ensure every one uses `withToken()`.
