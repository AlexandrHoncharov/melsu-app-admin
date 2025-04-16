// hooks/useNotifications.tsx
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { useAuth } from './useAuth';
import notificationsApi from '../src/api/notificationsApi';
import { registerBackgroundNotificationHandler } from '../src/utils/backgroundNotificationHandler';

// Настройка обработчика уведомлений
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

type NotificationContextType = {
  pushToken: string | null;
  tokenType: 'fcm' | 'expo' | 'unknown';
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
  const [tokenType, setTokenType] = useState<'fcm' | 'expo' | 'unknown'>('unknown');
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

  // Получение токена для push-уведомлений (для Development Build)
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

      // Настраиваем каналы уведомлений для Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Основные уведомления',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#770002',
          sound: 'default'
        });

        // Другие каналы уведомлений
        await Notifications.setNotificationChannelAsync('chat', {
          name: 'Сообщения',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 100, 100, 100],
          lightColor: '#0066FF',
          sound: 'default'
        });

        await Notifications.setNotificationChannelAsync('tickets', {
          name: 'Тикеты',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 75, 75, 75],
          lightColor: '#FF9800',
          sound: 'default'
        });
      }

      let token;
      let type: 'fcm' | 'expo' | 'unknown' = 'unknown';

      try {
        // В Development Build получаем нативный FCM токен
        const tokenData = await Notifications.getDevicePushTokenAsync();
        token = tokenData.data;
        type = 'fcm';
        console.log('Получен FCM токен:', token);
      } catch (error) {
        console.log('Не удалось получить FCM токен, пробуем Expo токен...');

        try {
          // Запасной вариант - Expo Push Token
          const projectId = ''; // Здесь ваш projectId из app.json
          const tokenData = await Notifications.getExpoPushTokenAsync({
            projectId: projectId || undefined,
          });
          token = tokenData.data;
          type = 'expo';
          console.log('Получен Expo Push токен:', token);
        } catch (fallbackError) {
          console.error('Не удалось получить никакой токен:', fallbackError);
          return null;
        }
      }

      // Сохраняем токен и его тип
      setPushToken(token);
      setTokenType(type);

      // Регистрируем токен на сервере, если пользователь авторизован
      if (isAuthenticated && token) {
        try {
          const response = await notificationsApi.registerDeviceToken(token, {
            deviceName: Device.deviceName || 'Устройство',
            tokenType: type
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
      const channelId = data?.type ?
        (data.type === 'chat' ? 'chat' :
         data.type === 'ticket' ? 'tickets' : 'default') :
        'default';

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: data || {},
          ...(Platform.OS === 'android' ? { channelId } : {})
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
      // Сначала отправляем локальное уведомление для демонстрации
      await sendLocalNotification(
        "Тестовое локальное уведомление",
        "Это локальное уведомление отправлено из приложения",
        { type: 'test' }
      );

      // Если есть токен, отправляем push через сервер
      if (pushToken) {
        try {
          const response = await notificationsApi.sendTestNotification(pushToken, tokenType);
          console.log('Ответ сервера:', response);
          return response;
        } catch (error) {
          console.error('Ошибка при отправке push-уведомления:', error);
          throw error;
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
      // Здесь логика для обработки нажатий на уведомления
      // Например навигация к соответствующему экрану
    });

    // Получаем токен, если устройство физическое
    if (Device.isDevice) {
      registerForPushNotifications();

      // Регистрируем фоновый обработчик уведомлений
      registerBackgroundNotificationHandler().catch(error => {
        console.error('Ошибка при регистрации фонового обработчика:', error);
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
            deviceName: Device.deviceName || 'Устройство',
            tokenType: tokenType
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
        tokenType,
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