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

# Ensure start script is executable (already in repo)
RUN chmod +x /app/start.sh

EXPOSE 1455

CMD ["/app/start.sh"]
