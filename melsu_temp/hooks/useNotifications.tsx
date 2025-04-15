// hooks/useNotifications.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './useAuth';
import { router } from 'expo-router';
import oneSignalService, { NotificationCategory } from '../src/services/OneSignalService';

export function useNotifications() {
  const [notification, setNotification] = useState<any | null>(null);
  const [notificationResponse, setNotificationResponse] = useState<any | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const cleanupRef = useRef<(() => void) | null>(null);
  const { user, isAuthenticated } = useAuth();

  // Initialize OneSignal service
  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        // Initialize the OneSignal service
        const initResult = await oneSignalService.initialize();

        if (isMounted) {
          setIsInitialized(initResult);
          if (!initResult) {
            setError('Не удалось инициализировать уведомления');
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(`Ошибка инициализации: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    };

    initialize();

    return () => {
      isMounted = false;
    };
  }, []);

  // Set up notification listeners when initialized
  useEffect(() => {
    if (!isInitialized) return;

    // Set up notification handlers
    const handleNotification = (notification: any) => {
      setNotification(notification);
    };

    const handleNotificationResponse = (response: any) => {
      setNotificationResponse(response);

      // Handle notification navigation
      handleNotificationNavigation(response);
    };

    // Set up OneSignal notification listeners
    const cleanup = oneSignalService.setupNotificationListeners(
      handleNotification,
      handleNotificationResponse
    );

    // Save cleanup function
    cleanupRef.current = cleanup;

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [isInitialized]);

  // Register device for notifications when authenticated
  useEffect(() => {
    let isMounted = true;

    const registerDevice = async () => {
      // Skip if not initialized, not authenticated, or already registering/registered
      if (!isInitialized || !isAuthenticated || !user || !user.id || isRegistering || isRegistered) return;

      try {
        setIsRegistering(true);
        setError(null);

        // Register device with OneSignal
        const userId = String(user.id);
        console.log(`[useNotifications] Registering device for user ${userId}`);

        const registrationResult = await oneSignalService.registerForPushNotifications(userId);

        if (isMounted) {
          setIsRegistered(registrationResult);
          if (!registrationResult) {
            setError('Не удалось зарегистрировать устройство для уведомлений');
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(`Ошибка регистрации: ${err instanceof Error ? err.message : String(err)}`);
        }
      } finally {
        if (isMounted) {
          setIsRegistering(false);
        }
      }
    };

    registerDevice();

    return () => {
      isMounted = false;
    };
  }, [isInitialized, isAuthenticated, user?.id, isRegistering, isRegistered]);

  // Handle navigation based on notification data
  const handleNotificationNavigation = useCallback((response: any) => {
    try {
      // Extract notification data from OneSignal format
      const data = response.notification.additionalData || {};
      console.log('[useNotifications] Notification data:', data);

      // Navigate based on notification type
      if (data?.type === 'chat_message' && data?.chat_id) {
        router.push(`/chat/${data.chat_id}`);
      } else if (data?.type === 'verification') {
        router.push('/verification');
      } else if (data?.type === 'ticket_message' && data?.ticket_id) {
        router.push({
          pathname: '/profile/ticket-details',
          params: { ticketId: data.ticket_id }
        });
      }
    } catch (err) {
      console.error('[useNotifications] Error handling notification navigation:', err);
    }
  }, []);

  // Get notification status
  const getNotificationStatus = useCallback(async () => {
    try {
      const statusInfo = await oneSignalService.getNotificationStatus();
      setStatus(statusInfo);
      return statusInfo;
    } catch (err) {
      setError(`Ошибка получения статуса: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }, []);

  // Send test notification
  const sendTestNotification = useCallback(async () => {
    try {
      setError(null);
      const result = await oneSignalService.sendTestNotification();
      if (!result) {
        setError('Не удалось отправить тестовое уведомление');
      }
      return result;
    } catch (err) {
      setError(`Ошибка отправки: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }, []);

  // Request notification permissions
  const requestPermissions = useCallback(async () => {
    try {
      setError(null);
      const result = await oneSignalService.requestPermissions();
      if (!result) {
        setError('Не удалось получить разрешения на уведомления');
      }
      // Update status after requesting permissions
      await getNotificationStatus();
      return result;
    } catch (err) {
      setError(`Ошибка запроса разрешений: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }, [getNotificationStatus]);

  // Unregister device token
  const unregisterDeviceToken = useCallback(async () => {
    try {
      setError(null);
      const result = await oneSignalService.unregisterDeviceToken();
      setIsRegistered(false);
      return result;
    } catch (err) {
      setError(`Ошибка отмены регистрации: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }, []);

  // Schedule local notification
  const scheduleLocalNotification = useCallback(async (
    title: string,
    body: string,
    data?: any,
    options?: { seconds?: number; channelId?: string; sound?: boolean }
  ) => {
    try {
      // Map the channelId to OneSignal category
      let category: NotificationCategory = NotificationCategory.DEFAULT;
      if (options?.channelId === 'chat') {
        category = NotificationCategory.CHAT;
      } else if (options?.channelId === 'ticket') {
        category = NotificationCategory.TICKET;
      } else if (options?.channelId === 'verification') {
        category = NotificationCategory.VERIFICATION;
      }

      return await oneSignalService.scheduleLocalNotification(title, body, data, {
        seconds: options?.seconds,
        category
      });
    } catch (err) {
      setError(`Ошибка отправки локального уведомления: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }, []);

  return {
    notification,
    notificationResponse,
    isInitialized,
    isRegistered,
    isRegistering,
    status,
    error,
    getNotificationStatus,
    sendTestNotification,
    requestPermissions,
    unregisterDeviceToken,
    scheduleLocalNotification,
  };
}