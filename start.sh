#!/bin/sh
set -e
echo "=== AgentSpace Starting ==="
echo "Starting on port ${PORT:-1455}..."
cd /app/apps/web
exec npx next start --hostname 0.0.0.0 --port "${PORT:-1455}"
