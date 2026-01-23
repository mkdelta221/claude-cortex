#!/bin/bash
# Claude Memory Dashboard Startup Script
# Starts both the API server and Next.js dashboard

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$HOME/.claude-memory/logs"

# Create log directory
mkdir -p "$LOG_DIR"

# Kill any existing instances
pkill -f "node.*visualization-server" 2>/dev/null
pkill -f "next-server.*3030" 2>/dev/null

# Wait for processes to stop
sleep 1

# Start API server (port 3001)
cd "$PROJECT_DIR"
nohup npm run dev:api > "$LOG_DIR/api-server.log" 2>&1 &
API_PID=$!
echo "API server started (PID: $API_PID)"

# Wait for API to be ready
sleep 2

# Start Next.js dashboard (port 3030)
cd "$PROJECT_DIR/dashboard"
nohup npm run dev > "$LOG_DIR/dashboard.log" 2>&1 &
DASHBOARD_PID=$!
echo "Dashboard started (PID: $DASHBOARD_PID)"

# Save PIDs for later shutdown
echo "$API_PID" > "$LOG_DIR/api-server.pid"
echo "$DASHBOARD_PID" > "$LOG_DIR/dashboard.pid"

echo "Claude Memory Dashboard running:"
echo "  - API: http://localhost:3001"
echo "  - Dashboard: http://localhost:3030"
echo "  - Logs: $LOG_DIR"
