# ===== AgentSpace Dockerfile for Railway =====
# Single-stage build (monorepo node_modules with symlinks can't cross COPY --from)

FROM node:24-slim
WORKDIR /app

# Install PostgreSQL client for DB init
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

# Copy all source
COPY . .

# Setup workspace dependencies
RUN npm run setup

# Build daemon package (required by web)
RUN npm --prefix packages/daemon run build

# Build Next.js web app
RUN npm --prefix apps/web run build

# Prune dev dependencies to reduce image size
RUN npm prune --production 2>/dev/null || true

# Create attachment storage directory
RUN mkdir -p /var/lib/agentspace/workspaces

# Write start script
RUN printf '#!/bin/sh\n\
set -e\n\
echo "=== AgentSpace Starting ==="\n\
echo "Waiting for PostgreSQL..."\n\
until node -e "const pg=require(\\"/app/packages/db/node_modules/pg\\");const c=new pg.Client(process.env.SELF_HOSTED_DATABASE_URL||process.env.DATABASE_URL);c.connect().then(()=>{c.end();process.exit(0)}).catch(()=>process.exit(1));" 2>/dev/null; do\n\
  echo "PostgreSQL not ready, retrying in 2s..."\n\
  sleep 2\n\
done\n\
echo "PostgreSQL connected!"\n\
echo "Ensuring database schema..."\n\
cd /app\n\
node --experimental-strip-types packages/db/src/postgres-cli.ts init --database-url "${SELF_HOSTED_DATABASE_URL:-$DATABASE_URL}" 2>/dev/null || echo "DB schema may already exist, continuing..."\n\
echo "Starting AgentSpace on port ${PORT:-1455}..."\n\
cd /app/apps/web\n\
exec npx next start --hostname 0.0.0.0 --port "${PORT:-1455}"\n' > /app/start.sh && chmod +x /app/start.sh

EXPOSE 1455

CMD ["/app/start.sh"]
