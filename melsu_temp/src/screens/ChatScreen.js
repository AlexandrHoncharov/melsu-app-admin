// src/screens/ChatScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import chatService from '../../services/chatService';

const ChatScreen = ({ route, navigation }) => {
  const { chatId, chatName, chatType } = route.params;
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef(null);

  // Добавляем chatInfo в заголовок
  useEffect(() => {
    navigation.setOptions({
      title: chatName,
      headerRight: () => (
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.navigate('ChatInfo', { chatId, chatName, chatType })}
        >
          <Ionicons name="information-circle-outline" size={24} color="#770002" />
        </TouchableOpacity>
      )
    });
  }, [navigation, chatId, chatName, chatType]);

  // Загружаем сообщения и подписываемся на обновления
  useEffect(() => {
    if (!user || !chatId) return;

    // Отмечаем чат как прочитанный
    const markAsRead = async () => {
      try {
        await chatService.markChatAsRead(chatId, user.id.toString());
      } catch (error) {
        console.error('Error marking chat as read:', error);
      }
    };

    markAsRead();

    // Получаем и подписываемся на сообщения
    const unsubscribe = chatService.getChatMessages(chatId, (newMessages) => {
      setMessages(newMessages);
      setLoading(false);
    });

    // Отписываемся при размонтировании
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [chatId, user]);

  // Прокрутка к последнему сообщению
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  // Отправка сообщения
  const sendMessage = async () => {
    if (!messageText.trim() || !user || sending) {
      return;
    }

    const trimmedMessage = messageText.trim();
    setMessageText('');
    setSending(true);

    try {
      await chatService.sendMessage(chatId, user.id.toString(), trimmedMessage);
    } catch (error) {
      console.error('Error sending message:', error);
      // Восстанавливаем текст сообщения в случае ошибки
      setMessageText(trimmedMessage);
      alert('Не удалось отправить сообщение. Попробуйте еще раз.');
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
  const renderMessage = ({ item, index }) => {
    const isCurrentUser = item.senderId === user.id.toString();
    const showAvatar = index === 0 ||
                      messages[index - 1].senderId !== item.senderId;

    return (
      <View style={[
        styles.messageContainer,
        isCurrentUser ? styles.currentUserMessage : styles.otherUserMessage
      ]}>
        {!isCurrentUser && showAvatar && (
          <View style={styles.avatarContainer}>
            <Ionicons name="person" size={20} color="#fff" />
          </View>
        )}

        <View style={[
          styles.messageBubble,
          isCurrentUser ? styles.currentUserBubble : styles.otherUserBubble
        ]}>
          <Text style={styles.messageText}>{item.text}</Text>
          <Text style={styles.messageTime}>{formatMessageTime(item.createdAt)}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#770002" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : null}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => {
            if (messages.length > 0) {
              flatListRef.current.scrollToEnd({ animated: false });
            }
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>Нет сообщений. Начните общение!</Text>
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
            maxLength={500}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!messageText.trim() || sending) && styles.disabledButton
            ]}
            onPress={sendMessage}
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
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  keyboardAvoid: {
    flex: 1,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButton: {
    padding: 8,
  },
  messagesList: {
    padding: 10,
    paddingBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 100,
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
    marginTop: 16,
    textAlign: 'center',
  },
  messageContainer: {
    flexDirection: 'row',
    marginVertical: 4,
    maxWidth: '80%',
  },
  currentUserMessage: {
    alignSelf: 'flex-end',
  },
  otherUserMessage: {
    alignSelf: 'flex-start',
  },
  avatarContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#770002',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  messageBubble: {
    padding: 10,
    borderRadius: 16,
    maxWidth: '100%',
  },
  currentUserBubble: {
    backgroundColor: '#770002',
    borderTopRightRadius: 4,
  },
  otherUserBubble: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    color: '#333',
  },
  currentUserBubble: {
    backgroundColor: '#770002',
    borderTopRightRadius: 4,
  },
  otherUserBubble: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    color: '#333',
  },
  messageText: {
    fontSize: 16,
  },
  currentUserBubble: {
    backgroundColor: '#770002',
    borderTopRightRadius: 4,
  },
  otherUserBubble: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    color: '#000',
  },
  messageTime: {
    fontSize: 10,
    color: '#888',
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  currentUserBubble: {
    backgroundColor: '#770002',
    borderTopRightRadius: 4,
  },
  otherUserBubble: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    color: props => props.isCurrentUser ? '#fff' : '#333',
  },
  messageTime: {
    fontSize: 10,
    color: props => props.isCurrentUser ? 'rgba(255,255,255,0.7)' : '#888',
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  input: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#770002',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  disabledButton: {
    backgroundColor: '#aaa',
  },
});

export default ChatScreen;