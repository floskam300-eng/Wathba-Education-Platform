# WATHBA — Educational LMS Platform

## Overview
WATHBA is a multi-tenant Arabic (RTL) educational LMS for teachers, assistants, and students. Features include courses/videos/PDFs, exams (with question banks, MCQ/true-false/image_multi types), recitations (تسميعات) with scheduling, live streaming (LiveKit), payments, WhatsApp notifications, leaderboards, and device management.

## Architecture
- **Backend**: Node.js/Express (`server/`), listens on `localhost:3001` (port from `PORT` env var). Entry point `server/index.js`. PostgreSQL via `pg` (`server/db/connection.js`), JWT auth, SSE for real-time updates, `server/scheduler.js` for background jobs (exam/recitation start-end, absent marking, WhatsApp scheduling).
- **Frontend**: React + Vite (`client/`), runs on `0.0.0.0:5000` with `allowedHosts: true` (already configured for Replit's proxied preview). Dev server proxies `/api`, `/uploads`, `/manifest.json` to `localhost:3001`.
- **live-service/**: standalone Docker-based LiveKit/Caddy service for production live-streaming; not run in this Replit dev environment.
- **Database**: Replit-managed PostgreSQL. Schema lives in `server/db/schema.sql` (idempotent, safe to re-run). Seed data via `node server/db/seed.js`.

## Running in Replit
- Two workflows: `Backend` (`node server/index.js`, port 3001) and `Frontend` (`cd client && npm run dev`, port 5000, webview).
- Env vars (set via Replit secrets, not `.env`): `DATABASE_URL`, `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` (managed by Replit), `JWT_SECRET`, `NODE_ENV=development`, `PORT=3001`.
- Seeded login credentials: teacher `admin` / `admin123`, assistant `asst_nour` / `123456`, student `std_ali` / `123456`.

## Docker Deployment (VPS)
- Docker files: `Dockerfile` (main app), `Dockerfile.admin` (admin client), `docker-compose.yml`, `nginx-admin.conf`
- Main app container (port 3001): Express backend + `client/dist` (teacher/student React)
- Admin container (port 3002): Nginx serving `admin-client/dist` — proxies `/api` and `/uploads` to `app:3001`
- Volumes: `uploads_data` → `/app/uploads`, `wa_sessions` → `/app/whatsapp-sessions`, `pg_data` → PostgreSQL
- Env template: `.env.production.example` — copy to `.env` on VPS
- Full VPS setup guide: `docs/DEPLOYMENT_GUIDE_VPS.md`
- Cloudflare Tunnel stays as-is; add `admin.wathba.site` CNAME in Cloudflare DNS pointing to existing tunnel ID

## User Preferences
None recorded yet.
