<div align="center">
  <img src="client/public/wathba-logo.png" alt="Wathba Logo" width="110" />

  <h1>Wathba — وثبة</h1>
  <p><strong>Multi-tenant LMS for private tutoring centers in Egypt</strong></p>

  ![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)
  ![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
  ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
  ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)
  ![License](https://img.shields.io/badge/License-Private-red)
</div>

---

## Overview

**Wathba** is a full-stack Software-as-a-Service (SaaS) Learning Management System built for private tutoring centers in Egypt. Each teacher gets an isolated, branded subdomain (`teacher-name.wathba.site`) with their own students, courses, exams, and analytics — completely separated from other tenants.

The platform supports **three user roles** (Teacher · Assistant · Student) with a rich feature set covering the entire lifecycle of online tutoring: content delivery, examination, payments, live streaming, gamification, and parent communication.

---

## Key Features

| Area | Highlights |
|------|-----------|
| **Multi-Tenant SaaS** | Subdomain-based tenant isolation, custom branding per teacher, installable PWA per tenant |
| **Course Management** | Sections → Videos → PDFs, multi-quality video (480p/720p/1080p), resume playback, progress tracking |
| **Exam Engine** | MCQ, True/False, Essay, Image-Multi question types · Question banks with random selection · Server-side timer & anti-cheat sessions · Full attempt history |
| **Recitations** | Scheduled recurring quizzes (once / daily / weekly) · Server-side sessions · Automated absent marking |
| **Live Streaming** | LiveKit WebRTC integration · Chat, hand-raise queue, speaker permissions, screen sharing, kick moderation |
| **Payments** | InstaPay / Vodafone Cash / Fawry · Receipt upload → manual verification → auto enrollment |
| **Gamification** | Leaderboard with monthly reset · Badges (gold/silver/bronze) · Stickman Run educational canvas game |
| **Notifications** | Real-time SSE · Firebase Cloud Messaging push · WhatsApp (Baileys) with broadcast scheduling |
| **Analytics** | Per-student performance charts (ECharts) · Wrong-question analysis · PDF report export (jsPDF) |
| **Assistant RBAC** | 9 granular permission flags per assistant account, cached for performance |
| **Security** | JWT auth + token blacklisting · Rate limiting · Helmet security headers · Magic-byte file validation · Protected media endpoints |
| **Audit & Archive** | Full activity log · Soft-delete for students & exams · Archive system |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 · Vite 5 · Tailwind CSS 3 · React Router 6 · TanStack Query 5 |
| **Backend** | Node.js 20 · Express 4 |
| **Database** | PostgreSQL 16 via `pg` pool |
| **Auth** | JWT (`jsonwebtoken`) · `bcryptjs` |
| **Real-time** | Server-Sent Events (SSE) · Firebase Cloud Messaging |
| **Live Stream** | LiveKit (self-hosted via Docker + Caddy) |
| **WhatsApp** | Baileys (WhatsApp Web API) |
| **Charts** | ECharts · `echarts-for-react` |
| **PDF** | `jsPDF` · `jspdf-autotable` · `pdfjs-dist` |
| **Math rendering** | KaTeX |
| **File Uploads** | Multer → `/uploads/` with JWT-protected access |
| **Spreadsheets** | SheetJS (xlsx) for bulk import/export |

---

## Architecture

```
Browser
  │
  ├── Subdomain (mr-ahmed.wathba.site)
  │     └── Tenant resolved server-side via Host header
  │
  ├── React SPA  (Vite dev: port 5000 → proxies /api to 3001)
  │     ├── AuthContext  — JWT state, proactive token refresh
  │     ├── TanStack Query — server-state, caching, background refetch
  │     └── Axios instance — injects Authorization + X-Tenant-Slug headers
  │
  └── Express API  (port 3001)
        ├── subdomainTenant middleware  — resolves teacher from Host header
        ├── auth middleware             — JWT verification & role guard
        ├── SSE /api/sse               — real-time push (exam publish, retry, etc.)
        ├── Multer /uploads/           — file upload with magic-byte validation
        ├── FCM lib                    — mobile push via Firebase
        ├── Baileys                    — WhatsApp message delivery
        └── pg Pool → PostgreSQL       — multi-tenant data, all scoped by teacher_id
```

---

## Project Structure

```
wathba/
├── client/                  # React + Vite frontend
│   ├── public/              # PWA assets, service worker, favicon
│   └── src/
│       ├── context/         # Auth, Theme, LiveStream contexts
│       ├── layouts/         # Teacher / Assistant / Student shells
│       ├── pages/
│       │   ├── teacher/     # 25+ management pages
│       │   ├── assistant/   # Permission-gated pages
│       │   └── student/     # Course viewer, exams, games, stats
│       └── components/      # Shared UI (VideoPlayer, PdfViewer, ExamTimer, …)
│
├── server/
│   ├── index.js             # Entry point — Express, DB init, route mounting
│   ├── db/
│   │   ├── schema.sql       # All tables (CREATE TABLE IF NOT EXISTS)
│   │   └── seed.js          # Demo dataset with 3 teachers, students, content
│   ├── middleware/          # auth.js · subdomainTenant.js · validate.js
│   ├── lib/                 # fcm.js · whatsapp.js · analyticsCache.js · …
│   └── routes/              # auth · teachers · students · courses · exams
│                            # recitations · payments · live · notifications
│                            # questionBanks · archive · activityLogs · events
│
├── live-service/            # LiveKit self-host config (Docker Compose + Caddy)
├── docs/                    # Platform overview & deployment guide
├── scripts/                 # start.sh / start-dev.bat / reset-db helpers
├── .env.example             # All required environment variables documented
└── package.json             # Root scripts: dev · build · start · seed · reset
```

---

## Getting Started

### Prerequisites
- Node.js ≥ 20
- PostgreSQL 16

### Installation

```bash
# 1. Clone and install dependencies
git clone https://github.com/YOUR_USERNAME/wathba.git
cd wathba
npm install
cd client && npm install && cd ..

# 2. Configure environment
cp .env.example .env
# Edit .env — fill in DATABASE_URL and JWT_SECRET

# 3. Start development (backend on :3001, frontend on :5000)
npm run dev          # backend
npm run client       # frontend (separate terminal)

# 4. (Optional) Seed demo data
npm run seed
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Long random string for signing tokens |
| `NODE_ENV` | ✅ | `development` or `production` |
| `PORT` | — | Server port (default `3001`) |
| `WILDCARD_DOMAIN` | — | Base domain for subdomain resolution (e.g. `wathba.site`) |
| `LIVEKIT_API_KEY` | — | LiveKit server credentials (for live streaming) |
| `LIVEKIT_API_SECRET` | — | LiveKit server credentials |
| `LIVEKIT_URL` | — | LiveKit WebSocket URL |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | — | Firebase Admin SDK JSON (for FCM push) |

---

## Demo Credentials (after `npm run seed`)

| Role | Username | Password | Notes |
|------|----------|----------|-------|
| Teacher | `admin` | `admin123` | Full platform access |
| Assistant (full perms) | `asst_nour` | `123456` | All 9 permissions enabled |
| Assistant (partial) | `asst_karim` | `123456` | Limited permissions |
| Assistant (view only) | `asst_dina` | `123456` | Read-only access |
| Student — Grade 3 | `std_ali` | `123456` | High performer |
| Student — Grade 3 | `std_mona` | `123456` | Average performer |
| Student — Grade 2 | `std_mostafa` | `123456` | — |
| Student — Grade 1 | `std_nour2` | `123456` | — |

> **Note:** The teacher account is created with a random password on first startup. Running `seed.js` resets it to `admin123`.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Express backend (development) |
| `npm run client` | Start Vite frontend dev server |
| `npm run build` | Build React frontend for production |
| `npm start` | Start backend in production mode |
| `npm run seed` | Populate database with demo data |
| `npm run reset` | Wipe and re-initialize the database |

---

## Deployment

The platform is designed to run behind a reverse proxy (Nginx or Cloudflare Tunnel) with wildcard DNS pointing all subdomains to a single server process. See [`docs/DEPLOYMENT_GUIDE.md`](docs/DEPLOYMENT_GUIDE.md) for a full step-by-step guide covering local hosting with Cloudflare Tunnel and production VPS setup.

For live streaming, a separate LiveKit server is required. Configuration files are in [`live-service/`](live-service/).

---

<div align="center">
  <sub>Built for private tutoring centers in Egypt &nbsp;·&nbsp; وثبة — منصتك التعليمية الخاصة</sub>
</div>
