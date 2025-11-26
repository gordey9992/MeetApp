import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Smile, 
  Paperclip, 
  Gif, 
  Sticker,
  At,
  Mic
} from 'lucide-react';

const ChatArea = ({ 
  currentServer, 
  currentChannel, 
  onSendMessage, 
  currentUser,
  socket 
}) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef(null);

  // Кастомные эмодзи (позже из сервера)
  const customEmojis = [
    { name: 'pepega', url: 'https://cdn.frankerfacez.com/emoticon/457359/4' },
    { name: 'monkaS', url: 'https://cdn.frankerfacez.com/emoticon/460622/4' },
    { name: 'pog', url: 'https://cdn.frankerfacez.com/emoticon/457210/4' }
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!currentServer || !currentChannel) return;

    // Загрузка сообщений канала
    const channel = currentServer.channels.find((ch, idx) => 
      currentChannel === idx || ch.name === currentChannel
    );
    
    if (channel) {
      setMessages(channel.messages || []);
    }

    // Слушаем новые сообщения
    socket.on('new_message', (data) => {
      if (data.channelId === currentChannel) {
        setMessages(prev => [...prev, data.message]);
      }
    });

    return () => {
      socket.off('new_message');
    };
  }, [currentServer, currentChannel, socket]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    onSendMessage(newMessage);
    setNewMessage('');
    setShowEmojiPicker(false);
  };

  const addEmoji = (emojiName) => {
    setNewMessage(prev => prev + ` :${emojiName}: `);
    setShowEmojiPicker(false);
  };

  const parseMessage = (content) => {
    // Замена :emoji: на изображения
    let parsedContent = content;
    customEmojis.forEach(emoji => {
      const regex = new RegExp(`:${emoji.name}:`, 'g');
      parsedContent = parsedContent.replace(
        regex, 
        `<img src="${emoji.url}" alt="${emoji.name}" class="w-6 h-6 inline align-middle mx-0.5" />`
      );
    });

    return { __html: parsedContent };
  };

  if (!currentServer || !currentChannel) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <MessageCircle className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-400 mb-2">
            Выберите канал
          </h3>
          <p className="text-gray-500">
            Начните общение, выбрав канал слева
          </p>
        </div>
      </div>
    );
  }

  const currentChannelData = currentServer.channels.find((ch, idx) => 
    currentChannel === idx || ch.name === currentChannel
  );

  return (
    <div className="flex-1 flex flex-col bg-gray-900">
      {/* Заголовок канала */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Hash className="w-6 h-6 text-gray-400" />
          <h2 className="font-semibold text-white">
            {currentChannelData?.name}
          </h2>
        </div>
        <div className="flex items-center gap-4 text-gray-400">
          <button className="hover:text-white transition-colors">
            <At className="w-5 h-5" />
          </button>
          <button className="hover:text-white transition-colors">
            <Mic className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Сообщения */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Пока нет сообщений</p>
            <p className="text-sm">Будьте первым, кто напишет в этом канале!</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div key={index} className="flex gap-3 hover:bg-gray-800 p-2 rounded-lg group">
              <img
                src={message.user.avatar}
                alt={message.user.username}
                className="w-10 h-10 rounded-full flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-white">
                    {message.user.username}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(message.timestamp).toLocaleTimeString('ru-RU')}
                  </span>
                </div>
                <div 
                  className="text-gray-300 mt-1"
                  dangerouslySetInnerHTML={parseMessage(message.content)}
                />
                {message.attachments && message.attachments.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {message.attachments.map((att, idx) => (
                      <img
                        key={idx}
                        src={att}
                        alt="Вложение"
                        className="max-w-48 max-h-48 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Поле ввода сообщения */}
      <div className="p-4 border-t border-gray-700">
        <form onSubmit={handleSendMessage} className="relative">
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Smile className="w-5 h-5" />
            </button>
            <button
              type="button"
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <button
              type="button"
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Gif className="w-5 h-5" />
            </button>
            <button
              type="button"
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Sticker className="w-5 h-5" />
            </button>
          </div>

          {/* Emoji Picker */}
          {showEmojiPicker && (
            <div className="absolute bottom-full left-0 mb-2 bg-gray-800 border border-gray-600 rounded-lg p-3 w-64 max-h-48 overflow-y-auto">
              <div className="grid grid-cols-4 gap-2">
                {customEmojis.map(emoji => (
                  <button
                    key={emoji.name}
                    type="button"
                    onClick={() => addEmoji(emoji.name)}
                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                  >
                    <img
                      src={emoji.url}
                      alt={emoji.name}
                      className="w-8 h-8"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={`Написать в #${currentChannelData?.name}`}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-800 disabled:cursor-not-allowed text-white p-3 rounded-lg transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatArea;
