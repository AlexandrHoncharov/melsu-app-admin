// hooks/useNotifications.tsx
import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useAuth } from './useAuth';
import notificationsApi from '../src/api/notificationsApi';
import { registerBackgroundNotificationHandler } from '../src/utils/backgroundNotificationHandler';

// Настройка обработчика уведомлений для переднего плана
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

type NotificationContextType = {
  pushToken: string | null;
  notification: Notifications.Notification | null;
  requestPermissions: () => Promise<boolean>;
  registerForPushNotifications: () => Promise<string | null>;
  sendLocalNotification: (title: string, body: string, data?: any) => Promise<string>;
  sendTestPushNotification: () => Promise<void>;
  notificationPermissionsGranted: boolean | null;
  isRegistered: boolean;
};

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }) {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [notificationPermissionsGranted, setNotificationPermissionsGranted] = useState<boolean | null>(null);
  const [isRegistered, setIsRegistered] = useState<boolean>(false);
  const { isAuthenticated, user } = useAuth();

  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  // Запрос разрешений на отправку уведомлений
  const requestPermissions = async () => {
    if (!Device.isDevice) {
      console.log('Уведомления недоступны на эмуляторе');
      return false;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Если разрешения еще нет, запрашиваем его
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      setNotificationPermissionsGranted(finalStatus === 'granted');
      return finalStatus === 'granted';
    } catch (error) {
      console.error('Ошибка при запросе разрешений на уведомления:', error);
      setNotificationPermissionsGranted(false);
      return false;
    }
  };

  // Получение токена для push-уведомлений
  const registerForPushNotifications = async () => {
    if (!Device.isDevice) {
      console.log('Push-уведомления недоступны на эмуляторе');
      return null;
    }

    try {
      // Сначала проверяем/запрашиваем разрешения
      const permissionGranted = await requestPermissions();
      if (!permissionGranted) {
        return null;
      }

      // Настраиваем канал уведомлений для Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      // Получаем токен
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) {
        console.error('EAS Project ID не найден в Constants.expoConfig.extra.eas.projectId');
        return null;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });

      const token = tokenData.data;
      console.log('Push token:', token);
      setPushToken(token);

      // Регистрируем токен на сервере, если пользователь авторизован
      if (isAuthenticated && token) {
        try {
          const response = await notificationsApi.registerDeviceToken(token, {
            deviceName: Device.deviceName || 'Устройство'
          });
          if (response.success) {
            setIsRegistered(true);
            console.log('Токен успешно зарегистрирован на сервере');
          }
        } catch (error) {
          console.error('Ошибка при регистрации токена на сервере:', error);
        }
      }

      return token;
    } catch (error) {
      console.error('Ошибка при регистрации для push-уведомлений:', error);
      return null;
    }
  };

  // Отправка локального уведомления
  const sendLocalNotification = async (title: string, body: string, data?: any) => {
    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
        },
        trigger: { seconds: 1 },
      });
      return notificationId;
    } catch (error) {
      console.error('Ошибка при отправке локального уведомления:', error);
      throw error;
    }
  };

  // Отправка тестового push-уведомления
  const sendTestPushNotification = async () => {
    try {
      // Отправляем локальное уведомление
      await sendLocalNotification(
        "Тестовое локальное уведомление",
        "Это локальное уведомление отправлено из приложения",
        { type: 'local_test' }
      );

      // Если есть токен, пробуем отправить через сервер
      if (pushToken) {
        try {
          await notificationsApi.sendTestNotification(pushToken);
        } catch (error) {
          console.error('Ошибка при отправке тестового уведомления через сервер:', error);
        }
      }
    } catch (error) {
      console.error('Ошибка при отправке тестового уведомления:', error);
      throw error;
    }
  };

  // Инициализация push-уведомлений при запуске
  useEffect(() => {
    // Проверяем разрешения при первом рендере
    requestPermissions();

    // Настраиваем обработчики уведомлений
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Уведомление получено:', notification);
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Ответ на уведомление получен:', response);
      // Здесь можно добавить логику обработки нажатий на уведомления
    });

    // Получаем токен, если устройство физическое
    if (Device.isDevice) {
      registerForPushNotifications();

      // Регистрируем фоновый обработчик уведомлений
      registerBackgroundNotificationHandler().catch(error => {
        console.error('Ошибка при регистрации фонового обработчика уведомлений:', error);
      });
    }

    // Очистка при размонтировании
    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  // Регистрируем или отменяем регистрацию токена при входе/выходе
  useEffect(() => {
    const handleAuthStateChange = async () => {
      // Если пользователь авторизован и токен есть, регистрируем на сервере
      if (isAuthenticated && pushToken) {
        try {
          const response = await notificationsApi.registerDeviceToken(pushToken, {
            deviceName: Device.deviceName
          });
          setIsRegistered(response.success);
        } catch (error) {
          console.error('Ошибка при регистрации токена:', error);
          setIsRegistered(false);
        }
      }
      // Если пользователь вышел из системы и токен есть, отменяем регистрацию
      else if (!isAuthenticated && pushToken && isRegistered) {
        try {
          await notificationsApi.unregisterDeviceToken(pushToken);
          setIsRegistered(false);
        } catch (error) {
          console.error('Ошибка при отмене регистрации токена:', error);
        }
      }
    };

    handleAuthStateChange();
  }, [isAuthenticated, pushToken]);

  return (
    <NotificationContext.Provider
      value={{
        pushToken,
        notification,
        requestPermissions,
        registerForPushNotifications,
        sendLocalNotification,
        sendTestPushNotification,
        notificationPermissionsGranted,
        isRegistered
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}