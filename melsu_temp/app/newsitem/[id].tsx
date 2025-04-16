import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
  SafeAreaView,
  StatusBar
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import newsApi, { NewsDetail } from '../../src/api/newsApi';
import { Ionicons } from '@expo/vector-icons';

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
  const handleImageError = (index: number) => {
    console.log(`Image error for index ${index}`);
    setImageErrors(prev => ({...prev, [index]: true}));
  };

  if (loading) {
    return (
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
    );
  }

  if (error || !newsDetail) {
    return (
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
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Назад</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
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

      <ScrollView style={styles.container}>
        {newsDetail.images && newsDetail.images.length > 0 && (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: newsDetail.images[0] }}
              style={styles.headerImage}
              resizeMode="cover"
              onError={() => handleImageError(0)}
            />
            {imageErrors[0] && (
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

          {/* Display plain text content */}
          <Text style={styles.plainText}>{newsDetail.content_text}</Text>

          {/* Display additional images if available */}
          {newsDetail.images && newsDetail.images.length > 1 && (
            <View style={styles.imagesContainer}>
              {newsDetail.images.slice(1).map((imageUrl, index) => (
                <View key={`image-${index + 1}`} style={styles.additionalImageContainer}>
                  <Image
                    source={{ uri: imageUrl }}
                    style={styles.contentImage}
                    resizeMode="contain"
                    onError={() => handleImageError(index + 1)}
                  />
                  {imageErrors[index + 1] && (
                    <View style={styles.imageErrorOverlay}>
                      <Ionicons name="image-outline" size={40} color="#ccc" />
                      <Text style={styles.imageErrorText}>Не удалось загрузить изображение</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
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
  );
}

const styles = StyleSheet.create({
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
  container: {
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
  backButtonText: {
    color: 'white',
    fontWeight: 'bold',
    backgroundColor: '#770002',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
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
  plainText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  imagesContainer: {
    marginTop: 16,
  },
  additionalImageContainer: {
    marginBottom: 16,
    position: 'relative',
    height: 200,
  },
  contentImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
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