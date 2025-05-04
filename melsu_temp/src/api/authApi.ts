// src/api/authApi.ts
import apiClient from './apiClient';

// Обновленный интерфейс для запроса на вход
interface LoginRequest {
    username?: string;  // Теперь опционально
    email?: string;     // Добавляем опциональное поле email
    password: string;   // Пароль всегда обязателен
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
    email: string;  // Email обязателен при регистрации
    password: string;
    group?: string;
    role: 'student' | 'teacher';
    speciality?: SpecialityData;
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
        verificationStatus?: 'unverified' | 'pending' | 'verified' | 'rejected';
        speciality?: SpecialityData;
    };
}

interface DeviceTokenRequest {
    token: string;
    platform: string;
    device_name?: string;
    replace_existing?: boolean;
}

// API для работы с авторизацией
const authApi = {
    /**
     * Аутентификация пользователя по логину или email
     * @param identifier Имя пользователя или email
     * @param password Пароль
     * @returns Результат авторизации
     */
    login: async (identifier: string, password: string): Promise<AuthResponse> => {
        try {
            // Определяем, является ли идентификатор логином или email
            const isEmail = identifier.includes('@');

            // Формируем запрос в зависимости от типа идентификатора
            const credentials: LoginRequest = {
                password
            };

            if (isEmail) {
                credentials.email = identifier;
            } else {
                credentials.username = identifier;
            }

            const response = await apiClient.post<AuthResponse>('/auth/login', credentials);

            // Log response for debugging
            console.log('Login API response:', response.data);

            return response.data;
        } catch (error) {
            console.error('Login API error:', error);
            throw error;
        }
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
            email: userData.email,  // Include email in the request
            password: userData.password,
            group: userData.group,
            role: userData.role,
            speciality: userData.speciality
        };

        console.log('Register API request:', requestData);

        try {
            const response = await apiClient.post<AuthResponse>('/auth/register', requestData);

            // Log response for debugging
            console.log('Register API response:', response.data);

            return response.data;
        } catch (error) {
            console.error('Register API error:', error);
            throw error;
        }
    },

    /**
     * Проверка валидности токена и получение текущего пользователя
     * @returns Данные текущего пользователя
     */
    getCurrentUser: async () => {
        try {
            const response = await apiClient.get<AuthResponse['user']>('/user/profile');

            // Log response for debugging
            console.log('Get current user API response:', response.data);

            return response.data;
        } catch (error) {
            console.error('Get current user API error:', error);
            throw error;
        }
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
            return {success: true};
        } catch (error) {
            // Даже если запрос не удался, мы все равно хотим выйти из системы
            console.warn('Error during logout API call (ignored):', error);
            return {success: true};
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
        const response = await apiClient.post<{ username: string }>('/auth/generate-username', {fullName});
        return response.data;
    }
};

export default authApi;