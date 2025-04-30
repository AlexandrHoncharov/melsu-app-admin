import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Switch,
  Linking,
  AppState
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useNotifications } from '../../../hooks/useNotifications';
import notificationsApi from '../../../src/api/notificationsApi';
import { getNotificationChannelForType } from '../../../src/utils/backgroundNotificationHandler';

export default function NotificationTestScreen() {
  const router = useRouter();
  const appState = useRef(AppState.currentState);
  const [appStateVisible, setAppStateVisible] = useState(appState.current);

  const {
    pushToken,
    tokenType,
    notificationPermissionsGranted,
    notification,
    requestPermissions,
    registerForPushNotifications,
    sendLocalNotification,
    sendTestPushNotification,
    isRegistered,
    retryTokenRegistration
  } = useNotifications();

  const [isLoading, setIsLoading] = useState(false);
  const [lastNotification, setLastNotification] = useState<any | null>(null);
  const [selectedNotificationType, setSelectedNotificationType] = useState('default');
  const [useCustomData, setUseCustomData] = useState(false);
  const [lastResponseTime, setLastResponseTime] = useState<string | null>(null);
  const [permissionDetails, setPermissionDetails] = useState<any>(null);
  const [deviceDetails, setDeviceDetails] = useState<any>(null);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<any>(null);
  const [lastFetchTime, setLastFetchTime] = useState(0);

  // Enhanced effect for tracking app state changes for iOS
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('App has come to the foreground!');
        // Refresh notification permissions when returning to foreground
        // This is especially important for iOS where permissions can be changed in settings
        if (Date.now() - lastFetchTime > 10000) { // Only refresh if >10s since last check
          checkPermissionDetails();
          if (Platform.OS === 'ios') {
            getNotificationSettings();
          }
          setLastFetchTime(Date.now());
        }
      }

      appState.current = nextAppState;
      setAppStateVisible(appState.current);
    });

    return () => {
      subscription.remove();
    };
  }, [lastFetchTime]);

  // Get device and system details on mount
  useEffect(() => {
    getDeviceDetails();
    checkPermissionDetails();
    if (Platform.OS === 'ios') {
      getNotificationSettings();
    }
  }, []);

  // Update local state when notification is received
  useEffect(() => {
    if (notification) {
      setLastNotification(notification);
    }
  }, [notification]);

  // Get detailed iOS notification settings
  const getNotificationSettings = async () => {
    if (Platform.OS !== 'ios') return;

    try {
      const settings = await Notifications.getPermissionsAsync();
      const fullSettings = await Notifications.getDevicePushTokenAsync().catch(e => ({ data: 'Error: ' + e.message }));

      // iOS-specific settings
      setNotificationSettings({
        ...settings,
        tokenDetails: fullSettings,
        pushReceiptEnabled: await Notifications.getPresentationPermissionsAsync().catch(() => 'Not available'),
        devicePushToken: fullSettings.data,
        bundleIdentifier: Constants.manifest?.ios?.bundleIdentifier,
        hasGoogleServicesFile: !!Constants.manifest?.ios?.googleServicesFile
      });
    } catch (error) {
      console.error('Error getting notification settings:', error);
      setNotificationSettings({ error: error.message });
    }
  };

  // Get device details
  const getDeviceDetails = async () => {
    try {
      const deviceName = Device.deviceName || 'Unknown';
      const deviceType = Device.deviceType;
      const osName = Device.osName;
      const osVersion = Device.osVersion;

      // iOS-specific details
      const iosInfo = Platform.OS === 'ios' ? {
        model: Device.modelName,
        systemVersion: Platform.Version,
        bundleId: Constants.manifest?.ios?.bundleIdentifier,
        buildNumber: Constants.manifest?.ios?.buildNumber,
        isSimulator: !Device.isDevice,
        // Check for custom scheme registration
        hasCustomScheme: !!Constants.manifest?.scheme,
        // FCM configuration
        hasGoogleServices: !!Constants.manifest?.ios?.googleServicesFile,
        supportsPushNotifications: true
      } : {};

      setDeviceDetails({
        deviceName,
        deviceType,
        osName,
        osVersion,
        ...iosInfo
      });
    } catch (error) {
      console.error('Error getting device details:', error);
      setDeviceDetails({ error: error.message });
    }
  };

  // Get detailed permission information
  const checkPermissionDetails = async () => {
    try {
      const permissions = await Notifications.getPermissionsAsync();
      const foregroundSettings = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowDisplayInCarPlay: true,
          allowCriticalAlerts: true,
          provideAppNotificationSettings: true,
          allowProvisional: true,
          allowAnnouncements: true,
        },
      }).catch(e => ({ granted: 'error', canAskAgain: false, status: e.message }));

      setPermissionDetails({
        ...permissions,
        foregroundRequest: foregroundSettings,
        lastChecked: new Date().toLocaleTimeString()
      });
    } catch (error) {
      console.error('Error checking permission details:', error);
      setPermissionDetails({ error: error.message });
    }
  };

  // Enhanced permission request for iOS
  const handleRequestPermissions = async () => {
    try {
      setIsLoading(true);

      // Additional iOS-specific permissions check
      if (Platform.OS === 'ios') {
        const settings = await Notifications.getPermissionsAsync();
        console.log('Current iOS notification settings:', settings);

        if (!settings.granted && !settings.canAskAgain) {
          // Can't request through the app - need to go to settings
          Alert.alert(
            'Permission Required',
            'Notifications are disabled for this app. Would you like to open settings to enable them?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() }
            ]
          );
          setIsLoading(false);
          return;
        }
      }

      const granted = await requestPermissions();

      // Re-check detailed permissions
      await checkPermissionDetails();
      if (Platform.OS === 'ios') {
        await getNotificationSettings();
      }

      if (granted) {
        Alert.alert('Success', 'Notification permissions granted');
      } else {
        if (Platform.OS === 'ios') {
          Alert.alert(
            'Notifications Disabled',
            'Please enable notifications in your device settings to receive updates.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() }
            ]
          );
        } else {
          Alert.alert(
            'Permissions Denied',
            'Notification permissions were not granted.'
          );
        }
      }
    } catch (error) {
      console.error('Error requesting permissions:', error);
      Alert.alert('Error', `Failed to request permissions: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Enhanced token registration specifically for iOS
  const handleGetToken = async () => {
    try {
      setIsLoading(true);

      // For iOS, check for necessary configuration
      if (Platform.OS === 'ios') {
        // Check if we have the required setup
        if (!Constants.manifest?.ios?.googleServicesFile) {
          Alert.alert(
            'Missing Configuration',
            'The app is missing GoogleService-Info.plist configuration. This is required for FCM on iOS.',
            [{ text: 'OK' }]
          );
        }
      }

      const token = await registerForPushNotifications();

      // Refresh notification settings after token retrieval
      if (Platform.OS === 'ios') {
        await getNotificationSettings();
      }

      if (token) {
        Alert.alert('Success', 'Push notification token obtained');
      } else {
        // iOS-specific troubleshooting
        if (Platform.OS === 'ios') {
          Alert.alert(
            'Token Retrieval Failed',
            'Could not get a push token. This might be due to:\n\n' +
            '• Missing permissions\n' +
            '• Incorrect provisioning profile\n' +
            '• Missing APN entitlement\n' +
            '• Simulator use (tokens don\'t work in simulator)\n\n' +
            'Check the debug information for more details.'
          );
        } else {
          Alert.alert('Error', 'Failed to get push token');
        }
      }
    } catch (error) {
      console.error('Error getting token:', error);

      // Provide more detailed error info for iOS
      if (Platform.OS === 'ios') {
        let errorMessage = error.message;
        let troubleshooting = '';

        if (errorMessage.includes('permission')) {
          troubleshooting = 'This appears to be a permissions issue. Try enabling notifications in your device settings.';
        } else if (errorMessage.includes('APNs')) {
          troubleshooting = 'There was an issue connecting to Apple Push Notification service. Make sure your device has internet access and try again.';
        } else if (errorMessage.includes('certificate')) {
          troubleshooting = 'There appears to be an issue with push certificates. This is a development configuration issue.';
        }

        Alert.alert(
          'Error Getting Token',
          `${errorMessage}\n\n${troubleshooting}`,
          [
            { text: 'OK' },
            ...(troubleshooting.includes('settings') ? [{ text: 'Open Settings', onPress: () => Linking.openSettings() }] : [])
          ]
        );
      } else {
        Alert.alert('Error', `Failed to get token: ${error.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Enhanced token registration for iOS
  const handleRegisterToken = async () => {
    if (!pushToken) {
      Alert.alert('Error', 'No token available. Please get a token first.');
      return;
    }

    try {
      setIsLoading(true);
      const startTime = Date.now();

      // For iOS, add additional device info
      const deviceInfo = Platform.OS === 'ios' ? {
        deviceName: Device.deviceName || 'iOS Device',
        model: Device.modelName,
        tokenType: tokenType,
        system: `iOS ${Platform.Version}`
      } : {
        deviceName: Device.deviceName || 'Unknown device',
        tokenType: tokenType
      };

      // Use the improved retry function
      const response = await retryTokenRegistration();

      const endTime = Date.now();
      setLastResponseTime(`${endTime - startTime} ms`);

      if (response.success) {
        Alert.alert('Success', 'Device token registered with server');
      } else {
        // iOS-specific troubleshooting
        if (Platform.OS === 'ios') {
          Alert.alert(
            'Registration Issue',
            `Unable to register token: ${response.message || 'Unknown error'}\n\n` +
            'For iOS devices, this might be due to:\n' +
            '• Network connectivity issues\n' +
            '• Server configuration problems\n' +
            '• Invalid token format\n\n' +
            'Check the debug logs for more details.'
          );
        } else {
          Alert.alert('Error', response.message || 'Failed to register token');
        }
      }
    } catch (error) {
      console.error('Error registering token:', error);
      Alert.alert('Error', `Failed to register token: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // iOS optimized local notification
  const handleSendLocalNotification = async () => {
    try {
      setIsLoading(true);

      // Prepare data based on notification type
      let data = { type: selectedNotificationType };
      if (useCustomData) {
        switch (selectedNotificationType) {
          case 'chat':
            data = { ...data, messageId: 123, chatId: 456, senderId: 789 };
            break;
          case 'ticket':
            data = { ...data, ticketId: 123, status: 'new', importance: 'high' };
            break;
          case 'schedule':
            data = { ...data, updated: true, date: new Date().toISOString() };
            break;
          default:
            data = { ...data, test: true, timestamp: Date.now() };
        }
      }

      // iOS-specific configuration
      const iosOptions = Platform.OS === 'ios' ? {
        sound: true,
        _displayInForeground: true,  // Force display even in foreground
        priority: 'high',
        autoDismiss: false
      } : {};

      // General configuration with platform specifics
      const notificationConfig = {
        content: {
          title: `Test Notification (${selectedNotificationType})`,
          body: `This is a test ${selectedNotificationType} notification from the testing screen`,
          data,
          sound: 'default',
          badge: 1,
          ...iosOptions
        },
        trigger: {
          seconds: 1,
          channelId: Platform.OS === 'android' ?
            getNotificationChannelForType(selectedNotificationType) :
            undefined
        }
      };

      const notificationId = await Notifications.scheduleNotificationAsync(notificationConfig);

      Alert.alert(
        'Local Notification Sent',
        `Notification ID: ${notificationId}\n\nIf you don't see it on iOS, check that:\n\n• App is in background or lock screen\n• Notification permissions are enabled\n• Do Not Disturb is off`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error sending notification:', error);
      Alert.alert('Error', `Failed to send notification: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Enhanced server push test with iOS troubleshooting
  const handleSendPushNotification = async () => {
    if (!pushToken) {
      Alert.alert('Error', 'No token available. Please get a token first.');
      return;
    }

    try {
      setIsLoading(true);
      const startTime = Date.now();

      // Try to send through server API
      const result = await sendTestPushNotification();

      const endTime = Date.now();
      setLastResponseTime(`${endTime - startTime} ms`);

      // Enhanced feedback for iOS
      if (Platform.OS === 'ios') {
        Alert.alert(
          'Push Notification Request Sent',
          'The notification was sent to Apple\'s servers. If you don\'t receive it, check:\n\n' +
          '• The device is connected to the internet\n' +
          '• The app is in background or screen is locked\n' +
          '• Your device is not in Do Not Disturb mode\n' +
          '• Notification settings are enabled for this app\n\n' +
          'Note: Push notifications can take up to a minute to arrive on iOS devices.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Push Notification Sent',
          'Check your device for the notification. It may take a moment to arrive.'
        );
      }
    } catch (error) {
      console.error('Error sending push notification:', error);

      // iOS-specific error handling
      if (Platform.OS === 'ios') {
        let errorMessage = error.message;
        let troubleshooting = '';

        if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
          troubleshooting = 'This appears to be a network issue. Check your internet connection and try again.';
        } else if (errorMessage.includes('certificate') || errorMessage.includes('token')) {
          troubleshooting = 'There may be an issue with the push notification configuration or token validity.';
        }

        Alert.alert(
          'Push Notification Error',
          `${errorMessage}\n\n${troubleshooting}`
        );
      } else {
        Alert.alert('Error', `Failed to send push notification: ${error.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Direct APNs test for iOS
  const handleSendDirectIOSPush = async () => {
    if (!pushToken) {
      Alert.alert('Error', 'No token available. Please get a token first.');
      return;
    }

    if (Platform.OS !== 'ios') {
      Alert.alert('Not Supported', 'This test is only available on iOS devices.');
      return;
    }

    try {
      setIsLoading(true);

      // Prepare notification data with iOS-specific options
      const iosNotification = {
        to: pushToken,
        title: 'iOS Direct Push Test',
        body: 'This notification tests direct connection to APNS',
        sound: 'default',
        badge: 1,
        priority: 'high',
        data: {
          type: selectedNotificationType,
          testMode: true,
          timestamp: Date.now()
        },
        _displayInForeground: true,
        mutableContent: true,
        contentAvailable: true
      };

      const startTime = Date.now();

      // Send directly through Expo Push API which handles APNS
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(iosNotification),
      });

      const responseData = await response.json();

      const endTime = Date.now();
      setLastResponseTime(`${endTime - startTime} ms`);

      console.log('iOS Push API response:', responseData);

      if (responseData.data && responseData.data[0] && responseData.data[0].status === 'ok') {
        Alert.alert(
          'iOS Push Sent',
          'The notification has been sent to Apple\'s servers. It may take a moment to arrive.\n\n' +
          'If you don\'t receive it:\n' +
          '• Ensure the app is in the background\n' +
          '• Check notification settings\n' +
          '• Verify that Do Not Disturb is off',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'iOS Push Issue',
          `Error sending to APNS: ${JSON.stringify(responseData)}\n\n` +
          'This may indicate a problem with:\n' +
          '• The APNS connection\n' +
          '• The token format or validity\n' +
          '• Expo Push service configuration',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error sending iOS push:', error);
      Alert.alert('Error', `Failed to send iOS push: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Open device notification settings (iOS only)
  const openNotificationSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openSettings();
    } else {
      Alert.alert('Not Supported', 'This feature is only available on iOS devices');
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'iOS Notification Tests',
          headerShown: true,
          headerStyle: {
            backgroundColor: '#ffffff',
          },
          headerTintColor: '#770002',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#770002" />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* iOS specific info banner */}
        {Platform.OS === 'ios' && (
          <View style={styles.iosBanner}>
            <Ionicons name="ios-information-circle" size={24} color="#007AFF" style={styles.iosIcon} />
            <Text style={styles.iosBannerText}>
              iOS notifications require app to be in background or device to be locked. They may take up to a minute to arrive.
            </Text>
          </View>
        )}

        {/* Status section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notification Status</Text>
          <View style={styles.statusContainer}>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Platform:</Text>
              <Text style={styles.statusValue}>
                {Platform.OS === 'ios' ? 'iOS ' + Platform.Version : 'Android ' + Platform.Version}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Device Type:</Text>
              <Text style={styles.statusValue}>
                {Device.isDevice ? 'Physical Device' : 'Simulator (no push in simulator)'}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Permissions:</Text>
              <Text style={[
                styles.statusValue,
                notificationPermissionsGranted === true ? styles.statusSuccess :
                notificationPermissionsGranted === false ? styles.statusError :
                styles.statusPending
              ]}>
                {notificationPermissionsGranted === true ? 'Granted' :
                 notificationPermissionsGranted === false ? 'Denied' :
                 'Unknown'}
              </Text>
            </View>
            {Platform.OS === 'ios' && permissionDetails && (
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>iOS Settings:</Text>
                <TouchableOpacity onPress={openNotificationSettings}>
                  <Text style={[styles.statusValue, styles.settingsLink]}>
                    Open Settings
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Token Type:</Text>
              <Text style={styles.statusValue}>
                {tokenType || 'None'}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Has Token:</Text>
              <Text style={[styles.statusValue, pushToken ? styles.statusSuccess : styles.statusError]}>
                {pushToken ? 'Yes' : 'No'}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Registered:</Text>
              <Text style={[styles.statusValue, isRegistered ? styles.statusSuccess : styles.statusError]}>
                {isRegistered ? 'Yes' : 'No'}
              </Text>
            </View>
            {lastResponseTime && (
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Response Time:</Text>
                <Text style={styles.statusValue}>{lastResponseTime}</Text>
              </View>
            )}
          </View>

          {/* iOS-specific configuration status */}
          {Platform.OS === 'ios' && deviceDetails && (
            <View style={styles.iosConfigContainer}>
              <Text style={styles.iosConfigTitle}>iOS Configuration</Text>

              <View style={styles.iosConfigRow}>
                <Text style={styles.iosConfigLabel}>Bundle ID:</Text>
                <Text style={styles.iosConfigValue}>{deviceDetails.bundleId || 'Not set'}</Text>
              </View>

              <View style={styles.iosConfigRow}>
                <Text style={styles.iosConfigLabel}>Firebase Config:</Text>
                <Text style={[
                  styles.iosConfigValue,
                  deviceDetails.hasGoogleServices ? styles.statusSuccess : styles.statusError
                ]}>
                  {deviceDetails.hasGoogleServices ? 'Found' : 'Missing'}
                </Text>
              </View>

              <View style={styles.iosConfigRow}>
                <Text style={styles.iosConfigLabel}>Custom Scheme:</Text>
                <Text style={styles.iosConfigValue}>{deviceDetails.hasCustomScheme ? 'Set' : 'Not set'}</Text>
              </View>

              <View style={styles.iosConfigRow}>
                <Text style={styles.iosConfigLabel}>Device:</Text>
                <Text style={styles.iosConfigValue}>
                  {deviceDetails.model || 'Unknown'} {deviceDetails.isSimulator ? '(Simulator)' : ''}
                </Text>
              </View>
            </View>
          )}

          {/* Permission request button */}
          <TouchableOpacity
            style={[styles.button, (isLoading || !Device.isDevice) && styles.buttonDisabled]}
            onPress={handleRequestPermissions}
            disabled={isLoading || !Device.isDevice}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Request Permissions</Text>
            )}
          </TouchableOpacity>

          {/* Token generation button */}
          <TouchableOpacity
            style={[styles.button, (isLoading || !Device.isDevice || !notificationPermissionsGranted) && styles.buttonDisabled]}
            onPress={handleGetToken}
            disabled={isLoading || !Device.isDevice || !notificationPermissionsGranted}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Get Push Token</Text>
            )}
          </TouchableOpacity>

          {/* iOS settings button */}
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={[styles.button, styles.buttonIOS]}
              onPress={openNotificationSettings}
            >
              <Text style={styles.buttonTextIOS}>Open iOS Notification Settings</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Token section */}
        {pushToken && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Push Token</Text>
            <View style={styles.tokenContainer}>
              <Text style={styles.tokenText} selectable={true}>
                {pushToken}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.button, (isLoading || !pushToken) && styles.buttonDisabled]}
              onPress={handleRegisterToken}
              disabled={isLoading || !pushToken}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.buttonText}>
                  {isRegistered ? 'Re-register Token' : 'Register Token'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Notification Configuration */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notification Settings</Text>

          <View style={styles.optionContainer}>
            <Text style={styles.optionLabel}>Notification Type:</Text>
            <View style={styles.radioGroup}>
              {['default', 'chat', 'schedule', 'ticket', 'news'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.radioButton,
                    selectedNotificationType === type && styles.radioButtonSelected
                  ]}
                  onPress={() => setSelectedNotificationType(type)}
                >
                  <Text style={[
                    styles.radioButtonText,
                    selectedNotificationType === type && styles.radioButtonTextSelected
                  ]}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.switchContainer}>
            <Text style={styles.switchLabel}>Include Custom Data:</Text>
            <Switch
              value={useCustomData}
              onValueChange={setUseCustomData}
              trackColor={{ false: '#767577', true: Platform.OS === 'ios' ? '#AECBFA' : '#9e6163' }}
              thumbColor={useCustomData ? (Platform.OS === 'ios' ? '#007AFF' : '#770002') : '#f4f3f4'}
              ios_backgroundColor="#3e3e3e"
            />
          </View>
        </View>

        {/* Testing Buttons */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Test Notifications</Text>

          {/* Local notification test */}
          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSendLocalNotification}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Send Local Notification</Text>
            )}
          </TouchableOpacity>

          {/* Server push test */}
          {pushToken && (
            <>
              <TouchableOpacity
                style={[styles.button, (isLoading || !pushToken) && styles.buttonDisabled]}
                onPress={handleSendPushNotification}
                disabled={isLoading || !pushToken}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Send Push via Server</Text>
                )}
              </TouchableOpacity>

              {/* iOS-specific test */}
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={[styles.button, styles.buttonIOS, (isLoading || !pushToken) && styles.buttonDisabled]}
                  onPress={handleSendDirectIOSPush}
                  disabled={isLoading || !pushToken}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#007AFF" />
                  ) : (
                    <Text style={styles.buttonTextIOS}>Test iOS Push Directly</Text>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Last notification */}
        {lastNotification && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Last Notification</Text>
            <View style={styles.notificationContainer}>
              <Text style={styles.notificationTitle}>
                {lastNotification.request?.content?.title || 'No title'}
              </Text>
              <Text style={styles.notificationBody}>
                {lastNotification.request?.content?.body || 'No body'}
              </Text>
              <Text style={styles.notificationMeta}>
                Received: {new Date().toLocaleTimeString()}
              </Text>
              {lastNotification.request?.content?.data && (
                <View style={styles.notificationData}>
                  <Text style={styles.notificationDataTitle}>Data:</Text>
                  <Text style={styles.notificationDataJson}>
                    {JSON.stringify(lastNotification.request.content.data, null, 2)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Debug Information - Toggle */}
        <TouchableOpacity
          style={styles.debugToggle}
          onPress={() => setShowDebugInfo(!showDebugInfo)}
        >
          <Text style={styles.debugToggleText}>
            {showDebugInfo ? 'Hide Debug Info' : 'Show Debug Info'}
          </Text>
          <Ionicons
            name={showDebugInfo ? "chevron-up" : "chevron-down"}
            size={18}
            color="#770002"
          />
        </TouchableOpacity>

        {/* Debug Information Section */}
        {showDebugInfo && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Debug Information</Text>

            {/* Device Info */}
            <View style={styles.debugSection}>
              <Text style={styles.debugSectionTitle}>Device Details</Text>
              <Text style={styles.debugText}>
                {JSON.stringify(deviceDetails, null, 2)}
              </Text>
            </View>

            {/* Permission Details */}
            <View style={styles.debugSection}>
              <Text style={styles.debugSectionTitle}>Permission Details</Text>
              <Text style={styles.debugText}>
                {JSON.stringify(permissionDetails, null, 2)}
              </Text>
            </View>

            {/* iOS Notification Settings */}
            {Platform.OS === 'ios' && notificationSettings && (
              <View style={styles.debugSection}>
                <Text style={styles.debugSectionTitle}>iOS Notification Settings</Text>
                <Text style={styles.debugText}>
                  {JSON.stringify(notificationSettings, null, 2)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* iOS Troubleshooting Guide */}
        {Platform.OS === 'ios' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>iOS Troubleshooting</Text>

            <View style={styles.troubleshootItem}>
              <Ionicons name="ios-information-circle" size={20} color="#007AFF" style={styles.troubleshootIcon} />
              <Text style={styles.troubleshootText}>
                <Text style={styles.troubleshootBold}>No notifications arriving: </Text>
                Ensure the app is in the background or device is locked. iOS doesn't show push notifications when the app is in the foreground unless specially configured.
              </Text>
            </View>

            <View style={styles.troubleshootItem}>
              <Ionicons name="ios-information-circle" size={20} color="#007AFF" style={styles.troubleshootIcon} />
              <Text style={styles.troubleshootText}>
                <Text style={styles.troubleshootBold}>Token retrieval fails: </Text>
                Check that the GoogleService-Info.plist is properly included and configured with valid FCM credentials.
              </Text>
            </View>

            <View style={styles.troubleshootItem}>
              <Ionicons name="ios-information-circle" size={20} color="#007AFF" style={styles.troubleshootIcon} />
              <Text style={styles.troubleshootText}>
                <Text style={styles.troubleshootBold}>Development vs Production: </Text>
                Different push certificates are needed for development and production environments in iOS.
              </Text>
            </View>

            <View style={styles.troubleshootItem}>
              <Ionicons name="ios-information-circle" size={20} color="#007AFF" style={styles.troubleshootIcon} />
              <Text style={styles.troubleshootText}>
                <Text style={styles.troubleshootBold}>Push notifications delay: </Text>
                iOS push notifications can take up to a minute to arrive, especially if the device is in low-power mode.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  backButton: {
    marginLeft: 10,
  },
  iosBanner: {
    flexDirection: 'row',
    backgroundColor: '#E9F0FF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#B8D0FF',
    alignItems: 'center',
  },
  iosIcon: {
    marginRight: 8,
  },
  iosBannerText: {
    flex: 1,
    fontSize: 14,
    color: '#0055CC',
    lineHeight: 20,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  statusContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  statusLabel: {
    fontWeight: '600',
    color: '#555',
  },
  statusValue: {
    color: '#777',
  },
  statusSuccess: {
    color: '#4CAF50',
    fontWeight: '500',
  },
  statusError: {
    color: '#F44336',
    fontWeight: '500',
  },
  statusPending: {
    color: '#FF9800',
    fontWeight: '500',
  },
  settingsLink: {
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
  tokenContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  tokenText: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#444',
  },
  button: {
    backgroundColor: '#770002',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#cccccc',
    opacity: 0.7,
  },
  buttonIOS: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  buttonTextIOS: {
    color: '#007AFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  optionContainer: {
    marginBottom: 16,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#555',
  },
  radioGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  radioButton: {
    borderWidth: 1,
    borderColor: Platform.OS === 'ios' ? '#007AFF' : '#770002',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  radioButtonSelected: {
    backgroundColor: Platform.OS === 'ios' ? '#007AFF' : '#770002',
  },
  radioButtonText: {
    color: Platform.OS === 'ios' ? '#007AFF' : '#770002',
    fontWeight: '500',
  },
  radioButtonTextSelected: {
    color: '#fff',
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
  },
  notificationContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#333',
  },
  notificationBody: {
    fontSize: 14,
    marginBottom: 8,
    color: '#555',
  },
  notificationMeta: {
    fontSize: 12,
    color: '#777',
    marginBottom: 8,
  },
  notificationData: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  notificationDataTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    color: '#555',
  },
  notificationDataJson: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#444',
  },
  debugToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginBottom: 16,
  },
  debugToggleText: {
    color: '#770002',
    fontWeight: '600',
    marginRight: 5,
  },
  debugSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  debugSectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#444',
  },
  debugText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#666',
  },
  iosConfigContainer: {
    backgroundColor: '#F0F8FF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#D0E6FF',
  },
  iosConfigTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#0055CC',
  },
  iosConfigRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#D0E6FF',
  },
  iosConfigLabel: {
    fontWeight: '600',
    color: '#0055CC',
  },
  iosConfigValue: {
    color: '#333',
  },
  troubleshootItem: {
    flexDirection: 'row',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  troubleshootIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  troubleshootText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#444',
  },
  troubleshootBold: {
    fontWeight: 'bold',
    color: '#333',
  },
});