import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Image,
  RefreshControl,
  Dimensions,
  Linking,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import ticketsApi, { TicketDetail, TicketMessage } from '../../../src/api/ticketsApi';
import * as ImagePicker from 'expo-image-picker';

// Получаем ширину экрана для адаптивной верстки
const { width } = Dimensions.get('window');

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
      return { name: 'Техническая проблема', color: '#7B1FA2', bgColor: '#F3E5F5' };
    case 'schedule':
      return { name: 'Проблема с расписанием', color: '#388E3C', bgColor: '#E8F5E9' };
    case 'verification':
      return { name: 'Вопрос по верификации', color: '#1976D2', bgColor: '#E3F2FD' };
    default:
      return { name: 'Другое', color: '#616161', bgColor: '#F5F5F5' };
  }
};

// Хелпер для статусов
const getStatusInfo = (status: string): { name: string; color: string; bgColor: string } => {
  switch (status) {
    case 'new':
      return { name: 'Новый', color: '#1976D2', bgColor: '#E3F2FD' };
    case 'in_progress':
      return { name: 'В обработке', color: '#FFA000', bgColor: '#FFF8E1' };
    case 'waiting':
      return { name: 'Требует уточнения', color: '#E64A19', bgColor: '#FBE9E7' };
    case 'resolved':
      return { name: 'Решен', color: '#388E3C', bgColor: '#E8F5E9' };
    case 'closed':
      return { name: 'Закрыт', color: '#616161', bgColor: '#F5F5F5' };
    default:
      return { name: 'Неизвестно', color: '#616161', bgColor: '#F5F5F5' };
  }
};

