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
