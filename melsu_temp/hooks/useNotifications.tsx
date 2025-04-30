// hooks/useNotifications.tsx
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { useAuth } from './useAuth';
import notificationsApi from '../src/api/notificationsApi';
import { registerBackgroundNotificationHandler } from '../src/utils/backgroundNotificationHandler';

const debugLog = (msg: string) => console.log('[PUSH DEBUG]', msg);

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
  registerForPushNotifications: () => Promise<string | null>;
  sendTestPushNotification: () => Promise<void>;
  isRegistered: boolean;
  notificationPermissionsGranted: boolean | null;
  retryTokenRegistration: () => Promise<any>;
};

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }) => {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [notificationPermissionsGranted, setNotificationPermissionsGranted] = useState<boolean | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const { isAuthenticated } = useAuth();

  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  const requestPermissions = async () => {
    debugLog('Requesting notification permissions');
    if (!Device.isDevice) {
      debugLog('Not a physical device');
      return false;
    }

    try {
      const { status } = await Notifications.requestPermissionsAsync();
      setNotificationPermissionsGranted(status === 'granted');
      debugLog(`Permission status: ${status}`);
      return status === 'granted';
    } catch (error) {
      debugLog(`Permission request error: ${error.message}`);
      setNotificationPermissionsGranted(false);
      return false;
    }
  };

  const registerForPushNotifications = async (): Promise<string | null> => {
    debugLog('Registering for push notifications');

    if (!Device.isDevice) {
      debugLog('Skipping, not a device');
      return null;
    }

    const hasPermission = await requestPermissions();
    if (!hasPermission) return null;

    try {
      const { data } = await Notifications.getExpoPushTokenAsync({
        projectId: 'd9591f01-e110-4918-8b09-c422bd23baaf',
      });
      setPushToken(data);
      debugLog(`Expo push token: ${data}`);
      return data;
    } catch (error) {
      debugLog(`Error getting token: ${error.message}`);
      return null;
    }
  };

  const sendTestPushNotification = async () => {
    if (!pushToken) {
      debugLog('Push token not available');
      return;
    }

    try {
      const response = await notificationsApi.sendTestNotification(pushToken, 'expo');
      debugLog(`Test push sent. Server response: ${JSON.stringify(response)}`);
    } catch (error) {
      console.error('Error sending test push:', error);
    }
  };

  const retryTokenRegistration = async () => {
    const token = await registerForPushNotifications();
    if (!token) return { success: false, message: 'Token not available' };

    if (isAuthenticated) {
      try {
        const response = await notificationsApi.registerDeviceToken(token, {
          deviceName: Device.deviceName || Device.modelName || 'Unknown',
          tokenType: 'expo',
        });
        setIsRegistered(response.success);
        return response;
      } catch (error) {
        debugLog(`Retry error: ${error.message}`);
        return { success: false, message: error.message };
      }
    } else {
      return { success: false, message: 'Not authenticated' };
    }
  };

  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      debugLog('📩 Notification received:');
      debugLog(JSON.stringify(notification));
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      debugLog('👆 Notification tapped:');
      debugLog(JSON.stringify(response));
    });

    const init = async () => {
      if (Device.isDevice) {
        await requestPermissions();
        await registerForPushNotifications();
        await registerBackgroundNotificationHandler();
      }
    };

    init();

    return () => {
      if (notificationListener.current)
        Notifications.removeNotificationSubscription(notificationListener.current);
      if (responseListener.current)
        Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  useEffect(() => {
    const tryRegister = async () => {
      if (isAuthenticated && pushToken) {
        try {
          const response = await notificationsApi.registerDeviceToken(pushToken, {
            deviceName: Device.deviceName || Device.modelName || 'Unknown',
            tokenType: 'expo',
          });
          setIsRegistered(response.success);
          debugLog('Token registered on server');
        } catch (error) {
          debugLog(`Server registration error: ${error.message}`);
        }
      }
    };
    tryRegister();
  }, [isAuthenticated, pushToken]);

  return (
    <NotificationContext.Provider
      value={{
        pushToken,
        notification,
        registerForPushNotifications,
        sendTestPushNotification,
        isRegistered,
        notificationPermissionsGranted,
        retryTokenRegistration,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within a NotificationProvider');
  return context;
};
