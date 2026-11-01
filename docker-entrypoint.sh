#!/bin/sh
set -e

# 以 root 启动时先修正挂载目录属主，再降权到 node 运行，避免容器内 root 进程
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data
  chown -R node:node /app/data
  exec su-exec node "$@"
fi

exec "$@"
