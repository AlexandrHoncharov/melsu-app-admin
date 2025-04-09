// File: src/services/chatService.js
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
import * as Device from 'expo-device';
import { Platform } from 'react-native';

class ChatService {
    constructor() {
        this.currentUser = null;
        this.initialized = false;
        this.listeners = {};
        this.forcedUserId = null; // Для принудительного задания ID пользователя
        this.initializationInProgress = false; // Флаг для предотвращения рекурсии
        this.deviceToken = null; // Токен устройства для push-уведомлений
        this.unreadCountCallback = null; // Callback для обновления счетчика непрочитанных сообщений
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

            // Загружаем сохраненный токен устройства, если есть
            try {
                const deviceTokenString = await AsyncStorage.getItem('devicePushToken');
                if (deviceTokenString) {
                    this.deviceToken = deviceTokenString;
                }
            } catch (tokenError) {
                console.warn('Error loading device token:', tokenError);
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

    // Устанавливает токен устройства для push-уведомлений
    async setDeviceToken(token) {
        if (!token) return false;

        this.deviceToken = token;

        // Сохраняем токен в AsyncStorage
        try {
            await AsyncStorage.setItem('devicePushToken', token);
        } catch (error) {
            console.warn('Error saving device token to AsyncStorage:', error);
        }

        // Если пользователь инициализирован, регистрируем токен на сервере
        if (this.initialized && this.currentUser) {
            try {
                await this.registerDeviceToken(token);
                return true;
            } catch (error) {
                console.warn('Error registering device token:', error);
                return false;
            }
        }

        return true;
    }

    // Улучшенная версия метода registerDeviceToken в chatService.js
    // Добавляет проверку на существующие токены перед регистрацией

    async registerDeviceToken(token) {
        if (!token || !this.initialized || !this.currentUser) {
            return false;
        }

        // Проверяем, не такой ли же токен у нас уже сохранен
        if (this.deviceToken === token) {
            console.log('Token already registered in memory, skipping registration');

            // Проверяем токен в AsyncStorage
            try {
                const storedToken = await AsyncStorage.getItem('devicePushToken');
                if (storedToken === token) {
                    console.log('Token already stored in AsyncStorage');
                    return true; // Токен уже зарегистрирован
                }
            } catch (error) {
                console.warn('Error checking stored token:', error);
            }
        }

        try {
            console.log(`Registering device token: ${token.substring(0, 10)}...`);

            // Добавляем флаг для сервера, чтобы он заменил существующие токены
            const response = await apiClient.post('/device/register', {
                token: token,
                platform: Platform.OS,
                device_name: Device.modelName || 'Unknown device',
                replace_existing: true // Этот флаг будет использован на сервере
            });

            // Запоминаем успешный токен в памяти
            this.deviceToken = token;

            // Сохраняем в AsyncStorage
            try {
                await AsyncStorage.setItem('devicePushToken', token);
                console.log('Device token saved to AsyncStorage');
            } catch (storageError) {
                console.warn('Error saving token to AsyncStorage:', storageError);
            }

            console.log('Device token registered successfully:', response.data);
            return true;
        } catch (error) {
            console.warn('Error registering device token on server:', error);
            return false;
        }
    }

    // Удаляет токен устройства с сервера
    // Improved unregisterDeviceToken method
    async unregisterDeviceToken() {
        try {
            console.log('Attempting to unregister ALL device tokens for the current user...');

            // Even if we don't have a device token in memory, we should still
            // attempt to clear tokens from the server to be safe
            if (!this.deviceToken) {
                console.log('No device token in memory, but still clearing server tokens');
            } else {
                console.log(`Local device token to unregister: ${this.deviceToken.substring(0, 10)}...`);
            }

            // Always make the API call to unregister tokens
            // Send the current token if we have it, but the server will remove ALL tokens for this user
            const response = await apiClient.post('/device/unregister', {
                token: this.deviceToken || 'force_all_tokens_removal'
            });

            console.log('Device token unregistration response:', response.data);

            // Clear tokens from local storage regardless of API response
            try {
                await AsyncStorage.removeItem('devicePushToken');
                console.log('Device token removed from AsyncStorage');
            } catch (storageError) {
                console.warn('Error removing device token from AsyncStorage:', storageError);
            }

            // Reset our local reference
            this.deviceToken = null;

            return true;
        } catch (error) {
            console.warn('Error unregistering device token from server:', error);

            // Even on error, clear local data
            try {
                await AsyncStorage.removeItem('devicePushToken');
                this.deviceToken = null;
                console.log('Local device token cleared despite server error');
            } catch (storageError) {
                console.warn('Error removing device token from AsyncStorage:', storageError);
            }

            return false;
        }
    }

    // Полный сброс состояния сервиса (вызывается при выходе из аккаунта)
    async reset() {
        console.log('Full reset of ChatService initiated');

        // Важно: сначала отменяем регистрацию токена устройства
        if (this.deviceToken) {
            try {
                await this.unregisterDeviceToken();
            } catch (tokenError) {
                console.warn('Error unregistering device token during reset:', tokenError);
            }
        }

        // Отписываемся от всех слушателей Firebase
        this.cleanup();

        // Сбрасываем внутреннее состояние
        this.currentUser = null;
        this.initialized = false;
        this.forcedUserId = null;
        this.initializationInProgress = false;
        this.deviceToken = null;
        this.unreadCountCallback = null;

        // Выход из Firebase Auth
        try {
            if (auth.currentUser) {
                await auth.signOut();
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

    // Создание группового чата для студенческой группы
    async createGroupChat(groupName) {
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

        // Только преподаватели могут создавать групповые чаты
        if (this.currentUser.role !== 'teacher') {
            throw new Error('Only teachers can create group chats');
        }

        if (!groupName) {
            throw new Error('Group name is required');
        }

        const myUserId = this.getCurrentUserId();
        console.log(`Creating group chat for group ${groupName} by teacher ${myUserId}`);

        try {
            // Генерируем уникальный ID для группового чата
            const chatId = `group_${groupName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
            const displayName = `Группа ${groupName}`;

            // Сначала получаем всех студентов этой группы
            let students = [];
            try {
                const response = await apiClient.get('/users', { params: { role: 'student', group: groupName } });
                students = response.data || [];
                console.log(`Found ${students.length} students in group ${groupName}`);
            } catch (error) {
                console.warn(`Error fetching students for group ${groupName}:`, error);
                // Продолжаем даже если не можем получить студентов - мы создадим пустой групповой чат,
                // к которому студенты смогут присоединиться позже, когда войдут в приложение
            }

            // Подготавливаем объект участников
            const participants = { [myUserId]: true };
            students.forEach(student => {
                if (student.id) {
                    participants[String(student.id)] = true;
                }
            });

            // Создаем групповой чат в Firebase
            const chatRef = ref(database, `chats/${chatId}`);
            await set(chatRef, {
                id: chatId,
                type: 'group',
                name: displayName,
                groupCode: groupName,
                createdBy: myUserId,
                createdAt: serverTimestamp(),
                participants: participants
            });

            // Добавляем чат в список чатов создателя
            await set(ref(database, `userChats/${myUserId}/${chatId}`), {
                id: chatId,
                type: 'group',
                name: displayName,
                groupCode: groupName,
                updatedAt: serverTimestamp()
            });

            // Добавляем чат в списки чатов всех студентов
            for (const student of students) {
                if (student.id) {
                    await set(ref(database, `userChats/${String(student.id)}/${chatId}`), {
                        id: chatId,
                        type: 'group',
                        name: displayName,
                        groupCode: groupName,
                        updatedAt: serverTimestamp()
                    });
                }
            }

            // Отправляем приветственное сообщение
            const messageData = {
                id: push(ref(database, `messages/${chatId}`)).key,
                senderId: myUserId,
                senderName: this.currentUser.fullName || this.currentUser.username || `Преподаватель`,
                text: `Добро пожаловать в групповой чат для группы ${groupName}!`,
                timestamp: serverTimestamp(),
                read: { [myUserId]: true }
            };

            await set(ref(database, `messages/${chatId}/${messageData.id}`), messageData);

            // Обновляем информацию о последнем сообщении
            const lastMessageInfo = {
                id: messageData.id,
                text: messageData.text.length > 30 ? `${messageData.text.substring(0, 30)}...` : messageData.text,
                senderId: myUserId,
                timestamp: serverTimestamp()
            };

            await update(chatRef, {
                lastMessage: lastMessageInfo
            });

            // Обновляем информацию о чате у всех участников
            for (const userId of Object.keys(participants)) {
                await update(ref(database, `userChats/${userId}/${chatId}`), {
                    lastMessage: lastMessageInfo,
                    updatedAt: serverTimestamp()
                });
            }

            console.log(`Group chat ${chatId} successfully created for group ${groupName}`);
            return chatId;
        } catch (error) {
            console.error('Error creating group chat:', error);
            throw error;
        }
    }

    // Отправка сообщения в чат
    async sendMessage(chatId, text) {
        // Инициализация, если не инициализированы
        if (!this.initialized || !this.currentUser) {
            const initResult = await this.initialize();
            if (!initResult) {
                throw new Error('User not initialized. Cannot send message.');
            }
        }

        if (!chatId || !text.trim()) {
            throw new Error('Chat ID or message text is empty');
        }

        // ВСЕГДА используем строковый ID
        const myUserId = this.getCurrentUserId();
        const senderName = this.currentUser.fullName || this.currentUser.username || `Пользователь ${myUserId}`;

        console.log(`Sending message from ${myUserId} (${senderName}) to chat ${chatId}`);

        try {
            // Создаем новое сообщение
            const newMessageRef = push(ref(database, `messages/${chatId}`));
            const messageId = newMessageRef.key;

            // Сохраняем сообщение
            const messageData = {
                id: messageId,
                senderId: myUserId,
                senderName: senderName,
                text,
                timestamp: serverTimestamp(),
                read: {[myUserId]: true}
            };

            await set(newMessageRef, messageData);

            // Обновляем информацию о последнем сообщении в чате
            const lastMessageInfo = {
                id: messageId,
                text: text.length > 30 ? `${text.substring(0, 30)}...` : text,
                senderId: myUserId,
                timestamp: serverTimestamp()
            };

            await update(ref(database, `chats/${chatId}`), {
                lastMessage: lastMessageInfo
            });

            // Получаем участников чата и обновляем их информацию о чате
            const chatSnapshot = await get(ref(database, `chats/${chatId}/participants`));
            const participants = chatSnapshot.val() || {};

            // Получаем информацию о чате для уведомлений
            let chatName = '';
            if (chatId.startsWith('group_')) {
                const chatSnapshot = await get(ref(database, `chats/${chatId}`));
                const chatData = chatSnapshot.val();
                chatName = chatData?.name || 'Групповой чат';
            } else {
                chatName = 'Личный чат';
            }

            // Обработка каждого участника
            const notificationPromises = [];

            for (const userId of Object.keys(participants)) {
                // Обновляем информацию о чате у пользователя
                await update(ref(database, `userChats/${userId}/${chatId}`), {
                    lastMessage: lastMessageInfo, updatedAt: serverTimestamp()
                });

                // Отправляем push-уведомление другим участникам
                if (userId !== myUserId) {
                    // Создаем превью сообщения (укороченная версия для уведомления)
                    const messagePreview = text.length > 50 ? `${text.substring(0, 50)}...` : text;

                    // Добавляем имя чата к уведомлению
                    const notificationSenderName = `${senderName} (${chatName})`;

                    // Отправляем уведомление асинхронно, не ожидая завершения
                    notificationPromises.push(
                        this.sendNotificationToUser(userId, chatId, messagePreview, notificationSenderName)
                            .catch(e => {
                                // Эта ошибка уже будет обработана внутри sendNotificationToUser
                                // Здесь мы просто предотвращаем распространение исключения дальше
                                return { success: false, error: e.message };
                            })
                    );
                }
            }

            // Ждем завершения всех уведомлений, но игнорируем ошибки
            if (notificationPromises.length > 0) {
                try {
                    await Promise.allSettled(notificationPromises);
                } catch (notifError) {
                    // Игнорируем любые ошибки от уведомлений
                    console.log('Some notifications may have failed, but message was sent successfully');
                }
            }

            console.log(`Message sent successfully to chat ${chatId}`);
            return messageId;
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    // Отправка уведомления пользователю
    async sendNotificationToUser(recipientId, chatId, messagePreview, senderName) {
        try {
            // Проверяем, что аргументы переданы корректно
            if (!recipientId || !chatId || !messagePreview) {
                console.log(`Skipping notification: Invalid arguments for user ${recipientId}`);
                return {success: false, skipped: true, reason: 'invalid_arguments'};
            }

            // Проверяем, не отправляем ли мы сообщение самому себе
            const myUserId = this.getCurrentUserId();
            if (recipientId === myUserId) {
                console.log(`Skipping notification: Cannot send to self (${recipientId})`);
                return {success: false, skipped: true, reason: 'self_notification'};
            }

            // Отправляем запрос на сервер
            const response = await apiClient.post('/chat/send-notification', {
                recipient_id: recipientId,
                chat_id: chatId,
                message_preview: messagePreview,
                sender_name: senderName
            });

            // Если ответ успешный, но получатель не найден или у него нет токенов
            if (response.data?.status === 'no_tokens') {
                console.log(`User ${recipientId} has no registered devices for notifications`);
                return {success: false, skipped: true, reason: 'no_tokens'};
            }

            // Успешная отправка
            return {success: true, receipt: response.data};
        } catch (error) {
            // Проверка на специфическую ошибку "No device tokens"
            if (error.message && (
                error.message.includes('No device tokens') ||
                error.message.includes('not found for recipient')
            )) {
                console.log(`User ${recipientId} has no registered devices for notifications`);
                return {success: false, skipped: true, reason: 'no_tokens'};
            }

            // Для остальных ошибок - логирование, но без бросания исключения
            console.log(`Failed to send notification to user ${recipientId}: ${error.message}`);
            return {success: false, error: error.message};
        }
    }

    // Получение списка чатов пользователя
    async getUserChats() {
        try {
            // Проверяем необходимость инициализации
            if (!this.initialized || !this.currentUser) {
                try {
                    const initResult = await this.initialize();
                    if (!initResult) {
                        // Даже если инициализация не удалась, проверяем, есть ли у нас данные пользователя
                        if (!this.currentUser || !this.currentUser.id) {
                            console.error('No current user available after initialization attempt');
                            return [];
                        }
                        // Продолжаем работу, если у нас есть ID пользователя, даже если Firebase аутентификация не удалась
                        console.log('Continuing with user chats despite initialization issues');
                    }
                } catch (initError) {
                    console.error('Error during initialization:', initError);
                    // Проверяем, есть ли у нас данные пользователя несмотря на ошибку
                    if (!this.currentUser || !this.currentUser.id) {
                        return [];
                    }
                    console.log('Continuing with user chats despite initialization error');
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
        } catch (outerError) {
            console.error('Unexpected error in getUserChats:', outerError);
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

                // Notify about unread count change if callback exists
                if (this.unreadCountCallback) {
                    this.getUnreadMessageCount(chatId).then(count => {
                        this.refreshUnreadMessagesCount();
                    });
                }
            }
        } catch (error) {
            console.warn('Error marking messages as read:', error);
        }
    }

    /**
     * Get unread message count for a specific chat
     * @param {string} chatId - The chat ID
     * @returns {Promise<number>} - Number of unread messages
     */
    async getUnreadMessageCount(chatId) {
        if (!this.initialized || !this.currentUser) {
            await this.initialize();
        }

        if (!chatId || !this.currentUser || !this.currentUser.id) {
            return 0;
        }

        const myUserId = this.getCurrentUserId();

        try {
            const messagesRef = ref(database, `messages/${chatId}`);
            const snapshot = await get(messagesRef);

            if (!snapshot.exists()) return 0;

            let unreadCount = 0;

            // Count messages that are not from current user and not marked as read
            snapshot.forEach((childSnapshot) => {
                const message = childSnapshot.val() || {};

                // Convert sender ID to string for comparison
                const messageSenderId = String(message.senderId || '');

                // Only count if: not from current user AND not read by current user
                if (messageSenderId !== myUserId && (!message.read || !message.read[myUserId])) {
                    unreadCount++;
                }
            });

            return unreadCount;
        } catch (error) {
            console.error(`Error getting unread count for chat ${chatId}:`, error);
            return 0;
        }
    }

    /**
     * Get total unread count across all chats
     * @returns {Promise<number>} - Total unread count
     */
    async getTotalUnreadCount() {
        if (!this.initialized || !this.currentUser) {
            await this.initialize();
        }

        if (!this.currentUser || !this.currentUser.id) {
            return 0;
        }

        try {
            // Get all user chats
            const chats = await this.getUserChats();

            // Calculate total unread messages
            let totalUnread = 0;

            // Process each chat
            for (const chat of chats) {
                try {
                    const unreadForChat = await this.getUnreadMessageCount(chat.id);
                    totalUnread += unreadForChat;
                } catch (error) {
                    console.error(`Error getting unread count for chat ${chat.id}:`, error);
                }
            }

            return totalUnread;
        } catch (error) {
            console.error('Error getting total unread count:', error);
            return 0;
        }
    }

    /**
     * Setup listener for unread messages across all chats
     * @param {Function} callback - Function to call with updated unread count
     */
    async setupUnreadMessagesListener(callback) {
        if (!callback) return;

        // Save callback for future use
        this.unreadCountCallback = callback;

        if (!this.initialized || !this.currentUser) {
            await this.initialize();
        }

        if (!this.currentUser || !this.currentUser.id) return;

        const myUserId = this.getCurrentUserId();

        // Remove any existing listener
        this.removeUnreadMessagesListener();

        try {
            // Listen for changes to user's chats
            const userChatsRef = ref(database, `userChats/${myUserId}`);

            const handler = onValue(userChatsRef, async (snapshot) => {
                if (!snapshot.exists()) {
                    callback(0);
                    return;
                }

                // Call the refresh function to calculate and update count
                this.refreshUnreadMessagesCount();
            });

            // Save listener for later cleanup
            this.listeners.unreadMessages = {
                path: `userChats/${myUserId}`,
                event: 'value',
                handler
            };

            console.log('Setup unread messages listener');

            // Initial count update
            this.refreshUnreadMessagesCount();
        } catch (error) {
            console.error('Error setting up unread messages listener:', error);
        }
    }

    /**
     * Refresh unread messages count and call callback
     */
    async refreshUnreadMessagesCount() {
        if (!this.unreadCountCallback || !this.currentUser) return;

        try {
            const totalUnread = await this.getTotalUnreadCount();
            this.unreadCountCallback(totalUnread);
        } catch (error) {
            console.error('Error refreshing unread count:', error);
        }
    }

    /**
     * Remove listener for unread messages
     */
    removeUnreadMessagesListener() {
        if (this.listeners.unreadMessages) {
            try {
                // Get reference to the listener's path
                const listenerRef = ref(database, this.listeners.unreadMessages.path);

                // Unsubscribe from the event
                off(listenerRef, this.listeners.unreadMessages.event, this.listeners.unreadMessages.handler);

                // Remove the listener from our list
                delete this.listeners.unreadMessages;

                // Clear callback
                this.unreadCountCallback = null;

                console.log('Removed unread messages listener');
            } catch (error) {
                console.error('Error removing unread messages listener:', error);
            }
        }
    }

    /**
     * Set up a listener for a specific chat's messages
     * @param {string} chatId - The chat ID to listen for
     * @param {Function} callback - Callback function to execute when messages change
     */
    async setupChatMessageListener(chatId, callback) {
        if (!chatId || !callback) return;

        // Remove any existing listener first
        this.removeChatMessageListener(chatId);

        try {
            const messagesRef = ref(database, `messages/${chatId}`);
            const handler = onValue(messagesRef, (snapshot) => {
                // Just trigger the callback - the component will handle fetching the count
                callback();
            });

            // Save the listener for cleanup
            this.listeners[`chat_messages_${chatId}`] = {
                path: `messages/${chatId}`,
                event: 'value',
                handler
            };

            console.log(`Set up message listener for chat ${chatId}`);
        } catch (error) {
            console.error(`Error setting up message listener for chat ${chatId}:`, error);
        }
    }

    /**
     * Remove message listener for a specific chat
     * @param {string} chatId - The chat ID
     */
    removeChatMessageListener(chatId) {
        const listenerKey = `chat_messages_${chatId}`;

        if (this.listeners[listenerKey]) {
            try {
                const listenerRef = ref(database, this.listeners[listenerKey].path);
                off(listenerRef, this.listeners[listenerKey].event, this.listeners[listenerKey].handler);
                delete this.listeners[listenerKey];
                console.log(`Removed message listener for chat ${chatId}`);
            } catch (error) {
                console.error(`Error removing message listener for chat ${chatId}:`, error);
            }
        }
    }
}

// Создаем и экспортируем экземпляр сервиса
const chatService = new ChatService();
export default chatService;