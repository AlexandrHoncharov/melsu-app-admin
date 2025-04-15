// components/providers/AppNotificationProvider.tsx
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import notificationService from '../../src/services/NotificationService';
import InAppNotification from '../InAppNotification';

interface NotificationContextType {
  showNotification: (title: string, message: string, type: string, data?: any) => void;
  hideNotification: () => void;
  badgeCount: number;
  setBadgeCount: (count: number) => Promise<void>;
  clearBadge: () => Promise<void>;
  lastNotification: Notifications.Notification | null;
}

// Создаем контекст
const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const AppNotificationProvider = ({ children }: { children: ReactNode }) => {
  // Состояние для показа уведомлений в приложении
  const [activeNotification, setActiveNotification] = useState<{
    title: string;
    message: string;
    type: string;
    data: any;
    id: number;
  } | null>(null);

  // Счетчик непрочитанных уведомлений (бейдж)
  const [badgeCount, setBadgeCountState] = useState<number>(0);

  // Последнее полученное уведомление
  const [lastNotification, setLastNotification] = useState<Notifications.Notification | null>(null);

  // Хук для работы с аутентификацией пользователя
  const { user, isAuthenticated } = useAuth();

  // Инициализация сервиса уведомлений при загрузке приложения
  useEffect(() => {
    const initializeNotifications = async () => {
      try {
        await notificationService.initialize();
        console.log('[AppNotificationProvider] Notification service initialized');

        // Получаем текущий бейдж
        const currentBadge = await notificationService.getBadgeCount();
        setBadgeCountState(currentBadge);
      } catch (error) {
        console.error('[AppNotificationProvider] Failed to initialize notifications:', error);
      }
    };

    initializeNotifications();
  }, []);

  // Отслеживаем изменения состояния приложения
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  // Настраиваем слушатели уведомлений
  useEffect(() => {
    const setupListeners = async () => {
      try {
        // Настраиваем обработчики уведомлений
        const cleanup = notificationService.setupNotificationListeners(
          handleNotificationReceived,
          handleNotificationResponse
        );

        // Возвращаем функцию очистки
        return cleanup;
      } catch (error) {
        console.error('[AppNotificationProvider] Failed to setup notification listeners:', error);
        return () => {};
      }
    };

    const cleanupListener = setupListeners();
    return () => {
      cleanupListener.then(cleanup => cleanup());
    };
  }, []);

  // Регистрируем токен устройства при аутентификации
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      const registerDevice = async () => {
        try {
          await notificationService.registerForPushNotifications(String(user.id));
          console.log('[AppNotificationProvider] Device registered for push notifications');
        } catch (error) {
          console.error('[AppNotificationProvider] Failed to register device:', error);
        }
      };

      registerDevice();
    }
  }, [isAuthenticated, user?.id]);

  // Обработчик изменения состояния приложения
  const handleAppStateChange = useCallback(async (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      // При возвращении в приложение обновляем бейдж
      try {
        const currentBadge = await notificationService.getBadgeCount();
        setBadgeCountState(currentBadge);
      } catch (error) {
        console.error('[AppNotificationProvider] Failed to get badge count:', error);
      }
    }
  }, []);

  // Обработчик получения уведомления
  const handleNotificationReceived = (notification: Notifications.Notification) => {
    console.log('[AppNotificationProvider] Notification received:', notification.request.identifier);
    setLastNotification(notification);

    // Показываем уведомление внутри приложения, если приложение в фокусе
    if (AppState.currentState === 'active') {
      const { title, body, data } = notification.request.content;

      // Показываем in-app уведомление для сообщений в чате и тикетах
      if (data?.type === 'chat_message' || data?.type === 'ticket_message') {
        showNotification(title, body, data.type, data);
      }

      // Увеличиваем счетчик непрочитанных уведомлений
      setBadgeCountState(prev => prev + 1);
    }
  };

  // Обработчик нажатия на уведомление
  const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
    console.log('[AppNotificationProvider] Notification response received:',
      response.notification.request.identifier);
  };

  // Показ уведомления внутри приложения
  const showNotification = (title: string, message: string, type: string, data: any = {}) => {
    // Генерируем уникальный ID для уведомления
    const id = Date.now();

    setActiveNotification({
      title,
      message,
      type,
      data,
      id
    });

    // Автоматически скрываем уведомление через 5 секунд
    setTimeout(() => {
      hideNotification(id);
    }, 5000);
  };

  // Скрытие уведомления
  const hideNotification = (id?: number) => {
    if (id && activeNotification?.id !== id) {
      return; // Не скрываем, если ID не совпадают
    }
    setActiveNotification(null);
  };

  // Установка значения бейджа
  const setBadgeCount = async (count: number) => {
    try {
      await notificationService.setBadgeCount(count);
      setBadgeCountState(count);
    } catch (error) {
      console.error('[AppNotificationProvider] Failed to set badge count:', error);
    }
  };

  // Сброс бейджа
  const clearBadge = async () => {
    try {
      await notificationService.setBadgeCount(0);
      setBadgeCountState(0);
    } catch (error) {
      console.error('[AppNotificationProvider] Failed to clear badge:', error);
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        showNotification,
        hideNotification,
        badgeCount,
        setBadgeCount,
        clearBadge,
        lastNotification
      }}
    >
      {children}

      {activeNotification && (
        <InAppNotification
          title={activeNotification.title}
          message={activeNotification.message}
          type={activeNotification.type}
          data={activeNotification.data}
          onDismiss={() => hideNotification(activeNotification.id)}
        />
      )}
    </NotificationContext.Provider>
  );
};

// Хук для использования контекста уведомлений
export const useAppNotifications = () => {
  const context = useContext(NotificationContext);

  if (context === undefined) {
    throw new Error('useAppNotifications must be used within an AppNotificationProvider');
  }

  return context;
};