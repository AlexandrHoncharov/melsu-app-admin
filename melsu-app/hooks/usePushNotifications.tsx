// Создайте новый файл hooks/usePushNotifications.tsx
import { useState, useEffect, useRef } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
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

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();
  const { isAuthenticated, user } = useAuth();

  async function registerForPushNotificationsAsync() {
    let token;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#770002',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return;
      }

      token = (await Notifications.getExpoPushTokenAsync({
        projectId: '7f243570-a2d0-46c9-b6b0-7d2ea0c98456', // Замените на ID вашего проекта Expo
      })).data;
    } else {
      console.log('Must use physical device for Push Notifications');
    }

    return token;
  }

  // Регистрация токена на сервере
  const registerTokenWithServer = async (token: string) => {
    try {
      if (!isAuthenticated || !user) return;

      await userApi.registerDeviceToken({
        token,
        platform: Platform.OS,
        device_name: Device.modelName || 'Unknown'
      });

      console.log('Device token registered with server');
    } catch (error) {
      console.error('Error registering device token:', error);
    }
  };

  // Отправка тестового уведомления
  const sendTestNotification = async () => {
    try {
      if (!isAuthenticated) return;

      const result = await userApi.sendTestNotification();
      return result;
    } catch (error) {
      console.error('Error sending test notification:', error);
      throw error;
    }
  };

  useEffect(() => {
    // Регистрируем токен только если пользователь авторизован
    if (isAuthenticated) {
      registerForPushNotificationsAsync().then(token => {
        if (token) {
          setExpoPushToken(token);
          registerTokenWithServer(token);
        }
      });
    }

    // Настраиваем слушатели уведомлений
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      // Здесь можно обработать нажатие на уведомление
      const data = response.notification.request.content.data;

      if (data?.type === 'verification') {
        // Можно выполнить навигацию на соответствующий экран
        console.log('Verification notification clicked:', data);
      }
    });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, [isAuthenticated, user]);

  return {
    expoPushToken,
    notification,
    sendTestNotification
  };
}