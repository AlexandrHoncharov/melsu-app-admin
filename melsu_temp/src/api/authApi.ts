import apiClient from './apiClient';

// Типы для запросов
interface LoginRequest {
  username: string;
  password: string;
}

interface SpecialityData {
  id: number;
  code: string;
  name: string;
  faculty: string;
  form: string;  // 'full-time', 'full-part', or 'correspondence'
  formName: string;
}

interface RegisterRequest {
  username?: string; // Может генерироваться на сервере
  fullName: string;
  password: string;
  group: string;
  role: 'student' | 'teacher';
  speciality?: SpecialityData;  // Add this field
}

// Типы для ответов
interface AuthResponse {
  token: string;
  user: {
    id: number;
    username: string;
    fullName?: string;
    role: 'student' | 'teacher' | 'admin';
    group?: string;
    faculty?: string;
    verificationStatus?: 'unverified' | 'pending' | 'verified';
  };
}

// API для работы с авторизацией
const authApi = {
  /**
   * Аутентификация пользователя
   * @param credentials Учетные данные
   * @returns Результат авторизации
   */
  login: async (credentials: LoginRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
    return response.data;
  },

  /**
 * Регистрация нового пользователя
 * @param userData Данные нового пользователя
 * @returns Результат регистрации
 */
register: async (userData: RegisterRequest): Promise<AuthResponse> => {
  // We're not sending username anymore, it will be generated on the server
  const requestData = {
    fullName: userData.fullName,
    password: userData.password,
    group: userData.group,
    role: userData.role,
    speciality: userData.speciality  // Include speciality data
  };

  const response = await apiClient.post<AuthResponse>('/auth/register', requestData);
  return response.data;
},

  /**
   * Проверка валидности токена и получение текущего пользователя
   * @returns Данные текущего пользователя
   */
  getCurrentUser: async () => {
    const response = await apiClient.get<AuthResponse['user']>('/user/profile');
    return response.data;
  },

  /**
 * Change user password
 * @param currentPassword Current password for verification
 * @param newPassword New password to set
 * @returns Result of password change operation
 */
changePassword: async (currentPassword: string, newPassword: string) => {
  const response = await apiClient.post('/user/change-password', {
    currentPassword,
    newPassword
  });
  return response.data;
},

  /**
 * Выход из системы
 * @returns Результат выхода
 */
logout: async () => {
  try {
    // Поскольку на сервере нет эндпоинта /auth/logout, не делаем запрос
    // а просто возвращаем успешный результат
    console.log('Performing client-side logout...');
    return { success: true };
  } catch (error) {
    // Даже если запрос не удался, мы все равно хотим выйти из системы
    console.warn('Error during logout API call (ignored):', error);
    return { success: true };
  }
},

  /**
   * Проверка доступности логина
   * @param username Логин для проверки
   * @returns Результат проверки
   */
  checkUsername: async (username: string) => {
    const response = await apiClient.get<{ available: boolean }>(`/auth/check-username?username=${username}`);
    return response.data;
  },

  /**
 * Регистрация токена устройства для push-уведомлений
 * @param deviceData Данные устройства
 * @returns Результат регистрации
 */
registerDeviceToken: async (deviceData: DeviceTokenRequest) => {
  console.log(`UserAPI: Registering device token: ${deviceData.token.substring(0, 10)}...`);

  // Добавляем таймаут для API-запроса, чтобы избежать долгого ожидания
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 секунд таймаут

  try {
    const response = await apiClient.post('/device/register', deviceData, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    console.log('UserAPI: Token registration successful:', response.data);
    return response.data;
  } catch (error) {
    clearTimeout(timeoutId);

    // Проверяем, было ли прервано из-за таймаута
    if (error.name === 'AbortError') {
      console.warn('UserAPI: Token registration request timed out');
      return {
        message: 'Время ожидания регистрации истекло, но устройство может быть зарегистрировано.',
        success: true,
        timedOut: true
      };
    }

    console.error('UserAPI: Error registering device token:', error);
    throw error;
  }
},

  /**
   * Генерация логина на основе ФИО
   * Может быть реализована на сервере или на клиенте
   * @param fullName Полное имя пользователя
   * @returns Сгенерированный логин
   */
  generateUsername: async (fullName: string) => {
    const response = await apiClient.post<{ username: string }>('/auth/generate-username', { fullName });
    return response.data;
  }
};

export default authApi;