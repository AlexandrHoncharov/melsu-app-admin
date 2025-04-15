// src/services/OneSignalService.ts
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OneSignal from 'react-native-onesignal';
import Constants from 'expo-constants';
import apiClient from '../api/apiClient';

// Debug settings - set to false in production
const DEBUG = true;
const log = (...args: any[]) => DEBUG && console.log('[OneSignalService]', ...args);
const error = (...args: any[]) => console.error('[OneSignalService]', ...args);

// Storage keys
const STORAGE_KEYS = {
  PLAYER_ID: 'onesignal_player_id',
  SUBSCRIPTION_STATUS: 'onesignal_subscription_status',
  DEVICE_ID: 'onesignal_device_id',
  REGISTRATION_STATUS: 'onesignal_registration_status',
  LAST_REGISTRATION_TIME: 'onesignal_last_registration_time',
};

// Get OneSignal App ID from app config
const getOneSignalAppId = (): string | undefined => {
  try {
    return Constants.expoConfig?.extra?.oneSignalAppId;
  } catch (e) {
    error('Failed to get OneSignal App ID from Constants:', e);
    return undefined;
  }
};

// OneSignal notification categories
export enum NotificationCategory {
  DEFAULT = 'default',
  CHAT = 'chat',
  TICKET = 'ticket',
  VERIFICATION = 'verification'
}

/**
 * OneSignal Service for handling push notifications
 */
class OneSignalService {
  private isInitialized = false;
  private playerID: string | null = null;
  private initPromise: Promise<boolean> | null = null;
  private registrationPromise: Promise<boolean> | null = null;
  private onNotificationReceivedCallback: ((notification: any) => void) | null = null;
  private onNotificationOpenedCallback: ((notification: any) => void) | null = null;

  /**
   * Initialize OneSignal
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
    log('Initializing OneSignal service...');

    try {
      const appId = getOneSignalAppId();

      if (!appId) {
        error('Missing OneSignal App ID in app config');
        return false;
      }

      log(`Initializing OneSignal with App ID: ${appId}`);

      // Set app ID
      OneSignal.setAppId(appId);

      // Set notification will show in foreground handler
      OneSignal.setNotificationWillShowInForegroundHandler(
        (notificationReceivedEvent) => {
          log('Notification received in foreground');
          const notification = notificationReceivedEvent.getNotification();

          // Call notification received callback if set
          if (this.onNotificationReceivedCallback) {
            this.onNotificationReceivedCallback(notification);
          }

          // Complete the event (show notification)
          notificationReceivedEvent.complete(notification);
        }
      );

      // Set notification opened handler
      OneSignal.setNotificationOpenedHandler((openedEvent) => {
        log('Notification opened', openedEvent);

        // Call notification opened callback if set
        if (this.onNotificationOpenedCallback) {
          this.onNotificationOpenedCallback(openedEvent);
        }
      });

      // Get the OneSignal player ID
      const deviceState = await OneSignal.getDeviceState();
      if (deviceState && deviceState.userId) {
        this.playerID = deviceState.userId;
        await AsyncStorage.setItem(STORAGE_KEYS.PLAYER_ID, this.playerID);
        log(`Got OneSignal player ID: ${this.playerID}`);
      } else {
        log('No OneSignal player ID available yet');
      }

      // Register for player ID changes
      OneSignal.addSubscriptionObserver(async (event) => {
        if (event.to.userId && event.to.userId !== this.playerID) {
          this.playerID = event.to.userId;
          await AsyncStorage.setItem(STORAGE_KEYS.PLAYER_ID, this.playerID);
          log(`OneSignal player ID updated: ${this.playerID}`);

          // Register with your backend
          const userId = await AsyncStorage.getItem('userID');
          if (userId && this.playerID) {
            this.registerWithBackend(userId, this.playerID);
          }
        }
      });

      this.isInitialized = true;
      log('OneSignal initialization complete');
      return true;
    } catch (err) {
      error('OneSignal initialization failed:', err);
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Register for push notifications
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
      log(`Starting push notification registration for user ${userId}`);

      // Ensure initialization
      if (!this.isInitialized) {
        const initResult = await this.initialize();
        if (!initResult) {
          error('Failed to initialize OneSignal');
          return false;
        }
      }

      // Request permission (iOS only, Android automatically granted)
      if (Platform.OS === 'ios') {
        await OneSignal.promptForPushNotificationsWithUserResponse();
      }

      // Wait for player ID if not available yet
      if (!this.playerID) {
        const deviceState = await OneSignal.getDeviceState();
        if (deviceState && deviceState.userId) {
          this.playerID = deviceState.userId;
          await AsyncStorage.setItem(STORAGE_KEYS.PLAYER_ID, this.playerID);
          log(`Got OneSignal player ID after registration: ${this.playerID}`);
        } else {
          error('Failed to get OneSignal player ID');
          return false;
        }
      }

      // Set external user ID (your app's user ID) in OneSignal
      await OneSignal.setExternalUserId(userId);
      log(`Set external user ID: ${userId}`);

      // Register with your backend
      const success = await this.registerWithBackend(userId, this.playerID);
      if (!success) {
        error('Failed to register with backend');
        return false;
      }

      // Save registration status
      await this.saveRegistrationStatus('success');
      log('Push notification registration complete');
      return true;
    } catch (err) {
      error('Push notification registration failed:', err);
      await this.saveRegistrationStatus('failed');
      return false;
    }
  }

  /**
   * Register the device token with your backend
   */
  private async registerWithBackend(userId: string, playerId: string): Promise<boolean> {
    try {
      log(`Registering with backend: userId=${userId}, playerId=${playerId}`);

      const response = await apiClient.post('/device/register', {
        token: playerId,
        platform: Platform.OS,
        device_name: Device.modelName || 'Unknown device',
        device_id: await this.getDeviceId(),
        is_onesignal: true,
        replace_existing: true
      });

      log('Backend registration response:', response.data);
      return response.data.success || false;
    } catch (err) {
      error('Backend registration failed:', err);
      return false;
    }
  }

