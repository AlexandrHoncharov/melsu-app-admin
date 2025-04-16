import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { usePushNotifications } from '../hooks/usePushNotifications';
import userApi from '../api/userApi';

const TestNotificationsScreen = () => {
  const { expoPushToken, tokenRegistered, sendTestNotification, getNotificationStatus } = usePushNotifications();
  const [notificationStatus, setNotificationStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [logs, setLogs] = useState([]);

  // Проверка статуса уведомлений при загрузке экрана
  useEffect(() => {
    checkStatus();
  }, []);

  // Функция для проверки статуса уведомлений
  const checkStatus = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      const status = await getNotificationStatus();
      setNotificationStatus(status);

      addLog(`Статус уведомлений: ${status.enabled ? 'Включены' : 'Отключены'}`);
      addLog(`Тип токена: ${status.tokenType}`);
      addLog(`Токен зарегистрирован: ${status.tokenRegistered ? 'Да' : 'Нет'}`);

      if (status.token) {
        addLog(`Токен: ${status.token.substring(0, 15)}...`);
      } else {
        addLog('Токен отсутствует');
      }
    } catch (error) {
      setErrorMessage(error.message);
      addLog(`Ошибка: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Функция для отправки тестового уведомления
  const handleSendTest = async () => {
    try {
      setLoading(true);
      addLog('Отправка тестового уведомления...');

      const result = await sendTestNotification();

      addLog(`Результат: ${result.message}`);
      if (result.results) {
        result.results.forEach(r => {
          addLog(`- ${r.device_name || 'Устройство'}: ${r.success ? 'Успешно' : 'Ошибка'}`);
        });
      }

      Alert.alert('Уведомление отправлено', 'Проверьте, пришло ли уведомление на устройство');
    } catch (error) {
      setErrorMessage(error.message);
      addLog(`Ошибка отправки: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Ручная регистрация токена
  const handleRegisterToken = async () => {
    if (!expoPushToken) {
      addLog('Нет токена для регистрации');
      return;
    }

    try {
      setLoading(true);
      addLog(`Ручная регистрация токена: ${expoPushToken.substring(0, 15)}...`);

      const result = await userApi.registerDeviceToken({
        token: expoPushToken,
        platform: Platform.OS,
        device_name: Device.modelName || 'Тестовое устройство'
      });

      addLog(`Результат регистрации: ${result.message || 'Успешно'}`);
      Alert.alert('Регистрация', 'Токен успешно зарегистрирован');
    } catch (error) {
      setErrorMessage(error.message);
      addLog(`Ошибка регистрации: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Копирование токена в буфер обмена
  const copyTokenToClipboard = async () => {
    if (notificationStatus?.token) {
      await Clipboard.setStringAsync(notificationStatus.token);
      Alert.alert('Скопировано', 'Токен скопирован в буфер обмена');
    }
  };

  // Добавление сообщения в лог
  const addLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prevLogs => [`[${timestamp}] ${message}`, ...prevLogs]);
  };

  // Очистка логов
  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Тестирование Push-уведомлений</Text>

      {errorMessage && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      <View style={styles.infoContainer}>
        <Text style={styles.infoTitle}>Информация о токене:</Text>
        <Text>Статус: {loading ? 'Загрузка...' : (notificationStatus?.enabled ? 'Разрешены' : 'Заблокированы')}</Text>
        <Text>Тип токена: {notificationStatus?.tokenType || 'Неизвестно'}</Text>
        <Text>Зарегистрирован: {tokenRegistered ? 'Да' : 'Нет'}</Text>

        {notificationStatus?.token && (
          <View style={styles.tokenContainer}>
            <Text numberOfLines={1} ellipsizeMode="middle" style={styles.tokenText}>
              {notificationStatus.token}
            </Text>
            <TouchableOpacity onPress={copyTokenToClipboard} style={styles.copyButton}>
              <Text style={styles.copyButtonText}>Копировать</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.buttonsContainer}>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={checkStatus}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Проверить статус</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, (loading || !tokenRegistered) && styles.buttonDisabled]}
          onPress={handleSendTest}
          disabled={loading || !tokenRegistered}
        >
          <Text style={styles.buttonText}>Отправить тест</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, (loading || !expoPushToken) && styles.buttonDisabled]}
          onPress={handleRegisterToken}
          disabled={loading || !expoPushToken}
        >
          <Text style={styles.buttonText}>Принудительная регистрация</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.logsContainer}>
        <View style={styles.logsHeader}>
          <Text style={styles.logsTitle}>Журнал событий</Text>
          <TouchableOpacity onPress={clearLogs} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>Очистить</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.logs}>
          {logs.map((log, index) => (
            <Text key={index} style={styles.logItem}>{log}</Text>
          ))}
          {logs.length === 0 && (
            <Text style={styles.emptyLogs}>Действий пока не было</Text>
          )}
        </ScrollView>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 10,
    borderRadius: 4,
    marginBottom: 16,
  },
  errorText: {
    color: '#c62828',
  },
  infoContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  tokenContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#f5f5f5',
    padding: 8,
    borderRadius: 4,
  },
  tokenText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  copyButton: {
    backgroundColor: '#e0e0e0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  copyButtonText: {
    fontSize: 12,
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#770002',
    padding: 10,
    borderRadius: 4,
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#aaa',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  logsContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    elevation: 2,
    flex: 1,
    maxHeight: 300,
  },
  logsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  clearButton: {
    backgroundColor: '#e0e0e0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  clearButtonText: {
    fontSize: 12,
  },
  logs: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    padding: 8,
    borderRadius: 4,
  },
  logItem: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  emptyLogs: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#9e9e9e',
    textAlign: 'center',
    marginTop: 16,
  },
});

export default TestNotificationsScreen;