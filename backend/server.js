const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/timeline-tasks';

// Database connection
mongoose.connect(MONGODB_URI).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('MongoDB connection error:', err);
});

// Task Model
const taskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    startTime: { type: Date, required: true },
    duration: { type: Number, required: true }, // minutes
    color: { type: String, default: '#3B82F6' },
    status: { 
        type: String, 
        enum: ['pending', 'in-progress', 'completed'], 
        default: 'pending' 
    },
    userId: { type: String, default: 'default' }, // For multi-user support later
    // The tempId from the client is used for broadcast logic but not saved to the DB.
    tempId: { type: String, select: false }
}, {
    timestamps: true
});

const Task = mongoose.model('Task', taskSchema);

// Middleware
// Using default helmet settings is more secure than disabling CSP.
// For production, you would want to configure this further.
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000 // limit each IP to 1000 requests per windowMs
});
app.use('/api', limiter);

// Serve static files (React frontend)
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
// Get all tasks
app.get('/api/tasks', async (req, res) => {
    try {
        const { start, end, status } = req.query;
        let query = {};

        if (start || end) {
            query.startTime = {};
            if (start) query.startTime.$gte = new Date(start);
            if (end) query.startTime.$lte = new Date(end);
        }

        if (status && status !== 'all') {
            query.status = status;
        }

        const tasks = await Task.find(query).sort({ startTime: 1 });
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single task
app.get('/api/tasks/:id', async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        res.json(task);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new task
app.post('/api/tasks', async (req, res) => {
    try {
        // tempId is used for WebSocket logic but not saved
        const { tempId, ...taskData } = req.body;
        const task = new Task(taskData);
        await task.save();

        const taskResponse = task.toObject();
        // Echo the tempId back so the originating client can ignore the broadcast
        if (tempId) {
            taskResponse.tempId = tempId;
        }

        // Broadcast to all connected WebSocket clients
        broadcast('task:created', taskResponse);

        res.status(201).json(task);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Update task
app.put('/api/tasks/:id', async (req, res) => {
    try {
        const task = await Task.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true, runValidators: true }
        );
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Broadcast to all connected WebSocket clients
        broadcast('task:updated', task);

        res.json(task);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Delete task
app.delete('/api/tasks/:id', async (req, res) => {
    try {
        const task = await Task.findByIdAndDelete(req.params.id);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Broadcast to all connected WebSocket clients
        broadcast('task:deleted', { id: req.params.id });

        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Create HTTP server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access the app at http://localhost:${PORT}`);
});

// WebSocket Server
const wss = new WebSocket.Server({ server });

const clients = new Set();

wss.on('connection', (ws) => {
    console.log('Client connected');
    clients.add(ws);

    // Send current time every second
    const timeInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'time:update',
                data: { currentTime: new Date().toISOString() }
            }));
        }
    }, 1000);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received:', data);

            // Handle different message types
            switch (data.type) {
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
                case 'timeline:sync':
                    // Send current server time
                    ws.send(JSON.stringify({
                        type: 'timeline:synced',
                        data: { serverTime: new Date().toISOString() }
                    }));
                    break;
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        clients.delete(ws);
        clearInterval(timeInterval);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Broadcast function for real-time updates
function broadcast(type, data) {
    const message = JSON.stringify({ type, data });
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} received. Shutting down server...`);

    try {
        // Close HTTP server first
        if (server) {
            await new Promise((resolve, reject) => {
                server.close((err) => {
                    if (err) {
                        console.error('Error closing HTTP server:', err);
                        reject(err);
                    } else {
                        console.log('✅ HTTP server closed');
                        resolve();
                    }
                });
            });
        }

        // Close WebSocket connections
        if (wss && wss.clients) {
            console.log(`Closing ${wss.clients.size} WebSocket connections...`);
            wss.clients.forEach(client => client.close());
            wss.close();
            console.log('✅ WebSocket server closed');
        }

        // Close MongoDB connection (Promise-based, no callback)
        await mongoose.connection.close();
        console.log('✅ MongoDB connection closed');

        console.log('Server shutdown complete');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
};

// Listen for shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // For nodemon

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
});

module.exports = app;