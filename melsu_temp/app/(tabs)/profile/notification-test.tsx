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
import { isExpoGo } from '../../../src/utils/environmentUtils';
import LocalNotificationsService from '../../../src/services/LocalNotificationsService';

// Настраиваем предварительно обработчик уведомлений для отображения в приложении
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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
  const [localSending, setLocalSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isExpoGoEnv, setIsExpoGoEnv] = useState(false);
  const [notificationEnabled, setNotificationEnabled] = useState(false);

  // Проверка окружения при первом рендере
  useEffect(() => {
    setIsExpoGoEnv(isExpoGo());

    // Проверка настроек уведомлений
    const checkNotificationSetup = async () => {
      try {
        // Проверяем разрешения на отправку уведомлений
        const permissionGranted = await LocalNotificationsService.checkPermissions();
        setNotificationEnabled(permissionGranted);
        if (!permissionGranted) {
          console.log('Notification permissions are not granted yet');
        }
      } catch (e) {
        console.warn('Error checking notification permissions:', e);
      }
    };

    checkNotificationSetup();
  }, []);

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
      // Обновляем статус разрешений для локальных уведомлений
      const localPermissionGranted = await LocalNotificationsService.checkPermissions();
      setNotificationEnabled(localPermissionGranted);

      // Получаем статус OneSignal/уведомлений
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
      const result = await sendTestNotification();
      if (result) {
        Alert.alert(
          'Успешно',
          'Тестовое уведомление отправлено. Проверьте уведомления на устройстве.'
        );
      } else {
        Alert.alert(
          'Внимание',
          'Запрос на отправку уведомления выполнен, но сервер не подтвердил успешную доставку.'
        );
      }
    } catch (e) {
      console.error('Ошибка при отправке тестового уведомления:', e);
      Alert.alert('Ошибка', `Не удалось отправить тестовое уведомление: ${(e as any).message || e}`);
    } finally {
      setSending(false);
      refreshStatus();
    }
  };

  // Функция отправки локального уведомления (для тестирования без сервера)
  const handleSendLocalTest = async () => {
    setLocalSending(true);
    try {
      // Используем прямой сервис для локальных уведомлений
      const notificationId = await LocalNotificationsService.scheduleLocalNotification(
        'Локальное уведомление',
        'Это тестовое локальное уведомление',
        {
          type: 'test',
          local: true,
          source: 'NotificationTestScreen'
        },
        {
          seconds: 5,  // будет показано через 5 секунд
          channelId: 'default',
          sound: true
        }
      );

      Alert.alert(
        'Успешно',
        `Локальное уведомление будет показано через 5 секунд (ID: ${notificationId})`
      );
    } catch (e) {
      console.error('Ошибка при отправке локального уведомления:', e);
      Alert.alert('Ошибка', `Не удалось отправить локальное уведомление: ${(e as any).message || String(e)}`);
    } finally {
      setLocalSending(false);
    }
  };

  // Функция немедленной отправки тестового уведомления
  const handleSendInstantTest = async () => {
    setLocalSending(true);
    try {
      // Отправляем немедленное уведомление
      const notificationId = await LocalNotificationsService.scheduleLocalNotification(
        'Мгновенное уведомление',
        'Это тестовое мгновенное уведомление',
        {
          type: 'test',
          local: true,
          source: 'immediate_test'
        },
        {
          seconds: 1,  // минимальная задержка
          channelId: 'default',
          sound: true
        }
      );
    } catch (e) {
      console.error('Ошибка при отправке мгновенного уведомления:', e);
    } finally {
      setLocalSending(false);
    }
  };

  // Функция проверки разрешений для уведомлений
  const checkPermissions = async () => {
    try {
      setRefreshing(true);

      // Запрашиваем напрямую разрешения через LocalNotificationsService
      const directResult = await LocalNotificationsService.requestPermissions();

      // Также запрашиваем через OneSignal для синхронизации
      const oneSignalResult = await requestPermissions();

      // Обновляем статус
      setNotificationEnabled(directResult);

      Alert.alert(
        'Статус разрешений',
        `Результат запроса: ${directResult ? 'Разрешено' : 'Отклонено'}`
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

  // Рендерит баннер о режиме приложения (Expo Go или Development Build)
  const renderEnvironmentBanner = () => {
    return (
      <View style={[
        styles.environmentBanner,
        { backgroundColor: isExpoGoEnv ? '#FFF3E0' : '#E8F5E9' }
      ]}>
        <Ionicons
          name={isExpoGoEnv ? "warning" : "checkmark-circle"}
          size={20}
          color={isExpoGoEnv ? "#FF9800" : "#4CAF50"}
        />
        <Text style={styles.environmentText}>
          {isExpoGoEnv
            ? 'Запущено в Expo Go: Используются имитационные уведомления'
            : 'Запущено в Development Build: Используются реальные уведомления'}
        </Text>
      </View>
    );
  };

  // Компонент для отображения информации о токене
  const TokenInfo = () => {
    if (!status || !status.playerID) {
      return (
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            Push-токен не найден. Возможные причины:
          </Text>
          <Text style={styles.infoItem}>- Недостаточно разрешений</Text>
          <Text style={styles.infoItem}>- Устройство не поддерживается</Text>
          <Text style={styles.infoItem}>- Ошибка при регистрации токена</Text>
          {isExpoGoEnv && (
            <Text style={styles.infoItem}>- Приложение запущено в Expo Go (только имитация)</Text>
          )}

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
            {color: isExpoGoEnv ? '#FF9800' : '#43A047'}
          ]}>
            {isExpoGoEnv ? 'Имитация (Expo Go)' : 'Production (OneSignal)'}
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
          <Text style={styles.infoLabel}>Разрешения уведомлений:</Text>
          <View style={styles.statusBadge}>
            <Ionicons
              name={notificationEnabled ? "checkmark-circle" : "close-circle"}
              size={16}
              color={notificationEnabled ? "#43A047" : "#E53935"}
            />
            <Text style={[
              styles.statusText,
              {color: notificationEnabled ? "#43A047" : "#E53935"}
            ]}>
              {notificationEnabled ? "Предоставлены" : "Отклонены"}
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
            {status.playerID.substring(0, 25)}...
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

      {/* Environment banner */}
      {renderEnvironmentBanner()}

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
            <Text style={styles.deviceInfoItem}>
              <Text style={styles.infoKey}>Режим:</Text> {isExpoGoEnv ? 'Expo Go' : 'Development Build'}
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

          {isExpoGoEnv && (
            <View style={styles.warningContainer}>
              <Ionicons name="information-circle" size={24} color="#1976D2" />
              <Text style={[styles.warningText, {color: '#1976D2'}]}>
                В режиме Expo Go работают только локальные уведомления. Для полноценных push-уведомлений требуется Development Build.
              </Text>
            </View>
          )}

          {!notificationEnabled ? (
            <View style={styles.warningContainer}>
              <Ionicons name="warning" size={24} color="#FF9800" />
              <Text style={styles.warningText}>
                Для отправки тестового уведомления необходимо предоставить разрешения. Нажмите кнопку "Проверить разрешения" выше.
              </Text>
            </View>
          ) : (!status?.playerID && !isExpoGoEnv) ? (
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
                • Убедитесь, что уведомления разрешены в настройках устройства
              </Text>
              <Text style={styles.testInfoItem}>
                • Для тестирования локальных уведомлений можно использовать приложение в текущем состоянии
              </Text>
              <Text style={styles.testInfoItem}>
                • Для push-уведомлений с сервера приложение должно быть в фоновом режиме или закрыто
              </Text>
            </View>
          )}

          {/* "Мгновенное уведомление" кнопка - для быстрой проверки */}
          <TouchableOpacity
            style={[
              styles.testButton,
              styles.instantButton,
              !notificationEnabled && styles.disabledButton,
              localSending && styles.disabledButton
            ]}
            onPress={handleSendInstantTest}
            disabled={!notificationEnabled || localSending}
          >
            {localSending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="flash" size={20} color="#FFF" />
            )}
            <Text style={styles.testButtonText}>
              Мгновенное тестовое уведомление
            </Text>
          </TouchableOpacity>

          {/* Локальное уведомление (для тестирования без сервера) */}
          <TouchableOpacity
            style={[
              styles.testButton,
              styles.localButton,
              !notificationEnabled && styles.disabledButton,
              localSending && styles.disabledButton
            ]}
            onPress={handleSendLocalTest}
            disabled={!notificationEnabled || localSending}
          >
            {localSending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="notifications-outline" size={20} color="#FFF" />
            )}
            <Text style={styles.testButtonText}>
              Тестовое локальное уведомление (через 5 сек)
            </Text>
          </TouchableOpacity>

          {/* Серверное уведомление - отключено в Expo Go */}
          <TouchableOpacity
            style={[
              styles.testButton,
              ((!notificationEnabled || (!status?.playerID && !isExpoGoEnv) || sending) || isExpoGoEnv) && styles.disabledButton
            ]}
            onPress={handleSendTest}
            disabled={(!notificationEnabled || (!status?.playerID && !isExpoGoEnv) || sending) || isExpoGoEnv}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="paper-plane" size={20} color="#FFF" />
            )}
            <Text style={styles.testButtonText}>
              {sending ? 'Отправка...' : 'Отправить серверное уведомление'}
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

          {isExpoGoEnv && (
            <View style={styles.problemItem}>
              <Text style={styles.problemTitle}>Ограничения Expo Go</Text>
              <Text style={styles.problemText}>
                • В Expo Go доступны только локальные уведомления
              </Text>
              <Text style={styles.problemText}>
                • Локальные уведомления могут не работать в эмуляторах
              </Text>
              <Text style={styles.problemText}>
                • Для полноценных push-уведомлений создайте Development Build
              </Text>
              <Text style={styles.problemText}>
                • Используйте команду 'eas build' для создания Development Build
              </Text>
            </View>
          )}
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
  },
  instantButton: {
    backgroundColor: '#009688',
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
  environmentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    paddingHorizontal: 16,
    backgroundColor: '#FFF3E0',
  },
  environmentText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#555',
    marginLeft: 8,
  },
});