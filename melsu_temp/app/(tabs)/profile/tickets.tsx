import React, {useCallback, useEffect, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Platform,
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
import {router, useNavigation} from 'expo-router';
import {useAuth} from '../../../hooks/useAuth';
import ticketsApi, {Ticket} from '../../../src/api/ticketsApi';

// Add the statusBarHeight calculation
const STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

// Хелпер для отображения времени
const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

// Хелпер для категорий
const getCategoryInfo = (category: string): { name: string; color: string; bgColor: string } => {
    switch (category) {
        case 'technical':
            return {name: 'Техническая проблема', color: '#7B1FA2', bgColor: '#F3E5F5'};
        case 'schedule':
            return {name: 'Проблема с расписанием', color: '#388E3C', bgColor: '#E8F5E9'};
        case 'verification':
            return {name: 'Вопрос по верификации', color: '#1976D2', bgColor: '#E3F2FD'};
        default:
            return {name: 'Другое', color: '#616161', bgColor: '#F5F5F5'};
    }
};

// Хелпер для статусов
const getStatusInfo = (status: string): { name: string; color: string; bgColor: string } => {
    switch (status) {
        case 'new':
            return {name: 'Новый', color: '#1976D2', bgColor: '#E3F2FD'};
        case 'in_progress':
            return {name: 'В обработке', color: '#FFA000', bgColor: '#FFF8E1'};
        case 'waiting':
            return {name: 'Требует уточнения', color: '#E64A19', bgColor: '#FBE9E7'};
        case 'resolved':
            return {name: 'Решен', color: '#388E3C', bgColor: '#E8F5E9'};
        case 'closed':
            return {name: 'Закрыт', color: '#616161', bgColor: '#F5F5F5'};
        default:
            return {name: 'Неизвестно', color: '#616161', bgColor: '#F5F5F5'};
    }
};

export default function TicketsScreen() {
    const {user} = useAuth();
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeFilter, setActiveFilter] = useState('all');
    const navigation = useNavigation();

    // Функция загрузки тикетов
    const loadTickets = async (status?: string) => {
        try {
            setIsLoading(true);
            const response = await ticketsApi.getTickets(status);
            setTickets(response);
            setFilteredTickets(response);
        } catch (error) {
            console.error('Error loading tickets:', error);
            Alert.alert('Ошибка', 'Не удалось загрузить обращения. Пожалуйста, попробуйте позже.');
        } finally {
            setIsLoading(false);
        }
    };

    // Первичная загрузка
    useEffect(() => {
        loadTickets();
    }, []);

    // Pull-to-refresh
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await loadTickets(activeFilter !== 'all' ? activeFilter : undefined);
        } finally {
            setRefreshing(false);
        }
    }, [activeFilter]);

    // Обработка фильтрации
    const handleFilter = async (filter: string) => {
        setActiveFilter(filter);

        // Если это тот же фильтр, просто обновим данные
        if (filter === activeFilter) {
            await onRefresh();
            return;
        }

        // Для фильтра "все" загружаем без фильтрации
        if (filter === 'all') {
            await loadTickets();
            return;
        }

        // Для остальных фильтров запрашиваем с сервера
        await loadTickets(filter);
    };

    // Переход на страницу создания тикета
    const handleCreateTicket = () => {
        router.push('/profile/create-ticket');
    };

    // Переход к деталям тикета
    const handleTicketPress = (ticket: Ticket) => {
        router.push({
            pathname: '/profile/ticket-details',
            params: {ticketId: ticket.id}
        });
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <Ionicons name="chevron-back" size={24} color="#000"/>
                </TouchableOpacity>
                <Text style={styles.title}>Техническая поддержка</Text>
                <TouchableOpacity
                    style={styles.createButton}
                    onPress={handleCreateTicket}
                >
                    <Ionicons name="add" size={24} color="#FFF"/>
                </TouchableOpacity>
            </View>

            {/* Фильтры */}
            <View style={styles.filterContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.filterScroll}>
                    <TouchableOpacity
                        style={[styles.filterButton, activeFilter === 'all' && styles.activeFilterButton]}
                        onPress={() => handleFilter('all')}
                    >
                        <Text style={[styles.filterText, activeFilter === 'all' && styles.activeFilterText]}>Все</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.filterButton, activeFilter === 'new' && styles.activeFilterButton]}
                        onPress={() => handleFilter('new')}
                    >
                        <Text
                            style={[styles.filterText, activeFilter === 'new' && styles.activeFilterText]}>Новые</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.filterButton, activeFilter === 'in_progress' && styles.activeFilterButton]}
                        onPress={() => handleFilter('in_progress')}
                    >
                        <Text style={[styles.filterText, activeFilter === 'in_progress' && styles.activeFilterText]}>В
                            обработке</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.filterButton, activeFilter === 'waiting' && styles.activeFilterButton]}
                        onPress={() => handleFilter('waiting')}
                    >
                        <Text
                            style={[styles.filterText, activeFilter === 'waiting' && styles.activeFilterText]}>Ожидают</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.filterButton, activeFilter === 'resolved' && styles.activeFilterButton]}
                        onPress={() => handleFilter('resolved')}
                    >
                        <Text
                            style={[styles.filterText, activeFilter === 'resolved' && styles.activeFilterText]}>Решенные</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.filterButton, activeFilter === 'closed' && styles.activeFilterButton]}
                        onPress={() => handleFilter('closed')}
                    >
                        <Text
                            style={[styles.filterText, activeFilter === 'closed' && styles.activeFilterText]}>Закрытые</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>

            {/* Список тикетов */}
            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#bb0000"/>
                    <Text style={styles.loadingText}>Загрузка обращений...</Text>
                </View>
            ) : filteredTickets.length > 0 ? (
                <FlatList
                    data={filteredTickets}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({item}) => {
                        const categoryInfo = getCategoryInfo(item.category);
                        const statusInfo = getStatusInfo(item.status);

                        return (
                            <TouchableOpacity
                                style={styles.ticketCard}
                                onPress={() => handleTicketPress(item)}
                            >
                                <View style={styles.ticketHeader}>
                                    <View style={styles.ticketTitleContainer}>
                                        {item.has_unread && (
                                            <View style={styles.unreadDot}/>
                                        )}
                                        <Text style={styles.ticketTitle} numberOfLines={1}>
                                            {item.title}
                                        </Text>
                                    </View>
                                    <Text style={styles.ticketDate}>{formatDate(item.updated_at)}</Text>
                                </View>

                                <View style={styles.tagContainer}>
                                    <View style={[styles.categoryTag, {backgroundColor: categoryInfo.bgColor}]}>
                                        <Text style={[styles.categoryText, {color: categoryInfo.color}]}>
                                            {categoryInfo.name}
                                        </Text>
                                    </View>
                                    <View style={[styles.statusTag, {backgroundColor: statusInfo.bgColor}]}>
                                        <Text style={[styles.statusText, {color: statusInfo.color}]}>
                                            {statusInfo.name}
                                        </Text>
                                    </View>
                                </View>

                                {item.last_message && (
                                    <View style={styles.messagePreview}>
                                        <Text style={styles.messageAuthor}>
                                            {item.last_message.is_from_admin ? 'Поддержка:' : 'Вы:'}
                                        </Text>
                                        <Text style={styles.messageText} numberOfLines={1}>
                                            {item.last_message.text}
                                        </Text>
                                    </View>
                                )}

                                <View style={styles.ticketFooter}>
                                    <View style={styles.messageCount}>
                                        <Ionicons name="chatbubble-outline" size={14} color="#666"/>
                                        <Text style={styles.messageCountText}>
                                            {item.messages_count} {item.messages_count === 1 ? 'сообщение' :
                                            (item.messages_count > 1 && item.messages_count < 5) ? 'сообщения' : 'сообщений'}
                                        </Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={16} color="#666"/>
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#bb0000']}/>
                    }
                />
            ) : (
                <View style={styles.emptyContainer}>

                    <Text style={styles.emptyTitle}>Нет обращений</Text>
                    <Text style={styles.emptyText}>
                        У вас пока нет обращений в техническую поддержку. Создайте новое обращение, если у вас возникли
                        проблемы.
                    </Text>
                    <TouchableOpacity
                        style={styles.createTicketButton}
                        onPress={handleCreateTicket}
                    >
                        <Text style={styles.createTicketButtonText}>Создать обращение</Text>
                    </TouchableOpacity>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9F9F9',
        // Add padding top for Android
        paddingTop: Platform.OS === 'android' ? STATUSBAR_HEIGHT : 0,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
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
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#000',
    },
    createButton: {
        width: 40,
        height: 40,
        backgroundColor: '#bb0000',
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterContainer: {
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E5EA',
        backgroundColor: '#FFFFFF',
    },
    filterScroll: {
        paddingHorizontal: 12,
    },
    filterButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 16,
        marginHorizontal: 4,
        backgroundColor: '#F0F0F5',
    },
    activeFilterButton: {
        backgroundColor: '#bb0000',
    },
    filterText: {
        fontSize: 14,
        color: '#666',
    },
    activeFilterText: {
        color: '#FFFFFF',
        fontWeight: '500',
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
    listContent: {
        padding: 16,
    },
    ticketCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        marginBottom: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 1},
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 1,
    },
    ticketHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    ticketTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 8,
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#bb0000',
        marginRight: 8,
    },
    ticketTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        flex: 1,
    },
    ticketDate: {
        fontSize: 12,
        color: '#888',
    },
    tagContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 12,
    },
    categoryTag: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        marginRight: 8,
        marginBottom: 4,
    },
    categoryText: {
        fontSize: 12,
        fontWeight: '500',
    },
    statusTag: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        marginRight: 8,
        marginBottom: 4,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '500',
    },
    messagePreview: {
        marginBottom: 12,
        backgroundColor: '#F7F7F9',
        padding: 10,
        borderRadius: 8,
        borderLeftWidth: 3,
        borderLeftColor: '#DADADA',
    },
    messageAuthor: {
        fontSize: 12,
        fontWeight: '600',
        color: '#555',
        marginBottom: 2,
    },
    messageText: {
        fontSize: 14,
        color: '#333',
    },
    ticketFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    messageCount: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    messageCountText: {
        fontSize: 12,
        color: '#666',
        marginLeft: 4,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    emptyImage: {
        width: 120,
        height: 120,
        marginBottom: 24,
        opacity: 0.7,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        marginBottom: 24,
    },
    createTicketButton: {
        backgroundColor: '#bb0000',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 24,
    },
    createTicketButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
});