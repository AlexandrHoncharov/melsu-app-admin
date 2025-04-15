// src/services/NotificationService.ts
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../api/apiClient';

// Настройка логов для отладки
const DEBUG = true; // можно изменить для production
const log = (...args: any[]) => DEBUG && console.log('[NotificationService]', ...args);
const error = (...args: any[]) => console.error('[NotificationService]', ...args);

// ID проекта из app.json/app.config.js для получения токенов
const EXPO_PROJECT_ID = 'd9591f01-e110-4918-8b09-c422bd23baaf';

// Ключи для хранения данных
const STORAGE_KEYS = {
  DEVICE_TOKEN: 'notification_device_token',
  DEVICE_ID: 'notification_device_id',
  TOKEN_TYPE: 'notification_token_type', // 'expo' или 'fcm'
  REGISTRATION_STATUS: 'notification_registration_status', // 'success', 'failed', or 'pending'
  LAST_REGISTRATION_TIME: 'notification_last_registration_time', // Unix timestamp
};

/**
 * Главный сервис для работы с уведомлениями
 * Разработан для надежной работы как в development, так и в production режимах
 */
class NotificationService {
  private deviceToken: string | null = null;
  private tokenType: 'expo' | 'fcm' | null = null;
  private isInitialized = false;
  private onNotificationReceivedCallback: ((notification: Notifications.Notification) => void) | null = null;
  private onNotificationResponseCallback: ((response: Notifications.NotificationResponse) => void) | null = null;

  // Для предотвращения множественных инициализаций
  private initPromise: Promise<boolean> | null = null;
  private registrationPromise: Promise<boolean> | null = null;

  /**
   * Инициализация сервиса - должна быть вызвана при старте приложения
   */
  public async initialize(): Promise<boolean> {
    // Если уже идет инициализация, ждем её результат
    if (this.initPromise) {
      return this.initPromise;
    }

    // Если уже инициализировано, просто возвращаем true
    if (this.isInitialized) {
      return true;
    }

    // Создаем и сохраняем promise для инициализации
    this.initPromise = this._doInitialize();
    const result = await this.initPromise;
    this.initPromise = null;
    return result;
  }

  /**
   * Внутренняя функция инициализации, не вызывать напрямую
   */
  private async _doInitialize(): Promise<boolean> {
    log('Initializing notification service...');

    try {
      // Настраиваем глобальный обработчик уведомлений
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });

      // Восстанавливаем токен из хранилища
      await this.loadStoredToken();

      // Создаем каналы для Android
      if (Platform.OS === 'android') {
        await this.createNotificationChannels();
      }

      // Запрашиваем разрешения и проверяем/обновляем токен
      const hasPermission = await this.requestPermissions();
      if (hasPermission) {
        // Не выполняем регистрацию при инициализации, это будет отдельным шагом
        // Это предотвращает вызов API до того, как аутентификация будет установлена
        log('Initialization complete with permissions granted');
      } else {
        log('Initialization complete but notifications permission denied');
      }

