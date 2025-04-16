// src/api/notificationsApi.ts
import apiClient from './apiClient';
import { Platform } from 'react-native';

// Типы для запросов с уведомлениями
export interface DeviceTokenRequest {
  token: string;
  device: string;
  platform: string;
}

export interface NotificationResponse {
  success: boolean;
  message: string;
  action?: string; // Для некоторых ответов может возвращаться тип действия
}

// API для работы с уведомлениями
const notificationsApi = {
  /**
   * Регистрация токена устройства для push-уведомлений
   * @param token Токен устройства
   * @param deviceInfo Информация об устройстве
   * @returns Результат регистрации
   */
  registerDeviceToken: async (
    token: string,
    deviceInfo?: { deviceName?: string }
  ): Promise<NotificationResponse> => {
    try {
      const response = await apiClient.post('/device/register', {
        token,
        device: deviceInfo?.deviceName || 'Неизвестное устройство',
        platform: Platform.OS
      });
      return response.data;
    } catch (error) {
      console.error('Ошибка при регистрации токена устройства:', error);
      throw error;
    }
  },

  /**
   * Отмена регистрации токена устройства (при выходе из аккаунта)
   * @param token Токен устройства для удаления
   * @returns Результат отмены регистрации
   */
  unregisterDeviceToken: async (token: string): Promise<NotificationResponse> => {
    try {
      const response = await apiClient.post('/device/unregister', { token });
      return response.data;
    } catch (error) {
      console.error('Ошибка при отмене регистрации токена устройства:', error);
      throw error;
    }
  },

  /**
   * Отправка тестового push-уведомления
   * @param token Токен устройства (опционально)
   * @returns Результат отправки
   */
  sendTestNotification: async (token?: string): Promise<NotificationResponse> => {
    try {
      const response = await apiClient.post('/device/test-notification', token ? { token } : {});
      return response.data;
    } catch (error) {
      console.error('Ошибка при отправке тестового уведомления:', error);
      throw error;
    }
  },

  /**
   * Получение настроек уведомлений пользователя
   * @returns Настройки уведомлений
   */
  getNotificationSettings: async () => {
    try {
      const response = await apiClient.get('/notifications/settings');
      return response.data;
    } catch (error) {
      console.error('Ошибка при получении настроек уведомлений:', error);
      throw error;
    }
  },

  /**
   * Обновление настроек уведомлений пользователя
   * @param settings Новые настройки уведомлений
   * @returns Обновленные настройки
   */
  updateNotificationSettings: async (settings: any) => {
    try {
      const response = await apiClient.put('/notifications/settings', settings);
      return response.data;
    } catch (error) {
      console.error('Ошибка при обновлении настроек уведомлений:', error);
      throw error;
    }
  },

  /**
   * Отправка локального тестового уведомления
   * Это клиентская функция, не использует API
   * @param title Заголовок уведомления
   * @param body Текст уведомления
   * @param data Дополнительные данные
   * @returns Promise с результатом отправки
   */
  sendLocalNotification: async (
    title: string,
    body: string,
    data?: any
  ) => {
    // Эта функция должна использовать Notifications.scheduleNotificationAsync из expo-notifications
    // Она реализована в хуке useNotifications
    console.log('Вызов sendLocalNotification должен быть обработан через useNotifications');
    return {
      success: false,
      message: 'Эта функция должна вызываться через useNotifications'
    };
  }
};

export default notificationsApi;