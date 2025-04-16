// components/ChatsList.jsx
import React, { forwardRef, useImperativeHandle, useState, useEffect, useRef } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import chatService from '../../src/services/chatService';

const ChatsList = forwardRef((props, ref) => {
  const [chats, setChats] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const mountedRef = useRef(true);
  const router = useRouter();

  // Базовая загрузка чатов при монтировании компонента
  useEffect(() => {
    const fetchChats = async () => {
      try {
        console.log('Загрузка чатов...');
        const userChats = await chatService.getUserChats();

        // Проверяем, что компонент все еще смонтирован
        if (!mountedRef.current) return;

        setChats(userChats || []);
        console.log(`Загружено ${userChats?.length || 0} чатов`);
      } catch (error) {
        console.error('Ошибка при загрузке чатов:', error);
      } finally {
        // Проверяем, что компонент все еще смонтирован
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    // Загружаем чаты при монтировании
    fetchChats();

    // Очистка при размонтировании
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Простой рефреш для родительского компонента
  const handleRefresh = async () => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      const userChats = await chatService.getUserChats();
      if (mountedRef.current) {
        setChats(userChats || []);
      }
    } catch (error) {
      console.error('Ошибка при обновлении чатов:', error);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  // Экспозиция методов для родительского компонента
  useImperativeHandle(ref, () => ({
    handleRefresh,
    // Минимальный набор методов
    updateChatsData: (newChats) => {
      if (Array.isArray(newChats) && mountedRef.current) {
        setChats(newChats);
      }
    }
  }));

  // Обработчик нажатия на чат
  const handleChatPress = (chatId) => {
    router.push(`/chat/${chatId}`);
  };

  // Обработчик удаления чата
  const handleDeleteChat = (chat) => {
    // Проверяем, не удаляется ли уже другой чат
    if (deletingId) return;

    Alert.alert(
      'Удаление чата',
      `Вы уверены, что хотите удалить чат с ${chat.withUserName || 'пользователем'}?`,
      [
        {
          text: 'Отмена',
          style: 'cancel'
        },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingId(chat.id);

              // Оптимистично удаляем чат из UI
              setChats(currentChats =>
                currentChats.filter(c => c.id !== chat.id)
              );

              // Проверяем наличие метода deleteChat
              if (typeof chatService.deleteChat === 'function') {
                try {
                  await chatService.deleteChat(chat.id);
                  console.log(`Чат ${chat.id} успешно удален`);
                } catch (error) {
                  console.error(`Ошибка при удалении чата ${chat.id}:`, error);

                  // В случае ошибки восстанавливаем список чатов
                  if (mountedRef.current) {
                    handleRefresh();
                  }
                }
              } else {
                console.log(`Метод deleteChat не найден. Чат ${chat.id} удален только из UI`);
              }
            } finally {
              if (mountedRef.current) {
                setDeletingId(null);
              }
            }
          }
        }
      ]
    );
  };

  // Рендер элемента чата
  const renderChatItem = ({ item }) => {
    // Определяем название чата
    const chatName = item.type === 'group'
      ? item.name
      : (item.withUserName || `Пользователь ${item.withUser}`);

    // Определяем время последнего сообщения
    const lastMessageTime = item.lastMessage?.timestamp
      ? new Date(item.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    const isDeleting = item.id === deletingId;

    return (
      <View style={styles.chatItemContainer}>
        <TouchableOpacity
          style={styles.chatItem}
          onPress={() => handleChatPress(item.id)}
          activeOpacity={0.7}
          disabled={isDeleting}
        >
          <View style={styles.chatAvatar}>
            <Ionicons
              name={item.type === 'group' ? 'people' : 'person'}
              size={24}
              color="#770002"
            />
          </View>
          <View style={styles.chatInfo}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatName} numberOfLines={1}>
                {chatName}
              </Text>
              {lastMessageTime && (
                <Text style={styles.messageTime}>{lastMessageTime}</Text>
              )}
            </View>
            {item.lastMessage && (
              <Text style={styles.lastMessage} numberOfLines={1}>
                {item.lastMessage.text}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Кнопка удаления */}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteChat(item)}
          disabled={isDeleting}
        >
          <Ionicons
            name="trash-outline"
            size={22}
            color="#FF3B30"
          />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#770002" />
        </View>
      ) : (
        <FlatList
          data={chats}
          renderItem={renderChatItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>У вас пока нет чатов</Text>
            </View>
          }
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    flexGrow: 1,
  },
  chatItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  chatItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chatAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f2f2f2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  chatInfo: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatName: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  messageTime: {
    fontSize: 12,
    color: '#888',
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: 50,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  deleteButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ChatsList;