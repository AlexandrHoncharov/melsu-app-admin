import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    AppState,
    Dimensions,
    FlatList,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    RefreshControl,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useLocalSearchParams, useRouter} from 'expo-router';
import {useAuth} from '../../hooks/useAuth';
import chatService from '../../src/services/chatService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// Get screen dimensions for responsive design
const {width, height} = Dimensions.get('window');

// Two-line header component for better displaying long names and additional info
const TwoLineHeader = ({title, subtitle}) => {
    return (
        <View style={styles.twoLineHeaderContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>
                {title || 'Чат'}
            </Text>
            {subtitle ? (
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                    {subtitle}
                </Text>
            ) : null}
        </View>
    );
};

// Custom StatusBar component for more reliable status bar handling
function CustomStatusBar({backgroundColor = '#ffffff', barStyle = 'dark-content'}) {
    const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? 30 : 0;

    return (
        <View style={{height: STATUS_BAR_HEIGHT, backgroundColor}}>
            <StatusBar
                translucent
                backgroundColor={backgroundColor}
                barStyle={barStyle}
            />
        </View>
    );
}

// Helper function to format message time
const formatMessageTime = (timestamp) => {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
};

// Utility function to detect and render clickable links
const renderTextWithLinks = (text, isOwnMessage) => {
    if (!text) return null;

    // Improved URL regex pattern
    const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+\.[^\s]+)/g;

    // Find all URLs in text
    const matches = [...text.matchAll(urlPattern)];

    if (matches.length === 0) {
        // If no links, just return text
        return (
            <Text style={isOwnMessage ? styles.ownMessageText : styles.messageText}>
                {text}
            </Text>
        );
    }

    // Create array for results
    const result = [];
    let lastIndex = 0;

    // Process each URL match
    matches.forEach((match, idx) => {
        const url = match[0];
        const startIndex = match.index;
        const endIndex = startIndex + url.length;

        // Add text before link if any
        if (startIndex > lastIndex) {
            const textBefore = text.substring(lastIndex, startIndex);
            result.push(
                <Text key={`text-${idx}`} style={isOwnMessage ? styles.ownMessageText : styles.messageText}>
                    {textBefore}
                </Text>
            );
        }

        // Add the link itself
        result.push(
            <Text
                key={`url-${idx}`}
                style={isOwnMessage ? styles.ownMessageLink : styles.messageLink}
                onPress={() => handleUrlPress(url)}
            >
                {url}
            </Text>
        );

        // Update lastIndex for next iteration
        lastIndex = endIndex;
    });

    // Add remaining text after last link if any
    if (lastIndex < text.length) {
        result.push(
            <Text key="text-last" style={isOwnMessage ? styles.ownMessageText : styles.messageText}>
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

// Helper functions for local message cache
const getChatMessagesFromCache = async (chatId) => {
    try {
        const cacheKey = `chat_messages_${chatId}`;
        const cachedData = await AsyncStorage.getItem(cacheKey);
        return cachedData ? JSON.parse(cachedData) : [];
    } catch (error) {
        console.error('Error getting messages from cache:', error);
        return [];
    }
};

const saveChatMessagesToCache = async (chatId, messages) => {
    try {
        const cacheKey = `chat_messages_${chatId}`;
        await AsyncStorage.setItem(cacheKey, JSON.stringify(messages));
    } catch (error) {
        console.error('Error saving messages to cache:', error);
    }
};

const getChatInfoFromCache = async (chatId) => {
    try {
        const cacheKey = `chat_info_${chatId}`;
        const cachedData = await AsyncStorage.getItem(cacheKey);
        return cachedData ? JSON.parse(cachedData) : null;
    } catch (error) {
        console.error('Error getting chat info from cache:', error);
        return null;
    }
};

const saveChatInfoToCache = async (chatId, chatInfo) => {
    try {
        const cacheKey = `chat_info_${chatId}`;
        await AsyncStorage.setItem(cacheKey, JSON.stringify(chatInfo));
    } catch (error) {
        console.error('Error saving chat info to cache:', error);
    }
};

export default function ChatScreen() {
    const {id} = useLocalSearchParams();
    const router = useRouter();
    const chatId = Array.isArray(id) ? id[0] : id;

    const [messages, setMessages] = useState([]);
    const [chatTitle, setChatTitle] = useState('Чат');
    const [chatSubtitle, setChatSubtitle] = useState('');
    const [messageText, setMessageText] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [sending, setSending] = useState(false);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [lastSent, setLastSent] = useState(null);
    const [otherUserInfo, setOtherUserInfo] = useState(null);
    const [lastMessageTimestamp, setLastMessageTimestamp] = useState(0);
    const [isOffline, setIsOffline] = useState(false);
    const [isFirebaseError, setIsFirebaseError] = useState(false);
    const [chatInfo, setChatInfo] = useState(null);

    // New states for action menu
    const [showActionMenu, setShowActionMenu] = useState(false);

    const {user} = useAuth();
    const flatListRef = useRef(null);
    const appStateRef = useRef(AppState.currentState);
    const pollingIntervalRef = useRef(null);
    const networkListener = useRef(null);

    // Save current user ID in ref for reliable access
    const currentUserIdRef = useRef(user ? String(user.id) : null);

    // Update ref when user changes
    useEffect(() => {
        if (user && user.id) {
            currentUserIdRef.current = String(user.id);
            console.log(`📱 Current user ID set to: ${currentUserIdRef.current}`);
        }
    }, [user]);

    // Setup network listener
    useEffect(() => {
        // Check initial network state
        NetInfo.fetch().then(state => {
            setIsOffline(!state.isConnected);
        });

        // Subscribe to network state updates
        networkListener.current = NetInfo.addEventListener(state => {
            setIsOffline(!state.isConnected);

            // If we just came back online, try to sync messages
            if (state.isConnected && isOffline) {
                loadChatData();
            }
        });

        return () => {
            if (networkListener.current) {
                networkListener.current();
            }
        };
    }, []);

    // Set status bar properties for Android
    useEffect(() => {
        if (Platform.OS === 'android') {
            StatusBar.setBackgroundColor('#ffffff');
            StatusBar.setBarStyle('dark-content');
            StatusBar.setTranslucent(true);
        }
    }, []);

    // Memoized function to load only new messages
    const loadNewMessages = useCallback(async () => {
        if (!user || !user.id || isOffline) return;

        try {
            await chatService.initialize();

            // Если есть ошибка инициализации Firebase, прерываем загрузку новых сообщений
            if (chatService.firebaseInitError) {
                setIsFirebaseError(true);
                return;
            }

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

                    // Save to local cache for offline access
                    saveChatMessagesToCache(chatId, updatedMessages);

                    // Update last message timestamp
                    if (uniqueNewMessages.length > 0) {
                        const latestTimestamp = Math.max(...uniqueNewMessages.map(m => m.timestamp || 0));
                        setLastMessageTimestamp(prev => Math.max(prev, latestTimestamp));

                        // Scroll to new message
                        setTimeout(() => {
                            if (flatListRef.current) {
                                flatListRef.current.scrollToEnd({animated: true});
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

            // Проверяем, связана ли ошибка с Firebase
            if (error.message && (
                error.message.includes('Firebase') ||
                error.message.includes('auth') ||
                error.message.includes('Component')
            )) {
                setIsFirebaseError(true);
            }
        }
    }, [chatId, lastMessageTimestamp, user, isOffline]);

    // Parse chat title and subtitle from chat info
    const parseChatInfo = useCallback((chatData) => {
        if (!chatData) return;

        let titleText = 'Чат';
        let subtitleText = '';

        if (chatData.type === 'personal') {
            // For personal chats, try to extract name and details
            const userName = chatData.withUserName || `Пользователь ${chatData.withUser}`;

            // Используем имя как заголовок
            titleText = userName.split('(')[0].trim();

            // Используем группу студента или кафедру преподавателя как подзаголовок
            if (chatData.withUserRole === 'student') {
                subtitleText = chatData.withUserGroup || '';
            } else if (chatData.withUserRole === 'teacher') {
                subtitleText = chatData.withUserDepartment || '';
            }

            // Если подзаголовок не установлен, попробуем извлечь из скобок, если они есть
            if (!subtitleText && userName.includes('(')) {
                const detailsPart = userName.split('(')[1];
                if (detailsPart) {
                    subtitleText = detailsPart.replace(')', '').trim();
                }
            }
        } else if (chatData.type === 'group') {
            // For group chats, use name and group code
            titleText = chatData.name || 'Групповой чат';
            subtitleText = chatData.groupCode || '';
        }

        setChatTitle(titleText);
        setChatSubtitle(subtitleText);
        setChatInfo(chatData);

        // Save chat info to cache for offline access
        saveChatInfoToCache(chatId, chatData);
    }, [chatId]);

    // Load chat data - full load of all messages
    const loadChatData = async (isRefresh = false) => {
        // Only show loading screen on very first load, not on refreshes or updates
        if (!isRefresh && isInitialLoad) {
            setLoading(true);
        }

        console.log(`📱 Loading chat data for chat ${chatId}...`);

        // Check network connectivity
        const netInfo = await NetInfo.fetch();
        const isConnected = netInfo.isConnected;
        setIsOffline(!isConnected);

        try {
            // Important! First check current user
            if (!user || !user.id) {
                throw new Error('User data not available');
            }

            if (isOffline) {
                console.log('📱 Device is offline, loading from cache...');

                // Load chat info from cache
                const cachedChatInfo = await getChatInfoFromCache(chatId);
                if (cachedChatInfo) {
                    parseChatInfo(cachedChatInfo);
                }

                // Load messages from cache
                const cachedMessages = await getChatMessagesFromCache(chatId);
                if (cachedMessages && cachedMessages.length > 0) {
                    setMessages(cachedMessages);

                    // Update last message timestamp
                    const latestTimestamp = Math.max(...cachedMessages.map(m => m.timestamp || 0));
                    setLastMessageTimestamp(latestTimestamp);

                    console.log(`📱 Loaded ${cachedMessages.length} messages from cache`);
                }

                setLoading(false);
                setRefreshing(false);
                setIsInitialLoad(false);
                return;
            }

            // Initialize service
            await chatService.initialize();

            // Проверяем, есть ли ошибка инициализации Firebase
            if (chatService.firebaseInitError) {
                console.log('📱 Firebase initialization error detected, using offline mode');
                setIsFirebaseError(true);

                // Загружаем данные из кэша при ошибке Firebase
                const cachedChatInfo = await getChatInfoFromCache(chatId);
                if (cachedChatInfo) {
                    parseChatInfo(cachedChatInfo);
                }

                const cachedMessages = await getChatMessagesFromCache(chatId);
                if (cachedMessages && cachedMessages.length > 0) {
                    setMessages(cachedMessages);
                    const latestTimestamp = Math.max(...cachedMessages.map(m => m.timestamp || 0));
                    setLastMessageTimestamp(latestTimestamp);
                    console.log(`📱 Loaded ${cachedMessages.length} messages from cache after Firebase error`);
                }

                setLoading(false);
                setRefreshing(false);
                setIsInitialLoad(false);
                return;
            }

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
                parseChatInfo(thisChat);

                if (thisChat.type === 'personal') {
                    // Save conversation partner info for notifications
                    setOtherUserInfo({
                        id: thisChat.withUser,
                        name: thisChat.withUserName,
                        role: thisChat.withUserRole
                    });
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

            // Save messages to cache for offline access
            await saveChatMessagesToCache(chatId, chatMessages);

            // Mark messages as read
            await chatService.markMessagesAsRead(chatId);

        } catch (error) {
            console.error('📱 Error loading chat data:', error);

            // Проверяем, связана ли ошибка с Firebase
            if (error.message && (
                error.message.includes('Firebase') ||
                error.message.includes('auth') ||
                error.message.includes('Component')
            )) {
                setIsFirebaseError(true);
            }

            if (!isOffline && !isFirebaseError) {
                // Try to load from cache if online loading failed
                console.log('📱 Loading from cache after online error...');

                // Load chat info from cache
                const cachedChatInfo = await getChatInfoFromCache(chatId);
                if (cachedChatInfo) {
                    parseChatInfo(cachedChatInfo);
                }

                // Load messages from cache
                const cachedMessages = await getChatMessagesFromCache(chatId);
                if (cachedMessages && cachedMessages.length > 0) {
                    setMessages(cachedMessages);
                    console.log(`📱 Loaded ${cachedMessages.length} messages from cache after error`);
                } else if (!isRefresh && isInitialLoad) {
                    Alert.alert(
                        "Ошибка",
                        "Не удалось загрузить сообщения. Проверьте подключение к интернету."
                    );
                }
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
            setIsInitialLoad(false);
        }
    };

    // Enhanced message listener setup with optimization
    const setupEnhancedMessageListener = useCallback(async () => {
        if (isOffline || isFirebaseError) return;

        try {
            await chatService.initialize();

            // Если есть ошибка инициализации Firebase, прекращаем настройку
            if (chatService.firebaseInitError) {
                setIsFirebaseError(true);
                return;
            }

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

                        // Save to cache for offline access
                        saveChatMessagesToCache(chatId, updatedMessages);

                        // Scroll to new message
                        setTimeout(() => {
                            if (flatListRef.current) {
                                flatListRef.current.scrollToEnd({animated: true});
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

            // Проверяем, связана ли ошибка с Firebase
            if (error.message && (
                error.message.includes('Firebase') ||
                error.message.includes('auth') ||
                error.message.includes('Component')
            )) {
                setIsFirebaseError(true);
            }
        }
    }, [chatId, loadNewMessages, lastMessageTimestamp, isOffline, isFirebaseError]);

    // Start or stop polling interval depending on app state
    const setupPolling = useCallback(() => {
        // Don't set up polling if offline or Firebase error
        if (isOffline || isFirebaseError) return () => {};

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
    }, [loadNewMessages, isOffline, isFirebaseError]);

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

        // Set up enhanced message listener if online
        if (!isOffline) {
            setupEnhancedMessageListener();
        }

        // Set up additional polling for reliability if online
        const cleanupPolling = setupPolling();

        // Unsubscribe from listeners when leaving the screen
        return () => {
            if (!isOffline) {
                chatService.removeChatMessageListener(chatId);
                chatService.cleanup();
            }
            cleanupPolling();
        };
    }, [chatId, setupEnhancedMessageListener, setupPolling, isOffline]);

    // Update polling and listeners when online status changes
    useEffect(() => {
        if (!isOffline) {
            setupEnhancedMessageListener();
            setupPolling();
        } else {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
        }
    }, [isOffline, setupEnhancedMessageListener, setupPolling]);

    // Handler for pull-to-refresh
    const handleRefresh = () => {
        setRefreshing(true);
        loadChatData(true);
    };

    // Leave chat function
    const handleLeaveChat = () => {
        setShowActionMenu(false);

        Alert.alert(
            "Покинуть чат",
            "Вы уверены, что хотите покинуть этот чат? Вы больше не будете получать сообщения.",
            [
                {text: "Отмена", style: "cancel"},
                {
                    text: "Покинуть",
                    style: "destructive",
                    onPress: async () => {
                        if (isOffline) {
                            Alert.alert(
                                "Нет подключения",
                                "Для выхода из чата требуется подключение к интернету."
                            );
                            return;
                        }

                        try {
                            await chatService.deleteChat(chatId);
                            router.back();
                        } catch (error) {
                            console.error("Ошибка при покидании чата:", error);
                            Alert.alert("Ошибка", "Не удалось покинуть чат. Попробуйте позже.");
                        }
                    }
                }
            ]
        );
    };

    // Mute chat function
    const handleMuteChat = () => {
        setShowActionMenu(false);
        // Placeholder for mute functionality
        Alert.alert("Уведомление", "Функция отключения уведомлений будет доступна в следующем обновлении.");
    };

    // Send message completely asynchronously
    const handleSendMessage = async () => {
        if (!messageText.trim() || sending) return;

        if (isOffline || isFirebaseError) {
            Alert.alert(
                "Нет подключения",
                "Для отправки сообщений требуется подключение к интернету."
            );
            return;
        }

        try {
            // Store message text before clearing input
            const messageToSend = messageText.trim();

            // Immediately clear input and update UI state
            setMessageText('');

            // Generate a stable ID (will be used until server confirms)
            const clientMessageId = `local_${Date.now()}`;
            const timestamp = Date.now();

            // Immediately add message to UI as if it's already sent
            const localMessage = {
                id: clientMessageId,
                senderId: currentUserIdRef.current,
                senderName: user?.fullName || user?.username || 'Я',
                text: messageToSend,
                timestamp: timestamp,
                isFromCurrentUser: true
                // No isTempMessage or sending flags - message appears as regular
            };

            // Add message to UI
            setMessages(prevMessages => {
                const updatedMessages = [...prevMessages, localMessage];

                // Save to cache for offline access
                saveChatMessagesToCache(chatId, updatedMessages);

                return updatedMessages;
            });

            // Scroll down to the new message
            if (flatListRef.current) {
                flatListRef.current.scrollToEnd({animated: false});
            }

            // Silently send in background
            (async () => {
                try {
                    // Initialize if needed
                    if (typeof chatService.forceCurrentUserId === 'function') {
                        await chatService.forceCurrentUserId(user?.id);
                    }

                    // Send to server without affecting UI
                    await chatService.sendMessage(chatId, messageToSend);

                    // No UI update needed - message already looks sent
                    // Background sync will eventually update the message ID

                    // Optional silent background sync after delay
                    setTimeout(() => {
                        loadNewMessages().catch(() => {/* ignore errors */
                        });
                    }, 5000); // Long delay to ensure no UI disruption
                } catch (err) {
                    // Only update UI on serious errors
                    console.error('Background send error:', err);

                    // Silently mark as failed in state without visual indicators
                    setMessages(prevMessages => {
                        const updatedMessages = prevMessages.map(msg => {
                            if (msg.id === clientMessageId) {
                                return {
                                    ...msg,
                                    _sendFailed: true // Internal flag, not used for UI
                                };
                            }
                            return msg;
                        });

                        // Save updated messages to cache
                        saveChatMessagesToCache(chatId, updatedMessages);

                        return updatedMessages;
                    });
                }
            })();

        } catch (error) {
            console.error('Error in message handling:', error);
            // Don't show error to user unless critical
        }
    };

    // Render message without loading indicators
    const renderMessage = ({item}) => {
        // CRITICALLY IMPORTANT: use explicitly specified property
        const isOwnMessage = item.isFromCurrentUser;

        return (
            <View style={[
                styles.messageContainer,
                isOwnMessage ? styles.ownMessageContainer : styles.otherMessageContainer
            ]}>
                {!isOwnMessage && (
                    <Text style={styles.messageSender}>
                        {item.senderName || `Пользователь ${item.senderId}`}
                    </Text>
                )}

                <View style={[
                    styles.messageBubble,
                    isOwnMessage ? styles.ownMessageBubble : styles.otherMessageBubble
                ]}>
                    <View style={styles.messageContent}>
                        {renderTextWithLinks(item.text, isOwnMessage)}
                    </View>
                </View>

                <Text style={styles.messageTime}>
                    {formatMessageTime(item.timestamp)}
                </Text>
            </View>
        );
    };

    // When messages change, scroll down
    useEffect(() => {
        if (messages.length > 0 && (!isInitialLoad || lastSent)) {
            setTimeout(() => {
                if (flatListRef.current) {
                    flatListRef.current.scrollToEnd({animated: true});
                }
            }, 200);
        }
    }, [messages, isInitialLoad, lastSent]);

    // Back button handler
    const handleBackPress = () => {
        router.back();
    };

    // OfflineBar component
    const OfflineBar = () => (
        <View style={styles.offlineBar}>
            <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
            <Text style={styles.offlineText}>
                {isFirebaseError
                    ? 'Ошибка подключения к серверу. Режим офлайн.'
                    : 'Не подключен к сети'}
            </Text>
        </View>
    );

    // Fix the loading function to not show the loading on subsequent renders
    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <CustomStatusBar/>
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={handleBackPress}
                    >
                        <Ionicons name="chevron-back" size={24} color="#000"/>
                    </TouchableOpacity>
                    <Text style={styles.title}>Загрузка...</Text>
                    <View style={{width: 40}}/>
                </View>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#bb0000"/>
                    <Text style={styles.loadingText}>Загрузка сообщений...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <CustomStatusBar/>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.keyboardAvoid}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={handleBackPress}
                    >
                        <Ionicons name="chevron-back" size={24} color="#000"/>
                    </TouchableOpacity>
                    <TwoLineHeader title={chatTitle} subtitle={chatSubtitle} />
                    <TouchableOpacity
                        style={styles.menuButton}
                        onPress={() => setShowActionMenu(true)}
                    >
                        <Ionicons name="ellipsis-vertical" size={24} color="#000"/>
                    </TouchableOpacity>
                </View>

                {/* Offline indicator */}
                {(isOffline || isFirebaseError) && <OfflineBar />}

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
                            colors={['#bb0000']}
                            tintColor="#bb0000"
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>
                                {isOffline || isFirebaseError
                                    ? "Нет локально сохраненных сообщений"
                                    : "Нет сообщений. Начните общение прямо сейчас!"}
                            </Text>
                        </View>
                    }
                />

                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.messageInput}
                        placeholder={isOffline || isFirebaseError ? "Нет подключения к сети" : "Введите сообщение..."}
                        value={messageText}
                        onChangeText={setMessageText}
                        multiline
                        maxLength={1000}
                        editable={!(isOffline || isFirebaseError)}
                    />

                    <TouchableOpacity
                        style={[
                            styles.sendButton,
                            (!messageText.trim() || sending || isOffline || isFirebaseError) && styles.sendButtonDisabled
                        ]}
                        onPress={handleSendMessage}
                        disabled={!messageText.trim() || sending || isOffline || isFirebaseError}
                    >
                        {sending ? (
                            <ActivityIndicator size="small" color="#fff"/>
                        ) : (
                            <Ionicons name="send" size={20} color="#fff"/>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Action Menu Modal */}
                <Modal
                    visible={showActionMenu}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setShowActionMenu(false)}
                >
                    <TouchableOpacity
                        style={styles.modalOverlay}
                        activeOpacity={1}
                        onPress={() => setShowActionMenu(false)}
                    >
                        <View style={styles.actionMenuContainer}>
                            <TouchableOpacity
                                style={styles.actionMenuItem}
                                onPress={handleRefresh}
                                disabled={isOffline || isFirebaseError}
                            >
                                <Ionicons
                                    name="refresh"
                                    size={24}
                                    color={(isOffline || isFirebaseError) ? "#999" : "#333"}
                                    style={styles.actionMenuIcon}
                                />
                                <Text style={[styles.actionMenuText, (isOffline || isFirebaseError) && styles.disabledText]}>
                                    Обновить
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.actionMenuItem}
                                onPress={handleMuteChat}
                                disabled={isOffline || isFirebaseError}
                            >
                                <Ionicons
                                    name="notifications-off"
                                    size={24}
                                    color={(isOffline || isFirebaseError) ? "#999" : "#1976D2"}
                                    style={styles.actionMenuIcon}
                                />
                                <Text style={[styles.actionMenuText, (isOffline || isFirebaseError) && styles.disabledText]}>
                                    Отключить уведомления
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.actionMenuItem}
                                onPress={handleLeaveChat}
                                disabled={isOffline || isFirebaseError}
                            >
                                <Ionicons
                                    name="exit-outline"
                                    size={24}
                                    color={(isOffline || isFirebaseError) ? "#999" : "#D32F2F"}
                                    style={styles.actionMenuIcon}
                                />
                                <Text style={[styles.actionMenuText, (isOffline || isFirebaseError) && styles.disabledText]}>
                                    Покинуть чат
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.actionMenuItem, styles.actionMenuItemCancel]}
                                onPress={() => setShowActionMenu(false)}
                            >
                                <Text style={styles.actionMenuCancelText}>Отмена</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </Modal>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9F9F9',
    },
    keyboardAvoid: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E5EA',
        backgroundColor: '#FFFFFF',
    },
    backButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    menuButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    twoLineHeaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#770002',
        textAlign: 'center',
    },
    headerSubtitle: {
        fontSize: 13,
        color: '#666',
        textAlign: 'center',
        marginTop: 2,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#770002',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: '#666',
    },
    messagesContainer: {
        padding: 16,
        paddingBottom: 24,
    },
    messageContainer: {
        marginBottom: 16,
        maxWidth: '80%',
    },
    ownMessageContainer: {
        alignSelf: 'flex-end',
    },
    otherMessageContainer: {
        alignSelf: 'flex-start',
    },
    messageSender: {
        fontSize: 12,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
        marginLeft: 8,
    },
    messageBubble: {
        padding: 12,
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 1},
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    ownMessageBubble: {
        backgroundColor: '#F3E5F5',
        borderBottomRightRadius: 4,
    },
    otherMessageBubble: {
        backgroundColor: '#E3F2FD',
        borderBottomLeftRadius: 4,
    },
    tempMessageBubble: {
        opacity: 0.7,
    },
    messageContent: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    messageText: {
        fontSize: 14,
        color: '#333',
        lineHeight: 20,
    },
    ownMessageText: {
        fontSize: 14,
        color: '#333',
        lineHeight: 20,
    },
    messageLink: {
        color: '#007AFF',
        textDecorationLine: 'underline',
    },
    ownMessageLink: {
        color: '#7B1FA2',
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
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E5E5EA',
        padding: 8,
        paddingBottom: Platform.OS === 'ios' ? 20 : 8,
        paddingLeft: 12,
        paddingRight: 12,
    },
    messageInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#E0E0E0',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        maxHeight: 100,
        fontSize: 16,
        backgroundColor: '#F9F9F9',
    },
    sendButton: {
        backgroundColor: '#bb0000',
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    sendButtonDisabled: {
        backgroundColor: '#E0E0E0',
    },
    emptyContainer: {
        padding: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        color: '#999',
        textAlign: 'center',
        fontSize: 16,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    actionMenuContainer: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        padding: 16,
        paddingBottom: Platform.OS === 'ios' ? 30 : 16, // Additional padding for iOS
    },
    actionMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
    },
    actionMenuItemCancel: {
        justifyContent: 'center',
        borderBottomWidth: 0,
        marginTop: 8,
    },
    actionMenuIcon: {
        marginRight: 16,
    },
    actionMenuText: {
        fontSize: 16,
        color: '#333',
    },
    actionMenuCancelText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#bb0000',
    },
    messageFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 4,
        marginRight: 8,
    },
    messageStatusIcon: {
        marginLeft: 4,
    },
    failedMessageBubble: {
        borderColor: '#F44336',
        borderWidth: 1,
        opacity: 0.8,
    },
    offlineBar: {
        backgroundColor: '#E53935',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 6,
    },
    offlineText: {
        color: '#fff',
        fontSize: 14,
        marginLeft: 6,
        fontWeight: '500',
    },
    disabledText: {
        color: '#999',
    },
});