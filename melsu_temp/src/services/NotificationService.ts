// src/services/NotificationService.ts
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../api/apiClient';

// Debug settings - set to false in production
const DEBUG = true;
const log = (...args: any[]) => DEBUG && console.log('[NotificationService]', ...args);
const error = (...args: any[]) => console.error('[NotificationService]', ...args);

// Expo project ID from app.json/app.config.js
const EXPO_PROJECT_ID = 'd9591f01-e110-4918-8b09-c422bd23baaf';

// Storage keys
const STORAGE_KEYS = {
  DEVICE_TOKEN: 'notification_device_token',
  DEVICE_ID: 'notification_device_id',
  TOKEN_TYPE: 'notification_token_type',
  REGISTRATION_STATUS: 'notification_registration_status',
  LAST_REGISTRATION_TIME: 'notification_last_registration_time',
};

/**
 * Enhanced Notification Service with better Android support
 */
class NotificationService {
  private deviceToken: string | null = null;
  private tokenType: 'expo' | 'fcm' | null = null;
  private isInitialized = false;
  private onNotificationReceivedCallback: ((notification: Notifications.Notification) => void) | null = null;
  private onNotificationResponseCallback: ((response: Notifications.NotificationResponse) => void) | null = null;
  private initPromise: Promise<boolean> | null = null;
  private registrationPromise: Promise<boolean> | null = null;

  /**
   * Initialize the notification service
   */
  public async initialize(): Promise<boolean> {
    if (this.initPromise) return this.initPromise;
    if (this.isInitialized) return true;

    this.initPromise = this._doInitialize();
    const result = await this.initPromise;
    this.initPromise = null;
    return result;
  }

  /**
   * Internal initialization method
   */
  private async _doInitialize(): Promise<boolean> {
    log('Initializing notification service...');

    try {
      // Configure notification handler
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });

      // Load stored token
      await this.loadStoredToken();

      // Create Android notification channels
      if (Platform.OS === 'android') {
        await this.createNotificationChannels();
      }

      // Check permissions but don't request yet
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      log('Current notification permission status:', existingStatus);

