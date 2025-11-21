class DiscordApp {
    constructor() {
        this.currentUser = {
            username: 'Гость',
            avatarColor: '#0088cc'
        };
        this.currentChannel = 'general';
        this.currentVoiceChannel = null;
        this.localStream = null;
        this.peerConnections = new Map();
        this.dataChannel = null;
        this.isInVoiceChannel = false;
        
        this.initializeApp();
    }

    initializeApp() {
        this.loadUserSettings();
        this.setupEventListeners();
        this.updateUI();
    }

    loadUserSettings() {
        const savedUsername = localStorage.getItem('discord_username');
        const savedColor = localStorage.getItem('discord_avatar_color');
        
        if (savedUsername) this.currentUser.username = savedUsername;
        if (savedColor) this.currentUser.avatarColor = savedColor;
    }

    saveUserSettings() {
        localStorage.setItem('discord_username', this.currentUser.username);
        localStorage.setItem('discord_avatar_color', this.currentUser.avatarColor);
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

        document.getElementById('sendMessageBtn').addEventListener('click', () => {
            this.sendMessage();
        });

        // Голосовое управление
        document.getElementById('leaveVoiceBtn').addEventListener('click', () => {
            this.leaveVoiceChannel();
        });

        document.getElementById('voiceMicToggle').addEventListener('click', () => {
            this.toggleMicrophone();
        });

        document.getElementById('voiceDisconnect').addEventListener('click', () => {
            this.leaveVoiceChannel();
        });

        document.getElementById('voiceScreenShare').addEventListener('click', () => {
            this.toggleScreenShare();
        });

        // Управление участниками
        document.getElementById('membersToggle').addEventListener('click', () => {
            this.toggleMembersSidebar();
        });

        // Настройки
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.showSettingsModal();
        });

        document.getElementById('saveSettings').addEventListener('click', () => {
            this.saveSettings();
        });

        document.getElementById('cancelSettings').addEventListener('click', () => {
            this.hideSettingsModal();
        });

        // Микрофон в основном интерфейсе
        document.getElementById('micToggle').addEventListener('click', () => {
            this.toggleMainMicrophone();
        });
    }

    updateUI() {
        document.getElementById('currentUsername').textContent = this.currentUser.username;
        
        // Обновляем аватар
        const avatars = document.querySelectorAll('.user-avatar, .member-avatar');
        avatars.forEach(avatar => {
            if (avatar.parentElement.querySelector('.member-name')?.textContent === 'Вы' || 
                avatar.parentElement.querySelector('.username')?.textContent === this.currentUser.username) {
                avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(this.currentUser.username)}&background=${this.currentUser.avatarColor.substring(1)}`;
            }
        });
    }

    joinTextChannel(channelName) {
        // Обновляем активный канал
        document.querySelectorAll('.channel-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-channel="${channelName}"]`).classList.add('active');

        // Обновляем заголовок
        document.getElementById('channelTitle').textContent = channelName;
        document.getElementById('messageInput').placeholder = `Написать сообщение в #${channelName}`;
        this.currentChannel = channelName;

        // Очищаем сообщения и показываем приветствие
        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.innerHTML = `
            <div class="welcome-message">
                <h2>Добро пожаловать в #${channelName}!</h2>
                <p>Это начало канала. Начните общение!</p>
            </div>
        `;
    }

    async joinVoiceChannel(channelName) {
        if (this.isInVoiceChannel) {
            this.leaveVoiceChannel();
        }

        try {
            // Запрашиваем доступ к микрофону
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });

            this.currentVoiceChannel = channelName;
            this.isInVoiceChannel = true;

            // Показываем интерфейс голосового чата
            document.getElementById('voiceInterface').style.display = 'block';
            document.getElementById('currentVoiceChannel').textContent = channelName;

            // Создаем локальный аудио элемент для мониторинга
            this.createLocalAudioMonitor();

            console.log('Успешно присоединились к голосовому каналу:', channelName);

        } catch (error) {
            console.error('Ошибка доступа к микрофону:', error);
            alert('Не удалось получить доступ к микрофону. Пожалуйста, проверьте разрешения.');
        }
    }

    createLocalAudioMonitor() {
        // Создаем скрытый аудио элемент для мониторинга собственного голоса
        const audio = document.createElement('audio');
        audio.srcObject = this.localStream;
        audio.volume = 0.3; // Тише, чтобы не было эха
        audio.play().catch(e => console.log('Audio play error:', e));
        
        // Добавляем индикатор активности микрофона
        this.setupVoiceActivityDetection();
    }

    setupVoiceActivityDetection() {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(this.localStream);
        const analyser = audioContext.createAnalyser();
        source.connect(analyser);
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const indicator = document.querySelector('#localParticipant .voice-indicator');
        
        const checkVolume = () => {
            if (!this.isInVoiceChannel) return;
            
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            
            // Обновляем индикатор в зависимости от громкости
            if (average > 20) { // Порог активации
                indicator.style.color = '#43b581';
                indicator.textContent = '🎤';
            } else {
                indicator.style.color = '#747f8d';
                indicator.textContent = '🔊';
            }
            
            requestAnimationFrame(checkVolume);
        };
        
        checkVolume();
    }

    leaveVoiceChannel() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Закрываем все peer connections
        this.peerConnections.forEach((pc, id) => {
            pc.close();
        });
        this.peerConnections.clear();

        // Скрываем интерфейс
        document.getElementById('voiceInterface').style.display = 'none';
        this.currentVoiceChannel = null;
        this.isInVoiceChannel = false;

        // Сбрасываем индикатор микрофона
        const indicator = document.querySelector('#localParticipant .voice-indicator');
        if (indicator) {
            indicator.style.color = '#747f8d';
            indicator.textContent = '🔊';
        }
    }

    toggleMicrophone() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                const btn = document.getElementById('voiceMicToggle');
                btn.classList.toggle('active', audioTrack.enabled);
                
                const indicator = document.querySelector('#localParticipant .voice-indicator');
                if (!audioTrack.enabled) {
                    indicator.style.color = '#ed4245';
                    indicator.textContent = '🔇';
                } else {
                    indicator.style.color = '#747f8d';
                    indicator.textContent = '🔊';
                }
            }
        }
    }

    toggleMainMicrophone() {
        // Просто переключает иконку в основном интерфейсе
        const btn = document.getElementById('micToggle');
        btn.classList.toggle('muted');
        btn.textContent = btn.classList.contains('muted') ? '🎤❌' : '🎤';
    }

    async toggleScreenShare() {
        try {
            if (!this.isScreenSharing) {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });
                
                // Здесь можно добавить логику для трансляции экрана
                // В реальном приложении нужно отправлять видеопоток другим участникам
                
                this.isScreenSharing = true;
                document.getElementById('voiceScreenShare').classList.add('active');
                
                // Обработчик завершения демонстрации экрана
                screenStream.getTracks().forEach(track => {
                    track.onended = () => {
                        this.isScreenSharing = false;
                        document.getElementById('voiceScreenShare').classList.remove('active');
                    };
                });
                
            } else {
                // Останавливаем демонстрацию экрана
                this.isScreenSharing = false;
                document.getElementById('voiceScreenShare').classList.remove('active');
            }
        } catch (error) {
            console.error('Ошибка демонстрации экрана:', error);
        }
    }

    sendMessage() {
        const input = document.getElementById('messageInput');
        const content = input.value.trim();
        
        if (content) {
            this.displayMessage(this.currentUser.username, content, true);
            input.value = '';
            
            // В реальном приложении здесь будет отправка сообщения через WebRTC Data Channel
            // this.sendDataChannelMessage(content);
        }
    }

    displayMessage(username, content, isOwn = false) {
        const messagesContainer = document.getElementById('messagesContainer');
        
        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=${isOwn ? this.currentUser.avatarColor.substring(1) : '666666'}`;
        
        messageElement.innerHTML = `
            <img src="${avatarUrl}" class="message-avatar">
            <div class="message-content">
                <div class="message-header">
                    <span class="message-username">${username}</span>
                    <span class="message-timestamp">${new Date().toLocaleTimeString()}</span>
                </div>
                <div class="message-text">${this.escapeHtml(content)}</div>
            </div>
        `;
        
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    toggleMembersSidebar() {
        const sidebar = document.getElementById('membersSidebar');
        sidebar.style.display = sidebar.style.display === 'none' ? 'block' : 'none';
    }

    showSettingsModal() {
        document.getElementById('settingsModal').style.display = 'flex';
        document.getElementById('usernameInput').value = this.currentUser.username;
        document.getElementById('avatarColor').value = this.currentUser.avatarColor;
    }

    hideSettingsModal() {
        document.getElementById('settingsModal').style.display = 'none';
    }

    saveSettings() {
        const username = document.getElementById('usernameInput').value.trim();
        const color = document.getElementById('avatarColor').value;
        
        if (username) {
            this.currentUser.username = username;
            this.currentUser.avatarColor = color;
            this.saveUserSettings();
            this.updateUI();
            this.hideSettingsModal();
        } else {
            alert('Пожалуйста, введите имя пользователя');
        }
    }

    // Вспомогательные методы для WebRTC (заготовка для P2P соединений)
    createPeerConnection() {
        // Базовый шаблон для создания peer-to-peer соединения
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        return new RTCPeerConnection(configuration);
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Метод для имитации получения сообщений (для демонстрации)
    simulateIncomingMessage() {
        const messages = [
            "Привет! Как дела?",
            "Кто-нибудь хочет поиграть?",
            "Отличный сервер!",
            "Как настроить голосовой чат?",
            "Добро пожаловать в наш Discord!"
        ];
        
        const users = ["Алексей", "Мария", "Иван", "Дмитрий", "Екатерина"];
        
        setTimeout(() => {
            const randomUser = users[Math.floor(Math.random() * users.length)];
            const randomMessage = messages[Math.floor(Math.random() * messages.length)];
            this.displayMessage(randomUser, randomMessage, false);
        }, 5000 + Math.random() * 10000);
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    window.discordApp = new DiscordApp();
    
    // Запускаем симуляцию входящих сообщений для демонстрации
    setInterval(() => {
        if (Math.random() > 0.7) { // 30% шанс на сообщение
            window.discordApp.simulateIncomingMessage();
        }
    }, 15000);
});
