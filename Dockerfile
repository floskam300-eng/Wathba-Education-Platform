# ─────────────────────────────────────────────────────────
#  WATHBA — Main App (Backend + Student/Teacher Frontend)
#  Multi-stage build: compile React → copy into Node image
# ─────────────────────────────────────────────────────────

# ── Stage 1: Build the React client ──────────────────────
FROM node:20-alpine AS client-builder

WORKDIR /build/client
COPY client/package.json ./
# Do NOT copy package-lock.json — it contains Replit-internal registry URLs
# (package-firewall.replit.local) that are unreachable outside Replit.
# npm install without a lockfile resolves from the real npm registry.
RUN npm install
COPY client/ ./
RUN npm run build

# ── Stage 2: Production Node image ───────────────────────
FROM node:20-alpine AS runner

# Install dumb-init for proper signal handling (SIGTERM → graceful shutdown)
RUN apk add --no-cache dumb-init

WORKDIR /app

# Backend dependencies only (no devDeps)
# Copy package.json + package-lock.json, then force real npm registry so
# any Replit-internal resolved URLs in the lockfile are overridden at build time.
COPY package*.json ./
RUN npm ci --omit=dev --registry=https://registry.npmjs.org

# Copy server source
COPY server/ ./server/

# Copy compiled frontend from stage 1
COPY --from=client-builder /build/client/dist ./client/dist

# Uploads directory (mounted as volume in production)
RUN mkdir -p uploads whatsapp-sessions

EXPOSE 3001

# dumb-init ensures SIGTERM is forwarded correctly to Node
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server/index.js"]
