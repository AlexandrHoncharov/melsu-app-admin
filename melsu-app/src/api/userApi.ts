import apiClient from './apiClient';

// Типы для верификации
interface VerificationStatus {
  status: 'unverified' | 'pending' | 'verified';
  message?: string;
  updatedAt?: string;
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
   * Обновление профиля пользователя
   * @param profileData Новые данные профиля
   * @returns Обновленный профиль
   */
  updateProfile: async (profileData: any) => {
    const response = await apiClient.put('/user/profile', profileData);
    return response.data;
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
  }
};

export default userApi;