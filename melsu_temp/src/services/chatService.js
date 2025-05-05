// File: src/services/chatService.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    auth, database,
    ref, get, set, update, push, query, limitToLast,
    orderByChild, startAfter, onValue, off, serverTimestamp,
    signInWithCustomToken, signInAnonymously
} from '../config/firebase';
import apiClient from '../api/apiClient';
import * as Device from 'expo-device';
import {Platform} from 'react-native';
import authUtils from '../utils/authUtils';

// Local storage для кэширования сообщений
const MESSAGE_CACHE_KEY = 'chat_message_cache';
const CHAT_CACHE_KEY = 'chat_cache';

class ChatService {
    constructor() {
        this.currentUser = null;
        this.initialized = false;
        this.listeners = {};
        this.forcedUserId = null; // Для принудительного задания ID пользователя
        this.initializationInProgress = false; // Флаг для предотвращения рекурсии
        this.deviceToken = null; // Токен устройства для push-уведомлений
        this.unreadCountCallback = null; // Callback для обновления счетчика непрочитанных сообщений
        this.messageCache = {}; // Локальный кэш сообщений для каждого чата
        this.chatCache = {}; // Локальный кэш данных чатов
        this.firebaseInitError = false; // Флаг ошибки инициализации Firebase
    }

    /**
     * Загрузка кэша сообщений из локального хранилища
     */
    async loadMessageCache() {
        try {
            const cacheJson = await AsyncStorage.getItem(MESSAGE_CACHE_KEY);
            if (cacheJson) {
                this.messageCache = JSON.parse(cacheJson);
                console.log('Кэш сообщений загружен из хранилища');
            }
        } catch (e) {
            console.warn('Ошибка при загрузке кэша сообщений:', e);
            this.messageCache = {};
        }
    }

    /**
     * Сохранение кэша сообщений в локальное хранилище
     */
    async saveMessageCache() {
        try {
            await AsyncStorage.setItem(MESSAGE_CACHE_KEY, JSON.stringify(this.messageCache));
        } catch (e) {
            console.warn('Ошибка при сохранении кэша сообщений:', e);
        }
    }

    /**
     * Загрузка кэша чатов из локального хранилища
     */
    async loadChatCache() {
        try {
            const cacheJson = await AsyncStorage.getItem(CHAT_CACHE_KEY);
            if (cacheJson) {
                this.chatCache = JSON.parse(cacheJson);
                console.log('Кэш чатов загружен из хранилища');
            }
        } catch (e) {
            console.warn('Ошибка при загрузке кэша чатов:', e);
            this.chatCache = {};
        }
    }

