import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'peerjs';

import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import VoiceCall from './components/VoiceCall';
import Login from './components/Login';

const socket = io('http://localhost:5000');

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [servers, setServers] = useState([]);
  const [currentServer, setCurrentServer] = useState(null);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [isInCall, setIsInCall] = useState(false);
  const [callData, setCallData] = useState(null);

  useEffect(() => {
    // Загрузка серверов
    fetch('/api/servers')
      .then(res => res.json())
      .then(data => setServers(data));

    // Socket события
    socket.on('new_message', (data) => {
      // Обновляем сообщения в реальном времени
      console.log('Новое сообщение:', data);
    });

    socket.on('call_made', (data) => {
      setCallData(data);
    });
  }, []);

  const handleLogin = (userData) => {
    setCurrentUser(userData);
    socket.emit('user_join', userData);
  };

  const handleSendMessage = (content, attachments = []) => {
    if (!currentServer || !currentChannel) return;

    socket.emit('send_message', {
      serverId: currentServer._id,
      channelId: currentChannel,
      userId: currentUser._id,
      user: currentUser,
      content,
      attachments
    });
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      <Sidebar 
        servers={servers}
        currentServer={currentServer}
        onServerSelect={setCurrentServer}
        currentUser={currentUser}
      />
      
      <ChatArea 
        currentServer={currentServer}
        currentChannel={currentChannel}
        onChannelSelect={setCurrentChannel}
        onSendMessage={handleSendMessage}
        currentUser={currentUser}
        socket={socket}
      />

      {isInCall && (
        <VoiceCall 
          callData={callData}
          onEndCall={() => setIsInCall(false)}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}

export default App;
