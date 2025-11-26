import React, { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Users } from 'lucide-react';

const VoiceCall = ({ callData, onEndCall, currentUser }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [participants, setParticipants] = useState([]);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    // Имитация подключения к звонку
    setParticipants([
      currentUser,
      { 
        _id: '2', 
        username: 'Участник 2', 
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=user2',
        isTalking: true 
      },
      { 
        _id: '3', 
        username: 'Участник 3', 
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=user3',
        isTalking: false 
      }
    ]);

    // В реальности здесь будет WebRTC логика
  }, []);

  const toggleMute = () => setIsMuted(!isMuted);
  const toggleVideo = () => setIsVideoOn(!isVideoOn);

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
      {/* Заголовок звонка */}
      <div className="p-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Phone className="w-6 h-6 text-green-400" />
          <div>
            <h2 className="font-semibold text-white">Голосовой канал</h2>
            <p className="text-sm text-gray-400">
              {participants.length} участников в звонке
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <Users className="w-5 h-5" />
          <span>{participants.length}</span>
        </div>
      </div>

      {/* Видео участников */}
      <div className="flex-1 p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto">
        {participants.map(participant => (
          <div key={participant._id} className="relative bg-gray-800 rounded-xl overflow-hidden">
            {/* Видео или аватар */}
            <div className="aspect-video bg-gray-700 flex items-center justify-center">
              {isVideoOn && participant._id === currentUser._id ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  className="w-full h-full object-cover"
                />
              ) : participant.isTalking ? (
                <div className="relative">
                  <img
                    src={participant.avatar}
                    alt={participant.username}
                    className="w-32 h-32 rounded-full border-4 border-green-400"
                  />
                  <div className="absolute inset-0 rounded-full border-4 border-green-400 animate-ping"></div>
                </div>
              ) : (
                <img
                  src={participant.avatar}
                  alt={participant.username}
                  className="w-32 h-32 rounded-full border-4 border-gray-600"
                />
              )}
            </div>

            {/* Информация участника */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-3">
              <div className="flex items-center gap-2">
                {participant.isTalking && (
                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                )}
                <span className="text-white font-medium">
                  {participant.username}
                  {participant._id === currentUser._id && ' (Вы)'}
                </span>
              </div>
              {isMuted && participant._id === currentUser._id && (
                <div className="flex items-center gap-1 text-red-400 text-sm">
                  <MicOff className="w-3 h-3" />
                  <span>Заглушен</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Панель управления звонком */}
      <div className="p-6 bg-gray-800 border-t border-gray-700">
        <div className="flex items-center justify-center gap-4">
          {/* Кнопка микрофона */}
          <button
            onClick={toggleMute}
            className={`p-4 rounded-full transition-all ${
              isMuted 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-gray-600 hover:bg-gray-500 text-white'
            }`}
          >
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>

          {/* Кнопка видео */}
          <button
            onClick={toggleVideo}
            className={`p-4 rounded-full transition-all ${
              isVideoOn 
                ? 'bg-blue-500 hover:bg-blue-600 text-white' 
                : 'bg-gray-600 hover:bg-gray-500 text-white'
            }`}
          >
            {isVideoOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
          </button>

          {/* Кнопка завершения звонка */}
          <button
            onClick={onEndCall}
            className="p-4 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>

        {/* Дополнительная информация */}
        <div className="text-center mt-4">
          <p className="text-sm text-gray-400">
            Длительность: 05:23 • Качество: Отличное
          </p>
        </div>
      </div>
    </div>
  );
};

export default VoiceCall;
