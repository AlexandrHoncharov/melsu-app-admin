// hooks/useNotifications.tsx
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { useAuth } from './useAuth';
import notificationsApi from '../src/api/notificationsApi';
import { registerBackgroundNotificationHandler } from '../src/utils/backgroundNotificationHandler';

// Special debug function to log at each step
const debugLog = (message) => {
  console.log(`[PUSH DEBUG] ${message}`);
};

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
  retryTokenRegistration: () => Promise<any>;
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
    debugLog('Requesting notification permissions');
    if (!Device.isDevice) {
      debugLog('Push notifications not available on emulator');
      return false;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      debugLog(`Current permission status: ${existingStatus}`);

      let finalStatus = existingStatus;

      // Если разрешения еще нет, запрашиваем его
      if (existingStatus !== 'granted') {
        debugLog('Permission not granted, requesting now');
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
        debugLog(`New permission status: ${finalStatus}`);
      }

      setNotificationPermissionsGranted(finalStatus === 'granted');
      return finalStatus === 'granted';
    } catch (error) {
      debugLog(`Error requesting permissions: ${error.message}`);
      setNotificationPermissionsGranted(false);
      return false;
    }
  };

  // Получение токена для push-уведомлений (для Development Build)
  const registerForPushNotifications = async () => {
    debugLog('Starting push notification registration');

    if (!Device.isDevice) {
      debugLog('Not a physical device, skipping push registration');
      return null;
    }

    try {
      // Request permissions first
      debugLog('Checking notification permissions');
      const permissionGranted = await requestPermissions();
      if (!permissionGranted) {
        debugLog('Permission denied, cannot get push token');
        return null;
      }

      debugLog('Push notification permissions granted');

      // Set up Android channels if needed
      if (Platform.OS === 'android') {
        debugLog('Setting up Android notification channels');

        try {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Основные уведомления',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#770002',
            sound: 'default'
          });
          debugLog('Default channel created');

          await Notifications.setNotificationChannelAsync('chat', {
            name: 'Сообщения',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 100, 100, 100],
            lightColor: '#0066FF',
            sound: 'default'
          });
          debugLog('Chat channel created');

          await Notifications.setNotificationChannelAsync('tickets', {
            name: 'Тикеты',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 75, 75, 75],
            lightColor: '#FF9800',
            sound: 'default'
          });
          debugLog('Tickets channel created');
        } catch (channelError) {
          debugLog(`Warning: Error creating notification channels: ${channelError.message}`);
          // Continue despite channel errors
        }
      }

      let token;
      let type: 'fcm' | 'expo' | 'unknown' = 'unknown';

      // First try to get FCM token (for production builds)
      try {
        debugLog('Trying to get FCM token');
        const tokenData = await Notifications.getDevicePushTokenAsync();
        token = tokenData.data;
        type = 'fcm';
        debugLog(`Successfully got FCM token: ${token.substring(0, 15)}...`);
      } catch (fcmError) {
        debugLog(`FCM token error: ${fcmError.message}`);

        // Fall back to Expo token
        try {
          debugLog('Falling back to Expo token');
          const tokenData = await Notifications.getExpoPushTokenAsync({
            projectId: '', // Add your project ID if needed
          });
          token = tokenData.data;
          type = 'expo';
          debugLog(`Successfully got Expo token: ${token.substring(0, 15)}...`);
        } catch (expoError) {
          debugLog(`Failed to get Expo token: ${expoError.message}`);
          debugLog('No push token could be obtained');
          return null;
        }
      }

      // Save token and type
      setPushToken(token);
      setTokenType(type);

      debugLog(`Token saved in state. Type: ${type}`);
      return token;
    } catch (error) {
      debugLog(`Unexpected error in token registration: ${error.message}`);
      return null;
    }
  };

  // Retry token registration manually - useful to expose to UI
  const retryTokenRegistration = async () => {
    debugLog('Manually retrying token registration');

    try {
      // First get a fresh token
      const token = await registerForPushNotifications();
      if (!token) {
        debugLog('Failed to get token during retry');
        return { success: false, message: 'Could not obtain push token' };
      }

      // Try to register with server if authenticated
      if (isAuthenticated) {
        debugLog('Sending token to server in retry');
        const deviceData = {
          deviceName: Device.deviceName || 'Unknown Device',
          tokenType: tokenType
        };

        const response = await notificationsApi.registerDeviceToken(token, deviceData);
        setIsRegistered(response.success);
        return response;
      } else {
        debugLog('Not authenticated, cannot register token');
        return { success: false, message: 'Not authenticated' };
      }
    } catch (error) {
      debugLog(`Error in retry: ${error.message}`);
      return { success: false, error: error.message };
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

  // Initialize notification listeners
  useEffect(() => {
    debugLog('Setting up notification listeners');

    // Setup notification received handler
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      debugLog('Notification received');
      setNotification(notification);
    });

    // Setup notification response handler
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      debugLog('Notification response received');
      // Handle notification taps here
    });

    // Try to get permission and token
    const initNotifications = async () => {
      debugLog('Initializing push notifications');

      if (Device.isDevice) {
        // Request permissions
        await requestPermissions();

        // Register for push notifications
        await registerForPushNotifications();

        // Register background handler
        try {
          await registerBackgroundNotificationHandler();
          debugLog('Background notification handler registered');
        } catch (error) {
          debugLog(`Error registering background handler: ${error.message}`);
        }
      } else {
        debugLog('Not a physical device, skipping token initialization');
      }
    };

    initNotifications();

    // Cleanup on unmount
    return () => {
      debugLog('Cleaning up notification listeners');
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  // Register or unregister token when auth state changes
  useEffect(() => {
    const handleAuthStateChange = async () => {
      debugLog(`Auth state changed: isAuthenticated=${isAuthenticated}, token=${pushToken ? 'exists' : 'none'}`);

      // Register token if user is authenticated and we have a token
      if (isAuthenticated && pushToken) {
        try {
          debugLog('Registering token with server after auth change');
          const deviceInfo = {
            deviceName: Device.deviceName || Device.modelName || 'Unknown Device',
            tokenType: tokenType
          };

          debugLog(`Device info: ${JSON.stringify(deviceInfo)}`);
          const response = await notificationsApi.registerDeviceToken(pushToken, {
            deviceName: deviceInfo.deviceName,
            tokenType: tokenType
          });

          if (response.success) {
            debugLog('Token successfully registered on server');
            setIsRegistered(true);
          } else {
            debugLog(`Server returned unsuccessful response: ${JSON.stringify(response)}`);
            setIsRegistered(false);
          }
        } catch (error) {
          debugLog(`Error registering token: ${error.message}`);
          setIsRegistered(false);
        }
      }
      // Unregister token if user logged out
      else if (!isAuthenticated && pushToken && isRegistered) {
        try {
          debugLog('Unregistering token after logout');
          await notificationsApi.unregisterDeviceToken(pushToken);
          setIsRegistered(false);
        } catch (error) {
          debugLog(`Error unregistering token: ${error.message}`);
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
        isRegistered,
        retryTokenRegistration
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