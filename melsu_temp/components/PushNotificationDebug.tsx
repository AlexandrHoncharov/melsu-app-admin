// components/PushNotificationDebug.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Button, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { usePushNotifications } from '../hooks/usePushNotifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

export default function PushNotificationDebug() {
  const {
    expoPushToken,
    tokenRegistered,
    registrationError,
    getNotificationStatus,
    sendTestNotification
  } = usePushNotifications();

  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    refreshStatus();
  }, [expoPushToken, tokenRegistered, registrationError]);

  const refreshStatus = async () => {
    setLoading(true);
    try {
      const notificationStatus = await getNotificationStatus();
      setStatus(notificationStatus);
    } catch (e) {
      console.error('Error getting notification status:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleTestNotification = async () => {
    setSending(true);
    try {
      await sendTestNotification();
    } catch (e) {
      console.error('Error sending test notification:', e);
    } finally {
      setSending(false);
      refreshStatus();
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Push Notification Debug</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Device Info:</Text>
        <Text style={styles.info}>OS: {Platform.OS} {Platform.Version}</Text>
        <Text style={styles.info}>Device: {Device.modelName || 'Unknown'}</Text>
        <Text style={styles.info}>App Version: {Constants.expoConfig?.version || 'Unknown'}</Text>
        <Text style={styles.info}>Project ID: {Constants.expoConfig?.extra?.eas?.projectId || 'Unknown'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Token Status:</Text>
        {loading ? (
          <ActivityIndicator size="small" color="#770002" />
        ) : (
          <>
            <Text style={styles.info}>Permissions: {status?.enabled ? 'Granted' : 'Not Granted'}</Text>
            <Text style={styles.info}>Token Type: {status?.tokenType || 'None'}</Text>
            <Text style={styles.info}>Registered with Server: {status?.tokenRegistered ? 'Yes' : 'No'}</Text>
            {status?.error && <Text style={styles.error}>Error: {status.error}</Text>}
            {status?.token ? (
              <View style={styles.tokenContainer}>
                <Text style={styles.tokenLabel}>Token (first 20 chars):</Text>
                <Text style={styles.token}>{status.token.substring(0, 20)}...</Text>
              </View>
            ) : (
              <Text style={styles.error}>No token available</Text>
            )}
          </>
        )}
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title="Refresh Status"
          onPress={refreshStatus}
          disabled={loading}
          color="#770002"
        />
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title={sending ? "Sending..." : "Send Test Notification"}
          onPress={handleTestNotification}
          disabled={sending || !status?.token || !status?.enabled}
          color="#2196F3"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.note}>
          Note: If you don't receive notifications, make sure the app is in background
          and notifications are enabled in device settings.
          For Android, verify that battery optimization is disabled for this app.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#444',
  },
  info: {
    fontSize: 14,
    marginBottom: 4,
    color: '#555',
  },
  error: {
    color: 'red',
    marginTop: 8,
  },
  tokenContainer: {
    backgroundColor: '#f0f0f0',
    padding: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  tokenLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  token: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#0066CC',
  },
  buttonContainer: {
    marginBottom: 16,
  },
  note: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#666',
  }
});