export default function TicketDetailsScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const ticketId = parseInt(params.ticketId as string, 10);

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showActionMenu, setShowActionMenu] = useState(false);

  // Ref для автоматической прокрутки к последнему сообщению
  const flatListRef = useRef<FlatList>(null);

  // Загрузка данных тикета
  const loadTicket = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await ticketsApi.getTicketDetails(ticketId);
      setTicket(data);

      // Автоматически прокручиваем к последнему сообщению
      setTimeout(() => {
        if (data.messages.length > 0 && flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: false });
        }
      }, 300);
    } catch (error) {
      console.error('Error loading ticket details:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить данные обращения. Пожалуйста, попробуйте позже.');
    } finally {
      setIsLoading(false);
    }
  }, [ticketId]);

  // Первичная загрузка
  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

  // Pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadTicket();
    } finally {
      setRefreshing(false);
    }
  }, [loadTicket]);

  // Отправка сообщения
  const handleSendMessage = async () => {
    if (!message.trim() && !selectedImage) {
      Alert.alert('Ошибка', 'Введите текст сообщения или прикрепите изображение');
      return;
    }

    try {
      setIsSending(true);

      if (selectedImage) {
        // Если выбрано изображение, отправляем его вместе с текстом
        await ticketsApi.uploadAttachment(ticketId, selectedImage, message);
      } else {
        // Иначе отправляем только текст
        await ticketsApi.addMessage(ticketId, message);
      }

      // Очищаем форму и обновляем данные
      setMessage('');
      setSelectedImage(null);
      await loadTicket();
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Ошибка', 'Не удалось отправить сообщение. Пожалуйста, попробуйте позже.');
    } finally {
      setIsSending(false);
    }
  };

  // Обработка выбора изображения
  const handleSelectImage = async () => {
    try {
      // Запрашиваем разрешения
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert('Ошибка', 'Необходимо разрешение на доступ к галерее изображений');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error selecting image:', error);
      Alert.alert('Ошибка', 'Не удалось выбрать изображение');
    }
  };

  // Обработка закрытия тикета
  const handleCloseTicket = async () => {
    try {
      setShowActionMenu(false);

      // Подтверждение действия
      Alert.alert(
        'Закрыть обращение',
        'Вы уверены, что хотите закрыть это обращение? Вы всегда можете переоткрыть его позже.',
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Закрыть',
            style: 'destructive',
            onPress: async () => {
              await ticketsApi.updateTicketStatus(ticketId, 'closed', 'Тикет закрыт пользователем');
              Alert.alert(
                'Успех',
                'Обращение закрыто. Вы всегда можете открыть его снова, если проблема не решена.',
                [{ text: 'OK', onPress: onRefresh }]
              );
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error closing ticket:', error);
      Alert.alert('Ошибка', 'Не удалось закрыть обращение. Пожалуйста, попробуйте позже.');
    }
  };

  // Обработка переоткрытия тикета
  const handleReopenTicket = async () => {
    try {
      setShowActionMenu(false);

      // Подтверждение действия
      Alert.alert(
        'Переоткрыть обращение',
        'Вы уверены, что хотите переоткрыть это обращение?',
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Переоткрыть',
            onPress: async () => {
              await ticketsApi.updateTicketStatus(ticketId, 'waiting', 'Тикет переоткрыт пользователем');
              Alert.alert(
                'Успех',
                'Обращение переоткрыто. Мы рассмотрим его в ближайшее время.',
                [{ text: 'OK', onPress: onRefresh }]
              );
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error reopening ticket:', error);
      Alert.alert('Ошибка', 'Не удалось переоткрыть обращение. Пожалуйста, попробуйте позже.');
    }
  };

  // Получение URL вложения
  const getAttachmentUrl = (filename: string) => {
    // В реальном приложении здесь будет правильный URL из API
    return `http://192.168.1.11:5001/api/uploads/ticket_attachments/${filename}`;
  };

  // Рендеринг сообщения
  const renderMessage = ({ item }: { item: TicketMessage }) => {
    const isOwnMessage = !item.is_from_admin;

    return (
      <View
        style={[
          styles.messageContainer,
          isOwnMessage ? styles.ownMessageContainer : styles.otherMessageContainer
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            isOwnMessage ? styles.ownMessageBubble : styles.otherMessageBubble
          ]}
        >
          <View style={styles.messageHeader}>
            <Text style={styles.messageSender}>
              {isOwnMessage ? 'Вы' : 'Поддержка'}
            </Text>
            <Text style={styles.messageTime}>
              {formatDate(item.created_at)}
            </Text>
          </View>

          {item.text ? (
            <Text style={styles.messageText}>{item.text}</Text>
          ) : null}

          {item.attachment && (
            <TouchableOpacity
              style={styles.attachmentContainer}
              onPress={() => Linking.openURL(getAttachmentUrl(item.attachment!))}
            >
              <Ionicons name="document-attach-outline" size={20} color="#1976D2" />
              <Text style={styles.attachmentText}>Прикрепленный файл</Text>
              <Ionicons name="open-outline" size={16} color="#1976D2" style={styles.attachmentIcon} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // Отображение загрузки
  if (isLoading && !ticket) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.title}>Загрузка...</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#bb0000" />
          <Text style={styles.loadingText}>Загрузка данных обращения...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Если данные не получены
  if (!ticket) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.title}>Ошибка</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Данные не найдены</Text>
          <Text style={styles.emptyText}>Не удалось загрузить информацию об обращении</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={loadTicket}
          >
            <Text style={styles.retryButtonText}>Повторить</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Информация о категории и статусе
  const categoryInfo = getCategoryInfo(ticket.ticket.category);
  const statusInfo = getStatusInfo(ticket.ticket.status);
  const isTicketClosed = ticket.ticket.status === 'closed';
  const isTicketResolved = ticket.ticket.status === 'resolved';
  const canReopen = isTicketClosed || isTicketResolved;
  const canSendMessage = !isTicketClosed;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            Обращение #{ticketId}
          </Text>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => setShowActionMenu(true)}
          >
            <Ionicons name="ellipsis-vertical" size={24} color="#000" />
          </TouchableOpacity>
        </View>

        {/* Карточка с информацией о тикете */}
        <View style={styles.ticketInfoCard}>
          <Text style={styles.ticketTitle}>{ticket.ticket.title}</Text>

          <View style={styles.ticketMetaContainer}>
            <View style={[styles.categoryTag, { backgroundColor: categoryInfo.bgColor }]}>
              <Text style={[styles.categoryText, { color: categoryInfo.color }]}>
                {categoryInfo.name}
              </Text>
            </View>

            <View style={[styles.statusTag, { backgroundColor: statusInfo.bgColor }]}>
              <Text style={[styles.statusText, { color: statusInfo.color }]}>
                {statusInfo.name}
              </Text>
            </View>
          </View>

          <View style={styles.dateContainer}>
            <Text style={styles.dateLabel}>Создано:</Text>
            <Text style={styles.dateText}>{formatDate(ticket.ticket.created_at)}</Text>
          </View>

          <View style={styles.dateContainer}>
            <Text style={styles.dateLabel}>Обновлено:</Text>
            <Text style={styles.dateText}>{formatDate(ticket.ticket.updated_at)}</Text>
          </View>
        </View>

        {/* Сообщения */}
        <FlatList
          ref={flatListRef}
          data={ticket.messages}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#bb0000']} />
          }
        />

        {/* Поле для ввода сообщения (отображается, только если тикет не закрыт) */}
        {canSendMessage ? (
          <View style={styles.inputContainer}>
            {selectedImage && (
              <View style={styles.selectedImageContainer}>
                <Image source={{ uri: selectedImage }} style={styles.selectedImagePreview} />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => setSelectedImage(null)}
                >
                  <Ionicons name="close-circle" size={24} color="#D32F2F" />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.messageInputContainer}>
              <TouchableOpacity
                style={styles.attachButton}
                onPress={handleSelectImage}
              >
                <Ionicons name="image-outline" size={24} color="#666" />
              </TouchableOpacity>

              <TextInput
                style={styles.messageInput}
                placeholder="Введите сообщение..."
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={1000}
              />

              <TouchableOpacity
                style={[styles.sendButton, (!message.trim() && !selectedImage) && styles.sendButtonDisabled]}
                onPress={handleSendMessage}
                disabled={isSending || (!message.trim() && !selectedImage)}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="send" size={20} color="#FFF" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.ticketClosedContainer}>
            <Text style={styles.ticketClosedText}>
              Обращение закрыто. Вы не можете отправлять сообщения.
            </Text>
            {canReopen && (
              <TouchableOpacity
                style={styles.reopenButton}
                onPress={handleReopenTicket}
              >
                <Ionicons name="refresh" size={18} color="#FFF" style={styles.reopenIcon} />
                <Text style={styles.reopenText}>Переоткрыть обращение</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Модальное окно с действиями */}
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
                onPress={onRefresh}
              >
                <Ionicons name="refresh" size={24} color="#333" style={styles.actionMenuIcon} />
                <Text style={styles.actionMenuText}>Обновить</Text>
              </TouchableOpacity>

              {canReopen && (
                <TouchableOpacity
                  style={styles.actionMenuItem}
                  onPress={handleReopenTicket}
                >
                  <Ionicons name="refresh-circle" size={24} color="#1976D2" style={styles.actionMenuIcon} />
                  <Text style={styles.actionMenuText}>Переоткрыть обращение</Text>
                </TouchableOpacity>
              )}

              {!isTicketClosed && (
                <TouchableOpacity
                  style={styles.actionMenuItem}
                  onPress={handleCloseTicket}
                >
                  <Ionicons name="close-circle" size={24} color="#D32F2F" style={styles.actionMenuIcon} />
                  <Text style={styles.actionMenuText}>Закрыть обращение</Text>
                </TouchableOpacity>
              )}

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
  menuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    flex: 1,
    textAlign: 'center',
  },
  ticketInfoCard: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  ticketTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  ticketMetaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  categoryTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 4,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  dateContainer: {
    flexDirection: 'row',
    marginTop: 4,
  },
  dateLabel: {
    fontSize: 12,
    color: '#666',
    width: 80,
  },
  dateText: {
    fontSize: 12,
    color: '#333',
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#bb0000',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  messagesContainer: {
    padding: 16,
    paddingBottom: 24,
  },
  messageContainer: {
    marginBottom: 16,
  },
  ownMessageContainer: {
    alignItems: 'flex-end',
  },
  otherMessageContainer: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
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
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  messageSender: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  messageTime: {
    fontSize: 10,
    color: '#666',
    marginLeft: 8,
  },
  messageText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  attachmentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F8FF',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  attachmentText: {
    fontSize: 12,
    color: '#1976D2',
    marginLeft: 6,
    flex: 1,
  },
  attachmentIcon: {
    marginLeft: 4,
  },
  inputContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    padding: 12,
  },
  selectedImageContainer: {
    width: 100,
    height: 100,
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  selectedImagePreview: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  messageInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attachButton: {
    padding: 10,
  },
  messageInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
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
  ticketClosedContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    padding: 16,
    alignItems: 'center',
  },
  ticketClosedText: {
    color: '#666',
    marginBottom: 8,
  },
  reopenButton: {
    backgroundColor: '#1976D2',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
  },
  reopenIcon: {
    marginRight: 6,
  },
  reopenText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
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
});