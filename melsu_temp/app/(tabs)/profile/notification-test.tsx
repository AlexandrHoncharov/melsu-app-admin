import React, {useEffect, useRef, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    AppState,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import {Stack, useRouter} from 'expo-router';
import {Ionicons} from '@expo/vector-icons';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import {useNotifications} from '../../../hooks/useNotifications';
import {getNotificationChannelForType} from '../../../src/utils/backgroundNotificationHandler';

// Ensure notifications show in foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

export default function NotificationTestScreen() {
    const router = useRouter();
    const appState = useRef(AppState.currentState);
    const [appStateVisible, setAppStateVisible] = useState(appState.current);

    const {
        pushToken,
        tokenType,
        notificationPermissionsGranted,
        notification,
        registerForPushNotifications,
        sendTestPushNotification,
        isRegistered,
        retryTokenRegistration
    } = useNotifications();

    const [isLoading, setIsLoading] = useState(false);
    const [lastNotification, setLastNotification] = useState(null);
    const [selectedNotificationType, setSelectedNotificationType] = useState('default');
    const [useCustomData, setUseCustomData] = useState(false);
    const [lastResponseTime, setLastResponseTime] = useState(null);
    const [permissionDetails, setPermissionDetails] = useState(null);
    const [deviceDetails, setDeviceDetails] = useState(null);
    const [notificationSettings, setNotificationSettings] = useState(null);
    const [lastFetchTime, setLastFetchTime] = useState(0);
    const [showDebugInfo, setShowDebugInfo] = useState(false);

    // Track app state to refresh settings when app returns to foreground
    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (
                appState.current.match(/inactive|background/) &&
                nextAppState === 'active' &&
                Date.now() - lastFetchTime > 10000
            ) {
                refreshAllSettings();
                setLastFetchTime(Date.now());
            }
            appState.current = nextAppState;
            setAppStateVisible(nextAppState);
        });
        return () => subscription.remove();
    }, [lastFetchTime]);

    // On mount
    useEffect(() => {
        refreshAllSettings();
    }, []);

    // When a push is received
    useEffect(() => {
        if (notification) {
            setLastNotification(notification);
        }
    }, [notification]);

    // Combined refresh helper
    const refreshAllSettings = () => {
        getDeviceDetails();
        getPermissionDetails();
        if (Platform.OS === 'ios') getNotificationSettings();
    };

    // Get current permissions (no prompt)
    const getPermissionDetails = async () => {
        try {
            const settings = await Notifications.getPermissionsAsync();
            setPermissionDetails({...settings, lastChecked: new Date().toLocaleTimeString()});
        } catch (e) {
            console.error('Error fetching permissions:', e);
            setPermissionDetails({error: e.message});
        }
    };

    // Prompt user for notifications permissions
    const handleRequestPermissions = async () => {
        try {
            setIsLoading(true);
            const {status, granted, canAskAgain} = await Notifications.requestPermissionsAsync({
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
            });
            setPermissionDetails({status, granted, canAskAgain, lastChecked: new Date().toLocaleTimeString()});

            if (!granted) {
                if (!canAskAgain) {
                    Alert.alert(
                        'Notifications Disabled',
                        'Please enable notifications in Settings to receive updates.',
                        [
                            {text: 'Cancel', style: 'cancel'},
                            {text: 'Open Settings', onPress: () => Linking.openSettings()}
                        ]
                    );
                } else {
                    Alert.alert('Permissions Denied', 'Notification permissions not granted.');
                }
            } else {
                Alert.alert('Success', 'Notification permissions granted');
            }
        } catch (error) {
            console.error('Error requesting permissions:', error);
            Alert.alert('Error', `Failed to request permissions: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch iOS-specific notification settings and device token
    const getNotificationSettings = async () => {
        try {
            const settings = await Notifications.getPermissionsAsync();
            const devicePushToken = await Notifications.getDevicePushTokenAsync()
                .then(t => t.data)
                .catch(() => null);
            setNotificationSettings({
                ...settings,
                devicePushToken,
                bundleIdentifier: Constants.manifest?.ios?.bundleIdentifier,
                hasGoogleServicesFile: !!Constants.manifest?.ios?.googleServicesFile,
            });
        } catch (e) {
            console.error('Error getting notification settings:', e);
            setNotificationSettings({error: e.message});
        }
    };

    // Gather device info for debug panel
    const getDeviceDetails = async () => {
        try {
            const base = {
                deviceName: Device.deviceName || 'Unknown',
                deviceType: Device.deviceType,
                osName: Device.osName,
                osVersion: Device.osVersion,
            };
            const iosExtras = Platform.OS === 'ios' ? {
                model: Device.modelName,
                systemVersion: Platform.Version,
                bundleId: Constants.manifest?.ios?.bundleIdentifier,
                buildNumber: Constants.manifest?.ios?.buildNumber,
                isSimulator: !Device.isDevice,
                hasCustomScheme: !!Constants.manifest?.scheme,
                hasGoogleServices: !!Constants.manifest?.ios?.googleServicesFile,
            } : {};
            setDeviceDetails({...base, ...iosExtras});
        } catch (e) {
            console.error('Error getting device details:', e);
            setDeviceDetails({error: e.message});
        }
    };

    // Obtain Expo push token
    const handleGetToken = async () => {
        try {
            setIsLoading(true);
            if (Platform.OS === 'ios' && !Constants.manifest?.ios?.googleServicesFile) {
                Alert.alert(
                    'Missing Configuration',
                    'GoogleService-Info.plist is required for FCM on iOS.',
                    [{text: 'OK'}]
                );
            }
            const token = await registerForPushNotifications();
            if (token) {
                Alert.alert('Success', 'Push token obtained');
                if (Platform.OS === 'ios') getNotificationSettings();
            } else {
                Alert.alert('Token Retrieval Failed', 'Could not get a push token. See debug info.');
            }
        } catch (e) {
            console.error('Error getting token:', e);
            Alert.alert('Error Getting Token', e.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Register token with backend
    const handleRegisterToken = async () => {
        if (!pushToken) {
            Alert.alert('Error', 'No token available. Please get a token first.');
            return;
        }
        try {
            setIsLoading(true);
            const start = Date.now();
            const resp = await retryTokenRegistration();
            setLastResponseTime(`${Date.now() - start} ms`);
            if (resp.success) {
                Alert.alert('Success', 'Token registered with server');
            } else {
                Alert.alert('Registration Error', resp.message || 'Unknown error');
            }
        } catch (e) {
            console.error('Error registering token:', e);
            Alert.alert('Error', e.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Send a local notification (for testing)
    const handleSendLocalNotification = async () => {
        try {
            setIsLoading(true);
            let data = {type: selectedNotificationType};
            if (useCustomData) {
                data = {...data, timestamp: Date.now()};
            }
            const iosOptions = Platform.OS === 'ios'
                ? {_displayInForeground: true, sound: true, priority: 'high', autoDismiss: false}
                : {};
            const id = await Notifications.scheduleNotificationAsync({
                content: {
                    title: `Test (${selectedNotificationType})`,
                    body: `Local test notification`,
                    data,
                    badge: 1,
                    ...iosOptions
                },
                trigger: {
                    seconds: 1, channelId: Platform.OS === 'android'
                        ? getNotificationChannelForType(selectedNotificationType) : undefined
                }
            });
            Alert.alert('Local Notification Scheduled', `ID: ${id}`);
        } catch (e) {
            console.error('Error sending local notification:', e);
            Alert.alert('Error', e.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Send push via your server/API
    const handleSendPushNotification = async () => {
        if (!pushToken) {
            Alert.alert('Error', 'No token available.');
            return;
        }
        try {
            setIsLoading(true);
            const start = Date.now();
            await sendTestPushNotification();
            setLastResponseTime(`${Date.now() - start} ms`);
            Alert.alert('Push Sent', 'Check your device (may take up to a minute).');
        } catch (e) {
            console.error('Error sending push notification:', e);
            Alert.alert('Error', e.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Direct APNS test via Expo Push API
    const handleSendDirectIOSPush = async () => {
        if (!pushToken || Platform.OS !== 'ios') return;
        try {
            setIsLoading(true);
            const payload = {
                to: pushToken,
                title: 'Direct APNS Test',
                body: 'Testing direct to APNS',
                badge: 1,
                sound: 'default',
                priority: 'high',
                _displayInForeground: true,
                contentAvailable: true,
                data: {timestamp: Date.now()},
            };
            const res = await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (json.data?.[0]?.status === 'ok') {
                Alert.alert('APNS Push Sent', 'Check your device');
            } else {
                Alert.alert('APNS Push Error', JSON.stringify(json));
            }
        } catch (e) {
            console.error('Error sending APNS push:', e);
            Alert.alert('Error', e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const openNotificationSettings = () => {
        if (Platform.OS === 'ios') Linking.openSettings();
    };

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    title: 'iOS Notification Tests',
                    headerShown: true,
                    headerStyle: {backgroundColor: '#ffffff'},
                    headerTintColor: '#770002',
                    headerTitleStyle: {fontWeight: 'bold'},
                    headerLeft: () => (
                        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                            <Ionicons name="arrow-back" size={24} color="#770002"/>
                        </TouchableOpacity>
                    ),
                }}
            />

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* iOS Banner */}
                {Platform.OS === 'ios' && (
                    <View style={styles.iosBanner}>
                        <Ionicons name="ios-information-circle" size={24} color="#007AFF" style={styles.iosIcon}/>
                        <Text style={styles.iosBannerText}>
                            iOS notifications require app to be in background or device to be locked. They may take up
                            to a minute to arrive.
                        </Text>
                    </View>
                )}

                {/* Status Section */}
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
                                    <Text style={[styles.statusValue, styles.settingsLink]}>Open Settings</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        <View style={styles.statusRow}>
                            <Text style={styles.statusLabel}>Token Type:</Text>
                            <Text style={styles.statusValue}>{tokenType || 'None'}</Text>
                        </View>
                        <View style={styles.statusRow}>
                            <Text style={styles.statusLabel}>Has Token:</Text>
                            <Text style={[styles.statusValue, pushToken ? styles.statusSuccess : styles.statusError]}>
                                {pushToken ? 'Yes' : 'No'}
                            </Text>
                        </View>
                        <View style={styles.statusRow}>
                            <Text style={styles.statusLabel}>Registered:</Text>
                            <Text
                                style={[styles.statusValue, isRegistered ? styles.statusSuccess : styles.statusError]}>
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

                    {/* iOS Config */}
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
                                <Text
                                    style={styles.iosConfigValue}>{deviceDetails.hasCustomScheme ? 'Set' : 'Not set'}</Text>
                            </View>
                            <View style={styles.iosConfigRow}>
                                <Text style={styles.iosConfigLabel}>Device:</Text>
                                <Text style={styles.iosConfigValue}>
                                    {deviceDetails.model || 'Unknown'} {deviceDetails.isSimulator ? '(Simulator)' : ''}
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* Buttons */}
                    <TouchableOpacity
                        style={[styles.button, (isLoading || !Device.isDevice) && styles.buttonDisabled]}
                        onPress={handleRequestPermissions}
                        disabled={isLoading || !Device.isDevice}
                    >
                        {isLoading ? <ActivityIndicator size="small" color="#fff"/> :
                            <Text style={styles.buttonText}>Request Permissions</Text>}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.button, (isLoading || !Device.isDevice || !notificationPermissionsGranted) && styles.buttonDisabled]}
                        onPress={handleGetToken}
                        disabled={isLoading || !Device.isDevice || !notificationPermissionsGranted}
                    >
                        {isLoading ? <ActivityIndicator size="small" color="#fff"/> :
                            <Text style={styles.buttonText}>Get Push Token</Text>}
                    </TouchableOpacity>

                    {Platform.OS === 'ios' && (
                        <TouchableOpacity style={[styles.button, styles.buttonIOS]} onPress={openNotificationSettings}>
                            <Text style={styles.buttonTextIOS}>Open iOS Notification Settings</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Push Token Section */}
                {pushToken && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Push Token</Text>
                        <View style={styles.tokenContainer}>
                            <Text style={styles.tokenText} selectable>{pushToken}</Text>
                        </View>
                        <TouchableOpacity
                            style={[styles.button, (isLoading || !pushToken) && styles.buttonDisabled]}
                            onPress={handleRegisterToken}
                            disabled={isLoading || !pushToken}
                        >
                            {isLoading ? <ActivityIndicator size="small" color="#fff"/> :
                                <Text
                                    style={styles.buttonText}>{isRegistered ? 'Re-register Token' : 'Register Token'}</Text>}
                        </TouchableOpacity>
                    </View>
                )}

                {/* Notification Config */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Notification Settings</Text>
                    <View style={styles.optionContainer}>
                        <Text style={styles.optionLabel}>Notification Type:</Text>
                        <View style={styles.radioGroup}>
                            {['default', 'chat', 'schedule', 'ticket', 'news'].map(type => (
                                <TouchableOpacity
                                    key={type}
                                    style={[styles.radioButton, selectedNotificationType === type && styles.radioButtonSelected]}
                                    onPress={() => setSelectedNotificationType(type)}
                                >
                                    <Text
                                        style={[styles.radioButtonText, selectedNotificationType === type && styles.radioButtonTextSelected]}>
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
                            trackColor={{false: '#767577', true: Platform.OS === 'ios' ? '#AECBFA' : '#9e6163'}}
                            thumbColor={useCustomData ? (Platform.OS === 'ios' ? '#007AFF' : '#770002') : '#f4f3f4'}
                            ios_backgroundColor="#3e3e3e"
                        />
                    </View>
                </View>

                {/* Testing Buttons */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Test Notifications</Text>
                    <TouchableOpacity
                        style={[styles.button, isLoading && styles.buttonDisabled]}
                        onPress={handleSendLocalNotification}
                        disabled={isLoading}
                    >
                        {isLoading ? <ActivityIndicator size="small" color="#fff"/> :
                            <Text style={styles.buttonText}>Send Local Notification</Text>}
                    </TouchableOpacity>

                    {pushToken && (
                        <>
                            <TouchableOpacity
                                style={[styles.button, (isLoading || !pushToken) && styles.buttonDisabled]}
                                onPress={handleSendPushNotification}
                                disabled={isLoading || !pushToken}
                            >
                                {isLoading ? <ActivityIndicator size="small" color="#fff"/> :
                                    <Text style={styles.buttonText}>Send Push via Server</Text>}
                            </TouchableOpacity>

                            {Platform.OS === 'ios' && (
                                <TouchableOpacity
                                    style={[styles.button, styles.buttonIOS, (isLoading || !pushToken) && styles.buttonDisabled]}
                                    onPress={handleSendDirectIOSPush}
                                    disabled={isLoading || !pushToken}
                                >
                                    {isLoading ? <ActivityIndicator size="small" color="#007AFF"/> :
                                        <Text style={styles.buttonTextIOS}>Test iOS Push Directly</Text>}
                                </TouchableOpacity>
                            )}
                        </>
                    )}
                </View>

                {/* Last Notification Display */}
                {lastNotification && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Last Notification</Text>
                        <View style={styles.notificationContainer}>
                            <Text
                                style={styles.notificationTitle}>{lastNotification.request?.content?.title || 'No title'}</Text>
                            <Text
                                style={styles.notificationBody}>{lastNotification.request?.content?.body || 'No body'}</Text>
                            <Text style={styles.notificationMeta}>Received: {new Date().toLocaleTimeString()}</Text>
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

                {/* Debug Info Toggle */}
                <TouchableOpacity style={styles.debugToggle} onPress={() => setShowDebugInfo(!showDebugInfo)}>
                    <Text style={styles.debugToggleText}>{showDebugInfo ? 'Hide Debug Info' : 'Show Debug Info'}</Text>
                    <Ionicons name={showDebugInfo ? "chevron-up" : "chevron-down"} size={18} color="#770002"/>
                </TouchableOpacity>

                {/* Debug Info */}
                {showDebugInfo && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Debug Information</Text>
                        <View style={styles.debugSection}>
                            <Text style={styles.debugSectionTitle}>Device Details</Text>
                            <Text style={styles.debugText}>{JSON.stringify(deviceDetails, null, 2)}</Text>
                        </View>
                        <View style={styles.debugSection}>
                            <Text style={styles.debugSectionTitle}>Permission Details</Text>
                            <Text style={styles.debugText}>{JSON.stringify(permissionDetails, null, 2)}</Text>
                        </View>
                        {Platform.OS === 'ios' && notificationSettings && (
                            <View style={styles.debugSection}>
                                <Text style={styles.debugSectionTitle}>iOS Notification Settings</Text>
                                <Text style={styles.debugText}>{JSON.stringify(notificationSettings, null, 2)}</Text>
                            </View>
                        )}
                    </View>
                )}

                {/* iOS Troubleshooting */}
                {Platform.OS === 'ios' && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>iOS Troubleshooting</Text>
                        <View style={styles.troubleshootItem}>
                            <Ionicons name="ios-information-circle" size={20} color="#007AFF"
                                      style={styles.troubleshootIcon}/>
                            <Text style={styles.troubleshootText}>
                                <Text style={styles.troubleshootBold}>No notifications arriving: </Text>
                                Ensure the app is in the background or device is locked.
                            </Text>
                        </View>
                        <View style={styles.troubleshootItem}>
                            <Ionicons name="ios-information-circle" size={20} color="#007AFF"
                                      style={styles.troubleshootIcon}/>
                            <Text style={styles.troubleshootText}>
                                <Text style={styles.troubleshootBold}>Token retrieval fails: </Text>
                                Check that the GoogleService-Info.plist is properly included and configured with valid
                                FCM credentials.
                            </Text>
                        </View>
                        <View style={styles.troubleshootItem}>
                            <Ionicons name="ios-information-circle" size={20} color="#007AFF"
                                      style={styles.troubleshootIcon}/>
                            <Text style={styles.troubleshootText}>
                                <Text style={styles.troubleshootBold}>Development vs Production: </Text>
                                Different push certificates are needed for development and production environments.
                            </Text>
                        </View>
                        <View style={styles.troubleshootItem}>
                            <Ionicons name="ios-information-circle" size={20} color="#007AFF"
                                      style={styles.troubleshootIcon}/>
                            <Text style={styles.troubleshootText}>
                                <Text style={styles.troubleshootBold}>Push notifications delay: </Text>
                                iOS push notifications can take up to a minute to arrive.
                            </Text>
                        </View>
                    </View>
                )}

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {flex: 1, backgroundColor: '#f9f9f9'},
    scrollContent: {padding: 20, paddingBottom: 40},
    backButton: {marginLeft: 10},
    iosBanner: {
        flexDirection: 'row',
        backgroundColor: '#E9F0FF',
        borderRadius: 10,
        padding: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#B8D0FF',
        alignItems: 'center'
    },
    iosIcon: {marginRight: 8},
    iosBannerText: {flex: 1, fontSize: 14, color: '#0055CC', lineHeight: 20},
    section: {
        backgroundColor: '#fff',
        borderRadius: 10,
        padding: 16,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2
    },
    sectionTitle: {fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#333'},
    statusContainer: {backgroundColor: '#f5f5f5', borderRadius: 8, padding: 12, marginBottom: 16},
    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0'
    },
    statusLabel: {fontWeight: '600', color: '#555'},
    statusValue: {color: '#777'},
    statusSuccess: {color: '#4CAF50', fontWeight: '500'},
    statusError: {color: '#F44336', fontWeight: '500'},
    statusPending: {color: '#FF9800', fontWeight: '500'},
    settingsLink: {color: '#007AFF', textDecorationLine: 'underline'},
    tokenContainer: {backgroundColor: '#f5f5f5', borderRadius: 8, padding: 12, marginBottom: 16},
    tokenText: {fontSize: 14, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: '#444'},
    button: {backgroundColor: '#770002', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 8},
    buttonDisabled: {backgroundColor: '#cccccc', opacity: 0.7},
    buttonIOS: {backgroundColor: 'transparent', borderWidth: 1, borderColor: '#007AFF'},
    buttonText: {color: '#fff', fontWeight: 'bold', fontSize: 16},
    buttonTextIOS: {color: '#007AFF', fontWeight: 'bold', fontSize: 16},
    optionContainer: {marginBottom: 16},
    optionLabel: {fontSize: 16, fontWeight: '600', marginBottom: 8, color: '#555'},
    radioGroup: {flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8},
    radioButton: {
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginRight: 8,
        marginBottom: 8
    },
    radioButtonSelected: {backgroundColor: Platform.OS === 'ios' ? '#007AFF' : '#770002'},
    radioButtonText: {color: Platform.OS === 'ios' ? '#007AFF' : '#770002', fontWeight: '500'},
    radioButtonTextSelected: {color: '#fff'},
    switchContainer: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16},
    switchLabel: {fontSize: 16, fontWeight: '600', color: '#555'},
    notificationContainer: {backgroundColor: '#f5f5f5', borderRadius: 8, padding: 12},
    notificationTitle: {fontSize: 16, fontWeight: 'bold', marginBottom: 4, color: '#333'},
    notificationBody: {fontSize: 14, marginBottom: 8, color: '#555'},
    notificationMeta: {fontSize: 12, color: '#777', marginBottom: 8},
    notificationData: {marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e0e0e0'},
    notificationDataTitle: {fontSize: 14, fontWeight: '600', marginBottom: 4, color: '#555'},
    notificationDataJson: {fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: '#444'},
    debugToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        marginBottom: 16
    },
    debugToggleText: {color: '#770002', fontWeight: '600', marginRight: 5},
    debugSection: {marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e0e0e0'},
    debugSectionTitle: {fontSize: 14, fontWeight: 'bold', marginBottom: 5, color: '#444'},
    debugText: {fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: '#666'},
    iosConfigContainer: {
        backgroundColor: '#F0F8FF',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#D0E6FF'
    },
    iosConfigTitle: {fontSize: 16, fontWeight: 'bold', marginBottom: 8, color: '#0055CC'},
    iosConfigRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#D0E6FF'
    },
    iosConfigLabel: {fontWeight: '600', color: '#0055CC'},
    iosConfigValue: {color: '#333'},
    troubleshootItem: {
        flexDirection: 'row',
        marginBottom: 12,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0'
    },
    troubleshootIcon: {marginRight: 8, marginTop: 2},
    troubleshootText: {flex: 1, fontSize: 14, lineHeight: 20, color: '#444'},
    troubleshootBold: {fontWeight: 'bold', color: '#333'},
});
