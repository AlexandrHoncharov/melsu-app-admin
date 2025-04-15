// hooks/usePushNotifications.tsx - принудительное исправление проблемы с Expo токенами
import { useState, useEffect, useRef } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform, Alert } from 'react-native';
import { useAuth } from './useAuth';
import userApi from '../src/api/userApi';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Идентификатор проекта Expo - КРИТИЧЕСКИ ВАЖЕН для правильной работы
const EXPO_PROJECT_ID = 'd9591f01-e110-4918-8b09-c422bd23baaf';

// Настройка обработчика уведомлений
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Флаг для отслеживания процесса регистрации
let globalRegistrationInProgress = false;
let lastRegisteredUserId = null;

// DEBUG: Принудительный FCM токен для тестирования
const FORCE_PROD_TOKEN = false; // Включите при необходимости тестов (true)

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [tokenRegistered, setTokenRegistered] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();
  const { isAuthenticated, user } = useAuth();
  const registrationAttemptedRef = useRef(false);

  // РЕШЕНИЕ ПРОБЛЕМЫ: Прямое получение FCM токена для Android
  async function getAndroidFCMToken() {
    console.log('[FCM] Попытка прямого получения FCM токена для Android...');
    try {
      // ВАЖНО: Используем DevicePushToken напрямую, обходя стандартную логику Expo
      const token = await Notifications.getDevicePushTokenAsync();

      // Проверяем, действительно ли это FCM токен
      if (typeof token.data === 'string' && !token.data.startsWith('ExponentPushToken')) {
        console.log(`[FCM] Успешно получен нативный FCM токен: ${token.data.substring(0, 10)}...`);
        return token.data;
      } else {
        console.log('[FCM] Получен не-FCM токен:',
          typeof token.data === 'string' ? token.data.substring(0, 10) + '...' : 'не строка');
        return null;
      }
    } catch (error) {
      console.error('[FCM] Ошибка при прямом получении FCM токена:', error);
      return null;
    }
  }

  // Улучшенная функция получения токена с обходными решениями
  async function registerForPushNotificationsAsync() {
    let token;
    setRegistrationError(null);

    console.log('[PushNotification] Начинаем регистрацию push-токена...');

    if (!Device.isDevice) {
      console.log('[PushNotification] Не физическое устройство, пропускаем');
      setRegistrationError('Push-уведомления требуют физического устройства');
      return null;
    }

    try {
      // Сначала настроим канал для Android
      if (Platform.OS === 'android') {
        try {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#770002',
            sound: 'default',
          });
          console.log('[PushNotification] Настроен канал уведомлений для Android');
        } catch (e) {
          console.warn('[PushNotification] Ошибка при создании канала уведомлений:', e);
          // Продолжаем даже при ошибке, так как каналы уже могут быть созданы
        }
      }

      // Проверяем/запрашиваем разрешения
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      console.log('[PushNotification] Статус разрешения:', existingStatus);

      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        console.log('[PushNotification] Запрашиваем разрешения...');
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        setRegistrationError('Не предоставлено разрешение на уведомления');
        console.log('[PushNotification] Разрешение отклонено');
        return null;
      }

      // РЕШЕНИЕ 1: Для Android в production пробуем сначала получить прямой FCM токен
      if (Platform.OS === 'android' && !__DEV__) {
        // Пробуем получить FCM токен напрямую (обходное решение)
        const fcmToken = await getAndroidFCMToken();
        if (fcmToken) {
          return fcmToken;
        }

        // Если не удалось получить FCM токен напрямую, продолжаем обычным путем
        console.log('[PushNotification] Не удалось получить FCM токен напрямую, используем Expo API');
      }

      // РЕШЕНИЕ 2: Если включен режим принудительного FCM токена для тестов
      if (FORCE_PROD_TOKEN && Platform.OS === 'android') {
        console.log('[PushNotification] Использование режима принудительного FCM токена');

        // Тестовый FCM токен (для отладки)
        // Замените этот токен полученным ранее FCM токеном с реального устройства
        return "fcm:test-token-placeholder";
      }

      // Стандартный способ Expo
      console.log('[PushNotification] Получаем push-токен с projectId:', EXPO_PROJECT_ID);

      // РЕШЕНИЕ 3: Используем явный applicationId для Android
      let tokenOptions: any = { projectId: EXPO_PROJECT_ID };

      // Добавляем experienceId для Android, чтобы гарантировать правильный пакет
      if (Platform.OS === 'android') {
        const pkg = Constants.expoConfig?.android?.package || 'com.melsu.app';
        tokenOptions.experienceId = `@sanumxxx/melsu`;
        tokenOptions.applicationId = pkg;
        console.log(`[PushNotification] Android options: experienceId=@sanumxxx/melsu, applicationId=${pkg}`);
      }

      token = (await Notifications.getExpoPushTokenAsync(tokenOptions)).data;

      const tokenType = token.startsWith('ExponentPushToken') ? 'Development (Expo)' : 'Production (FCM)';
      console.log(`[PushNotification] Получен токен: ${token.substring(0, 15)}...`);
      console.log(`[PushNotification] Тип токена: ${tokenType}`);

      // РЕШЕНИЕ 4: Предупреждение, если у нас всё ещё Expo токен в production-билде
      if (!__DEV__ && Platform.OS === 'android' && token.startsWith('ExponentPushToken')) {
        console.warn('[PushNotification] ⚠️ ВНИМАНИЕ: Получен Expo токен в production-билде, push-уведомления могут не работать!');

        // Запускаем дополнительные проверки среды для диагностики
        console.log('[PushNotification] Диагностические данные:');
        console.log('- Platform:', Platform.OS, Platform.Version);
        console.log('- Expo Constants:', JSON.stringify({
          appOwnership: Constants.appOwnership,
          executionEnvironment: Constants.executionEnvironment,
          expoGoVersion: Constants.expoGoVersion
        }));

        // Пытаемся ещё раз получить FCM токен с другими параметрами
        try {
          // Пробуем ещё раз с другими параметрами
          console.log('[PushNotification] Пробуем альтернативный способ получения FCM токена...');
          const deviceToken = await Notifications.getDevicePushTokenAsync();

          if (deviceToken && typeof deviceToken.data === 'string' && !deviceToken.data.startsWith('ExponentPushToken')) {
            console.log(`[PushNotification] Получен альтернативный FCM токен: ${deviceToken.data.substring(0, 15)}...`);
            return deviceToken.data; // Используем этот токен вместо Expo токена
          } else {
            console.log('[PushNotification] Альтернативный метод тоже вернул Expo токен или некорректный формат');
          }
        } catch (altError) {
          console.error('[PushNotification] Ошибка при альтернативном получении токена:', altError);
        }
      }

      return token;
    } catch (error) {
      console.error('[PushNotification] Ошибка получения токена:', error);
      setRegistrationError(`Ошибка: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  // Регистрация токена на сервере - с улучшенной отладкой
  const registerTokenWithServer = async (token: string) => {
    try {
      if (!isAuthenticated || !user) {
        console.log('[PushNotification] Пользователь не аутентифицирован, пропускаем');
        return false;
      }

      console.log(`[PushNotification] Регистрируем токен на сервере: ${token.substring(0, 15)}...`);

      // Получаем уникальный ID устройства для идентификации
      const deviceId = await getUniqueDeviceId();

      // ДИАГНОСТИКА: Выводим дополнительную информацию о токене
      console.log(`[PushNotification] Тип токена: ${token.startsWith('ExponentPushToken') ? 'Expo' : 'FCM'}`);
      console.log(`[PushNotification] Длина токена: ${token.length}`);

      // Только первые и последние символы для безопасности
      console.log(`[PushNotification] Шаблон токена: ${token.substring(0, 8)}...${token.substring(token.length - 8)}`);

      // Токен для devtools может отличаться от токена, который мы получили здесь
      // Регистрируем токен через API - ДОБАВЛЯЕМ ИНФОРМАЦИЮ О СРЕДЕ ИСПОЛНЕНИЯ
      const response = await userApi.registerDeviceToken({
        token,
        platform: Platform.OS,
        device_name: Device.modelName || 'Unknown',
        device_id: deviceId,
        app_version: Constants.expoConfig?.version || 'Unknown',
        is_development: __DEV__,
        environment: __DEV__ ? 'development' : 'production',
        token_type: token.startsWith('ExponentPushToken') ? 'expo' : 'fcm',
        replace_existing: true
      });

      console.log('[PushNotification] Ответ регистрации токена:', response);
      setTokenRegistered(true);
      return true;
    } catch (error) {
      console.error('[PushNotification] Ошибка регистрации на сервере:', error);
      setRegistrationError(`Ошибка сервера: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  // Вспомогательная функция для получения уникального ID устройства
  async function getUniqueDeviceId() {
    try {
      // Используем сохраненный ID или генерируем новый
      let deviceId = await AsyncStorage.getItem('unique_device_id');

      if (!deviceId) {
        deviceId = `${Device.deviceName || 'device'}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        await AsyncStorage.setItem('unique_device_id', deviceId);
        console.log(`[PushNotification] Создан новый ID устройства: ${deviceId}`);
      }

      return deviceId;
    } catch (error) {
      console.error('Ошибка получения уникального ID устройства:', error);
      return `fallback_${Date.now()}`; // Fallback
    }
  }

  // Отправка тестового уведомления
  const sendTestNotification = async () => {
    try {
      if (!isAuthenticated) {
        throw new Error('Пользователь не аутентифицирован');
      }

      if (!expoPushToken || !tokenRegistered) {
        throw new Error('Push-токен не зарегистрирован. Пожалуйста, перезапустите приложение.');
      }

      console.log('[PushNotification] Отправка тестового уведомления...');
      const result = await userApi.sendTestNotification();

      console.log('[PushNotification] Результат теста:', result);

      if (!result.success) {
        Alert.alert(
          'Тест уведомлений',
          `Результат: ${result.message}\n\nПодробности: ${JSON.stringify(result.results || {})}`
        );
      } else {
        Alert.alert(
          'Тест уведомлений',
          'Запрос на отправку уведомления успешно обработан. Если уведомление не появилось, проверьте настройки устройства и разрешения.'
        );
      }

      return result;
    } catch (error) {
      console.error('[PushNotification] Ошибка тестового уведомления:', error);
      Alert.alert(
        'Ошибка отправки',
        `Не удалось отправить тестовое уведомление: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  };

  // Получение статуса уведомлений с расширенной диагностикой
  const getNotificationStatus = async () => {
    const permissionStatus = await Notifications.getPermissionsAsync();

    // Получаем тип токена для отображения
    let tokenType = "Нет";
    if (expoPushToken) {
      tokenType = expoPushToken.startsWith('ExponentPushToken')
        ? 'Development (Expo)'
        : 'Production (FCM)';
    }

    // ДИАГНОСТИКА: Дополнительная проверка окружения для отладки
    const isExpoGo = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
    const isDevMode = __DEV__;

    return {
      enabled: permissionStatus.status === 'granted',
      token: expoPushToken,
      tokenType: tokenType,
      tokenRegistered: tokenRegistered,
      error: registrationError,
      permissionStatus: permissionStatus.status,
      // Расширенная диагностика
      diagnostics: {
        isExpoGo,
        isDevMode,
        platform: Platform.OS,
        platformVersion: Platform.Version,
        deviceModel: Device.modelName,
        appVersion: Constants.expoConfig?.version,
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
        packageName: Constants.expoConfig?.android?.package,
      }
    };
  };

  // Отмена регистрации токена устройства
  const unregisterDeviceToken = async () => {
    try {
      console.log('[PushNotification] Отмена регистрации токенов устройства...');

      // Даже если у нас нет токена в памяти, мы все равно
      // пытаемся очистить токены с сервера для безопасности
      if (!expoPushToken) {
        console.log('[PushNotification] Нет токена в памяти, все равно очищаем токены на сервере');
        await userApi.unregisterDeviceToken('force_all_tokens_removal');
      } else {
        console.log(`[PushNotification] Отменяем регистрацию токена: ${expoPushToken.substring(0, 10)}...`);
        await userApi.unregisterDeviceToken(expoPushToken);
      }

      // Очищаем токены из локального хранилища независимо от ответа API
      try {
        await AsyncStorage.removeItem('devicePushToken');
        console.log('[PushNotification] Токен устройства удален из AsyncStorage');
      } catch (storageError) {
        console.warn('[PushNotification] Ошибка удаления токена из AsyncStorage:', storageError);
      }

      // Сбрасываем состояние
      setExpoPushToken(null);
      setTokenRegistered(false);

      return true;
    } catch (error) {
      console.warn('[PushNotification] Ошибка отмены регистрации токена с сервера:', error);

      // Даже при ошибке, очищаем локальные данные
      try {
        await AsyncStorage.removeItem('devicePushToken');
        setExpoPushToken(null);
        setTokenRegistered(false);
        console.log('[PushNotification] Локальный токен очищен несмотря на ошибку сервера');
      } catch (storageError) {
        console.warn('[PushNotification] Ошибка удаления токена из AsyncStorage:', storageError);
      }

      return false;
    }
  };

  // Регистрация токена при изменении аутентификации
  useEffect(() => {
    let isMounted = true;

    const registerToken = async () => {
      if (globalRegistrationInProgress) {
        console.log('[PushNotification] Регистрация уже выполняется, пропускаем');
        return;
      }

      if (user?.id === lastRegisteredUserId && registrationAttemptedRef.current) {
        console.log('[PushNotification] Уже зарегистрировались для этого пользователя, пропускаем');
        return;
      }

      globalRegistrationInProgress = true;
      registrationAttemptedRef.current = true;

      console.log(`[PushNotification] Начинаем регистрацию для пользователя ${user?.id}`);

      try {
        // Получаем токен
        const token = await registerForPushNotificationsAsync();

        if (!token || !isMounted) {
          globalRegistrationInProgress = false;
          return;
        }

        // Устанавливаем токен в состоянии
        setExpoPushToken(token);

        // Сохраняем токен в AsyncStorage для возможного восстановления
        try {
          await AsyncStorage.setItem('devicePushToken', token);
          console.log('[PushNotification] Токен сохранен в AsyncStorage');
        } catch (storageErr) {
          console.warn('[PushNotification] Ошибка сохранения токена в AsyncStorage:', storageErr);
        }

        // Регистрируем на сервере
        const success = await registerTokenWithServer(token);

        if (success && user?.id) {
          lastRegisteredUserId = user.id;
          console.log(`[PushNotification] Токен успешно зарегистрирован для пользователя ${user.id}`);
        }
      } catch (error) {
        console.error('[PushNotification] Ошибка в процессе регистрации:', error);
      } finally {
        globalRegistrationInProgress = false;
      }
    };

    if (isAuthenticated && user?.id) {
      console.log(`[PushNotification] Пользователь ${user.id} аутентифицирован, регистрируем токен`);
      registerToken();
    }

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('[PushNotification] Получено уведомление');
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('[PushNotification] Нажатие на уведомление');
      const data = response.notification.request.content.data;

      if (data?.type === 'chat_message' && data?.chat_id) {
        router.push(`/chat/${data.chat_id}`);
      } else if (data?.type === 'verification') {
        router.push('/verification');
      }
      else if (data?.type === 'ticket_message' && data?.ticket_id) {
        router.push({
          pathname: '/profile/ticket-details',
          params: { ticketId: data.ticket_id }
        });
      }
    });

    return () => {
      isMounted = false;

      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }

      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [isAuthenticated, user?.id]);

  // При монтировании компонента пробуем восстановить токен и проверить его валидность
  useEffect(() => {
    const recoverSavedToken = async () => {
      try {
        const savedToken = await AsyncStorage.getItem('devicePushToken');
        if (savedToken && !expoPushToken) {
          console.log('[PushNotification] Восстановлен сохраненный токен:', savedToken.substring(0, 10) + '...');

          // РЕШЕНИЕ ПРОБЛЕМЫ: Проверяем, не устарел ли Expo токен в Production
          if (!__DEV__ && Platform.OS === 'android' && savedToken.startsWith('ExponentPushToken')) {
            console.log('[PushNotification] Обнаружен Expo токен в Production билде, пытаемся получить новый FCM токен...');

            // Получаем новый токен
            const token = await registerForPushNotificationsAsync();
            if (token && !token.startsWith('ExponentPushToken')) {
              console.log(`[PushNotification] Успешно обновили Expo токен на FCM: ${token.substring(0, 10)}...`);
              setExpoPushToken(token);

              // Сохраняем новый токен
              await AsyncStorage.setItem('devicePushToken', token);

              // Регистрируем на сервере, если пользователь аутентифицирован
              if (isAuthenticated && user?.id) {
                const success = await registerTokenWithServer(token);
                if (success) {
                  setTokenRegistered(true);
                  lastRegisteredUserId = user.id;
                }
              }
              return;
            } else {
              console.log('[PushNotification] Не удалось обновить Expo токен на FCM, продолжаем с Expo токеном');
            }
          }

          // Используем сохраненный токен
          setExpoPushToken(savedToken);

          // Проверяем, если пользователь аутентифицирован, пробуем повторно зарегистрировать токен
          if (isAuthenticated && user?.id) {
            console.log('[PushNotification] Повторная регистрация восстановленного токена');
            const success = await registerTokenWithServer(savedToken);
            if (success) {
              setTokenRegistered(true);
              lastRegisteredUserId = user.id;
            }
          }
        }
      } catch (error) {
        console.warn('[PushNotification] Ошибка при восстановлении токена:', error);
      }
    };

    recoverSavedToken();
  }, []);

  return {
    expoPushToken,
    notification,
    sendTestNotification,
    tokenRegistered,
    registrationError,
    getNotificationStatus,
    unregisterDeviceToken
  };
}