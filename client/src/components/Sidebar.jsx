import React, { useState } from 'react';
import { 
  MessageCircle, 
  Users, 
  Phone, 
  Settings, 
  Plus,
  Hash,
  Mic,
  Crown
} from 'lucide-react';

const Sidebar = ({ 
  servers, 
  currentServer, 
  onServerSelect, 
  currentUser 
}) => {
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [newServerName, setNewServerName] = useState('');

  const createServer = () => {
    if (!newServerName.trim()) return;

    const newServer = {
      _id: Date.now().toString(),
      name: newServerName,
      owner: currentUser,
      members: [currentUser],
      channels: [
        { name: 'общий-чат', type: 'text', messages: [] },
        { name: 'голосовой', type: 'voice', messages: [] }
      ],
      customEmojis: [],
      stickers: []
    };

    // В реальности здесь будет запрос к API
    onServerSelect(newServer);
    setNewServerName('');
    setShowCreateServer(false);
  };

  return (
    <div className="flex h-full bg-gray-800">
      {/* Серверы слева */}
      <div className="w-16 bg-gray-900 flex flex-col items-center py-4 space-y-4">
        {/* Лого MeetApp */}
        <div className="p-2 bg-blue-500 rounded-xl cursor-pointer hover:bg-blue-600 transition-colors">
          <MessageCircle className="w-8 h-8 text-white" />
        </div>

        {/* Разделитель */}
        <div className="w-8 h-0.5 bg-gray-700 rounded"></div>

        {/* Список серверов */}
        {servers.map(server => (
          <div
            key={server._id}
            onClick={() => onServerSelect(server)}
            className={`p-3 rounded-2xl cursor-pointer transition-all ${
              currentServer?._id === server._id 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
            title={server.name}
          >
            <div className="w-6 h-6 flex items-center justify-center font-semibold">
              {server.name.charAt(0).toUpperCase()}
            </div>
          </div>
        ))}

        {/* Кнопка создания сервера */}
        <button
          onClick={() => setShowCreateServer(true)}
          className="p-3 bg-gray-700 hover:bg-green-600 rounded-2xl transition-colors text-green-400 hover:text-white"
          title="Создать сервер"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      {/* Каналы сервера */}
      {currentServer && (
        <div className="w-60 bg-gray-800 flex flex-col">
          {/* Заголовок сервера */}
          <div className="p-4 border-b border-gray-700">
            <h2 className="font-bold text-white truncate flex items-center gap-2">
              <Crown className="w-4 h-4 text-yellow-400" />
              {currentServer.name}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              {currentServer.members.length} участников
            </p>
          </div>

          {/* Текстовые каналы */}
          <div className="p-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 mb-2">
              Текстовые каналы
            </h3>
            {currentServer.channels
              .filter(channel => channel.type === 'text')
              .map((channel, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 rounded hover:bg-gray-700 cursor-pointer text-gray-300 hover:text-white"
                >
                  <Hash className="w-4 h-4" />
                  <span>{channel.name}</span>
                </div>
              ))}
          </div>

          {/* Голосовые каналы */}
          <div className="p-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 mb-2">
              Голосовые каналы
            </h3>
            {currentServer.channels
              .filter(channel => channel.type === 'voice')
              .map((channel, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 rounded hover:bg-gray-700 cursor-pointer text-gray-300 hover:text-white"
                >
                  <Mic className="w-4 h-4" />
                  <span>{channel.name}</span>
                </div>
              ))}
          </div>

          {/* Участники онлайн */}
          <div className="p-2 mt-auto border-t border-gray-700">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 mb-2">
              Участники онлайн — {currentServer.members.length}
            </h3>
            {currentServer.members.map(member => (
              <div key={member._id} className="flex items-center gap-2 p-2 rounded hover:bg-gray-700">
                <div className="relative">
                  <img
                    src={member.avatar}
                    alt={member.username}
                    className="w-8 h-8 rounded-full"
                  />
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-gray-800 rounded-full"></div>
                </div>
                <span className="text-sm text-gray-300">{member.username}</span>
              </div>
            ))}
          </div>

          {/* Профиль пользователя */}
          <div className="p-2 bg-gray-900 border-t border-gray-700">
            <div className="flex items-center gap-2 p-2">
              <img
                src={currentUser.avatar}
                alt={currentUser.username}
                className="w-8 h-8 rounded-full"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {currentUser.username}
                </p>
                <p className="text-xs text-green-400">#{currentUser._id.slice(-4)}</p>
              </div>
              <div className="flex gap-1">
                <Mic className="w-4 h-4 text-gray-400 hover:text-white cursor-pointer" />
                <Phone className="w-4 h-4 text-gray-400 hover:text-white cursor-pointer" />
                <Settings className="w-4 h-4 text-gray-400 hover:text-white cursor-pointer" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модалка создания сервера */}
      {showCreateServer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-96">
            <h3 className="text-xl font-bold text-white mb-4">Создать сервер</h3>
            <input
              type="text"
              placeholder="Название сервера"
              value={newServerName}
              onChange={(e) => setNewServerName(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={createServer}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg transition-colors"
              >
                Создать
              </button>
              <button
                onClick={() => setShowCreateServer(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
