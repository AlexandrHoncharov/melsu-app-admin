// utils/backgroundNotificationHandler.ts
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';

// Имя задачи для фоновой обработки уведомлений
const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK';

// Регистрация задачи для обработки уведомлений в фоновом режиме
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, ({ data, error }) => {
  if (error) {
    console.error('Ошибка фоновой задачи для уведомлений:', error);
    return;
  }

  // Данные уведомления
  const notification = data.notification as Notifications.Notification;
  console.log('Получено фоновое уведомление:', notification);

  // Обработка уведомления в зависимости от его содержимого
  if (notification.request.content.data) {
    const notificationData = notification.request.content.data;

    // Различные типы уведомлений в вашем приложении
    if (notificationData.type === 'chat') {
      console.log('Получено новое сообщение в чате');
      // Тут можно обновить количество непрочитанных сообщений или выполнить другие действия
    } else if (notificationData.type === 'schedule') {
      console.log('Обновление расписания');
      // Может быть логика для обновления кеша расписания
    } else if (notificationData.type === 'ticket') {
      console.log('Обновление тикета');
      // Логика для обновления статуса тикетов
    } else if (notificationData.type === 'news') {
      console.log('Новая новость');
      // Логика для уведомлений о новостях
    }
  }
});

// Функция для регистрации обработчика фоновых уведомлений
export async function registerBackgroundNotificationHandler() {
  // Регистрируем обработчик для приема уведомлений в фоновом режиме
  await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);

  // Для Android настраиваем каналы уведомлений
  if (Platform.OS === 'android') {
    await setupNotificationChannels();
  }

  console.log('Фоновый обработчик уведомлений зарегистрирован');
  return true;
}

// Настройка каналов уведомлений для Android
async function setupNotificationChannels() {
  // Основной канал уведомлений (для общих уведомлений)
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Основные уведомления',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#770002', // Цвет в соответствии с брендом
    sound: 'default',
    enableVibrate: true,
    description: 'Общие уведомления от приложения'
  });

  // Канал для сообщений чата
  await Notifications.setNotificationChannelAsync('chat', {
    name: 'Сообщения чата',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 100, 100, 100],
    lightColor: '#0066FF',
    enableVibrate: true,
    sound: 'default',
    description: 'Уведомления о новых сообщениях в чатах'
  });

  // Канал для обновлений расписания
  await Notifications.setNotificationChannelAsync('schedule', {
    name: 'Расписание',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 50, 100, 50],
    lightColor: '#4CAF50',
    enableVibrate: true,
    description: 'Уведомления об изменениях в расписании'
  });

  // Канал для тикетов
  await Notifications.setNotificationChannelAsync('tickets', {
    name: 'Тикеты',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 75, 75, 75],
    lightColor: '#770002',
    enableVibrate: true,
    description: 'Уведомления об обновлениях тикетов'
  });

  // Канал для новостей и анонсов
  await Notifications.setNotificationChannelAsync('news', {
    name: 'Новости и анонсы',
    importance: Notifications.AndroidImportance.LOW,
    enableVibrate: false,
    description: 'Уведомления о новостях и анонсах университета'
  });

  console.log('Каналы уведомлений Android настроены');
}

// Вспомогательная функция для определения канала уведомления по типу
export function getNotificationChannelForType(type: string): string {
  switch (type) {
    case 'chat':
      return 'chat';
    case 'schedule':
      return 'schedule';
    case 'ticket':
      return 'tickets';
    case 'news':
      return 'news';
    default:
      return 'default';
  }
}