    /**
     * Сохранение кэша чатов в локальное хранилище
     */
    async saveChatCache() {
        try {
            await AsyncStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(this.chatCache));
        } catch (e) {
            console.warn('Ошибка при сохранении кэша чатов:', e);
        }
    }

    /**
     * Получение полной информации о преподавателе из специального API
     * @param {string|number} userId - ID пользователя преподавателя
     * @returns {Promise<Object|null>} - Данные преподавателя или null при ошибке
     */
    async getTeacherInfo(userId) {
        if (!userId) return null;

        try {
            console.log(`Запрашиваем данные преподавателя с ID: ${userId}`);
            const response = await apiClient.get(`/teachers/${userId}`);
            console.log(`Данные преподавателя получены:`, response.data);
            return response.data;
        } catch (error) {
            // Если ошибка 404, значит преподаватель не найден в таблице Teacher
            if (error.response && error.response.status === 404) {
                console.log(`Преподаватель с ID ${userId} не найден в таблице Teacher`);
                return null;
            }

            // Для других ошибок - логируем и возвращаем null
            console.error(`Ошибка при получении данных преподавателя ${userId}:`, error);
            return null;
        }
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
            // Сбрасываем флаг ошибки Firebase при каждой новой попытке инициализации
            this.firebaseInitError = false;

            // Устанавливаем флаг, что инициализация в процессе
            this.initializationInProgress = true;

            // Загружаем кэши
            await Promise.all([
                this.loadMessageCache(),
                this.loadChatCache()
            ]);

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

            // Используем authUtils для Firebase аутентификации
            try {
                const authSuccess = await authUtils.syncFirebaseAuth();
                if (authSuccess) {
                    console.log('Firebase authentication successful via authUtils');
                } else {
                    console.warn('Firebase authentication failed via authUtils, but continuing');
                    // Не устанавливаем флаг ошибки, так как это не критично
                }
            } catch (authError) {
                console.error('Firebase authentication error:', authError);
                // Отмечаем наличие ошибки Firebase, но продолжаем работу
                if (authError.message && (
                    authError.message.includes('Firebase') ||
                    authError.message.includes('auth') ||
                    authError.message.includes('Component')
                )) {
                    this.firebaseInitError = true;
                }
                // Продолжаем инициализацию даже при ошибке Firebase
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
                // Проверяем, связана ли ошибка с Firebase
                if (dbError.message && (
                    dbError.message.includes('Firebase') ||
                    dbError.message.includes('auth') ||
                    dbError.message.includes('Component')
                )) {
                    this.firebaseInitError = true;
                }
                // Продолжаем работу даже при ошибке записи
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

            // Проверяем, связана ли ошибка с Firebase
            if (error.message && (
                error.message.includes('Firebase') ||
                error.message.includes('auth') ||
                error.message.includes('Component')
            )) {
                this.firebaseInitError = true;
            }

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
        this.firebaseInitError = false;

        // Выход из Firebase Auth
        try {
            await authUtils.signOut();
        } catch (error) {
            console.warn('Error signing out from Firebase Auth:', error);
        }

        // Очищаем все обработчики событий
        this.listeners = {};

        // Сохраняем кэши для будущего использования
        await this.saveMessageCache();
        await this.saveChatCache();

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
                console.log(`Запрашиваем данные пользователя с ID: ${otherUserId}`);
                const response = await apiClient.get(`/users/${otherUserId}`);
                otherUserInfo = response.data;
                console.log(`Данные пользователя получены:`, otherUserInfo);

                // Для преподавателей проверяем специфические поля
                if (otherUserInfo.role === 'teacher') {
                    // ВАЖНОЕ ИСПРАВЛЕНИЕ: Если fullName есть, используем его
                    if (otherUserInfo.fullName) {
                        console.log(`Используем fullName преподавателя: ${otherUserInfo.fullName}`);
                    }
                    // Если также есть teacher_name, логируем это для отладки
                    if (otherUserInfo.teacher_name) {
                        console.log(`В ответе также присутствует teacher_name: ${otherUserInfo.teacher_name}`);
                    }
                }
            } catch (apiError) {
                console.warn(`Failed to get user ${otherUserId} data from API:`, apiError);

                // Пробуем Firebase в качестве резервного варианта
                try {
                    const userSnapshot = await get(ref(database, `users/${otherUserId}`));
                    if (userSnapshot.exists()) {
                        otherUserInfo = userSnapshot.val();
                        console.log(`Получены данные пользователя из Firebase:`, otherUserInfo);
                    }
                } catch (fbError) {
                    console.warn(`Failed to get user ${otherUserId} data from Firebase:`, fbError);
                }
            }

            // Если не удалось получить информацию, создаем заглушку с минимальными данными
            if (!otherUserInfo) {
                otherUserInfo = {
                    id: otherUserId,
                    role: 'unknown'
                };
            }

            // Определение имени пользователя
            let otherUserName = '';

            // СПЕЦИАЛЬНАЯ ОБРАБОТКА ДЛЯ ПРЕПОДАВАТЕЛЕЙ
            if (otherUserInfo.role === 'teacher') {
                try {
                    // Получаем полную информацию о преподавателе через специальный API-эндпоинт
                    const teacherInfo = await this.getTeacherInfo(otherUserId);

                    // Если получили данные из Teacher
                    if (teacherInfo && teacherInfo.name) {
                        otherUserName = teacherInfo.name;
                        console.log(`Получено имя преподавателя из таблицы Teacher: ${otherUserName}`);

                        // Также обновляем информацию о кафедре и должности
                        if (teacherInfo.department) {
                            otherUserInfo.department = teacherInfo.department;
                        }
                        if (teacherInfo.position) {
                            otherUserInfo.position = teacherInfo.position;
                        }
                    } else if (otherUserInfo.fullName) {
                        // Если не нашли в Teacher, но есть fullName в User
                        otherUserName = otherUserInfo.fullName;
                        console.log(`Используем fullName из User: ${otherUserName}`);
                    } else {
                        // Совсем не нашли имя - используем заглушку
                        otherUserName = `Преподаватель ${otherUserId}`;
                        console.log(`Не удалось получить имя преподавателя, используем: ${otherUserName}`);
                    }
                } catch (e) {
                    console.error(`Ошибка при получении данных преподавателя:`, e);
                    if (otherUserInfo.fullName) {
                        otherUserName = otherUserInfo.fullName;
                    } else {
                        otherUserName = `Преподаватель ${otherUserId}`;
                    }
                }
            } else {
                // Обычный код для не-преподавателей
                if (otherUserInfo.fullName) {
                    otherUserName = otherUserInfo.fullName;
                } else if (otherUserInfo.name) {
                    otherUserName = otherUserInfo.name;
                } else if (otherUserInfo.displayName) {
                    otherUserName = otherUserInfo.displayName;
                } else {
                    otherUserName = `Пользователь ${otherUserId}`;
                }
            }

            // ИСПРАВЛЕНИЕ: Добавление дополнительной информации
            let otherUserDetails = '';
            if (otherUserInfo.role === 'student' && otherUserInfo.group) {
                otherUserDetails = ` (${otherUserInfo.group})`;
            } else if (otherUserInfo.role === 'teacher') {
                if (otherUserInfo.department) {
                    otherUserDetails = ` (${otherUserInfo.department})`;
                } else if (otherUserInfo.position) {
                    otherUserDetails = ` (${otherUserInfo.position})`;
                }
            }

            // Объединяем имя и детали
            const otherUserDisplayName = otherUserName + otherUserDetails;

            console.log(`Итоговое отображаемое имя пользователя: ${otherUserDisplayName}`);

            try {
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

                    // Добавляем чат в список чатов текущего пользователя
                    await set(ref(database, `userChats/${myUserId}/${chatId}`), {
                        id: chatId,
                        type: 'personal',
                        withUser: otherUserId,
                        withUserRole: otherUserInfo.role || 'unknown',
                        withUserName: otherUserDisplayName,
                        withUserGroup: otherUserInfo.group || '',
                        withUserDepartment: otherUserInfo.department || '',
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
                        withUserGroup: this.currentUser.group || '',
                        withUserDepartment: this.currentUser.department || '',
                        updatedAt: serverTimestamp()
                    });

                    // Кэшируем информацию о чате
                    this.chatCache[chatId] = {
                        id: chatId,
                        type: 'personal',
                        participants: {
                            [myUserId]: true,
                            [otherUserId]: true
                        },
                        withUser: otherUserId,
                        withUserName: otherUserDisplayName,
                        withUserRole: otherUserInfo.role || 'unknown',
                        withUserGroup: otherUserInfo.group || '',
                        withUserDepartment: otherUserInfo.department || '',
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };

                    // Сохраняем кэш
                    await this.saveChatCache();

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

                            // Если имя поменялось или отсутствует, обновляем
                            if (!chatData.withUserName || chatData.withUserName === `Пользователь ${otherUserId}` ||
                                chatData.withUserName.startsWith('Преподаватель ')) {
                                console.log(`Updating other user name to: ${otherUserDisplayName}`);
                                await update(myUserChatRef, {
                                    withUserName: otherUserDisplayName,
                                    withUserGroup: otherUserInfo.group || '',
                                    withUserDepartment: otherUserInfo.department || '',
                                    updatedAt: serverTimestamp()
                                });
                            }

                            // Обновляем кэш
                            this.chatCache[chatId] = {
                                ...this.chatCache[chatId] || {},
                                ...chatData,
                                withUserName: otherUserDisplayName,
                                withUserGroup: otherUserInfo.group || '',
                                withUserDepartment: otherUserInfo.department || '',
                                updatedAt: Date.now()
                            };
                        }
                    } catch (updateError) {
                        console.warn('Error updating chat name:', updateError);
                    }
                }
            } catch (firebaseError) {
                console.warn('Firebase error creating chat:', firebaseError);

                // Если Firebase недоступен, используем только локальный кэш
                this.chatCache[chatId] = {
                    id: chatId,
                    type: 'personal',
                    participants: {
                        [myUserId]: true,
                        [otherUserId]: true
                    },
                    withUser: otherUserId,
                    withUserName: otherUserDisplayName,
                    withUserRole: otherUserInfo.role || 'unknown',
                    withUserGroup: otherUserInfo.group || '',
                    withUserDepartment: otherUserInfo.department || '',
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };

                // Сохраняем кэш
                await this.saveChatCache();

                console.log(`Chat created in local cache due to Firebase error: ${chatId}`);
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
                const response = await apiClient.get('/users', {params: {role: 'student', group: groupName}});
                students = response.data || [];
                console.log(`Found ${students.length} students in group ${groupName}`);
            } catch (error) {
                console.warn(`Error fetching students for group ${groupName}:`, error);
                // Продолжаем даже если не можем получить студентов - мы создадим пустой групповой чат,
                // к которому студенты смогут присоединиться позже, когда войдут в приложение
            }

            // Подготавливаем объект участников
            const participants = {[myUserId]: true};
            students.forEach(student => {
                if (student.id) {
                    participants[String(student.id)] = true;
                }
            });

            try {
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
                const welcomeMessageRef = push(ref(database, `messages/${chatId}`));
                const messageId = welcomeMessageRef.key;

                const messageData = {
                    id: messageId,
                    senderId: myUserId,
                    senderName: this.currentUser.fullName || this.currentUser.username || `Преподаватель`,
                    text: `Добро пожаловать в групповой чат для группы ${groupName}!`,
                    timestamp: serverTimestamp(),
                    read: {[myUserId]: true}
                };

                await set(ref(database, `messages/${chatId}/${messageId}`), messageData);

                // Обновляем информацию о последнем сообщении
                const lastMessageInfo = {
                    id: messageId,
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

                // Кэшируем групповой чат
                this.chatCache[chatId] = {
                    id: chatId,
                    type: 'group',
                    name: displayName,
                    groupCode: groupName,
                    createdBy: myUserId,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    participants: participants,
                    lastMessage: {
                        id: messageId,
                        text: messageData.text.length > 30 ? `${messageData.text.substring(0, 30)}...` : messageData.text,
                        senderId: myUserId,
                        timestamp: Date.now()
                    }
                };

                // Кэшируем первое сообщение
                if (!this.messageCache[chatId]) {
                    this.messageCache[chatId] = [];
                }

                this.messageCache[chatId].push({
                    ...messageData,
                    timestamp: Date.now(),
                    isFromCurrentUser: true
                });

                // Сохраняем кэши
                await Promise.all([
                    this.saveChatCache(),
                    this.saveMessageCache()
                ]);

                console.log(`Group chat ${chatId} successfully created for group ${groupName}`);
            } catch (firebaseError) {
                console.warn('Firebase error creating group chat:', firebaseError);

                // Если Firebase недоступен, используем только локальный кэш
                const messageId = `mock-msg-${Date.now()}`;
                const welcomeMessage = {
                    id: messageId,
                    senderId: myUserId,
                    senderName: this.currentUser.fullName || this.currentUser.username || `Преподаватель`,
                    text: `Добро пожаловать в групповой чат для группы ${groupName}!`,
                    timestamp: Date.now(),
                    read: {[myUserId]: true},
                    isFromCurrentUser: true
                };

                // Кэшируем групповой чат
                this.chatCache[chatId] = {
                    id: chatId,
                    type: 'group',
                    name: displayName,
                    groupCode: groupName,
                    createdBy: myUserId,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    participants: participants,
                    lastMessage: {
                        id: messageId,
                        text: welcomeMessage.text.length > 30 ? `${welcomeMessage.text.substring(0, 30)}...` : welcomeMessage.text,
                        senderId: myUserId,
                        timestamp: Date.now()
                    }
                };

                // Кэшируем первое сообщение
                if (!this.messageCache[chatId]) {
                    this.messageCache[chatId] = [];
                }

                this.messageCache[chatId].push(welcomeMessage);

                // Сохраняем кэши
                await Promise.all([
                    this.saveChatCache(),
                    this.saveMessageCache()
                ]);

                console.log(`Group chat created in local cache due to Firebase error: ${chatId}`);
            }

            return chatId;
        } catch (error) {
            console.error('Error creating group chat:', error);
            throw error;
        }
    }

    /**
     * Удаление чата для текущего пользователя
     * @param {string} chatId ID чата для удаления
     * @returns {Promise<boolean>} Результат операции
     */
    async deleteChat(chatId) {
        try {
            // Проверяем наличие пользователя и корректной инициализации
            if (!this.initialized || !this.currentUser) {
                const initResult = await this.initialize();
                if (!initResult) {
                    throw new Error('Не удалось инициализировать сервис чатов');
                }
            }

            if (!chatId) {
                throw new Error('ID чата не указан');
            }

            // ВСЕГДА используем строковый ID
            const myUserId = this.getCurrentUserId();

            console.log(`Удаление чата ${chatId} для пользователя ${myUserId}`);

            try {
                // Проверяем, существует ли чат
                const chatRef = ref(database, `chats/${chatId}`);
                const chatSnapshot = await get(chatRef);

                if (!chatSnapshot.exists()) {
                    console.warn(`Чат с ID ${chatId} не найден в Firebase, проверяем локальный кэш`);
                    // Проверяем локальный кэш
                    if (!this.chatCache[chatId]) {
                        throw new Error(`Чат с ID ${chatId} не найден`);
                    }
                }

                // Получаем данные чата из Firebase или кэша
                const chatData = chatSnapshot.exists() ?
                    chatSnapshot.val() : this.chatCache[chatId];

                // Проверяем, является ли пользователь участником чата
                if (!chatData.participants || !chatData.participants[myUserId]) {
                    throw new Error('У вас нет доступа к этому чату');
                }

                // Удаляем чат из списка чатов пользователя (установка null удаляет запись)
                await set(ref(database, `userChats/${myUserId}/${chatId}`), null);

                // Обновляем список участников чата, удаляя текущего пользователя
                const participantUpdates = {};
                participantUpdates[myUserId] = null; // null означает удаление ключа

                await update(ref(database, `chats/${chatId}/participants`), participantUpdates);

                // Добавляем системное сообщение о выходе для групповых чатов
                if (chatData.type === 'group') {
                    const messageRef = push(ref(database, `messages/${chatId}`));
                    const userName = this.currentUser.fullName || this.currentUser.username || 'Пользователь';

                    await set(messageRef, {
                        id: messageRef.key,
                        text: `${userName} покинул(а) чат`,
                        isSystem: true,
                        timestamp: serverTimestamp()
                    });

                    // Добавляем системное сообщение в кэш
                    if (this.messageCache[chatId]) {
                        this.messageCache[chatId].push({
                            id: messageRef.key || `mock-system-${Date.now()}`,
                            text: `${userName} покинул(а) чат`,
                            isSystem: true,
                            timestamp: Date.now()
                        });
                        await this.saveMessageCache();
                    }
                }

                // Удаляем чат из локального кэша
                if (this.chatCache[chatId]) {
                    delete this.chatCache[chatId];
                    await this.saveChatCache();
                }

                console.log(`Чат ${chatId} успешно удален из списка пользователя ${myUserId}`);
            } catch (firebaseError) {
                console.warn('Firebase error deleting chat:', firebaseError);

                // Если Firebase недоступен, удаляем чат только из локального кэша
                if (this.chatCache[chatId]) {
                    delete this.chatCache[chatId];
                    await this.saveChatCache();
                    console.log(`Чат ${chatId} удален только из локального кэша`);
                }
            }

            return true;
        } catch (error) {
            console.error(`Ошибка при удалении чата ${chatId}:`, error);
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
            // Создаем уникальный ID сообщения
            let messageId;
            let firebasePush = false;

            try {
                // Пробуем использовать Firebase push для создания уникального ID
                const newMessageRef = push(ref(database, `messages/${chatId}`));
                messageId = newMessageRef.key;
                firebasePush = true;
            } catch (pushError) {
                // Если не удалось, создаем клиентский ID
                messageId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                console.warn('Using client-generated message ID due to Firebase error:', pushError);
            }

            // Создаем данные сообщения
            const messageData = {
                id: messageId,
                senderId: myUserId,
                senderName: senderName,
                text,
                timestamp: serverTimestamp(),
                read: {[myUserId]: true}
            };

            // Локальная копия сообщения для кэша
            const localMessageData = {
                ...messageData,
                timestamp: Date.now(), // Используем клиентский timestamp для кэша
                isFromCurrentUser: true // Добавляем флаг для UI
            };

            try {
                // Пробуем сохранить в Firebase
                if (firebasePush) {
                    await set(ref(database, `messages/${chatId}/${messageId}`), messageData);
                } else {
                    // Если не удалось создать push, используем set с клиентским ID
                    await set(ref(database, `messages/${chatId}/${messageId}`), messageData);
                }

                // Создаем превью сообщения для последнего сообщения
                const lastMessageInfo = {
                    id: messageId,
                    text: text.length > 30 ? `${text.substring(0, 30)}...` : text,
                    senderId: myUserId,
                    timestamp: serverTimestamp()
                };

                // Обновляем чат информацией о последнем сообщении
                await update(ref(database, `chats/${chatId}`), {
                    lastMessage: lastMessageInfo
                });

                // Получаем информацию о чате и участниках
                let chatName = '';
                let participants = {};

                const chatSnapshot = await get(ref(database, `chats/${chatId}`));
                if (chatSnapshot.exists()) {
                    const chatData = chatSnapshot.val();

                    // Для группового чата берем название
                    if (chatData.type === 'group') {
                        chatName = chatData.name || 'Групповой чат';
                    } else {
                        chatName = 'Личный чат';
                    }

                    // Получаем участников
                    participants = chatData.participants || {};
                } else if (this.chatCache[chatId]) {
                    // Если нет в Firebase, пробуем из кэша
                    const chatData = this.chatCache[chatId];

                    if (chatData.type === 'group') {
                        chatName = chatData.name || 'Групповой чат';
                    } else {
                        chatName = 'Личный чат';
                    }

                    participants = chatData.participants || {};
                } else {
                    // Извлекаем ID пользователей из ID личного чата
                    if (chatId.startsWith('personal_')) {
                        const userIds = chatId.split('_').slice(1);
                        participants = userIds.reduce((acc, userId) => {
                            acc[userId] = true;
                            return acc;
                        }, {});
                        chatName = 'Личный чат';
                    } else {
                        // Для группового чата извлекаем код группы
                        chatName = 'Групповой чат';
                        // Добавляем текущего пользователя как участника
                        participants[myUserId] = true;
                    }
                }

                // Локальная версия lastMessageInfo для кэша
                const localLastMessageInfo = {
                    ...lastMessageInfo,
                    timestamp: Date.now() // Используем клиентский timestamp
                };

                // Обновляем информацию о чате у каждого участника
                for (const userId of Object.keys(participants)) {
                    if (participants[userId]) {
                        await update(ref(database, `userChats/${userId}/${chatId}`), {
                            lastMessage: lastMessageInfo,
                            updatedAt: serverTimestamp()
                        });
                    }
                }

                // Обновляем локальный кэш
                if (!this.messageCache[chatId]) {
                    this.messageCache[chatId] = [];
                }

                // Добавляем сообщение в кэш
                this.messageCache[chatId].push(localMessageData);

                // Обновляем кэш чата
                if (this.chatCache[chatId]) {
                    this.chatCache[chatId] = {
                        ...this.chatCache[chatId],
                        lastMessage: localLastMessageInfo,
                        updatedAt: Date.now()
                    };
                }

                // Сохраняем кэши
                await Promise.all([
                    this.saveMessageCache(),
                    this.saveChatCache()
                ]);

                // Отправляем push-уведомления другим участникам
                const notificationPromises = [];
                for (const userId of Object.keys(participants)) {
                    if (userId !== myUserId && participants[userId]) {
                        // Создаем превью сообщения (укороченная версия для уведомления)
                        const messagePreview = text.length > 50 ? `${text.substring(0, 50)}...` : text;

                        // Добавляем имя чата к уведомлению
                        const notificationSenderName = `${senderName} (${chatName})`;

                        // Отправляем уведомление асинхронно
                        notificationPromises.push(
                            this.sendNotificationToUser(userId, chatId, messagePreview, notificationSenderName)
                                .catch(e => {
                                    // Игнорируем ошибки уведомлений
                                    return {success: false, error: e.message};
                                })
                        );
                    }
                }

                // Ждем завершения отправки уведомлений
                if (notificationPromises.length > 0) {
                    await Promise.allSettled(notificationPromises);
                }
            } catch (firebaseError) {
                console.warn('Firebase error sending message:', firebaseError);

                // Если Firebase недоступен, сохраняем только в локальный кэш
                if (!this.messageCache[chatId]) {
                    this.messageCache[chatId] = [];
                }

                // Добавляем сообщение в кэш
                this.messageCache[chatId].push(localMessageData);

                // Обновляем кэш чата
                if (this.chatCache[chatId]) {
                    // Локальная версия lastMessageInfo
                    const localLastMessageInfo = {
                        id: messageId,
                        text: text.length > 30 ? `${text.substring(0, 30)}...` : text,
                        senderId: myUserId,
                        timestamp: Date.now()
                    };

                    this.chatCache[chatId] = {
                        ...this.chatCache[chatId],
                        lastMessage: localLastMessageInfo,
                        updatedAt: Date.now()
                    };
                }

                // Сохраняем кэши
                await Promise.all([
                    this.saveMessageCache(),
                    this.saveChatCache()
                ]);

                console.log(`Message saved to local cache only due to Firebase error: ${chatId}`);
            }

            console.log(`Message sent successfully to chat ${chatId}`);
            return messageId;
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    /**
     * Get only new messages from a chat since a specific timestamp
     * @param {string} chatId - The chat ID to fetch messages for
     * @param {number} lastTimestamp - Only get messages newer than this timestamp
     * @returns {Promise<Array>} - Array of new messages
     */
    async getNewChatMessages(chatId, lastTimestamp = 0) {
        if (!chatId) {
            console.error('Chat ID is empty');
            return [];
        }

        // Ensure proper initialization
        if (!this.initialized || !this.currentUser) {
            const initResult = await this.initialize();
            if (!initResult) {
                console.error('Failed to initialize when getting new chat messages');
                return [];
            }
        }

        if (!this.currentUser || !this.currentUser.id) {
            console.error('Current user is not initialized');
            return [];
        }

        // Always use string ID
        const myUserId = this.getCurrentUserId();

        try {
            console.log(`Getting new messages for chat ${chatId} since timestamp ${lastTimestamp}`);

            // Сначала пробуем получить из Firebase
            try {
                const messagesRef = ref(database, `messages/${chatId}`);

                // Create appropriate query based on whether we have a timestamp
                let messagesQuery;

                if (lastTimestamp > 0) {
                    // If we have a timestamp, query messages newer than that timestamp
                    messagesQuery = query(
                        messagesRef,
                        orderByChild('timestamp'),
                        startAfter(lastTimestamp)
                    );
                } else {
                    // If no timestamp, just order by timestamp
                    messagesQuery = query(
                        messagesRef,
                        orderByChild('timestamp')
                    );
                }

                const snapshot = await get(messagesQuery);
                if (snapshot.exists()) {
                    // Process messages from Firebase
                    const messagesData = snapshot.val() || {};
                    const messages = Object.values(messagesData);

                    // Sort messages by timestamp
                    messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

                    // Process messages to ensure consistency
                    const processedMessages = messages.map(message => {
                        // Convert senderId to string
                        const senderId = String(message.senderId || '');

                        // Determine message ownership
                        const isFromCurrentUser = senderId === myUserId;

                        return {
                            ...message,
                            senderId,
                            isFromCurrentUser,
                            senderName: message.senderName || `Пользователь ${senderId}`
                        };
                    });

                    // Обновляем локальный кэш новыми сообщениями
                    if (processedMessages.length > 0) {
                        if (!this.messageCache[chatId]) {
                            this.messageCache[chatId] = [];
                        }

                        // Добавляем только те сообщения, которых еще нет в кэше
                        const existingIds = new Set(this.messageCache[chatId].map(m => m.id));
                        const newMessages = processedMessages.filter(m => !existingIds.has(m.id));

                        if (newMessages.length > 0) {
                            this.messageCache[chatId] = [...this.messageCache[chatId], ...newMessages];
                            await this.saveMessageCache();
                        }
                    }

                    console.log(`Loaded ${processedMessages.length} new messages for chat ${chatId} from Firebase`);
                    return processedMessages;
                }
            } catch (firebaseError) {
                console.warn('Firebase error getting new messages:', firebaseError);
                // Продолжаем и пробуем локальный кэш
            }

            // Если не получилось из Firebase или не нашли новых сообщений, проверяем локальный кэш
            if (this.messageCache[chatId]) {
                const cachedMessages = this.messageCache[chatId].filter(
                    msg => msg.timestamp > lastTimestamp
                );

                // Сортируем по времени
                cachedMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

                console.log(`Loaded ${cachedMessages.length} new messages for chat ${chatId} from local cache`);
                return cachedMessages;
            }

            // Если нет данных ни в Firebase, ни в кэше, возвращаем пустой массив
            console.log(`No new messages found for chat ${chatId}`);
            return [];
        } catch (error) {
            console.error(`Error getting new messages for chat ${chatId}:`, error);
            return [];
        }
    }

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

            console.log(`Sending push notification to user ${recipientId} about new message in chat ${chatId}`);

            // Используем эндпоинт отправки устройственных уведомлений вместо /chat/send-notification
            const response = await apiClient.post('/device/send-notification', {
                recipient_id: recipientId,
                title: senderName,
                body: messagePreview,
                data: {
                    type: 'chat',
                    chat_id: chatId,
                    message_preview: messagePreview,
                    sender_name: senderName
                }
            });

            console.log(`Push notification response:`, response.data);

            // Если ответ успешный, но получатель не найден или у него нет токенов
            if (response.data?.status === 'no_tokens' || response.data?.message?.includes('No device tokens')) {
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

                            // Проверяем наличие кэша
                            const cachedChats = Object.values(this.chatCache);
                            if (cachedChats.length > 0) {
                                console.log(`Returning ${cachedChats.length} chats from cache after failed initialization`);
                                return cachedChats;
                            }

                            return [];
                        }
                        // Продолжаем работу, если у нас есть ID пользователя, даже если Firebase аутентификация не удалась
                        console.log('Continuing with user chats despite initialization issues');
                    }
                } catch (initError) {
                    console.error('Error during initialization:', initError);

                    // Если есть ошибка инициализации Firebase, сразу возвращаем кэш
                    if (this.firebaseInitError) {
                        const cachedChats = Object.values(this.chatCache);
                        console.log(`Returning ${cachedChats.length} chats from cache due to Firebase error`);
                        return cachedChats;
                    }

                    // Проверяем, есть ли у нас данные пользователя несмотря на ошибку
                    if (!this.currentUser || !this.currentUser.id) {
                        return [];
                    }
                    console.log('Continuing with user chats despite initialization error');
                }
            }

            // Если Firebase инициализация не удалась, возвращаем данные из кэша
            if (this.firebaseInitError) {
                const cachedChats = Object.values(this.chatCache);
                console.log(`Returning ${cachedChats.length} chats from cache due to Firebase error`);
                return cachedChats;
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

                // Сначала пробуем получить из Firebase
                try {
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

                            // Обновляем локальный кэш
                            chats.forEach(chat => {
                                this.chatCache[chat.id] = chat;
                            });

                            // Сохраняем кэш асинхронно
                            this.saveChatCache();

                            console.log(`Loaded ${chats.length} chats for user ${myUserId} from Firebase`);
                            resolve(chats);
                        }, (error) => {
                            console.error('Error getting user chats from Firebase:', error);

                            // В случае ошибки Firebase используем локальный кэш
                            const cachedChats = Object.values(this.chatCache).filter(chat => {
                                // Для личных чатов проверяем по ID пользователя
                                if (chat.type === 'personal') {
                                    return chat.participants && chat.participants[myUserId];
                                }
                                // Для групповых чатов также проверяем участников
                                return chat.participants && chat.participants[myUserId];
                            });

                            // Сортируем по времени
                            cachedChats.sort((a, b) => {
                                const timeA = a.updatedAt || 0;
                                const timeB = b.updatedAt || 0;
                                return timeB - timeA;
                            });

                            console.log(`Loaded ${cachedChats.length} chats for user ${myUserId} from local cache`);
                            resolve(cachedChats);
                        });

                        // Сохраняем слушателя для последующей отписки
                        this.listeners.userChats = {path, event: 'value', handler};
                    });
                } catch (firebaseError) {
                    console.warn('Firebase error getting user chats:', firebaseError);

                    // Используем локальный кэш
                    const cachedChats = Object.values(this.chatCache).filter(chat => {
                        // Фильтруем чаты пользователя
                        if (chat.type === 'personal') {
                            // Для личных чатов проверяем ID участников
                            return chat.withUser === myUserId || (chat.participants && chat.participants[myUserId]);
                        }
                        // Для групповых чатов проверяем участников
                        return chat.participants && chat.participants[myUserId];
                    });

                    // Сортируем по времени
                    cachedChats.sort((a, b) => {
                        const timeA = a.updatedAt || 0;
                        const timeB = b.updatedAt || 0;
                        return timeB - timeA;
                    });

                    console.log(`Loaded ${cachedChats.length} chats for user ${myUserId} from local cache`);
                    return cachedChats;
                }
            } catch (error) {
                console.error('Error in getUserChats:', error);

                // В случае общей ошибки используем локальный кэш
                const cachedChats = Object.values(this.chatCache).filter(chat => {
                    if (chat.type === 'personal') {
                        return chat.withUser === myUserId || (chat.participants && chat.participants[myUserId]);
                    }
                    return chat.participants && chat.participants[myUserId];
                });

                cachedChats.sort((a, b) => {
                    const timeA = a.updatedAt || 0;
                    const timeB = b.updatedAt || 0;
                    return timeB - timeA;
                });

                console.log(`Loaded ${cachedChats.length} chats for user ${myUserId} from local cache (after error)`);
                return cachedChats;
            }
        } catch (outerError) {
            console.error('Unexpected error in getUserChats:', outerError);
            // В случае неожиданной ошибки используем локальный кэш
            const cachedChats = Object.values(this.chatCache);
            return cachedChats;
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

            // Если есть ошибка Firebase инициализации, сразу возвращаем кэш
            if (this.firebaseInitError) {
                const cachedMessages = this.messageCache[chatId] || [];
                const limitedMessages = cachedMessages.slice(-limit);
                console.log(`Loaded ${limitedMessages.length} messages for chat ${chatId} from cache due to Firebase error`);
                return limitedMessages;
            }

            // Сначала пробуем получить из Firebase
            try {
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

                        // Обновляем локальный кэш
                        if (processedMessages.length > 0) {
                            this.messageCache[chatId] = processedMessages;
                            this.saveMessageCache();
                        }

                        console.log(`Loaded ${processedMessages.length} messages for chat ${chatId} from Firebase`);
                        resolve(processedMessages);
                    }, (error) => {
                        console.error(`Error getting messages for chat ${chatId} from Firebase:`, error);

                        // В случае ошибки используем локальный кэш
                        const cachedMessages = this.messageCache[chatId] || [];

                        // Ограничиваем количество сообщений
                        const limitedMessages = cachedMessages.slice(-limit);

                        console.log(`Loaded ${limitedMessages.length} messages for chat ${chatId} from local cache`);
                        resolve(limitedMessages);
                    });

                    // Сохраняем слушателя для последующей отписки
                    this.listeners[listenerKey] = {path, event: 'value', handler};
                });
            } catch (firebaseError) {
                console.warn('Firebase error getting messages:', firebaseError);

                // Используем локальный кэш
                const cachedMessages = this.messageCache[chatId] || [];

                // Ограничиваем количество сообщений
                const limitedMessages = cachedMessages.slice(-limit);

                console.log(`Loaded ${limitedMessages.length} messages for chat ${chatId} from local cache`);
                return limitedMessages;
            }
        } catch (error) {
            console.error('Error in getChatMessages:', error);

            // В случае общей ошибки используем локальный кэш
            const cachedMessages = this.messageCache[chatId] || [];
            const limitedMessages = cachedMessages.slice(-limit);
            return limitedMessages;
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

            // Если есть ошибка Firebase, используем кэш
            if (this.firebaseInitError) {
                return this.chatCache[chatId] || null;
            }

            // Сначала пробуем получить из Firebase
            try {
                return new Promise((resolve) => {
                    const chatRef = ref(database, path);

                    const handler = onValue(chatRef, (snapshot) => {
                        const chatData = snapshot.val() || null;

                        // Если есть данные о последнем сообщении, преобразуем senderId
                        if (chatData && chatData.lastMessage && chatData.lastMessage.senderId) {
                            chatData.lastMessage.senderId = String(chatData.lastMessage.senderId);
                        }

                        // Обновляем локальный кэш
                        if (chatData) {
                            this.chatCache[chatId] = chatData;
                            this.saveChatCache();
                        }

                        resolve(chatData);
                    }, (error) => {
                        console.error(`Error getting chat info for ${chatId} from Firebase:`, error);

                        // В случае ошибки используем локальный кэш
                        const cachedChat = this.chatCache[chatId] || null;
                        resolve(cachedChat);
                    });

                    // Сохраняем слушателя для последующей отписки
                    this.listeners[listenerKey] = {path, event: 'value', handler};
                });
            } catch (firebaseError) {
                console.warn('Firebase error getting chat info:', firebaseError);

                // Используем локальный кэш
                return this.chatCache[chatId] || null;
            }
        } catch (error) {
            console.error('Error in getChatInfo:', error);
            return this.chatCache[chatId] || null;
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
            // Сначала пробуем обновить в Firebase
            try {
                const messagesRef = ref(database, `messages/${chatId}`);
                const snapshot = await get(messagesRef);

                if (snapshot.exists()) {
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
                }
            } catch (firebaseError) {
                console.warn('Firebase error marking messages as read:', firebaseError);
            }

            // Обновляем локальный кэш сообщений
            if (this.messageCache[chatId]) {
                let updateCount = 0;
                this.messageCache[chatId] = this.messageCache[chatId].map(message => {
                    // Пропускаем свои сообщения или уже прочитанные
                    if (message.senderId === myUserId || (message.read && message.read[myUserId])) {
                        return message;
                    }

                    // Отмечаем как прочитанное
                    updateCount++;
                    return {
                        ...message,
                        read: {
                            ...message.read,
                            [myUserId]: true
                        }
                    };
                });

                if (updateCount > 0) {
                    await this.saveMessageCache();
                    console.log(`Marked ${updateCount} messages as read in local cache for chat ${chatId}`);
                }
            }

            // Notify about unread count change if callback exists
            if (this.unreadCountCallback) {
                this.getUnreadMessageCount(chatId).then(count => {
                    this.refreshUnreadMessagesCount();
                });
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
            // Сначала пробуем получить из Firebase
            try {
                const messagesRef = ref(database, `messages/${chatId}`);
                const snapshot = await get(messagesRef);

                if (snapshot.exists()) {
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
                }
            } catch (firebaseError) {
                console.warn('Firebase error getting unread count:', firebaseError);
                // Продолжаем и проверяем локальный кэш
            }

            // Используем локальный кэш
            if (this.messageCache[chatId]) {
                let unreadCount = 0;

                for (const message of this.messageCache[chatId]) {
                    // Only count if: not from current user AND not read by current user
                    if (message.senderId !== myUserId && (!message.read || !message.read[myUserId])) {
                        unreadCount++;
                    }
                }

                return unreadCount;
            }

            return 0;
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

            if (!chats || !Array.isArray(chats)) {
                return 0;
            }

            // Calculate total unread messages
            let totalUnread = 0;

            // Process each chat
            for (const chat of chats) {
                if (!chat || !chat.id) continue;

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
            }, (error) => {
                console.warn('Error in unread messages listener:', error);
                // При ошибке просто обновляем счетчик
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
            // При ошибке вызываем callback с 0
            callback(0);
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
            // При ошибке вызываем callback с 0
            this.unreadCountCallback(0);
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
            }, (error) => {
                console.warn(`Error in chat message listener for ${chatId}:`, error);
                // При ошибке все равно вызываем callback
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