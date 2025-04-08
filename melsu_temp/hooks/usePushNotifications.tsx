// File: hooks/usePushNotifications.tsx
import { useState, useEffect, useRef } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform, Alert } from 'react-native';
import { useAuth } from './useAuth';
import userApi from '../src/api/userApi';
import { router } from 'expo-router';

// Set up notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Make sure this is your actual Expo project ID
const EXPO_PROJECT_ID = 'd9591f01-e110-4918-8b09-c422bd23baaf';

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

  // Register token with server with improved error handling
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

  // Send test notification with detailed feedback
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

  // Check push notification status
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

  // Set up notification categories for iOS
  const configurePushNotifications = async () => {
    // Set notification categories for iOS
    if (Platform.OS === 'ios') {
      await Notifications.setNotificationCategoryAsync('chat', [
        {
          identifier: 'reply',
          buttonTitle: 'Ответить',
          options: {
            opensAppToForeground: true,
          },
        },
        {
          identifier: 'view',
          buttonTitle: 'Просмотреть',
          options: {
            opensAppToForeground: true,
          },
        },
      ]);
    }
  };

  useEffect(() => {
    // Register token only if user is authenticated
    let isMounted = true;

    const registerToken = async () => {
      if (isAuthenticated) {
        // Configure notification categories first
        await configurePushNotifications();

        const token = await registerForPushNotificationsAsync();
        if (token && isMounted) {
          setExpoPushToken(token);
          await registerTokenWithServer(token);
        }
      }
    };

    registerToken();

    // Set up notification listeners
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received in foreground:', notification);
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification clicked:', response);
      // Handle notification click
      const data = response.notification.request.content.data;

      // Handle notification based on type
      if (data?.type === 'chat_message' && data?.chat_id) {
        // Navigate to chat screen
        console.log('Navigating to chat:', data.chat_id);
        router.push(`/chat/${data.chat_id}`);
      } else if (data?.type === 'verification') {
        // Navigate to verification screen
        console.log('Verification notification clicked:', data);
        router.push('/verification');
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