  /**
   * Unregister device token
   */
  public async unregisterDeviceToken(): Promise<boolean> {
    try {
      log('Unregistering device token');

      // Remove external user ID from OneSignal
      await OneSignal.removeExternalUserId();
      log('Removed external user ID from OneSignal');

      // Unregister with backend
      try {
        const response = await apiClient.post('/device/unregister', {
          token: this.playerID || 'force_all_tokens_removal'
        });
        log('Backend unregistration response:', response.data);
      } catch (err) {
        error('Backend unregistration failed:', err);
      }

      // Clear local storage
      await AsyncStorage.removeItem(STORAGE_KEYS.PLAYER_ID);
      await AsyncStorage.removeItem(STORAGE_KEYS.REGISTRATION_STATUS);
      this.playerID = null;

      return true;
    } catch (err) {
      error('Failed to unregister device token:', err);
      return false;
    }
  }

  /**
   * Set up notification listeners
   */
  public setupNotificationListeners(
    onReceived: (notification: any) => void,
    onOpened: (notification: any) => void
  ): () => void {
    this.onNotificationReceivedCallback = onReceived;
    this.onNotificationOpenedCallback = onOpened;

    log('Notification listeners set up');

    // Return cleanup function
    return () => {
      this.onNotificationReceivedCallback = null;
      this.onNotificationOpenedCallback = null;
      log('Notification listeners removed');
    };
  }

  /**
   * Get OneSignal player ID
   */
  public async getPlayerId(): Promise<string | null> {
    if (this.playerID) {
      return this.playerID;
    }

    try {
      // Try to get it from storage first
      const storedId = await AsyncStorage.getItem(STORAGE_KEYS.PLAYER_ID);
      if (storedId) {
        this.playerID = storedId;
        return storedId;
      }

      // If not in storage, get it from OneSignal
      const deviceState = await OneSignal.getDeviceState();
      if (deviceState && deviceState.userId) {
        this.playerID = deviceState.userId;
        await AsyncStorage.setItem(STORAGE_KEYS.PLAYER_ID, this.playerID);
        return this.playerID;
      }

      return null;
    } catch (err) {
      error('Failed to get player ID:', err);
      return null;
    }
  }

