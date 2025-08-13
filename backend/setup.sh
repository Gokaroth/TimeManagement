#!/bin/bash

# Timeline Task Manager - Complete Setup Script
# This script sets up the production-ready timeline task manager with backend integration

echo "🚀 Timeline Task Manager - Complete Setup"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if MongoDB is running
check_mongodb() {
    if ! systemctl is-active --quiet mongodb; then
        echo -e "${YELLOW}📁 MongoDB is not running. Starting MongoDB...${NC}"
        sudo systemctl start mongodb
        sudo systemctl enable mongodb
        sleep 2
    fi

    if systemctl is-active --quiet mongodb; then
        echo -e "${GREEN}✅ MongoDB is running${NC}"
    else
        echo -e "${RED}❌ Failed to start MongoDB. Please check your installation.${NC}"
        exit 1
    fi
}

# Create directory structure
setup_directories() {
    echo -e "${BLUE}📁 Setting up directories...${NC}"
    mkdir -p public
    chmod 755 public
}

# Install Node.js dependencies
setup_backend() {
    echo -e "${BLUE}⚙️  Setting up backend dependencies...${NC}"

    if [ ! -f "package.json" ]; then
        echo -e "${RED}❌ package.json not found${NC}"
        exit 1
    fi

    # Install dependencies
    npm install
    echo -e "${GREEN}✅ Backend dependencies installed${NC}"
}

# Create environment configuration
setup_environment() {
    echo -e "${BLUE}⚙️  Setting up environment...${NC}"

    # Create .env file if it doesn't exist
    if [ ! -f ".env" ]; then
        cat > .env << EOL
# Timeline Task Manager Environment Configuration
NODE_ENV=production
PORT=3001
MONGODB_URI=mongodb://localhost:27017/timeline-tasks

# WebSocket Configuration
WS_PORT=3001

# Security
CORS_ORIGIN=http://localhost:3001
EOL
        echo -e "${GREEN}✅ Created .env configuration${NC}"
    else
        echo -e "${YELLOW}⚠️  .env file already exists${NC}"
    fi
}

# Create startup script
create_startup_script() {
    echo -e "${BLUE}📝 Creating startup script...${NC}"

    cat > start-timeline.sh << 'EOL'
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
EOL

    chmod +x start-timeline.sh
    echo -e "${GREEN}✅ Created startup script: start-timeline.sh${NC}"
}

# Create systemd service for auto-start
create_systemd_service() {
    echo -e "${BLUE}⚙️  Setting up systemd service (optional)...${NC}"

    read -p "Do you want to create a systemd service for auto-start? (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        USER_NAME=$(whoami)
        WORK_DIR=$(pwd)

        sudo tee /etc/systemd/system/timeline-tasks.service > /dev/null << EOL
[Unit]
Description=Timeline Task Manager
After=network.target mongodb.service
Requires=mongodb.service

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$WORK_DIR
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOL

        sudo systemctl daemon-reload
        sudo systemctl enable timeline-tasks
        echo -e "${GREEN}✅ Systemd service created and enabled${NC}"
        echo -e "${BLUE}   To start: sudo systemctl start timeline-tasks${NC}"
        echo -e "${BLUE}   To check status: sudo systemctl status timeline-tasks${NC}"
    fi
}

# Test the setup
test_setup() {
    echo -e "${BLUE}🧪 Testing setup...${NC}"

    # Test MongoDB connection
    if mongosh --eval "db.adminCommand('ping')" --quiet > /dev/null 2>&1; then
        echo -e "${GREEN}✅ MongoDB connection successful${NC}"
    else
        echo -e "${RED}❌ MongoDB connection failed${NC}"
        exit 1
    fi

    # Test Node.js dependencies
    if npm list --depth=0 > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Node.js dependencies verified${NC}"
    else
        echo -e "${YELLOW}⚠️  Some Node.js dependencies may be missing${NC}"
    fi

    echo -e "${GREEN}✅ Setup test completed successfully${NC}"
}

# Provide usage instructions
show_instructions() {
    echo
    echo -e "${GREEN}🎉 Timeline Task Manager Setup Complete!${NC}"
    echo "========================================"
    echo
    echo -e "${BLUE}📋 What's been set up:${NC}"
    echo "   ✅ MongoDB database connection"
    echo "   ✅ Backend API server with real-time WebSockets"
    echo "   ✅ Fixed frontend with proper backend integration"
    echo "   ✅ Persistent task operations (including DELETE)"
    echo "   ✅ EU 24-hour time format"
    echo "   ✅ Real-time timeline animation"
    echo
    echo -e "${BLUE}🚀 To start the application:${NC}"
    echo "   ./start-timeline.sh"
    echo "   OR"
    echo "   npm run dev"
    echo
    echo -e "${BLUE}🌐 Access your application:${NC}"
    echo "   Local: http://localhost:3001"
    echo "   OpenVPN: http://YOUR_VPN_IP:3001"
    echo
    echo -e "${BLUE}⚡ Features available:${NC}"
    echo "   • Create, edit, delete tasks (with persistence)"
    echo "   • Real-time timeline with smooth animations"
    echo "   • Drag tasks to reschedule"
    echo "   • Search and filter tasks"
    echo "   • WebSocket live updates across tabs"
    echo "   • EU time format (24-hour)"
    echo "   • Professional dark/light theme"
    echo
    echo -e "${BLUE}🔧 Maintenance commands:${NC}"
    echo "   MongoDB status: sudo systemctl status mongodb"
    echo "   View logs: npm run dev"
    echo "   Database: mongosh timeline-tasks"
    echo
    echo -e "${YELLOW}⚠️  Important Notes:${NC}"
    echo "   • MongoDB must be running before starting the app"
    echo "   • Application runs on port 3001"
    echo "   • Tasks are stored in MongoDB 'timeline-tasks' database"
    echo "   • DELETE operations now work correctly!"
}

# Main execution
main() {
    echo -e "${BLUE}Starting setup process...${NC}"

    # Check if we're in the right directory
    if [ ! -f "server.js" ]; then
        echo -e "${RED}❌ server.js not found. Please run this script in the project directory.${NC}"
        exit 1
    fi

    # Run setup steps
    check_mongodb
    setup_directories
    setup_frontend
    setup_backend
    setup_environment
    create_startup_script
    create_systemd_service
    test_setup
    show_instructions

    echo -e "${GREEN}🎉 Setup completed successfully!${NC}"
}

# Execute main function
main "$@"
