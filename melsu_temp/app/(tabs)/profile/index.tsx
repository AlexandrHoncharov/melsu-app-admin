// File: melsu_temp/app/(tabs)/profile/index.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
  Platform,
  StatusBar,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../hooks/useAuth';
import { router } from 'expo-router';

const { width } = Dimensions.get('window');

// Menu item type definition
interface MenuItem {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  iconBgColor: string;
  iconColor: string;
  route: string;
}

export default function ProfileScreen() {
  const { user: originalUser, isLoading, logout, refreshUserProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [courseFromApi, setCourseFromApi] = useState(null);

  // Проверка и нормализация данных пользователя
  const checkUserData = (user) => {
    if (!user) return null;

    // Создаем копию объекта пользователя
    const normalizedUser = {...user};

    // Проверяем, существует ли объект speciality
    if (!normalizedUser.speciality) {
      // Если объект speciality отсутствует, но есть необходимые поля в корне объекта,
      // создаем объект speciality на основе этих полей
      const hasSpecialityData = user.speciality_code || user.speciality_name ||
                               user.speciality_id || user.study_form || user.study_form_name;

      if (hasSpecialityData) {
        normalizedUser.speciality = {
          id: user.speciality_id,
          code: user.speciality_code,
          name: user.speciality_name,
          form: user.study_form,
          formName: user.study_form_name
        };

        console.log("Created speciality object from user data:", normalizedUser.speciality);
      }
    }

    return normalizedUser;
  };

  // Нормализуем данные пользователя
  const user = checkUserData(originalUser);

  // Profile refresh handler
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshUserProfile();
      // Повторно запрашиваем полный профиль после обновления
      // Если есть отдельная функция для повторного запроса профиля, можно вызвать её здесь
    } catch (error) {
      console.error('Error refreshing profile:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Logout handler with confirmation
  const handleLogout = () => {
    Alert.alert(
      'Выход из аккаунта',
      'Вы уверены, что хотите выйти?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Выйти',
          style: 'destructive',
          onPress: () => {
            logout()
              .catch(err => {
                console.error('Error during logout:', err);
                Alert.alert('Ошибка', 'Не удалось выйти из аккаунта');
              });
          }
        }
      ]
    );
  };

  // Helper function to get the right role text in Russian
  const getRoleText = (role) => {
    switch(role) {
      case 'student': return 'Студент';
      case 'teacher': return 'Преподаватель';
      case 'admin': return 'Администратор';
      default: return 'Пользователь';
    }
  };

  // Helper function to get verification status info
  const getVerificationInfo = (status) => {
    switch(status) {
      case 'verified':
        return {
          text: 'Аккаунт верифицирован',
          icon: "shield-checkmark",
          color: "#34C759",
          bgColor: "#F0FFF4"
        };
      case 'pending':
        return {
          text: 'Верификация на рассмотрении',
          icon: "time",
          color: "#FF9500",
          bgColor: "#FFF9F0"
        };
      case 'rejected':
        return {
          text: 'Верификация отклонена',
          icon: "close-circle",
          color: "#FF3B30",
          bgColor: "#FFF0F0"
        };
      default:
        return {
          text: 'Требуется верификация',
          icon: "shield",
          color: "#8E8E93",
          bgColor: "#F6F6F6"
        };
    }
  };

  // Helper function to get the form name
  const getFormName = (user) => {
    if (user?.speciality?.formName) {
      return user.speciality.formName;
    }

    // Fallback: determine from group
    if (user?.group && user.group.length >= 4) {
      const formDigit = user.group.charAt(3);
      switch (formDigit) {
        case '1': return 'Очная';
        case '2': return 'Очно-заочная';
        case '3': return 'Заочная';
        default: return '';
      }
    }

    return '';
  };

  // Здесь должен быть API запрос для получения курса из расписания
  // Это нужно реализовать на бэкенде
  const getCourseFromSchedule = async (group) => {
    // Эту функцию нужно будет реализовать через API
    // Примерная логика: запрос к API на получение первой записи расписания для группы
    // и извлечение из неё поля course
    /*
    try {
      const response = await fetch(`/api/schedule/course?group=${group}`);
      const data = await response.json();
      if (data.course) {
        return `${data.course}-й курс`;
      }
      return null;
    } catch (error) {
      console.error('Error fetching course from schedule:', error);
      return null;
    }
    */

    // Временное решение для демонстрации
    return null;
  };

  // Prepare menu items
  const getMenuItems = (): MenuItem[] => {
    // Common items for all users
    const commonItems: MenuItem[] = [
      {
        id: 'password',
        title: 'Изменение пароля',
        subtitle: 'Обновите пароль учетной записи',
        icon: 'key-outline',
        iconBgColor: '#E3F2FD',
        iconColor: '#1976D2',
        route: '/profile/change-password'
      },
      {
        id: 'edit',
        title: 'Редактировать профиль',
        subtitle: 'Обновите личную информацию',
        icon: 'person-outline',
        iconBgColor: '#E8F5E9',
        iconColor: '#43A047',
        route: '/profile/edit'
      },
      {
        id: 'notifications',
        title: 'Уведомления',
        subtitle: 'Настройте параметры уведомлений',
        icon: 'notifications-outline',
        iconBgColor: '#FFF8E1',
        iconColor: '#FFC107',
        route: '/notification-settings'
      },
      {
        id: 'support',
        title: 'Поддержка',
        subtitle: 'Получите помощь по использованию',
        icon: 'help-buoy-outline',
        iconBgColor: '#FFF3E0',
        iconColor: '#F57C00',
        route: '/support'
      },
      {
        id: 'about',
        title: 'О приложении',
        subtitle: 'Информация о приложении',
        icon: 'information-circle-outline',
        iconBgColor: '#E8EAF6',
        iconColor: '#3F51B5',
        route: '/about'
      }
    ];

    // Add verification item for students
    if (user?.role === 'student') {
      const verificationInfo = getVerificationInfo(user.verificationStatus);

      commonItems.splice(2, 0, {
        id: 'verification',
        title: 'Верификация студента',
        subtitle: verificationInfo.text,
        icon: verificationInfo.icon,
        iconBgColor: verificationInfo.bgColor,
        iconColor: verificationInfo.color,
        route: '/verification'
      });
    }

    return commonItems;
  };

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#bb0000" />
        <Text style={styles.loadingText}>Загрузка профиля...</Text>
      </View>
    );
  }

  // If user is not logged in, redirect to login
  if (!user) {
    router.replace('/login');
    return null;
  }

  // Get first letter for avatar
  const avatarLetter = user.fullName
    ? user.fullName.charAt(0).toUpperCase()
    : user.username.charAt(0).toUpperCase();

  // Get verification info
  const verificationInfo = getVerificationInfo(user.verificationStatus);

  const [course, setCourse] = useState(null);

  // Отладочная информация для проверки данных пользователя
  useEffect(() => {
    if (originalUser) {
      console.log("Original user data:", originalUser);
      console.log("Normalized user data:", user);
      console.log("Speciality data:", user?.speciality);
      console.log("Course data:", course);
      console.log("Course from API:", courseFromApi);
    }
  }, [originalUser, user, course, courseFromApi]);

  // Временная заглушка для демонстрации
  const tempCourse = user?.role === 'student' ? '3-й курс' : null;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#bb0000']}
            tintColor="#bb0000"
          />
        }
      >
        {/* Header section with avatar and name */}
        <View style={styles.header}>
          <View style={styles.avatarSection}>
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>{avatarLetter}</Text>
            </View>
          </View>

          <View style={styles.nameSection}>
            <Text style={styles.nameText} numberOfLines={2} ellipsizeMode="tail">{user.fullName || user.username}</Text>
            <View style={styles.roleBadge}>
              <Ionicons
                name={user.role === 'student' ? 'school-outline' : 'briefcase-outline'}
                size={14}
                color="#fff"
              />
              <Text style={styles.roleText}>{getRoleText(user.role)}</Text>
            </View>
          </View>
        </View>

        {/* User Information Card */}
        <View style={styles.userInfoCard}>
          <Text style={styles.cardTitle}>Персональная информация</Text>

          {/* Student information */}
          {user.role === 'student' && (
            <View style={styles.infoContent}>
              {/* Group and year */}
              {user.group && (
                <View style={styles.infoRow}>
                  <View style={styles.infoLabelContainer}>
                    <Ionicons name="people-outline" size={18} color="#555" />
                    <Text style={styles.infoLabel}>Группа</Text>
                  </View>
                  <View style={styles.infoValueContainer}>
                    <Text style={styles.infoValue}>{user.group}</Text>
                    {course && (
                      <View style={styles.yearBadge}>
                        <Ionicons name="calendar-outline" size={12} color="#1976D2" style={{marginRight: 4}} />
                        <Text style={styles.yearText}>{course}</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Faculty */}
              {user.faculty && (
                <View style={styles.infoRow}>
                  <View style={styles.infoLabelContainer}>
                    <Ionicons name="business-outline" size={18} color="#555" />
                    <Text style={styles.infoLabel}>Факультет</Text>
                  </View>
                  <View style={styles.infoValueWrap}>
                    <Text style={styles.infoValue} numberOfLines={2} ellipsizeMode="tail">{user.faculty}</Text>
                  </View>
                </View>
              )}

              {/* Removed Speciality code as it's now shown in the speciality section */}

              {/* Study form */}
              {getFormName(user) && (
                <View style={styles.infoRow}>
                  <View style={styles.infoLabelContainer}>
                    <Ionicons name="time-outline" size={18} color="#555" />
                    <Text style={styles.infoLabel}>Форма обучения</Text>
                  </View>
                  <Text style={styles.infoValue}>{getFormName(user)}</Text>
                </View>
              )}

              {/* Speciality name - проверка на наличие данных специальности */}
              <View style={styles.specialitySection}>
                <View style={styles.specialityHeader}>
                  <Ionicons name="school-outline" size={18} color="#555" />
                  <Text style={styles.specialityLabel}>Направление подготовки</Text>
                </View>

                {user && user.speciality && (user.speciality.name || user.speciality.code) ? (
                  <View style={styles.specialityContent}>
                    {user.speciality.code && (
                      <View style={styles.codeContainer}>
                        <Text style={styles.codeLabel}>Код:</Text>
                        <Text style={styles.codeValue}>{user.speciality.code}</Text>
                      </View>
                    )}
                    {user.speciality.name && (
                      <Text style={styles.specialityValue}>{user.speciality.name}</Text>
                    )}
                  </View>
                ) : (
                  <View style={styles.specialityContent}>
                    <Text style={styles.emptySpeciality}>
                      Информация о направлении подготовки отсутствует
                    </Text>
                  </View>
                )}
              </View>

              {/* Verification status */}
              <TouchableOpacity
                style={[styles.verificationRow, { backgroundColor: verificationInfo.bgColor }]}
                onPress={() => router.push('/verification')}
              >
                <View style={styles.verificationInfo}>
                  <Ionicons name={verificationInfo.icon} size={20} color={verificationInfo.color} />
                  <Text style={[styles.verificationText, { color: verificationInfo.color }]}>
                    {verificationInfo.text}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={verificationInfo.color} />
              </TouchableOpacity>
            </View>
          )}

          {/* Teacher information */}
          {user.role === 'teacher' && (
            <View style={styles.infoContent}>
              {/* Position */}
              {user.position && (
                <View style={styles.infoRow}>
                  <View style={styles.infoLabelContainer}>
                    <Ionicons name="briefcase-outline" size={18} color="#555" />
                    <Text style={styles.infoLabel}>Должность</Text>
                  </View>
                  <View style={styles.infoValueWrap}>
                    <Text style={styles.infoValue} numberOfLines={2} ellipsizeMode="tail">{user.position}</Text>
                  </View>
                </View>
              )}

              {/* Department */}
              {user.department && (
                <View style={styles.departmentSection}>
                  <View style={styles.departmentHeader}>
                    <Ionicons name="business-outline" size={18} color="#555" />
                    <Text style={styles.departmentLabel}>Кафедра</Text>
                  </View>
                  <View style={styles.departmentContent}>
                    <Text style={styles.departmentValue}>{user.department}</Text>
                  </View>
                </View>
              )}

              {/* Faculty */}
              {user.faculty && (
                <View style={styles.infoRow}>
                  <View style={styles.infoLabelContainer}>
                    <Ionicons name="school-outline" size={18} color="#555" />
                    <Text style={styles.infoLabel}>Факультет</Text>
                  </View>
                  <View style={styles.infoValueWrap}>
                    <Text style={styles.infoValue} numberOfLines={2} ellipsizeMode="tail">{user.faculty}</Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Menu Grid */}
        <View style={styles.menuGrid}>
          {getMenuItems().map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.menuItem}
              onPress={() => router.push(item.route)}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: item.iconBgColor }]}>
                <Ionicons name={item.icon} size={24} color={item.iconColor} />
              </View>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={20} color="#FFF" />
          <Text style={styles.logoutText}>Выйти из аккаунта</Text>
        </TouchableOpacity>

        {/* Footer Info */}
        <View style={styles.footerInfo}>
          <Text style={styles.usernameText}>Логин: {user.username}</Text>
          <Text style={styles.versionText}>Версия приложения 1.0.0</Text>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 30,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f7fa',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },

  // Header styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarSection: {
    marginRight: 16,
  },
  avatarContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#bb0000',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#bb0000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
  },
  avatarText: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#fff',
  },
  nameSection: {
    flex: 1,
  },
  nameText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#770000',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  roleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },

  // User Info Card
  userInfoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 5,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#555',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoContent: {
    paddingHorizontal: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 130,
    minWidth: 130,
    flexShrink: 0,
  },
  infoLabel: {
    fontSize: 14,
    color: '#555',
    marginLeft: 8,
  },
  infoValueContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  infoValueWrap: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    textAlign: 'right',
  },
  yearBadge: {
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  yearText: {
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '600',
  },

  // Redesigned speciality section
  specialitySection: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  specialityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  specialityLabel: {
    fontSize: 14,
    color: '#555',
    marginLeft: 8,
    fontWeight: '500',
  },
  specialityContent: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 10,
    marginLeft: 26,
  },
  specialityValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    lineHeight: 20,
    marginTop: 4,
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#eaeaea',
  },
  codeLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
    marginRight: 8,
  },
  codeValue: {
    fontSize: 15,
    color: '#1976D2',
    fontWeight: 'bold',
  },
  emptySpeciality: {
    fontSize: 13,
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
  },

  // Redesigned department section for teachers
  departmentSection: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  departmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  departmentLabel: {
    fontSize: 14,
    color: '#555',
    marginLeft: 8,
    fontWeight: '500',
  },
  departmentContent: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 10,
    marginLeft: 26,
  },
  departmentValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    lineHeight: 20,
  },

  verificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  verificationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verificationText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
  },

  // Menu Styles
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginHorizontal: -6,
  },
  menuItem: {
    width: (width - 32 - 12) / 2, // Subtract padding and gap
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 6,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  menuIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  menuSubtitle: {
    fontSize: 12,
    color: '#888',
    lineHeight: 16,
  },

  // Logout and Footer Styles
  logoutButton: {
    flexDirection: 'row',
    backgroundColor: '#bb0000',
    borderRadius: 12,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 12,
    shadowColor: '#bb0000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  logoutText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  footerInfo: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  usernameText: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  versionText: {
    fontSize: 12,
    color: '#888',
  },
});