import React, { useEffect, useRef, useState } from 'react';
import { Tabs, router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useUnreadMessages } from '../../hooks/useUnreadMessages';
import { StyleSheet, View, Text, AppState } from 'react-native';
import chatService from '../../src/services/chatService';

export default function TabLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const { unreadCount } = useUnreadMessages();
  const [localUnreadCount, setLocalUnreadCount] = useState(unreadCount || 0);
  const appState = useRef(AppState.currentState);
  const isMountedRef = useRef(true);
  const lastUpdateRef = useRef(0);
  const currentPath = usePathname();
  const isChatsScreen = currentPath?.includes('/chats');

  // Проверяем, авторизован ли пользователь
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Если не авторизован, перенаправляем на экран входа
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading]);

  // Функция для обновления счетчика непрочитанных сообщений с защитой от слишком частых вызовов
  const updateUnreadCount = async (force = false) => {
    try {
      if (!isMountedRef.current) return;

      // Защита от слишком частых вызовов (дросселирование)
      const now = Date.now();
      if (!force && now - lastUpdateRef.current < 5000) {
        return; // Прерываем выполнение, если прошло меньше 5 секунд с последнего обновления
      }

      // Обновляем время последнего вызова
      lastUpdateRef.current = now;

      // Инициализируем чат-сервис, если нужно
      const initialized = await chatService.initialize();
      if (!initialized) {
        console.log('Chat service initialization failed');
        return;
      }

      // Получаем актуальное количество непрочитанных сообщений
      const count = await chatService.getTotalUnreadCount();

      // Обновляем состояние только если компонент еще смонтирован
      if (isMountedRef.current) {
        setLocalUnreadCount(count);
      }
    } catch (error) {
      console.error('Ошибка при обновлении счетчика сообщений:', error);
    }
  };

  // Эффект для управления интервалом обновления с учетом активного экрана
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    // Устанавливаем флаг монтирования
    isMountedRef.current = true;

    // Обновляем счетчик сразу при монтировании
    updateUnreadCount(true);

    // Определяем интервал в зависимости от экрана
    // На экране чатов обновляем чаще (каждые 7 секунд), на остальных - реже (каждые 30 секунд)
    const intervalTime = isChatsScreen ? 7000 : 30000;

    console.log(`Установлен интервал обновления: ${intervalTime}ms (${isChatsScreen ? 'экран чатов' : 'другой экран'})`);

    // Настраиваем интервал для периодического обновления
    const intervalId = setInterval(() => updateUnreadCount(), intervalTime);

    // Обработчик изменения состояния приложения
    const handleAppStateChange = (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('Приложение вернулось из фона, обновляем счетчик сообщений');
        updateUnreadCount(true);
      }
      appState.current = nextAppState;
    };

    // Подписываемся на изменения состояния приложения
    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    // Очистка при размонтировании
    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
      appStateSubscription.remove();
    };
  }, [isAuthenticated, isLoading, isChatsScreen]);

  // Пока идет проверка авторизации, показываем пустой экран
  if (isLoading) {
    return null;
  }

  // Custom badge component
  const ChatTabIcon = ({ color, size, focused }) => (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} color={color} size={size} />
      {localUnreadCount > 0 && (
        <View style={styles.badgeContainer}>
          {localUnreadCount > 99 ? (
            <Text style={styles.badgeText}>99+</Text>
          ) : (
            <Text style={styles.badgeText}>{localUnreadCount}</Text>
          )}
        </View>
      )}
    </View>
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#770002',
        headerShown: true,
        headerStyle: {
          backgroundColor: '#fff',
        },
        headerTintColor: '#770002',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Расписание',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" color={color} size={size} />
          ),
        }}
      />

      {/* News tab */}
      <Tabs.Screen
        name="news-list"
        options={{
          title: 'Новости',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "newspaper" : "newspaper-outline"} color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="events"
        options={{
          title: 'Мероприятия',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="tennisball-outline" color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="chats"
        options={{
          title: 'Чаты',
          tabBarIcon: (props) => <ChatTabIcon {...props} />,
          tabBarOnPress: ({ navigation, defaultHandler }) => {
            // Форсируем обновление при нажатии на вкладку чатов
            updateUnreadCount(true);
            defaultHandler();
          }
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Профиль',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badgeContainer: {
    position: 'absolute',
    top: -2,
    right: -6,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
});