---
name: JWT token uniqueness — jti required
description: generateToken must include a unique jti to prevent same-second token collision
---

## Rule
`generateToken` in `server/middleware/auth.js` must include a `jti: crypto.randomBytes(8).toString('hex')` field in the payload.

**Why:** jwt.sign is deterministic given the same payload + secret + timestamp. Two logins for the same user within the same second (same `iat`) produce *identical* JWT strings. If one session is logged out, the other is also revoked because they share the same SHA-256 hash in `_tokenBlacklist`. This caused test failures where TEST_TOKEN was accidentally blacklisted by a different logout call.

**How to apply:** Always spread `{ ...payload, jti: crypto.randomBytes(8).toString('hex') }` before signing. Never sign a bare payload without jti if the same user can have concurrent sessions.
