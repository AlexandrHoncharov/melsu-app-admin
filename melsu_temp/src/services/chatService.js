import AsyncStorage from '@react-native-async-storage/async-storage';
import { database, auth } from '../config/firebase';
import {
  ref,
  set,
  push,
  onValue,
  get,
  update,
  serverTimestamp,
  query,
  orderByChild,
  limitToLast,
  off
} from 'firebase/database';
import { signInWithCustomToken, signInAnonymously } from 'firebase/auth';
import apiClient from '../api/apiClient';

class ChatService {
  constructor() {
    this.currentUser = null;
    this.initialized = false;
    this.listeners = {};
  }

  // Инициализация сервиса с данными пользователя
  async initialize() {
    if (this.initialized && this.currentUser) return true;

    try {
      // Получаем данные пользователя из AsyncStorage
      const userDataString = await AsyncStorage.getItem('userData');
      if (!userDataString) {
        console.error('No user data in AsyncStorage');
        return false;
      }

      // Парсим данные пользователя
      this.currentUser = JSON.parse(userDataString);

      // Пробуем аутентифицироваться в Firebase
      try {
        const response = await apiClient.post('/auth/firebase-token');
        const { token } = response.data;
        await signInWithCustomToken(auth, token);
        console.log('Firebase authentication successful with token');
      } catch (authError) {
        console.warn('Firebase auth failed with token, trying anonymous auth:', authError);

        try {
          await signInAnonymously(auth);
          console.log('Anonymous auth successful');
        } catch (anonError) {
          console.warn('Anonymous auth failed:', anonError);
        }
      }

      // Записываем основную информацию о пользователе в Firebase
      if (this.currentUser && this.currentUser.id) {
        try {
          const userRef = ref(database, `users/${this.currentUser.id}`);
          await set(userRef, {
            id: this.currentUser.id,
            username: this.currentUser.username,
            displayName: this.currentUser.fullName || this.currentUser.username,
            role: this.currentUser.role,
            group: this.currentUser.group,
            department: this.currentUser.department,
            lastActive: serverTimestamp()
          });
        } catch (dbError) {
          console.warn('Error writing user data to database:', dbError);
        }
      }

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Error initializing chat service:', error);
      return false;
    }
  }

  // Очистка ресурсов и отписка от слушателей
  cleanup() {
    // Отписываемся от всех слушателей
    Object.values(this.listeners).forEach(listener => {
      if (listener && listener.path && listener.event) {
        off(ref(database, listener.path), listener.event);
      }
    });

    // Очищаем список слушателей
    this.listeners = {};
  }

