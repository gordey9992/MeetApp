const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);

// CORS для Vercel
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://your-app.vercel.app",
      "https://*.vercel.app"
    ],
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from client dist
app.use(express.static(path.join(__dirname, '../client/dist')));

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/meetapp';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB подключена'))
  .catch(err => console.log('❌ Ошибка MongoDB:', err));

// Модели (остаются без изменений)
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatar: { type: String, default: '' },
  status: { type: String, default: 'online' },
  customEmojis: [{ name: String, url: String }],
  bio: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const serverSchema = new mongoose.Schema({
  name: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  channels: [{
    name: String,
    type: { type: String, enum: ['text', 'voice'], default: 'text' },
    messages: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      content: String,
      attachments: [String],
      emojis: [String],
      timestamp: { type: Date, default: Date.now }
    }]
  }],
  customEmojis: [{ name: String, url: String }]
});

const User = mongoose.model('User', userSchema);
const Server = mongoose.model('Server', serverSchema);

// Socket.io логика (без изменений)
const activeUsers = new Map();

io.on('connection', (socket) => {
  console.log('🔗 Пользователь подключен:', socket.id);

  socket.on('user_join', async (userData) => {
    activeUsers.set(socket.id, userData);
    socket.broadcast.emit('user_online', userData);
  });

  socket.on('send_message', async (data) => {
    socket.to(data.serverId).emit('new_message', {
      channelId: data.channelId,
      message: { 
        user: data.user,
        content: data.content,
        timestamp: new Date()
      }
    });
  });

  socket.on('disconnect', () => {
    const userData = activeUsers.get(socket.id);
    if (userData) {
      socket.broadcast.emit('user_offline', userData);
      activeUsers.delete(socket.id);
    }
    console.log('❌ Пользователь отключен:', socket.id);
  });
});

// API Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    // Логика регистрации
    res.status(201).json({ message: 'Пользователь создан' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/servers', async (req, res) => {
  const servers = await Server.find().populate('owner members');
  res.json(servers);
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
