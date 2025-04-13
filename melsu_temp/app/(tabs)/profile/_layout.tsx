// File: melsu_temp/app/(tabs)/profile/_layout.tsx
import React from 'react';
import { Stack } from 'expo-router';
import { useColorScheme } from '../../../hooks/useColorScheme';

export default function ProfileLayout() {
  const colorScheme = useColorScheme();

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
          title: 'Профиль'
        }}
      />
      <Stack.Screen
        name="change-password"
        options={{
          headerShown: false,
          title: 'Изменение пароля',
          presentation: 'card'
        }}
      />
      <Stack.Screen
        name="verification"
        options={{
          headerShown: false,
          title: 'Верификация'
        }}
      />
      <Stack.Screen
        name="support"
        options={{
          headerShown: false,
          title: 'Поддержка'
        }}
      />
      <Stack.Screen
        name="about"
        options={{
          headerShown: false,
          title: 'О приложении'
        }}
      />
    </Stack>
  );
}