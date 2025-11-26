import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Подключение к MongoDB (бесплатный кластер)
const MONGODB_URI = 'mongodb+srv://username:password@cluster.mongodb.net/meetapp?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI || 'mongodb://localhost:27017/meetapp')
  .then(() => console.log('✅ MongoDB подключена'))
  .catch(err => console.log('❌ Ошибка MongoDB:', err));

// Модели данных
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
      timestamp: { type: Date, default: Date.now },
      replies: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        content: String,
        timestamp: Date
      }]
    }]
  }],
  customEmojis: [{ name: String, url: String }],
  stickers: [{ name: String, url: String }]
});

const User = mongoose.model('User', userSchema);
const Server = mongoose.model('Server', serverSchema);

// Хранилище активных пользователей и звонков
const activeUsers = new Map();
const activeCalls = new Map();

// Socket.io события
io.on('connection', (socket) => {
  console.log('🔗 Пользователь подключен:', socket.id);

  // Авторизация
  socket.on('user_join', async (userData) => {
    activeUsers.set(socket.id, userData);
    socket.broadcast.emit('user_online', userData);
  });

  // Сообщения
  socket.on('send_message', async (data) => {
    const { serverId, channelId, content, attachments } = data;
    
    // Сохраняем сообщение в БД
    const message = {
      user: data.userId,
      content,
      attachments,
      timestamp: new Date()
    };

    await Server.findByIdAndUpdate(serverId, {
      $push: { 
        [`channels.${channelId}.messages`]: message 
      }
    });

    // Отправляем всем участникам
    socket.to(serverId).emit('new_message', {
      channelId,
      message: { ...message, user: data.user }
    });
  });

  // Голосовые звонки WebRTC
  socket.on('call_user', (data) => {
    socket.to(data.userToCall).emit('call_made', {
      offer: data.offer,
      socket: socket.id
    });
  });

  socket.on('answer_call', (data) => {
    socket.to(data.to).emit('call_answered', {
      answer: data.answer
    });
  });

  socket.on('ice_candidate', (data) => {
    socket.to(data.target).emit('ice_candidate', {
      candidate: data.candidate
    });
  });

  // Кастомные эмодзи
  socket.on('add_custom_emoji', async (data) => {
    const { serverId, name, url } = data;
    await Server.findByIdAndUpdate(serverId, {
      $push: { customEmojis: { name, url } }
    });
    socket.to(serverId).emit('emoji_added', { name, url });
  });

  // Отключение
  socket.on('disconnect', () => {
    const userData = activeUsers.get(socket.id);
    if (userData) {
      socket.broadcast.emit('user_offline', userData);
      activeUsers.delete(socket.id);
    }
    console.log('❌ Пользователь отключен:', socket.id);
  });
});

// REST API маршруты
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const user = new User({ username, email, password });
    await user.save();
    res.status(201).json({ message: 'Пользователь создан', user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/servers', async (req, res) => {
  const servers = await Server.find().populate('owner members');
  res.json(servers);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`🔗 http://localhost:${PORT}`);
});
