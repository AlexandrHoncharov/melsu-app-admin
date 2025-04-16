import React, { useState, useEffect, useRef } from 'react';
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
  ToastAndroid
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

  const { user } = useAuth();
  const flatListRef = useRef(null);

  // Сохраняем ID текущего пользователя в ref для надежного доступа
  const currentUserIdRef = useRef(user ? String(user.id) : null);

  // При изменении user обновляем ref
  useEffect(() => {
    if (user && user.id) {
      currentUserIdRef.current = String(user.id);
      console.log(`📱 Current user ID set to: ${currentUserIdRef.current}`);
    }
  }, [user]);

  // Загрузка данных чата
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
      // Это гарантирует, что chatService использует тот же ID, что и компонент
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

  // Загрузка при первом рендере
  useEffect(() => {
    loadChatData();

    // Настраиваем слушатель сообщений для обновления в реальном времени
    const setupMessageListener = async () => {
      try {
        await chatService.initialize();
        await chatService.setupChatMessageListener(chatId, () => {
          // Перезагружаем сообщения при изменениях
          loadChatData(true);
        });
      } catch (error) {
        console.error('Ошибка при настройке слушателя сообщений:', error);
      }
    };

    setupMessageListener();

    // Отписка от слушателей при уходе с экрана
    return () => {
      chatService.removeChatMessageListener(chatId);
      chatService.cleanup();
    };
  }, [chatId]);

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
        loadChatData(true);
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