// components/providers/AppNotificationProvider.tsx
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import notificationService from '../../src/services/NotificationService';
import InAppNotification from '../InAppNotification';
import Constants from 'expo-constants';
import { router } from 'expo-router';

interface NotificationContextType {
  showNotification: (title: string, message: string, type: string, data?: any) => void;
  hideNotification: () => void;
  badgeCount: number;
  setBadgeCount: (count: number) => Promise<void>;
  clearBadge: () => Promise<void>;
  lastNotification: Notifications.Notification | null;
  sendTestNotification: () => Promise<boolean>;
  checkPermissions: () => Promise<boolean>;
}

// Create context
const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const AppNotificationProvider = ({ children }: { children: ReactNode }) => {
  // In-app notification state
  const [activeNotification, setActiveNotification] = useState<{
    title: string;
    message: string;
    type: string;
    data: any;
    id: number;
  } | null>(null);

  // Badge count
  const [badgeCount, setBadgeCountState] = useState<number>(0);

  // Last received notification
  const [lastNotification, setLastNotification] = useState<Notifications.Notification | null>(null);

  // Permission alert tracking
  const permissionAlertShown = useRef(false);

  // App state tracking
  const appState = useRef(AppState.currentState);

  // Auth hook
  const { user, isAuthenticated } = useAuth();

  // Initialize notification service
  useEffect(() => {
    const initializeNotifications = async () => {
      try {
        await notificationService.initialize();
        console.log('[AppNotificationProvider] Notification service initialized');

        // Get current badge
        const currentBadge = await notificationService.getBadgeCount();
        setBadgeCountState(currentBadge);

        // Check initial permissions if authenticated
        if (isAuthenticated && user?.id) {
          await checkAndRequestPermissions();
        }
      } catch (error) {
        console.error('[AppNotificationProvider] Failed to initialize notifications:', error);
      }
    };

    initializeNotifications();
  }, []);

  // App state change handler
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [isAuthenticated, user?.id]);

  // Set up notification listeners
  useEffect(() => {
    const setupListeners = async () => {
      try {
        const cleanup = notificationService.setupNotificationListeners(
          handleNotificationReceived,
          handleNotificationResponse
        );
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

  // Register device token when authenticated
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      const registerDevice = async () => {
        try {
          const result = await notificationService.registerForPushNotifications(String(user.id));
          console.log('[AppNotificationProvider] Device registration result:', result);
        } catch (error) {
          console.error('[AppNotificationProvider] Failed to register device:', error);
        }
      };

      registerDevice();
    }
  }, [isAuthenticated, user?.id]);

  // App state change handler
  const handleAppStateChange = useCallback(async (nextAppState: AppStateStatus) => {
    // App came to foreground
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      console.log('[AppNotificationProvider] App has come to the foreground');

      // Update badge count
      try {
        const currentBadge = await notificationService.getBadgeCount();
        setBadgeCountState(currentBadge);
      } catch (error) {
        console.error('[AppNotificationProvider] Failed to get badge count:', error);
      }

      // Check permissions if authenticated
      if (isAuthenticated && user?.id) {
        await checkAndRequestPermissions();
      }
    }

    appState.current = nextAppState;
  }, [isAuthenticated, user?.id]);

  // Check and request permissions if needed
  const checkAndRequestPermissions = async () => {
    try {
      const status = await notificationService.getNotificationStatus();
      console.log('[AppNotificationProvider] Notification status:', status);

      if (!status.enabled) {
        if (!permissionAlertShown.current) {
          permissionAlertShown.current = true;
          return await notificationService.requestPermissions();
        }
      }

      return status.enabled;
    } catch (err) {
      console.error('[AppNotificationProvider] Error checking permissions:', err);
      return false;
    }
  };

  // Public method to check permissions
  const checkPermissions = async () => {
    return await checkAndRequestPermissions();
  };

  // Handle incoming notification
  const handleNotificationReceived = (notification: Notifications.Notification) => {
    console.log('[AppNotificationProvider] Notification received:', notification.request.identifier);
    setLastNotification(notification);

    // Show in-app notification if app is active
    if (AppState.currentState === 'active') {
      const { title, body, data } = notification.request.content;

      // Show in-app notification for chat and ticket messages
      if (data?.type === 'chat_message' || data?.type === 'ticket_message') {
        showNotification(title, body, data.type, data);
      }

      // Increase badge count
      setBadgeCountState(prev => prev + 1);
    }
  };

  // Handle notification tap
  const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
    console.log('[AppNotificationProvider] Notification response received:',
      response.notification.request.identifier);

    try {
      const data = response.notification.request.content.data;
      console.log('[AppNotificationProvider] Notification data:', data);

      if (!data) return;

      // Navigate based on notification type
      if (data.type === 'chat_message' && data.chat_id) {
        // Wait a moment to ensure chat service is ready
        setTimeout(() => {
          router.push(`/chat/${data.chat_id}`);
        }, 300);
      } else if (data.type === 'ticket_message' && data.ticket_id) {
        router.push({
          pathname: '/profile/ticket-details',
          params: { ticketId: data.ticket_id }
        });
      } else if (data.type === 'verification') {
        router.push('/verification');
      }
    } catch (err) {
      console.error('[AppNotificationProvider] Error handling notification tap:', err);
    }
  };

  // Show in-app notification
  const showNotification = (title: string, message: string, type: string, data: any = {}) => {
    // Generate unique ID
    const id = Date.now();

    setActiveNotification({
      title,
      message,
      type,
      data,
      id
    });

    // Auto-hide after 5 seconds
    setTimeout(() => {
      hideNotification(id);
    }, 5000);
  };

  // Hide notification
  const hideNotification = (id?: number) => {
    if (id && activeNotification?.id !== id) {
      return; // Don't hide if IDs don't match
    }
    setActiveNotification(null);
  };

  // Set badge count
  const setBadgeCount = async (count: number) => {
    try {
      await notificationService.setBadgeCount(count);
      setBadgeCountState(count);
    } catch (error) {
      console.error('[AppNotificationProvider] Failed to set badge count:', error);
    }
  };

  // Clear badge
  const clearBadge = async () => {
    try {
      await notificationService.setBadgeCount(0);
      setBadgeCountState(0);
    } catch (error) {
      console.error('[AppNotificationProvider] Failed to clear badge:', error);
    }
  };

  // Send test notification
  const sendTestNotification = async () => {
    try {
      return await notificationService.sendTestNotification();
    } catch (error) {
      console.error('[AppNotificationProvider] Failed to send test notification:', error);
      return false;
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
        lastNotification,
        sendTestNotification,
        checkPermissions
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

// Hook for using notification context
export const useAppNotifications = () => {
  const context = useContext(NotificationContext);

  if (context === undefined) {
    throw new Error('useAppNotifications must be used within an AppNotificationProvider');
  }

  return context;
};