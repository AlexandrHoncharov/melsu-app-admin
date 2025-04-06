// Enhanced version of usePushNotifications.tsx
import { useState, useEffect, useRef } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform, Alert } from 'react-native';
import { useAuth } from './useAuth';
import userApi from '../src/api/userApi';

// Настраиваем обработчик уведомлений
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Убедитесь, что это ваш актуальный ID проекта Expo
const EXPO_PROJECT_ID = 'd1d392dc-7c18-458b-a129-42c81332f250';

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [tokenRegistered, setTokenRegistered] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();
  const { isAuthenticated, user } = useAuth();

  async function registerForPushNotificationsAsync() {
    let token;

    setRegistrationError(null);

    if (!Device.isDevice) {
      setRegistrationError('Push notifications require a physical device and won\'t work in simulators/emulators');
      Alert.alert(
        'Требуется физическое устройство',
        'Push-уведомления не работают в эмуляторах или симуляторах. Используйте физическое устройство.'
      );
      return null;
    }

    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#770002',
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        setRegistrationError('Permission not granted for notifications');
        return null;
      }

      token = (await Notifications.getExpoPushTokenAsync({
        projectId: EXPO_PROJECT_ID,
      })).data;

      console.log('Push token obtained:', token);
      return token;
    } catch (error) {
      console.error('Error getting push token:', error);
      setRegistrationError(`Error obtaining push token: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  // Регистрация токена на сервере с улучшенной обработкой ошибок
  const registerTokenWithServer = async (token: string) => {
    try {
      if (!isAuthenticated || !user) {
        setRegistrationError('User not authenticated');
        return false;
      }

      const response = await userApi.registerDeviceToken({
        token,
        platform: Platform.OS,
        device_name: Device.modelName || 'Unknown'
      });

      console.log('Device token registered with server:', response);
      setTokenRegistered(true);
      return true;
    } catch (error) {
      console.error('Error registering device token:', error);
      setRegistrationError(`Failed to register device token: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  // Отправка тестового уведомления с подробной информацией
  const sendTestNotification = async () => {
    try {
      if (!isAuthenticated) {
        throw new Error('User not authenticated');
      }

      if (!expoPushToken || !tokenRegistered) {
        throw new Error('Push token not registered. Please restart the app.');
      }

      console.log('Sending test notification request...');
      const result = await userApi.sendTestNotification();

      console.log('Test notification result:', result);

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
      console.error('Error sending test notification:', error);
      Alert.alert(
        'Ошибка отправки',
        `Не удалось отправить тестовое уведомление: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  };

  // Проверка статуса push-уведомлений
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

  useEffect(() => {
    // Регистрируем токен только если пользователь авторизован
    let isMounted = true;

    const registerToken = async () => {
      if (isAuthenticated) {
        const token = await registerForPushNotificationsAsync();
        if (token && isMounted) {
          setExpoPushToken(token);
          await registerTokenWithServer(token);
        }
      }
    };

    registerToken();

    // Настраиваем слушатели уведомлений
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification clicked:', response);
      // Здесь можно обработать нажатие на уведомление
      const data = response.notification.request.content.data;

      if (data?.type === 'verification') {
        // Можно выполнить навигацию на соответствующий экран
        console.log('Verification notification clicked:', data);
      }
    });

    return () => {
      isMounted = false;
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, [isAuthenticated, user]);

  return {
    expoPushToken,
    notification,
    sendTestNotification,
    tokenRegistered,
    registrationError,
    getNotificationStatus
  };
}