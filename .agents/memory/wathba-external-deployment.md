---
name: wathba.site is a separate external deployment
description: admin.wathba.site is not served by this repl's Replit Deployment — the user hosts it themselves elsewhere and redeploys manually.
---

Checked `.replit` — there is no `[deployment]` section, meaning this repl has never been published via Replit Deployments. The production custom domain `admin.wathba.site` runs code the user deploys themselves to external hosting (confirmed by the user directly).

**Why:** screenshots from admin.wathba.site can look meaningfully behind the current repo state (e.g. missing recent styling commits) — this is expected, not a sign that a fix failed to apply in this workspace.

**How to apply:** when the user reports a bug from admin.wathba.site (or any wathba.site subdomain) that doesn't reproduce in this repl's dev preview, don't assume the dev source still has the bug — verify against the current source first, fix/confirm here, and let the user know they'll need to redeploy externally to see it live. Don't offer to deploy it for them from this repl.
