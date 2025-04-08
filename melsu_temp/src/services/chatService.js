// File: melsu_temp/src/services/chatService.js
// Полная версия с методом reset() для очистки кэша
import AsyncStorage from '@react-native-async-storage/async-storage';
import {auth, database} from '../config/firebase';
import {
    get,
    limitToLast,
    off,
    onValue,
    orderByChild,
    push,
    query,
    ref,
    serverTimestamp,
    set,
    update
} from 'firebase/database';
import {signInAnonymously, signInWithCustomToken} from 'firebase/auth';
import apiClient from '../api/apiClient';

class ChatService {
    constructor() {
        this.currentUser = null;
        this.initialized = false;
        this.listeners = {};
        this.forcedUserId = null; // Для принудительного задания ID пользователя
        this.initializationInProgress = false; // Флаг для предотвращения рекурсии
    }

    // Принудительно установить ID текущего пользователя (для исправления ошибок идентификации)
    forceCurrentUserId(userId) {
        if (!userId) {
            console.warn('Cannot force empty user ID');
            return;
        }

        // Преобразуем в строку и сохраняем
        this.forcedUserId = String(userId);
        console.log(`🔧 Forced user ID set to: ${this.forcedUserId}`);

        // Если пользователь уже инициализирован, обновляем его ID
        if (this.currentUser) {
            this.currentUser.id = this.forcedUserId;
            console.log(`🔧 Updated current user ID to forced value: ${this.currentUser.id}`);
        }
    }

    // Получить ID текущего пользователя (с учетом принудительно заданного)
    getCurrentUserId() {
        // Используем принудительно заданный ID, если он есть
        if (this.forcedUserId) {
            return this.forcedUserId;
        }

        // Иначе используем ID текущего пользователя
        if (this.currentUser && this.currentUser.id) {
            return String(this.currentUser.id);
        }

        return null;
    }

