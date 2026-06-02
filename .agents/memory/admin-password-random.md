---
name: Admin teacher password is randomly generated
description: The default admin account uses crypto.randomBytes, not a hardcoded password
---

## Rule
The `admin` teacher account (created by `initDB()` in `server/index.js` on first startup) gets a random 12-char hex password via `crypto.randomBytes(6).toString('hex')`, stored in `process.env.ADMIN_INITIAL_PASSWORD` for that process lifetime only.

**Why:** The password is intentionally random (security). The commonly assumed default `admin123` does NOT work. Tests that log in as admin via HTTP will get 401 unless they either: (a) read ADMIN_INITIAL_PASSWORD from the environment, or (b) create a dedicated test teacher via direct DB insert with a known hashed password.

**How to apply:** For test suites: create a temp teacher via `INSERT INTO teachers (username, password, ...) VALUES (...)` with a pre-hashed known password in the test setup. Clean up in teardown. Never rely on the `admin` account in automated tests.
