import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Базовый URL вашего API-сервера
export const API_URL = 'http://192.168.1.11:5001/api';

// Создаем экземпляр axios с базовыми настройками
const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  timeout: 15000, // 15 секунд таймаут
});

// Интерцептор для добавления токена авторизации в запросы
apiClient.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync('userToken');
    if (token && config.headers) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Интерцептор для обработки ответов и ошибок
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Если ошибка 401 (Unauthorized) и запрос еще не повторялся
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Здесь можно добавить логику обновления токена при необходимости

      // Если не удалось обновить токен, выходим из системы
      await SecureStore.deleteItemAsync('userToken');

      // Перенаправление на экран входа будет выполнено через AuthContext
      return Promise.reject(error);
    }

    // Формируем читаемое сообщение об ошибке
    let errorMessage = 'Произошла ошибка при запросе';

    if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.message) {
      errorMessage = error.message;
    }

    // Если нет соединения с сервером
    if (error.message === 'Network Error') {
      errorMessage = 'Ошибка сети. Проверьте подключение к интернету';
    }

    // Если сервер не отвечает
    if (error.code === 'ECONNABORTED') {
      errorMessage = 'Сервер не отвечает. Попробуйте позже';
    }

    // Создаем объект ошибки с читаемым сообщением
    const customError = new Error(errorMessage);
    return Promise.reject(customError);
  }
);

export default apiClient;