    // Инициализация сервиса с данными пользователя
    async initialize() {
        // Предотвращаем рекурсию - если инициализация уже выполняется, просто ждем её завершения
        if (this.initializationInProgress) {
            console.log('Initialization already in progress, waiting...');
            // Ждем небольшую паузу и проверяем статус
            await new Promise(resolve => setTimeout(resolve, 500));
            return this.initialized;
        }

        // Если уже инициализированы и у нас есть пользователь, просто возвращаем true
        if (this.initialized && this.currentUser) {
            return true;
        }

        try {
            // Устанавливаем флаг, что инициализация в процессе
            this.initializationInProgress = true;

            // Очищаем пользователя перед новой инициализацией
            this.currentUser = null;

            // Загружаем данные пользователя из AsyncStorage
            const userDataString = await AsyncStorage.getItem('userData');
            if (!userDataString) {
                console.error('No user data in AsyncStorage');
                this.initializationInProgress = false;
                return false;
            }

            // Парсим данные пользователя
            let userData = JSON.parse(userDataString);

            // КРИТИЧЕСКИ ВАЖНО: Всегда преобразуем ID в строку
            if (userData && userData.id !== undefined) {
                userData.id = String(userData.id);
            } else {
                console.error('User ID is missing in async storage data');
                this.initializationInProgress = false;
                return false;
            }

            // Если принудительно задан ID, используем его
            if (this.forcedUserId) {
                console.log(`🔧 Using forced user ID: ${this.forcedUserId} instead of ${userData.id}`);
                userData.id = this.forcedUserId;
            }

            this.currentUser = userData;
            console.log(`ChatService: Initialized with user: ID=${this.currentUser.id}, Name=${this.currentUser.fullName || this.currentUser.username}, Role=${this.currentUser.role}`);

            // Пробуем аутентифицироваться в Firebase без рекурсивных вызовов
            try {
                const response = await apiClient.post('/auth/firebase-token');
                const {token} = response.data;
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

            this.initialized = true;
            this.initializationInProgress = false;
            return true;
        } catch (error) {
            console.error('Error initializing chat service:', error);
            this.initialized = false;
            this.initializationInProgress = false;
            return false;
        }
    }

    // Очистка ресурсов и отписка от слушателей
    cleanup() {
        // Отписываемся от всех слушателей
        Object.keys(this.listeners).forEach(key => {
            const listener = this.listeners[key];
            if (listener && listener.path && listener.event) {
                try {
                    off(ref(database, listener.path), listener.event);
                    console.log(`Unsubscribed from ${listener.path}`);
                } catch (e) {
                    console.warn(`Error unsubscribing from ${listener.path}:`, e);
                }
            }
        });

        // Очищаем список слушателей и сбрасываем кэш
        this.listeners = {};

        // Log cleanup
        console.log('ChatService cleanup completed, all listeners removed');
    }

    // Полный сброс состояния сервиса (вызывается при выходе из аккаунта)
    reset() {
        console.log('Full reset of ChatService initiated');

        // Отписываемся от всех слушателей Firebase
        this.cleanup();

        // Сбрасываем внутреннее состояние
        this.currentUser = null;
        this.initialized = false;
        this.forcedUserId = null;
        this.initializationInProgress = false;

        // Выход из Firebase Auth
        try {
            if (auth.currentUser) {
                auth.signOut();
                console.log('Successfully signed out from Firebase Auth');
            }
        } catch (error) {
            console.warn('Error signing out from Firebase Auth:', error);
        }

        // Очищаем все обработчики событий
        this.listeners = {};

        console.log('ChatService completely reset - all state cleared, listeners removed, user signed out');

        return true;
    }

    // Создание личного чата между двумя пользователями
    async createPersonalChat(otherUserId) {
        // Инициализируем, если не инициализированы
        if (!this.initialized || !this.currentUser) {
            const initResult = await this.initialize();
            if (!initResult) {
                throw new Error('Failed to initialize chat service');
            }
        }

        if (!this.currentUser || !this.currentUser.id) {
            throw new Error('Current user ID is not available');
        }

        // ВСЕГДА преобразуем в строку
        otherUserId = String(otherUserId);
        const myUserId = this.getCurrentUserId();

        console.log(`Creating personal chat between ${myUserId} and ${otherUserId}`);

        try {
            // Определяем ID чата как комбинацию ID пользователей
            const chatUsers = [myUserId, otherUserId].sort();
            const chatId = `personal_${chatUsers.join('_')}`;

            // Запоминаем информацию о пользователях
            let otherUserInfo = null;
            let currentUserInfo = {
                id: myUserId,
                displayName: this.currentUser.fullName || this.currentUser.username || `Пользователь ${myUserId}`,
                role: this.currentUser.role || 'unknown',
                group: this.currentUser.group,
                department: this.currentUser.department
            };

            // Получаем данные о другом пользователе из API
            try {
                const response = await apiClient.get(`/users/${otherUserId}`);
                otherUserInfo = response.data;
                console.log(`Got other user info from API:`, otherUserInfo);
            } catch (apiError) {
                console.warn(`Failed to get user ${otherUserId} data from API:`, apiError);

                // Пробуем Firebase в качестве резервного варианта
                try {
                    const userSnapshot = await get(ref(database, `users/${otherUserId}`));
                    if (userSnapshot.exists()) {
                        otherUserInfo = userSnapshot.val();
                        console.log(`Got other user info from Firebase:`, otherUserInfo);
                    }
                } catch (fbError) {
                    console.warn(`Failed to get user ${otherUserId} data from Firebase:`, fbError);
                }
            }

            // Если не удалось получить информацию, создаем заглушку
            if (!otherUserInfo) {
                otherUserInfo = {
                    id: otherUserId, displayName: `Пользователь ${otherUserId}`, role: 'unknown'
                };
            }

            // Проверяем, существует ли уже такой чат
            const chatRef = ref(database, `chats/${chatId}`);
            const snapshot = await get(chatRef);

            if (!snapshot.exists()) {
                console.log(`Creating new chat ${chatId}`);

                // Создаем новый чат
                await set(chatRef, {
                    id: chatId, type: 'personal', createdAt: serverTimestamp(), participants: {
                        [myUserId]: true, [otherUserId]: true
                    }
                });

                // Формируем имя другого пользователя для отображения
                // ВАЖНО: Для студента показываем полное имя преподавателя
                let otherUserName = '';

                if (otherUserInfo.fullName) {
                    otherUserName = otherUserInfo.fullName;
                } else if (otherUserInfo.displayName) {
                    otherUserName = otherUserInfo.displayName;
                } else if (otherUserInfo.name) {
                    otherUserName = otherUserInfo.name;
                } else {
                    otherUserName = `Пользователь ${otherUserId}`;
                }

                // Добавляем дополнительную информацию зависящую от роли
                let otherUserDetails = '';
                if (otherUserInfo.role === 'student' && otherUserInfo.group) {
                    otherUserDetails = ` (${otherUserInfo.group})`;
                } else if (otherUserInfo.role === 'teacher' && otherUserInfo.department) {
                    otherUserDetails = ` (${otherUserInfo.department})`;
                }

                // Объединяем имя и детали
                const otherUserDisplayName = otherUserName + otherUserDetails;

                console.log(`Other user display name: ${otherUserDisplayName}`);

                // Добавляем чат в список чатов текущего пользователя
                await set(ref(database, `userChats/${myUserId}/${chatId}`), {
                    id: chatId,
                    type: 'personal',
                    withUser: otherUserId,
                    withUserRole: otherUserInfo.role || 'unknown',
                    withUserName: otherUserDisplayName,
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
                    id: chatId,
                    type: 'personal',
                    withUser: myUserId,
                    withUserName: currentUserDisplayName,
                    withUserRole: this.currentUser.role || 'unknown',
                    updatedAt: serverTimestamp()
                });

                console.log(`Personal chat ${chatId} successfully created`);
            } else {
                console.log(`Chat ${chatId} already exists, updating`);

                // Обновляем имена пользователей, если чат уже существует
                // Получаем текущие данные чата
                try {
                    const myUserChatRef = ref(database, `userChats/${myUserId}/${chatId}`);
                    const myUserChatSnapshot = await get(myUserChatRef);

                    if (myUserChatSnapshot.exists()) {
                        const chatData = myUserChatSnapshot.val();
                        const otherUserName = otherUserInfo.fullName || otherUserInfo.displayName || otherUserInfo.name || `Пользователь ${otherUserId}`;

                        // Если имя поменялось или отсутствует, обновляем
                        if (!chatData.withUserName || chatData.withUserName === `Пользователь ${otherUserId}`) {
                            console.log(`Updating other user name to: ${otherUserName}`);
                            await update(myUserChatRef, {
                                withUserName: otherUserName, updatedAt: serverTimestamp()
                            });
                        }
                    }
                } catch (updateError) {
                    console.warn('Error updating chat name:', updateError);
                }
            }

            return chatId;
        } catch (error) {
            console.error('Error creating personal chat:', error);
            throw error;
        }
    }

    // Отправка сообщения в чат
    // Update the sendMessage method in chatService.js

// Original method with notification functionality added
    async sendMessage(chatId, text) {
        // Initialization code remains the same
        if (!this.initialized || !this.currentUser) {
            const initResult = await this.initialize();
            if (!initResult) {
                throw new Error('User not initialized. Cannot send message.');
            }
        }

        if (!chatId || !text.trim()) {
            throw new Error('Chat ID or message text is empty');
        }

        // ALWAYS use string ID
        const myUserId = this.getCurrentUserId();
        const senderName = this.currentUser.fullName || this.currentUser.username || `Пользователь ${myUserId}`;

        console.log(`Sending message from ${myUserId} (${senderName}) to chat ${chatId}`);

        try {
            // Create new message
            const newMessageRef = push(ref(database, `messages/${chatId}`));
            const messageId = newMessageRef.key;

            // Save message
            const messageData = {
                id: messageId,
                senderId: myUserId,
                senderName: senderName,
                text,
                timestamp: serverTimestamp(),
                read: {[myUserId]: true}
            };

            await set(newMessageRef, messageData);

            // Update last message info in chat
            const lastMessageInfo = {
                id: messageId,
                text: text.length > 30 ? `${text.substring(0, 30)}...` : text,
                senderId: myUserId,
                timestamp: serverTimestamp()
            };

            await update(ref(database, `chats/${chatId}`), {
                lastMessage: lastMessageInfo
            });

            // Get chat participants and update their chat info
            const chatSnapshot = await get(ref(database, `chats/${chatId}/participants`));
            const participants = chatSnapshot.val() || {};

            // Process each participant
            for (const userId of Object.keys(participants)) {
                // Update user's chat info
                await update(ref(database, `userChats/${userId}/${chatId}`), {
                    lastMessage: lastMessageInfo, updatedAt: serverTimestamp()
                });

                // Send push notification to other participants
                if (userId !== myUserId) {
                    try {
                        // Create a preview of the message (shorter version for notification)
                        const messagePreview = text.length > 50 ? `${text.substring(0, 50)}...` : text;

                        // Call the notification API endpoint
                        await this.sendNotificationToUser(userId, chatId, messagePreview, senderName);
                    } catch (notifError) {
                        console.warn(`Failed to send notification to user ${userId}:`, notifError);
                        // Continue even if notification fails
                    }
                }
            }

            console.log(`Message sent successfully to chat ${chatId}`);
            return messageId;
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

// Add this new method to chatService.js
    async sendNotificationToUser(recipientId, chatId, messagePreview, senderName) {
        try {
            const response = await apiClient.post('/chat/send-notification', {
                recipient_id: recipientId, chat_id: chatId, message_preview: messagePreview, sender_name: senderName
            });

            console.log('Push notification result:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error sending push notification:', error);
            // Don't throw - this should not interrupt the message sending process
            return {success: false, error: error.message};
        }
    }

    // Получение списка чатов пользователя
    async getUserChats() {
        // Инициализируем, если не инициализированы
        if (!this.initialized || !this.currentUser) {
            const initResult = await this.initialize();
            if (!initResult) {
                console.error('Failed to initialize when getting user chats');
                return [];
            }
        }

        if (!this.currentUser || !this.currentUser.id) {
            console.error('No current user available');
            return [];
        }

        // ВСЕГДА используем строковый ID
        const myUserId = this.getCurrentUserId();

        try {
            // Отписываемся от предыдущего слушателя, если он был
            if (this.listeners.userChats) {
                off(ref(database, this.listeners.userChats.path), this.listeners.userChats.event);
                delete this.listeners.userChats;
            }

            const path = `userChats/${myUserId}`;
            console.log(`Getting chats for user ${myUserId}`);

            return new Promise((resolve) => {
                const userChatsRef = ref(database, path);

                const handler = onValue(userChatsRef, (snapshot) => {
                    const chatsData = snapshot.val() || {};

                    // Преобразуем в массив
                    const chats = Object.entries(chatsData).map(([id, data]) => {
                        // Гарантируем, что withUser всегда строка
                        if (data.withUser) {
                            data.withUser = String(data.withUser);
                        }

                        return {
                            id, ...data
                        };
                    });

                    // Сортируем по времени (сначала новые)
                    chats.sort((a, b) => {
                        const timeA = a.updatedAt || 0;
                        const timeB = b.updatedAt || 0;
                        return timeB - timeA;
                    });

                    console.log(`Loaded ${chats.length} chats for user ${myUserId}`);
                    resolve(chats);
                }, (error) => {
                    console.error('Error getting user chats:', error);
                    resolve([]);
                });

                // Сохраняем слушателя для последующей отписки
                this.listeners.userChats = {path, event: 'value', handler};
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

        // Инициализируем, если не инициализированы
        if (!this.initialized || !this.currentUser) {
            const initResult = await this.initialize();
            if (!initResult) {
                console.error('Failed to initialize when getting chat messages');
                return [];
            }
        }

        if (!this.currentUser || !this.currentUser.id) {
            console.error('Current user is not initialized');
            return [];
        }

        // ВСЕГДА используем строковый ID
        const myUserId = this.getCurrentUserId();

        try {
            // Отписываемся от предыдущего слушателя, если он был
            const listenerKey = `messages_${chatId}`;
            if (this.listeners[listenerKey]) {
                off(ref(database, this.listeners[listenerKey].path), this.listeners[listenerKey].event);
                delete this.listeners[listenerKey];
            }

            const path = `messages/${chatId}`;
            console.log(`Getting messages for chat ${chatId}`);

            return new Promise((resolve) => {
                const messagesQuery = query(ref(database, path), orderByChild('timestamp'), limitToLast(limit));

                const handler = onValue(messagesQuery, (snapshot) => {
                    const messagesData = snapshot.val() || {};

                    // Преобразуем в массив и сортируем
                    const messages = Object.values(messagesData);
                    messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

                    // КРИТИЧЕСКИ ВАЖНО: Обрабатываем каждое сообщение
                    const processedMessages = messages.map(message => {
                        // 1. Преобразуем senderId в строку
                        const senderId = String(message.senderId || '');

                        // 2. Определяем владельца сообщения
                        const isFromCurrentUser = senderId === myUserId;

                        return {
                            ...message, senderId, isFromCurrentUser, // 3. Гарантируем наличие имени отправителя
                            senderName: message.senderName || `Пользователь ${senderId}`
                        };
                    });

                    console.log(`Loaded ${processedMessages.length} messages for chat ${chatId}`);
                    resolve(processedMessages);
                }, (error) => {
                    console.error(`Error getting messages for chat ${chatId}:`, error);
                    resolve([]);
                });

                // Сохраняем слушателя для последующей отписки
                this.listeners[listenerKey] = {path, event: 'value', handler};
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
                delete this.listeners[listenerKey];
            }

            const path = `chats/${chatId}`;

            return new Promise((resolve) => {
                const chatRef = ref(database, path);

                const handler = onValue(chatRef, (snapshot) => {
                    const chatData = snapshot.val() || null;

                    // Если есть данные о последнем сообщении, преобразуем senderId
                    if (chatData && chatData.lastMessage && chatData.lastMessage.senderId) {
                        chatData.lastMessage.senderId = String(chatData.lastMessage.senderId);
                    }

                    resolve(chatData);
                }, (error) => {
                    console.error(`Error getting chat info for ${chatId}:`, error);
                    resolve(null);
                });

                // Сохраняем слушателя для последующей отписки
                this.listeners[listenerKey] = {path, event: 'value', handler};
            });
        } catch (error) {
            console.error('Error in getChatInfo:', error);
            return null;
        }
    }

    // Отметить сообщения как прочитанные
    async markMessagesAsRead(chatId) {
        // Инициализируем, если не инициализированы
        if (!this.initialized || !this.currentUser) {
            const initResult = await this.initialize();
            if (!initResult) return;
        }

        if (!this.currentUser || !this.currentUser.id) return;
        if (!chatId) return;

        // ВСЕГДА используем строковый ID
        const myUserId = this.getCurrentUserId();

        try {
            const messagesRef = ref(database, `messages/${chatId}`);
            const snapshot = await get(messagesRef);

            if (!snapshot.exists()) return;

            const updates = {};
            let updateCount = 0;

            // Отмечаем все непрочитанные сообщения
            snapshot.forEach((childSnapshot) => {
                const message = childSnapshot.val() || {};

                // Преобразуем ID отправителя в строку
                const messageSenderId = String(message.senderId || '');

                // Пропускаем свои сообщения или уже прочитанные
                if (messageSenderId === myUserId || (message.read && message.read[myUserId])) {
                    return;
                }

                // Добавляем в очередь на обновление
                updates[`messages/${chatId}/${childSnapshot.key}/read/${myUserId}`] = true;
                updateCount++;
            });

            // Если есть что обновлять
            if (updateCount > 0) {
                await update(ref(database), updates);
                console.log(`Marked ${updateCount} messages as read in chat ${chatId}`);
            }
        } catch (error) {
            console.warn('Error marking messages as read:', error);
        }
    }
}

// Создаем и экспортируем экземпляр сервиса
const chatService = new ChatService();
export default chatService;