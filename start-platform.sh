#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
LOG_DIR="$ROOT_DIR/.logs"
mkdir -p "$LOG_DIR"

PIDS=()
NAMES=()

cleanup() {
  local exit_code=$?
  echo "\n[starter] Caught signal, stopping services..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
  wait || true
  echo "[starter] All services stopped."
  exit $exit_code
}

trap cleanup INT TERM

start_service() {
  local name="$1"
  local rel_dir="$2"
  local cmd="$3"
  local log_file="$LOG_DIR/${name// /_}.log"

  echo "[starter] Starting $name (logs -> ${log_file#$ROOT_DIR/})"
  (
    cd "$ROOT_DIR/$rel_dir"
    exec bash -lc "$cmd"
  ) &>"$log_file" &

  local pid=$!
  PIDS+=("$pid")
  NAMES+=("$name")
  echo "[starter] $name started (PID $pid)"
}

start_service "SSE MCP Server" "sse-mcp-server" "npm install && npm run build && npm start"
start_service "Chat Backend" "chat/server" "npm install && npm run build && npm start"
start_service "Chat Frontend" "chat/web" "npm install && npm run dev"

echo "[starter] All services launched. Press Ctrl+C to stop."
wait -n
cleanup
