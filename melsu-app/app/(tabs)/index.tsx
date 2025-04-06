import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  SafeAreaView,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { router, useFocusEffect } from 'expo-router';

// Генерация списка дней для текущей недели
const generateWeekDays = () => {
  const today = new Date();
  const currentDay = today.getDay(); // 0 - воскресенье, 1 - понедельник, ...
  const dayOfWeek = currentDay === 0 ? 6 : currentDay - 1; // Преобразуем в 0 - понедельник, 6 - воскресенье

  // Получаем дату понедельника текущей недели
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek);

  // Генерируем массив дней
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);

    const dayNames = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
    const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

    days.push({
      id: i.toString(),
      date: date,
      dayShort: dayNames[i],
      dayNum: date.getDate(),
      month: monthNames[date.getMonth()],
      isToday: date.toDateString() === today.toDateString(),
      isWeekend: i >= 5,
    });
  }

  return days;
};

// Демо-данные расписания
const generateSchedule = (weekday) => {
  // Базовое расписание
  const baseSchedule = [
    {
      id: '1',
      subject: 'Математический анализ',
      type: 'Лекция',
      timeStart: '08:30',
      timeEnd: '10:05',
      teacher: 'Иванов И.И.',
      location: 'Ауд. 301',
      weekday: 0 // Понедельник
    },
    {
      id: '2',
      subject: 'Программирование',
      type: 'Практика',
      timeStart: '10:15',
      timeEnd: '11:50',
      teacher: 'Петров П.П.',
      location: 'Ауд. 215',
      weekday: 0 // Понедельник
    },
    {
      id: '3',
      subject: 'Английский язык',
      type: 'Семинар',
      timeStart: '12:00',
      timeEnd: '13:35',
      teacher: 'Сидорова С.С.',
      location: 'Ауд. 415',
      weekday: 1 // Вторник
    },
    {
      id: '4',
      subject: 'Физика',
      type: 'Лабораторная',
      timeStart: '13:50',
      timeEnd: '15:25',
      teacher: 'Николаев Н.Н.',
      location: 'Ауд. 102',
      weekday: 1 // Вторник
    },
    {
      id: '5',
      subject: 'Философия',
      type: 'Лекция',
      timeStart: '08:30',
      timeEnd: '10:05',
      teacher: 'Соколова А.В.',
      location: 'Ауд. 402',
      weekday: 2 // Среда
    },
    {
      id: '6',
      subject: 'Дискретная математика',
      type: 'Практика',
      timeStart: '10:15',
      timeEnd: '11:50',
      teacher: 'Смирнов К.Л.',
      location: 'Ауд. 308',
      weekday: 3 // Четверг
    },
    {
      id: '7',
      subject: 'Базы данных',
      type: 'Лекция',
      timeStart: '12:00',
      timeEnd: '13:35',
      teacher: 'Козлов М.А.',
      location: 'Ауд. 212',
      weekday: 3 // Четверг
    },
    {
      id: '8',
      subject: 'Физкультура',
      type: 'Практика',
      timeStart: '08:30',
      timeEnd: '10:05',
      teacher: 'Морозов Д.С.',
      location: 'Спортзал',
      weekday: 4 // Пятница
    }
  ];

  // Возвращаем расписание для нужного дня недели
  return baseSchedule.filter(item => item.weekday === parseInt(weekday));
};

