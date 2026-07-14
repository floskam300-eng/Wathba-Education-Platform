---
name: Subdomain tenant resolution mistakes bare IP for a subdomain
description: Curling the backend via 127.0.0.1 with X-Tenant-Slug fails login with a generic "invalid credentials" error — not a real auth bug.
---

When manually testing login/tenant-scoped endpoints via `curl http://127.0.0.1:PORT/...`, the `subdomainTenant` middleware's `extractSubdomainSlug()` splits the Host header on `.` and treats any host with 3+ dot-separated parts as having a subdomain — a bare IPv4 host like `127.0.0.1:3001` has 4 parts, so it extracts `"127"` as the attempted tenant slug and ignores the `X-Tenant-Slug` header fallback, causing every login to fail with the generic "بيانات الدخول غير صحيحة" error.

**Why:** the IP-literal host case was never excluded from `extractSubdomainSlug`, and the function runs before the `X-Tenant-Slug` header fallback check even considers whether a slug was already (wrongly) resolved from the host.

**How to apply:** when testing locally with curl against `127.0.0.1`, pass `-H "Host: localhost:PORT"` (or otherwise avoid a dotted-IP Host header) so tenant resolution falls through to the `X-Tenant-Slug` header as intended. Don't misdiagnose this as a real bcrypt/password/DB issue — verify by checking the bcrypt hash directly against the DB first.
