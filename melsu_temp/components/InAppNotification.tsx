import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

interface InAppNotificationProps {
  title: string;
  message: string;
  type: string;
  data: any;
  onDismiss: () => void;
}

const InAppNotification: React.FC<InAppNotificationProps> = ({
  title,
  message,
  type,
  data,
  onDismiss
}) => {
  const translateY = new Animated.Value(-100);

  useEffect(() => {
    // Анимация появления
    Animated.timing(translateY, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true
    }).start();

    // Автоматическое скрытие через 5 секунд
    const timer = setTimeout(() => {
      handleDismiss();
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    // Анимация исчезновения
    Animated.timing(translateY, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true
    }).start(() => {
      onDismiss();
    });
  };

  // Обработка нажатия на уведомление
  const handlePress = () => {
    handleDismiss();

    // Навигация в зависимости от типа уведомления
    if (type === 'chat_message' && data?.chat_id) {
      router.push(`/chat/${data.chat_id}`);
    } else if (type === 'ticket_message' && data?.ticket_id) {
      router.push({
        pathname: '/profile/ticket-details',
        params: { ticketId: data.ticket_id }
      });
    }
  };

  // Определяем иконку в зависимости от типа уведомления
  let icon = 'notifications-outline';
  if (type === 'chat_message') {
    icon = 'chatbubble-outline';
  } else if (type === 'ticket_message') {
    icon = 'ticket-outline';
  }

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY }] },
        Platform.OS === 'ios' && styles.iosContainer
      ]}
    >
      <TouchableOpacity
        style={styles.content}
        activeOpacity={0.9}
        onPress={handlePress}
      >
        <View style={styles.iconContainer}>
          <Ionicons name={icon} size={24} color="#FFFFFF" />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.message} numberOfLines={2}>{message}</Text>
        </View>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleDismiss}
        >
          <Ionicons name="close" size={24} color="#999" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 5,
    zIndex: 999,
  },
  iosContainer: {
    paddingTop: 44, // Safe area for iOS notch
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#bb0000',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  message: {
    fontSize: 12,
    color: '#666',
  },
  closeButton: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default InAppNotification;