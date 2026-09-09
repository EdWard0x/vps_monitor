#!/bin/sh
set -u

if [ "${MIGRATE_ON_START:-true}" = "true" ]; then
  if ! /app/migrate up --file /app/migrations/001_init.up.sql; then
    echo "database migration failed" >&2
    exit 1
  fi
fi

/app/worker &
worker_pid=$!
/app/api &
api_pid=$!

shutdown() {
  trap - TERM INT
  kill -TERM "$api_pid" "$worker_pid" 2>/dev/null || true
  wait "$api_pid" 2>/dev/null || true
  wait "$worker_pid" 2>/dev/null || true
  exit 0
}

trap shutdown TERM INT

while kill -0 "$api_pid" 2>/dev/null && kill -0 "$worker_pid" 2>/dev/null; do
  sleep 2
done

echo "api or worker exited unexpectedly; stopping backend container" >&2
kill -TERM "$api_pid" "$worker_pid" 2>/dev/null || true
wait "$api_pid" 2>/dev/null || true
wait "$worker_pid" 2>/dev/null || true
exit 1
