// API Service for backend communication
// API Service for backend communication
class APIService {
    constructor() {
        this.baseUrl = 'http://localhost:3001/api';
        this.isOnline = navigator.onLine;
        this.pendingCreations = new Set(); // Track pending creates to prevent dupes

        // Listen for online/offline events
        window.addEventListener('online', () => {
            this.isOnline = true;
            console.log('Back online - syncing data...');
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('Gone offline - using cached data...');
        });
    }

    async request(endpoint, options = {}) {
        if (!this.isOnline) {
            throw new Error('No internet connection');
        }

        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
        };

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`API request failed: ${options.method || 'GET'} ${endpoint}`, error);
            throw error;
        }
    }

    // Task CRUD operations
    async getAllTasks() {
        return this.request('/tasks');
    }

    async getTask(id) {
        return this.request(`/tasks/${id}`);
    }

    // CREATE with tempId tracking to prevent WebSocket duplication
    async createTask(taskData) {
        // Generate unique temporary ID
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.pendingCreations.add(tempId);

        // Add tempId to taskData for server to echo back
        const bodyData = { ...taskData, tempId };

        try {
            const newTask = await this.request('/tasks', {
                method: 'POST',
                body: JSON.stringify(bodyData),
            });

            // Clean up tracking after successful creation
            this.pendingCreations.delete(tempId);
            return newTask;
        } catch (error) {
            // Clean up tracking on error
            this.pendingCreations.delete(tempId);
            throw error;
        }
    }

    async updateTask(id, taskData) {
        return this.request(`/tasks/${id}`, {
            method: 'PUT',
            body: JSON.stringify(taskData),
        });
    }

    async deleteTask(id) {
        return this.request(`/tasks/${id}`, {
            method: 'DELETE',
        });
    }

    async healthCheck() {
        return this.request('/health');
    }
}

// WebSocket Service for real-time updates
class WebSocketService {
    constructor(onMessage) {
        this.url = 'ws://localhost:3001';
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.onMessage = onMessage;
        this.isConnected = false;

        this.connect();
    }

    connect() {
        try {
            console.log('Connecting to WebSocket...');
            this.socket = new WebSocket(this.url);

            this.socket.onopen = () => {
                console.log('WebSocket connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;

                // Send initial sync request
                this.send({ type: 'timeline:sync' });
            };

            this.socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (this.onMessage) {
                        this.onMessage(data);
                    }
                } catch (error) {
                    console.error('WebSocket message parse error:', error);
                }
            };

            this.socket.onclose = () => {
                console.log('WebSocket disconnected');
                this.isConnected = false;
                this.attemptReconnect();
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.isConnected = false;
            };

        } catch (error) {
            console.error('WebSocket connection failed:', error);
            this.attemptReconnect();
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

            setTimeout(() => {
                this.connect();
            }, this.reconnectDelay * this.reconnectAttempts);
        } else {
            console.error('Max reconnection attempts reached');
        }
    }

    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.close();
        }
    }
}

// Main Timeline Task Manager with Backend Integration
class TimelineTaskManager {
    constructor() {
        // Services
        this.apiService = new APIService();
        this.wsService = null;

        // Application state
        this.tasks = [];
        this.selectedTask = null;
        this.editingTask = null;
        this.currentTime = new Date();
        this.timelineRunning = true;
        this.zoomLevel = 1;
        this.pixelsPerHour = 120;
        this.timelineOffset = 0;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragTask = null;
        this.animationId = null;
        this.isLoading = false;

        // DOM elements
        this.elements = {
            currentTime: document.getElementById('currentTime'),
            playPauseBtn: document.getElementById('playPauseBtn'),
            playPauseText: document.getElementById('playPauseText'),
            jumpToNowBtn: document.getElementById('jumpToNowBtn'),
            zoomInBtn: document.getElementById('zoomInBtn'),
            zoomOutBtn: document.getElementById('zoomOutBtn'),
            addTaskBtn: document.getElementById('addTaskBtn'),
            taskList: document.getElementById('taskList'),
            taskSearch: document.getElementById('taskSearch'),
            statusFilter: document.getElementById('statusFilter'),
            timelineDate: document.getElementById('timelineDate'),
            zoomLevel: document.getElementById('zoomLevel'),
            taskModal: document.getElementById('taskModal'),
            modalTitle: document.getElementById('modalTitle'),
            closeModal: document.getElementById('closeModal'),
            cancelTask: document.getElementById('cancelTask'),
            saveTask: document.getElementById('saveTask'),
            deleteTask: document.getElementById('deleteTask'),
            taskForm: document.getElementById('taskForm'),
            contextMenu: document.getElementById('contextMenu'),
            loadingIndicator: document.getElementById('loadingIndicator')
        };

        this.init();
    }

