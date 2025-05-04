// File: components/ChatsList.tsx
import React, {forwardRef, useEffect, useImperativeHandle, useState} from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {router, useFocusEffect} from 'expo-router';
import {useAuth} from '../hooks/useAuth';
import {useUnreadMessages} from '../hooks/useUnreadMessages';
import chatService from '../src/services/chatService';

// ChatsList as a forwardRef component
const ChatsList = forwardRef((props, ref) => {
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const {user} = useAuth();
    const {refreshUnreadCount} = useUnreadMessages();
    const [unreadStates, setUnreadStates] = useState({});

    // Expose handleRefresh to parent component
    useImperativeHandle(ref, () => ({
        handleRefresh: () => {
            if (!refreshing) {
                handleRefresh();
            }
        }
    }));

    // Refresh unread count when the screen gains focus
    useFocusEffect(
        React.useCallback(() => {
            refreshUnreadCount();
            updateUnreadStates();
        }, [])
    );

    // Update unread states for all chats
    const updateUnreadStates = async () => {
        if (!chats || chats.length === 0) return;

        const newUnreadStates = {};

        for (const chat of chats) {
            try {
                const count = await chatService.getUnreadMessageCount(chat.id);
                newUnreadStates[chat.id] = count > 0;
            } catch (error) {
                console.error(`Error checking unread status for chat ${chat.id}:`, error);
                newUnreadStates[chat.id] = false;
            }
        }

        setUnreadStates(newUnreadStates);
    };

    // Load chat list with forced initialization
    const loadChats = async (withRefreshing = false) => {
        try {
            if (!withRefreshing) {
                setLoading(true);
            }

            console.log('Loading chats with fresh initialization...');

            // Force clean up of previous listeners before initializing
            chatService.cleanup();

            // Reset initialized flag to force service to fully reinitialize
            chatService.initialized = false;

            // Initialize service and load chats
            await chatService.initialize();

            // Force current user ID if available
            if (user?.id) {
                chatService.forceCurrentUserId(String(user.id));
            }

            const userChats = await chatService.getUserChats();
            setChats(userChats);

            console.log(`Loaded ${userChats.length} chats`);

            // Refresh unread count after loading chats
            refreshUnreadCount();

            // Update unread states for each chat
            if (userChats.length > 0) {
                await updateUnreadStates();
            }
        } catch (error) {
            console.error('Error loading chats:', error);

            // Clear chat list on error
            setChats([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Load on first render
    useEffect(() => {
        loadChats();

        // Unsubscribe from listeners when unmounting
        return () => {
            chatService.cleanup();
        };
    }, []);

    // Pull-to-refresh handler with full cache clear
    const handleRefresh = () => {
        console.log('Refreshing chats with full cache clear...');
        setRefreshing(true);

        // Completely clear listeners before loading
        chatService.cleanup();

        // Reset service state while preserving user
        const tempUser = chatService.currentUser;
        chatService.initialized = false;

        // Restore user if it existed
        if (tempUser) {
            chatService.currentUser = tempUser;
        }

        // Reload chats
        loadChats(true);
    };

    // Format time
    const formatTime = (timestamp) => {
        if (!timestamp) return '';

        const date = new Date(timestamp);
        const now = new Date();

        // Today - only time
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
        }

        // Within the week - day of week
        const days = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
        const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
        if (diff < 7) {
            return days[date.getDay()];
        }

        // Otherwise - date
        return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    };

    // Get initials for avatar
    const getInitials = (name) => {
        if (!name) return "??";

        const parts = name.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }

        return name.substring(0, 2).toUpperCase();
    };

    // Render chat item - NO HOOKS INSIDE THIS FUNCTION
    const renderChatItem = ({item}) => {
        // Determine display chat name
        let chatName = 'Чат';
        let chatRole = '';

        if (item.type === 'personal') {
            chatName = item.withUserName || 'Личный чат';
            chatRole = item.withUserRole || '';
        } else if (item.type === 'group') {
            chatName = item.name || 'Групповой чат';
        }

        // Get initials for avatar
        const initials = getInitials(chatName);

        // Check for unread indicator from the unreadStates object
        const hasUnread = unreadStates[item.id] || false;

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
                        <Ionicons name="people" size={22} color="#fff"/>
                    ) : (
                        <Text style={styles.avatarText}>{initials}</Text>
                    )}
                </View>

                <View style={styles.chatInfo}>
                    <Text style={styles.chatName} numberOfLines={1}>{chatName}</Text>

                    {item.lastMessage && (
                        <Text style={[
                            styles.lastMessage,
                            hasUnread ? styles.unreadMessage : {}
                        ]} numberOfLines={1}>
                            {String(item.lastMessage.senderId) === String(user?.id) ? 'Вы: ' : ''}
                            {item.lastMessage.text}
                        </Text>
                    )}
                </View>

                <View style={styles.metaInfo}>
                    {hasUnread && (
                        <View style={styles.unreadIndicator}/>
                    )}
                    {item.lastMessage && (
                        <Text style={[
                            styles.timeText,
                            hasUnread ? styles.unreadTimeText : {}
                        ]}>
                            {formatTime(item.lastMessage.timestamp)}
                        </Text>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    // Setup chat messages listener to update unread states
    useEffect(() => {
        if (!chats || chats.length === 0) return;

        // This sets up a listener that updates unread states whenever messages change
        const setupMessageListeners = async () => {
            for (const chat of chats) {
                chatService.setupChatMessageListener(chat.id, () => {
                    // Just update this specific chat's unread state
                    chatService.getUnreadMessageCount(chat.id).then(count => {
                        setUnreadStates(prev => ({
                            ...prev,
                            [chat.id]: count > 0
                        }));
                    });
                });
            }
        };

        setupMessageListeners();

        return () => {
            // Clean up listeners when component unmounts
            for (const chat of chats) {
                chatService.removeChatMessageListener(chat.id);
            }
        };
    }, [chats]);

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#770002"/>
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
                    <Ionicons name="chatbubbles-outline" size={64} color="#ccc"/>
                    <Text style={styles.emptyTitle}>У вас пока нет чатов</Text>
                    <Text style={styles.emptySubtitle}>
                        {user?.role === 'student'
                            ? 'Начните общение с преподавателем'
                            : 'Начните общение со студентом или создайте групповой чат'
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
                <Ionicons name="add" size={24} color="#fff"/>
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
        backgroundColor: '#2E7D32', // Green for teachers
    },
    studentAvatar: {
        backgroundColor: '#0277BD', // Blue for students
    },
    groupAvatar: {
        backgroundColor: '#4CAF50', // Green for group chats
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
    unreadMessage: {
        fontWeight: '700',
        color: '#333',
    },
    metaInfo: {
        alignItems: 'flex-end',
    },
    timeText: {
        fontSize: 12,
        color: '#999',
    },
    unreadTimeText: {
        color: '#770002',
        fontWeight: 'bold',
    },
    unreadIndicator: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#770002',
        marginBottom: 6,
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
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
});

export default ChatsList;