      this.isInitialized = true;
      return true;
    } catch (err) {
      error('Initialization failed:', err);
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Создает каналы уведомлений для Android
   */
  private async createNotificationChannels(): Promise<void> {
    try {
      // Основной канал
      await Notifications.setNotificationChannelAsync('default', {
        name: 'По умолчанию',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#770002',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
      });

      // Канал для чатов
      await Notifications.setNotificationChannelAsync('chat', {
        name: 'Сообщения',
        description: 'Уведомления о новых сообщениях в чатах',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 100, 100, 100, 100, 100],
        lightColor: '#0077FF',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
        sound: 'default',
      });

      // Канал для тикетов
      await Notifications.setNotificationChannelAsync('tickets', {
        name: 'Обращения',
        description: 'Уведомления о статусе обращений в поддержку',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 200, 200],
        lightColor: '#33CC66',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
        sound: 'default',
      });

      log('Notification channels created');
    } catch (err) {
      error('Failed to create notification channels:', err);
    }
  }

  /**
   * Запрашивает разрешения на показ уведомлений
   */
  public async requestPermissions(): Promise<boolean> {
    try {
      if (!Device.isDevice) {
        log('Not a physical device, skipping permission request');
        return false;
      }

      // Проверяем текущие разрешения
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      log('Current permission status:', existingStatus);

      // Если уже есть разрешение, возвращаем true
      if (existingStatus === 'granted') {
        return true;
      }

      // Запрашиваем разрешение, если еще нет
      const { status } = await Notifications.requestPermissionsAsync();
      log('New permission status:', status);

      return status === 'granted';
    } catch (err) {
      error('Error requesting permissions:', err);
      return false;
    }
  }

  /**
   * Регистрирует устройство для получения уведомлений
   * Должен вызываться после успешной аутентификации
   */
  public async registerForPushNotifications(userId: string): Promise<boolean> {
    // Если пользователь не предоставил ID, отменяем регистрацию
    if (!userId) {
      error('User ID is required for registration');
      return false;
    }

    // Если процесс регистрации уже идет, ждем его завершения
    if (this.registrationPromise) {
      return this.registrationPromise;
    }

    this.registrationPromise = this._doRegisterForPushNotifications(userId);
    const result = await this.registrationPromise;
    this.registrationPromise = null;
    return result;
  }

  /**
   * Внутренний метод для регистрации push-уведомлений
   */
  private async _doRegisterForPushNotifications(userId: string): Promise<boolean> {
    try {
      log(`Starting push token registration for user ${userId}`);

      // Убедимся, что инициализация выполнена
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Проверяем разрешения
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        log('No permission for notifications, aborting registration');
        await this.saveRegistrationStatus('failed');
        return false;
      }

      // Всегда запрашиваем новый токен - это важно!
      const token = await this.getExpoPushToken();
      if (!token) {
        error('Failed to get push token');
        await this.saveRegistrationStatus('failed');
        return false;
      }

      // Сохраняем тип токена и сам токен
      this.deviceToken = token;
      this.tokenType = token.startsWith('ExponentPushToken') ? 'expo' : 'fcm';

      // Получаем или генерируем ID устройства
      const deviceId = await this.getDeviceId();

      // Регистрируем на сервере
      const registrationSuccess = await this.registerTokenWithServer(userId, token, this.tokenType, deviceId);

      if (registrationSuccess) {
        // Сохраняем токен и статус в хранилище
        await this.saveTokenToStorage(token, this.tokenType);
        await this.saveRegistrationStatus('success');
        log('Push notification setup completed successfully');
        return true;
      } else {
        await this.saveRegistrationStatus('failed');
        return false;
      }
    } catch (err) {
      error('Push notification registration failed:', err);
      await this.saveRegistrationStatus('failed');
      return false;
    }
  }

  /**
   * Получает токен для push-уведомлений
   */
  private async getExpoPushToken(): Promise<string | null> {
    try {
      log('Getting push token with project ID:', EXPO_PROJECT_ID);

      // Получаем токен с указанием projectId
      const { data: token } = await Notifications.getExpoPushTokenAsync({
        projectId: EXPO_PROJECT_ID,
      });

      // Определяем тип токена для отладки
      const tokenType = token.startsWith('ExponentPushToken') ? 'Development (Expo)' : 'Production (FCM)';
      log(`Token received: ${token.substring(0, 10)}... (${tokenType})`);

      return token;
    } catch (err) {
      error('Error getting push token:', err);
      return null;
    }
  }

  /**
   * Получает или генерирует уникальный ID устройства
   */
  private async getDeviceId(): Promise<string> {
    try {
      // Пытаемся получить сохраненный ID
      let deviceId = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ID);

      // Если нет сохраненного ID, генерируем новый
      if (!deviceId) {
        deviceId = this.generateDeviceId();
        await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
        log('Generated new device ID:', deviceId);
      }

      return deviceId;
    } catch (err) {
      // Если произошла ошибка, генерируем временный ID
      error('Error getting device ID:', err);
      return this.generateDeviceId();
    }
  }

  /**
   * Генерирует уникальный ID устройства
   */
  private generateDeviceId(): string {
    const random = Math.random().toString(36).substring(2);
    const timestamp = Date.now().toString(36);
    const devicePrefix = Device.brand || Device.modelName || 'unknown';
    return `${devicePrefix}_${timestamp}_${random}`;
  }

  /**
   * Регистрирует токен на сервере
   */
  private async registerTokenWithServer(
    userId: string,
    token: string,
    tokenType: 'expo' | 'fcm',
    deviceId: string
  ): Promise<boolean> {
    try {
      log(`Registering token with server for user ${userId}`);

      const response = await apiClient.post('/device/register', {
        token,
        platform: Platform.OS,
        device_name: Device.modelName || 'Unknown',
        device_id: deviceId,
        app_version: Constants.expoConfig?.version || 'Unknown',
        is_expo_token: tokenType === 'expo',
        replace_existing: true,
        user_id: userId
      });

      if (response.data.success) {
        log('Token registered successfully with server');
        return true;
      } else {
        error('Server rejected token registration:', response.data.message);
        return false;
      }
    } catch (err) {
      error('Error registering token with server:', err);
      return false;
    }
  }

  /**
   * Загружает сохраненный токен из хранилища
   */
  private async loadStoredToken(): Promise<void> {
    try {
      this.deviceToken = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_TOKEN);
      const tokenType = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN_TYPE);
      this.tokenType = (tokenType as 'expo' | 'fcm' | null);

      if (this.deviceToken) {
        log(`Loaded saved token: ${this.deviceToken.substring(0, 10)}... (${this.tokenType})`);
      }
    } catch (err) {
      error('Error loading stored token:', err);
      this.deviceToken = null;
      this.tokenType = null;
    }
  }

  /**
   * Сохраняет токен в хранилище
   */
  private async saveTokenToStorage(token: string, tokenType: 'expo' | 'fcm'): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_TOKEN, token);
      await AsyncStorage.setItem(STORAGE_KEYS.TOKEN_TYPE, tokenType);
      log('Token saved to storage');
    } catch (err) {
      error('Error saving token to storage:', err);
    }
  }

  /**
   * Сохраняет статус регистрации
   */
  private async saveRegistrationStatus(status: 'success' | 'failed' | 'pending'): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.REGISTRATION_STATUS, status);
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_REGISTRATION_TIME, Date.now().toString());
    } catch (err) {
      error('Error saving registration status:', err);
    }
  }

  /**
   * Отправляет тестовое уведомление
   */
  public async sendTestNotification(): Promise<boolean> {
    try {
      if (!this.deviceToken) {
        error('No device token available for test notification');
        return false;
      }

      log('Sending test notification request');
      const response = await apiClient.post('/device/test-notification');

      if (response.data.success) {
        log('Test notification sent successfully');
        return true;
      } else {
        error('Test notification failed:', response.data.message);
        return false;
      }
    } catch (err) {
      error('Error sending test notification:', err);
      return false;
    }
  }

  /**
   * Отменяет регистрацию токена на сервере
   */
  public async unregisterDeviceToken(): Promise<boolean> {
    try {
      log('Unregistering device token');

      // Отправляем запрос на сервер
      try {
        const tokenToUse = this.deviceToken || 'force_all_tokens_removal';
        const response = await apiClient.post('/device/unregister', { token: tokenToUse });
        log('Unregister response:', response.data);
      } catch (err) {
        // Продолжаем даже при ошибке сервера
        error('Server error during unregister:', err);
      }

      // Очищаем локальные данные независимо от результата запроса
      this.deviceToken = null;
      this.tokenType = null;

      // Очищаем хранилище
      await AsyncStorage.removeItem(STORAGE_KEYS.DEVICE_TOKEN);
      await AsyncStorage.removeItem(STORAGE_KEYS.TOKEN_TYPE);
      await AsyncStorage.removeItem(STORAGE_KEYS.REGISTRATION_STATUS);

      log('Device token unregistered and cleared from storage');
      return true;
    } catch (err) {
      error('Error unregistering device token:', err);
      return false;
    }
  }

  /**
   * Подписывается на получение уведомлений
   */
  public setupNotificationListeners(
    onReceived: (notification: Notifications.Notification) => void,
    onResponse: (response: Notifications.NotificationResponse) => void
  ): () => void {
    // Сохраняем callbacks
    this.onNotificationReceivedCallback = onReceived;
    this.onNotificationResponseCallback = onResponse;

    // Подписываемся на получение уведомлений
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      log('Notification received', notification.request.identifier);
      if (this.onNotificationReceivedCallback) {
        this.onNotificationReceivedCallback(notification);
      }
    });

    // Подписываемся на действия с уведомлениями
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      log('Notification response received', response.notification.request.identifier);
      if (this.onNotificationResponseCallback) {
        this.onNotificationResponseCallback(response);
      }
    });

    log('Notification listeners set up');

    // Возвращаем функцию для отписки
    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
      this.onNotificationReceivedCallback = null;
      this.onNotificationResponseCallback = null;
      log('Notification listeners removed');
    };
  }

  /**
   * Получает количество непрочитанных уведомлений (бейдж)
   */
  public async getBadgeCount(): Promise<number> {
    try {
      return await Notifications.getBadgeCountAsync();
    } catch (err) {
      error('Error getting badge count:', err);
      return 0;
    }
  }

  /**
   * Устанавливает количество непрочитанных уведомлений (бейдж)
   */
  public async setBadgeCount(count: number): Promise<void> {
    try {
      await Notifications.setBadgeCountAsync(count);
      log('Badge count set to', count);
    } catch (err) {
      error('Error setting badge count:', err);
    }
  }

  /**
   * Проверяет статус уведомлений
   */
  public async getNotificationStatus(): Promise<{
    enabled: boolean;
    token: string | null;
    tokenType: 'expo' | 'fcm' | null;
    registered: boolean;
    lastRegistrationStatus: string | null;
    lastRegistrationTime: string | null;
    permissionStatus: Notifications.PermissionStatus;
  }> {
    try {
      // Получаем данные о разрешениях
      const permissionStatus = await Notifications.getPermissionsAsync();

      // Получаем данные о последней регистрации
      const lastRegistrationStatus = await AsyncStorage.getItem(STORAGE_KEYS.REGISTRATION_STATUS);
      const lastRegistrationTime = await AsyncStorage.getItem(STORAGE_KEYS.LAST_REGISTRATION_TIME);

      return {
        enabled: permissionStatus.status === 'granted',
        token: this.deviceToken,
        tokenType: this.tokenType,
        registered: lastRegistrationStatus === 'success',
        lastRegistrationStatus,
        lastRegistrationTime,
        permissionStatus: permissionStatus.status,
      };
    } catch (err) {
      error('Error getting notification status:', err);
      return {
        enabled: false,
        token: null,
        tokenType: null,
        registered: false,
        lastRegistrationStatus: null,
        lastRegistrationTime: null,
        permissionStatus: 'undetermined',
      };
    }
  }

  /**
   * Получает все локальные уведомления
   */
  public async getAllScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    return await Notifications.getAllScheduledNotificationsAsync();
  }

  /**
   * Отменяет все локальные уведомления
   */
  public async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
    log('All scheduled notifications canceled');
  }

  /**
   * Планирует локальное уведомление
   */
  public async scheduleLocalNotification(
    title: string,
    body: string,
    data?: any,
    options?: {
      seconds?: number;
      channelId?: string;
      sound?: boolean;
    }
  ): Promise<string> {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {},
        sound: options?.sound !== false,
        ...(Platform.OS === 'android' && options?.channelId
          ? { channelId: options.channelId }
          : {})
      },
      trigger: options?.seconds
        ? { seconds: options.seconds }
        : null,
    });

    log(`Local notification scheduled: ${identifier}`);
    return identifier;
  }
}

// Создаем и экспортируем синглтон
const notificationService = new NotificationService();
export default notificationService;