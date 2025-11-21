const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// In-memory storage (в реальном приложении используйте базу данных)
const users = new Map();
const rooms = new Map();
const servers = new Map();
const messages = new Map();

// JWT secret
const JWT_SECRET = 'your-secret-key';

// Создаем тестовые данные
const initializeTestData = () => {
  // Тестовый сервер
  const serverId = uuidv4();
  servers.set(serverId, {
    id: serverId,
    name: 'MeetApp RU Community',
    owner: 'system',
    channels: [
      { id: uuidv4(), name: 'общий-чат', type: 'text' },
      { id: uuidv4(), name: 'игры', type: 'text' },
      { id: uuidv4(), name: 'общий-голосовой', type: 'voice' },
      { id: uuidv4(), name: 'музыка', type: 'voice' }
    ],
    members: new Set()
  });

  // Тестовые комнаты для голосовых каналов
  rooms.set('общий-голосовой', new Map());
  rooms.set('музыка', new Map());
};

initializeTestData();

// Auth routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (users.has(email)) {
      return res.status(400).json({ error: 'Пользователь уже существует' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    
    users.set(email, {
      id: userId,
      username,
      email,
      password: hashedPassword,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random`
    });

    const token = jwt.sign({ userId, email }, JWT_SECRET);
    res.json({ token, user: { id: userId, username, email } });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = users.get(email);
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Неверные учетные данные' });
    }

    const token = jwt.sign({ userId: user.id, email }, JWT_SECRET);
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email,
        avatar: user.avatar
      } 
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('authenticate', (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userEmail = decoded.email;
      socket.username = users.get(decoded.email)?.username;
      
      // Добавляем пользователя в основной сервер
      const mainServer = Array.from(servers.values())[0];
      mainServer.members.add(socket.userId);
      
      socket.emit('authenticated', {
        user: {
          id: socket.userId,
          username: socket.username,
          email: socket.userEmail
        },
        servers: Array.from(servers.values()),
        mainServer
      });
      
      console.log(`User authenticated: ${socket.username}`);
    } catch (error) {
      socket.emit('auth-error', 'Invalid token');
    }
  });

  // Server management
  socket.on('create-server', (serverName) => {
    const serverId = uuidv4();
    const newServer = {
      id: serverId,
      name: serverName,
      owner: socket.userId,
      channels: [
        { id: uuidv4(), name: 'общий-чат', type: 'text' },
        { id: uuidv4(), name: 'голосовой-канал', type: 'voice' }
      ],
      members: new Set([socket.userId])
    };
    
    servers.set(serverId, newServer);
    socket.emit('server-created', newServer);
  });

  // Channel management
  socket.on('create-channel', (serverId, channelName, channelType) => {
    const server = servers.get(serverId);
    if (server && server.owner === socket.userId) {
      const channel = {
        id: uuidv4(),
        name: channelName,
        type: channelType
      };
      server.channels.push(channel);
      
      if (channelType === 'voice') {
        rooms.set(channelName, new Map());
      }
      
      io.emit('channel-created', serverId, channel);
    }
  });

  // Voice channels
  socket.on('join-voice', (channelName) => {
    if (!rooms.has(channelName)) {
      rooms.set(channelName, new Map());
    }
    
    const room = rooms.get(channelName);
    room.set(socket.id, {
      userId: socket.userId,
      username: socket.username,
      socketId: socket.id
    });

    socket.join(channelName);
    socket.currentVoiceChannel = channelName;

    // Уведомляем других участников
    socket.to(channelName).emit('user-joined-voice', {
      userId: socket.userId,
      username: socket.username,
      socketId: socket.id
    });

    // Отправляем текущих участников новому пользователю
    const usersInRoom = Array.from(room.values());
    socket.emit('voice-users', usersInRoom);

    console.log(`User ${socket.username} joined voice channel ${channelName}`);
  });

  socket.on('leave-voice', () => {
    if (socket.currentVoiceChannel) {
      const room = rooms.get(socket.currentVoiceChannel);
      if (room) {
        room.delete(socket.id);
        socket.to(socket.currentVoiceChannel).emit('user-left-voice', socket.id);
      }
      socket.leave(socket.currentVoiceChannel);
      socket.currentVoiceChannel = null;
    }
  });

  // WebRTC signaling for voice
  socket.on('voice-offer', (data) => {
    socket.to(data.target).emit('voice-offer', {
      offer: data.offer,
      sender: socket.id
    });
  });

  socket.on('voice-answer', (data) => {
    socket.to(data.target).emit('voice-answer', {
      answer: data.answer,
      sender: socket.id
    });
  });

  socket.on('voice-ice-candidate', (data) => {
    socket.to(data.target).emit('voice-ice-candidate', {
      candidate: data.candidate,
      sender: socket.id
    });
  });

  // Text messages
  socket.on('send-message', (data) => {
    const message = {
      id: uuidv4(),
      userId: socket.userId,
      username: socket.username,
      content: data.content,
      channelId: data.channelId,
      timestamp: new Date().toISOString(),
      avatar: users.get(socket.userEmail)?.avatar
    };

    if (!messages.has(data.channelId)) {
      messages.set(data.channelId, []);
    }
    messages.get(data.channelId).push(message);

    io.to(data.channelId).emit('new-message', message);
  });

  socket.on('join-channel', (channelId) => {
    socket.channelId = channelId;
    socket.join(channelId);
    
    // Отправляем историю сообщений
    const channelMessages = messages.get(channelId) || [];
    socket.emit('channel-history', channelMessages);
  });

  // Screen sharing
  socket.on('start-screen-share', (channelName) => {
    socket.to(channelName).emit('user-started-screen-share', socket.id);
  });

  socket.on('stop-screen-share', (channelName) => {
    socket.to(channelName).emit('user-stopped-screen-share', socket.id);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.username);
    
    // Покидаем голосовой канал
    if (socket.currentVoiceChannel) {
      const room = rooms.get(socket.currentVoiceChannel);
      if (room) {
        room.delete(socket.id);
        socket.to(socket.currentVoiceChannel).emit('user-left-voice', socket.id);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Discord-like server running on port ${PORT}`);
});
