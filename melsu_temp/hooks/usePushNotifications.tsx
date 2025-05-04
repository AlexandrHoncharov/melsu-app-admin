// hooks/usePushNotifications.tsx
// Stub implementation with all push notification functionality removed

export function usePushNotifications() {
    // Return empty implementation with the same interface
    return {
        expoPushToken: null,
        notification: null,
        sendTestNotification: async () => {
            console.log('Push notifications have been disabled in this version');
            return {success: false, message: 'Push notifications are disabled'};
        },
        tokenRegistered: false,
        registrationError: null,
        getNotificationStatus: async () => {
            return {
                enabled: false,
                token: null,
                tokenType: 'None',
                tokenRegistered: false,
                error: null,
                permissionStatus: 'denied'
            };
        },
        unregisterDeviceToken: async () => {
            return true; // Always return success since there's no token to unregister
        }
    };
}