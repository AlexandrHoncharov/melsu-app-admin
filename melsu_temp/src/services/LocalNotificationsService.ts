// src/services/LocalNotificationsService.ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Настраиваем внешний вид уведомлений при использовании приложения
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

class LocalNotificationsService {
  /**
   * Запрашивает разрешения на отправку уведомлений
   * @returns {Promise<boolean>} Разрешены ли уведомления
   */
  static async requestPermissions(): Promise<boolean> {
    try {
      if (!Device.isDevice) {
        console.warn('Notifications are not supported in the emulator');
        return false;
      }

      // Проверяем текущие разрешения
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Если разрешения еще нет, запрашиваем его
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      // Проверяем результат
      if (finalStatus !== 'granted') {
        console.warn('Permission not granted for notifications');
        return false;
      }

      // Настраиваем для Android каналы уведомлений
      if (Platform.OS === 'android') {
        await this.setupAndroidChannels();
      }

      return true;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  /**
   * Настраивает каналы уведомлений для Android
   */
  static async setupAndroidChannels(): Promise<void> {
    try {
      if (Platform.OS === 'android') {
        // Основной канал для всех уведомлений
        await Notifications.setNotificationChannelAsync('default', {
          name: 'По умолчанию',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#770002',
          sound: true,
        });

        // Канал для чат-сообщений
        await Notifications.setNotificationChannelAsync('chat', {
          name: 'Сообщения чата',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 100, 100, 100],
          lightColor: '#0077FF',
          sound: true,
        });

        // Канал для тикетов поддержки
        await Notifications.setNotificationChannelAsync('ticket', {
          name: 'Обращения в поддержку',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 100, 100, 100, 100, 100],
          lightColor: '#FFA500',
          sound: true,
        });

        // Канал для верификации
        await Notifications.setNotificationChannelAsync('verification', {
          name: 'Верификация',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#00FF00',
          sound: true,
        });
      }
    } catch (error) {
      console.error('Error setting up Android notification channels:', error);
    }
  }

  /**
   * Проверяет разрешения на отправку уведомлений
   * @returns {Promise<boolean>} Разрешены ли уведомления
   */
  static async checkPermissions(): Promise<boolean> {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error checking notification permissions:', error);
      return false;
    }
  }

  /**
   * Отправляет локальное уведомление
   * @param {string} title Заголовок уведомления
   * @param {string} body Текст уведомления
   * @param {Object} data Дополнительные данные
   * @param {Object} options Настройки уведомления
   * @returns {Promise<string>} ID уведомления
   */
  static async scheduleLocalNotification(
    title: string,
    body: string,
    data: any = {},
    options: {
      seconds?: number;
      channelId?: string;
      sound?: boolean;
    } = {}
  ): Promise<string> {
    try {
      // Проверяем разрешения
      const hasPermissions = await this.checkPermissions();
      if (!hasPermissions) {
        const permGranted = await this.requestPermissions();
        if (!permGranted) {
          throw new Error('Отсутствуют разрешения на отправку уведомлений');
        }
      }

      // Подготавливаем настройки уведомления
      const notificationContent: Notifications.NotificationContentInput = {
        title,
        body,
        data: {
          ...data,
          timestamp: new Date().toISOString(),
          isLocal: true
        },
        sound: options.sound !== false,
      };

      // Для Android устанавливаем канал
      if (Platform.OS === 'android' && options.channelId) {
        notificationContent.android = {
          channelId: options.channelId,
          color: '#BB0000',
        };
      }

      // Определяем задержку
      const seconds = options.seconds || 1;
      const trigger = seconds > 0
        ? { seconds }
        : undefined;

      // Отправляем уведомление
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: notificationContent,
        trigger,
      });

      console.log(`Local notification scheduled with ID: ${notificationId}`);
      return notificationId;
    } catch (error) {
      console.error('Error scheduling local notification:', error);
      throw error;
    }
  }

  /**
   * Отменяет уведомление по ID
   * @param {string} notificationId ID уведомления
   */
  static async cancelNotification(notificationId: string): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      console.error('Error canceling notification:', error);
    }
  }

  /**
   * Отменяет все запланированные уведомления
   */
  static async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('Error canceling all notifications:', error);
    }
  }

  /**
   * Получает все запланированные уведомления
   * @returns {Promise<Notifications.NotificationRequest[]>}
   */
  static async getAllScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    try {
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('Error getting scheduled notifications:', error);
      return [];
    }
  }

  /**
   * Устанавливает обработчик для получения уведомлений
   * @param {Function} handler Функция-обработчик
   * @returns {Subscription} Подписка
   */
  static setNotificationReceivedHandler(
    handler: (notification: Notifications.Notification) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationReceivedListener(handler);
  }

  /**
   * Устанавливает обработчик для нажатия на уведомление
   * @param {Function} handler Функция-обработчик
   * @returns {Subscription} Подписка
   */
  static setNotificationResponseReceivedHandler(
    handler: (response: Notifications.NotificationResponse) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationResponseReceivedListener(handler);
  }

  /**
   * Получает последний ответ на уведомление (если приложение было открыто по нажатию на уведомление)
   * @returns {Promise<Notifications.NotificationResponse | null>}
   */
  static async getLastNotificationResponse(): Promise<Notifications.NotificationResponse | null> {
    try {
      return await Notifications.getLastNotificationResponseAsync();
    } catch (error) {
      console.error('Error getting last notification response:', error);
      return null;
    }
  }
}

export default LocalNotificationsService;