---
name: Lighthouse audit fixes 2026-07
description: Performance/accessibility/SEO fixes applied after two Lighthouse runs on /student and /teacher pages
---

## Key fixes applied

### Performance
- **echarts lazy loading** — `import ReactECharts from 'echarts-for-react'` was a static import in 5 files (teacher/Dashboard, teacher/Analytics, teacher/ExamAnalytics, teacher/Payments, assistant/Analytics). Changed to a self-contained lazy wrapper:
  ```js
  const _EChartsCore = lazy(() => import('echarts-for-react'));
  const ReactECharts = (props) => (
    <Suspense fallback={<div ... style={{ height: props.style?.height || '200px' }} />}>
      <_EChartsCore {...props} />
    </Suspense>
  );
  ```
  This defers the 371KB vendor-echarts chunk until a chart actually renders.
- **Vite modulePreload filter** — added `build.modulePreload.resolveDependencies` in `client/vite.config.js` to prevent the browser from preloading heavy vendor chunks (echarts, livekit, pdfjs, xlsx, jspdf) on initial page load.

### Best Practices
- **robots.txt** — added an Express route in `server/index.js` BEFORE the SPA catch-all. Without this the catch-all served `index.html` (33 Lighthouse errors).
- **CSP Cloudflare beacon** — added `https://static.cloudflareinsights.com` to `scriptSrc` in the helmet CSP config in `server/index.js`.
- **ui-avatars CORS** — `TeacherContext.jsx::applyFavicon()` set `crossOrigin='anonymous'` unconditionally, causing a CORS error for external URLs (ui-avatars.com doesn't support CORS). Fixed: only set crossOrigin for same-origin URLs; for external URLs, skip straight to `setHref(url)`.

### Accessibility
- **Hamburger aria-label** — added `aria-label="فتح القائمة الجانبية"` to the `lg:hidden` menu buttons in StudentLayout, TeacherLayout, AssistantLayout.
- **Table headers scope** — added `scope="col"` to all `<th>` elements in Dashboard.jsx (results table), Payments.jsx, Leaderboard.jsx (both tables), Students.jsx.

### SEO
- **robots.txt** (same as Best Practices above).

### Color contrast (student Dashboard)
- Badge elements used `color: '#fff'` with `backgroundColor: b.badge_color || '#f97316'` regardless of actual luminance. Added WCAG relative-luminance calculation to pick `#1a1a1a` vs `#fff` text color dynamically.

**Why:** Deprecated APIs (Shared Storage, Protected Audience) appear in console from Cloudflare CDN scripts — not fixable by us.
