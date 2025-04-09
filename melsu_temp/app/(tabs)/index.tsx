import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  Animated,
  Dimensions,
  StatusBar,
  Platform,
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import { format, startOfWeek, endOfWeek, isToday, isSameDay, addDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { router, useFocusEffect } from 'expo-router';
import LessonDetailsModal from '../../components/LessonDetailsModal';
import apiClient from '../../src/api/apiClient';

// Get screen dimensions
const { width } = Dimensions.get('window');

// Brand colors
const COLORS = {
  primary: '#bb0000',      // Main color (burgundy)
  primaryLight: '#ff3b30', // Light variant of primary color
  primaryDark: '#8b0000',  // Dark variant of primary color
  secondary: '#333',       // Secondary color (dark gray)
  background: '#f9f9f9',   // App background
  cardBg: '#fff',          // Card background
  text: '#333',            // Main text
  textLight: '#666',       // Light text
  border: '#e0e0e0',       // Border color
  success: '#34C759',      // Success color
  warning: '#FF9500',      // Warning color
  info: '#3E7BFA',         // Info color
  highlight: '#AF52DE',    // Highlight color
  accent: '#5856D6',       // Accent color
  offline: '#FF9500',      // Offline indicator color
  // Class types colors
  lectureColor: '#3E7BFA',   // Lecture
  practiceColor: '#34C759',  // Practice
  labColor: '#FF9500',       // Lab
  seminarColor: '#AF52DE',   // Seminar
  examColor: '#FF3B30'       // Exam/Test
};

// Cache storage keys
const STORAGE_KEYS = {
  SCHEDULE_DATA: 'schedule_data',
  SCHEDULE_LAST_UPDATE: 'schedule_last_update',
  WEEK_SCHEDULE: 'week_schedule',
};

// Max cache time in minutes
const CACHE_EXPIRATION_TIME = 60; // 1 hour

// Function to check if a class is active right now (moved outside component)
const isLessonActive = (timeStart, timeEnd, lessonDate) => {
  const now = new Date();

  // If class date is not today, it can't be active
  if (!isSameDay(new Date(lessonDate), now)) {
    return false;
  }

  const startTime = new Date(`${lessonDate} ${timeStart}`);
  const endTime = new Date(`${lessonDate} ${timeEnd}`);

  return now > startTime && now < endTime;
};

export default function ScheduleScreen() {
  // Component state
  const { user, isAuthenticated, checkVerificationStatus } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedule, setSchedule] = useState([]);
  const [weekSchedule, setWeekSchedule] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Animated values for swipes and transitions
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // State for tracking swipe gestures
  const [isSwipingAllowed, setIsSwipingAllowed] = useState(true);

  // Reference for days navigation panel
  const daysScrollRef = useRef(null);

  // State for storing week days
  const [weekDays, setWeekDays] = useState([]);

  // Refresh verification status on focus
  useFocusEffect(
    useCallback(() => {
      if (user?.role === 'student') {
        // Check for verification status updates when screen comes into focus
        checkVerificationStatus();
      }
    }, [user])
  );

  // Update week days array when current date changes
  useEffect(() => {
    // Create week days array
    const days = [];
    const firstDayOfWeek = startOfWeek(currentDate, { locale: ru });

    for (let i = 0; i < 7; i++) {
      const day = addDays(firstDayOfWeek, i);
      days.push({
        date: day,
        isToday: isToday(day),
        isSelected: isSameDay(day, currentDate)
      });
    }

    setWeekDays(days);
  }, [currentDate]);

  // Initial loading on first render
  useEffect(() => {
    StatusBar.setBarStyle('dark-content');
    if (Platform.OS === 'android') {
      StatusBar.setBackgroundColor('#FFFFFF');
    }
    checkNetworkAndLoadData();
  }, []);

  // Load data when date changes
  useEffect(() => {
    // Reset animation for smooth transition
    fadeAnim.setValue(1);
    slideAnim.setValue(0);

    const formattedDate = format(currentDate, 'yyyy-MM-dd');
    if (weekSchedule[formattedDate]) {
      processSchedule(weekSchedule[formattedDate]);
    } else {
      loadScheduleForDate(formattedDate);
    }

    // Scroll to selected day in days navigation
    if (daysScrollRef.current) {
      try {
        // Determine index of selected day from start of week
        const dayIndex = currentDate.getDay();

        // Calculate scroll position based on day index and item width
        const itemWidth = 58; // dayItem width (50) + margins (8)
        const scrollPosition = dayIndex * itemWidth - 50; // Center active day

        // Use setTimeout to ensure scroll happens after rendering
        setTimeout(() => {
          daysScrollRef.current.scrollTo({
            x: Math.max(0, scrollPosition),
            animated: true
          });
        }, 100);
      } catch (error) {
        console.debug('Error scrolling to weekday:', error);
      }
    }
  }, [currentDate]);

  // Animation when changing day
  const animateViewChange = (direction) => {
    // Reset animation values before starting
    slideAnim.setValue(direction === 'next' ? 50 : -50);
    fadeAnim.setValue(0.3);

    // Start transition animation
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start();
  };

  // Check network and load data
  const checkNetworkAndLoadData = async () => {
    try {
      const networkAvailable = await isNetworkAvailable();
      console.debug('Network available:', networkAvailable);
      setIsOffline(!networkAvailable);

      if (networkAvailable) {
        // If network is available, load fresh data
        await loadWeekSchedule();
      } else {
        // If no network, try to load from local storage
        try {
          const cachedWeekSchedule = await getWeekScheduleFromStorage();
          if (cachedWeekSchedule) {
            setWeekSchedule(cachedWeekSchedule);
            const currentFormattedDate = format(currentDate, 'yyyy-MM-dd');
            processSchedule(cachedWeekSchedule[currentFormattedDate] || []);
            setIsLoading(false);
            Alert.alert(
              'Offline Mode',
              'You are working with saved data. Connect to the internet for the most up-to-date schedule.',
              [{ text: 'OK' }]
            );
          } else {
            setIsLoading(false);
            Alert.alert(
              'No Data',
              'Failed to load schedule. Please connect to the internet.',
              [{ text: 'OK' }]
            );
          }
        } catch (error) {
          console.error('Error loading data from cache:', error);
          setIsLoading(false);
        }
      }
    } catch (error) {
      console.error('Error checking network:', error);
      setIsLoading(false);
    }
  };

  // Check network availability
  const isNetworkAvailable = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return false;

      // Use timeout for faster check
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        // Use GET instead of HEAD as HEAD may not be supported
        const response = await fetch(`${apiClient.defaults.baseURL}/api/groups/`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` },
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response.ok;
      } catch (error) {
        clearTimeout(timeoutId);
        console.debug('Network test error:', error.message);
        return false;
      }
    } catch (error) {
      console.debug('Network check error:', error);
      return false;
    }
  };

  // Load weekly schedule
  const loadWeekSchedule = async () => {
    setIsLoading(true);

    try {
      // Get start and end of week
      const startDate = format(startOfWeek(currentDate, { locale: ru }), 'yyyy-MM-dd');
      const endDate = format(endOfWeek(currentDate, { locale: ru }), 'yyyy-MM-dd');

      // Check cache validity
      try {
        const lastUpdateJson = await AsyncStorage.getItem(STORAGE_KEYS.SCHEDULE_LAST_UPDATE);
        if (lastUpdateJson) {
          const lastUpdate = new Date(lastUpdateJson);
          const now = new Date();
          const minutesDiff = (now - lastUpdate) / (1000 * 60);
          const isCacheValid = minutesDiff < CACHE_EXPIRATION_TIME;

          if (isCacheValid) {
            // If cache is valid, use it
            const cachedWeekSchedule = await getWeekScheduleFromStorage();
            if (cachedWeekSchedule) {
              console.debug('Using cached week schedule');
              setWeekSchedule(cachedWeekSchedule);
              const formattedDate = format(currentDate, 'yyyy-MM-dd');
              processSchedule(cachedWeekSchedule[formattedDate] || []);
              setIsLoading(false);
              setRefreshing(false);
              return;
            }
          }
        }
      } catch (cacheError) {
        console.error('Error checking cache:', cacheError);
      }

      // If cache is not valid or doesn't exist, load data from server
      // First try to use the weekly schedule API
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        throw new Error('No authorization token');
      }

      try {
        console.debug('Loading schedule from API for week:', startDate, 'to', endDate);

        // Create array of dates to load
        const dates = [];
        let day = new Date(startOfWeek(currentDate, { locale: ru }));
        const weekEndDay = new Date(endOfWeek(currentDate, { locale: ru }));

        while (day <= weekEndDay) {
          dates.push(format(day, 'yyyy-MM-dd'));
          day = addDays(day, 1);
        }

        // Try to load schedule by days
        const newWeekSchedule = {};
        let hasData = false;

        for (const date of dates) {
          try {
            const response = await apiClient.get('/api/schedule', {
              params: { date },
              headers: { 'Authorization': `Bearer ${token}` }
            });

            newWeekSchedule[date] = response.data;
            hasData = true;
            console.debug(`Loaded schedule for ${date}, items:`, response.data.length);
          } catch (err) {
            console.debug(`Failed to load schedule for ${date}:`, err.message);
            newWeekSchedule[date] = [];
          }
        }

        if (!hasData) {
          console.debug('No data loaded for the week');
          throw new Error('No data for the selected period');
        }

        // Save data to local storage
        await saveWeekScheduleToStorage(newWeekSchedule);

        // Set data in state
        setWeekSchedule(newWeekSchedule);
        const formattedDate = format(currentDate, 'yyyy-MM-dd');
        processSchedule(newWeekSchedule[formattedDate] || []);
      } catch (error) {
        console.error('Failed to load week schedule:', error);

        // In case of error, check cache again
        const cachedWeekSchedule = await getWeekScheduleFromStorage();
        if (cachedWeekSchedule) {
          setWeekSchedule(cachedWeekSchedule);
          const formattedDate = format(currentDate, 'yyyy-MM-dd');
          processSchedule(cachedWeekSchedule[formattedDate] || []);
          setIsOffline(true);
        }
      }
    } catch (error) {
      console.error('Error in loadWeekSchedule:', error);
      setSchedule([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  // Load schedule for specific date
  const loadScheduleForDate = async (date) => {
    try {
      console.debug('Loading schedule for date:', date);

      // Load from server without connection check
      try {
        const response = await apiClient.get('/api/schedule', {
          params: { date }
        });

        const scheduleData = response.data;

        // Save to cache
        await saveScheduleDataToStorage(date, scheduleData);

        // Update weekly schedule
        setWeekSchedule(prev => ({
          ...prev,
          [date]: scheduleData
        }));

        processSchedule(scheduleData);
        setIsOffline(false);
      } catch (error) {
        console.error('Error loading schedule from API:', error);

        // Try to load from cache in case of error
        try {
          const cachedData = await getScheduleForDateFromStorage(date);

          if (cachedData) {
            processSchedule(cachedData);
            setIsOffline(true);
          } else {
            setSchedule([]);
          }
        } catch (cacheError) {
          console.error('Error loading from cache:', cacheError);
          setSchedule([]);
        }
      }
    } catch (error) {
      console.error('Error in loadScheduleForDate:', error);
      setSchedule([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Process schedule data with user filtering
  const processSchedule = (data) => {
    if (!data || !Array.isArray(data) || data.length === 0) {
      setSchedule([]);
      return;
    }

    try {
      // Log original number of classes before filtering
      console.debug(`Total classes before filtering: ${data.length}`);

      // Filter schedule based on user role
      let filteredData = [...data];

      if (user) {
        if (user.role === 'student' && user.group) {
          // For students - only their group's classes
          filteredData = filteredData.filter(item =>
            item.group_name === user.group
          );
          console.debug(`Filtered for student group ${user.group}: ${filteredData.length} classes`);
        } else if (user.role === 'teacher') {
          // For teachers - find matching by name
          const teacherFullName = user.fullName;

          // Split teacher name into parts for more flexible search
          const teacherParts = teacherFullName.toLowerCase().split(' ');
          const lastName = teacherParts[0];

          console.debug(`Searching for teacher: "${teacherFullName}", last name: "${lastName}"`);

          // More flexible filtering by teacher name
          filteredData = filteredData.filter(item => {
            // Check exact match
            if (item.teacher_name === teacherFullName) {
              return true;
            }

            // Check partial match - if teacher name contains the last name
            const lowerTeacherName = item.teacher_name.toLowerCase();
            return lowerTeacherName.includes(lastName);
          });

          console.debug(`Filtered for teacher ${teacherFullName}: ${filteredData.length} classes`);

          // If no classes after filtering, log all teacher names for debugging
          if (filteredData.length === 0) {
            const uniqueTeachers = [...new Set(data.map(item => item.teacher_name))];
            console.debug('Available teachers in schedule:', uniqueTeachers);
          }

          // Combine classes for same subject at same time for teachers
          const combinedLessons = [];
          const lessonKeys = new Map();

          filteredData.forEach(lesson => {
            // Key for combining: subject + lesson type + time + classroom
            const key = `${lesson.subject}|${lesson.lesson_type}|${lesson.time_start}|${lesson.time_end}|${lesson.auditory}`;

            if (lessonKeys.has(key)) {
              // Add group to existing lesson
              const existingLesson = lessonKeys.get(key);
              if (!existingLesson.groups) {
                existingLesson.groups = [existingLesson.group_name];
              }

              // Check that this group is not already added (avoid duplicates)
              if (!existingLesson.groups.includes(lesson.group_name)) {
                existingLesson.groups.push(lesson.group_name);
                // Update group_name for display
                existingLesson.group_name = existingLesson.groups.join(', ');
              }
            } else {
              // Create new entry with deep copy
              const newLesson = { ...lesson };
              // Initialize groups array for all lessons
              newLesson.groups = [newLesson.group_name];
              lessonKeys.set(key, newLesson);
              combinedLessons.push(newLesson);
            }
          });

          // Replace filtered data with combined
          filteredData = combinedLessons;
          console.debug(`After combining classes: ${filteredData.length} unique classes`);
        }
      }

      // Mark current class (the one happening now)
      const now = new Date();
      const today = format(now, 'yyyy-MM-dd');

      filteredData = filteredData.map(lesson => {
        const isCurrentLesson = isLessonActive(
          lesson.time_start,
          lesson.time_end,
          today
        );

        return {
          ...lesson,
          isCurrentLesson
        };
      });

      // Group classes by time
      const timeSlots = {};

      filteredData.forEach((lesson) => {
        const timeKey = `${lesson.time_start}-${lesson.time_end}`;

        if (!timeSlots[timeKey]) {
          timeSlots[timeKey] = {
            id: timeKey,
            timeStart: lesson.time_start,
            timeEnd: lesson.time_end,
            lessons: []
          };
        }

        timeSlots[timeKey].lessons.push(lesson);
      });

      // Sort by time and convert to array
      const formattedSchedule = Object.entries(timeSlots)
        .sort(([timeA], [timeB]) => timeA.localeCompare(timeB))
        .map(([_, slot]) => slot);

      setSchedule(formattedSchedule);
    } catch (error) {
      console.error('Error processing schedule data:', error);
      setSchedule([]);
    }
  };

  // Refresh on pull-down
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Load fresh data without connection check
      await loadWeekSchedule();
    } catch (error) {
      console.error('Error during refresh:', error);
      setRefreshing(false);
    }
  };

  // ======== Cache functions ========

  // Save schedule for specified date
  const saveScheduleDataToStorage = async (date, scheduleData) => {
    try {
      // Get existing data or initialize new object
      const existingDataJson = await AsyncStorage.getItem(STORAGE_KEYS.SCHEDULE_DATA);
      const scheduleStorage = existingDataJson ? JSON.parse(existingDataJson) : {};

      // Update data for specified date
      scheduleStorage[date] = scheduleData;

      // Save updated data
      await AsyncStorage.setItem(STORAGE_KEYS.SCHEDULE_DATA, JSON.stringify(scheduleStorage));

      // Update last update time
      await AsyncStorage.setItem(STORAGE_KEYS.SCHEDULE_LAST_UPDATE, new Date().toISOString());
    } catch (error) {
      console.error('Error saving schedule data:', error);
      throw error;
    }
  };

  // Save weekly schedule
  const saveWeekScheduleToStorage = async (weekData) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.WEEK_SCHEDULE, JSON.stringify(weekData));
      await AsyncStorage.setItem(STORAGE_KEYS.SCHEDULE_LAST_UPDATE, new Date().toISOString());
    } catch (error) {
      console.error('Error saving week schedule:', error);
      throw error;
    }
  };

  // Get schedule for specified date
  const getScheduleForDateFromStorage = async (date) => {
    try {
      const scheduleDataJson = await AsyncStorage.getItem(STORAGE_KEYS.SCHEDULE_DATA);
      if (!scheduleDataJson) return null;

      const scheduleData = JSON.parse(scheduleDataJson);
      return scheduleData[date] || null;
    } catch (error) {
      console.error('Error getting schedule for date:', error);
      return null;
    }
  };

  // Get weekly schedule
  const getWeekScheduleFromStorage = async () => {
    try {
      const weekScheduleJson = await AsyncStorage.getItem(STORAGE_KEYS.WEEK_SCHEDULE);
      return weekScheduleJson ? JSON.parse(weekScheduleJson) : null;
    } catch (error) {
      console.error('Error getting week schedule:', error);
      return null;
    }
  };

  // Clear schedule cache
  const clearCache = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.SCHEDULE_DATA);
      await AsyncStorage.removeItem(STORAGE_KEYS.WEEK_SCHEDULE);
      await AsyncStorage.removeItem(STORAGE_KEYS.SCHEDULE_LAST_UPDATE);
      console.debug('Cache cleared');
    } catch (error) {
      console.error('Error clearing cache:', error);
      throw error;
    }
  };

  // Handle class selection for viewing details
  const handleLessonSelect = (lesson) => {
    setSelectedLesson(lesson);
    setModalVisible(true);
  };

  // Close modal
  const handleModalClose = () => {
    setModalVisible(false);
    setTimeout(() => {
      setSelectedLesson(null);
    }, 300);
  };

  // Weekday selection handler
  const handleDaySelect = useCallback((selectedDay) => {
    if (!isSameDay(selectedDay.date, currentDate)) {
      const direction = selectedDay.date > currentDate ? 'next' : 'prev';
      animateViewChange(direction);
      setTimeout(() => setCurrentDate(selectedDay.date), 150);
    }
  }, [currentDate, animateViewChange]);

  // Day navigation with animation
  const goToNextDay = () => {
    if (!isSwipingAllowed) return;

    setIsSwipingAllowed(false);
    animateViewChange('next');

    // Reset animation before changing date
    slideAnim.setValue(0);

    setTimeout(() => {
      setCurrentDate((prev) => addDays(prev, 1));
      setIsSwipingAllowed(true);
    }, 150);
  };

  const goToPrevDay = () => {
    if (!isSwipingAllowed) return;

    setIsSwipingAllowed(false);
    animateViewChange('prev');

    // Reset animation before changing date
    slideAnim.setValue(0);

    setTimeout(() => {
      setCurrentDate((prev) => addDays(prev, -1));
      setIsSwipingAllowed(true);
    }, 150);
  };

  const goToToday = () => {
    if (isToday(currentDate)) return;

    const direction = currentDate > new Date() ? 'prev' : 'next';
    animateViewChange(direction);

    // Reset animation before changing date
    slideAnim.setValue(0);

    setTimeout(() => {
      setCurrentDate(new Date());
    }, 150);
  };

  // Horizontal swipe handler
  const onSwipeHandler = ({ nativeEvent }) => {
    // Check that swipe is long enough (more than 50px)
    if (Math.abs(nativeEvent.translationX) > 50 && isSwipingAllowed) {
      if (nativeEvent.translationX > 0) {
        // Swipe right -> previous day
        goToPrevDay();
      } else {
        // Swipe left -> next day
        goToNextDay();
      }
    }
  };

  // Get color for class type
  const getLessonTypeColor = (type) => {
    if (!type) return COLORS.accent;

    const lowerType = type.toLowerCase();

    if (lowerType.includes('л.') || lowerType.includes('лекция')) {
      return COLORS.lectureColor;
    } else if (lowerType.includes('пр.') || lowerType.includes('практическое')) {
      return COLORS.practiceColor;
    } else if (lowerType.includes('лаб.')) {
      return COLORS.labColor;
    } else if (lowerType.includes('семинар')) {
      return COLORS.seminarColor;
    } else if (lowerType.includes('экзамен') || lowerType.includes('зач.') || lowerType.includes('зачет')) {
      return COLORS.examColor;
    }

    return COLORS.accent;
  };

  // Format time (add 0 before single digits)
  const formatTime = (time) => {
    if (!time) return '';

    // Check that time is in HH:MM format
    const parts = time.split(':');
    if (parts.length !== 2) return time;

    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  };

  // Loading component
  const renderLoading = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={styles.loadingText}>Loading schedule...</Text>
    </View>
  );

  // "No data" component
  const renderEmptyList = () => (
    <Animated.View style={[styles.emptyContainer, { opacity: fadeAnim }]}>
      <Ionicons
        name={isOffline ? "wifi-outline" : "calendar-outline"}
        size={60}
        color="#c0c0c0"
      />
      <Text style={styles.emptyText}>
        {isOffline && (!weekSchedule || !weekSchedule[format(currentDate, 'yyyy-MM-dd')])
          ? "No saved data for this date"
          : user?.role === 'student'
            ? "No classes for this day"
            : "You have no classes for this day"}
      </Text>
      <Text style={styles.emptySubText}>
        {isOffline
          ? "Connect to the internet to load schedule"
          : "Enjoy your free time!"}
      </Text>

      {!isOffline && (
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={onRefresh}
        >
          <Ionicons name="refresh-outline" size={16} color="#fff" style={styles.refreshIcon} />
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );

  // If user is not authenticated, show a message
  if (!isAuthenticated) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.noAuthText}>
          You need to log in to view your schedule
        </Text>
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => router.replace('/login')}
        >
          <Text style={styles.loginButtonText}>Log In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Main render component
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

        {/* Screen title and offline indicator */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Schedule</Text>
          {isOffline && (
            <View style={styles.offlineIndicator}>
              <Ionicons name="wifi-outline" size={12} color="#FFFFFF" />
              <Text style={styles.offlineText}>Offline</Text>
            </View>
          )}
        </View>

        {/* Week days navigation - replace FlatList with ScrollView */}
        <View style={styles.weekDaysContainer}>
          <ScrollView
            ref={daysScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.weekDaysContent}
          >
            {weekDays.map((item) => (
              <TouchableOpacity
                key={format(item.date, 'yyyy-MM-dd')}
                style={[
                  styles.dayItem,
                  item.isSelected && styles.selectedDayItem,
                  item.isToday && !item.isSelected && styles.todayDayItem
                ]}
                onPress={() => handleDaySelect(item)}
              >
                <Text style={[
                  styles.dayName,
                  item.isSelected ? styles.selectedDayText : (item.isToday ? styles.todayDayText : {})
                ]}>
                  {format(item.date, 'EE', { locale: ru }).toUpperCase()}
                </Text>
                <Text style={[
                  styles.dayNumber,
                  item.isSelected ? styles.selectedDayText : (item.isToday ? styles.todayDayText : {})
                ]}>
                  {format(item.date, 'd')}
                </Text>
                {item.isToday && !item.isSelected && <View style={styles.todayIndicator} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Current date and navigation buttons */}
        <View style={styles.dateNavigation}>
          <TouchableOpacity
            style={styles.navButton}
            onPress={goToPrevDay}
            disabled={!isSwipingAllowed}
          >
            <Ionicons name="chevron-back" size={18} color={COLORS.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dateButton}
            onPress={goToToday}
            disabled={isToday(currentDate)}
          >
            <Text style={styles.dateText}>
              {format(currentDate, 'd MMMM', { locale: ru })}
            </Text>
            {!isToday(currentDate) && (
              <Text style={styles.todayButtonText}>today</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navButton}
            onPress={goToNextDay}
            disabled={!isSwipingAllowed}
          >
            <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Schedule content with swipe support - replace FlatList with ScrollView */}
        <PanGestureHandler
          onEnded={onSwipeHandler}
          enabled={isSwipingAllowed && !isLoading && !refreshing}
        >
          <View style={styles.scheduleContainer}>
            {isLoading ? (
              renderLoading()
            ) : schedule.length === 0 ? (
              renderEmptyList()
            ) : (
              <ScrollView
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor={COLORS.primary}
                    colors={[COLORS.primary]}
                  />
                }
              >
                {schedule.map((timeSlot, index) => {
                  // Check if class is active now
                  const today = format(new Date(), 'yyyy-MM-dd');
                  const isActive =
                    timeSlot.lessons.some(l => l.isCurrentLesson) ||
                    isLessonActive(timeSlot.timeStart, timeSlot.timeEnd, today);

                  return (
                    <Animated.View
                      key={timeSlot.id || `time-${index}`}
                      style={[
                        styles.lessonCard,
                        isActive && styles.activeLesson,
                        {
                          transform: [{ translateX: slideAnim }],
                          opacity: fadeAnim
                        }
                      ]}
                    >
                      <View style={styles.timeContainer}>
                        <Text style={[styles.timeText, isActive && styles.activeTimeText]}>
                          {formatTime(timeSlot.timeStart)}
                        </Text>
                        <View style={styles.timeConnector}>
                          <View style={[styles.timeLine, isActive && styles.activeTimeLine]} />
                          <View style={[styles.timeCircle, isActive && styles.activeTimeCircle]} />
                          <View style={[styles.timeLine, isActive && styles.activeTimeLine]} />
                        </View>
                        <Text style={[styles.timeText, isActive && styles.activeTimeText]}>
                          {formatTime(timeSlot.timeEnd)}
                        </Text>
                        {isActive && <View style={styles.activeIndicator} />}
                      </View>
                      <View style={styles.lessonsContainer}>
                        {timeSlot.lessons.map((lesson, lessonIndex) => (
                          <View key={`${lesson.id || lessonIndex}-${lessonIndex}`}>
                            {lessonIndex > 0 && <View style={styles.divider} />}
                            <TouchableOpacity
                              style={styles.lessonInfo}
                              onPress={() => handleLessonSelect(lesson)}
                              activeOpacity={0.7}
                            >
                              <View style={styles.lessonHeader}>
                                <Text
                                  style={[styles.subjectText, isActive && styles.activeSubjectText]}
                                  numberOfLines={1}
                                  ellipsizeMode="tail"
                                >
                                  {lesson.subject}
                                </Text>
                                <View
                                  style={[
                                    styles.lessonTypeBadge,
                                    { backgroundColor: getLessonTypeColor(lesson.lesson_type) }
                                  ]}
                                >
                                  <Text style={styles.lessonTypeText}>{lesson.lesson_type}</Text>
                                </View>
                              </View>
                              <Text style={styles.detailsText}>
                                {lesson.auditory}
                                {lesson.subgroup > 0 && ` • Subgroup ${lesson.subgroup}`}
                              </Text>
                              {user?.role === 'student' ? (
                                <Text style={styles.teacherText}>
                                  {lesson.teacher_name}
                                </Text>
                              ) : (
                                <Text
                                  style={styles.groupsText}
                                  numberOfLines={2}
                                  ellipsizeMode="tail"
                                >
                                  {lesson.groups && lesson.groups.length > 1
                                    ? `Groups: ${lesson.group_name}`
                                    : `Group: ${lesson.group_name}`}
                                </Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    </Animated.View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </PanGestureHandler>

        {/* Banner for unverified students */}
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
                ? 'Student ID is being verified'
                : user?.verificationStatus === 'rejected'
                ? 'Verification rejected. Tap to upload a new photo.'
                : 'Verify your student ID'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Lesson details modal */}
        <LessonDetailsModal
          visible={modalVisible}
          lesson={selectedLesson}
          onClose={handleModalClose}
          userType={user?.role}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

// Component styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  weekDaysContainer: {
    backgroundColor: COLORS.cardBg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  weekDaysContent: {
    paddingHorizontal: 8,
  },
  dayItem: {
    width: 50,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  selectedDayItem: {
    backgroundColor: COLORS.primary,
    // Removed border for selected day to avoid double highlighting
  },
  todayDayItem: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: '#f0f0f0', // Explicitly set standard background
  },
  dayName: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textLight,
    marginBottom: 4,
  },
  dayNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  selectedDayText: {
    color: '#FFFFFF', // White text on selected day (red background)
  },
  todayDayText: {
    color: COLORS.primary, // Red text for current day (if not selected)
  },
  todayIndicator: {
    position: 'absolute',
    bottom: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
  selectedTodayIndicator: {
    backgroundColor: '#FFFFFF', // White indicator on red background
  },
  dateNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateButton: {
    alignItems: 'center',
    padding: 8,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    textTransform: 'capitalize',
  },
  todayButtonText: {
    fontSize: 12,
    color: COLORS.primary,
    marginTop: 2,
  },
  offlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.offline,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 10,
  },
  offlineText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '500',
    marginLeft: 4,
  },
  scheduleContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  lessonCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    marginBottom: 14,
    flexDirection: 'row',
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  activeLesson: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    backgroundColor: '#FFF8F8',
  },
  timeContainer: {
    width: 60,
    marginRight: 16,
    alignItems: 'center',
    position: 'relative',
  },
  timeText: {
    fontSize: 14,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  activeTimeText: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  timeConnector: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  timeLine: {
    width: 1,
    height: 15,
    backgroundColor: '#d0d0d0',
  },
  activeTimeLine: {
    backgroundColor: COLORS.primary,
  },
  timeCircle: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#d0d0d0',
    margin: 1,
  },
  activeTimeCircle: {
    backgroundColor: COLORS.primary,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  activeIndicator: {
    position: 'absolute',
    right: -8,
    top: '50%',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginTop: -4,
  },
  lessonsContainer: {
    flex: 1,
  },
  lessonInfo: {
    flex: 1,
    paddingVertical: 4,
  },
  lessonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  subjectText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
    marginRight: 10,
  },
  activeSubjectText: {
    color: COLORS.primary,
  },
  lessonTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  lessonTypeText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 10,
  },
  detailsText: {
    fontSize: 14,
    color: COLORS.textLight,
    marginBottom: 4,
    lineHeight: 18,
  },
  teacherText: {
    fontSize: 14,
    color: COLORS.info,
    fontWeight: '500',
  },
  groupsText: {
    fontSize: 14,
    color: COLORS.warning,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.textLight,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    color: COLORS.text,
    fontWeight: '600',
    marginTop: 24,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  emptySubText: {
    fontSize: 15,
    color: COLORS.textLight,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 50,
    marginBottom: 24,
  },
  refreshButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
  },
  refreshIcon: {
    marginRight: 8,
  },
  refreshText: {
    color: '#fff',
    fontWeight: '500',
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