import React, { useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useUnreadMessages } from '../../hooks/useUnreadMessages';
import { AppNotificationProvider } from '../../components/providers/AppNotificationProvider';
import { StyleSheet, View, Text } from 'react-native';

export default function TabLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const { unreadCount } = useUnreadMessages();

  // Проверяем, авторизован ли пользователь
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Если не авторизован, перенаправляем на экран входа
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading]);

  // Пока идет проверка авторизации, можно показать загрузку
  if (isLoading) {
    return null;
  }

  // Custom badge component to use instead of the default tabBarBadge
  const ChatTabIcon = ({ color, size, focused }) => (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} color={color} size={size} />
      {unreadCount > 0 && (
        <View style={styles.badgeContainer}>
          {unreadCount > 99 ? (
            <Text style={styles.badgeText}>99+</Text>
          ) : (
            <Text style={styles.badgeText}>{unreadCount}</Text>
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
        name="news_list"
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