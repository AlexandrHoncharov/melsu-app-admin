// File: components/InAppNotification.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

interface InAppNotificationProps {
  title: string;
  message: string;
  type: 'chat_message' | 'verification' | 'test';
  data?: any;
  onDismiss: () => void;
  autoDismiss?: boolean;
  duration?: number;
}

const InAppNotification: React.FC<InAppNotificationProps> = ({
  title,
  message,
  type,
  data,
  onDismiss,
  autoDismiss = true,
  duration = 5000,
}) => {
  const translateY = useRef(new Animated.Value(-100)).current;
  const [isVisible, setIsVisible] = useState(true);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Vibrate when notification appears
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Animate in
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();

    // Auto dismiss if enabled
    if (autoDismiss) {
      timeoutRef.current = setTimeout(() => {
        dismissNotification();
      }, duration);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const dismissNotification = () => {
    if (!isVisible) return;

    setIsVisible(false);
    Animated.timing(translateY, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onDismiss();
    });
  };

  const handlePress = () => {
    dismissNotification();

    if (type === 'chat_message' && data?.chat_id) {
      router.push(`/chat/${data.chat_id}`);
    } else if (type === 'verification') {
      router.push('/verification');
    }
  };

  // Choose icon based on notification type
  let iconName = 'notifications-outline';
  if (type === 'chat_message') iconName = 'chatbubble-outline';
  else if (type === 'verification') iconName = 'shield-checkmark-outline';

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY }] }
      ]}
    >
      <TouchableOpacity
        style={styles.contentContainer}
        activeOpacity={0.8}
        onPress={handlePress}
      >
        <View style={styles.iconContainer}>
          <Ionicons name={iconName as any} size={24} color="#fff" />
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.message} numberOfLines={2}>{message}</Text>
        </View>

        <TouchableOpacity
          style={styles.closeButton}
          onPress={dismissNotification}
          hitSlop={{ top: 15, right: 15, bottom: 15, left: 15 }}
        >
          <Ionicons name="close-outline" size={20} color="#999" />
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
    zIndex: 9999,
    paddingTop: 40, // Safe area
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
    elevation: 3,
  },
  iconContainer: {
    height: 40,
    width: 40,
    borderRadius: 20,
    backgroundColor: '#770002',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#333',
    marginBottom: 2,
  },
  message: {
    fontSize: 13,
    color: '#666',
  },
  closeButton: {
    padding: 4,
  },
});

export default InAppNotification;