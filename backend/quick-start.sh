#!/bin/bash
echo "🚀 Timeline Task App - Quick Start"
echo "=================================="

# Check if in correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the backend directory"
    echo "   cd backend && ./quick-start.sh"
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
fi

# Check if MongoDB is running
if ! pgrep -x "mongod" > /dev/null; then
    echo "🔄 Starting MongoDB..."
    sudo systemctl start mongod
fi

# Create public directory and copy frontend files
echo "📁 Setting up frontend files..."
mkdir -p public

# Start the server
echo "🚀 Starting Timeline Task Manager..."
echo "   Access at: http://localhost:3001"
echo "   Press Ctrl+C to stop"
echo ""
npm run dev
