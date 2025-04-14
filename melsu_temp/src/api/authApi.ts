// src/api/userApi.ts
import apiClient from './apiClient';

// Интерфейсы для типизации данных
interface VerificationStatus {
  status: 'unverified' | 'pending' | 'verified' | 'rejected';
  message?: string;
  updatedAt?: string;
}

interface DeviceTokenRequest {
  token: string;
  platform: string;
  device_name?: string;
  app_version?: string;
  device_id?: string;
  is_development?: boolean;
  replace_existing?: boolean;
  token_type?: 'expo' | 'fcm';
}

// API для работы с профилем пользователя
const userApi = {
  /**
   * Получение профиля пользователя
   * @returns Данные профиля
   */
  getProfile: async () => {
    const response = await apiClient.get('/user/profile');
    return response.data;
  },

  /**
   * Регистрация токена устройства для push-уведомлений
   * @param deviceData Данные устройства с токеном
   * @returns Результат регистрации
   */
  registerDeviceToken: async (deviceData: DeviceTokenRequest) => {
    try {
      console.log(`UserAPI: Регистрация токена устройства: ${deviceData.token.substring(0, 10)}...`);
      console.log(`UserAPI: Тип токена: ${deviceData.token.startsWith('ExponentPushToken') ? 'Development (Expo)' : 'Production (FCM)'}`);
      console.log(`UserAPI: Платформа: ${deviceData.platform}, Устройство: ${deviceData.device_name || 'Unknown'}`);

      // Определяем тип токена для сервера
      const tokenType = deviceData.token.startsWith('ExponentPushToken') ? 'expo' : 'fcm';

      const response = await apiClient.post('/device/register', {
        ...deviceData,
        token_type: tokenType,
        // Всегда запрашиваем замену существующих токенов для того же устройства
        replace_existing: true
      });

      console.log('UserAPI: Ответ сервера при регистрации токена:', response.data);
      return response.data;
    } catch (error) {
      console.error('UserAPI: Ошибка при регистрации токена устройства:', error);

      // Улучшенная обработка ошибок
      let errorMessage = 'Не удалось зарегистрировать токен устройства';
      if (error.response && error.response.data && error.response.data.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      throw new Error(errorMessage);
    }
  },

  /**
   * Отмена регистрации токена устройства
   * @param token Токен устройства для отмены регистрации
   * @returns Результат отмены регистрации
   */
  unregisterDeviceToken: async (token: string) => {
    try {
      console.log(`UserAPI: Отмена регистрации токена: ${token.substring(0, 10)}...`);

      const response = await apiClient.post('/device/unregister', { token });
      console.log('UserAPI: Ответ сервера при отмене регистрации токена:', response.data);

      return response.data;
    } catch (error) {
      console.error('UserAPI: Ошибка при отмене регистрации токена:', error);

      // Даже при ошибке возвращаем успех, чтобы не блокировать процесс выхода
      return { success: true, error: error.message, forcedSuccess: true };
    }
  },

  /**
   * Отправка тестового push-уведомления
   * @returns Результат отправки
   */
  sendTestNotification: async () => {
    try {
      console.log('UserAPI: Отправка тестового уведомления...');

      const response = await apiClient.post('/device/test-notification');
      console.log('UserAPI: Результат тестового уведомления:', response.data);

      return response.data;
    } catch (error) {
      console.error('UserAPI: Ошибка при отправке тестового уведомления:', error);

      let errorMessage = 'Не удалось отправить тестовое уведомление';
      if (error.response && error.response.data && error.response.data.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      throw new Error(errorMessage);
    }
  },

  /**
   * Загрузка фото студенческого билета
   * @param imageUri URI изображения для загрузки
   * @returns Результат загрузки
   */
  uploadStudentCard: async (imageUri: string) => {
    // Создаем объект FormData для отправки файла
    const formData = new FormData();

    // Получаем расширение файла из URI
    const fileExtension = imageUri.split('.').pop() || 'jpg';

    // Добавляем файл изображения
    formData.append('studentCard', {
      uri: imageUri,
      name: `student_card.${fileExtension}`,
      type: `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`
    } as any);

    const response = await apiClient.post('/student/verify', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },

  /**
   * Проверка статуса верификации студенческого билета
   * @returns Статус верификации
   */
  getVerificationStatus: async (): Promise<VerificationStatus> => {
    const response = await apiClient.get('/student/verification-status');
    return response.data;
  },

  /**
   * Получение URL изображения студенческого билета
   * @returns URL для загрузки изображения
   */
  getStudentCardImage: async () => {
    const response = await apiClient.get('/student/card-image');
    return response.data;
  },

  /**
   * Отмена запроса на верификацию
   * @returns Результат отмены
   */
  cancelVerification: async () => {
    const response = await apiClient.post('/student/cancel-verification');
    return response.data;
  },

  /**
   * Повторная загрузка студенческого билета после отклонения
   * @param imageUri URI изображения для загрузки
   * @returns Результат загрузки
   */
  reuploadStudentCard: async (imageUri: string) => {
    // Создаем объект FormData для отправки файла
    const formData = new FormData();

    // Получаем расширение файла из URI
    const fileExtension = imageUri.split('.').pop() || 'jpg';

    // Добавляем файл изображения
    formData.append('studentCard', {
      uri: imageUri,
      name: `student_card.${fileExtension}`,
      type: `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`
    } as any);

    const response = await apiClient.post('/student/reupload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },

  /**
   * Запрос на информацию о причине отклонения верификации
   * @returns Информация о причине отклонения
   */
  getRejectionReason: async () => {
    const response = await apiClient.get('/student/rejection-reason');
    return response.data;
  }
};

export default userApi;