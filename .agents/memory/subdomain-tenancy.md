---
name: Subdomain tenancy pattern
description: How multi-tenancy was migrated from path-based (/:slug/...) to subdomain-based (slug.wathba.site/...)
---

## The Pattern

Tenant identity is resolved from the HTTP Host header on the backend, with a dev fallback via a custom request header.

### Backend (`server/middleware/subdomainTenant.js`)
- Extracts subdomain from `req.hostname` (e.g. `mr-ahmed.wathba.site` → `mr-ahmed`)
- Skips known non-tenant hosts: `localhost`, `replit.dev`, `repl.co`, `.replit.app`, `wathba.site` (apex)
- Falls back to `X-Tenant-Slug` header (used in dev and by the Axios instance)
- Caches DB lookups in a Map with 5-min TTL to avoid per-request DB hits
- Attaches `req.tenantSlug` and `req.tenantTeacherId` to every `/api` request

### Frontend (`client/src/lib/tenant.js`)
- `getTenantSlug()`: reads subdomain from `window.location.hostname` in production, falls back to `localStorage('wathba_teacher_slug')` in dev
- Set `localStorage.wathba_teacher_slug = 'admin'` in browser console to test tenant routes locally

### API client (`client/src/lib/api.js`)
- Axios request interceptor reads `getTenantSlug()` and sets `X-Tenant-Slug` header on every request

### Routing (`client/src/App.jsx`)
- `TenantRoutes`: rendered when `getTenantSlug()` is non-null — all flat paths (`/login`, `/teacher`, `/student/...`)
- `MainDomainRoutes`: rendered on apex domain — shows SaaS `PlatformHome`
- No `/:teacherSlug/` param anywhere in the route tree

### PWA manifest (`server/routes/public.js` → `/api/public/manifest`)
- Returns `start_url: '/student'` and `scope: '/'` — per-subdomain PWA installs correctly
- Legacy `/api/public/manifest/:slug` still supported for backward compat

**Why:** Subdomain routing gives each teacher a proper origin for PWA installs, better SEO isolation, and removes the slug from every URL in the app.

**How to apply:** Any new route must NOT include `/:teacherSlug/` prefix. Any new API endpoint that needs to know the current teacher uses `req.tenantTeacherId` (set by subdomainTenant middleware).
