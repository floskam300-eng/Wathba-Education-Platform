---
name: Dev tenant preview testing
description: How to view a specific teacher's public landing page / tenant-scoped routes in the Replit preview (no real subdomain available there).
---

`client/src/lib/tenant.js` `getTenantSlug()` treats `.replit.dev` hosts as a dev host, so it can never read a subdomain — it falls back to `localStorage.wathba_teacher_slug`. On localhost there's a `DevAccessPanel` (in `PlatformHome.jsx`) to set that, but it's gated to `localhost`/`127.0.0.1` only, so it never renders in the Replit preview iframe.

To view a tenant's page (e.g. the public `LandingPage.jsx`) in the Replit preview, `getTenantSlug()` also checks a `?tenant=<slug>` query param on dev hosts and persists it to localStorage. Visit `/?tenant=admin` (or any route) once; subsequent navigation keeps working via localStorage.

**Why:** without this, the Replit preview always shows `PlatformHome` (the SaaS marketing root) instead of any teacher's tenant-scoped pages, making it impossible to visually verify tenant-facing UI changes in-preview.

**How to apply:** when asked to verify/screenshot a teacher-facing page (landing page, student/teacher login flow, etc.) in this project, screenshot `/?tenant=<slug>` (seed's default teacher slug is `admin`) instead of `/`.

## Landing page "top courses" ranking
The public landing page's "أبرز الكورسات" section (`server/routes/public.js` `/info`, rendered in `client/src/pages/LandingPage.jsx`) ranks courses by distinct `video_progress` viewers per course, not by verified payments.

**Why:** ranking by purchases breaks for teachers who only publish free courses or have no sales yet — the section would always be empty or meaningless for them. View-count works for free and paid courses alike.
