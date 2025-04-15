// utils/notificationSetup.js
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Настройка каналов уведомлений для Android
 * Необходимо вызвать эту функцию при запуске приложения
 */
export async function setupNotificationChannels() {
  if (Platform.OS === 'android') {
    // Основной канал для всех уведомлений
    await Notifications.setNotificationChannelAsync('default', {
      name: 'По умолчанию',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#770002',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
    });

    // Канал для чат-сообщений
    await Notifications.setNotificationChannelAsync('chat', {
      name: 'Сообщения чата',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 100, 100, 100],
      lightColor: '#0077FF',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });

    // Канал для тикетов поддержки
    await Notifications.setNotificationChannelAsync('ticket', {
      name: 'Обращения в поддержку',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 100, 100, 100, 100, 100],
      lightColor: '#FFA500',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });

    // Канал для верификации
    await Notifications.setNotificationChannelAsync('verification', {
      name: 'Верификация',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00FF00',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });

    console.log('Android notification channels set up successfully');
  }
}