// File: app/(tabs)/notifications.tsx
import React, {useCallback, useEffect, useState} from 'react';
// Add ScrollView import at the top
import {
    ActivityIndicator,
    Alert,
    FlatList,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {router, useFocusEffect} from 'expo-router';
import {format, formatDistanceToNow} from 'date-fns';
import {ru} from 'date-fns/locale';
import apiClient from '../../src/api/apiClient';

// Define notification types
type NotificationType = 'ticket' | 'chat' | 'system' | 'schedule' | 'verification' | 'news' | 'personal';

// Define the notification interface
interface Notification {
    id: number;
    title: string;
    body: string;
    type: NotificationType;
    is_read: boolean;
    created_at: string;
    read_at: string | null;
    data?: any;
    related_type?: string | null;
    related_id?: number | null;
    sender?: {
        id: number;
        name: string;
    } | null;
}

// Define pagination state
interface PaginationState {
    page: number;
    per_page: number;
    total_count: number;
    pages: number;
    has_next: boolean;
    has_prev: boolean;
}

// API response interface
interface NotificationsResponse {
    notifications: Notification[];
    unread_count: number;
    total_count: number;
    page: number;
    per_page: number;
    pages: number;
    has_next: boolean;
    has_prev: boolean;
    success: boolean;
}

export default function NotificationsScreen() {
    // State
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [pagination, setPagination] = useState<PaginationState>({
        page: 1,
        per_page: 20,
        total_count: 0,
        pages: 1,
        has_next: false,
        has_prev: false
    });
    const [unreadCount, setUnreadCount] = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filter state
    const [showUnreadOnly, setShowUnreadOnly] = useState(false);
    const [selectedType, setSelectedType] = useState<string | null>(null);

    // Load notifications
    const loadNotifications = useCallback(async (page = 1, refresh = false) => {
        try {
            // Set loading state
            if (refresh) {
                setRefreshing(true);
            } else if (page === 1) {
                setLoading(true);
            } else {
                setLoadingMore(true);
            }

            // Clear any previous errors
            setError(null);

            // Build query parameters
            const params: Record<string, string | number> = {
                page,
                per_page: pagination.per_page
            };

            // Add filters if selected
            if (showUnreadOnly) {
                params.unread_only = 'true';
            }

            if (selectedType) {
                params.type = selectedType;
            }

            // Make API request
            const response = await apiClient.get<NotificationsResponse>('/notifications', {params});

            const {
                notifications: newNotifications,
                unread_count,
                page: returnedPage,
                per_page,
                pages,
                has_next,
                has_prev,
                total_count
            } = response.data;

            // Update state
            if (refresh || page === 1) {
                setNotifications(newNotifications);
            } else {
                // Append new notifications to existing list
                setNotifications(prev => [...prev, ...newNotifications]);
            }

            // Update pagination
            setPagination({
                page: returnedPage,
                per_page,
                total_count,
                pages,
                has_next,
                has_prev
            });

            // Update unread count
            setUnreadCount(unread_count);
        } catch (err) {
            console.error('Error loading notifications:', err);
            setError('Failed to load notifications. Pull down to try again.');
        } finally {
            // Reset loading states
            setLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
        }
    }, [pagination.per_page, showUnreadOnly, selectedType]);

    // Initial load
    useEffect(() => {
        loadNotifications();
    }, [loadNotifications]);

    // Refresh on screen focus
    useFocusEffect(
        useCallback(() => {
            loadNotifications(1, true);
        }, [loadNotifications])
    );

    // Refresh handler for pull-to-refresh
    const handleRefresh = useCallback(() => {
        loadNotifications(1, true);
    }, [loadNotifications]);

    // Load more notifications when reaching end of list
    const handleLoadMore = useCallback(() => {
        if (loadingMore || !pagination.has_next) return;
        loadNotifications(pagination.page + 1);
    }, [loadNotifications, pagination.page, pagination.has_next, loadingMore]);

    // Mark notification as read
    const markAsRead = useCallback(async (notificationId: number) => {
        try {
            await apiClient.post(`/notifications/${notificationId}/read`);

            // Update local state
            setNotifications(prev =>
                prev.map(notification =>
                    notification.id === notificationId
                        ? {...notification, is_read: true, read_at: new Date().toISOString()}
                        : notification
                )
            );

            // Decrement unread count if this was unread
            const wasUnread = notifications.find(n => n.id === notificationId)?.is_read === false;
            if (wasUnread) {
                setUnreadCount(prev => Math.max(0, prev - 1));
            }
        } catch (err) {
            console.error('Error marking notification as read:', err);
        }
    }, [notifications]);

    // Mark all notifications as read
    const markAllAsRead = useCallback(async () => {
        try {
            await apiClient.post('/notifications/read-all');

            // Update local state
            setNotifications(prev =>
                prev.map(notification => ({
                    ...notification,
                    is_read: true,
                    read_at: new Date().toISOString()
                }))
            );

            // Reset unread count
            setUnreadCount(0);


        } catch (err) {
            console.error('Error marking all notifications as read:', err);
            Alert.alert('Error', 'Failed to mark all notifications as read');
        }
    }, []);

    // Handle notification press
    const handleNotificationPress = useCallback((notification: Notification) => {
        // Mark as read if not already read
        if (!notification.is_read) {
            markAsRead(notification.id);
        }

        // Navigate based on notification type
        if (notification.related_type && notification.related_id) {
            switch (notification.related_type) {
                case 'ticket':
                    router.push(`/profile/tickets`);
                    break;
                case 'schedule':
                    // May need to pass date or other params
                    router.push({
                        pathname: '/(tabs)',
                        params: {initialDate: notification.data?.date}
                    });
                    break;
                case 'verification':
                    router.push('/verification');
                    break;
                default:
                    // Handle unknown related_type
                    console.log(`Unsupported related_type: ${notification.related_type}`);
            }
        } else {
            // Handle by type when no related entity
            switch (notification.type) {
                case 'chat':
                    if (notification.data?.chat_id) {
                        router.push(`/chat/${notification.data.chat_id}`);
                    } else {
                        router.push('/chats');
                    }
                    break;
                case 'news':
                    if (notification.data?.news_id) {
                        router.push(`/newsitem/${notification.data.news_id}`);
                    } else {
                        router.push('/news-list');
                    }
                    break;
                case 'system':
                case 'personal':
                    // These don't need navigation, just viewing the notification
                    break;
                default:
                    // Generic case - just view notification
                    break;
            }
        }
    }, [markAsRead]);

    // Toggle filter for unread only
    const toggleUnreadFilter = useCallback(() => {
        setShowUnreadOnly(prev => !prev);
        // Reset to page 1 and reload
        setTimeout(() => loadNotifications(1), 0);
    }, [loadNotifications]);

    // Set notification type filter
    const setTypeFilter = useCallback((type: string | null) => {
        setSelectedType(type);
        // Reset to page 1 and reload
        setTimeout(() => loadNotifications(1), 0);
    }, [loadNotifications]);

    // Get icon for notification type
    const getNotificationIcon = (type: NotificationType): { name: string; color: string } => {
        switch (type) {
            case 'ticket':
                return {name: 'help-circle', color: '#FF9800'};
            case 'chat':
                return {name: 'chatbubbles', color: '#2196F3'};
            case 'system':
                return {name: 'information-circle', color: '#607D8B'};
            case 'schedule':
                return {name: 'calendar', color: '#4CAF50'};
            case 'verification':
                return {name: 'shield', color: '#9C27B0'};
            case 'news':
                return {name: 'newspaper', color: '#FF5722'};
            case 'personal':
                return {name: 'person-circle', color: '#673AB7'};
            default:
                return {name: 'notifications', color: '#607D8B'};
        }
    };

    // Format date for display
    const formatNotificationDate = (dateString: string): string => {
        const date = new Date(dateString);
        const now = new Date();

        // If today, show time
        if (date.toDateString() === now.toDateString()) {
            return format(date, 'HH:mm', {locale: ru});
        }

        // If within past week, show relative time
        if (now.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
            return formatDistanceToNow(date, {addSuffix: true, locale: ru});
        }

        // Otherwise show date
        return format(date, 'dd.MM.yyyy', {locale: ru});
    };

    // Render notification item
    const renderNotificationItem = ({item}: { item: Notification }) => {
        const {name, color} = getNotificationIcon(item.type);

        return (
            <TouchableOpacity
                style={[
                    styles.notificationItem,
                    !item.is_read && styles.unreadNotification
                ]}
                onPress={() => handleNotificationPress(item)}
                activeOpacity={0.7}
            >
                <View style={styles.notificationIconContainer}>
                    <View style={[styles.iconBackground, {backgroundColor: `${color}20`}]}>
                        <Ionicons name={name} size={24} color={color}/>
                    </View>
                    {!item.is_read && <View style={styles.unreadDot}/>}
                </View>

                <View style={styles.notificationContent}>
                    <View style={styles.notificationHeader}>
                        <Text style={styles.notificationTitle} numberOfLines={1}>
                            {item.title}
                        </Text>
                        <Text style={styles.notificationTime}>
                            {formatNotificationDate(item.created_at)}
                        </Text>
                    </View>

                    <Text style={styles.notificationBody} numberOfLines={2}>
                        {item.body}
                    </Text>

                    {item.sender && (
                        <Text style={styles.senderText}>
                            От: {item.sender.name}
                        </Text>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    // Render filter chips
    const renderFilterChips = () => (
        <View style={styles.filterContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                <TouchableOpacity
                    style={[
                        styles.filterChip,
                        showUnreadOnly && styles.filterChipActive
                    ]}
                    onPress={toggleUnreadFilter}
                >
                    <Text style={[
                        styles.filterChipText,
                        showUnreadOnly && styles.filterChipTextActive
                    ]}>
                        Непрочитанные{unreadCount > 0 ? ` (${unreadCount})` : ''}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.filterChip,
                        selectedType === null && styles.filterChipActive
                    ]}
                    onPress={() => setTypeFilter(null)}
                >
                    <Text style={[
                        styles.filterChipText,
                        selectedType === null && styles.filterChipTextActive
                    ]}>
                        Все
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.filterChip,
                        selectedType === 'ticket' && styles.filterChipActive
                    ]}
                    onPress={() => setTypeFilter('ticket')}
                >
                    <Text style={[
                        styles.filterChipText,
                        selectedType === 'ticket' && styles.filterChipTextActive
                    ]}>
                        Тикеты
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.filterChip,
                        selectedType === 'chat' && styles.filterChipActive
                    ]}
                    onPress={() => setTypeFilter('chat')}
                >
                    <Text style={[
                        styles.filterChipText,
                        selectedType === 'chat' && styles.filterChipTextActive
                    ]}>
                        Чаты
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.filterChip,
                        selectedType === 'system' && styles.filterChipActive
                    ]}
                    onPress={() => setTypeFilter('system')}
                >
                    <Text style={[
                        styles.filterChipText,
                        selectedType === 'system' && styles.filterChipTextActive
                    ]}>
                        Системные
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.filterChip,
                        selectedType === 'news' && styles.filterChipActive
                    ]}
                    onPress={() => setTypeFilter('news')}
                >
                    <Text style={[
                        styles.filterChipText,
                        selectedType === 'news' && styles.filterChipTextActive
                    ]}>
                        Новости
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );

    // Render list header
    const renderListHeader = () => (
        <>
            {renderFilterChips()}
            <View style={styles.headerContainer}>
                <Text style={styles.headerTitle}>
                    Уведомления {notifications.length > 0 ? `(${notifications.length})` : ''}
                </Text>

                {unreadCount > 0 && (
                    <TouchableOpacity
                        style={styles.markAllButton}
                        onPress={markAllAsRead}
                    >
                        <Text style={styles.markAllButtonText}>
                            Прочитать все
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        </>
    );

    // Render footer (loading indicator for pagination)
    const renderFooter = () => {
        if (!loadingMore) return null;
        return (
            <View style={styles.loadingFooter}>
                <ActivityIndicator size="small" color="#770002"/>
                <Text style={styles.loadingText}>Загрузка уведомлений...</Text>
            </View>
        );
    };

    // Render empty state
    const renderEmptyState = () => {
        if (loading) return null;

        return (
            <View style={styles.emptyContainer}>
                <Ionicons name="notifications-off-outline" size={64} color="#ccc"/>
                <Text style={styles.emptyText}>
                    {error || "У вас пока нет уведомлений"}
                </Text>
                {showUnreadOnly && (
                    <TouchableOpacity onPress={toggleUnreadFilter}>
                        <Text style={styles.showAllText}>
                            Показать все уведомления
                        </Text>
                    </TouchableOpacity>
                )}
                {selectedType && (
                    <TouchableOpacity onPress={() => setTypeFilter(null)}>
                        <Text style={styles.showAllText}>
                            Сбросить фильтр по типу
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF"/>

            {loading && notifications.length === 0 ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#770002"/>
                    <Text style={styles.loadingText}>Загрузка уведомлений...</Text>
                </View>
            ) : (
                <FlatList
                    data={notifications}
                    renderItem={renderNotificationItem}
                    keyExtractor={item => `notification-${item.id}`}
                    contentContainerStyle={styles.listContainer}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            colors={['#770002']}
                            tintColor="#770002"
                        />
                    }
                    ListHeaderComponent={renderListHeader}
                    ListEmptyComponent={renderEmptyState}
                    ListFooterComponent={renderFooter}
                    onEndReached={handleLoadMore}
                    onEndReachedThreshold={0.2}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f8f8',
    },
    listContainer: {
        flexGrow: 1,
        paddingBottom: 20,
    },
    headerContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    markAllButton: {
        padding: 8,
    },
    markAllButtonText: {
        color: '#770002',
        fontWeight: '500',
        fontSize: 14,
    },
    filterContainer: {
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
        paddingVertical: 8,
    },
    filterScroll: {
        paddingHorizontal: 16,
    },
    filterChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: '#f0f0f0',
        marginRight: 8,
    },
    filterChipActive: {
        backgroundColor: '#770002',
    },
    filterChipText: {
        fontSize: 14,
        color: '#555',
    },
    filterChipTextActive: {
        color: '#fff',
    },
    notificationItem: {
        flexDirection: 'row',
        padding: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    unreadNotification: {
        backgroundColor: '#FFF8F8',
    },
    notificationIconContainer: {
        marginRight: 16,
        position: 'relative',
    },
    iconBackground: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    unreadDot: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#770002',
        borderWidth: 2,
        borderColor: '#fff',
    },
    notificationContent: {
        flex: 1,
    },
    notificationHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 4,
    },
    notificationTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
        flex: 1,
        marginRight: 8,
    },
    notificationTime: {
        fontSize: 12,
        color: '#777',
    },
    notificationBody: {
        fontSize: 14,
        color: '#555',
        lineHeight: 20,
    },
    senderText: {
        fontSize: 12,
        color: '#770002',
        marginTop: 4,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingFooter: {
        paddingVertical: 20,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
    },
    loadingText: {
        marginLeft: 10,
        fontSize: 14,
        color: '#666',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        minHeight: 300,
    },
    emptyText: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        marginTop: 16,
        marginBottom: 8,
    },
    showAllText: {
        color: '#770002',
        fontSize: 14,
        marginTop: 12,
        textDecorationLine: 'underline',
    },
});