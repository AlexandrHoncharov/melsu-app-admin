// components/providers/AppNotificationProvider.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import oneSignalService from '../../src/services/OneSignalService';
import { useAuth } from '../../hooks/useAuth';

// Define the context type
interface NotificationContextType {
  showNotification: (title: string, body: string, type?: string, data?: any) => void;
  scheduleNotification: (
    title: string,
    body: string,
    seconds?: number,
    type?: string,
    data?: any
  ) => Promise<string | null>;
  sendTestNotification: () => Promise<boolean>;
  requestPermissions: () => Promise<boolean>;
  notificationStatus: any | null;
}

// Create context with default values
const AppNotificationContext = createContext<NotificationContextType>({
  showNotification: () => {},
  scheduleNotification: async () => null,
  sendTestNotification: async () => false,
  requestPermissions: async () => false,
  notificationStatus: null
});

// Provider component
export function AppNotificationProvider({ children }: { children: React.ReactNode }) {
  const [notificationStatus, setNotificationStatus] = useState<any>(null);
  const { user } = useAuth();
  const navigation = useNavigation();

  // Initialize notification system
  useEffect(() => {
    const initializeNotifications = async () => {
      try {
        // Initialize OneSignal safely with error handling
        try {
          await oneSignalService.initialize();
        } catch (e) {
          console.warn('Failed to initialize notifications:', e);
        }

        // Get current status
        try {
          const status = await oneSignalService.getNotificationStatus();
          setNotificationStatus(status);
        } catch (e) {
          console.warn('Failed to get notification status:', e);
        }
      } catch (e) {
        console.error('Error in notification initialization:', e);
      }
    };

    initializeNotifications();

    // Setup notification listeners
    try {
      const cleanup = oneSignalService.setupNotificationListeners(
        (notification) => {
          console.log('Notification received:', notification);
        },
        (response) => {
          // Handle notification open
          console.log('Notification opened:', response);
          handleNotificationNavigation(response);
        }
      );

      return cleanup;
    } catch (e) {
      console.warn('Failed to set up notification listeners:', e);
      return () => {};
    }
  }, []);

  // Handle notification navigation
  const handleNotificationNavigation = useCallback((response: any) => {
    try {
      // Extract data from the notification
      const data = response?.notification?.additionalData || {};

      // Navigate based on notification type
      if (data?.type === 'chat_message' && data?.chat_id) {
        navigation.navigate('Chat', { id: data.chat_id });
      } else if (data?.type === 'verification') {
        navigation.navigate('Verification');
      } else if (data?.type === 'ticket_message' && data?.ticket_id) {
        navigation.navigate('TicketDetails', { ticketId: data.ticket_id });
      }
    } catch (error) {
      console.error('Error handling notification navigation:', error);
    }
  }, [navigation]);

  // Show in-app notification
  const showNotification = useCallback((title: string, body: string, type?: string, data?: any) => {
    // You could use a toast or in-app alert component here
    // For now, just using a basic Alert
    Alert.alert(title, body);
  }, []);

  // Schedule a notification
  const scheduleNotification = useCallback(async (
    title: string,
    body: string,
    seconds: number = 5,
    type: string = 'default',
    data: any = {}
  ): Promise<string | null> => {
    try {
      const notificationId = await oneSignalService.scheduleLocalNotification(
        title,
        body,
        { ...data, type },
        {
          seconds,
          category: type as any
        }
      );

      return notificationId;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      return null;
    }
  }, []);

  // Request push notification permissions
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      const result = await oneSignalService.requestPermissions();

      // Refresh status after permission change
      const newStatus = await oneSignalService.getNotificationStatus();
      setNotificationStatus(newStatus);

      return result;
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  }, []);

  // Send test notification
  const sendTestNotification = useCallback(async (): Promise<boolean> => {
    try {
      return await oneSignalService.sendTestNotification();
    } catch (error) {
      console.error('Error sending test notification:', error);
      return false;
    }
  }, []);

  // Context value
  const contextValue = {
    showNotification,
    scheduleNotification,
    sendTestNotification,
    requestPermissions,
    notificationStatus
  };

  return (
    <AppNotificationContext.Provider value={contextValue}>
      {children}
    </AppNotificationContext.Provider>
  );
}

// Custom hook to use the notification context
export const useAppNotifications = () => {
  const context = useContext(AppNotificationContext);

  if (!context) {
    throw new Error('useAppNotifications must be used within an AppNotificationProvider');
  }

  return context;
};