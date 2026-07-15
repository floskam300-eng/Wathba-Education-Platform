---
name: KVM4 performance optimization plan
description: Where the full-platform performance/optimization plan lives and the key architectural constraint it's built around
---

Full performance audit + phased optimization roadmap for deploying to a Hostinger KVM4 VPS (4 vCPU/16GB RAM/200GB NVMe) is written at `docs/OPTIMIZATION_PLAN.md`. Covers backend N+1 queries, missing DB indexes/retention, Postgres tuning for 16GB RAM, frontend bundle/code-splitting, and infra (compression, health checks, backups, log rotation).

**Key constraint discovered:** the app holds several pieces of state in local in-memory `Map()`s — SSE viewer/rate-limit maps in `server/routes/live.js`, WhatsApp (Baileys) socket connections in `server/lib/whatsapp.js`, and `analyticsCache.js`/`permissionsCache.js`. This blocks naive horizontal scaling (PM2 cluster / multiple instances) — any such state must move to Redis (or a similar shared store) first, and Baileys WhatsApp sessions specifically must stay pinned to exactly one process/instance since they're stateful socket+filesystem sessions per teacher.

**Why:** without this, multi-process scaling would cause silent SSE/live-stream/chat delivery failures and WhatsApp session corruption that are hard to trace back to "it's running on 2 instances now."

**How to apply:** recommended order in the plan is vertical tuning first (DB indexes/config, query fixes, frontend code-splitting) — deferring horizontal scaling (PM2 cluster + Redis + split WhatsApp service) until measurements actually show CPU as the bottleneck.
