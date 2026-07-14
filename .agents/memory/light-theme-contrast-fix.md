---
name: Light theme low-contrast utility classes fixed globally
description: border-gray-50/100, divide-gray-50/100, and dark:text-gray-500 were near-invisible; fixed via global CSS overrides in client/src/index.css rather than editing every page.
---

Tailwind's `gray-50`/`gray-100`/`slate-50`/`slate-100` are almost the same luminance as a white card (~1.0–1.1:1 contrast), so borders/dividers built from them (used in ~35+ places across Analytics, Archive, Dashboard, Students, etc.) were effectively invisible in light mode. Separately, `dark:text-gray-500` (used for muted table headers/captions/subtitles) renders at ~2.3:1 on dark card backgrounds — too dim at 10–11px.

**Why:** these are systemic, repeated utility-class patterns, not isolated typos in individual components — so the fix belongs in `client/src/index.css` as global overrides (mirroring the existing `html.dark .*` override pattern already used for dark mode), not as dozens of per-file edits.

**How to apply:** if new low-contrast complaints surface, check `client/src/index.css` first for an existing override block ("LIGHT MODE — CONTRAST FIXES" / "DARK MODE — muted label/header text contrast fix") before editing individual page components. Selector specificity: plain `.border-gray-100` (0,1,0) is safely overridden and doesn't fight `html.dark .border-gray-100` (0,2,1) since dark stays more specific.
