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

# Write start script using heredoc
RUN cat > /app/start.sh << 'EOF'
#!/bin/sh
set -e
echo "=== AgentSpace Starting ==="

# Wait for PostgreSQL
echo "Waiting for PostgreSQL..."
until node -e "
  const pg = require('/app/packages/db/node_modules/pg');
  const client = new pg.Client(process.env.SELF_HOSTED_DATABASE_URL || process.env.DATABASE_URL);
  client.connect().then(function() { client.end(); process.exit(0); }).catch(function() { process.exit(1); });
" 2>/dev/null; do
  echo "PostgreSQL not ready, retrying in 2s..."
  sleep 2
done
echo "PostgreSQL connected!"

# Initialize DB schema if needed
echo "Ensuring database schema..."
cd /app
node --experimental-strip-types packages/db/src/postgres-cli.ts init --database-url "${SELF_HOSTED_DATABASE_URL:-$DATABASE_URL}" 2>/dev/null || echo "DB schema may already exist, continuing..."

# Start Next.js
echo "Starting AgentSpace on port ${PORT:-1455}..."
cd /app/apps/web
exec npx next start --hostname 0.0.0.0 --port "${PORT:-1455}"
EOF
RUN chmod +x /app/start.sh

EXPOSE 1455

CMD ["/app/start.sh"]
