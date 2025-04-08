// File: melsu_temp/components/ChatsList.tsx
import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import chatService from '../src/services/chatService';

// Changed to a forwardRef component
const ChatsList = forwardRef((props, ref) => {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();

  // Expose handleRefresh to parent component
  useImperativeHandle(ref, () => ({
    handleRefresh: () => {
      if (!refreshing) {
        handleRefresh();
      }
    }
  }));

  // Загрузка списка чатов с принудительной инициализацией
  const loadChats = async (withRefreshing = false) => {
    try {
      if (!withRefreshing) {
        setLoading(true);
      }

      console.log('Loading chats with fresh initialization...');

      // Force clean up of previous listeners before initializing
      chatService.cleanup();

      // Сбрасываем флаг initialized, чтобы заставить сервис полностью реинициализироваться
      chatService.initialized = false;

      // Инициализируем сервис и загружаем чаты
      await chatService.initialize();

      // Принудительно устанавливаем ID текущего пользователя, если он доступен
      if (user?.id) {
        chatService.forceCurrentUserId(String(user.id));
      }

      const userChats = await chatService.getUserChats();
      setChats(userChats);

      console.log(`Loaded ${userChats.length} chats`);
    } catch (error) {
      console.error('Error loading chats:', error);

      // При ошибке очищаем список чатов
      setChats([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Загрузка при первом рендере
  useEffect(() => {
    loadChats();

    // Отписка от слушателей при размонтировании
    return () => {
      chatService.cleanup();
    };
  }, []);

  // Обработчик pull-to-refresh с полной очисткой кэша
  const handleRefresh = () => {
    console.log('Refreshing chats with full cache clear...');
    setRefreshing(true);

    // Полностью очищаем слушатели перед загрузкой
    chatService.cleanup();

    // Сбрасываем состояние сервиса, но сохраняем пользователя
    const tempUser = chatService.currentUser;
    chatService.initialized = false;

    // Восстанавливаем пользователя, если он был
    if (tempUser) {
      chatService.currentUser = tempUser;
    }

    // Загружаем чаты заново
    loadChats(true);
  };

  // Форматирование времени
  const formatTime = (timestamp) => {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    const now = new Date();

    // Сегодня - только время
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // В течение недели - день недели
    const days = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
    const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (diff < 7) {
      return days[date.getDay()];
    }

    // Иначе - дата
    return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  };

  // Получаем инициалы для аватара
  const getInitials = (name) => {
    if (!name) return "??";

    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }

    return name.substring(0, 2).toUpperCase();
  };

  // Рендер элемента чата
  const renderChatItem = ({ item }) => {
    // Определяем отображаемое имя чата
    let chatName = 'Чат';
    let chatRole = '';

    if (item.type === 'personal') {
      chatName = item.withUserName || 'Личный чат';
      chatRole = item.withUserRole || '';
    } else if (item.type === 'group') {
      chatName = item.name || 'Групповой чат';
    }

    // Получаем инициалы для аватара
    const initials = getInitials(chatName);

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => router.push(`/chat/${item.id}`)}
      >
        <View style={[
          styles.avatarContainer,
          item.type === 'group' ? styles.groupAvatar :
          (chatRole === 'teacher' ? styles.teacherAvatar : styles.studentAvatar)
        ]}>
          {item.type === 'group' ? (
            <Ionicons name="people" size={22} color="#fff" />
          ) : (
            <Text style={styles.avatarText}>{initials}</Text>
          )}
        </View>

        <View style={styles.chatInfo}>
          <Text style={styles.chatName} numberOfLines={1}>{chatName}</Text>

          {item.lastMessage && (
            <Text style={styles.lastMessage} numberOfLines={1}>
              {String(item.lastMessage.senderId) === String(user?.id) ? 'Вы: ' : ''}
              {item.lastMessage.text}
            </Text>
          )}
        </View>

        {item.lastMessage && (
          <View style={styles.metaInfo}>
            <Text style={styles.timeText}>
              {formatTime(item.lastMessage.timestamp)}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#770002" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {chats.length === 0 ? (
        // Wrap empty state in ScrollView with RefreshControl
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#770002']}
              tintColor="#770002"
            />
          }
        >
          <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>У вас пока нет чатов</Text>
          <Text style={styles.emptySubtitle}>
            {user?.role === 'student'
              ? 'Начните общение с преподавателем'
              : 'Начните общение со студентом'
            }
          </Text>
        </ScrollView>
      ) : (
        <FlatList
          data={chats}
          renderItem={renderChatItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#770002']}
              tintColor="#770002"
            />
          }
        />
      )}

      <TouchableOpacity
        style={styles.newChatButton}
        onPress={() => router.push('/new-chat')}
      >
        <Ionicons name="add" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#770002',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  teacherAvatar: {
    backgroundColor: '#2E7D32', // Зеленый для преподавателей
  },
  studentAvatar: {
    backgroundColor: '#0277BD', // Синий для студентов
  },
  groupAvatar: {
    backgroundColor: '#4CAF50', // Зеленый для групповых чатов
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  chatInfo: {
    flex: 1,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
  },
  metaInfo: {
    alignItems: 'flex-end',
  },
  timeText: {
    fontSize: 12,
    color: '#999',
  },
  emptyContainer: {
    flexGrow: 1, // Use flexGrow instead of flex
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  newChatButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#770002',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});

export default ChatsList;