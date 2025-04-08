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
  RefreshControl
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import chatService from '../../src/services/chatService';

export default function ChatScreen() {
  const { id } = useLocalSearchParams();
  const chatId = Array.isArray(id) ? id[0] : id;

  const [messages, setMessages] = useState([]);
  const [chatInfo, setChatInfo] = useState(null);
  const [chatTitle, setChatTitle] = useState('Чат');
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);

  const { user } = useAuth();
  const flatListRef = useRef(null);

  // Загрузка данных чата
  const loadChatData = async () => {
    console.log(`Loading chat data for chat ${chatId}...`);
    try {
      // Инициализируем сервис
      await chatService.initialize();

      // Получаем информацию о чате из Firebase
      const info = await chatService.getChatInfo(chatId);
      setChatInfo(info);

      // Получаем чаты пользователя для определения имени собеседника
      const userChats = await chatService.getUserChats();
      const thisChat = userChats.find(chat => chat.id === chatId);

      // Устанавливаем заголовок чата
      if (thisChat) {
        if (thisChat.type === 'personal') {
          setChatTitle(thisChat.withUserName || 'Личный чат');
        } else if (thisChat.type === 'group') {
          setChatTitle(thisChat.name || 'Групповой чат');
        }
      }

      // Получаем сообщения
      const chatMessages = await chatService.getChatMessages(chatId);
      setMessages(chatMessages);

      // Отмечаем сообщения как прочитанные
      await chatService.markMessagesAsRead(chatId);

      console.log(`Chat data loaded: ${chatMessages.length} messages`);
    } catch (error) {
      console.error('Error loading chat data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Загрузка при первом рендере
  useEffect(() => {
    setLoading(true);
    loadChatData();

    // Отписка от слушателей при уходе с экрана
    return () => {
      chatService.cleanup();
    };
  }, [chatId]);

  // Обработчик pull-to-refresh
  const handleRefresh = () => {
    console.log('Refreshing chat messages...');
    setRefreshing(true);
    loadChatData();
  };

  // Отправка сообщения
  const handleSendMessage = async () => {
    if (!messageText.trim() || sending) return;

    try {
      setSending(true);
      console.log(`Sending message to chat ${chatId}: ${messageText}`);

      // Создаем копию текста (чтобы очистить поле сразу)
      const messageToSend = messageText.trim();
      setMessageText('');

      // Отправляем сообщение
      await chatService.sendMessage(chatId, messageToSend);

      // Перезагружаем сообщения (для надежности)
      const updatedMessages = await chatService.getChatMessages(chatId);
      setMessages(updatedMessages);

      // Прокручиваем к последнему сообщению
      if (flatListRef.current && updatedMessages.length > 0) {
        setTimeout(() => {
          flatListRef.current.scrollToEnd({ animated: true });
        }, 200);
      }
    } catch (error) {
      console.error('Error sending message:', error);
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
    // Строгое сравнение ID в виде строк
    const isOwnMessage = String(item.senderId) === String(user?.id);

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
          isOwnMessage ? styles.ownMessageBubble : styles.otherMessageBubble
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
        </Text>
      </View>
    );
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
        headerTintColor: '#770002'
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
          onContentSizeChange={() => {
            if (messages.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }}
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
  }
});