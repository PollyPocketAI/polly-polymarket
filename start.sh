#!/bin/bash
# Start Polly's dashboard server
cd "$(dirname "$0")"
echo "🦉 Starting Polly dashboard..."
node dashboard/server.js
