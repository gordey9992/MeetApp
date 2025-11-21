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
                this.localStream = null;
            }

            // Закрываем все соединения
            this.peerConnections.forEach((pc, socketId) => {
                pc.close();
            });
            this.peerConnections.clear();

            // Скрываем интерфейс
            document.getElementById('voiceInterface').style.display = 'none';
            this.currentVoiceChannel = null;
            document.getElementById('voiceParticipants').innerHTML = '';
        }
    }

    async createPeerConnection(socketId) {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        };

        const peerConnection = new RTCPeerConnection(configuration);
        this.peerConnections.set(socketId, peerConnection);

        // Добавляем локальный аудио поток
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });
        }

        // Обработка входящего аудио
        peerConnection.ontrack = (event) => {
            const audio = document.createElement('audio');
            audio.srcObject = event.streams[0];
            audio.autoplay = true;
            audio.controls = false;
            audio.style.display = 'none';
            document.body.appendChild(audio);
        };

        // ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('voice-ice-candidate', {
                    target: socketId,
                    candidate: event.candidate
                });
            }
        };

        return peerConnection;
    }

    async handleVoiceOffer(data) {
        const peerConnection = await this.createPeerConnection(data.sender);
        
        await peerConnection.setRemoteDescription(data.offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        this.socket.emit('voice-answer', {
            target: data.sender,
            answer: answer
        });
    }

    async handleVoiceAnswer(data) {
        const peerConnection = this.peerConnections.get(data.sender);
        if (peerConnection) {
            await peerConnection.setRemoteDescription(data.answer);
        }
    }

    async handleVoiceIceCandidate(data) {
        const peerConnection = this.peerConnections.get(data.sender);
        if (peerConnection) {
            await peerConnection.addIceCandidate(data.candidate);
        }
    }

    addVoiceParticipant(user) {
        const voiceParticipants = document.getElementById('voiceParticipants');
        
        const participant = document.createElement('div');
        participant.className = 'voice-participant';
        participant.id = `voice-participant-${user.socketId}`;
        participant.innerHTML = `
            <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=random" class="member-avatar">
            <span class="member-name">${user.username}</span>
            <div class="voice-indicator">🔊</div>
        `;
        
        voiceParticipants.appendChild(participant);

        // Создаем peer connection для нового пользователя
        this.createPeerConnection(user.socketId).then(async (peerConnection) => {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            this.socket.emit('voice-offer', {
                target: user.socketId,
                offer: offer
            });
        });
    }

    removeVoiceParticipant(socketId) {
        const participant = document.getElementById(`voice-participant-${socketId}`);
        if (participant) {
            participant.remove();
        }

        const peerConnection = this.peerConnections.get(socketId);
        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(socketId);
        }
    }

    updateVoiceParticipants(users) {
        const voiceParticipants = document.getElementById('voiceParticipants');
        voiceParticipants.innerHTML = '';

        users.forEach(user => {
            if (user.socketId !== this.socket.id) {
                this.addVoiceParticipant(user);
            }
        });
    }

    sendMessage() {
        const input = document.getElementById('messageInput');
        const content = input.value.trim();
        
        if (content && this.currentChannel) {
            this.socket.emit('send-message', {
                content: content,
                channelId: this.currentChannel.id
            });
            
            input.value = '';
        }
    }

    displayMessage(message) {
        const messagesContainer = document.getElementById('messagesContainer');
        
        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        messageElement.innerHTML = `
            <img src="${message.avatar}" class="message-avatar">
            <div class="message-content">
                <div class="message-header">
                    <span class="message-username">${message.username}</span>
                    <span class="message-timestamp">${new Date(message.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="message-text">${this.escapeHtml(message.content)}</div>
            </div>
        `;
        
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    displayMessageHistory(messages) {
        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.innerHTML = '<div class="welcome-message"><h2>Добро пожаловать в #общий-чат!</h2><p>Это начало этого канала.</p></div>';
        
        messages.forEach(message => {
            this.displayMessage(message);
        });
    }

    toggleMicrophone() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                const btn = document.getElementById('voiceMicToggle');
                btn.classList.toggle('active', audioTrack.enabled);
            }
        }
    }

    showCreateServerModal() {
        document.getElementById('createServerModal').style.display = 'flex';
    }

    hideCreateServerModal() {
        document.getElementById('createServerModal').style.display = 'none';
    }

    createServer() {
        const serverName = document.getElementById('serverNameInput').value.trim();
        if (serverName) {
            this.socket.emit('create-server', serverName);
            this.hideCreateServerModal();
            document.getElementById('serverNameInput').value = '';
        }
    }

    findChannelByName(channelName) {
        if (!this.currentServer) return null;
        
        return this.currentServer.channels.find(channel => 
            channel.name === channelName
        );
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    window.discordApp = new DiscordApp();
});
