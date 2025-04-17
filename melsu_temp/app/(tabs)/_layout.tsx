import React, { useEffect, useRef, useState } from 'react';
import { Tabs, router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useUnreadMessages } from '../../hooks/useUnreadMessages';
import { StyleSheet, View, Text, AppState } from 'react-native';
import chatService from '../../src/services/chatService';

export default function TabLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const { unreadCount, refreshUnreadCount } = useUnreadMessages();
  const [localUnreadCount, setLocalUnreadCount] = useState(unreadCount || 0);
  const appState = useRef(AppState.currentState);
  const isMountedRef = useRef(true);
  const lastUpdateRef = useRef(0);
  const updateTimeoutRef = useRef(null); // Для таймаута обновления
  const currentPath = usePathname();

  // Определение, находимся ли мы на экране чатов
  const isOnChatsScreen = currentPath?.includes('/chats');

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

      // Установка таймаута для предотвращения бесконечной загрузки
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }

      updateTimeoutRef.current = setTimeout(() => {
        console.log('Превышено время ожидания обновления счетчика сообщений');
        updateTimeoutRef.current = null;
      }, 5000); // 5 секунд максимум на операцию

      // Создаем Promise с таймаутом для получения счетчика непрочитанных сообщений
      const getUnreadCount = async () => {
        // Инициализируем чат-сервис, если нужно
        const initialized = await chatService.initialize();
        if (!initialized) {
          console.log('Chat service initialization failed');
          return 0;
        }

        // Получаем актуальное количество непрочитанных сообщений
        return await chatService.getTotalUnreadCount();
      };

      // Promise с таймаутом в 4 секунды
      const countPromise = getUnreadCount();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Таймаут получения непрочитанных сообщений')), 4000)
      );

      // Используем Promise.race для ограничения времени выполнения
      const count = await Promise.race([countPromise, timeoutPromise])
        .catch(err => {
          console.warn('Ошибка или таймаут при получении непрочитанных сообщений:', err.message);
          return 0; // Возвращаем 0 в случае ошибки или таймаута
        });

      // Очищаем таймаут, так как операция завершена
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }

      // Обновляем состояние только если компонент еще смонтирован
      if (isMountedRef.current) {
        setLocalUnreadCount(count);
      }
    } catch (error) {
      console.error('Ошибка при обновлении счетчика сообщений:', error);

      // Очищаем таймаут в случае ошибки
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
    }
  };

  // Эффект для отслеживания изменения пути и немедленного обновления при переходе на экран чатов
  useEffect(() => {
    // Если путь изменился и теперь это экран чатов, сразу обновляем счетчик
    if (isOnChatsScreen && isAuthenticated && !isLoading) {
      console.log('Переход на экран чатов, немедленно обновляем счетчик');
      updateUnreadCount(true);
    }
  }, [isOnChatsScreen, isAuthenticated, isLoading]);

  // Эффект для управления интервалом обновления с учетом активного экрана
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    // Устанавливаем флаг монтирования
    isMountedRef.current = true;

    // Отложенное выполнение первого обновления для предотвращения блокировки основного потока при запуске
    const initialUpdateTimeout = setTimeout(() => {
      if (isMountedRef.current) {
        updateUnreadCount(true);
      }
    }, 1000); // Даем 1 секунду для загрузки UI и других компонентов

    // Определяем интервал в зависимости от экрана
    // На экране чатов обновляем чаще (каждые 10 секунд), на остальных - реже (каждые 30 секунд)
    const intervalTime = isOnChatsScreen ? 10000 : 30000;

    console.log(`Установлен интервал обновления: ${intervalTime}ms (${isOnChatsScreen ? 'экран чатов' : 'другой экран'})`);

    // Настраиваем интервал для периодического обновления, с отсрочкой первого запуска
    const intervalId = setInterval(() => {
      if (isMountedRef.current) {
        updateUnreadCount();
      }
    }, intervalTime);

    // Обработчик изменения состояния приложения
    const handleAppStateChange = (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('Приложение вернулось из фона, обновляем счетчик сообщений');
        // Отложенное обновление при возвращении из фона
        setTimeout(() => {
          if (isMountedRef.current) {
            updateUnreadCount(true);
          }
        }, 500);
      }
      appState.current = nextAppState;
    };

    // Подписываемся на изменения состояния приложения
    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    // Очистка при размонтировании
    return () => {
      isMountedRef.current = false;
      clearTimeout(initialUpdateTimeout);
      clearInterval(intervalId);
      appStateSubscription.remove();

      // Очищаем таймаут обновления, если он был установлен
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
    };
  }, [isAuthenticated, isLoading, isOnChatsScreen]);

  // Синхронизация со значением из хука useUnreadMessages
  useEffect(() => {
    if (unreadCount !== undefined && unreadCount !== localUnreadCount) {
      setLocalUnreadCount(unreadCount);
    }
  }, [unreadCount]);

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
            // Также обновляем через хук для полной синхронизации
            refreshUnreadCount();
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