import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import newsApi, { NewsDetail } from '../../src/api/newsApi';
import { Ionicons } from '@expo/vector-icons';

// Обновите интерфейс NewsDetail, добавив поддержку content_blocks
interface ContentBlock {
  type: 'text' | 'image' | 'list' | 'header';
  content?: string;
  src?: string;
  level?: number;
  list_type?: 'ordered' | 'unordered';
  items?: string[];
}

// Обновите интерфейс NewsDetail в подходящем месте (например, api/newsApi.ts)
// interface NewsDetail {
//   ...существующие поля...
//   content_blocks?: ContentBlock[];
// }

export default function NewsDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [newsDetail, setNewsDetail] = useState<NewsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchNewsDetail = async () => {
      if (!id) {
        setError('News ID is missing');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const response = await newsApi.getNewsDetail(id.toString());
        if (response.success) {
          setNewsDetail(response);
        } else {
          setError('Failed to load news details');
        }
      } catch (error) {
        console.error('Error fetching news detail:', error);
        setError(error instanceof Error ? error.message : 'Failed to load news details');
      } finally {
        setLoading(false);
      }
    };

    fetchNewsDetail();
  }, [id]);

  const navigateToNews = (newsId: string) => {
    // Using replace instead of push to avoid stacking navigation
    router.replace(`/newsitem/${newsId}`);
  };

  // Обработчик ошибки загрузки изображения
  const handleImageError = (id: string) => {
    console.log(`Image error for id ${id}`);
    setImageErrors(prev => ({...prev, [id]: true}));
  };

  // Рендер жирного текста (заключенного в **жирный текст**)
  const renderFormattedText = (text) => {
    if (!text) return null;

    // Разбиваем текст на части по маркерам жирного текста **
    const parts = text.split(/(\*\*.*?\*\*)/);

    return (
      <Text style={styles.paragraph}>
        {parts.map((part, index) => {
          // Если часть начинается и заканчивается ** - это жирный текст
          if (part.startsWith('**') && part.endsWith('**')) {
            // Вырезаем маркеры **
            const boldText = part.slice(2, -2);
            return <Text key={index} style={styles.boldText}>{boldText}</Text>;
          }
          // Обычный текст
          return <Text key={index}>{part}</Text>;
        })}
      </Text>
    );
  };

  // Рендер блоков контента
  const renderContentBlocks = (blocks?: ContentBlock[]) => {
    if (!blocks || blocks.length === 0) return null;

    return blocks.map((block, index) => {
      switch (block.type) {
        case 'text':
          return (
            <View key={`text-${index}`} style={styles.textBlock}>
              {renderFormattedText(block.content)}
            </View>
          );

        case 'image':
          if (!block.src) return null;
          return (
            <View key={`img-${index}`} style={styles.imageBlock}>
              <Image
                source={{ uri: block.src }}
                style={styles.contentImage}
                resizeMode="contain"
                onError={() => handleImageError(`block-img-${index}`)}
              />
              {imageErrors[`block-img-${index}`] && (
                <View style={styles.imageErrorOverlay}>
                  <Ionicons name="image-outline" size={40} color="#ccc" />
                  <Text style={styles.imageErrorText}>Не удалось загрузить изображение</Text>
                </View>
              )}
            </View>
          );

        case 'list':
          if (!block.items || block.items.length === 0) return null;
          return (
            <View key={`list-${index}`} style={styles.listBlock}>
              {block.items.map((item, itemIndex) => (
                <View key={`item-${itemIndex}`} style={styles.listItemContainer}>
                  {block.list_type === 'ordered' ? (
                    <Text style={styles.listItemNumber}>{itemIndex + 1}.</Text>
                  ) : (
                    <Text style={styles.bulletPoint}>•</Text>
                  )}
                  <Text style={styles.listItemText}>{item}</Text>
                </View>
              ))}
            </View>
          );

        case 'header':
          if (!block.content) return null;
          return (
            <Text
              key={`header-${index}`}
              style={[styles.headerText, { fontSize: 24 - ((block.level || 1) - 1) * 2 }]}
            >
              {block.content}
            </Text>
          );

        default:
          return null;
      }
    });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.customHeader}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-back" size={24} color="#000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Загрузка...</Text>
            <View style={styles.placeholderRight} />
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#770002" />
            <Text style={styles.loadingText}>Загрузка статьи...</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (error || !newsDetail) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.customHeader}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-back" size={24} color="#000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Ошибка</Text>
            <View style={styles.placeholderRight} />
          </View>
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={50} color="#770002" />
            <Text style={styles.errorText}>{error || 'Failed to load news details'}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
              <Text style={styles.retryButtonText}>Назад</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <SafeAreaView style={styles.safeArea}>
        {/* Custom Header */}
        <View style={styles.customHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {newsDetail.title || 'Новость'}
          </Text>
          <View style={styles.placeholderRight} />
        </View>

        <ScrollView style={styles.scrollContainer}>
          {/* Главное изображение новости */}
          {newsDetail.images && newsDetail.images.length > 0 && (
            <View style={styles.imageContainer}>
              <Image
                source={{ uri: newsDetail.images[0] }}
                style={styles.headerImage}
                resizeMode="cover"
                onError={() => handleImageError('main')}
              />
              {imageErrors['main'] && (
                <View style={styles.imageErrorOverlay}>
                  <Ionicons name="image-outline" size={40} color="#ccc" />
                  <Text style={styles.imageErrorText}>Не удалось загрузить изображение</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.contentContainer}>
            <Text style={styles.title}>{newsDetail.title}</Text>

            <View style={styles.metaContainer}>
              {newsDetail.category && (
                <View style={styles.categoryPill}>
                  <Text style={styles.categoryText}>{newsDetail.category}</Text>
                </View>
              )}
              {newsDetail.date && (
                <Text style={styles.dateText}>
                  <Ionicons name="calendar-outline" size={14} color="#666" /> {newsDetail.date}
                </Text>
              )}
            </View>

            <View style={styles.divider} />

            {/* Отображение контента блоками с изображениями внутри текста */}
            {newsDetail.content_blocks ? (
              renderContentBlocks(newsDetail.content_blocks)
            ) : (
              // Запасной вариант, если content_blocks отсутствуют
              <Text style={styles.paragraph}>{newsDetail.content_text}</Text>
            )}

            {(newsDetail.prev_article || newsDetail.next_article) && (
              <View style={styles.navigationContainer}>
                {newsDetail.prev_article && (
                  <TouchableOpacity
                    style={[styles.navButton, styles.prevButton]}
                    onPress={() => navigateToNews(newsDetail.prev_article.id)}
                  >
                    <Ionicons name="arrow-back" size={20} color="#770002" />
                    <Text style={styles.navButtonText}>Предыдущая</Text>
                  </TouchableOpacity>
                )}

                <View style={styles.navSpacer} />

                {newsDetail.next_article && (
                  <TouchableOpacity
                    style={[styles.navButton, styles.nextButton]}
                    onPress={() => navigateToNews(newsDetail.next_article.id)}
                  >
                    <Text style={styles.navButtonText}>Следующая</Text>
                    <Ionicons name="arrow-forward" size={20} color="#770002" />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
    // Добавлено для поддержки Android
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'white',
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  placeholderRight: {
    width: 40,
    height: 40,
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  imageContainer: {
    width: '100%',
    height: 250,
    position: 'relative',
  },
  headerImage: {
    width: '100%',
    height: '100%',
  },
  imageErrorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageErrorText: {
    color: '#999',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
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
  contentContainer: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  categoryPill: {
    backgroundColor: '#770002',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 4,
  },
  categoryText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  dateText: {
    color: '#666',
    fontSize: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 16,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
    marginBottom: 16,
    textAlign: 'left',
  },
  boldText: {
    fontWeight: 'bold',
  },
  textBlock: {
    marginBottom: 16,
  },
  imageBlock: {
    width: '100%',
    height: 200,
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  contentImage: {
    width: '100%',
    height: '100%',
  },
  listBlock: {
    marginBottom: 16,
    paddingLeft: 8,
  },
  listItemContainer: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 4,
  },
  listItemNumber: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
    marginRight: 8,
    fontWeight: '500',
    width: 20,
  },
  bulletPoint: {
    fontSize: 16,
    lineHeight: 24,
    color: '#770002',
    marginRight: 8,
    width: 12,
  },
  listItemText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
    flex: 1,
  },
  headerText: {
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    marginTop: 8,
  },
  navigationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  prevButton: {
    justifyContent: 'flex-start',
  },
  nextButton: {
    justifyContent: 'flex-end',
  },
  navButtonText: {
    color: '#770002',
    fontWeight: 'bold',
    marginHorizontal: 8,
  },
  navSpacer: {
    flex: 1,
  }
});