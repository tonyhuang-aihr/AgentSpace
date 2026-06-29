# ===== AgentSpace Dockerfile for Railway =====
# Single-stage build - optimized for 1GB RAM

FROM node:24-slim
WORKDIR /app

# Copy all source
COPY . .

# Setup workspace dependencies
RUN npm run setup

# Build daemon package (required by web)
RUN npm --prefix packages/daemon run build

# Build Next.js web app (standalone output reduces runtime footprint)
RUN npm --prefix apps/web run build

# Create attachment storage directory
RUN mkdir -p /var/lib/agentspace/workspaces

# Ensure start script is executable
RUN chmod +x /app/start.sh

# Railway sets PORT env var automatically
EXPOSE 1455

CMD ["/app/start.sh"]
