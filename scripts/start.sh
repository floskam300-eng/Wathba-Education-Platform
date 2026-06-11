#!/bin/bash
node server/index.js &
SERVER_PID=$!

cd client && npm run dev &
CLIENT_PID=$!

trap "kill $SERVER_PID $CLIENT_PID 2>/dev/null" EXIT INT TERM

wait
