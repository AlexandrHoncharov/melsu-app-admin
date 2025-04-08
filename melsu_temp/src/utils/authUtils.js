// src/utils/authUtils.js
import {
  signInWithCustomToken,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { auth } from '../config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Утилиты для интеграции Firebase Auth с существующей системой аутентификации
 *
 * Примечание: Потребуется создать серверную функцию для генерации Firebase токенов
 * на основе токена вашего API
 */
const authUtils = {
  /**
   * Синхронизирует сессию с Firebase
   * @returns {Promise<boolean>} Успешна ли авторизация
   */
  async syncFirebaseAuth() {
    try {
      // Получаем токен из AsyncStorage (предположительно уже существует)
      const appToken = await AsyncStorage.getItem('userToken');

      if (!appToken) {
        return false;
      }

      // Делаем запрос на ваш бэкенд для получения Firebase token
      // Необходимо реализовать эндпоинт на Flask сервере
      const response = await fetch('http://your-api-url/api/firebase/token', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${appToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('Failed to get Firebase token from server');
        return false;
      }

      const { firebaseToken } = await response.json();

      // Авторизуемся в Firebase с полученным токеном
      await signInWithCustomToken(auth, firebaseToken);
      return true;
    } catch (error) {
      console.error('Error syncing Firebase auth:', error);
      return false;
    }
  },

  /**
   * Выход из Firebase при выходе из приложения
   */
  async signOut() {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Firebase sign out error:', error);
    }
  },

  /**
   * Получает текущего пользователя Firebase
   */
  getCurrentUser() {
    return auth.currentUser;
  },

  /**
   * Проверяет, авторизован ли пользователь в Firebase
   */
  isAuthenticated() {
    return !!auth.currentUser;
  },

  /**
   * Конвертирует данные пользователя из вашей системы в формат Firebase
   * @param {Object} userObject - Объект пользователя из вашего API
   * @returns {Object} - Форматированные данные пользователя для Firebase
   */
  formatUserData(userObject) {
    return {
      uid: userObject.id.toString(),  // Firebase UID должен быть строкой
      displayName: userObject.fullName || userObject.username,
      email: userObject.email || `${userObject.username}@example.com`,  // Фиктивный email если нет настоящего
      photoURL: userObject.avatarUrl || null,
      // Дополнительные поля специфичные для вашего приложения
      role: userObject.role,
      group: userObject.group || null
    };
  }
};

export default authUtils;