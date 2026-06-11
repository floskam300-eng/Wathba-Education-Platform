---
name: image_multi in Exams + RecitationReviewPage
description: Covers image_multi question type extension to Exams, RecitationReviewPage creation, and StudentProfileModal recitation results section
---

## image_multi in Exams

**Backend (server/routes/exams.js):**
- POST/PUT `/exams/:id/questions` — validates sub_questions array, stores as JSONB, sets option_a/b/c/d = "A"/"B"/"C"/"D" sentinel values
- POST `/:id/submit` — for image_multi: parses answer as JSON object `{label: letter}`, grades all-or-nothing (all sub-questions must match), stores answer as JSON string
- GET `/results/:resultId/review` — for image_multi: parses stored student_answer JSON, returns sub_results array `[{label, correct, student_answer, is_correct}]`

**Frontend (teacher/ExamQuestions.jsx):**
- `image_multi` added to QUESTION_TYPES and qTypeLabel
- `imgMultiCount` state controls count input; "توليد" button generates sub_questions array `[{label: "1", correct: "A"}, ...]`
- Sub-questions list shown with A/B/C/D buttons per row to pick correct answer
- On submit: validates sub_questions non-empty, auto-sets option_a/b/c/d to letters

**Frontend (student/Exams.jsx):**
- image_multi renders numbered rows with A/B/C/D buttons per sub-question
- Answers stored as `{[questionId]: {[label]: letter}}` object
- `answered` count correctly handles object answers (checks `Object.keys(a).length > 0`)
- Badge shows "صورة+أسئلة" for image_multi type

**Frontend (ExamReviewPage.jsx):**
- Detects `isImgMulti`, sets `displayOpts = []` to skip MCQ rendering
- Renders sub_results rows color-coded: green=correct, red=wrong, gray=unanswered

## RecitationReviewPage

- Created at `client/src/pages/RecitationReviewPage.jsx`
- Uses GET `/recitations/results/:resultId/review` endpoint
- Shows score stats, question list with sub-results for image_multi and standard options for MCQ/T-F
- Routes added for teacher, assistant, student at `recitation-review/:resultId`
- Student Recitations page has "مراجعة مفصّلة" button post-submit (uses `result.result.id`)
- Teacher Recitations ResultsPanel has 👁 icon button per result row

## StudentProfileModal

- `recitationResults` read from `data?.recitationResults` (populated by students.js profile endpoint last 5)
- New "آخر التسميعات" Section shown between Exam Results and Payments sections
- Displays recitation title, correct/wrong counts, percentage bar

**Why:** image_multi in exams must store answers as JSON strings (not single letters) and grade all-or-nothing at sub-question level. The exam review endpoint detects question_type and returns sub_results accordingly.
