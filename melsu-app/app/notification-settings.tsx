// app/notification-settings.tsx
import React from 'react';
import { Stack } from 'expo-router';
import PushDiagnostics from '../components/PushDiagnostics';
import { SafeAreaView } from 'react-native';

export default function NotificationSettingsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <Stack.Screen
        options={{
          title: 'Настройки уведомлений',
          headerTintColor: '#770002',
        }}
      />
      <PushDiagnostics />
    </SafeAreaView>
  );
}