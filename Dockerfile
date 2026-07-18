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

# dumb-init: proper SIGTERM forwarding.
# vips + supporting libs: required by sharp (WebP image conversion) on Alpine/musl.
# Without these, sharp silently hangs instead of throwing an error.
RUN apk add --no-cache \
    dumb-init \
    vips-dev \
    fftw-dev \
    build-base \
    python3

WORKDIR /app

# Backend dependencies only (no devDeps)
# Do NOT copy package-lock.json — it contains Replit-internal registry URLs
# (package-firewall.replit.local) that are unreachable outside Replit.
# npm install without a lockfile resolves from the real npm registry.
COPY package.json ./
# SHARP_IGNORE_GLOBAL_LIBVIPS=0 tells sharp to use the system libvips installed above
# instead of downloading its own bundled copy, ensuring Alpine compatibility.
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=0
RUN npm install --omit=dev

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