    async init() {
        try {
            this.showLoading();

            // Initialize WebSocket with message handler
            this.wsService = new WebSocketService(this.handleWebSocketMessage.bind(this));

            // Initialize timeline
            await this.initTimeline();

            // Set up event listeners
            this.setupEventListeners();

            // Load tasks from backend
            await this.loadTasksFromAPI();

            // Start real-time updates and animation
            this.startRealtimeUpdates();
            this.startAnimationLoop();

            // Initial render
            this.renderTasks();
            this.renderTaskList();
            this.updateTimelineDate();
            this.updateZoomDisplay();

            this.hideLoading();
        } catch (error) {
            console.error('Failed to initialize timeline:', error);
            this.showError('Failed to initialize application');
            this.hideLoading();
        }
    }

    // WebSocket message handler with duplicate prevention
    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'task:created':
                // ✅ KEY FIX: Ignore duplicates from self using tempId
                if (data.data.tempId && this.apiService.pendingCreations.has(data.data.tempId)) {
                    console.log('⚠️ Ignoring duplicate task from WebSocket (self-created):', data.data.title);
                    this.apiService.pendingCreations.delete(data.data.tempId); // Clean up
                    return; // Skip adding to prevent duplication
                }

                console.log('✅ Adding task from WebSocket (created by others):', data.data.title);
                this.handleTaskCreated(data.data);
                break;

            case 'task:updated':
                this.handleTaskUpdated(data.data);
                break;

            case 'task:deleted':
                this.handleTaskDeleted(data.data);
                break;

            case 'time:update':
                this.handleTimeUpdate(data.data);
                break;

            case 'timeline:synced':
                console.log('Timeline synced with server');
                break;