  // Создание личного чата между двумя пользователями
  async createPersonalChat(otherUserId) {
    if (!this.initialized || !this.currentUser) {
      const initResult = await this.initialize();
      if (!initResult) {
        throw new Error('Failed to initialize chat service');
      }
    }

    if (!this.currentUser || !this.currentUser.id) {
      throw new Error('Current user ID is not available');
    }

    if (!otherUserId) {
      throw new Error('Other user ID is not provided');
    }

    try {
      // Определяем ID чата как комбинацию ID пользователей
      const chatUsers = [String(this.currentUser.id), String(otherUserId)].sort();
      const chatId = `personal_${chatUsers.join('_')}`;

      console.log(`Creating/accessing personal chat ${chatId} between ${this.currentUser.id} and ${otherUserId}`);

      // Проверяем, существует ли уже такой чат
      const chatRef = ref(database, `chats/${chatId}`);
      const snapshot = await get(chatRef);

      if (!snapshot.exists()) {
        console.log(`Chat ${chatId} doesn't exist, creating new one`);

        // Создаем новый чат
        await set(chatRef, {
          type: 'personal',
          createdAt: serverTimestamp(),
          participants: {
            [this.currentUser.id]: true,
            [otherUserId]: true
          }
        });

        // Получаем информацию о другом пользователе через API
        let otherUserInfo = null;
        try {
          const response = await apiClient.get(`/api/users/${otherUserId}`);
          otherUserInfo = response.data;
          console.log('Got other user info from API:', otherUserInfo);
        } catch (apiError) {
          console.warn('Failed to get other user data from API, trying Firebase:', apiError);

          // Если API не доступен, пробуем получить из Firebase
          try {
            const userSnapshot = await get(ref(database, `users/${otherUserId}`));
            otherUserInfo = userSnapshot.val();
            console.log('Got other user info from Firebase:', otherUserInfo);
          } catch (fbError) {
            console.warn('Failed to get user data from Firebase:', fbError);
          }
        }

        // Формируем имя другого пользователя для отображения
        let otherUserName = otherUserInfo?.name || otherUserInfo?.fullName || otherUserInfo?.displayName;
        if (!otherUserName) {
          otherUserName = `Пользователь ${otherUserId}`;
        }

        // Добавляем дополнительную информацию зависящую от роли
        let otherUserDetails = '';
        if (otherUserInfo?.role === 'student' && otherUserInfo?.group) {
          otherUserDetails = ` (${otherUserInfo.group})`;
        } else if (otherUserInfo?.role === 'teacher' && otherUserInfo?.department) {
          otherUserDetails = ` (${otherUserInfo.department})`;
        }

        // Объединяем имя и детали
        const otherUserDisplayName = otherUserName + otherUserDetails;

        console.log(`Other user display name: ${otherUserDisplayName}`);

        // Добавляем чат в список чатов текущего пользователя
        await set(ref(database, `userChats/${this.currentUser.id}/${chatId}`), {
          type: 'personal',
          withUser: otherUserId,
          withUserName: otherUserDisplayName,
          withUserRole: otherUserInfo?.role || 'unknown',
          updatedAt: serverTimestamp()
        });

        // Формируем имя текущего пользователя
        let currentUserName = this.currentUser.fullName || this.currentUser.username;
        let currentUserDetails = '';
        if (this.currentUser.role === 'student' && this.currentUser.group) {
          currentUserDetails = ` (${this.currentUser.group})`;
        } else if (this.currentUser.role === 'teacher' && this.currentUser.department) {
          currentUserDetails = ` (${this.currentUser.department})`;
        }

        const currentUserDisplayName = currentUserName + currentUserDetails;

        console.log(`Current user display name: ${currentUserDisplayName}`);

        // Добавляем чат в список чатов другого пользователя
        await set(ref(database, `userChats/${otherUserId}/${chatId}`), {
          type: 'personal',
          withUser: this.currentUser.id,
          withUserName: currentUserDisplayName,
          withUserRole: this.currentUser.role || 'unknown',
          updatedAt: serverTimestamp()
        });

        console.log(`Personal chat ${chatId} successfully created`);
      } else {
        console.log(`Chat ${chatId} already exists`);
      }

      return chatId;
    } catch (error) {
      console.error('Error creating personal chat:', error);
      throw error;
    }
  }

