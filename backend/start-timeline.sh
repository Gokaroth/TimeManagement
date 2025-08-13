#!/bin/bash

# Timeline Task Manager Startup Script
echo "🚀 Starting Timeline Task Manager..."

# Check MongoDB
if ! systemctl is-active --quiet mongodb; then
    echo "Starting MongoDB..."
    sudo systemctl start mongodb
    sleep 2
fi

# Start the application
echo "Starting server on http://localhost:3001"
npm run dev
