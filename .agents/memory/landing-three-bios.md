---
name: Landing page three bios
description: Teacher landing pages support separate hero, about, and profile-card biographies with legacy bio fallback.
---

Teacher profile copy is split into three independent fields: the hero introduction, the “من أنا؟” section, and the biography under the teacher card photo.

**Why:** The landing design needs the same teacher to present different context-specific descriptions without breaking teachers that still only have the original bio field.

**How to apply:** Keep the public response, admin detail form, create/update routes, and schema/migrations synchronized; fall back to the legacy bio when any specialized field is empty.