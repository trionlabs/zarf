#!/bin/bash

# Function to kill processes on a specific port
kill_port() {
  local port=$1
  local pids=$(lsof -ti :$port 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "Killing processes on port $port: $pids"
    kill -9 $pids
  else 
    echo "No process found on port $port"
  fi
}

echo "Cleaning ports 5173-5199..."
for ((port=5173; port<=5199; port++)); do
  kill_port $port
done
echo "Ports cleaned."

# Handle script termination to kill background processes
trap "kill 0" SIGINT

echo "Starting apps..."

# Start Create on 5174
echo "Starting Create on 5174..."
pnpm --filter @zarf/create dev --port 5174 &

# Start Claim on 5173 (overriding default)
echo "Starting Claim on 5173..."
pnpm --filter @zarf/claim dev --port 5173 &

# Wait for all background processes
wait
