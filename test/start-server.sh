#!/bin/bash
cd "$(dirname "$0")/.."
DATA_DIR="$1" pnpm run dev &
PID=$!
sleep 5
echo "Server started at PID $PID"
wait $PID