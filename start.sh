#!/bin/sh
set -e
echo "=== AgentSpace Starting ==="

# Limit Node.js heap to 700MB to avoid OOM on 1GB container
export NODE_OPTIONS="${NODE_OPTIONS} --max-old-space-size=700"

# Set PG connection timeouts for Neon (cold start can take 3s)
export PGCONNECT_TIMEOUT=10

# Initialize DB schema if needed (best-effort, don't block startup)
echo "Initializing database schema..."
cd /app
node --experimental-strip-types packages/db/src/postgres-cli.ts init --database-url "${SELF_HOSTED_DATABASE_URL:-$DATABASE_URL}" 2>&1 || echo "DB init skipped (may already exist or DB unreachable), continuing..."

# Start Next.js
echo "Starting AgentSpace on port ${PORT:-1455}..."
cd /app/apps/web
exec npx next start --hostname 0.0.0.0 --port "${PORT:-1455}"
