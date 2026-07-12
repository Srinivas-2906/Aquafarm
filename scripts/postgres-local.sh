#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="${PG_BIN:-/Library/PostgreSQL/18/bin}"
DATA_DIR="${DATA_DIR:-$ROOT_DIR/.postgres-data}"
PORT="${POSTGRES_PORT:-5433}"
LOG_FILE="$DATA_DIR/server.log"

usage() {
  cat <<EOF
Usage: $(basename "$0") <start|stop|status|restart|create>

Local PostgreSQL for AquaLedger (port $PORT, data in .postgres-data/).

  start   Start the server
  stop    Stop the server
  status  Show server status
  restart Restart the server
  create  Initialize cluster + database (first-time setup)
EOF
}

init_cluster() {
  if [[ -f "$DATA_DIR/PG_VERSION" ]]; then
    echo "Cluster already exists at $DATA_DIR"
    return
  fi

  mkdir -p "$DATA_DIR"
  pwfile="$(mktemp)"
  trap 'rm -f "$pwfile"' RETURN
  printf 'aqualedger\n' >"$pwfile"

  "$PG_BIN/initdb" \
    -D "$DATA_DIR" \
    -U aqualedger \
    --pwfile="$pwfile" \
    --auth-local=scram-sha-256 \
    --auth-host=scram-sha-256

  {
    echo "port = $PORT"
    echo "listen_addresses = 'localhost'"
  } >>"$DATA_DIR/postgresql.conf"

  echo "Cluster initialized at $DATA_DIR"
}

create_database() {
  init_cluster
  "$0" start
  PGPASSWORD=aqualedger "$PG_BIN/createdb" -h localhost -p "$PORT" -U aqualedger aqualedger 2>/dev/null || true
  echo "Database 'aqualedger' is ready on localhost:$PORT"
}

start_server() {
  if [[ ! -f "$DATA_DIR/PG_VERSION" ]]; then
    echo "No cluster found. Run: $(basename "$0") create"
    exit 1
  fi

  if "$PG_BIN/pg_ctl" -D "$DATA_DIR" status >/dev/null 2>&1; then
    echo "PostgreSQL already running on port $PORT"
    return
  fi

  "$PG_BIN/pg_ctl" -D "$DATA_DIR" -l "$LOG_FILE" -o "-p $PORT" start
  "$PG_BIN/pg_isready" -h localhost -p "$PORT"
}

stop_server() {
  "$PG_BIN/pg_ctl" -D "$DATA_DIR" stop || true
}

case "${1:-}" in
  start) start_server ;;
  stop) stop_server ;;
  status) "$PG_BIN/pg_ctl" -D "$DATA_DIR" status ;;
  restart) stop_server; start_server ;;
  create) create_database ;;
  *) usage; exit 1 ;;
esac
