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
  AppState,
  Linking
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import chatService from '../../src/services/chatService';

// Utility function to detect and render clickable links
// Улучшенная функция для обнаружения и отображения кликабельных ссылок
const renderTextWithLinks = (text, isOwnMessage) => {
  if (!text) return null;

  // Улучшенное регулярное выражение для URL-адресов
  const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+\.[^\s]+)/g;

  // Найти все URL в тексте
  const matches = [...text.matchAll(urlPattern)];

  if (matches.length === 0) {
    // Если ссылок нет, просто вернуть текст
    return (
      <Text style={isOwnMessage ? styles.ownMessageText : {}}>
        {text}
      </Text>
    );
  }

  // Создаем массив для хранения результатов
  const result = [];
  let lastIndex = 0;

  // Проходим по каждому найденному URL
  matches.forEach((match, idx) => {
    const url = match[0];
    const startIndex = match.index;
    const endIndex = startIndex + url.length;

    // Добавляем текст до ссылки, если он есть
    if (startIndex > lastIndex) {
      const textBefore = text.substring(lastIndex, startIndex);
      result.push(
        <Text key={`text-${idx}`} style={isOwnMessage ? styles.ownMessageText : {}}>
          {textBefore}
        </Text>
      );
    }

    // Добавляем саму ссылку
    result.push(
      <Text
        key={`url-${idx}`}
        style={isOwnMessage ? styles.ownMessageLink : styles.messageLink}
        onPress={() => handleUrlPress(url)}
      >
        {url}
      </Text>
    );

    // Обновляем lastIndex для следующей итерации
    lastIndex = endIndex;
  });

  // Добавляем оставшийся текст после последней ссылки, если он есть
  if (lastIndex < text.length) {
    result.push(
      <Text key="text-last" style={isOwnMessage ? styles.ownMessageText : {}}>
        {text.substring(lastIndex)}
      </Text>
    );
  }

  return result;
};

