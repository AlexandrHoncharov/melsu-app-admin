// Исправленный хук usePushNotifications с защитой от дублирования
import { useState, useEffect, useRef } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform, Alert } from 'react-native';
import { useAuth } from './useAuth';
import userApi from '../src/api/userApi';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Настройка обработчика уведомлений
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ID проекта Expo
const EXPO_PROJECT_ID = 'd9591f01-e110-4918-8b09-c422bd23baaf';

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

    console.log('[PushNotification] Starting push token registration...');

    if (!Device.isDevice) {
      console.log('[PushNotification] Not a physical device, skipping');
      setRegistrationError('Push notifications require a physical device');
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
      }

      // Проверяем/запрашиваем разрешения
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      console.log('[PushNotification] Permission status:', existingStatus);

      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        console.log('[PushNotification] Requesting permissions...');
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        setRegistrationError('Permission not granted for notifications');
        console.log('[PushNotification] Permission denied');
        return null;
      }

      // Получаем токен
      console.log('[PushNotification] Getting push token...');

      // Используем getExpoPushTokenAsync с корректным projectId
      token = (await Notifications.getExpoPushTokenAsync({
        projectId: EXPO_PROJECT_ID,
      })).data;

      console.log(`[PushNotification] Token obtained: ${token}`);
      return token;
    } catch (error) {
      console.error('[PushNotification] Error getting token:', error);
      setRegistrationError(`Error: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  // Регистрация токена на сервере
  const registerTokenWithServer = async (token: string) => {
    try {
      if (!isAuthenticated || !user) {
        console.log('[PushNotification] User not authenticated, skipping');
        return false;
      }

      console.log(`[PushNotification] Registering token with server: ${token.substring(0, 10)}...`);

      // Регистрируем токен через API
      const response = await userApi.registerDeviceToken({
        token,
        platform: Platform.OS,
        device_name: Device.modelName || 'Unknown',
        replace_existing: true
      });

      console.log('[PushNotification] Token registration response:', response);
      setTokenRegistered(true);
      return true;
    } catch (error) {
      console.error('[PushNotification] Server registration error:', error);
      setRegistrationError(`Server error: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  // Отправка тестового уведомления
  const sendTestNotification = async () => {
    try {
      if (!isAuthenticated) {
        throw new Error('User not authenticated');
      }

      if (!expoPushToken || !tokenRegistered) {
        throw new Error('Push token not registered. Please restart the app.');
      }

      console.log('[PushNotification] Sending test notification...');
      const result = await userApi.sendTestNotification();

      console.log('[PushNotification] Test result:', result);

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
      console.error('[PushNotification] Test notification error:', error);
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
    return {
      enabled: permissionStatus.status === 'granted',
      token: expoPushToken,
      tokenRegistered: tokenRegistered,
      error: registrationError,
      permissionStatus: permissionStatus.status,
    };
  };

  // Регистрация токена при изменении аутентификации
  useEffect(() => {
    let isMounted = true;

    // Регистрация токена
    const registerToken = async () => {
      // КРИТИЧЕСКАЯ ПРОВЕРКА: если регистрация уже выполняется, пропускаем
      if (globalRegistrationInProgress) {
        console.log('[PushNotification] Registration already in progress, skipping');
        return;
      }

      // КРИТИЧЕСКАЯ ПРОВЕРКА: если уже регистрировались для этого пользователя, пропускаем
      if (user?.id === lastRegisteredUserId && registrationAttemptedRef.current) {
        console.log('[PushNotification] Already registered for this user, skipping');
        return;
      }

      // Устанавливаем флаги для предотвращения повторной регистрации
      globalRegistrationInProgress = true;
      registrationAttemptedRef.current = true;

      console.log(`[PushNotification] Starting registration for user ${user?.id}`);

      try {
        // Получаем токен
        const token = await registerForPushNotificationsAsync();

        if (!token || !isMounted) {
          globalRegistrationInProgress = false;
          return;
        }

        // Устанавливаем токен в состоянии
        setExpoPushToken(token);

        // Регистрируем на сервере
        const success = await registerTokenWithServer(token);

        if (success && user?.id) {
          // Запоминаем ID пользователя, для которого зарегистрировали токен
          lastRegisteredUserId = user.id;
        }
      } catch (error) {
        console.error('[PushNotification] Error in registration process:', error);
      } finally {
        // Снимаем глобальный флаг
        globalRegistrationInProgress = false;
      }
    };

    // Запускаем регистрацию, если пользователь аутентифицирован
    if (isAuthenticated && user?.id) {
      console.log(`[PushNotification] User ${user.id} authenticated, registering token`);
      registerToken();
    }

    // Настройка слушателей уведомлений
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('[PushNotification] Notification received');
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('[PushNotification] Notification clicked');
      const data = response.notification.request.content.data;

      // Навигация в зависимости от типа уведомления
      if (data?.type === 'chat_message' && data?.chat_id) {
        router.push(`/chat/${data.chat_id}`);
      } else if (data?.type === 'verification') {
        router.push('/verification');
      }
    });

    return () => {
      isMounted = false;
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, [isAuthenticated, user?.id]);

  return {
    expoPushToken,
    notification,
    sendTestNotification,
    tokenRegistered,
    registrationError,
    getNotificationStatus
  };
}