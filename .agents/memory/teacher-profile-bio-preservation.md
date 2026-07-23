---
name: Teacher profile bio preservation
description: Keep teacher bio in admin detail responses so saving unrelated profile fields cannot erase the landing-page biography.
---

The admin teacher-detail response must include the bio field whenever the edit form sends the full teacher profile back on save.

**Why:** If the edit form initializes bio from an API response that omits it, saving an unrelated field sends an empty bio and removes the biography shown on the landing page.

**How to apply:** When adding or changing teacher profile fields, compare the admin detail SELECT, form initialization, update payload, and public landing response as one data flow.