// components/AndroidPermissionHelper.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
// @ts-ignore
import { useAppNotifications } from '../providers/AppNotificationProvider';

interface AndroidPermissionHelperProps {
  onPermissionGranted?: () => void;
}

/**
 * Component to help with getting notification permissions on Android
 * Shows guidance for users to enable notifications if needed
 */
const AndroidPermissionHelper: React.FC<AndroidPermissionHelperProps> = ({
  onPermissionGranted
}) => {
  const [permissionStatus, setPermissionStatus] = useState<Notifications.PermissionStatus>('undetermined');
  const [visible, setVisible] = useState(false);
  const { checkPermissions } = useAppNotifications();

  // Only show on Android
  if (Platform.OS !== 'android') {
    return null;
  }

  useEffect(() => {
    checkPermissionStatus();
  }, []);

  const checkPermissionStatus = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setPermissionStatus(status);

      // Show helper if permission is denied
      setVisible(status === 'denied');

      // Call callback if permission is granted
      if (status === 'granted' && onPermissionGranted) {
        onPermissionGranted();
      }
    } catch (error) {
      console.error('Error checking notification permissions:', error);
    }
  };

  const handleRequestPermission = async () => {
    try {
      // Try to request permission directly
      const granted = await checkPermissions();

      if (granted) {
        setVisible(false);
        if (onPermissionGranted) {
          onPermissionGranted();
        }
      } else {
        // If permission still denied, open app settings
        openAppSettings();
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    }
  };

  const openAppSettings = () => {
    Linking.openSettings();
  };

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Включите уведомления</Text>
        <Text style={styles.description}>
          Для получения важных сообщений и уведомлений, пожалуйста, разрешите приложению отправлять вам уведомления.
        </Text>
        <View style={styles.buttonContainer}>
          <Pressable
            style={styles.buttonSecondary}
            onPress={() => setVisible(false)}
          >
            <Text style={styles.buttonSecondaryText}>Позже</Text>
          </Pressable>
          <Pressable
            style={styles.buttonPrimary}
            onPress={handleRequestPermission}
          >
            <Text style={styles.buttonPrimaryText}>Разрешить</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 16,
    zIndex: 1000,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#770002',
  },
  description: {
    fontSize: 14,
    marginBottom: 16,
    color: '#333',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  buttonPrimary: {
    backgroundColor: '#770002',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 8,
  },
  buttonPrimaryText: {
    color: 'white',
    fontWeight: '600',
  },
  buttonSecondary: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  buttonSecondaryText: {
    color: '#666',
  },
});

export default AndroidPermissionHelper;