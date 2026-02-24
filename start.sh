#!/bin/bash
# Start Polly dashboard server
cd "$(dirname "$0")/dashboard"
pkill -f "node server.js" 2>/dev/null || true
sleep 1
nohup node server.js > /tmp/polly.log 2>&1 &
echo $! > /tmp/polly.pid
echo "🦉 Polly dashboard started (PID $(cat /tmp/polly.pid)) → http://localhost:7420"
echo "   Logs: tail -f /tmp/polly.log"
