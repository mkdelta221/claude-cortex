#!/bin/bash
# Stop Claude Memory Dashboard

LOG_DIR="$HOME/.claude-memory/logs"

# Kill by PID files if they exist
if [ -f "$LOG_DIR/api-server.pid" ]; then
  kill $(cat "$LOG_DIR/api-server.pid") 2>/dev/null
  rm "$LOG_DIR/api-server.pid"
fi

if [ -f "$LOG_DIR/dashboard.pid" ]; then
  kill $(cat "$LOG_DIR/dashboard.pid") 2>/dev/null
  rm "$LOG_DIR/dashboard.pid"
fi

# Also kill by process name as fallback
pkill -f "node.*visualization-server" 2>/dev/null
pkill -f "next-server.*3030" 2>/dev/null

echo "Claude Memory Dashboard stopped"
