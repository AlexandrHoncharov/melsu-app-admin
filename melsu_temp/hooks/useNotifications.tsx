// File: hooks/useNotifications.tsx
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import InAppNotification from '../components/InAppNotification';
import { usePushNotifications } from './usePushNotifications';

interface NotificationContextProps {
  showNotification: (title: string, message: string, type: string, data?: any) => void;
  hideNotification: () => void;
}

const NotificationContext = createContext<NotificationContextProps | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [activeNotification, setActiveNotification] = useState<{
    title: string;
    message: string;
    type: any;
    data: any;
    id: number;
  } | null>(null);

  const { notification } = usePushNotifications();

  // Listen for push notifications while app is in foreground
  useEffect(() => {
    if (notification) {
      const { title, body, data } = notification.request.content;

      // Показываем in-app уведомление для сообщений в чате и тикетах
      if (data?.type === 'chat_message') {
        showNotification(title, body, data.type, data);
      } else if (data?.type === 'ticket_message') {
        showNotification(title, body, data.type, data);
      }
    }
  }, [notification]);

  const showNotification = (title: string, message: string, type: string, data: any = {}) => {
    // Generate a unique ID for the notification
    const id = Date.now();

    setActiveNotification({
      title,
      message,
      type,
      data,
      id
    });

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      hideNotification(id);
    }, 5000);
  };

  const hideNotification = (id?: number) => {
    if (id && activeNotification?.id !== id) {
      return; // Don't hide if IDs don't match
    }
    setActiveNotification(null);
  };

  return (
    <NotificationContext.Provider value={{ showNotification, hideNotification }}>
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

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};