            default:
                console.log('Unknown WebSocket message type:', data.type);
        }
    }


    handleTaskCreated(task) {
        // Add task if it doesn't exist
        const existingIndex = this.tasks.findIndex(t => t._id === task._id);
        if (existingIndex === -1) {
            this.tasks.push(this.normalizeTask(task));
            this.renderTasks();
            this.renderTaskList();
        }
    }

    handleTaskUpdated(task) {
        const index = this.tasks.findIndex(t => t._id === task._id);
        if (index !== -1) {
            this.tasks[index] = this.normalizeTask(task);
            this.renderTasks();
            this.renderTaskList();
        }
    }

    handleTaskDeleted(data) {
        const index = this.tasks.findIndex(t => t._id === data.id);
        if (index !== -1) {
            this.tasks.splice(index, 1);
            if (this.selectedTask && this.selectedTask._id === data.id) {
                this.selectedTask = null;
            }
            this.renderTasks();
            this.renderTaskList();
        }
    }

    handleTimeUpdate(data) {
        // Update current time from server
        this.currentTime = new Date(data.currentTime);
    }

    // Load tasks from API
    async loadTasksFromAPI() {
        try {
            const tasks = await this.apiService.getAllTasks();
            this.tasks = tasks.map(task => this.normalizeTask(task));
            console.log(`Loaded ${this.tasks.length} tasks from API`);
        } catch (error) {
            console.error('Failed to load tasks:', error);
            this.showError('Failed to load tasks from server');
            // Keep any existing tasks as fallback
        }
    }

    // Normalize task data from MongoDB format
    normalizeTask(task) {
        return {
            ...task,
            id: task._id || task.id, // Support both formats
            _id: task._id || task.id,
            startTime: new Date(task.startTime),
            duration: Number(task.duration),
        };
    }

    // Save task to backend
    // Save task to backend with duplicate prevention
    async saveTaskToAPI(taskData) {
        try {
            if (this.editingTask) {
                // Update existing task
                const updatedTask = await this.apiService.updateTask(this.editingTask._id, taskData);
                const index = this.tasks.findIndex(t => t._id === this.editingTask._id);
                if (index !== -1) {
                    this.tasks[index] = this.normalizeTask(updatedTask);
                }
                this.showSuccess('Task updated successfully');
                return updatedTask;
            } else {
                // Create new task (with tempId tracking)
                const newTask = await this.apiService.createTask(taskData);

                // Only add to local state if not already exists (extra safety)
                const exists = this.tasks.find(t => t._id === newTask._id);
                if (!exists) {
                    this.tasks.push(this.normalizeTask(newTask));
                    console.log('✅ Task created via API and added to local state');
                } else {
                    console.log('⚠️ Task already exists, skipping local addition');
                }

                this.showSuccess('Task created successfully');
                return newTask;
            }
        } catch (error) {
            console.error('Failed to save task:', error);
            this.showError('Failed to save task');
            throw error;
        }
    }

    // Delete task from backend
    async deleteTaskFromAPI(taskId) {
        try {
            await this.apiService.deleteTask(taskId);

            // Remove from local array
            const index = this.tasks.findIndex(t => t._id === taskId);
            if (index !== -1) {
                this.tasks.splice(index, 1);
            }

            // Clear selection
            if (this.selectedTask && this.selectedTask._id === taskId) {
                this.selectedTask = null;
            }

            this.showSuccess('Task deleted successfully');
            return true;
        } catch (error) {
            console.error('Failed to delete task:', error);
            this.showError('Failed to delete task');
            throw error;
        }
    }

    // UI Methods
    showLoading() {
        this.isLoading = true;
        if (this.elements.loadingIndicator) {
            this.elements.loadingIndicator.classList.remove('hidden');
        }
    }

    hideLoading() {
        this.isLoading = false;
        if (this.elements.loadingIndicator) {
            this.elements.loadingIndicator.classList.add('hidden');
        }
    }

    showError(message) {
        // Create a simple toast notification
        const toast = document.createElement('div');
        toast.className = 'toast toast--error';
        toast.textContent = message;
        toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--color-error);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 5000);
    }

    showSuccess(message) {
        const toast = document.createElement('div');
        toast.className = 'toast toast--success';
        toast.textContent = message;
        toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--color-success);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    // Modified save task method
    async saveTask() {
        if (this.isLoading) return;

        const taskData = {
            title: document.getElementById('taskTitle').value.trim(),
            startTime: new Date(document.getElementById('taskStartTime').value),
            duration: parseInt(document.getElementById('taskDuration').value),
            color: document.getElementById('taskColor').value,
            status: document.getElementById('taskStatus').value
        };

        // Validation
        if (!taskData.title) {
            this.showError('Please enter a task title');
            document.getElementById('taskTitle').focus();
            return;
        }

        if (isNaN(taskData.startTime.getTime())) {
            this.showError('Please enter a valid start time');
            document.getElementById('taskStartTime').focus();
            return;
        }

        if (isNaN(taskData.duration) || taskData.duration < 15) {
            this.showError('Task duration must be at least 15 minutes');
            document.getElementById('taskDuration').focus();
            return;
        }

        try {
            this.showLoading();
            await this.saveTaskToAPI(taskData);
            this.renderTasks();
            this.renderTaskList();
            this.closeTaskModal();
        } catch (error) {
            // Error already shown in saveTaskToAPI
        } finally {
            this.hideLoading();
        }
    }

    // Modified delete task method
    async deleteTask() {
        if (!this.editingTask || this.isLoading) return;

        const confirmed = confirm(`Are you sure you want to delete "${this.editingTask.title}"?`);
        if (!confirmed) return;

        try {
            this.showLoading();
            await this.deleteTaskFromAPI(this.editingTask._id);
            this.renderTasks();
            this.renderTaskList();
            this.closeTaskModal();
        } catch (error) {
            // Error already shown in deleteTaskFromAPI
        } finally {
            this.hideLoading();
        }
    }

    // All the existing timeline and UI methods remain the same...
    // [Include all the timeline rendering, drag/drop, modal handling, etc. from the original code]

    async initTimeline() {
        const container = document.getElementById('timelineCanvas');

        // Create HTML/CSS timeline
        this.timelineContainer = document.createElement('div');
        this.timelineContainer.className = 'timeline-fallback';
        this.timelineContainer.innerHTML = `
        <div class="timeline-ruler" id="timelineRuler"></div>
        <div class="timeline-content" id="timelineContent"></div>
        `;

        container.appendChild(this.timelineContainer);

        // Handle resize
        window.addEventListener('resize', () => {
            this.renderTimeline();
        });

        // Initial timeline render
        this.renderTimeline();
    }

    startAnimationLoop() {
        const animate = () => {
            if (this.timelineRunning) {
                // Auto-scroll timeline to keep current time centered
                const timeSinceStart = Date.now() - this.currentTime.getTime();
                if (Math.abs(timeSinceStart) > 60000) { // If more than 1 minute difference
                    this.timelineOffset -= timeSinceStart * 0.1; // Smooth auto-scroll
                }

                this.renderTimeline();
            }
            this.animationId = requestAnimationFrame(animate);
        };
        this.animationId = requestAnimationFrame(animate);
    }

    renderTimeline() {
        const ruler = document.getElementById('timelineRuler');
        const content = document.getElementById('timelineContent');

        if (!ruler || !content) return;

        // Clear existing content
        ruler.innerHTML = '';

        // Draw ruler
        this.drawRuler(ruler);

        // Draw current time indicator
        this.drawCurrentTimeIndicator(content);

        // Render tasks
        this.renderTasks();
    }

    drawRuler(ruler) {
        const containerWidth = ruler.clientWidth;
        const pixelsPerHour = this.pixelsPerHour * this.zoomLevel;

        // Calculate time range to display
        const centerTime = this.currentTime.getTime() + this.timelineOffset;
        const startTime = centerTime - (containerWidth / 2 / pixelsPerHour * 3600000);
        const endTime = centerTime + (containerWidth / 2 / pixelsPerHour * 3600000);

        // Generate hour markers
        const startHour = Math.floor(new Date(startTime).getHours());
        const endHour = Math.ceil(new Date(endTime).getHours()) + 24;

        for (let hour = startHour; hour <= endHour; hour++) {
            const hourTime = new Date(new Date(startTime).toDateString());
            hourTime.setHours(hour % 24);

            const x = this.timeToX(hourTime.getTime(), containerWidth);

            if (x >= -50 && x <= containerWidth + 50) {
                const marker = document.createElement('div');
                marker.className = 'time-marker hour';
                marker.style.left = `${x}px`;
                marker.textContent = `${(hour % 24).toString().padStart(2, '0')}:00`;
                ruler.appendChild(marker);

                // Add 15-minute intervals
                for (let minute = 15; minute < 60; minute += 15) {
                    const minuteTime = new Date(hourTime);
                    minuteTime.setMinutes(minute);
                    const minuteX = this.timeToX(minuteTime.getTime(), containerWidth);

                    if (minuteX >= -10 && minuteX <= containerWidth + 10) {
                        const minuteMarker = document.createElement('div');
                        minuteMarker.className = 'time-marker';
                        minuteMarker.style.left = `${minuteX}px`;
                        ruler.appendChild(minuteMarker);
                    }
                }
            }
        }
    }

    drawCurrentTimeIndicator(content) {
        // Remove existing indicator
        const existing = content.querySelector('.current-time-line');
        if (existing) {
            existing.remove();
        }

        const containerWidth = content.clientWidth;
        const x = this.timeToX(this.currentTime.getTime(), containerWidth);

        const indicator = document.createElement('div');
        indicator.className = 'current-time-line';
        indicator.style.left = `${x}px`;
        content.appendChild(indicator);
    }

    timeToX(timestamp, containerWidth) {
        const centerTime = this.currentTime.getTime() + this.timelineOffset;
        const timeDiff = timestamp - centerTime;
        const pixelsPerHour = this.pixelsPerHour * this.zoomLevel;
        return containerWidth / 2 + (timeDiff / 3600000) * pixelsPerHour;
    }

    xToTime(x, containerWidth) {
        const centerTime = this.currentTime.getTime() + this.timelineOffset;
        const pixelsPerHour = this.pixelsPerHour * this.zoomLevel;
        const timeDiff = (x - containerWidth / 2) / pixelsPerHour * 3600000;
        return centerTime + timeDiff;
    }

    renderTasks() {
        const content = document.getElementById('timelineContent');
        if (!content) return;

        // Remove existing task elements
        const existingTasks = content.querySelectorAll('.timeline-task');
        existingTasks.forEach(task => task.remove());

        const containerWidth = content.clientWidth;

        this.tasks.forEach((task, index) => {
            this.renderTask(task, content, containerWidth, index);
        });
    }

    renderTask(task, content, containerWidth, index) {
        const startX = this.timeToX(task.startTime.getTime(), containerWidth);
        const width = Math.max((task.duration / 60) * this.pixelsPerHour * this.zoomLevel, 100);
        const height = 40;
        const y = 100 + (index % 6) * 50; // Stack tasks vertically

        // Skip if task is completely off screen
        if (startX + width < -100 || startX > containerWidth + 100) {
            return;
        }

        const taskElement = document.createElement('div');
        taskElement.className = 'timeline-task';
        if (task.status === 'completed') taskElement.classList.add('status--completed');
        if (task.status === 'in-progress') taskElement.classList.add('status--in-progress');
        if (this.selectedTask && this.selectedTask._id === task._id) {
            taskElement.classList.add('selected');
        }

        taskElement.style.left = `${Math.max(0, startX)}px`;
        taskElement.style.top = `${y}px`;
        taskElement.style.width = `${width}px`;
        taskElement.style.height = `${height}px`;
        taskElement.style.backgroundColor = task.color;

        taskElement.innerHTML = `
        <div style="font-weight: 500; font-size: 11px; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis;">${task.title}</div>
        <div style="font-size: 9px; opacity: 0.8;">${task.duration}min</div>
        `;

        // Store task reference
        taskElement._task = task;

        // Event handlers
        taskElement.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectedTask = task;
            this.renderTasks(); // Re-render to show selection
        });

        taskElement.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.openTaskModal(task);
        });

        taskElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showContextMenu(e, task);
        });

        // Drag functionality would need to call API on completion
        taskElement.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left mouse button only
                this.onTaskMouseDown(e, task);
            }
        });

        content.appendChild(taskElement);
    }

    // Event listeners, modal handling, and other UI methods remain the same...
    setupEventListeners() {
        // Header controls
        this.elements.playPauseBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleTimeline();
        });

        this.elements.jumpToNowBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            this.jumpToCurrentTime();
        });

        this.elements.zoomInBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            this.zoomIn();
        });

        this.elements.zoomOutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            this.zoomOut();
        });

        this.elements.addTaskBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            this.openTaskModal();
        });

        // Search and filter
        this.elements.taskSearch?.addEventListener('input', (e) => {
            this.renderTaskList();
        });

        this.elements.statusFilter?.addEventListener('change', (e) => {
            this.renderTaskList();
        });

        // Modal handlers
        this.elements.closeModal?.addEventListener('click', (e) => {
            e.preventDefault();
            this.closeTaskModal();
        });

        this.elements.cancelTask?.addEventListener('click', (e) => {
            e.preventDefault();
            this.closeTaskModal();
        });

        this.elements.taskForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveTask();
        });

        this.elements.deleteTask?.addEventListener('click', (e) => {
            e.preventDefault();
            this.deleteTask();
        });

        // Color presets
        document.querySelectorAll('.color-preset').forEach(preset => {
            preset.addEventListener('click', (e) => {
                e.preventDefault();
                const color = preset.dataset.color;
                const colorInput = document.getElementById('taskColor');
                if (colorInput) {
                    colorInput.value = color;
                }

                document.querySelectorAll('.color-preset').forEach(p => p.classList.remove('active'));
                preset.classList.add('active');
            });
        });

        // Context menu
        document.addEventListener('click', (e) => {
            this.hideContextMenu();
        });

        document.getElementById('editTaskContext')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.selectedTask) {
                this.openTaskModal(this.selectedTask);
            }
            this.hideContextMenu();
        });

        document.getElementById('deleteTaskContext')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.selectedTask) {
                this.editingTask = this.selectedTask;
                this.deleteTask();
            }
            this.hideContextMenu();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.target.matches('input, textarea, select')) {
                e.preventDefault();
                this.toggleTimeline();
            } else if (e.key === 'Escape') {
                this.closeTaskModal();
                this.hideContextMenu();
            }
        });

        // Click outside modal to close
        this.elements.taskModal?.addEventListener('click', (e) => {
            if (e.target === this.elements.taskModal || e.target.classList.contains('modal__backdrop')) {
                this.closeTaskModal();
            }
        });
    }

    // Add the remaining methods for timeline functionality...
    startRealtimeUpdates() {
        // Update current time every second
        setInterval(() => {
            this.currentTime = new Date();
            this.updateCurrentTimeDisplay();
        }, 1000);

        // Initial time display
        this.updateCurrentTimeDisplay();
    }

    updateCurrentTimeDisplay() {
        if (this.elements.currentTime) {
            const timeString = this.currentTime.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            this.elements.currentTime.textContent = timeString;
        }
    }

    updateTimelineDate() {
        if (this.elements.timelineDate) {
            const dateString = this.currentTime.toLocaleDateString('en-GB', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            this.elements.timelineDate.textContent = dateString;
        }
    }

    updateZoomDisplay() {
        if (this.elements.zoomLevel) {
            this.elements.zoomLevel.textContent = `${this.zoomLevel.toFixed(1)}x`;
        }
    }

    toggleTimeline() {
        this.timelineRunning = !this.timelineRunning;
        if (this.elements.playPauseText) {
            this.elements.playPauseText.textContent = this.timelineRunning ? '⏸️ Pause' : '▶️ Play';
        }

        if (!this.timelineRunning && this.animationId) {
            cancelAnimationFrame(this.animationId);
        } else if (this.timelineRunning) {
            this.startAnimationLoop();
        }
    }

    jumpToCurrentTime() {
        this.timelineOffset = 0;
        this.renderTimeline();
    }

    zoomIn() {
        this.zoomLevel = Math.min(this.zoomLevel * 1.5, 5);
        this.updateZoomDisplay();
        this.renderTimeline();
    }

    zoomOut() {
        this.zoomLevel = Math.max(this.zoomLevel / 1.5, 0.2);
        this.updateZoomDisplay();
        this.renderTimeline();
    }

    renderTaskList() {
        const searchTerm = this.elements.taskSearch?.value.toLowerCase().trim() || '';
        const statusFilter = this.elements.statusFilter?.value || 'all';

        let filteredTasks = this.tasks.filter(task => {
            const matchesSearch = !searchTerm || task.title.toLowerCase().includes(searchTerm);
            const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
            return matchesSearch && matchesStatus;
        });

        // Sort by start time
        filteredTasks.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

        if (this.elements.taskList) {
            this.elements.taskList.innerHTML = '';

            if (filteredTasks.length === 0) {
                const emptyMessage = document.createElement('div');
                emptyMessage.style.cssText = 'text-align: center; padding: 20px; color: var(--color-text-secondary); font-style: italic;';
                emptyMessage.textContent = searchTerm ? 'No tasks found matching your search.' : 'No tasks found.';
                this.elements.taskList.appendChild(emptyMessage);
                return;
            }

            filteredTasks.forEach(task => {
                const taskElement = this.createTaskListItem(task);
                this.elements.taskList.appendChild(taskElement);
            });
        }
    }

    createTaskListItem(task) {
        const div = document.createElement('div');
        div.className = 'task-item';
        div.style.setProperty('--task-color', task.color);

        const startTime = task.startTime.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const endTime = new Date(task.startTime.getTime() + task.duration * 60000).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit'
        });

        div.innerHTML = `
        <div class="task-item__header">
        <h4 class="task-item__title">${task.title}</h4>
        <span class="task-item__time">${startTime} - ${endTime}</span>
        </div>
        <div class="task-item__duration">${task.duration} minutes</div>
        <div class="status status--${task.status}">${task.status.replace('-', ' ').toUpperCase()}</div>
        `;

        div.addEventListener('click', () => {
            this.selectedTask = task;
            this.openTaskModal(task);
        });

        return div;
    }

    openTaskModal(task = null) {
        this.editingTask = task;
        const isEditing = task !== null;

        if (this.elements.modalTitle) {
            this.elements.modalTitle.textContent = isEditing ? 'Edit Task' : 'Add New Task';
        }

        if (this.elements.deleteTask) {
            this.elements.deleteTask.style.display = isEditing ? 'block' : 'none';
        }

        if (isEditing) {
            document.getElementById('taskTitle').value = task.title;
            document.getElementById('taskStartTime').value = this.formatDateTimeLocal(task.startTime);
            document.getElementById('taskDuration').value = task.duration;
            document.getElementById('taskColor').value = task.color;
            document.getElementById('taskStatus').value = task.status;
        } else {
            document.getElementById('taskForm')?.reset();
            const now = new Date();
            document.getElementById('taskStartTime').value = this.formatDateTimeLocal(now);
            document.getElementById('taskColor').value = '#3B82F6';
            document.getElementById('taskDuration').value = '60';
            document.getElementById('taskStatus').value = 'pending';
        }

        // Update color presets
        document.querySelectorAll('.color-preset').forEach(preset => {
            preset.classList.remove('active');
            if (preset.dataset.color === document.getElementById('taskColor')?.value) {
                preset.classList.add('active');
            }
        });

        if (this.elements.taskModal) {
            this.elements.taskModal.classList.remove('hidden');
            setTimeout(() => {
                document.getElementById('taskTitle')?.focus();
            }, 100);
        }
    }

    closeTaskModal() {
        if (this.elements.taskModal) {
            this.elements.taskModal.classList.add('hidden');
        }
        this.editingTask = null;
    }

    showContextMenu(event, task) {
        event.preventDefault();
        this.selectedTask = task;
        if (this.elements.contextMenu) {
            const menu = this.elements.contextMenu;

            menu.style.left = `${event.pageX}px`;
            menu.style.top = `${event.pageY}px`;
            menu.classList.remove('hidden');

            // Adjust position if menu goes off screen
            setTimeout(() => {
                const rect = menu.getBoundingClientRect();
                if (rect.right > window.innerWidth) {
                    menu.style.left = `${event.pageX - rect.width}px`;
                }
                if (rect.bottom > window.innerHeight) {
                    menu.style.top = `${event.pageY - rect.height}px`;
                }
            }, 0);
        }
    }

    hideContextMenu() {
        if (this.elements.contextMenu) {
            this.elements.contextMenu.classList.add('hidden');
        }
    }

    formatDateTimeLocal(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');

        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    // Drag functionality placeholder - would need API integration for persistence
    onTaskMouseDown(event, task) {
        this.selectedTask = task;
        this.isDragging = true;
        this.dragTask = task;
        this.dragStartX = event.clientX;

        event.preventDefault();
        event.stopPropagation();

        const boundMouseMove = this.onMouseMove.bind(this);
        const boundMouseUp = this.onMouseUp.bind(this);

        document.addEventListener('mousemove', boundMouseMove);
        document.addEventListener('mouseup', boundMouseUp);

        this._boundMouseMove = boundMouseMove;
        this._boundMouseUp = boundMouseUp;

        this.renderTasks();
    }

    onMouseMove(event) {
        if (!this.isDragging || !this.dragTask) return;

        const deltaX = event.clientX - this.dragStartX;
        const pixelsPerHour = this.pixelsPerHour * this.zoomLevel;
        const timeDelta = (deltaX / pixelsPerHour) * 3600000;

        // Update task start time
        const newStartTime = new Date(this.dragTask.startTime.getTime() + timeDelta);
        this.dragTask.startTime = newStartTime;

        this.dragStartX = event.clientX;
        this.renderTasks();
        this.renderTaskList();
    }

    async onMouseUp() {
        if (this.isDragging && this.dragTask) {
            this.isDragging = false;

            // Save the updated task to backend
            try {
                await this.apiService.updateTask(this.dragTask._id, {
                    title: this.dragTask.title,
                    startTime: this.dragTask.startTime,
                    duration: this.dragTask.duration,
                    color: this.dragTask.color,
                    status: this.dragTask.status
                });
                this.showSuccess('Task time updated');
            } catch (error) {
                console.error('Failed to update task time:', error);
                this.showError('Failed to save time change');
                // Could implement rollback here
            }

            this.dragTask = null;

            // Clean up event listeners
            if (this._boundMouseMove) {
                document.removeEventListener('mousemove', this._boundMouseMove);
                this._boundMouseMove = null;
            }
            if (this._boundMouseUp) {
                document.removeEventListener('mouseup', this._boundMouseUp);
                this._boundMouseUp = null;
            }
        }
    }
}

// Add CSS for toast notifications
const style = document.createElement('style');
style.textContent = `
@keyframes slideIn {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

.toast {
    box-shadow: var(--shadow-lg);
    font-weight: 500;
    font-size: 14px;
    max-width: 300px;
    word-wrap: break-word;
}
`;
document.head.appendChild(style);

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TimelineTaskManager();
});