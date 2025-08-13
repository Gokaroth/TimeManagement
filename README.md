# Timeline Task Management App

A stylish, real-time timeline-based task management application with EU time formatting. Features a ruler-style timeline where tasks are displayed as boxes corresponding to their duration and position in time.

## ✨ Features

- **Real-time Timeline**: Smooth horizontal scrolling timeline that moves as time passes
- **EU Time Format**: 24-hour time display (HH:mm)  
- **Interactive Tasks**: Create, edit, delete, and drag tasks on the timeline
- **Live Updates**: WebSocket-based real-time synchronization
- **Responsive Design**: Clean, modern interface with glassmorphism effects
- **Task Management**: Status tracking, color coding, and duration management
- **Search & Filter**: Find tasks by title and filter by status
- **Zoom Controls**: Zoom in/out for different time granularities

## 🛠️ Tech Stack

**Frontend:**
- Vanilla JavaScript with HTML5 Canvas rendering
- Tailwind CSS for styling
- Real-time WebSocket client

**Backend:**
- Node.js + Express.js
- MongoDB with Mongoose ODM
- WebSocket server (ws library)
- RESTful API design

## 📋 Prerequisites

Before setting up the application, ensure you have:

- **Node.js** (version 16 or higher)
- **MongoDB** (version 4.4 or higher)
- **Git** (for cloning the repository)

### Installing Prerequisites on Garuda Linux:

```bash
# Update system
sudo pacman -Syu

# Install Node.js and npm
sudo pacman -S nodejs npm

# Install MongoDB
sudo pacman -S mongodb-bin

# Start MongoDB service
sudo systemctl start mongodb
sudo systemctl enable mongodb

# Verify installations
node --version
npm --version
mongod --version
```

## 🚀 Quick Setup

### Automated Setup (Recommended):

```bash
# Clone or create project directory
mkdir timeline-task-app
cd timeline-task-app

# Run the setup script
chmod +x setup.sh
./setup.sh
```

### Manual Setup:

1. **Backend Setup:**
```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit .env file with your settings
nano .env

# Start the development server
npm run dev
```

2. **Frontend Setup:**
The frontend files are already built and will be served by the backend server.

## 📁 Project Structure

```
timeline-task-app/
├── backend/
│   ├── server.js           # Main server file
│   ├── package.json        # Backend dependencies
│   ├── .env.example        # Environment template
│   └── public/             # Frontend static files
│       ├── index.html
│       ├── style.css
│       └── app.js
├── setup.sh               # Linux/Mac setup script
├── setup.bat              # Windows setup script
└── README.md              # This file
```

## ⚙️ Configuration

### Environment Variables (.env):

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Database Configuration  
MONGODB_URI=mongodb://localhost:27017/timeline-tasks

# Security
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# CORS Configuration
CORS_ORIGIN=http://localhost:3001
```

### MongoDB Setup:

The application will automatically create the database and collections on first run. No manual database setup is required.

## 🚦 Running the Application

### Development Mode:
```bash
cd backend
npm run dev
```

### Production Mode:
```bash
cd backend  
npm start
```

The application will be available at: **http://localhost:3001**

## 🌐 Network Access & OpenVPN Setup

To access the app from anywhere via your OpenVPN:

### 1. Configure Server Binding:
The server is configured to bind to `0.0.0.0` which allows external connections.

### 2. Firewall Configuration:
```bash
# Allow the application port through firewall
sudo ufw allow 3001/tcp

# Or for iptables
sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT
```

### 3. OpenVPN Access:
- Connect your devices to your OpenVPN network
- Access the app using your server's VPN IP: `http://192.168.x.x:3001`
- Replace `192.168.x.x` with your server's actual VPN IP address

### 4. Optional: Reverse Proxy Setup (Nginx):
```nginx
server {
    listen 80;
    server_name your-domain.local;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

## 📱 Usage

### Basic Operations:

1. **View Timeline**: The timeline automatically scrolls to show current time
2. **Add Task**: Click the "+ Add Task" button, fill in details
3. **Edit Task**: Click on any task box to edit its properties
4. **Delete Task**: Right-click task and select delete, or use the delete button in edit modal
5. **Search Tasks**: Use the search box in the sidebar to find tasks by title
6. **Filter Tasks**: Use the status dropdown to filter tasks by completion status
7. **Timeline Controls**:
   - Play/Pause: Stop or resume timeline movement
   - Jump to Now: Instantly scroll to current time
   - Zoom In/Out: Adjust timeline granularity

### Keyboard Shortcuts:
- **Space**: Play/pause timeline
- **Ctrl + Plus**: Zoom in
- **Ctrl + Minus**: Zoom out  
- **Home**: Jump to current time
- **Esc**: Close modal or deselect task

## 🔧 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | Get all tasks |
| GET | `/api/tasks/:id` | Get single task |
| POST | `/api/tasks` | Create new task |
| PUT | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task |
| GET | `/api/health` | Health check |

### Query Parameters:
- `start`: Filter tasks from start time (ISO 8601)
- `end`: Filter tasks to end time (ISO 8601)  
- `status`: Filter by status (pending, in-progress, completed)

## 🐛 Troubleshooting

### Common Issues:

**1. MongoDB Connection Error:**
```bash
# Check if MongoDB is running
sudo systemctl status mongodb

# Start MongoDB if stopped
sudo systemctl start mongodb
```

**2. Port Already in Use:**
```bash
# Find process using port 3001
sudo netstat -tulpn | grep 3001

# Kill the process (replace PID)
sudo kill -9 <PID>
```

**3. Cannot Connect from Other Devices:**
- Check firewall settings
- Verify OpenVPN configuration
- Ensure server is binding to 0.0.0.0, not 127.0.0.1

**4. WebSocket Connection Failed:**
- Check if WebSocket port is accessible
- Verify proxy configuration if using reverse proxy
- Check browser console for WebSocket errors

### Logs:
- Application logs: Check terminal output where server is running
- MongoDB logs: `/var/log/mongodb/mongod.log`
- System logs: `journalctl -u mongodb`

## 🔄 Updates & Maintenance

### Updating the Application:
```bash
# Backup your data first
mongodump --db timeline-tasks --out backup/

# Pull updates (if using git)
git pull origin main

# Update dependencies
cd backend
npm install

# Restart the server
npm run dev
```

### Database Backup:
```bash
# Create backup
mongodump --db timeline-tasks --out backup/$(date +%Y%m%d_%H%M%S)

# Restore backup
mongorestore --db timeline-tasks backup/YYYYMMDD_HHMMSS/timeline-tasks/
```

## 🤝 Contributing

This is a personal use application, but if you'd like to suggest improvements:

1. Create an issue describing the enhancement
2. Fork the repository
3. Create a feature branch
4. Make your changes
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For issues and questions:
- Check the troubleshooting section above
- Review application logs
- Create an issue in the repository

---

**Created for personal timeline management with style and precision! 🎯**
