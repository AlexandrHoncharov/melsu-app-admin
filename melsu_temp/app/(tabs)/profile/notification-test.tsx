// app/(tabs)/profile/notification-test.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
  SafeAreaView,
  Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useNotifications } from '../../../hooks/useNotifications';

export default function NotificationTestScreen() {
  const {
    isInitialized,
    isRegistered,
    error: registrationError,
    getNotificationStatus,
    sendTestNotification,
    requestPermissions,
    scheduleLocalNotification
  } = useNotifications();

  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Загрузка статуса уведомлений при открытии экрана
  useEffect(() => {
    refreshStatus();
  }, []);

  // Обновление статуса при изменении данных
  useEffect(() => {
    if (!loading && isInitialized) {
      refreshStatus();
    }
  }, [isRegistered, registrationError, isInitialized]);

  // Функция обновления статуса
  const refreshStatus = async () => {
    setLoading(true);
    try {
      const notificationStatus = await getNotificationStatus();
      setStatus(notificationStatus);
    } catch (e) {
      console.error('Ошибка при получении статуса уведомлений:', e);
      Alert.alert('Ошибка', 'Не удалось получить статус уведомлений');
    } finally {
      setLoading(false);
    }
  };

  // Функция отправки тестового уведомления
  const handleSendTest = async () => {
    setSending(true);
    try {
      await sendTestNotification();
    } catch (e) {
      console.error('Ошибка при отправке тестового уведомления:', e);
      Alert.alert('Ошибка', 'Не удалось отправить тестовое уведомление');
    } finally {
      setSending(false);
      refreshStatus();
    }
  };

  // Функция отправки локального уведомления (для тестирования без сервера)
  const handleSendLocalTest = async () => {
    try {
      await scheduleLocalNotification(
        'Локальное уведомление',
        'Это тестовое локальное уведомление',
        { type: 'test', local: true },
        { seconds: 5 } // будет показано через 5 секунд
      );
      Alert.alert('Успешно', 'Локальное уведомление будет показано через 5 секунд');
    } catch (e) {
      console.error('Ошибка при отправке локального уведомления:', e);
      Alert.alert('Ошибка', 'Не удалось отправить локальное уведомление');
    }
  };

  // Функция проверки разрешений для уведомлений
  const checkPermissions = async () => {
    try {
      setRefreshing(true);
      const result = await requestPermissions();

      Alert.alert(
        'Статус разрешений',
        `Результат запроса: ${result ? 'Разрешено' : 'Отклонено'}`
      );

      refreshStatus();
    } catch (e) {
      console.error('Ошибка при проверке разрешений:', e);
      Alert.alert('Ошибка', 'Не удалось проверить разрешения');
    } finally {
      setRefreshing(false);
    }
  };

  // Функция для открытия настроек устройства
  const openSettings = async () => {
    try {
      if (Platform.OS === 'ios') {
        Linking.openURL('app-settings:');
      } else {
        // Для Android
        const pkg = Constants.expoConfig?.android?.package || '';
        if (pkg) {
          try {
            await Notifications.getPermissionsAsync();
            Linking.openSettings();
          } catch (err) {
            Linking.openSettings();
          }
        } else {
          Alert.alert('Ошибка', 'Невозможно определить package name для приложения');
        }
      }
    } catch (e) {
      console.error('Ошибка при открытии настроек:', e);
      Alert.alert(
        'Ошибка',
        'Не удалось открыть настройки. Пожалуйста, откройте настройки уведомлений вручную.'
      );
    }
  };

  // Компонент для отображения информации о токене
  const TokenInfo = () => {
    if (!status || !status.token) {
      return (
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            Push-токен не найден. Возможные причины:
          </Text>
          <Text style={styles.infoItem}>- Недостаточно разрешений</Text>
          <Text style={styles.infoItem}>- Устройство не поддерживается</Text>
          <Text style={styles.infoItem}>- Ошибка при регистрации токена</Text>

          {registrationError && (
            <Text style={styles.errorText}>Ошибка: {registrationError}</Text>
          )}

          <TouchableOpacity
            style={styles.actionButton}
            onPress={checkPermissions}
          >
            <Ionicons name="shield-checkmark-outline" size={20} color="#FFF" />
            <Text style={styles.actionButtonText}>Проверить разрешения</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.infoCard}>
        <View style={styles.infoSection}>
          <Text style={styles.infoLabel}>Тип токена:</Text>
          <Text style={[
            styles.infoValue,
            {color: status.tokenType === 'fcm' ? '#43A047' : '#FF9800'}
          ]}>
            {status.tokenType === 'fcm' ? 'Production (FCM)' : 'Development (Expo)'}
          </Text>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoLabel}>Зарегистрирован на сервере:</Text>
          <View style={styles.statusBadge}>
            <Ionicons
              name={isRegistered ? "checkmark-circle" : "close-circle"}
              size={16}
              color={isRegistered ? "#43A047" : "#E53935"}
            />
            <Text style={[
              styles.statusText,
              {color: isRegistered ? "#43A047" : "#E53935"}
            ]}>
              {isRegistered ? "Да" : "Нет"}
            </Text>
          </View>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoLabel}>Разрешения:</Text>
          <View style={styles.statusBadge}>
            <Ionicons
              name={status.enabled ? "checkmark-circle" : "close-circle"}
              size={16}
              color={status.enabled ? "#43A047" : "#E53935"}
            />
            <Text style={[
              styles.statusText,
              {color: status.enabled ? "#43A047" : "#E53935"}
            ]}>
              {status.enabled ? "Предоставлены" : "Отклонены"}
            </Text>
          </View>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoLabel}>Инициализация:</Text>
          <View style={styles.statusBadge}>
            <Ionicons
              name={isInitialized ? "checkmark-circle" : "close-circle"}
              size={16}
              color={isInitialized ? "#43A047" : "#E53935"}
            />
            <Text style={[
              styles.statusText,
              {color: isInitialized ? "#43A047" : "#E53935"}
            ]}>
              {isInitialized ? "Завершена" : "Не завершена"}
            </Text>
          </View>
        </View>

        <View style={styles.tokenContainer}>
          <Text style={styles.tokenLabel}>Токен (начало):</Text>
          <Text style={styles.tokenValue}>
            {status.token.substring(0, 25)}...
          </Text>
        </View>

        {registrationError && (
          <Text style={styles.errorText}>Ошибка: {registrationError}</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Тестирование уведомлений</Text>
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Title section */}
        <View style={styles.titleSection}>
          <Ionicons name="notifications" size={40} color="#bb0000" />
          <Text style={styles.title}>Проверка Push-уведомлений</Text>
          <Text style={styles.subtitle}>
            Этот экран позволяет проверить работу push-уведомлений на вашем устройстве
          </Text>
        </View>

        {/* Device info section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Информация об устройстве</Text>
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceInfoItem}>
              <Text style={styles.infoKey}>ОС:</Text> {Platform.OS} {Platform.Version}
            </Text>
            <Text style={styles.deviceInfoItem}>
              <Text style={styles.infoKey}>Устройство:</Text> {Device.modelName || 'Неизвестно'}
            </Text>
            <Text style={styles.deviceInfoItem}>
              <Text style={styles.infoKey}>Версия приложения:</Text> {Constants.expoConfig?.version || 'Неизвестно'}
            </Text>
          </View>
        </View>

        {/* Token status section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Статус Push-токена</Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#bb0000" />
              <Text style={styles.loadingText}>Получение информации...</Text>
            </View>
          ) : (
            <TokenInfo />
          )}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.refreshButton]}
              onPress={refreshStatus}
              disabled={loading}
            >
              <Ionicons name="refresh" size={20} color="#1976D2" />
              <Text style={[styles.buttonText, {color: '#1976D2'}]}>Обновить</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.settingsButton]}
              onPress={openSettings}
            >
              <Ionicons name="settings-outline" size={20} color="#555" />
              <Text style={[styles.buttonText, {color: '#555'}]}>Настройки</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Test notification section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Отправка тестового уведомления</Text>

          {!status?.enabled ? (
            <View style={styles.warningContainer}>
              <Ionicons name="warning" size={24} color="#FF9800" />
              <Text style={styles.warningText}>
                Для отправки тестового уведомления необходимо предоставить разрешения.
              </Text>
            </View>
          ) : !status?.token ? (
            <View style={styles.warningContainer}>
              <Ionicons name="warning" size={24} color="#FF9800" />
              <Text style={styles.warningText}>
                Не удалось получить токен устройства. Невозможно отправить тестовое уведомление.
              </Text>
            </View>
          ) : (
            <View style={styles.testSection}>
              <Text style={styles.testInfo}>
                Нажмите кнопку ниже, чтобы отправить тестовое уведомление. Для успешного теста:
              </Text>
              <Text style={styles.testInfoItem}>
                • Убедитесь, что приложение находится в фоновом режиме или закрыто
              </Text>
              <Text style={styles.testInfoItem}>
                • Проверьте, что уведомления разрешены в настройках устройства
              </Text>
              <Text style={styles.testInfoItem}>
                • На некоторых устройствах может потребоваться отключить режим "Не беспокоить"
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.testButton,
              (!status?.enabled || !status?.token || sending) && styles.disabledButton
            ]}
            onPress={handleSendTest}
            disabled={!status?.enabled || !status?.token || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="paper-plane" size={20} color="#FFF" />
            )}
            <Text style={styles.testButtonText}>
              {sending ? 'Отправка...' : 'Отправить тестовое уведомление'}
            </Text>
          </TouchableOpacity>

          {/* Локальное уведомление (для тестирования без сервера) */}
          <TouchableOpacity
            style={[
              styles.testButton,
              styles.localButton,
              !status?.enabled && styles.disabledButton
            ]}
            onPress={handleSendLocalTest}
            disabled={!status?.enabled}
          >
            <Ionicons name="notifications-outline" size={20} color="#FFF" />
            <Text style={styles.testButtonText}>
              Тестовое локальное уведомление
            </Text>
          </TouchableOpacity>
        </View>

        {/* Help section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Возможные проблемы</Text>

          <View style={styles.problemItem}>
            <Text style={styles.problemTitle}>Уведомления не приходят на Android</Text>
            <Text style={styles.problemText}>
              • Проверьте, что приложение не в списке оптимизации батареи
            </Text>
            <Text style={styles.problemText}>
              • Убедитесь, что уведомления разрешены в настройках приложения
            </Text>
            <Text style={styles.problemText}>
              • На некоторых устройствах требуется дополнительная настройка в разделе "Автозапуск"
            </Text>
          </View>

          <View style={styles.problemItem}>
            <Text style={styles.problemTitle}>Уведомления не приходят на iOS</Text>
            <Text style={styles.problemText}>
              • Проверьте настройки уведомлений в системных настройках
            </Text>
            <Text style={styles.problemText}>
              • Разрешите показывать уведомления на экране блокировки
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  scrollView: {
    flex: 1,
  },
  titleSection: {
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 10,
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginHorizontal: 20,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 5,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#555',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  deviceInfo: {
    marginTop: 8,
  },
  deviceInfoItem: {
    fontSize: 14,
    color: '#444',
    marginBottom: 6,
  },
  infoKey: {
    fontWeight: '600',
    color: '#333',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
  },
  infoCard: {
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#444',
    marginBottom: 8,
  },
  infoItem: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    marginLeft: 8,
  },
  infoSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 14,
    color: '#555',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  tokenContainer: {
    marginTop: 8,
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  tokenLabel: {
    fontSize: 13,
    color: '#555',
    marginBottom: 4,
    fontWeight: '500',
  },
  tokenValue: {
    fontSize: 12,
    color: '#333',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  errorText: {
    marginTop: 8,
    color: '#E53935',
    fontSize: 13,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 4,
  },
  refreshButton: {
    backgroundColor: '#E3F2FD',
  },
  settingsButton: {
    backgroundColor: '#F5F5F5',
  },
  buttonText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '500',
  },
  actionButton: {
    flexDirection: 'row',
    backgroundColor: '#1976D2',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  warningText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#FF9800',
  },
  testSection: {
    marginBottom: 16,
  },
  testInfo: {
    fontSize: 14,
    color: '#444',
    marginBottom: 8,
  },
  testInfoItem: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
    marginLeft: 4,
  },
  testButton: {
    flexDirection: 'row',
    backgroundColor: '#bb0000',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  localButton: {
    backgroundColor: '#2196F3',
    marginTop: 8,
  },
  disabledButton: {
    backgroundColor: '#ddd',
  },
  testButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  problemItem: {
    marginBottom: 16,
  },
  problemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  problemText: {
    fontSize: 13,
    color: '#555',
    marginBottom: 4,
    marginLeft: 4,
  },
});