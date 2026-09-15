#!/bin/sh
set -eu

# 默认不迁移数据；显式启用时，失败会阻止容器启动。
if [ "${MIGRATE_ON_START:-false}" = "true" ]; then
  /app/migrate -direction up -dir /app/migrations
fi

/app/api &
api_pid=$!

worker_pid=""
if [ "${START_WORKER:-false}" = "true" ]; then
  /app/worker &
  worker_pid=$!
fi

shutdown() {
  trap - TERM INT
  kill -TERM "$api_pid" 2>/dev/null || true
  if [ -n "$worker_pid" ]; then kill -TERM "$worker_pid" 2>/dev/null || true; fi
  wait "$api_pid" 2>/dev/null || true
  if [ -n "$worker_pid" ]; then wait "$worker_pid" 2>/dev/null || true; fi
}
trap shutdown TERM INT
wait "$api_pid"
