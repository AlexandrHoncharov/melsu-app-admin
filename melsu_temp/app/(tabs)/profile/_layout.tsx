// File: app/(tabs)/profile/_layout.tsx
import React from 'react';
import {Stack} from 'expo-router';
import {useColorScheme} from '../../../hooks/useColorScheme';

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
                name="tickets"
                options={{
                    headerShown: false,
                    title: 'Тикеты'
                }}
            />
            <Stack.Screen
                name="create-ticket"
                options={{
                    headerShown: false,
                    title: 'Создать тикет'
                }}
            />
            <Stack.Screen
                name="ticket-details"
                options={{
                    headerShown: false,
                    title: 'Подробности тикета'
                }}
            />
            <Stack.Screen
                name="notification-test"
                options={{
                    headerShown: false,
                    title: 'Тестирование уведомлений'
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