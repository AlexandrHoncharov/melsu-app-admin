// hooks/usePushNotifications.tsx
import { useState, useEffect, useRef } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform, Alert } from 'react-native';
import { useAuth } from './useAuth';
import userApi from '../src/api/userApi';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ID проекта Expo (должен совпадать с projectId в app.json/app.config.js)
const EXPO_PROJECT_ID = 'd9591f01-e110-4918-8b09-c422bd23baaf';

// Настройка обработчика уведомлений
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Глобальная переменная для отслеживания процесса регистрации
// Это предотвратит двойную регистрацию даже между разными экземплярами хука
let globalRegistrationInProgress = false;
let lastRegisteredUserId = null;

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [tokenRegistered, setTokenRegistered] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();
  const { isAuthenticated, user } = useAuth();

  // Ref для отслеживания, была ли попытка регистрации токена
  const registrationAttemptedRef = useRef(false);

  // Получение токена устройства
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
      // Настраиваем канал для Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#770002',
        });
        console.log('[PushNotification] Настроен канал уведомлений для Android');
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

      // Получаем токен с указанием projectId
      console.log('[PushNotification] Получаем push-токен с projectId:', EXPO_PROJECT_ID);

      // ВАЖНО! В production build, этот метод вернет FCM токен, а не ExponentPushToken
      token = (await Notifications.getExpoPushTokenAsync({
        projectId: EXPO_PROJECT_ID,
      })).data;

      // Логируем информацию о типе токена
      const tokenType = token.startsWith('ExponentPushToken') ? 'Development (Expo)' : 'Production (FCM)';
      console.log(`[PushNotification] Получен токен: ${token.substring(0, 10)}...`);
      console.log(`[PushNotification] Тип токена: ${tokenType}`);

      return token;
    } catch (error) {
      console.error('[PushNotification] Ошибка получения токена:', error);
      setRegistrationError(`Ошибка: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  // Регистрация токена на сервере
  const registerTokenWithServer = async (token: string) => {
    try {
      if (!isAuthenticated || !user) {
        console.log('[PushNotification] Пользователь не аутентифицирован, пропускаем');
        return false;
      }

      console.log(`[PushNotification] Регистрируем токен на сервере: ${token.substring(0, 10)}...`);

      // Получаем уникальный ID устройства для идентификации
      const deviceId = await getUniqueDeviceId();

      // Регистрируем токен через API
      const response = await userApi.registerDeviceToken({
        token,
        platform: Platform.OS,
        device_name: Device.modelName || 'Unknown',
        device_id: deviceId,
        app_version: Device.osVersion || 'Unknown',
        is_development: token.startsWith('ExponentPushToken'),
        replace_existing: true // Заменять существующие токены для этого устройства
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

  // Получение статуса уведомлений
  const getNotificationStatus = async () => {
    const permissionStatus = await Notifications.getPermissionsAsync();

    // Получаем тип токена для отображения
    let tokenType = "Нет";
    if (expoPushToken) {
      tokenType = expoPushToken.startsWith('ExponentPushToken')
        ? 'Development (Expo)'
        : 'Production (FCM)';
    }

    return {
      enabled: permissionStatus.status === 'granted',
      token: expoPushToken,
      tokenType: tokenType,
      tokenRegistered: tokenRegistered,
      error: registrationError,
      permissionStatus: permissionStatus.status,
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

    // Регистрация токена
    const registerToken = async () => {
      // КРИТИЧЕСКАЯ ПРОВЕРКА: если регистрация уже выполняется, пропускаем
      if (globalRegistrationInProgress) {
        console.log('[PushNotification] Регистрация уже выполняется, пропускаем');
        return;
      }

      // КРИТИЧЕСКАЯ ПРОВЕРКА: если уже регистрировались для этого пользователя, пропускаем
      if (user?.id === lastRegisteredUserId && registrationAttemptedRef.current) {
        console.log('[PushNotification] Уже зарегистрировались для этого пользователя, пропускаем');
        return;
      }

      // Устанавливаем флаги для предотвращения повторной регистрации
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
          // Запоминаем ID пользователя, для которого зарегистрировали токен
          lastRegisteredUserId = user.id;
          console.log(`[PushNotification] Токен успешно зарегистрирован для пользователя ${user.id}`);
        }
      } catch (error) {
        console.error('[PushNotification] Ошибка в процессе регистрации:', error);
      } finally {
        // Снимаем глобальный флаг
        globalRegistrationInProgress = false;
      }
    };

    // Запускаем регистрацию, если пользователь аутентифицирован
    if (isAuthenticated && user?.id) {
      console.log(`[PushNotification] Пользователь ${user.id} аутентифицирован, регистрируем токен`);
      registerToken();
    }

    // Настройка слушателей уведомлений
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('[PushNotification] Получено уведомление');
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('[PushNotification] Нажатие на уведомление');
      const data = response.notification.request.content.data;

      // Навигация в зависимости от типа уведомления
      if (data?.type === 'chat_message' && data?.chat_id) {
        router.push(`/chat/${data.chat_id}`);
      } else if (data?.type === 'verification') {
        router.push('/verification');
      }
      else if (data?.type === 'ticket_message' && data?.ticket_id) {
        // Переход на страницу тикета при нажатии на уведомление о новом сообщении в тикете
        router.push({
          pathname: '/profile/ticket-details',
          params: { ticketId: data.ticket_id }
        });
      }
    });

    return () => {
      isMounted = false;

      // Отписываемся от слушателей при размонтировании
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }

      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [isAuthenticated, user?.id]);

  // При монтировании компонента, пробуем восстановить токен из хранилища
  useEffect(() => {
    const recoverSavedToken = async () => {
      try {
        const savedToken = await AsyncStorage.getItem('devicePushToken');
        if (savedToken && !expoPushToken) {
          console.log('[PushNotification] Восстановлен сохраненный токен:', savedToken.substring(0, 10) + '...');
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