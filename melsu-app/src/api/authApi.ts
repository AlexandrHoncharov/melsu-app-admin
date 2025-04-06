import apiClient from './apiClient';

// Типы для запросов
interface LoginRequest {
  username: string;
  password: string;
}

interface RegisterRequest {
  username?: string; // Может генерироваться на сервере
  fullName: string;
  password: string;
  group: string;
  role: 'student' | 'teacher';
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
    role: userData.role
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
   * Выход из системы (если требуется на сервере)
   * @returns Результат выхода
   */
  logout: async () => {
    try {
      await apiClient.post('/auth/logout');
      return { success: true };
    } catch (error) {
      // Даже если запрос не удался, мы все равно хотим выйти из системы
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