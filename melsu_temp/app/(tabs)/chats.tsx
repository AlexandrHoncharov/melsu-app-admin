import React, {forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableHighlight,
    TouchableOpacity,
    View
} from 'react-native';
import {useFocusEffect, useRouter} from 'expo-router';
import {Ionicons} from '@expo/vector-icons';
import chatService from '../../src/services/chatService';
import {useAuth} from '../../hooks/useAuth'; // Import useAuth hook

const ChatsList = forwardRef((props, ref) => {
    const [chats, setChats] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [deletingChatId, setDeletingChatId] = useState(null);
    const [timeoutId, setTimeoutId] = useState(null); // Таймаут для отмены бесконечной загрузки
    const [isRefreshing, setIsRefreshing] = useState(false); // Состояние для pull-to-refresh
    const intervalRef = useRef(null); // Для хранения ссылки на интервал обновления
    const alreadyLoadedRef = useRef(false); // Для отслеживания первой загрузки
    const focusedRef = useRef(false); // Для отслеживания фокуса экрана
    const router = useRouter();
    const {user} = useAuth(); // Get user data from Auth context

    // Проверка статуса верификации
    const isVerified = user?.role === 'teacher' || user?.verificationStatus === 'verified';
    const isPending = user?.role === 'student' && user?.verificationStatus === 'pending';

    // Интервал обновления списка в миллисекундах
    const UPDATE_INTERVAL = 30000; // 30 секунд

    // Функция загрузки чатов с таймаутом
    const loadChats = async (silent = false) => {
        // Если пользователь не верифицирован, не загружаем чаты
        if (!isVerified && !isPending) {
            return;
        }

        // Если запущена тихая загрузка, не показываем индикатор загрузки
        if (!silent) {
            console.log('Начинаем загрузку чатов');
            setIsLoading(true);
        } else {
            console.log('Начинаем тихую фоновую загрузку чатов');
        }

        // Устанавливаем таймаут, который отменит загрузку через 8 секунд
        const loadingTimeout = setTimeout(() => {
            console.log('Превышен таймаут загрузки чатов');
            if (!silent) setIsLoading(false);
            setIsRefreshing(false); // Сбрасываем состояние pull-to-refresh при тайм-ауте
            // Если после тайм-аута список чатов пуст, добавляем пустой массив
            setChats(prevChats => prevChats.length > 0 ? prevChats : []);
        }, 8000);

        setTimeoutId(loadingTimeout);

        try {
            // Инициализируем chatService если необходимо
            const initialized = await chatService.initialize();
            if (!initialized) {
                console.log('Не удалось инициализировать chatService');
                if (!silent) setIsLoading(false);
                setIsRefreshing(false); // Сбрасываем состояние pull-to-refresh
                clearTimeout(loadingTimeout);
                // Если инициализация не удалась, устанавливаем пустой массив
                setChats([]);
                return;
            }

            // Получаем список чатов с ограничением времени выполнения
            const fetchPromise = chatService.getUserChats();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Таймаут получения списка чатов')), 6000)
            );

            const userChats = await Promise.race([fetchPromise, timeoutPromise])
                .catch(err => {
                    console.log('Ошибка или таймаут при получении чатов:', err.message);
                    return []; // Возвращаем пустой массив в случае ошибки или таймаута
                });

            console.log(`Загружено ${userChats.length} чатов`);
            setChats(userChats);
        } catch (error) {
            console.error('Ошибка загрузки чатов:', error);
            // В случае ошибки устанавливаем пустой массив
            setChats([]);
        } finally {
            console.log('Завершаем загрузку чатов');
            if (!silent) setIsLoading(false);
            setIsRefreshing(false); // Сбрасываем состояние pull-to-refresh
            clearTimeout(loadingTimeout);
        }
    };

    // Обработчик pull-to-refresh
    const handlePullToRefresh = () => {
        console.log('Обновление списка через pull-to-refresh');
        setIsRefreshing(true); // Устанавливаем состояние обновления
        loadChats(true); // Загружаем чаты в тихом режиме (без полного индикатора загрузки)
    };

    // Функция для настройки интервала обновления
    const setupUpdateInterval = () => {
        // Skip for unverified users
        if (!isVerified && !isPending) {
            return;
        }

        // Очищаем предыдущий интервал, если он существует
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }

        // Устанавливаем новый интервал
        intervalRef.current = setInterval(() => {
            if (focusedRef.current) {
                console.log('Интервальное обновление списка чатов');
                loadChats(true); // Тихая загрузка без индикатора
            }
        }, UPDATE_INTERVAL);

        console.log(`Установлен интервал обновления списка чатов: ${UPDATE_INTERVAL}ms`);
    };

    // Используем хук useFocusEffect для обновления списка чатов
    useFocusEffect(
        React.useCallback(() => {
            console.log('Экран чатов в фокусе');
            focusedRef.current = true;

            // Skip setup for unverified users
            if (!isVerified && !isPending) {
                return;
            }

            // Первая загрузка - выполняем только если список пуст и ранее не загружался
            if (!alreadyLoadedRef.current || chats.length === 0) {
                console.log('Первая загрузка списка чатов');
                setRefreshKey(prev => prev + 1);
                alreadyLoadedRef.current = true;
            }

            // Настраиваем интервал обновления
            setupUpdateInterval();

            // При потере фокуса экраном
            return () => {
                console.log('Экран чатов потерял фокус');
                focusedRef.current = false;

                // Очищаем интервал обновления при потере фокуса
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
            };
        }, [chats.length, isVerified, isPending])
    );

    // Загрузка при первом рендере или изменении ключа обновления
    useEffect(() => {
        // Skip loading for unverified users
        if (!isVerified && !isPending) {
            return;
        }

        loadChats();

        // Очистка при размонтировании
        return () => {
            if (timeoutId) clearTimeout(timeoutId);
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [refreshKey, isVerified, isPending]);

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

                        // Устанавливаем таймаут для отмены бесконечной загрузки
                        const deleteTimeout = setTimeout(() => {
                            console.log('Превышен таймаут удаления чата');
                            setDeletingChatId(null);
                            Alert.alert('Ошибка', 'Превышено время ожидания. Попробуйте еще раз.');
                        }, 10000);

                        // Отмечаем чат как удаляемый
                        setDeletingChatId(chat.id);

                        console.log(`Начинаем удаление чата ${chat.id}`);
                        try {
                            // Локально удаляем чат для моментальной обратной связи
                            removeLocalChat(chat.id);

                            // Проверяем наличие метода deleteChat в chatService
                            if (typeof chatService.deleteChat !== 'function') {
                                console.log('Метод deleteChat не найден, оставляем только локальное удаление');
                                clearTimeout(deleteTimeout);
                                Alert.alert('Готово', 'Чат удален из вашего списка');
                                setDeletingChatId(null);
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
                            // Очищаем таймаут и сбрасываем идентификатор удаляемого чата
                            clearTimeout(deleteTimeout);
                            setDeletingChatId(null);
                        }
                    }
                }
            ]
        );
    };

    // Обработчик долгого нажатия на чат
    const handleLongPress = (chat) => {
        // Вызываем функцию удаления при долгом нажатии
        handleDeleteChat(chat);
    };

    // Рендер элемента чата
    const renderChatItem = ({item}) => {
        // Определяем название чата
        const chatName = item.type === 'group'
            ? item.name
            : (item.withUserName || `Пользователь ${item.withUser}`);

        // Определяем время последнего сообщения
        const lastMessageTime = item.lastMessage?.timestamp
            ? new Date(item.lastMessage.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
            : '';

        // Проверка, идет ли процесс удаления этого чата
        const isDeleting = deletingChatId === item.id;

        return (
            <View style={styles.chatItemContainer}>
                <TouchableHighlight
                    style={styles.chatItem}
                    onPress={() => handleChatPress(item.id)}
                    onLongPress={() => handleLongPress(item)}
                    underlayColor="#f5f5f5"
                    activeOpacity={0.7}
                    delayLongPress={500} // 500мс для долгого нажатия
                    disabled={isDeleting}
                >
                    <View style={styles.chatItemContent}>
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
                    </View>
                </TouchableHighlight>

                {/* Индикатор удаления чата */}
                {isDeleting && (
                    <View style={styles.deleteIndicator}>
                        <ActivityIndicator size="small" color="#FF3B30"/>
                    </View>
                )}
            </View>
        );
    };

    // Render verification required message for unverified students
    if (user?.role === 'student' && !isVerified && !isPending) {
        return (
            <View style={styles.container}>
                <View style={styles.verificationRequiredContainer}>
                    <Image
                        source={require('../../assets/images/university-logo.png')}
                        style={styles.verificationLogo}
                        resizeMode="contain"
                    />
                    <Ionicons name="shield-outline" size={64} color="#770002"/>
                    <Text style={styles.verificationTitle}>Требуется верификация</Text>
                    <Text style={styles.verificationMessage}>
                        Для доступа к чатам необходимо пройти верификацию студенческого билета.
                    </Text>
                    <TouchableOpacity
                        style={styles.verificationButton}
                        onPress={() => router.push('/verification')}
                    >
                        <Text style={styles.verificationButtonText}>Пройти верификацию</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // Show pending verification message for students with pending verification
    if (user?.role === 'student' && isPending) {
        return (
            <View style={styles.container}>
                <View style={styles.verificationRequiredContainer}>
                    <Image
                        source={require('../../assets/images/university-logo.png')}
                        style={styles.verificationLogo}
                        resizeMode="contain"
                    />
                    <Ionicons name="hourglass-outline" size={64} color="#FF9800"/>
                    <Text style={styles.verificationTitle}>Верификация в процессе</Text>
                    <Text style={styles.verificationMessage}>
                        Ваш студенческий билет находится на проверке. Доступ к чатам будет открыт после успешной
                        верификации.
                    </Text>
                    <Text style={styles.verificationSubMessage}>
                        Обычно проверка занимает 1-2 рабочих дня.
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {isLoading && (
                <View style={styles.loaderContainer}>
                    <ActivityIndicator size="large" color="#770002"/>
                </View>
            )}

            <FlatList
                data={chats}
                renderItem={renderChatItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContainer}
                // Добавляем RefreshControl для поддержки pull-to-refresh
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handlePullToRefresh}
                        colors={['#770002']} // Цвет индикатора загрузки для Android
                        tintColor="#770002" // Цвет индикатора загрузки для iOS
                        title="Обновление..." // Только для iOS
                        titleColor="#770002" // Только для iOS
                    />
                }
                ListEmptyComponent={
                    !isLoading ? (
                        <View style={styles.emptyContainer}>
                            <Ionicons name="chatbubbles-outline" size={48} color="#ccc"/>
                            <Text style={styles.emptyText}>У вас пока нет чатов</Text>
                            <Text style={styles.emptyHint}>Для удаления чата удерживайте его</Text>
                            <Text style={styles.emptyHint}>Потяните вниз для обновления</Text>
                        </View>
                    ) : null
                }
            />

            {/* Кнопка добавления нового чата */}
            <TouchableOpacity
                style={styles.addButton}
                onPress={() => router.push('/new-chat')}
                activeOpacity={0.8}
            >
                <Ionicons name="add" size={28} color="#FFF"/>
            </TouchableOpacity>
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
        paddingBottom: 80, // Пространство для плавающей кнопки
    },
    chatItemContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    chatItem: {
        flex: 1,
        paddingVertical: 12,
    },
    chatItemContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
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
    emptyHint: {
        marginTop: 8,
        fontSize: 14,
        color: '#999',
        textAlign: 'center',
    },
    deleteIndicator: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    textDisabled: {
        color: '#cccccc',
    },
    addButton: {
        position: 'absolute',
        right: 20,
        bottom: 20,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#770002',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 5,
        zIndex: 2,
    },
    verificationRequiredContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30,
    },
    verificationLogo: {
        width: 80,
        height: 80,
        marginBottom: 20,
    },
    verificationTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#333',
        marginTop: 16,
        marginBottom: 12,
        textAlign: 'center',
    },
    verificationMessage: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    verificationSubMessage: {
        fontSize: 14,
        color: '#888',
        textAlign: 'center',
        fontStyle: 'italic',
    },
    verificationButton: {
        backgroundColor: '#770002',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        marginTop: 24,
    },
    verificationButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default ChatsList;