// Function to handle URL press
const handleUrlPress = (url) => {
  // Add http:// prefix if the URL starts with www
  const formattedUrl = url.startsWith('www.') ? `http://${url}` : url;

  // Open URL in device browser
  Linking.canOpenURL(formattedUrl)
    .then(supported => {
      if (supported) {
        Linking.openURL(formattedUrl);
      } else {
        console.log(`Cannot open URL: ${formattedUrl}`);
        // Optionally show an alert to the user
        Alert.alert(
          "Ошибка",
          `Не удалось открыть ссылку: ${url}`
        );
      }
    })
    .catch(err => {
      console.error('Error opening URL:', err);
      Alert.alert(
        "Ошибка",
        "Не удалось открыть ссылку"
      );
    });
};

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
  const [lastMessageTimestamp, setLastMessageTimestamp] = useState(0);

  const { user } = useAuth();
  const flatListRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const pollingIntervalRef = useRef(null);

  // Save current user ID in ref for reliable access
  const currentUserIdRef = useRef(user ? String(user.id) : null);

  // Update ref when user changes
  useEffect(() => {
    if (user && user.id) {
      currentUserIdRef.current = String(user.id);
      console.log(`📱 Current user ID set to: ${currentUserIdRef.current}`);
    }
  }, [user]);

  // Memoized function to load only new messages
  const loadNewMessages = useCallback(async () => {
    if (!user || !user.id) return;

    try {
      await chatService.initialize();

      if (typeof chatService.forceCurrentUserId === 'function') {
        await chatService.forceCurrentUserId(user.id);
      }

      // Get only new messages after the last known timestamp
      const newMessages = await chatService.getNewChatMessages(chatId, lastMessageTimestamp);

      if (newMessages && newMessages.length > 0) {
        // Process new messages
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

        // Add new messages and update the last timestamp
        setMessages(prevMessages => {
          // Filter duplicates by ID
          const existingIds = new Set(prevMessages.map(m => m.id));
          const uniqueNewMessages = processedNewMessages.filter(m => !existingIds.has(m.id));

          const updatedMessages = [...prevMessages, ...uniqueNewMessages];

          // Update last message timestamp
          if (uniqueNewMessages.length > 0) {
            const latestTimestamp = Math.max(...uniqueNewMessages.map(m => m.timestamp || 0));
            setLastMessageTimestamp(prev => Math.max(prev, latestTimestamp));

            // Scroll to new message
            setTimeout(() => {
              if (flatListRef.current) {
                flatListRef.current.scrollToEnd({ animated: true });
              }
            }, 100);
          }

          return updatedMessages;
        });

        // Mark messages as read
        await chatService.markMessagesAsRead(chatId);
      }
    } catch (error) {
      console.error('📱 Error loading new messages:', error);
    }
  }, [chatId, lastMessageTimestamp, user]);

  // Load chat data - full load of all messages
  const loadChatData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);

    console.log(`📱 Loading chat data for chat ${chatId}...`);
    try {
      // Important! First check current user
      if (!user || !user.id) {
        throw new Error('User data not available');
      }

      // Initialize service
      await chatService.initialize();

      // CRITICAL CHANGE: Force set correct user ID
      if (typeof chatService.forceCurrentUserId === 'function') {
        await chatService.forceCurrentUserId(user.id);
      } else {
        console.warn('⚠️ forceCurrentUserId method not found in chatService - your messages may appear incorrectly');
      }

      // Get user chats to determine conversation partner's name
      const userChats = await chatService.getUserChats();
      const thisChat = userChats.find(chat => chat.id === chatId);

      // Set chat title and save conversation partner info
      if (thisChat) {
        if (thisChat.type === 'personal') {
          setChatTitle(thisChat.withUserName || 'Личный чат');

          // Save conversation partner info for notifications
          setOtherUserInfo({
            id: thisChat.withUser,
            name: thisChat.withUserName,
            role: thisChat.withUserRole
          });
        } else if (thisChat.type === 'group') {
          setChatTitle(thisChat.name || 'Групповой чат');
        }
      }

      // IMPORTANT: Save current user ID again for reliability
      if (user && user.id) {
        currentUserIdRef.current = String(user.id);
      }

      // Get messages
      let chatMessages = await chatService.getChatMessages(chatId);

      // CRITICALLY IMPORTANT: Process messages locally to ensure owner is correctly identified
      chatMessages = chatMessages.map(msg => {
        const msgSenderId = String(msg.senderId || '');
        const myUserId = String(currentUserIdRef.current);

        // Explicit string ID comparison
        const isOwn = msgSenderId === myUserId;

        // Output detailed info about each message for debugging
        console.log(`📱 Message processing: ID=${msg.id}, sender=${msgSenderId}, currentUser=${myUserId}, isOwn=${isOwn}`);

        return {
          ...msg,
          senderId: msgSenderId,
          // FORCE set isFromCurrentUser based on ID comparison
          isFromCurrentUser: isOwn
        };
      });

      // Debug info
      console.log(`📱 Processed ${chatMessages.length} messages, my ID: ${currentUserIdRef.current}`);
      if (chatMessages.length > 0) {
        const lastMsg = chatMessages[chatMessages.length - 1];
        console.log(`📱 Last message: sender=${lastMsg.senderId}, text="${lastMsg.text.substring(0, 20)}...", isOwn=${lastMsg.isFromCurrentUser}`);

        // Update last known timestamp
        const latestTimestamp = Math.max(...chatMessages.map(m => m.timestamp || 0));
        setLastMessageTimestamp(latestTimestamp);
      }

      setMessages(chatMessages);

      // Mark messages as read
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

  // Enhanced message listener setup with optimization
  const setupEnhancedMessageListener = useCallback(async () => {
    try {
      await chatService.initialize();

      // Set up modified listener with callback that will load only new messages
      await chatService.setupChatMessageListener(chatId, async (newMessageData) => {
        console.log('📱 New message detected via listener!');

        // If we have data about the new message, we can process it directly
        if (newMessageData) {
          const msgSenderId = String(newMessageData.senderId || '');
          const myUserId = String(currentUserIdRef.current);
          const isOwn = msgSenderId === myUserId;

          const processedNewMessage = {
            ...newMessageData,
            senderId: msgSenderId,
            isFromCurrentUser: isOwn
          };

          // Add new message to list, avoiding duplicates
          setMessages(prevMessages => {
            // Check if this message already exists
            if (prevMessages.some(m => m.id === processedNewMessage.id)) {
              return prevMessages;
            }

            const updatedMessages = [...prevMessages, processedNewMessage];

            // Scroll to new message
            setTimeout(() => {
              if (flatListRef.current) {
                flatListRef.current.scrollToEnd({ animated: true });
              }
            }, 100);

            // Update last message timestamp
            setLastMessageTimestamp(Math.max(lastMessageTimestamp, processedNewMessage.timestamp || 0));

            return updatedMessages;
          });

          // Mark as read
          await chatService.markMessagesAsRead(chatId);
        } else {
          // If message data is not provided, load only new messages
          await loadNewMessages();
        }
      });

      console.log('📱 Enhanced message listener setup complete');
    } catch (error) {
      console.error('📱 Error setting up enhanced message listener:', error);
    }
  }, [chatId, loadNewMessages, lastMessageTimestamp]);

  // Start or stop polling interval depending on app state
  const setupPolling = useCallback(() => {
    // Clear previous interval if it exists
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Set new interval for loading new messages
    pollingIntervalRef.current = setInterval(() => {
      console.log('📱 Polling for new messages...');
      loadNewMessages();
    }, 5000); // Poll every 5 seconds

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [loadNewMessages]);

  // Track app state to optimize background operation
  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      if (appStateRef.current === 'background' && nextAppState === 'active') {
        console.log('📱 App has come to the foreground, refreshing messages...');
        loadNewMessages();
        setupPolling(); // Restore polling interval
      } else if (nextAppState === 'background') {
        console.log('📱 App has gone to the background, pausing polling...');
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
      }
      appStateRef.current = nextAppState;
    };

    // Subscribe to app state changes
    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      appStateSubscription.remove();
    };
  }, [loadNewMessages, setupPolling]);

  // Load on first render with enhanced update setup
  useEffect(() => {
    // Load initial data
    loadChatData();

    // Set up enhanced message listener
    setupEnhancedMessageListener();

    // Set up additional polling for reliability
    const cleanupPolling = setupPolling();

    // Unsubscribe from listeners when leaving the screen
    return () => {
      chatService.removeChatMessageListener(chatId);
      chatService.cleanup();
      cleanupPolling();
    };
  }, [chatId, setupEnhancedMessageListener, setupPolling]);

  // Handler for pull-to-refresh
  const handleRefresh = () => {
    setRefreshing(true);
    loadChatData(true);
  };

  // Show notification about sending status
  const showNotification = (message) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    }
    // For iOS you can use Alert or another library
  };

  // Send message
  const handleSendMessage = async () => {
    if (!messageText.trim() || sending) return;

    try {
      setSending(true);

      // CHECK! Make sure the correct ID is used
      if (!user || !user.id) {
        throw new Error('User data not available');
      }

      // CRITICAL CHANGE: Force set correct user ID
      if (typeof chatService.forceCurrentUserId === 'function') {
        await chatService.forceCurrentUserId(user.id);
      }

      // Create a copy of the text (to clear the field immediately)
      const messageToSend = messageText.trim();
      setMessageText('');

      // For forced reload after sending
      const timestamp = Date.now();
      setLastSent(timestamp);

      console.log(`📱 Sending message from ${currentUserIdRef.current}: "${messageToSend.substring(0, 20)}..."`);

      // IMPORTANT: First add a "fake" message locally so it appears immediately
      const tempMessageId = `temp_${Date.now()}`;
      const tempMessage = {
        id: tempMessageId,
        senderId: currentUserIdRef.current,
        senderName: user?.fullName || user?.username || 'Я',
        text: messageToSend,
        timestamp: Date.now(),
        isFromCurrentUser: true, // IMPORTANT: Force set that this is from the current user
        isTempMessage: true
      };

      // Add temporary message to the list
      setMessages(prevMessages => [...prevMessages, tempMessage]);

      // Scroll down to the new message
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 100);

      // Send message to Firebase
      const messageId = await chatService.sendMessage(chatId, messageToSend);
      console.log(`📱 Message sent successfully with ID: ${messageId}`);

      // Show notification about successful sending
      showNotification('Сообщение отправлено');

      // Reload messages after sending to sync with server
      setTimeout(() => {
        loadNewMessages(); // Use optimized loading of only new messages
      }, 500);

    } catch (error) {
      console.error('📱 Error sending message:', error);
      Alert.alert(
        "Ошибка при отправке",
        "Не удалось отправить сообщение. Попробуйте еще раз."
      );
      // Restore message text in case of error
      setMessageText(messageText);
    } finally {
      setSending(false);
    }
  };

  // Format message time
  const formatMessageTime = (timestamp) => {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Render message
  const renderMessage = ({ item }) => {
    // CRITICALLY IMPORTANT: use explicitly specified property
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
          <View style={styles.messageText}>
            {renderTextWithLinks(item.text, isOwnMessage)}
          </View>
        </View>

        <Text style={styles.messageTime}>
          {formatMessageTime(item.timestamp)}
          {item.isTempMessage && " ✓"}
        </Text>
      </View>
    );
  };

  // When messages change, scroll down
  useEffect(() => {
    if (messages.length > 0 && (!isInitialLoad || lastSent)) {
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 200);
    }
  }, [messages, isInitialLoad, lastSent]);

  // Back button handler
  const handleBackPress = () => {
    router.back();
  };

  // Loading state
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
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  ownMessageText: {
    color: '#fff',
  },
  messageLink: {
    color: '#007AFF', // iOS blue link color
    textDecorationLine: 'underline',
  },
  ownMessageLink: {
    color: '#B3E5FC', // Lighter blue for better visibility on dark background
    textDecorationLine: 'underline',
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