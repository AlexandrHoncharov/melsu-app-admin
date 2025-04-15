// components/providers/AppNotificationProvider.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';

// Define context types
interface AppNotificationContextProps {
  showNotification: (title: string, message: string, type?: string, data?: any) => void;
  hideNotification: () => void;
}

// Create context
const AppNotificationContext = createContext<AppNotificationContextProps | undefined>(undefined);

// Provider props
interface AppNotificationProviderProps {
  children: ReactNode;
}

export const AppNotificationProvider: React.FC<AppNotificationProviderProps> = ({ children }) => {
  // State for in-app notifications
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('');
  const [data, setData] = useState<any>(null);
  const [autoHideTimer, setAutoHideTimer] = useState<NodeJS.Timeout | null>(null);

  const { isAuthenticated } = useAuth();

  // Initialize OneSignal when component mounts
  useEffect(() => {
    const initOneSignal = async () => {
      if (Platform.OS === 'web') {
        console.log('OneSignal not supported on web platform');
        return;
      }

      try {
        // Dynamically import OneSignal to prevent issues in Expo Go
        if (isAuthenticated) {
          try {
            // We'll initialize OneSignal only in production or development build, not in Expo Go
            if (Constants?.expoConfig?.extra?.oneSignalAppId) {
              // Don't actually import here to avoid the native module error in Expo Go
              console.log('Would initialize OneSignal with app ID:',
                Constants.expoConfig.extra.oneSignalAppId);
            }
          } catch (error) {
            console.log('OneSignal initialization skipped (expected in Expo Go)');
          }
        }
      } catch (error) {
        console.error('Error in OneSignal initialization:', error);
      }
    };

    initOneSignal();
  }, [isAuthenticated]);

  // Show notification
  const showNotification = (
    notificationTitle: string,
    notificationMessage: string,
    notificationType = 'default',
    notificationData = null
  ) => {
    // Set notification content
    setTitle(notificationTitle);
    setMessage(notificationMessage);
    setType(notificationType);
    setData(notificationData);
    setVisible(true);

    // Clear existing auto-hide timer
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
    }

    // Set new auto-hide timer (5 seconds)
    const timer = setTimeout(() => {
      hideNotification();
    }, 5000);

    setAutoHideTimer(timer);
  };

  // Hide notification
  const hideNotification = () => {
    setVisible(false);

    // Clear auto-hide timer
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      setAutoHideTimer(null);
    }
  };

  // Handle notification click
  const handleNotificationPress = () => {
    // Cancel auto-hide timer
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      setAutoHideTimer(null);
    }

    // Hide notification
    hideNotification();

    // Navigate based on notification type
    if (data) {
      if (type === 'chat_message' && data.chat_id) {
        router.push(`/chat/${data.chat_id}`);
      } else if (type === 'verification') {
        router.push('/verification');
      } else if (type === 'ticket_message' && data.ticket_id) {
        router.push({
          pathname: '/profile/ticket-details',
          params: { ticketId: data.ticket_id }
        });
      }
    }
  };

  // Get icon based on notification type
  const getNotificationIcon = () => {
    switch (type) {
      case 'chat_message':
        return <Ionicons name="chatbubble" size={24} color="#fff" />;
      case 'ticket_message':
        return <Ionicons name="help-circle" size={24} color="#fff" />;
      case 'verification':
        return <Ionicons name="checkmark-circle" size={24} color="#fff" />;
      default:
        return <Ionicons name="notifications" size={24} color="#fff" />;
    }
  };

  // Get background color based on notification type
  const getNotificationColor = () => {
    switch (type) {
      case 'chat_message':
        return '#0077FF';
      case 'ticket_message':
        return '#33CC66';
      case 'verification':
        return '#FFA500';
      default:
        return '#770002';
    }
  };

  return (
    <AppNotificationContext.Provider value={{ showNotification, hideNotification }}>
      {children}

      {/* In-app notification banner */}
      {visible && (
        <View
          style={[
            styles.notificationContainer,
            { backgroundColor: getNotificationColor() }
          ]}
        >
          <TouchableOpacity
            style={styles.notificationContent}
            onPress={handleNotificationPress}
            activeOpacity={0.8}
          >
            <View style={styles.iconContainer}>
              {getNotificationIcon()}
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
              <Text style={styles.message} numberOfLines={2}>{message}</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={hideNotification}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      )}
    </AppNotificationContext.Provider>
  );
};

// Styles
const styles = StyleSheet.create({
  notificationContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#770002',
    padding: 16,
    zIndex: 1000,
    width: Dimensions.get('window').width,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  message: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.9,
  },
  closeButton: {
    padding: 4,
  }
});

// Hook to use the notification context
export const useAppNotifications = () => {
  const context = useContext(AppNotificationContext);
  if (!context) {
    throw new Error('useAppNotifications must be used within an AppNotificationProvider');
  }
  return context;
};