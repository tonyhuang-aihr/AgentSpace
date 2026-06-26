#!/bin/sh
set -e
echo "=== AgentSpace Starting ==="

# Initialize DB schema if needed (best-effort, don't block startup)
echo "Initializing database schema..."
cd /app
node --experimental-strip-types packages/db/src/postgres-cli.ts init --database-url "${SELF_HOSTED_DATABASE_URL:-$DATABASE_URL}" 2>&1 || echo "DB init skipped (may already exist or DB unreachable), continuing..."

# Start Next.js
echo "Starting AgentSpace on port ${PORT:-1455}..."
cd /app/apps/web
exec npx next start --hostname 0.0.0.0 --port "${PORT:-1455}"
