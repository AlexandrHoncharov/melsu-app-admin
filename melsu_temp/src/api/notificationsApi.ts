// src/api/notificationsApi.ts
import apiClient from './apiClient';
import { Platform } from 'react-native';

// Типы для запросов с уведомлениями
export interface DeviceTokenRequest {
  token: string;
  device: string;
  platform: string;
  tokenType?: 'fcm' | 'expo' | 'unknown';
}

export interface NotificationResponse {
  success: boolean;
  message: string;
  action?: string;
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
    deviceInfo?: {
      deviceName?: string;
      tokenType?: 'fcm' | 'expo' | 'unknown';
    }
  ): Promise<NotificationResponse> => {
    try {
      const response = await apiClient.post('/device/register', {
        token,
        device: deviceInfo?.deviceName || 'Неизвестное устройство',
        platform: Platform.OS,
        tokenType: deviceInfo?.tokenType || 'unknown'
      });
      return response.data;
    } catch (error) {
      console.error('Ошибка при регистрации токена:', error);
      throw error;
    }
  },

  /**
   * Отмена регистрации токена устройства
   * @param token Токен устройства для удаления
   * @returns Результат отмены регистрации
   */
  unregisterDeviceToken: async (token: string): Promise<NotificationResponse> => {
    try {
      const response = await apiClient.post('/device/unregister', { token });
      return response.data;
    } catch (error) {
      console.error('Ошибка при отмене регистрации токена:', error);
      throw error;
    }
  },

  /**
   * Отправка тестового push-уведомления
   * @param token Токен устройства
   * @param tokenType Тип токена (fcm или expo)
   * @returns Результат отправки
   */
  sendTestNotification: async (
    token: string,
    tokenType: 'fcm' | 'expo' | 'unknown' = 'unknown'
  ): Promise<NotificationResponse> => {
    try {
      const response = await apiClient.post('/device/test-notification', {
        token,
        tokenType
      });
      return response.data;
    } catch (error) {
      console.error('Ошибка при отправке тестового уведомления:', error);
      throw error;
    }
  }
};

export default notificationsApi;