  // Отправка сообщения в чат
  async sendMessage(chatId, text) {
    if (!this.initialized || !this.currentUser) {
      const initResult = await this.initialize();
      if (!initResult) {
        throw new Error('Failed to initialize chat service');
      }
    }

    if (!chatId || !text.trim()) {
      throw new Error('Chat ID or message text is empty');
    }

    try {
      // Создаем новое сообщение
      const newMessageRef = push(ref(database, `messages/${chatId}`));
      const messageId = newMessageRef.key;

      // Убедимся, что ID пользователя сохраняется как строка
      const senderId = String(this.currentUser.id);
      const senderName = this.currentUser.fullName || this.currentUser.username;

      console.log(`Sending message from ${senderId} (${senderName}): ${text}`);

      // Сохраняем сообщение
      await set(newMessageRef, {
        id: messageId,
        senderId: senderId,
        senderName: senderName,
        text,
        timestamp: serverTimestamp(),
        read: { [senderId]: true }
      });

      // Обновляем информацию о последнем сообщении в чате
      const lastMessageInfo = {
        id: messageId,
        text: text.length > 30 ? `${text.substring(0, 30)}...` : text,
        senderId: senderId,
        timestamp: serverTimestamp()
      };

      await update(ref(database, `chats/${chatId}`), {
        lastMessage: lastMessageInfo
      });

      // Обновляем информацию для всех участников чата
      const chatSnapshot = await get(ref(database, `chats/${chatId}/participants`));
      const participants = chatSnapshot.val() || {};

      for (const userId of Object.keys(participants)) {
        await update(ref(database, `userChats/${userId}/${chatId}`), {
          lastMessage: lastMessageInfo,
          updatedAt: serverTimestamp()
        });
      }

      console.log(`Message sent successfully to chat ${chatId}`);
      return messageId;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  // Получение списка чатов пользователя
  async getUserChats() {
    if (!this.initialized || !this.currentUser) {
      const initResult = await this.initialize();
      if (!initResult) {
        return [];
      }
    }

    try {
      // Отписываемся от предыдущего слушателя, если он был
      if (this.listeners.userChats) {
        off(ref(database, this.listeners.userChats.path), this.listeners.userChats.event);
      }

      const userId = String(this.currentUser.id);
      const path = `userChats/${userId}`;

      return new Promise((resolve) => {
        const userChatsRef = ref(database, path);

        const handler = onValue(userChatsRef, (snapshot) => {
          const chatsData = snapshot.val() || {};

          // Преобразуем в массив
          const chats = Object.entries(chatsData).map(([id, data]) => ({
            id,
            ...data
          }));

          // Сортируем по времени (сначала новые)
          chats.sort((a, b) => {
            const timeA = a.updatedAt || 0;
            const timeB = b.updatedAt || 0;
            return timeB - timeA;
          });

          console.log(`Loaded ${chats.length} chats for user ${userId}`);
          resolve(chats);
        }, (error) => {
          console.error('Error getting user chats:', error);
          // В случае ошибки возвращаем тестовые данные
          resolve([
            {
              id: 'test_chat_1',
              type: 'personal',
              withUser: '999',
              withUserName: 'Тестовый пользователь (offline)',
              lastMessage: {
                text: 'Это тестовое сообщение для отладки',
                senderId: '999',
                timestamp: Date.now()
              },
              updatedAt: Date.now()
            }
          ]);
        });

        // Сохраняем слушателя для последующей отписки
        this.listeners.userChats = { path, event: 'value', handler };
      });
    } catch (error) {
      console.error('Error in getUserChats:', error);
      return [];
    }
  }

  // Получение сообщений чата
  async getChatMessages(chatId, limit = 50) {
    if (!chatId) {
      console.error('Chat ID is empty');
      return [];
    }

    try {
      // Отписываемся от предыдущего слушателя, если он был
      const listenerKey = `messages_${chatId}`;
      if (this.listeners[listenerKey]) {
        off(ref(database, this.listeners[listenerKey].path), this.listeners[listenerKey].event);
      }

      const path = `messages/${chatId}`;

      return new Promise((resolve) => {
        const messagesQuery = query(
          ref(database, path),
          orderByChild('timestamp'),
          limitToLast(limit)
        );

        const handler = onValue(messagesQuery, (snapshot) => {
          const messagesData = snapshot.val() || {};

          // Преобразуем в массив и сортируем
          const messages = Object.values(messagesData);
          messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

          console.log(`Loaded ${messages.length} messages for chat ${chatId}`);
          resolve(messages);
        }, (error) => {
          console.error(`Error getting messages for chat ${chatId}:`, error);
          resolve([]);
        });

        // Сохраняем слушателя для последующей отписки
        this.listeners[listenerKey] = { path, event: 'value', handler };
      });
    } catch (error) {
      console.error('Error in getChatMessages:', error);
      return [];
    }
  }

  // Получение информации о чате
  async getChatInfo(chatId) {
    if (!chatId) {
      console.error('Chat ID is empty');
      return null;
    }

    try {
      // Отписываемся от предыдущего слушателя, если он был
      const listenerKey = `chatInfo_${chatId}`;
      if (this.listeners[listenerKey]) {
        off(ref(database, this.listeners[listenerKey].path), this.listeners[listenerKey].event);
      }

      const path = `chats/${chatId}`;

      return new Promise((resolve) => {
        const chatRef = ref(database, path);

        const handler = onValue(chatRef, (snapshot) => {
          const chatData = snapshot.val() || null;
          resolve(chatData);
        }, (error) => {
          console.error(`Error getting chat info for ${chatId}:`, error);
          resolve(null);
        });

        // Сохраняем слушателя для последующей отписки
        this.listeners[listenerKey] = { path, event: 'value', handler };
      });
    } catch (error) {
      console.error('Error in getChatInfo:', error);
      return null;
    }
  }

  // Отметить сообщения как прочитанные
  async markMessagesAsRead(chatId) {
    if (!this.initialized || !this.currentUser) {
      const initResult = await this.initialize();
      if (!initResult) return;
    }

    if (!chatId) return;

    try {
      const userId = String(this.currentUser.id);
      const messagesRef = ref(database, `messages/${chatId}`);
      const snapshot = await get(messagesRef);

      if (!snapshot.exists()) return;

      const updates = {};

      // Отмечаем все непрочитанные сообщения
      snapshot.forEach((childSnapshot) => {
        const message = childSnapshot.val() || {};

        // Пропускаем свои сообщения или уже прочитанные
        if (String(message.senderId) === userId ||
            (message.read && message.read[userId])) {
          return;
        }

        // Добавляем в очередь на обновление
        updates[`messages/${chatId}/${childSnapshot.key}/read/${userId}`] = true;
      });

      // Если есть что обновлять
      if (Object.keys(updates).length > 0) {
        await update(ref(database), updates);
        console.log(`Marked ${Object.keys(updates).length} messages as read in chat ${chatId}`);
      }
    } catch (error) {
      console.warn('Error marking messages as read:', error);
    }
  }
}

// Создаем и экспортируем экземпляр сервиса
const chatService = new ChatService();
export default chatService;