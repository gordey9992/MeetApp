class DiscordApp {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.currentServer = null;
        this.currentChannel = null;
        this.currentVoiceChannel = null;
        this.peerConnections = new Map();
        this.localStream = null;
        
        this.initializeApp();
    }

    async initializeApp() {
        await this.checkAuth();
        this.connectSocket();
        this.setupEventListeners();
    }

    async checkAuth() {
        const token = localStorage.getItem('discord_token');
        if (!token) {
            window.location.href = '/auth.html';
            return;
        }
        
        // Проверяем токен
        try {
            const response = await fetch('/api/verify', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Invalid token');
            }
        } catch (error) {
            localStorage.removeItem('discord_token');
            window.location.href = '/auth.html';
        }
    }

    connectSocket() {
        const token = localStorage.getItem('discord_token');
        this.socket = io();
        
        this.socket.emit('authenticate', token);
        
        this.socket.on('authenticated', (data) => {
            this.currentUser = data.user;
            this.currentServer = data.mainServer;
            this.updateUI();
        });

        this.socket.on('auth-error', () => {
            localStorage.removeItem('discord_token');
            window.location.href = '/auth.html';
        });

        // Сообщения
        this.socket.on('new-message', (message) => {
            this.displayMessage(message);
        });

        this.socket.on('channel-history', (messages) => {
            this.displayMessageHistory(messages);
        });

        // Голосовые каналы
        this.socket.on('user-joined-voice', (user) => {
            this.addVoiceParticipant(user);
        });

        this.socket.on('user-left-voice', (socketId) => {
            this.removeVoiceParticipant(socketId);
        });

        this.socket.on('voice-users', (users) => {
            this.updateVoiceParticipants(users);
        });

        // WebRTC signaling
        this.socket.on('voice-offer', this.handleVoiceOffer.bind(this));
        this.socket.on('voice-answer', this.handleVoiceAnswer.bind(this));
        this.socket.on('voice-ice-candidate', this.handleVoiceIceCandidate.bind(this));
    }

    setupEventListeners() {
        // Навигация по каналам
        document.querySelectorAll('.text-channel').forEach(channel => {
            channel.addEventListener('click', () => {
                this.joinTextChannel(channel.dataset.channel);
            });
        });

        document.querySelectorAll('.voice-channel').forEach(channel => {
            channel.addEventListener('click', () => {
                this.joinVoiceChannel(channel.dataset.channel);
            });
        });

        // Отправка сообщений
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // Голосовое управление
        document.getElementById('leaveVoiceBtn').addEventListener('click', () => {
            this.leaveVoiceChannel();
        });

        document.getElementById('voiceMicToggle').addEventListener('click', () => {
            this.toggleMicrophone();
        });

        // Создание сервера
        document.querySelector('[data-server="new"]').addEventListener('click', () => {
            this.showCreateServerModal();
        });

        document.getElementById('confirmCreateServer').addEventListener('click', () => {
            this.createServer();
        });

        document.getElementById('cancelCreateServer').addEventListener('click', () => {
            this.hideCreateServerModal();
        });
    }

    updateUI() {
        document.getElementById('currentUsername').textContent = this.currentUser.username;
        
        // Обновляем аватар пользователя
        const userAvatar = document.querySelector('.user-avatar');
        if (userAvatar) {
            userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(this.currentUser.username)}&background=random`;
        }
    }

    joinTextChannel(channelName) {
        // Обновляем активный канал
        document.querySelectorAll('.channel-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-channel="${channelName}"]`).classList.add('active');

        // Обновляем заголовок
        document.querySelector('.channel-title').textContent = channelName;
        document.getElementById('messageInput').placeholder = `Написать сообщение в #${channelName}`;

        // Присоединяемся к каналу на сервере
        const channel = this.findChannelByName(channelName);
        if (channel) {
            this.socket.emit('join-channel', channel.id);
            this.currentChannel = channel;
        }

        // Очищаем сообщения
        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.innerHTML = '<div class="welcome-message"><h2>Добро пожаловать в #общий-чат!</h2><p>Это начало этого канала.</p></div>';
    }

    joinVoiceChannel(channelName) {
        if (this.currentVoiceChannel) {
            this.leaveVoiceChannel();
        }

        this.socket.emit('join-voice', channelName);
        this.currentVoiceChannel = channelName;

        // Показываем интерфейс голосового чата
        document.getElementById('voiceInterface').style.display = 'block';
        document.getElementById('currentVoiceChannel').textContent = channelName;

        // Инициализируем WebRTC
        this.initializeVoiceChat();
    }

    async initializeVoiceChat() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            });
            
            console.log('Голосовой чат инициализирован');
        } catch (error) {
            console.error('Ошибка доступа к микрофону:', error);
            alert('Не удалось получить доступ к микрофону');
        }
    }

    leaveVoiceChannel() {
        if (this.currentVoiceChannel) {
            this.socket.emit('leave-voice');
            
            // Останавливаем медиа потоки
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null
