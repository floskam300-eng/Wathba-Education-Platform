---
name: image_multi shuffle & review audit
description: 8 bugs fixed in image_multi shuffle/review flow for exams and recitations; seededShuffle unification.
---

## Bugs fixed (2026-07-18)

**BUG-1 [HIGH] — exams.js /take, bank exams:** `shuffle_options` for image_multi was only applied inside the `else` (manual exam) branch. Bank exams never got their image_multi sub-questions shuffled, but the review endpoint always re-derived the shuffle → take/review mismatch. Fix: moved image_multi shuffle outside the if/else, after question selection, for both exam types.

**BUG-2 [MEDIUM] — recitations.js review:** `sub_results` entries were missing `option_labels`. Client fell back to raw A/B/C/D letters instead of actual option text. Fix: added `option_labels: sub.option_labels || null` to each sub_result.

**BUG-3 [MEDIUM] — Exams.jsx /take UI:** Option buttons for non-TF image_multi sub-questions hardcoded to `['A','B','C','D']` regardless of actual option count. 2-option sub-questions showed phantom C/D buttons. Fix: `.slice(0, sub.option_labels?.length || 4)`.

**BUG-4 [MEDIUM] — ExamReviewModal.jsx:** Same phantom listLetters issue in review modal. Same slice fix.

**BUG-5 [MEDIUM] — RecitationReviewPage.jsx:** Same phantom listLetters issue. Same slice fix.

**BUG-6 [LOW] — RecitationReviewPage.jsx:** `answered`/`wrong`/`unanswered` counts used `!!q.student_answer` for all types. For image_multi, `student_answer` is a JSON string (always truthy) — should check `sub_results.some(s => !!s.student_answer)` instead.

**BUG-7 [CRITICAL] — Recitations.jsx QuestionCard:** `subOptions` for non-TF image_multi sub-questions was set to `options` (parent question's MCQ options, which are always null/empty for image_multi). Result: NO answer buttons rendered for MCQ sub-questions in recitation taking view. Fix: build subOptions directly from `sub.option_labels` using `['A','B','C','D'].slice(0, sub.option_labels?.length || 4).map(...)`.

**SECURITY — exams.js /take:** `correct_answer_letter` was stripped from the top-level question but NOT from `sub_questions[i].correct` for image_multi. Answer key leaked to students. Fix: `clientQuestions` mapping now also strips `correct` from each sub_question.

**DIVERGED IMPL — seededShuffle:** `exams.js` used fraction-division (`Math.floor(rand() * (i+1))`), `recitations.js` used modulo (`s % (i+1)`). These produce different shuffle outputs for identical seeds. Unified both to the modulo variant (matches recitations.js). This was a source of take/review inconsistency if the two files ever cross-referenced each other.

## Why seededShuffle must stay in sync
Both files contain a local copy. If they ever diverge again, a bank question used in both contexts (or code copied from one file) will produce different shuffles → wrong scoring in review. Add a comment to both files pointing to each other.

## Test file
`tests/image-multi-shuffle-audit.test.js` — 33 tests covering A/B bank+manual exam shuffle, C recitation option_labels in review, D edge cases (T/F, no-shuffle, correct counts), E security (access control). Seed formula in test must use modulo variant: `s = (s * 1664525 + 1013904223) >>> 0; j = s % (i+1)`.

## DB schema notes
`bank_questions`, `questions`, `recitation_questions` all have NOT NULL constraints on `option_a`, `option_b`, `correct_answer_letter` even for `image_multi` type. Insert placeholder values (`'_', '_', 'A'`) in tests.
