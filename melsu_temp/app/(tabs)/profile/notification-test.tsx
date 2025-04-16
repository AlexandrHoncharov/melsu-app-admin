import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform, Switch } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useNotifications } from '../../../hooks/useNotifications';
import notificationsApi from '../../../src/api/notificationsApi';
import { getNotificationChannelForType } from '../../../src/utils/backgroundNotificationHandler';

export default function NotificationTestScreen() {
  const router = useRouter();
  const {
    pushToken,
    notificationPermissionsGranted,
    notification,
    requestPermissions,
    registerForPushNotifications,
    sendLocalNotification,
    sendTestPushNotification,
    isRegistered
  } = useNotifications();

  const [isLoading, setIsLoading] = useState(false);
  const [lastNotification, setLastNotification] = useState<any | null>(null);
  const [selectedNotificationType, setSelectedNotificationType] = useState('default');
  const [useCustomData, setUseCustomData] = useState(false);
  const [lastResponseTime, setLastResponseTime] = useState<string | null>(null);

  useEffect(() => {
    if (notification) {
      setLastNotification(notification);
    }
  }, [notification]);

  // Повторный запрос разрешений на уведомления
  const handleRequestPermissions = async () => {
    try {
      setIsLoading(true);
      const granted = await requestPermissions();

      if (granted) {
        Alert.alert('Успех', 'Разрешения на уведомления получены');
      } else {
        Alert.alert(
          'Разрешения отклонены',
          'Для получения уведомлений необходимо разрешить их в настройках устройства'
        );
      }
    } catch (error) {
      console.error('Ошибка при запросе разрешений:', error);
      Alert.alert('Ошибка', `Не удалось запросить разрешения: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Получение токена
  const handleGetToken = async () => {
    try {
      setIsLoading(true);
      const token = await registerForPushNotifications();

      if (token) {
        Alert.alert('Успех', 'Токен для push-уведомлений получен');
      } else {
        Alert.alert('Ошибка', 'Не удалось получить токен');
      }
    } catch (error) {
      console.error('Ошибка при получении токена:', error);
      Alert.alert('Ошибка', `Не удалось получить токен: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Регистрация токена на сервере
  const handleRegisterToken = async () => {
    if (!pushToken) {
      Alert.alert('Ошибка', 'Токен не получен. Сначала получите токен.');
      return;
    }

    try {
      setIsLoading(true);
      const startTime = Date.now();

      const response = await notificationsApi.registerDeviceToken(
        pushToken,
        { deviceName: Device.deviceName || 'Неизвестное устройство' }
      );

      const endTime = Date.now();
      setLastResponseTime(`${endTime - startTime} мс`);

      if (response.success) {
        Alert.alert('Успех', 'Токен устройства зарегистрирован на сервере');
      } else {
        Alert.alert('Ошибка', response.message || 'Не удалось зарегистрировать токен');
      }
    } catch (error) {
      console.error('Ошибка при регистрации токена:', error);
      Alert.alert('Ошибка', `Не удалось зарегистрировать токен: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Отправка тестового локального уведомления
  const handleSendLocalNotification = async () => {
    try {
      setIsLoading(true);

      // Подготавливаем данные для уведомления
      let data = { type: selectedNotificationType };

      // Добавляем дополнительные данные в зависимости от типа
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

      // Используем правильный канал для Android
      const androidConfig = Platform.OS === 'android'
        ? { channelId: getNotificationChannelForType(selectedNotificationType) }
        : undefined;

      // Отправляем локальное уведомление
      const notificationTitle = `Тестовое уведомление (${selectedNotificationType})`;
      const notificationBody = `Это тестовое ${selectedNotificationType} уведомление отправлено с экрана тестирования`;

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: notificationTitle,
          body: notificationBody,
          data,
          ...androidConfig
        },
        trigger: { seconds: 1 },
      });

      Alert.alert('Уведомление отправлено', `ID уведомления: ${notificationId}`);
    } catch (error) {
      console.error('Ошибка при отправке уведомления:', error);
      Alert.alert('Ошибка', `Не удалось отправить уведомление: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Отправка тестового push-уведомления через сервер
  const handleSendPushNotification = async () => {
    if (!pushToken) {
      Alert.alert('Ошибка', 'Токен не получен. Сначала получите токен.');
      return;
    }

    try {
      setIsLoading(true);
      const startTime = Date.now();

      await sendTestPushNotification();

      const endTime = Date.now();
      setLastResponseTime(`${endTime - startTime} мс`);

      Alert.alert(
        'Запрос отправлен',
        'Push-уведомление отправлено. Проверьте уведомления через несколько секунд.'
      );
    } catch (error) {
      console.error('Ошибка при отправке push-уведомления:', error);
      Alert.alert('Ошибка', `Не удалось отправить push-уведомление: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Отправка прямого push-уведомления через Expo Push API
  const handleSendDirectPushNotification = async () => {
    if (!pushToken) {
      Alert.alert('Ошибка', 'Токен не получен. Сначала получите токен.');
      return;
    }

    try {
      setIsLoading(true);

      // Подготавливаем данные для уведомления
      let data = { type: selectedNotificationType };

      // Добавляем дополнительные данные в зависимости от типа
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

      const startTime = Date.now();

      // Отправляем push-уведомление через Expo Push API
      const message = {
        to: pushToken,
        sound: 'default',
        title: `Expo Push (${selectedNotificationType})`,
        body: 'Это push-уведомление отправлено через Expo Push API',
        data,
        channelId: getNotificationChannelForType(selectedNotificationType),
      };

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      const responseData = await response.json();

      const endTime = Date.now();
      setLastResponseTime(`${endTime - startTime} мс`);

      console.log('Ответ Expo Push API:', responseData);

      if (responseData.data && responseData.data[0] && responseData.data[0].status === 'ok') {
        Alert.alert('Уведомление отправлено', 'Push-уведомление отправлено через Expo');
      } else {
        Alert.alert(
          'Возникла проблема',
          `Ошибка при отправке уведомления через Expo: ${JSON.stringify(responseData)}`
        );
      }
    } catch (error) {
      console.error('Ошибка при отправке push-уведомления:', error);
      Alert.alert('Ошибка', `Не удалось отправить push-уведомление: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Тестирование уведомлений',
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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Статус разрешений</Text>
          <View style={styles.statusContainer}>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Устройство:</Text>
              <Text style={styles.statusValue}>
                {Device.isDevice ? 'Физическое устройство' : 'Эмулятор (push не работает)'}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Разрешения:</Text>
              <Text style={[
                styles.statusValue,
                notificationPermissionsGranted === true ? styles.statusSuccess :
                notificationPermissionsGranted === false ? styles.statusError :
                styles.statusPending
              ]}>
                {notificationPermissionsGranted === true ? 'Разрешено' :
                 notificationPermissionsGranted === false ? 'Запрещено' :
                 'Неизвестно'}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Токен получен:</Text>
              <Text style={[styles.statusValue, pushToken ? styles.statusSuccess : styles.statusError]}>
                {pushToken ? 'Да' : 'Нет'}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Зарегистрирован:</Text>
              <Text style={[styles.statusValue, isRegistered ? styles.statusSuccess : styles.statusError]}>
                {isRegistered ? 'Да' : 'Нет'}
              </Text>
            </View>
            {lastResponseTime && (
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Время ответа:</Text>
                <Text style={styles.statusValue}>{lastResponseTime}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.button, (isLoading || !Device.isDevice) && styles.buttonDisabled]}
            onPress={handleRequestPermissions}
            disabled={isLoading || !Device.isDevice}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Запросить разрешения</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, (isLoading || !Device.isDevice || !notificationPermissionsGranted) && styles.buttonDisabled]}
            onPress={handleGetToken}
            disabled={isLoading || !Device.isDevice || !notificationPermissionsGranted}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Получить Expo Push Token</Text>
            )}
          </TouchableOpacity>
        </View>

        {pushToken && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Expo Push Token</Text>
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
                  {isRegistered ? 'Перерегистрировать токен' : 'Зарегистрировать токен'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Настройки уведомления</Text>

          <View style={styles.optionContainer}>
            <Text style={styles.optionLabel}>Тип уведомления:</Text>
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
            <Text style={styles.switchLabel}>Добавить дополнительные данные:</Text>
            <Switch
              value={useCustomData}
              onValueChange={setUseCustomData}
              trackColor={{ false: '#767577', true: '#9e6163' }}
              thumbColor={useCustomData ? '#770002' : '#f4f3f4'}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Тестирование уведомлений</Text>

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSendLocalNotification}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Отправить локальное уведомление</Text>
            )}
          </TouchableOpacity>

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
                  <Text style={styles.buttonText}>Отправить через сервер</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary, (isLoading || !pushToken) && styles.buttonDisabled]}
                onPress={handleSendDirectPushNotification}
                disabled={isLoading || !pushToken}
              >
                <Text style={styles.buttonTextSecondary}>Отправить через Expo Push API</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {lastNotification && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Последнее уведомление</Text>
            <View style={styles.notificationContainer}>
              <Text style={styles.notificationTitle}>
                {lastNotification.request?.content?.title || 'Без заголовка'}
              </Text>
              <Text style={styles.notificationBody}>
                {lastNotification.request?.content?.body || 'Без содержания'}
              </Text>
              <Text style={styles.notificationMeta}>
                Получено: {new Date().toLocaleTimeString()}
              </Text>
              {lastNotification.request?.content?.data && (
                <View style={styles.notificationData}>
                  <Text style={styles.notificationDataTitle}>Данные:</Text>
                  <Text style={styles.notificationDataJson}>
                    {JSON.stringify(lastNotification.request.content.data, null, 2)}
                  </Text>
                </View>
              )}
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
  },
  backButton: {
    marginLeft: 10,
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
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#770002',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  buttonTextSecondary: {
    color: '#770002',
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
    borderColor: '#770002',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  radioButtonSelected: {
    backgroundColor: '#770002',
  },
  radioButtonText: {
    color: '#770002',
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
});