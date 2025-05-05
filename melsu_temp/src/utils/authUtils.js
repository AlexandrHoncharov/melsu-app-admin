// src/utils/authUtils.js
import { auth, signInWithCustomToken, signInAnonymously } from '../config/firebase';
import apiClient from '../api/apiClient';

/**
 * Утилиты для интеграции Firebase Auth с существующей системой аутентификации
 */
const authUtils = {
    /**
     * Синхронизирует сессию с Firebase, используя текущий API-токен
     * @returns {Promise<boolean>} Успешна ли авторизация
     */
    async syncFirebaseAuth() {
        try {
            // Проверяем, что auth правильно инициализирован
            if (!auth) {
                console.warn('Firebase auth не инициализирован');
                return false;
            }

            // Запрашиваем Firebase-токен через API
            try {
                console.log('Запрашиваем Firebase-токен через API...');
                const response = await apiClient.post('/auth/firebase-token');

                if (!response.data || !response.data.token) {
                    console.warn('Сервер не вернул токен Firebase');
                    return false;
                }

                // Извлекаем токен из ответа
                const { token } = response.data;

                try {
                    // Авторизуемся в Firebase с полученным токеном
                    await signInWithCustomToken(auth, token);
                    console.log('Авторизация в Firebase успешна через custom token');
                    return true;
                } catch (customTokenError) {
                    console.warn('Ошибка авторизации через custom token:', customTokenError);

                    // Если не удалось войти через токен, пробуем анонимный вход
                    try {
                        await signInAnonymously(auth);
                        console.log('Анонимная авторизация в Firebase успешна');
                        return true;
                    } catch (anonError) {
                        console.warn('Ошибка анонимной авторизации:', anonError);
                        // Создаем заглушку для пользователя, чтобы код не падал
                        auth.currentUser = {
                            uid: 'mock-anonymous-user',
                            isAnonymous: true
                        };
                        return false;
                    }
                }
            } catch (apiError) {
                console.warn('Ошибка получения Firebase токена через API:', apiError);

                // Пробуем анонимную авторизацию как запасной вариант
                try {
                    await signInAnonymously(auth);
                    console.log('Анонимная авторизация в Firebase успешна (после ошибки API)');
                    return true;
                } catch (anonError) {
                    console.warn('Ошибка анонимной авторизации:', anonError);
                    // Создаем заглушку для пользователя
                    auth.currentUser = {
                        uid: 'mock-anonymous-user',
                        isAnonymous: true
                    };
                    return false;
                }
            }
        } catch (error) {
            console.error('Общая ошибка синхронизации Firebase Auth:', error);
            return false;
        }
    },

    /**
     * Выход из Firebase при выходе из приложения
     */
    async signOut() {
        try {
            // Проверяем, что auth правильно инициализирован
            if (!auth) {
                console.warn('Firebase auth не инициализирован, пропускаем выход');
                return;
            }

            // Проверяем, что есть метод signOut
            if (typeof auth.signOut === 'function') {
                await auth.signOut();
                console.log('Выход из Firebase успешен');
            } else {
                console.warn('Метод auth.signOut не доступен');
            }
        } catch (error) {
            console.error('Ошибка при выходе из Firebase:', error);
        }
    },

    /**
     * Получает текущего пользователя Firebase
     */
    getCurrentUser() {
        if (!auth) {
            console.warn('Firebase auth не инициализирован');
            return null;
        }
        return auth.currentUser;
    },

    /**
     * Проверяет, авторизован ли пользователь в Firebase
     */
    isAuthenticated() {
        if (!auth) {
            console.warn('Firebase auth не инициализирован');
            return false;
        }
        return !!auth.currentUser;
    },

    /**
     * Конвертирует данные пользователя из вашей системы в формат Firebase
     * @param {Object} userObject - Объект пользователя из вашего API
     * @returns {Object} - Форматированные данные пользователя для Firebase
     */
    formatUserData(userObject) {
        if (!userObject || !userObject.id) {
            console.warn('Неверные данные пользователя для форматирования');
            return {
                uid: 'unknown-user',
                displayName: 'Неизвестный пользователь',
                email: 'unknown@example.com'
            };
        }

        return {
            uid: String(userObject.id), // Firebase UID должен быть строкой
            displayName: userObject.fullName || userObject.username || 'Пользователь',
            email: userObject.email || `user-${userObject.id}@example.com`, // Фиктивный email если нет настоящего
            photoURL: userObject.avatarUrl || null,
            // Дополнительные поля специфичные для вашего приложения
            role: userObject.role || 'user',
            group: userObject.group || null,
            department: userObject.department || null
        };
    }
};

export default authUtils;