export default function ScheduleScreen() {
  const { user, isAuthenticated, checkVerificationStatus } = useAuth();
  const [selectedDayIndex, setSelectedDayIndex] = useState('0'); // Понедельник по умолчанию
  const [weekDays, setWeekDays] = useState(generateWeekDays());
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Refresh verification status on focus
  useFocusEffect(
    useCallback(() => {
      if (user?.role === 'student') {
        // Check for verification status updates when screen comes into focus
        checkVerificationStatus();
      }
    }, [user])
  );

  // Получение расписания при изменении выбранного дня
  useEffect(() => {
    loadSchedule();
  }, [selectedDayIndex]);

  // Загрузка расписания (имитация API-запроса)
  const loadSchedule = () => {
    setLoading(true);

    // Имитация задержки запроса
    setTimeout(() => {
      const scheduleData = generateSchedule(selectedDayIndex);

      // Применяем поиск, если есть
      if (searchQuery) {
        const filtered = scheduleData.filter(item =>
          item.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.teacher.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.location.toLowerCase().includes(searchQuery.toLowerCase())
        );
        setSchedule(filtered);
      } else {
        setSchedule(scheduleData);
      }

      setLoading(false);
    }, 300);
  };

  // Обработка поиска
  useEffect(() => {
    if (searchQuery || searchQuery === '') {
      loadSchedule();
    }
  }, [searchQuery]);

  // Обработка кнопки обновления
  const handleRefresh = () => {
    setRefreshing(true);

    // Имитация обновления данных
    setTimeout(async () => {
      // Refresh schedule data
      loadSchedule();

      // Also check verification status if user is a student
      if (user?.role === 'student') {
        try {
          await checkVerificationStatus();
        } catch (error) {
          console.error('Error checking verification status:', error);
        }
      }

      setRefreshing(false);
    }, 1000);
  };

  // Рендер день недели
  const renderDay = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.dayItem,
        selectedDayIndex === item.id && styles.selectedDayItem,
        item.isToday && styles.todayItem,
        item.isWeekend && styles.weekendItem
      ]}
      onPress={() => setSelectedDayIndex(item.id)}
    >
      <Text
        style={[
          styles.dayName,
          selectedDayIndex === item.id && styles.selectedDayText,
          item.isToday && !selectedDayIndex && styles.todayText,
          item.isWeekend && styles.weekendText
        ]}
      >
        {item.dayShort}
      </Text>
      <Text
        style={[
          styles.dayNumber,
          selectedDayIndex === item.id && styles.selectedDayText,
          item.isToday && !selectedDayIndex && styles.todayText,
          item.isWeekend && styles.weekendText
        ]}
      >
        {item.dayNum}
      </Text>
      <Text
        style={[
          styles.monthName,
          selectedDayIndex === item.id && styles.selectedDayText,
          item.isToday && !selectedDayIndex && styles.todayText,
          item.isWeekend && styles.weekendText
        ]}
      >
        {item.month}
      </Text>
    </TouchableOpacity>
  );

  // Рендер элемента расписания
  const renderScheduleItem = ({ item }) => (
    <View style={styles.scheduleItem}>
      <View style={styles.timeColumn}>
        <Text style={styles.timeText}>{item.timeStart}</Text>
        <View style={styles.timeConnector} />
        <Text style={styles.timeText}>{item.timeEnd}</Text>
      </View>

      <View style={styles.contentColumn}>
        <View style={styles.subjectRow}>
          <Text style={styles.subjectName}>{item.subject}</Text>
          <View style={[
            styles.lessonTypeBadge,
            item.type === 'Лекция'
              ? styles.lectureType
              : item.type === 'Практика'
              ? styles.practiceType
              : item.type === 'Лабораторная'
              ? styles.labType
              : styles.seminarType
          ]}>
            <Text style={styles.lessonTypeText}>{item.type}</Text>
          </View>
        </View>

        <View style={styles.detailsContainer}>
          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={14} color="#555" />
            <Text style={styles.detailText}>{item.teacher}</Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={14} color="#555" />
            <Text style={styles.detailText}>{item.location}</Text>
          </View>
        </View>
      </View>
    </View>
  );

  // Если пользователь не авторизован, показываем сообщение
  if (!isAuthenticated) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.noAuthText}>
          Для просмотра расписания необходимо войти в систему
        </Text>
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => router.replace('/login')}
        >
          <Text style={styles.loginButtonText}>Войти</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Заголовок */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Расписание занятий</Text>
          {user?.role === 'student' && user?.group && (
            <Text style={styles.subtitle}>Группа {user.group}</Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.searchButton}
          onPress={() => setShowSearch(!showSearch)}
        >
          <Ionicons
            name={showSearch ? "close-outline" : "search-outline"}
            size={24}
            color="#333"
          />
        </TouchableOpacity>
      </View>

      {/* Строка поиска */}
      {showSearch && (
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color="#777" />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск в расписании..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              style={styles.clearSearch}
            >
              <Ionicons name="close-circle" size={18} color="#777" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Выбор дня недели */}
      <FlatList
        horizontal
        data={weekDays}
        keyExtractor={(item) => item.id}
        renderItem={renderDay}
        showsHorizontalScrollIndicator={false}
        style={styles.daysContainer}
      />

      {/* Вывод расписания */}
      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#770002" />
        </View>
      ) : (
        <FlatList
          data={schedule}
          keyExtractor={(item) => item.id}
          renderItem={renderScheduleItem}
          contentContainerStyle={styles.scheduleList}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>
                {searchQuery
                  ? 'По вашему запросу ничего не найдено'
                  : 'Нет занятий в этот день'}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#770002']}
              tintColor="#770002"
            />
          }
        />
      )}

      {/* Плашка для неверифицированных студентов */}
      {user?.role === 'student' && user?.verificationStatus !== 'verified' && (
        <TouchableOpacity
          style={[
            styles.verificationBanner,
            user?.verificationStatus === 'rejected' ? styles.rejectionBanner : null
          ]}
          onPress={() => router.push('/verification')}
        >
          <Ionicons
            name={
              user?.verificationStatus === 'pending'
                ? 'time-outline'
                : user?.verificationStatus === 'rejected'
                ? 'close-circle-outline'
                : 'shield-outline'
            }
            size={20}
            color="#fff"
          />
          <Text style={styles.verificationText}>
            {user?.verificationStatus === 'pending'
              ? 'Студенческий билет на проверке'
              : user?.verificationStatus === 'rejected'
              ? 'Верификация отклонена. Нажмите для загрузки нового фото.'
              : 'Верифицируйте студенческий билет'}
          </Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  searchButton: {
    padding: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    margin: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    paddingHorizontal: 8,
    color: '#333',
  },
  clearSearch: {
    padding: 5,
  },
  daysContainer: {
    maxHeight: 82,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  dayItem: {
    width: 60,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  selectedDayItem: {
    backgroundColor: '#770002',
    borderColor: '#770002',
  },
  todayItem: {
    borderColor: '#770002',
  },
  weekendItem: {
    backgroundColor: '#f9f9f9',
  },
  dayName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444',
  },
  dayNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginVertical: 2,
  },
  monthName: {
    fontSize: 12,
    color: '#666',
  },
  selectedDayText: {
    color: '#fff',
  },
  todayText: {
    color: '#770002',
  },
  weekendText: {
    color: '#777',
  },
  scheduleList: {
    padding: 12,
    paddingBottom: 30,
  },
  scheduleItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 12,
    overflow: 'hidden',
  },
  timeColumn: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    backgroundColor: '#f9f9f9',
    borderRightWidth: 1,
    borderColor: '#eee',
  },
  timeText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#555',
  },
  timeConnector: {
    width: 1,
    height: 25,
    backgroundColor: '#ddd',
    marginVertical: 4,
  },
  contentColumn: {
    flex: 1,
    padding: 12,
  },
  subjectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  subjectName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    marginRight: 8,
  },
  lessonTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  lectureType: {
    backgroundColor: '#E3F2FD',
  },
  practiceType: {
    backgroundColor: '#E8F5E9',
  },
  labType: {
    backgroundColor: '#FFF8E1',
  },
  seminarType: {
    backgroundColor: '#F3E5F5',
  },
  lessonTypeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  detailsContainer: {
    marginTop: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailText: {
    fontSize: 13,
    color: '#555',
    marginLeft: 6,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
    marginTop: 16,
    textAlign: 'center',
  },
  noAuthText: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    marginBottom: 20,
  },
  loginButton: {
    backgroundColor: '#770002',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  loginButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  verificationBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F57C00',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rejectionBanner: {
    backgroundColor: '#C62828',
  },
  verificationText: {
    color: '#fff',
    fontWeight: '500',
    marginLeft: 10,
  },
});