  /**
   * Get or generate device ID
   */
  private async getDeviceId(): Promise<string> {
    try {
      // Try to get from storage first
      let deviceId = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ID);

      // Generate if not found
      if (!deviceId) {
        deviceId = this.generateDeviceId();
        await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
      }

      return deviceId;
    } catch (err) {
      // If error, generate temporary ID
      error('Error getting device ID:', err);
      return this.generateDeviceId();
    }
  }

  /**
   * Generate a unique device ID
   */
  private generateDeviceId(): string {
    const random = Math.random().toString(36).substring(2);
    const timestamp = Date.now().toString(36);
    const devicePrefix = Device.brand || Device.modelName || 'unknown';
    return `${devicePrefix}_${timestamp}_${random}`;
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
   * Send a test notification through your backend
   */
  public async sendTestNotification(): Promise<boolean> {
    try {
      log('Sending test notification');

      const response = await apiClient.post('/device/test-notification');
      log('Test notification response:', response.data);

      return response.data.success || false;
    } catch (err) {
      error('Failed to send test notification:', err);
      return false;
    }
  }

  /**
   * Get notification permission status
   */
  public async getNotificationStatus(): Promise<any> {
    try {
      const deviceState = await OneSignal.getDeviceState();

      const status = {
        enabled: deviceState?.hasNotificationPermission || false,
        playerID: deviceState?.userId || null,
        subscribed: deviceState?.isSubscribed || false,
        registered: await AsyncStorage.getItem(STORAGE_KEYS.REGISTRATION_STATUS) === 'success',
        lastRegistrationTime: await AsyncStorage.getItem(STORAGE_KEYS.LAST_REGISTRATION_TIME),
        deviceState
      };

      return status;
    } catch (err) {
      error('Failed to get notification status:', err);
      return {
        enabled: false,
        playerID: null,
        subscribed: false,
        registered: false
      };
    }
  }

  /**
   * Request notification permissions (iOS only)
   */
  public async requestPermissions(): Promise<boolean> {
    try {
      if (Platform.OS === 'ios') {
        const response = await OneSignal.promptForPushNotificationsWithUserResponse();
        log('Push notification permission response:', response);
        return response;
      }

      // Android permissions are automatically granted
      return true;
    } catch (err) {
      error('Failed to request permissions:', err);
      return false;
    }
  }

  /**
   * Add a tag to the user
   */
  public async addTag(key: string, value: string): Promise<void> {
    try {
      await OneSignal.sendTag(key, value);
      log(`Added tag: ${key}=${value}`);
    } catch (err) {
      error(`Failed to add tag ${key}:`, err);
    }
  }

  /**
   * Schedule a local notification (using OneSignal)
   */
  public async scheduleLocalNotification(
    title: string,
    body: string,
    data?: any,
    options?: {
      seconds?: number;
      category?: NotificationCategory;
    }
  ): Promise<string> {
    try {
      // For local notifications with OneSignal, we need to use their API
      const notificationObj = {
        en: {
          title: title,
          body: body,
          subtitle: '',
        }
      };

      // Add delay if specified
      const additionalData: any = {
        ...(data || {}),
        local: true
      };

      if (options?.category) {
        additionalData.category = options.category;
      }

      const notificationId = await OneSignal.postNotification(
        notificationObj,
        additionalData,
        null,
        options?.seconds ? new Date(Date.now() + options.seconds * 1000).toISOString() : undefined
      );

      log(`Scheduled local notification: ${notificationId}`);
      return notificationId;
    } catch (err) {
      error('Failed to schedule local notification:', err);
      return '';
    }
  }

  /**
   * Full reset of the service (for logout)
   */
  public async reset(): Promise<boolean> {
    try {
      log('Resetting OneSignal service');

      // Unregister from your backend
      await this.unregisterDeviceToken();

      // Remove external user ID
      await OneSignal.removeExternalUserId();

      // Clear all tags
      await OneSignal.deleteTags(Object.values(NotificationCategory));

      // Clear storage
      await AsyncStorage.removeItem(STORAGE_KEYS.PLAYER_ID);
      await AsyncStorage.removeItem(STORAGE_KEYS.REGISTRATION_STATUS);
      await AsyncStorage.removeItem(STORAGE_KEYS.SUBSCRIPTION_STATUS);

      // Reset instance variables
      this.isInitialized = false;
      this.playerID = null;
      this.onNotificationReceivedCallback = null;
      this.onNotificationOpenedCallback = null;

      log('OneSignal service reset complete');
      return true;
    } catch (err) {
      error('Failed to reset OneSignal service:', err);
      return false;
    }
  }
}

// Export a singleton instance
const oneSignalService = new OneSignalService();
export default oneSignalService;