      this.isInitialized = true;
      return true;
    } catch (err) {
      error('Initialization failed:', err);
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Create notification channels for Android
   */
  private async createNotificationChannels(): Promise<void> {
    try {
      // Default channel
      await Notifications.setNotificationChannelAsync('default', {
        name: 'По умолчанию',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#770002',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
      });

      // Chat messages channel
      await Notifications.setNotificationChannelAsync('chat', {
        name: 'Сообщения',
        description: 'Уведомления о новых сообщениях в чатах',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 100, 100, 100, 100, 100],
        lightColor: '#0077FF',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        sound: 'default',
      });

      // Support tickets channel
      await Notifications.setNotificationChannelAsync('tickets', {
        name: 'Обращения',
        description: 'Уведомления о статусе обращений в поддержку',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 200, 200],
        lightColor: '#33CC66',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        sound: 'default',
      });

      log('Android notification channels created successfully');
    } catch (err) {
      error('Failed to create notification channels:', err);
    }
  }

  /**
   * Request permissions for notifications
   */
  public async requestPermissions(): Promise<boolean> {
    try {
      if (!Device.isDevice) {
        log('Not a physical device, skipping permission request');
        return false;
      }

      // Check current permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();

      // If already granted, return true
      if (existingStatus === 'granted') {
        return true;
      }

      // Request permissions if not already granted
      const { status } = await Notifications.requestPermissionsAsync();
      log('New notification permission status:', status);

      return status === 'granted';
    } catch (err) {
      error('Error requesting permissions:', err);
      return false;
    }
  }

  /**
   * Register device for push notifications
   */
  public async registerForPushNotifications(userId: string): Promise<boolean> {
    if (!userId) {
      error('User ID is required for registration');
      return false;
    }

    if (this.registrationPromise) {
      return this.registrationPromise;
    }

    this.registrationPromise = this._doRegisterForPushNotifications(userId);
    const result = await this.registrationPromise;
    this.registrationPromise = null;
    return result;
  }

  /**
   * Internal method for push notification registration
   */
  private async _doRegisterForPushNotifications(userId: string): Promise<boolean> {
    try {
      log(`Starting push token registration for user ${userId}`);

      // Ensure initialization
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Check permissions
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        log('No permission for notifications, aborting registration');
        await this.saveRegistrationStatus('failed');
        return false;
      }

      // Always request a new token
      const token = await this.getExpoPushToken();
      if (!token) {
        error('Failed to get push token');
        await this.saveRegistrationStatus('failed');
        return false;
      }

      // Save token type and the token itself
      this.deviceToken = token;
      this.tokenType = token.startsWith('ExponentPushToken') ? 'expo' : 'fcm';

      // Get or generate device ID
      const deviceId = await this.getDeviceId();

      // Register with server
      const registrationSuccess = await this.registerTokenWithServer(userId, token, this.tokenType, deviceId);

      if (registrationSuccess) {
        // Save token and status to storage
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
   * Get Expo push token
   */
  private async getExpoPushToken(): Promise<string | null> {
    try {
      log('Getting push token with project ID:', EXPO_PROJECT_ID);

      // Get token with projectId specified
      const { data: token } = await Notifications.getExpoPushTokenAsync({
        projectId: EXPO_PROJECT_ID,
      });

      // Determine token type for debugging
      const tokenType = token.startsWith('ExponentPushToken') ? 'Development (Expo)' : 'Production (FCM)';
      log(`Token received: ${token.substring(0, 10)}... (${tokenType})`);

      return token;
    } catch (err) {
      error('Error getting push token:', err);
      return null;
    }
  }

  /**
   * Get or generate unique device ID
   */
  private async getDeviceId(): Promise<string> {
    try {
      // Try to get saved ID
      let deviceId = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ID);

      // If no saved ID, generate a new one
      if (!deviceId) {
        deviceId = this.generateDeviceId();
        await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
        log('Generated new device ID:', deviceId);
      }

      return deviceId;
    } catch (err) {
      // If error, generate a temporary ID
      error('Error getting device ID:', err);
      return this.generateDeviceId();
    }
  }

  /**
   * Generate unique device ID
   */
  private generateDeviceId(): string {
    const random = Math.random().toString(36).substring(2);
    const timestamp = Date.now().toString(36);
    const devicePrefix = Device.brand || Device.modelName || 'unknown';
    return `${devicePrefix}_${timestamp}_${random}`;
  }

  /**
   * Register token with server
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
   * Load stored token from storage
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
   * Save token to storage
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
   * Save registration status
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
   * Unregister device token
   */
  public async unregisterDeviceToken(): Promise<boolean> {
    try {
      log('Unregistering device token');

      // Send request to server
      try {
        const tokenToUse = this.deviceToken || 'force_all_tokens_removal';
        const response = await apiClient.post('/device/unregister', { token: tokenToUse });
        log('Unregister response:', response.data);
      } catch (err) {
        // Continue even on server error
        error('Server error during unregister:', err);
      }

      // Clear local data regardless of server result
      this.deviceToken = null;
      this.tokenType = null;

      // Clear storage
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
   * Set up notification listeners
   */
  public setupNotificationListeners(
    onReceived: (notification: Notifications.Notification) => void,
    onResponse: (response: Notifications.NotificationResponse) => void
  ): () => void {
    // Save callbacks
    this.onNotificationReceivedCallback = onReceived;
    this.onNotificationResponseCallback = onResponse;

    // Subscribe to notification receipt
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      log('Notification received', notification.request.identifier);
      if (this.onNotificationReceivedCallback) {
        this.onNotificationReceivedCallback(notification);
      }
    });

    // Subscribe to notification response
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      log('Notification response received', response.notification.request.identifier);
      if (this.onNotificationResponseCallback) {
        this.onNotificationResponseCallback(response);
      }
    });

    log('Notification listeners set up');

    // Return function to unsubscribe
    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
      this.onNotificationReceivedCallback = null;
      this.onNotificationResponseCallback = null;
      log('Notification listeners removed');
    };
  }

  /**
   * Send test notification
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
   * Get badge count
   */
  public async getBadgeCount(): Promise<number> {
    try {
      const count = await Notifications.getBadgeCountAsync();
      return count;
    } catch (err) {
      error('Error getting badge count:', err);
      return 0;
    }
  }

  /**
   * Set badge count
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
   * Get notification status
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
      // Get permission status
      const permissionStatus = await Notifications.getPermissionsAsync();

      // Get last registration data
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
   * Schedule local notification
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

// Create and export singleton
const notificationService = new NotificationService();
export default notificationService;