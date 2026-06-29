#!/bin/sh
set -e

echo "=== AgentSpace Daemon Starting ==="

# Validate required env vars
if [ -z "$AGENT_SPACE_SERVER_URL" ]; then
  echo "ERROR: AGENT_SPACE_SERVER_URL is not set"
  exit 1
fi
if [ -z "$AGENT_SPACE_DAEMON_TOKEN" ]; then
  echo "ERROR: AGENT_SPACE_DAEMON_TOKEN is not set"
  exit 1
fi

# Set defaults
DAEMON_ID="${AGENT_SPACE_DAEMON_ID:-railway-daemon-01}"
DEVICE_NAME="${AGENT_SPACE_DEVICE_NAME:-railway-daemon}"
RUNTIME_NAME="${AGENT_SPACE_RUNTIME_NAME:-DeepSeek Agent}"
STATE_DIR="${AGENT_SPACE_DAEMON_STATE_DIR:-/root/.agent-space-daemon}"

# Set DeepSeek API key in opencode config if provided
if [ -n "$DEEPSEEK_API_KEY" ]; then
  # Write API key to opencode auth store
  mkdir -p /root/.local/share/opencode
  echo "{\"deepseek\":{\"apiKey\":\"$DEEPSEEK_API_KEY\"}}" > /root/.local/share/opencode/auth.json
  
  # Also update opencode.json with the API key
  if [ -f /root/.config/opencode/opencode.json ]; then
    cat /root/.config/opencode/opencode.json | \
      sed "s/\"apiKey\": \"\"/\"apiKey\": \"$DEEPSEEK_API_KEY\"/" > /tmp/opencode-temp.json
    mv /tmp/opencode-temp.json /root/.config/opencode/opencode.json
  fi
  
  echo "DeepSeek API key configured"
fi

# Set OPENCODE_MODEL for daemon provider
export OPENCODE_MODEL="${OPENCODE_MODEL:-deepseek/deepseek-chat}"

echo "Server URL: $AGENT_SPACE_SERVER_URL"
echo "Daemon ID: $DAEMON_ID"
echo "OpenCode Model: $OPENCODE_MODEL"

# Create state directory
mkdir -p "$STATE_DIR"

echo "Starting agent-space-daemon..."
exec agent-space-daemon start \
  --foreground \
  --state-dir "$STATE_DIR" \
  --server-url "$AGENT_SPACE_SERVER_URL" \
  --daemon-token "$AGENT_SPACE_DAEMON_TOKEN" \
  --daemon-id "$DAEMON_ID" \
  --device-name "$DEVICE_NAME" \
  --runtime-name "$RUNTIME_NAME"
