// src/api/notificationsApi.ts
import apiClient from './apiClient';
import { Platform } from 'react-native';
import * as Device from 'expo-device';

// Special debug function to log notification API operations
const debugLog = (message) => {
  console.log(`[PUSH API] ${message}`);
};

// Types for notification requests
export interface DeviceTokenRequest {
  token: string;
  device: string;
  platform: string;
  tokenType?: 'fcm' | 'expo' | 'unknown';
}

export interface NotificationResponse {
  success: boolean;
  message: string;
  action?: string;
}

// API for notification operations
const notificationsApi = {
  /**
   * Register device token for push notifications
   * @param token Device token
   * @param deviceInfo Optional device information
   * @returns Registration result
   */
  registerDeviceToken: async (
    token: string,
    deviceInfo?: {
      deviceName?: string;
      tokenType?: 'fcm' | 'expo' | 'unknown';
    }
  ): Promise<NotificationResponse> => {
    try {
      debugLog(`Registering device token: ${token.substring(0, 10)}...`);

      // Create request data
      const requestData = {
        token,
        device: deviceInfo?.deviceName || 'Unknown device',
        platform: Platform.OS,
        tokenType: deviceInfo?.tokenType || 'unknown'
      };

      debugLog(`Request data: ${JSON.stringify(requestData)}`);

      // Set timeout to avoid hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      try {
        // Make the request with timeout
        const response = await apiClient.post('/device/register', requestData, {
          signal: controller.signal,
          // Ensure correct headers
          headers: {
            'Content-Type': 'application/json'
          }
        });

        // Clear timeout
        clearTimeout(timeoutId);

        debugLog(`Server response: ${JSON.stringify(response.data)}`);
        return response.data;
      } catch (apiError) {
        // Clear timeout
        clearTimeout(timeoutId);

        // Check if aborted due to timeout
        if (apiError.name === 'AbortError') {
          debugLog('Token registration request timed out');
          return {
            message: 'Request timed out, but device may still be registered.',
            success: false,
            timedOut: true
          };
        }

        // Enhanced error logging
        debugLog(`Error registering device token: ${apiError.message}`);

        if (apiError.response) {
          debugLog(`Server response: ${JSON.stringify(apiError.response.data || {})}`);
          debugLog(`Status code: ${apiError.response.status}`);
        } else if (apiError.request) {
          debugLog('No response received from server');
        }

        // Return structured error instead of throwing
        return {
          success: false,
          message: `Registration failed: ${apiError.message}`,
          error: apiError.toString()
        };
      }
    } catch (error) {
      debugLog(`Unexpected error: ${error.message}`);

      // Return a structured error response instead of throwing
      return {
        success: false,
        message: `Registration failed: ${error.message}`,
        error: error.toString()
      };
    }
  },

  /**
   * Unregister device token
   * @param token Device token to remove
   * @returns Unregistration result
   */
  unregisterDeviceToken: async (token: string): Promise<NotificationResponse> => {
    try {
      debugLog(`Unregistering device token: ${token.substring(0, 10)}...`);

      // Create request data
      const requestData = { token };

      // Set timeout to avoid hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      try {
        const response = await apiClient.post('/device/unregister', requestData, {
          signal: controller.signal
        });

        // Clear timeout
        clearTimeout(timeoutId);

        debugLog(`Unregister response: ${JSON.stringify(response.data)}`);
        return response.data;
      } catch (apiError) {
        // Clear timeout
        clearTimeout(timeoutId);

        // Check if aborted due to timeout
        if (apiError.name === 'AbortError') {
          debugLog('Token unregistration request timed out');
          return {
            message: 'Request timed out',
            success: false,
            timedOut: true
          };
        }

        debugLog(`Error unregistering token: ${apiError.message}`);

        // Return error object instead of throwing
        return {
          success: false,
          message: `Unregistration failed: ${apiError.message}`
        };
      }
    } catch (error) {
      debugLog(`Error unregistering token: ${error.message}`);

      // Return error object instead of throwing
      return {
        success: false,
        message: `Unregistration failed: ${error.message}`
      };
    }
  },

  /**
   * Send test push notification
   * @param token Device token
   * @param tokenType Token type (fcm or expo)
   * @returns Notification sending result
   */
  sendTestNotification: async (
    token: string,
    tokenType: 'fcm' | 'expo' | 'unknown' = 'unknown'
  ): Promise<NotificationResponse> => {
    try {
      debugLog(`Sending test notification to token: ${token.substring(0, 10)}...`);
      debugLog(`Token type: ${tokenType}`);

      // Add extra device information
      const requestData = {
        token,
        tokenType,
        device: Device.deviceName || Device.modelName || 'Unknown device',
        platform: Platform.OS
      };

      debugLog(`Test notification request: ${JSON.stringify(requestData)}`);

      // Set timeout to avoid hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      try {
        const response = await apiClient.post('/device/test-notification', requestData, {
          signal: controller.signal
        });

        // Clear timeout
        clearTimeout(timeoutId);

        debugLog(`Test notification response: ${JSON.stringify(response.data)}`);
        return response.data;
      } catch (apiError) {
        // Clear timeout
        clearTimeout(timeoutId);

        // Check if aborted due to timeout
        if (apiError.name === 'AbortError') {
          debugLog('Test notification request timed out');
          return {
            message: 'Request timed out',
            success: false,
            timedOut: true
          };
        }

        debugLog(`Error sending test notification: ${apiError.message}`);

        // Return error object instead of throwing
        return {
          success: false,
          message: `Test notification failed: ${apiError.message}`
        };
      }
    } catch (error) {
      debugLog(`Error sending test notification: ${error.message}`);

      // Return error object instead of throwing
      return {
        success: false,
        message: `Test notification failed: ${error.message}`
      };
    }
  }
};

export default notificationsApi;