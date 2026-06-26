# ===== AgentSpace Dockerfile for Railway =====
FROM node:24-slim AS builder
WORKDIR /app

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

# Copy everything needed for production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/apps/web ./apps/web
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/node_modules ./node_modules

# Create attachment storage directory and start script
RUN mkdir -p /var/lib/agentspace/workspaces

# Write start script
RUN echo '#!/bin/sh\n\
set -e\n\
echo "=== AgentSpace Starting ==="\n\
echo "Waiting for PostgreSQL..."\n\
until node -e "const pg=require(\"pg\");const c=new pg.Client(process.env.SELF_HOSTED_DATABASE_URL||process.env.DATABASE_URL);c.connect().then(()=>{c.end();process.exit(0)}).catch(()=>process.exit(1));" 2>/dev/null; do\n\
  echo "PostgreSQL not ready, retrying in 2s..."\n\
  sleep 2\n\
done\n\
echo "PostgreSQL connected!"\n\
echo "Ensuring database schema..."\n\
cd /app\n\
node --experimental-strip-types packages/db/src/postgres-cli.ts init 2>/dev/null || echo "DB schema may already exist, continuing..."\n\
echo "Starting AgentSpace on port ${PORT:-1455}..."\n\
cd /app/apps/web\n\
exec npx next start --hostname 0.0.0.0 --port ${PORT:-1455}' > /app/start.sh && chmod +x /app/start.sh

EXPOSE 1455

CMD ["/app/start.sh"]
