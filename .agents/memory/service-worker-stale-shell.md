---
name: Service worker caching stale app shell
description: PWA service worker cached index.html cache-first forever, so code fixes never reached users even after deploy/pull — check this before assuming a "fix didn't work" report is a code bug.
---

## The lesson

`client/public/sw.js` implements a PWA cache. If a service worker caches `/`
(index.html) with a cache-first strategy and never invalidates it, browsers
keep serving the old HTML shell — which references old hashed JS/CSS bundle
URLs — forever after every deploy, no matter how many times the underlying
code is fixed and pushed/pulled.

**Why this matters:** a user can report "the bug is still there" repeatedly
even when the deployed/pulled code is provably correct (verified via direct
API calls and logic simulation). Before re-diagnosing the application code a
second or third time, check whether a service worker or other aggressive
HTTP caching layer is serving a stale shell.

**How to apply:** when a user insists a shipped fix "didn't take effect" and
you've already verified the code/API behavior is correct in isolation, grep
for `serviceWorker`/`sw.js`/cache headers before re-touching feature code.
Fix: make navigation requests (`request.mode === 'navigate'` or `url.pathname
=== '/'`) network-first with cache fallback only on failure; only cache-first
truly immutable, hashed assets (e.g. Vite's `/assets/*`). Bump the cache
name/version so existing stale caches get purged on the next `activate`.
