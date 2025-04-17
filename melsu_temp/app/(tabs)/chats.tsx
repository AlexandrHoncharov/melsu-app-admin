// components/ChatsList.jsx
import React, { forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import chatService from '../../src/services/chatService';

const ChatsList = forwardRef((props, ref) => {
  const [chats, setChats] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deletingChatId, setDeletingChatId] = useState(null); // Трекер удаляемого чата
  const router = useRouter();

  // Простая функция загрузки чатов
  const loadChats = async () => {
    console.log('Начинаем загрузку чатов');
    setIsLoading(true);

    try {
      // Инициализируем chatService если необходимо
      const initialized = await chatService.initialize();
      if (!initialized) {
        console.log('Не удалось инициализировать chatService');
        setIsLoading(false);
        return;
      }

      // Получаем список чатов
      const userChats = await chatService.getUserChats();
      console.log(`Загружено ${userChats.length} чатов`);
      setChats(userChats);
    } catch (error) {
      console.error('Ошибка загрузки чатов:', error);
    } finally {
      console.log('Завершаем загрузку чатов');
      setIsLoading(false);
    }
  };

  // Загрузка при первом рендере или изменении ключа обновления
  useEffect(() => {
    loadChats();
  }, [refreshKey]);

  // Экспозиция методов для родительского компонента
  useImperativeHandle(ref, () => ({
    handleRefresh: async () => {
      // Форсируем обновление списка через изменение ключа
      setRefreshKey(prev => prev + 1);
    },
    updateChatsData: (newChats) => {
      if (Array.isArray(newChats)) {
        setChats(newChats);
      }
    }
  }));

  // Обработчик нажатия на чат
  const handleChatPress = (chatId) => {
    router.push(`/chat/${chatId}`);
  };

  // Локальное удаление чата из состояния
  const removeLocalChat = (chatId) => {
    setChats(prevChats => prevChats.filter(chat => chat.id !== chatId));
  };

  // Функция удаления чата
  const handleDeleteChat = (chat) => {
    Alert.alert(
      'Удаление чата',
      `Вы уверены, что хотите удалить чат "${chat.name || (chat.withUserName || 'Без имени')}"?`,
      [
        {
          text: 'Отмена',
          style: 'cancel'
        },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            // Проверяем, не идет ли уже процесс удаления
            if (deletingChatId) {
              console.log('Удаление другого чата уже в процессе');
              return;
            }

            // Отмечаем чат как удаляемый
            setDeletingChatId(chat.id);

            console.log(`Начинаем удаление чата ${chat.id}`);
            try {
              // Локально удаляем чат для моментальной обратной связи
              removeLocalChat(chat.id);

              // Проверяем наличие метода deleteChat в chatService
              if (typeof chatService.deleteChat !== 'function') {
                console.log('Метод deleteChat не найден, оставляем только локальное удаление');
                Alert.alert('Готово', 'Чат удален из вашего списка');
                return;
              }

              // Сервисное удаление чата
              await chatService.deleteChat(chat.id);

              console.log(`Чат ${chat.id} успешно удален`);
              Alert.alert('Готово', 'Чат был удален');
            } catch (error) {
              console.error(`Ошибка при удалении чата ${chat.id}:`, error);

              // В случае ошибки восстанавливаем список
              setRefreshKey(prev => prev + 1);

              Alert.alert(
                'Ошибка',
                'Не удалось удалить чат. Список чатов обновлен.'
              );
            } finally {
              // Сбрасываем идентификатор удаляемого чата
              setDeletingChatId(null);
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

    // Проверка, идет ли процесс удаления этого чата
    const isDeleting = deletingChatId === item.id;

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
              <Text style={[styles.chatName, isDeleting && styles.textDisabled]} numberOfLines={1}>
                {chatName}
              </Text>
              {lastMessageTime && (
                <Text style={[styles.messageTime, isDeleting && styles.textDisabled]}>
                  {lastMessageTime}
                </Text>
              )}
            </View>
            {item.lastMessage && (
              <Text style={[styles.lastMessage, isDeleting && styles.textDisabled]} numberOfLines={1}>
                {item.lastMessage.text}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Кнопка удаления чата или индикатор удаления */}
        {isDeleting ? (
          <View style={styles.deleteButton}>
            <ActivityIndicator size="small" color="#FF3B30" />
          </View>
        ) : (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeleteChat(item)}
          >
            <Ionicons name="trash-outline" size={22} color="#FF3B30" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#770002" />
        </View>
      )}

      <FlatList
        data={chats}
        renderItem={renderChatItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>У вас пока нет чатов</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loaderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    zIndex: 1,
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
  textDisabled: {
    color: '#cccccc',
  },
});

export default ChatsList;