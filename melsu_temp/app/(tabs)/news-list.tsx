import React, {useCallback, useEffect, useState} from 'react';
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    Image,
    Platform,
    RefreshControl,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import {router} from 'expo-router';
import newsApi, {NewsItem} from '../../src/api/newsApi';
import {Ionicons} from '@expo/vector-icons';

const {width} = Dimensions.get('window');

export default function NewsScreen() {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [page, setPage] = useState(1);
    const [hasNextPage, setHasNextPage] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

    const fetchNews = useCallback(async (pageNumber = 1, refresh = false) => {
        try {
            setError(null);

            if (refresh) {
                setRefreshing(true);
            } else if (pageNumber === 1) {
                setLoading(true);
            } else {
                setLoadingMore(true);
            }

            console.log(`Fetching news page ${pageNumber}`);
            const response = await newsApi.getNews(pageNumber);

            if (response.success) {
                if (refresh || pageNumber === 1) {
                    setNews(response.news);
                    // Сбрасываем ошибки изображений при обновлении
                    setImageErrors({});
                } else {
                    // Убедимся, что мы не дублируем новости
                    const existingIds = new Set(news.map(item => item.id));
                    const newItems = response.news.filter(item => !existingIds.has(item.id));

                    if (newItems.length > 0) {
                        setNews(prevNews => [...prevNews, ...newItems]);
                        console.log(`Added ${newItems.length} new news items`);
                    } else {
                        console.log('No new items in response');
                    }
                }

                setPage(response.page);
                setHasNextPage(response.has_next_page);
                console.log(`Page: ${response.page}, hasNextPage: ${response.has_next_page}`);
            } else {
                setError('Failed to load news');
                console.error('API returned failure');
            }
        } catch (error) {
            console.error('Error fetching news:', error);
            setError(error instanceof Error ? error.message : 'Unknown error occurred');
        } finally {
            setLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
        }
    }, [news]);

    useEffect(() => {
        fetchNews();
    }, []);

    const onRefresh = useCallback(() => {
        console.log('Pull-to-refresh triggered');
        fetchNews(1, true);
    }, [fetchNews]);

    const loadMoreNews = useCallback(() => {
        if (loadingMore || !hasNextPage) {
            return;
        }

        console.log(`Loading more news, current page: ${page}, hasNextPage: ${hasNextPage}`);
        fetchNews(page + 1);
    }, [fetchNews, loadingMore, hasNextPage, page]);

    const openNewsDetail = (newsId: string) => {
        router.push(`/newsitem/${newsId}`);
    };

    // Обработчик ошибки загрузки изображения
    const handleImageError = (itemId: string) => {
        console.log(`Image error for item ${itemId}`);
        setImageErrors(prev => ({...prev, [itemId]: true}));
    };

    const renderNewsItem = ({item}: { item: NewsItem }) => (
        <TouchableOpacity
            style={styles.newsCard}
            onPress={() => openNewsDetail(item.id)}
            activeOpacity={0.9}
        >
            <View style={styles.imageContainer}>
                {item.image_url && !imageErrors[item.id] ? (
                    <Image
                        source={{uri: item.image_url}}
                        style={styles.newsImage}
                        resizeMode="cover"
                        onError={() => handleImageError(item.id)}
                        // Добавляем явное указание размеров для устройств Android
                        width={width - 24}  // full width - padding
                        height={180}
                    />
                ) : (
                    <View style={styles.placeholderImage}>
                        <Ionicons name="newspaper-outline" size={40} color="#ccc"/>
                        {imageErrors[item.id] && (
                            <Text style={styles.errorImageText}>Не удалось загрузить изображение</Text>
                        )}
                    </View>
                )}
            </View>
            <View style={styles.contentContainer}>
                <View style={styles.metaRow}>
                    {item.category && (
                        <View style={styles.categoryContainer}>
                            <Text style={styles.categoryText} numberOfLines={1}>{item.category}</Text>
                        </View>
                    )}
                    {item.date && (
                        <Text style={styles.date}>
                            <Ionicons name="calendar-outline" size={12} color="#666"/> {item.date}
                        </Text>
                    )}
                </View>
                <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                {item.description && (
                    <Text style={styles.description} numberOfLines={3}>{item.description}</Text>
                )}
            </View>
        </TouchableOpacity>
    );

    const renderFooter = () => {
        if (!loadingMore) return null;
        return (
            <View style={styles.loadingMore}>
                <ActivityIndicator size="small" color="#770002"/>
                <Text style={styles.loadingMoreText}>Загрузка новостей...</Text>
            </View>
        );
    };

    if (loading && news.length === 0) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <StatusBar barStyle="dark-content"/>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#770002"/>
                    <Text style={styles.loadingText}>Загрузка новостей...</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (error && news.length === 0) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <StatusBar barStyle="dark-content"/>
                <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle-outline" size={50} color="#770002"/>
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={() => fetchNews()}>
                        <Text style={styles.retryButtonText}>Повторить</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="dark-content"/>
            <View style={styles.container}>
                <FlatList
                    data={news}
                    keyExtractor={(item) => item.id}
                    renderItem={renderNewsItem}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#770002']}/>
                    }
                    onEndReached={loadMoreNews}
                    onEndReachedThreshold={0.2} // Загружать когда осталось 20% списка
                    ListFooterComponent={renderFooter}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>Нет доступных новостей</Text>
                        </View>
                    }
                    contentContainerStyle={styles.listContainer}
                    removeClippedSubviews={Platform.OS === 'android'} // Оптимизация для Android
                    windowSize={10} // Оптимизация рендеринга
                    maxToRenderPerBatch={5} // Оптимизация рендеринга
                    initialNumToRender={5} // Оптимизация рендеринга
                />
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#f8f8f8',
    },
    container: {
        flex: 1,
        backgroundColor: '#f8f8f8',
    },
    listContainer: {
        padding: 12,
        paddingBottom: 20,
    },
    newsCard: {
        backgroundColor: 'white',
        borderRadius: 12,
        marginBottom: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    imageContainer: {
        height: 180,
        width: '100%',
        backgroundColor: '#f0f0f0',
    },
    newsImage: {
        width: '100%',
        height: '100%',
    },
    placeholderImage: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f0f0f0',
    },
    errorImageText: {
        color: '#999',
        fontSize: 12,
        marginTop: 8,
        textAlign: 'center',
    },
    contentContainer: {
        padding: 16,
    },
    metaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        flexWrap: 'wrap',
    },
    categoryContainer: {
        backgroundColor: '#770002',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 4,
        maxWidth: width * 0.5,
    },
    categoryText: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
    },
    date: {
        color: '#666',
        fontSize: 12,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
        color: '#333',
    },
    description: {
        fontSize: 14,
        color: '#666',
        lineHeight: 20,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    loadingText: {
        marginTop: 10,
        fontSize: 16,
        color: '#770002',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    errorText: {
        marginTop: 10,
        fontSize: 16,
        color: '#770002',
        textAlign: 'center',
        marginBottom: 20,
    },
    retryButton: {
        backgroundColor: '#770002',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 5,
    },
    retryButtonText: {
        color: 'white',
        fontWeight: 'bold',
    },
    loadingMore: {
        padding: 10,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
    },
    loadingMoreText: {
        marginLeft: 10,
        color: '#770002',
    },
    emptyContainer: {
        padding: 20,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 16,
        color: '#666',
    },
});