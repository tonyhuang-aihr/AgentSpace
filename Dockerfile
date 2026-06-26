# ===== AgentSpace Dockerfile for Railway =====
# Full build approach (workspace protocol requires full node_modules)

# ---- Stage 1: Build ----
FROM node:24-slim AS builder
WORKDIR /app

# Install PostgreSQL client libraries for pg module
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

# Copy all source
COPY . .

# Setup all workspace dependencies
RUN npm run setup

# Build daemon package (required by web)
RUN npm --prefix packages/daemon run build

# Build Next.js web app
RUN npm --prefix apps/web run build

# ---- Stage 2: Production ----
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy everything needed for production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/apps/web ./apps/web
COPY --from=builder /app/packages ./packages

# Create attachment storage directory
RUN mkdir -p /var/lib/agentspace/workspaces && \
    chown -R nextjs:nodejs /var/lib/agentspace

# Write start script
COPY --chmod=755 <<'STARTSH' /app/start.sh
#!/bin/sh
set -e

echo "=== AgentSpace Starting ==="

# Wait for PostgreSQL
echo "Waiting for PostgreSQL..."
until node -e "
  const pg = require('/app/packages/db/node_modules/pg');
  const client = new pg.Client(process.env.SELF_HOSTED_DATABASE_URL || process.env.DATABASE_URL);
  client.connect().then(() => { client.end(); process.exit(0); }).catch(() => process.exit(1));
" 2>/dev/null; do
  echo "PostgreSQL not ready, retrying in 2s..."
  sleep 2
done
echo "PostgreSQL connected!"

# Initialize DB schema if needed
echo "Ensuring database schema..."
cd /app
node --experimental-strip-types packages/db/src/postgres-cli.ts init 2>/dev/null || echo "DB schema may already exist, continuing..."

# Start Next.js
echo "Starting AgentSpace..."
cd /app
exec npx next start --hostname 0.0.0.0 --port ${PORT:-1455}
STARTSH

USER nextjs

EXPOSE 1455

CMD ["/app/start.sh"]
