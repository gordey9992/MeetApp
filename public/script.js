class MeetApp {
    constructor() {
        this.socket = null;
        this.localStream = null;
        this.remoteStreams = new Map();
        this.peerConnections = new Map();
        this.roomId = null;
        this.userName = 'Пользователь';
        this.isScreenSharing = false;
        this.screenStream = null;
        
        this.initializeApp();
    }

    initializeApp() {
        this.connectSocket();
        this.setupEventListeners();
        this.setupWebRTC();
    }

    connectSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            this.updateConnectionStatus('connected', 'Подключено');
        });

        this.socket.on('disconnect', () => {
            this.updateConnectionStatus('disconnected', 'Отключено');
        });

        this.socket.on('connect_error', () => {
            this.updateConnectionStatus('disconnected', 'Ошибка подключения');
        });

        // Обработчики событий комнаты
        this.socket.on('room-created', (roomId) => {
            this.roomId = roomId;
            this.showRoomInfo(roomId);
        });

        this.socket.on('room-not-found', () => {
            alert('Комната не найдена! Проверьте ID комнаты.');
        });

        this.socket.on('user-joined', (user) => {
            this.addParticipant(user);
            this.createPeerConnection(user.userId);
        });

        this.socket.on('user-left', (userId) => {
            this.removeParticipant(userId);
            this.removePeerConnection(userId);
        });

        this.socket.on('current-users', (users) => {
            users.forEach(user => {
                if (user.socketId !== this.socket.id) {
                    this.addParticipant(user);
                    this.createPeerConnection(user.socketId);
                }
            });
        });

        // WebRTC signaling
        this.socket.on('offer', async (data) => {
            await this.handleOffer(data);
        });

        this.socket.on('answer', async (data) => {
            await this.handleAnswer(data);
        });

        this.socket.on('ice-candidate', async (data) => {
            await this.handleIceCandidate(data);
        });

        // Чат
        this.socket.on('new-message', (data) => {
            this.addMessage(data.userName, data.message, false, data.timestamp);
        });

        // Демонстрация экрана
        this.socket.on('screen-share-started', (userId) => {
            this.showScreenShareIndicator(userId);
        });

        this.socket.on('screen-share-stopped', (userId) => {
            this.hideScreenShareIndicator(userId);
        });
    }

    setupEventListeners() {
        // Кнопки лобби
        document.getElementById('createRoom').addEventListener('click', () => {
            this.userName = document.getElementById('userNameInput').value || 'Пользователь';
            this.socket.emit('create-room');
        });

        document.getElementById('joinRoom').addEventListener('click', () => {
            this.joinRoom();
        });

        document.getElementById('copyInviteLink').addEventListener('click', () => {
            this.copyInviteLink();
        });

        // Управление звонком
        document.getElementById('micToggle').addEventListener('click', () => {
            this.toggleMicrophone();
        });

        document.getElementById('cameraToggle').addEventListener('click', () => {
            this.toggleCamera();
        });

        document.getElementById('screenShare').addEventListener('click', () => {
            this.toggleScreenShare();
        });

        document.getElementById('endCall').addEventListener('click', () => {
            this.endCall();
        });

        // Чат
        document.getElementById('sendMessage').addEventListener('click', () => {
            this.sendMessage();
        });

        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // Ввод имени пользователя и ID комнаты
        document.getElementById('userNameInput').addEventListener('input', (e) => {
            this.userName = e.target.value || 'Пользователь';
        });

        document.getElementById('roomIdInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.joinRoom();
            }
        });
    }

    async setupWebRTC() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            this.showLocalVideo();
            console.log('Медиа устройства инициализированы');
        } catch (error) {
            console.error('Ошибка доступа к медиа устройствам:', error);
            alert('Не удалось получить доступ к камере и микрофону. Пожалуйста, проверьте разрешения.');
        }
    }

    showLocalVideo() {
        const videoGrid = document.getElementById('videoGrid');
        const existingVideo = document.getElementById('localVideo');
        
        if (existingVideo) {
            existingVideo.srcObject = this.localStream;
            return;
        }

        const videoItem = document.createElement('div');
        videoItem.className = 'video-item';
        videoItem.id = 'localVideoContainer';
        
        const video = document.createElement('video');
        video.id = 'localVideo';
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = this.localStream;
        
        const userName = document.createElement('div');
        userName.className = 'user-name';
        userName.textContent = `${this.userName} (Вы)`;
        
        videoItem.appendChild(video);
        videoItem.appendChild(userName);
        videoGrid.appendChild(videoItem);
    }

    async createPeerConnection(userId) {
        if (this.peerConnections.has(userId)) return;

        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        const peerConnection = new RTCPeerConnection(configuration);
        this.peerConnections.set(userId, peerConnection);

        // Добавляем локальные треки
        this.localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, this.localStream);
        });

        // Обработка входящих потоков
        peerConnection.ontrack = (event) => {
            const remoteStream = event.streams[0];
            this.remoteStreams.set(userId, remoteStream);
            this.showRemoteVideo(userId, remoteStream);
        };

        // ICE кандидаты
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', {
                    target: userId,
                    candidate: event.candidate
                });
            }
        };

        // Создаем оффер
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            this.socket.emit('offer', {
                target: userId,
                offer: offer
            });
        } catch (error) {
            console.error('Ошибка создания оффера:', error);
        }
    }

    async handleOffer(data) {
        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });

        this.peerConnections.set(data.sender, peerConnection);

        // Добавляем локальные треки
        this.localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, this.localStream);
        });

        // Обработка входящих потоков
        peerConnection.ontrack = (event) => {
            const remoteStream = event.streams[0];
            this.remoteStreams.set(data.sender, remoteStream);
            this.showRemoteVideo(data.sender, remoteStream);
        };

        // ICE кандидаты
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', {
                    target: data.sender,
                    candidate: event.candidate
                });
            }
        };

        try {
            await peerConnection.setRemoteDescription(data.offer);
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            this.socket.emit('answer', {
                target: data.sender,
                answer: answer
            });
        } catch (error) {
            console.error('Ошибка обработки оффера:', error);
        }
    }

    async handleAnswer(data) {
        const peerConnection = this.peerConnections.get(data.sender);
        if (peerConnection) {
            await peerConnection.setRemoteDescription(data.answer);
        }
    }

    async handleIceCandidate(data) {
        const peerConnection = this.peerConnections.get(data.sender);
        if (peerConnection) {
            await peerConnection.addIceCandidate(data.candidate);
        }
    }

    removePeerConnection(userId) {
        const peerConnection = this.peerConnections.get(userId);
        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(userId);
        }
        this.remoteStreams.delete(userId);
    }

    showRemoteVideo(userId, stream) {
        const videoGrid = document.getElementById('videoGrid');
        const existingVideo = document.getElementById(`remoteVideo-${userId}`);
        
        if (existingVideo) {
            existingVideo.srcObject = stream;
            return;
        }

        const videoItem = document.createElement('div');
        videoItem.className = 'video-item';
        videoItem.id = `remoteVideoContainer-${userId}`;
        
        const video = document.createElement('video');
        video.id = `remoteVideo-${userId}`;
        video.autoplay = true;
        video.playsInline = true;
        video.srcObject = stream;
        
        const userName = document.createElement('div');
        userName.className = 'user-name';
        userName.textContent = this.getParticipantName(userId);
        
        videoItem.appendChild(video);
        videoItem.appendChild(userName);
        videoGrid.appendChild(videoItem);
    }

    removeRemoteVideo(userId) {
        const videoElement = document.getElementById(`remoteVideoContainer-${userId}`);
        if (videoElement) {
            videoElement.remove();
        }
    }

    // Управление медиа
    toggleMicrophone() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                const micBtn = document.getElementById('micToggle');
                micBtn.classList.toggle('muted', !audioTrack.enabled);
                micBtn.classList.toggle('active', audioTrack.enabled);
            }
        }
    }

    toggleCamera() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                const cameraBtn = document.getElementById('cameraToggle');
                cameraBtn.classList.toggle('muted', !videoTrack.enabled);
                cameraBtn.classList.toggle('active', videoTrack.enabled);
            }
        }
    }

    async toggleScreenShare() {
        if (!this.isScreenSharing) {
            try {
                this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });

                // Заменяем видеотрек в локальном потоке
                const videoTrack = this.screenStream.getVideoTracks()[0];
                const localVideoTrack = this.localStream.getVideoTracks()[0];
                
                // Заменяем трек во всех peer connections
                this.peerConnections.forEach((pc, userId) => {
                    const sender = pc.getSenders().find(s => 
                        s.track && s.track.kind === 'video'
                    );
                    if (sender) {
                        sender.replaceTrack(videoTrack);
                    }
                });

                // Обновляем локальное видео
                const localVideo = document.getElementById('localVideo');
                if (localVideo) {
                    const newStream = new MediaStream([
                        videoTrack,
                        ...this.localStream.getAudioTracks()
                    ]);
                    localVideo.srcObject = newStream;
                }

                this.isScreenSharing = true;
                document.getElementById('screenShare').classList.add('active');
                this.socket.emit('screen-share-started', this.roomId);

                // Обработка остановки демонстрации экрана
                videoTrack.onended = () => {
                    this.stopScreenShare();
                };

            } catch (error) {
                console.error('Ошибка демонстрации экрана:', error);
            }
        } else {
            this.stopScreenShare();
        }
    }

    stopScreenShare() {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        // Возвращаем камеру
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            
            this.peerConnections.forEach((pc, userId) => {
                const sender = pc.getSenders().find(s => 
                    s.track && s.track.kind === 'video'
                );
                if (sender && videoTrack) {
                    sender.replaceTrack(videoTrack);
                }
            });

            // Обновляем локальное видео
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.localStream;
            }
        }

        this.isScreenSharing = false;
        document.getElementById('screenShare').classList.remove('active');
        this.socket.emit('screen-share-stopped', this.roomId);
    }

    // Управление комнатой
    joinRoom() {
        const roomIdInput = document.getElementById('roomIdInput');
        const roomId = roomIdInput.value.trim();
        this.userName = document.getElementById('userNameInput').value || 'Пользователь';

        if (!roomId) {
            alert('Пожалуйста, введите ID комнаты');
            return;
        }

        this.socket.emit('join-room', roomId, this.userName);
        this.roomId = roomId;
        this.showCallInterface();
    }

    endCall() {
        if (confirm('Завершить звонок?')) {
            // Останавливаем все медиа потоки
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }
            if (this.screenStream) {
                this.screenStream.getTracks().forEach(track => track.stop());
            }

            // Закрываем все peer connections
            this.peerConnections.forEach((pc, userId) => {
                pc.close();
            });
            this.peerConnections.clear();
            this.remoteStreams.clear();

            // Покидаем комнату на сервере
            if (this.socket && this.roomId) {
                this.socket.emit('leave-room', this.roomId);
            }

            this.showLobby();
            this.roomId = null;
        }
    }

    // UI методы
    showLobby() {
        document.getElementById('lobby').style.display = 'flex';
        document.getElementById('callInterface').style.display = 'none';
        document.getElementById('roomInfo').style.display = 'none';
        
        // Очищаем видео грид
        const videoGrid = document.getElementById('videoGrid');
        videoGrid.innerHTML = '';
        
        // Очищаем список участников
        document.getElementById('participantsList').innerHTML = '';
        document.getElementById('chatMessages').innerHTML = '';
    }

    showCallInterface() {
        document.getElementById('lobby').style.display = 'none';
        document.getElementById('callInterface').style.display = 'grid';
        this.showLocalVideo();
    }

    showRoomInfo(roomId) {
        document.getElementById('lobby').style.display = 'flex';
        document.getElementById('callInterface').style.display = 'none';
        document.getElementById('roomInfo').style.display = 'block';
        
        const inviteLink = `${window.location.origin}?room=${roomId}`;
        document.getElementById('inviteLink').value = inviteLink;
        
        // Добавляем себя в список участников
        this.addParticipant({
            socketId: this.socket.id,
            userName: this.userName
        });
    }

    addParticipant(user) {
        const participantsList = document.getElementById('participantsList');
        const existingParticipant = document.getElementById(`participant-${user.socketId}`);
        
        if (existingParticipant) return;

        const participant = document.createElement('li');
        participant.className = 'participant';
        participant.id = `participant-${user.socketId}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'participant-avatar';
        avatar.textContent = user.userName.charAt(0).toUpperCase();
        
        const name = document.createElement('div');
        name.textContent = user.socketId === this.socket.id ? 
            `${user.userName} (Вы)` : user.userName;
        
        participant.appendChild(avatar);
        participant.appendChild(name);
        participantsList.appendChild(participant);

        this.updateParticipantsCount();
    }

    removeParticipant(userId) {
        const participant = document.getElementById(`participant-${userId}`);
        if (participant) {
            participant.remove();
        }
        this.removeRemoteVideo(userId);
        this.updateParticipantsCount();
    }

    updateParticipantsCount() {
        const count = document.querySelectorAll('.participant').length;
        document.getElementById('participantsCount').textContent = count;
    }

    getParticipantName(userId) {
        const participant = document.getElementById(`participant-${userId}`);
        if (participant) {
            return participant.querySelector('div:last-child').textContent;
        }
        return 'Участник';
    }

    // Чат
    sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();
        
        if (message && this.roomId) {
            this.socket.emit('send-message', {
                roomId: this.roomId,
                userName: this.userName,
                message: message
            });
            
            this.addMessage(this.userName
