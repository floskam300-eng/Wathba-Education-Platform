#!/bin/bash
# Start backend server
node server/index.js &
SERVER_PID=$!

# Wait for backend to be ready
sleep 2

# Start frontend dev server
cd client && npm run dev &
CLIENT_PID=$!

trap "kill $SERVER_PID $CLIENT_PID 2>/dev/null" EXIT INT TERM

wait
