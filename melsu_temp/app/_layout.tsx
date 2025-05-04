import React from 'react';
import { Stack } from 'expo-router';
import {AuthProvider} from '../hooks/useAuth';
import {StatusBar} from 'expo-status-bar';
import {NotificationProvider} from '../hooks/useNotifications';
import {UnreadMessagesProvider} from '../hooks/useUnreadMessages';

export default function RootLayout() {
  return (
      <AuthProvider>
          <NotificationProvider>
              <UnreadMessagesProvider>
                  <StatusBar style="dark"/>

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
                              headerShown: false,
                          }}
                      />
                      <Stack.Screen
                          name="verification"
                          options={{
                              title: 'Верификация',
                              headerTintColor: '#770002',
                              // Prevent going back to login from verification
                              headerBackVisible: false,
                              gestureEnabled: false,
                          }}
                      />
                      <Stack.Screen
                          name="chat/[id]"
                          options={{
                              title: 'Чат',
                              headerShown: false,
                              headerTintColor: '#770002',
                          }}
                      />
                      <Stack.Screen
                          name="newsitem/[id]"
                          options={{
                              title: 'Новость',
                              headerShown: false,
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