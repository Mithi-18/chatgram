const express = require('express');
const cors = require('cors');
const path = require('path');
const { setupDatabase, getDb } = require('./database');
const { createServer } = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');

const app = express();
const server = createServer(app);

// Allow frontend, which might be running on a different port locally
const io = new Server(server, {
    maxHttpBufferSize: 1e8, // 100 MB limit for large files/messages
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Prefixing routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);

// Serve React Frontend
const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendPath));
app.get('*', (req, res, next) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/socket.io')) return next();
    res.sendFile(path.join(frontendPath, 'index.html'));
});

const activeUsers = {};

// Socket.IO for real-time messaging and WebRTC signaling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Join a personal room to receive private messages and calls
    socket.on('join', (userId) => {
        socket.join(userId);
        socket.userId = userId;
        activeUsers[userId] = (activeUsers[userId] || 0) + 1;
        console.log(`User ${userId} joined room ${userId}`);
        io.emit('online_users', Object.keys(activeUsers));
    });

    // Handle new text/image/video messages
    socket.on('send_message', async (data) => {
        try {
            const db = await getDb();
            const { sender_id, receiver_id, content, type, file_url } = data;
            
            const result = await db.run(
                `INSERT INTO messages (sender_id, receiver_id, type, content, file_url) VALUES (?, ?, ?, ?, ?)`,
                [sender_id, receiver_id, type || 'text', content || '', file_url || null]
            );

            const insertedMessage = {
                id: result.lastID,
                sender_id,
                receiver_id,
                type,
                content,
                file_url,
                created_at: new Date().toISOString()
            };

            // Emit to both sender and receiver
            io.to(sender_id.toString()).emit('receive_message', insertedMessage);
            io.to(receiver_id.toString()).emit('receive_message', insertedMessage);
            
        } catch (error) {
            console.error('Error saving message:', error);
        }
    });

    // Typing indicators
    socket.on('typing', (data) => {
        io.to(data.receiver_id.toString()).emit('user_typing', { sender_id: data.sender_id });
    });

    socket.on('stop_typing', (data) => {
        io.to(data.receiver_id.toString()).emit('user_stop_typing', { sender_id: data.sender_id });
    });

    // WebRTC Signaling
    socket.on('call_user', (data) => {
        // data should have: userToCall, signalData, from, name, callType
        console.log(`Calling user ${data.userToCall} from ${data.from}`);
        io.to(data.userToCall.toString()).emit('incoming_call', {
            signal: data.signalData,
            from: data.from,
            name: data.name,
            callType: data.callType
        });
    });

    socket.on('answer_call', (data) => {
        io.to(data.to.toString()).emit('call_accepted', data.signal);
    });

    socket.on('webrtc_ice_candidate', (data) => {
        io.to(data.to.toString()).emit('webrtc_ice_candidate', data);
    });

    socket.on('disconnect_call', (data) => {
        io.to(data.to.toString()).emit('call_ended');
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (socket.userId && activeUsers[socket.userId]) {
            activeUsers[socket.userId]--;
            if (activeUsers[socket.userId] <= 0) {
                delete activeUsers[socket.userId];
            }
            io.emit('online_users', Object.keys(activeUsers));
        }
    });
});

const PORT = process.env.PORT || 5000;

setupDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}).catch(err => {
    console.error("Failed to start database:", err);
});
