import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
  Alert,
  ToastAndroid,
  AppState // Добавляем для отслеживания состояния приложения
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import chatService from '../../src/services/chatService';

export default function ChatScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const chatId = Array.isArray(id) ? id[0] : id;
  const [messages, setMessages] = useState([]);
  const [chatTitle, setChatTitle] = useState('Чат');
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [lastSent, setLastSent] = useState(null);
  const [otherUserInfo, setOtherUserInfo] = useState(null);
  const [lastMessageTimestamp, setLastMessageTimestamp] = useState(0); // Добавляем для отслеживания последнего полученного сообщения

  const { user } = useAuth();
  const flatListRef = useRef(null);
  const appStateRef = useRef(AppState.currentState); // Для отслеживания состояния приложения
  const pollingIntervalRef = useRef(null); // Для хранения ссылки на интервал

  // Сохраняем ID текущего пользователя в ref для надежного доступа
  const currentUserIdRef = useRef(user ? String(user.id) : null);

  // При изменении user обновляем ref
  useEffect(() => {
    if (user && user.id) {
      currentUserIdRef.current = String(user.id);
      console.log(`📱 Current user ID set to: ${currentUserIdRef.current}`);
    }
  }, [user]);

  // Мемоизированная функция загрузки только новых сообщений
  const loadNewMessages = useCallback(async () => {
    if (!user || !user.id) return;

    try {
      await chatService.initialize();

      if (typeof chatService.forceCurrentUserId === 'function') {
        await chatService.forceCurrentUserId(user.id);
      }

      // Получаем только новые сообщения после последнего известного timestamp
      const newMessages = await chatService.getNewChatMessages(chatId, lastMessageTimestamp);

      if (newMessages && newMessages.length > 0) {
        // Обрабатываем новые сообщения
        const processedNewMessages = newMessages.map(msg => {
          const msgSenderId = String(msg.senderId || '');
          const myUserId = String(currentUserIdRef.current);
          const isOwn = msgSenderId === myUserId;

          return {
            ...msg,
            senderId: msgSenderId,
            isFromCurrentUser: isOwn
          };
        });

        // Добавляем новые сообщения и обновляем последний timestamp
        setMessages(prevMessages => {
          // Фильтруем дубликаты по ID
          const existingIds = new Set(prevMessages.map(m => m.id));
          const uniqueNewMessages = processedNewMessages.filter(m => !existingIds.has(m.id));

          const updatedMessages = [...prevMessages, ...uniqueNewMessages];

          // Обновляем timestamp последнего сообщения
          if (uniqueNewMessages.length > 0) {
            const latestTimestamp = Math.max(...uniqueNewMessages.map(m => m.timestamp || 0));
            setLastMessageTimestamp(prev => Math.max(prev, latestTimestamp));

            // Прокручиваем к новому сообщению
            setTimeout(() => {
              if (flatListRef.current) {
                flatListRef.current.scrollToEnd({ animated: true });
              }
            }, 100);
          }

          return updatedMessages;
        });

        // Отмечаем сообщения как прочитанные
        await chatService.markMessagesAsRead(chatId);
      }
    } catch (error) {
      console.error('📱 Error loading new messages:', error);
    }
  }, [chatId, lastMessageTimestamp, user]);

  // Загрузка данных чата - полная загрузка всех сообщений
  const loadChatData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);

    console.log(`📱 Loading chat data for chat ${chatId}...`);
    try {
      // Важно! Сначала проверяем текущего пользователя
      if (!user || !user.id) {
        throw new Error('User data not available');
      }

      // Инициализируем сервис
      await chatService.initialize();

      // КРИТИЧЕСКОЕ ИЗМЕНЕНИЕ: Принудительно устанавливаем правильный ID пользователя
      if (typeof chatService.forceCurrentUserId === 'function') {
        await chatService.forceCurrentUserId(user.id);
      } else {
        console.warn('⚠️ forceCurrentUserId method not found in chatService - your messages may appear incorrectly');
      }

      // Получаем чаты пользователя для определения имени собеседника
      const userChats = await chatService.getUserChats();
      const thisChat = userChats.find(chat => chat.id === chatId);

      // Устанавливаем заголовок чата и сохраняем информацию о собеседнике
      if (thisChat) {
        if (thisChat.type === 'personal') {
          setChatTitle(thisChat.withUserName || 'Личный чат');

          // Сохраняем информацию о собеседнике для уведомлений
          setOtherUserInfo({
            id: thisChat.withUser,
            name: thisChat.withUserName,
            role: thisChat.withUserRole
          });
        } else if (thisChat.type === 'group') {
          setChatTitle(thisChat.name || 'Групповой чат');
        }
      }

      // ВАЖНО: сохраняем текущий user ID снова для надежности
      if (user && user.id) {
        currentUserIdRef.current = String(user.id);
      }

      // Получаем сообщения
      let chatMessages = await chatService.getChatMessages(chatId);

      // КРИТИЧЕСКИ ВАЖНО: Обрабатываем сообщения локально, чтобы убедиться, что владелец определен правильно
      chatMessages = chatMessages.map(msg => {
        const msgSenderId = String(msg.senderId || '');
        const myUserId = String(currentUserIdRef.current);

        // Явное сравнение строковых ID
        const isOwn = msgSenderId === myUserId;

        // Выводим подробную информацию о каждом сообщении для отладки
        console.log(`📱 Message processing: ID=${msg.id}, sender=${msgSenderId}, currentUser=${myUserId}, isOwn=${isOwn}`);

        return {
          ...msg,
          senderId: msgSenderId,
          // ПРИНУДИТЕЛЬНО устанавливаем isFromCurrentUser на основе сравнения ID
          isFromCurrentUser: isOwn
        };
      });

      // Отладочная информация
      console.log(`📱 Processed ${chatMessages.length} messages, my ID: ${currentUserIdRef.current}`);
      if (chatMessages.length > 0) {
        const lastMsg = chatMessages[chatMessages.length - 1];
        console.log(`📱 Last message: sender=${lastMsg.senderId}, text="${lastMsg.text.substring(0, 20)}...", isOwn=${lastMsg.isFromCurrentUser}`);

        // Обновляем последний известный timestamp
        const latestTimestamp = Math.max(...chatMessages.map(m => m.timestamp || 0));
        setLastMessageTimestamp(latestTimestamp);
      }

      setMessages(chatMessages);

      // Отмечаем сообщения как прочитанные
      await chatService.markMessagesAsRead(chatId);

    } catch (error) {
      console.error('📱 Error loading chat data:', error);
      if (!isRefresh) {
        Alert.alert(
          "Ошибка",
          "Не удалось загрузить сообщения. Проверьте подключение к интернету."
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setIsInitialLoad(false);
    }
  };

  // Улучшенная настройка слушателя сообщений с оптимизацией
  const setupEnhancedMessageListener = useCallback(async () => {
    try {
      await chatService.initialize();

      // Настраиваем измененный слушатель с колбэком, который будет загружать только новые сообщения
      await chatService.setupChatMessageListener(chatId, async (newMessageData) => {
        console.log('📱 New message detected via listener!');

        // Если у нас есть данные о новом сообщении, мы можем обработать его напрямую
        if (newMessageData) {
          const msgSenderId = String(newMessageData.senderId || '');
          const myUserId = String(currentUserIdRef.current);
          const isOwn = msgSenderId === myUserId;

          const processedNewMessage = {
            ...newMessageData,
            senderId: msgSenderId,
            isFromCurrentUser: isOwn
          };

          // Добавляем новое сообщение в список, избегая дубликатов
          setMessages(prevMessages => {
            // Проверяем, есть ли уже это сообщение
            if (prevMessages.some(m => m.id === processedNewMessage.id)) {
              return prevMessages;
            }

            const updatedMessages = [...prevMessages, processedNewMessage];

            // Прокручиваем к новому сообщению
            setTimeout(() => {
              if (flatListRef.current) {
                flatListRef.current.scrollToEnd({ animated: true });
              }
            }, 100);

            // Обновляем timestamp последнего сообщения
            setLastMessageTimestamp(Math.max(lastMessageTimestamp, processedNewMessage.timestamp || 0));

            return updatedMessages;
          });

          // Отмечаем как прочитанное
          await chatService.markMessagesAsRead(chatId);
        } else {
          // Если данные о сообщении не предоставлены, загружаем только новые сообщения
          await loadNewMessages();
        }
      });

      console.log('📱 Enhanced message listener setup complete');
    } catch (error) {
      console.error('📱 Error setting up enhanced message listener:', error);
    }
  }, [chatId, loadNewMessages, lastMessageTimestamp]);

  // Запускаем или останавливаем интервал опроса в зависимости от состояния приложения
  const setupPolling = useCallback(() => {
    // Очищаем предыдущий интервал, если он был
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Устанавливаем новый интервал для загрузки новых сообщений
    pollingIntervalRef.current = setInterval(() => {
      console.log('📱 Polling for new messages...');
      loadNewMessages();
    }, 5000); // Опрашиваем каждые 5 секунд

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [loadNewMessages]);

  // Отслеживаем состояние приложения для оптимизации работы в фоне
  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      if (appStateRef.current === 'background' && nextAppState === 'active') {
        console.log('📱 App has come to the foreground, refreshing messages...');
        loadNewMessages();
        setupPolling(); // Восстанавливаем интервал опроса
      } else if (nextAppState === 'background') {
        console.log('📱 App has gone to the background, pausing polling...');
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
      }
      appStateRef.current = nextAppState;
    };

    // Подписываемся на изменения состояния приложения
    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      appStateSubscription.remove();
    };
  }, [loadNewMessages, setupPolling]);

  // Загрузка при первом рендере с расширенной настройкой обновлений
  useEffect(() => {
    // Загружаем начальные данные
    loadChatData();

    // Настраиваем улучшенный слушатель сообщений
    setupEnhancedMessageListener();

    // Настраиваем дополнительный опрос для надежности
    const cleanupPolling = setupPolling();

    // Отписка от слушателей при уходе с экрана
    return () => {
      chatService.removeChatMessageListener(chatId);
      chatService.cleanup();
      cleanupPolling();
    };
  }, [chatId, setupEnhancedMessageListener, setupPolling]);

  // Обработчик pull-to-refresh
  const handleRefresh = () => {
    setRefreshing(true);
    loadChatData(true);
  };

  // Показать уведомление о статусе отправки
  const showNotification = (message) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    }
    // Для iOS можно использовать Alert или другую библиотеку
  };

  // Отправка сообщения
  const handleSendMessage = async () => {
    if (!messageText.trim() || sending) return;

    try {
      setSending(true);

      // ПРОВЕРКА! Убедимся, что используется правильный ID
      if (!user || !user.id) {
        throw new Error('User data not available');
      }

      // КРИТИЧЕСКОЕ ИЗМЕНЕНИЕ: Принудительно устанавливаем правильный ID пользователя
      if (typeof chatService.forceCurrentUserId === 'function') {
        await chatService.forceCurrentUserId(user.id);
      }

      // Создаем копию текста (чтобы очистить поле сразу)
      const messageToSend = messageText.trim();
      setMessageText('');

      // Для принудительной перезагрузки после отправки
      const timestamp = Date.now();
      setLastSent(timestamp);

      console.log(`📱 Sending message from ${currentUserIdRef.current}: "${messageToSend.substring(0, 20)}..."`);

      // ВАЖНО: Сначала добавляем "фейковое" сообщение локально, чтобы оно сразу появилось
      const tempMessageId = `temp_${Date.now()}`;
      const tempMessage = {
        id: tempMessageId,
        senderId: currentUserIdRef.current,
        senderName: user?.fullName || user?.username || 'Я',
        text: messageToSend,
        timestamp: Date.now(),
        isFromCurrentUser: true, // ВАЖНО: Принудительно устанавливаем, что это от текущего пользователя
        isTempMessage: true
      };

      // Добавляем временное сообщение в список
      setMessages(prevMessages => [...prevMessages, tempMessage]);

      // Прокручиваем вниз к новому сообщению
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 100);

      // Отправляем сообщение в Firebase
      const messageId = await chatService.sendMessage(chatId, messageToSend);
      console.log(`📱 Message sent successfully with ID: ${messageId}`);

      // Показываем уведомление об успешной отправке
      showNotification('Сообщение отправлено');

      // Перезагружаем сообщения после отправки для синхронизации с сервером
      setTimeout(() => {
        loadNewMessages(); // Используем оптимизированную загрузку только новых сообщений
      }, 500);

    } catch (error) {
      console.error('📱 Error sending message:', error);
      Alert.alert(
        "Ошибка при отправке",
        "Не удалось отправить сообщение. Попробуйте еще раз."
      );
      // Восстанавливаем текст сообщения в случае ошибки
      setMessageText(messageText);
    } finally {
      setSending(false);
    }
  };

  // Форматирование времени сообщения
  const formatMessageTime = (timestamp) => {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Рендер сообщения
  const renderMessage = ({ item }) => {
    // КРИТИЧЕСКИ ВАЖНО: используем явно указанное свойство
    const isOwnMessage = item.isFromCurrentUser;

    return (
      <View style={[
        styles.messageContainer,
        isOwnMessage ? styles.ownMessageContainer : {}
      ]}>
        {!isOwnMessage && (
          <Text style={styles.messageSender}>{item.senderName || `Пользователь ${item.senderId}`}</Text>
        )}

        <View style={[
          styles.messageBubble,
          isOwnMessage ? styles.ownMessageBubble : styles.otherMessageBubble,
          item.isTempMessage && styles.tempMessageBubble
        ]}>
          <Text style={[
            styles.messageText,
            isOwnMessage ? styles.ownMessageText : {}
          ]}>
            {item.text}
          </Text>
        </View>

        <Text style={styles.messageTime}>
          {formatMessageTime(item.timestamp)}
          {item.isTempMessage && " ✓"}
        </Text>
      </View>
    );
  };

  // При изменении messages, прокручиваем вниз
  useEffect(() => {
    if (messages.length > 0 && (!isInitialLoad || lastSent)) {
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 200);
    }
  }, [messages, isInitialLoad, lastSent]);

  // Обработчик кнопки назад
  const handleBackPress = () => {
    router.back();
  };

  // Состояние загрузки
  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Загрузка...' }} />
        <ActivityIndicator size="large" color="#770002" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{
        title: chatTitle,
        headerTintColor: '#770002',
        headerLeft: () => (
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#770002" />
          </TouchableOpacity>
        )
      }} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messagesContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#770002']}
              tintColor="#770002"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                Нет сообщений. Начните общение прямо сейчас!
              </Text>
            </View>
          }
        />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Введите сообщение..."
            value={messageText}
            onChangeText={setMessageText}
            multiline
          />

          <TouchableOpacity
            style={[
              styles.sendButton,
              (!messageText.trim() || sending) && styles.disabledButton
            ]}
            onPress={handleSendMessage}
            disabled={!messageText.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  messageContainer: {
    maxWidth: '80%',
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  ownMessageContainer: {
    alignSelf: 'flex-end',
  },
  messageSender: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
    marginLeft: 8,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
  },
  ownMessageBubble: {
    backgroundColor: '#770002',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 4,
  },
  otherMessageBubble: {
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 16,
  },
  tempMessageBubble: {
    opacity: 0.7,
  },
  messageText: {
    fontSize: 16,
    color: '#333',
  },
  ownMessageText: {
    color: '#fff',
  },
  messageTime: {
    fontSize: 10,
    color: '#999',
    alignSelf: 'flex-end',
    marginRight: 8,
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 16,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#770002',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#999',
    textAlign: 'center',
  },
  backButton: {
    padding: 8,
  }
});