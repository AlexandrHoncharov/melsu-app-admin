import React from 'react';
import { Stack } from 'expo-router';
import { AuthProvider } from '../hooks/useAuth';
import { StatusBar } from 'expo-status-bar';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { NotificationProvider } from '../hooks/useNotifications';
import { UnreadMessagesProvider } from '../hooks/useUnreadMessages';

// Component for initializing push notifications
const PushNotificationsInitializer = () => {
  // Just call the hook to set up all necessary listeners
  usePushNotifications();
  return null;
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <UnreadMessagesProvider>
          <StatusBar style="dark" />
          {/* Push notifications initializer */}
          <PushNotificationsInitializer />

          <Stack>
            <Stack.Screen
              name="(tabs)"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="login"
              options={{
                headerShown: false,
                // Disable back gesture for login screen
                gestureEnabled: false,
              }}
            />
            <Stack.Screen
              name="register"
              options={{
                title: 'Регистрация',
                headerTintColor: '#770002',
              }}
            />
            <Stack.Screen
              name="verification"
              options={{
                title: 'Верификация',
                headerTintColor: '#770002',
              }}
            />
            <Stack.Screen
              name="chat/[id]"
              options={{
                title: 'Чат',
                headerTintColor: '#770002',
              }}
            />
            <Stack.Screen
              name="news/[id]"
              options={{
                title: 'Новость',
                headerTintColor: '#770002',
              }}
            />
            <Stack.Screen
              name="new-chat"
              options={{
                title: 'Новый чат',
                headerTintColor: '#770002',
              }}
            />
            <Stack.Screen
              name="notification-settings"
              options={{
                title: 'Настройки уведомлений',
                headerTintColor: '#770002',
              }}
            />
          </Stack>
        </UnreadMessagesProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}