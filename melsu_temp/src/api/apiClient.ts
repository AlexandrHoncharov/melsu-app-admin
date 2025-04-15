import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Базовый URL вашего API-сервера
export const API_URL = 'http://192.168.0.4:5001/api';

// Создаем экземпляр axios с базовыми настройками
const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  timeout: 15000, // 15 секунд таймаут
});

// Функция для отладки токена
const debugToken = async () => {
  try {
    const token = await SecureStore.getItemAsync('userToken');
    if (token) {
      // Логируем первые 10 и последние 5 символов токена для отладки
      console.log(`Текущий токен: ${token.substring(0, 10)}...${token.substring(token.length - 5)}`);

      // Проверяем структуру токена - должен быть JWT с тремя частями, разделенными точками
      const parts = token.split('.');
      if (parts.length !== 3) {
        console.warn(`Токен имеет неправильную структуру JWT! Частей: ${parts.length}`);
      } else {
        console.log('Токен имеет правильную структуру JWT (header.payload.signature)');

        // Для дополнительной отладки можно декодировать заголовок и полезную нагрузку
        try {
          const header = JSON.parse(atob(parts[0]));
          console.log('JWT Header:', header);
        } catch (e) {
          console.warn('Не удалось декодировать заголовок JWT:', e.message);
        }
      }
    } else {
      console.warn('Токен отсутствует в SecureStore');
    }
  } catch (e) {
    console.error('Ошибка при отладке токена:', e.message);
  }
};

// Список запросов, которые не должны вызывать удаление токена при ошибке 401
const SAFE_ENDPOINTS = [
  '/auth/firebase-token',
  '/device/register'
];

// Проверка, является ли запрос "безопасным" (не должен вызывать удаление токена)
const isSafeEndpoint = (url) => {
  return SAFE_ENDPOINTS.some(endpoint => url.includes(endpoint));
};

// Интерцептор для добавления токена авторизации в запросы
apiClient.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync('userToken');
    if (token && config.headers) {
      // ВАЖНОЕ ИЗМЕНЕНИЕ: Проверяем формат заголовка
      // Некоторые API требуют только token без слова "Bearer"
      // config.headers['Authorization'] = `Bearer ${token}`;

      // Меняем формат на просто токен без префикса "Bearer"
      config.headers['Authorization'] = `Bearer ${token}`;

      console.log(`Добавление токена в запрос: ${config.method?.toUpperCase() || 'GET'} ${config.url}`);

      // Отладка в первый раз для каждого запроса
      if (config.url && !config._tokenDebugged) {
        config._tokenDebugged = true;
        await debugToken();
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Флаг для отслеживания, было ли предупреждение о проблеме с токеном
let tokenWarningShown = false;

// Интерцептор для обработки ответов и ошибок
apiClient.interceptors.response.use(
  (response) => {
    // Сбрасываем флаг предупреждения при успешном запросе
    tokenWarningShown = false;
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const url = originalRequest?.url || '';

    console.log(`Ошибка ${error.response?.status || 'неизвестная'} при запросе ${originalRequest?.method?.toUpperCase() || 'GET'} ${url}`);

    // Проверяем, является ли запрос "безопасным" для токена
    const isSafe = isSafeEndpoint(url);

    // Если ошибка 401 (Unauthorized) и запрос еще не повторялся,
    // и это НЕ "безопасный" запрос
    if (error.response?.status === 401 && !originalRequest._retry && !isSafe) {
      originalRequest._retry = true;

      // Показываем предупреждение только один раз для лучшего UX
      if (!tokenWarningShown) {
        console.log('⚠️ Получен 401 Unauthorized - проблема с токеном, проверяем...');
        tokenWarningShown = true;

        // Отладка токена для понимания проблемы
        await debugToken();
      }

      // Проверяем, пробовали ли мы уже альтернативный формат авторизации
      if (!originalRequest._triedAlternativeAuth) {
        console.log('Пробуем альтернативный формат заголовка авторизации...');
        originalRequest._triedAlternativeAuth = true;

        // Получаем текущий токен
        const token = await SecureStore.getItemAsync('userToken');

        if (token) {
          // Пробуем альтернативный формат (только токен без "Bearer")
          originalRequest.headers['Authorization'] = token;

          try {
            console.log('Повторяем запрос с альтернативным форматом заголовка...');
            const response = await axios(originalRequest);
            console.log('✅ Запрос успешен с альтернативным форматом!');

            // Если успешно, изменяем формат для всех будущих запросов
            apiClient.interceptors.request.use(
              async (config) => {
                const token = await SecureStore.getItemAsync('userToken');
                if (token && config.headers) {
                  config.headers['Authorization'] = token; // Без "Bearer"
                }
                return config;
              },
              (error) => Promise.reject(error),
              { runWhen: (config) => !config._hadAuth }
            );

            return response;
          } catch (retryError) {
            console.log('❌ Альтернативный формат тоже не сработал:', retryError.message);
          }
        }
      }

      console.log('Получен 401 Unauthorized, удаление токена авторизации');
      await SecureStore.deleteItemAsync('userToken');

      // Перенаправление на экран входа будет выполнено через AuthContext
    }
    // Для "безопасных" запросов с ошибкой 401 не удаляем основной токен
    else if (isSafe && error.response?.status === 401) {
      console.log(`Ошибка авторизации для безопасного запроса (${url}), токен сохранен`);
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