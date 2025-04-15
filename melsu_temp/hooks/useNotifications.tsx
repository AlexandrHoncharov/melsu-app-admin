// hooks/useNotifications.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuth } from './useAuth';
import { router } from 'expo-router';
import notificationService from '../src/services/NotificationService';

export function useNotifications() {
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [notificationResponse, setNotificationResponse] = useState<Notifications.NotificationResponse | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const cleanupRef = useRef<() => void | null>(null);
  const { user, isAuthenticated } = useAuth();

  // Инициализация сервиса уведомлений
  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        // Инициализируем сервис
        const initResult = await notificationService.initialize();

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

  // Обновляем обработчики уведомлений при изменении статуса инициализации
  useEffect(() => {
    if (!isInitialized) return;

    // Настраиваем обработчики уведомлений
    const handleNotification = (notification: Notifications.Notification) => {
      setNotification(notification);
    };

    const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
      setNotificationResponse(response);

      // Обрабатываем нажатие на уведомление
      handleNotificationNavigation(response);
    };

    // Устанавливаем обработчики
    const cleanup = notificationService.setupNotificationListeners(
      handleNotification,
      handleNotificationResponse
    );

    // Сохраняем функцию очистки
    cleanupRef.current = cleanup;

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [isInitialized]);

  // Регистрируем устройство для уведомлений при аутентификации
  useEffect(() => {
    let isMounted = true;

    const registerDevice = async () => {
      // Если не инициализирован, пропускаем
      if (!isInitialized) return;

      // Если не аутентифицирован или уже регистрируется/зарегистрирован, пропускаем
      if (!isAuthenticated || !user || !user.id || isRegistering || isRegistered) return;

      try {
        setIsRegistering(true);
        setError(null);

        // Регистрируем устройство
        const userId = String(user.id);
        console.log(`[useNotifications] Registering device for user ${userId}`);

        const registrationResult = await notificationService.registerForPushNotifications(userId);

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

  // Обработка навигации по нажатию на уведомление
  const handleNotificationNavigation = useCallback((response: Notifications.NotificationResponse) => {
    try {
      const data = response.notification.request.content.data;
      console.log('[useNotifications] Notification data:', data);

      // Навигация в зависимости от типа уведомления
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

  // Получение статуса уведомлений
  const getNotificationStatus = useCallback(async () => {
    try {
      const statusInfo = await notificationService.getNotificationStatus();
      setStatus(statusInfo);
      return statusInfo;
    } catch (err) {
      setError(`Ошибка получения статуса: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }, []);

  // Отправка тестового уведомления
  const sendTestNotification = useCallback(async () => {
    try {
      setError(null);
      const result = await notificationService.sendTestNotification();
      if (!result) {
        setError('Не удалось отправить тестовое уведомление');
      }
      return result;
    } catch (err) {
      setError(`Ошибка отправки: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }, []);

  // Запрос разрешений на уведомления
  const requestPermissions = useCallback(async () => {
    try {
      setError(null);
      const result = await notificationService.requestPermissions();
      if (!result) {
        setError('Не удалось получить разрешения на уведомления');
      }
      // Обновляем статус после запроса разрешений
      await getNotificationStatus();
      return result;
    } catch (err) {
      setError(`Ошибка запроса разрешений: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }, [getNotificationStatus]);

  // Отмена регистрации токена
  const unregisterDeviceToken = useCallback(async () => {
    try {
      setError(null);
      const result = await notificationService.unregisterDeviceToken();
      setIsRegistered(false);
      return result;
    } catch (err) {
      setError(`Ошибка отмены регистрации: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }, []);

  // Отправка локального уведомления (для тестирования)
  const scheduleLocalNotification = useCallback(async (
    title: string,
    body: string,
    data?: any,
    options?: { seconds?: number; channelId?: string; sound?: boolean }
  ) => {
    try {
      return await notificationService.scheduleLocalNotification(title, body, data, options);
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