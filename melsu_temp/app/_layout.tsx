// Обновите файл app/_layout.tsx для интеграции Push-уведомлений

import React from 'react';
import { Stack } from 'expo-router';
import { AuthProvider } from '../hooks/useAuth';
import { StatusBar } from 'expo-status-bar';
import { usePushNotifications } from '../hooks/usePushNotifications';

// Компонент для инициализации push-уведомлений
const PushNotificationsInitializer = () => {
  // Просто вызываем хук, который установит все необходимые слушатели
  usePushNotifications();
  return null;
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      {/* Компонент инициализации уведомлений */}
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
            // Отключаем жест возврата для экрана входа
            gestureEnabled: false,
          }}
        />
      </Stack>
    </AuthProvider>
  );
}