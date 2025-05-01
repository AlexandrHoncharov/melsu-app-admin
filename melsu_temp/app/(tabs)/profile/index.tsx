import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useAuth} from '../../../hooks/useAuth';
import {router} from 'expo-router';
import scheduleService from '../../../src/services/scheduleService';
import * as Clipboard from 'expo-clipboard';
import QuickAccountSwitch from '../../../components/QuickAccountSwitch';

const { width } = Dimensions.get('window');

// Add the statusBarHeight calculation
const STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

// Menu item type definition
interface MenuItem {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  iconBgColor: string;
  iconColor: string;
  route: string;
  badge?: number;
}

export default function ProfileScreen() {
  const {user: originalUser, savedAccounts, isLoading, logout, refreshUserProfile, switchAccount} = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  // Состояние для хранения информации о курсе
  const [course, setCourse] = useState<number | null>(null);
  const [isLoadingCourse, setIsLoadingCourse] = useState(false);
  // Состояние для хранения количества непрочитанных тикетов
  const [unreadTickets, setUnreadTickets] = useState<number>(0);
  // Состояние для отслеживания, загружены ли непрочитанные тикеты
  const [ticketsLoaded, setTicketsLoaded] = useState<boolean>(false);
  // Состояние для модального окна быстрого переключения аккаунтов
  const [quickSwitchVisible, setQuickSwitchVisible] = useState(false);

  // Handle opening the quick switch modal
  const handleOpenQuickSwitch = () => {
    // Only show quick switch if there are saved accounts
    if (savedAccounts && savedAccounts.length > 0) {
      setQuickSwitchVisible(true);
    } else {
      // If no saved accounts, show option to add an account
      Alert.alert(
          'Нет сохраненных аккаунтов',
          'У вас нет других сохраненных аккаунтов. Хотите добавить новый аккаунт?',
          [
            {text: 'Отмена', style: 'cancel'},
            {
              text: 'Добавить аккаунт',
              onPress: () => {
                router.push({
                  pathname: '/login',
                  params: {addAccount: 'true'}
                });
              }
            }
          ]
      );
    }
  };

  // Функция для загрузки информации о курсе
  const loadCourseInfo = async (groupName: string, forceRefresh: boolean = false) => {
    if (!groupName) return;

    setIsLoadingCourse(true);
    try {
      console.log(`Loading course info for group ${groupName}...`);
      const courseInfo = await scheduleService.getCourseInfo(groupName, forceRefresh);

      if (courseInfo && courseInfo.success) {
        console.log(`Loaded course: ${courseInfo.course} for group ${groupName}`);
        setCourse(courseInfo.course);
      } else {
        console.log(`No course info found for group ${groupName}`);
        setCourse(null);
      }
    } catch (error) {
      console.error('Error loading course info:', error);
      setCourse(null);
    } finally {
      setIsLoadingCourse(false);
    }
  };

  // Функция для загрузки количества непрочитанных тикетов
  const loadUnreadTickets = async () => {
    try {
      // Импортируем API для тикетов только при необходимости (ленивый импорт)
      const ticketsApi = (await import('../../../src/api/ticketsApi')).default;

      const result = await ticketsApi.getUnreadCount();
      setUnreadTickets(result.unread_tickets);
      setTicketsLoaded(true);
    } catch (error) {
      console.error('Error loading unread tickets count:', error);
      setUnreadTickets(0);
      setTicketsLoaded(true);
    }
  };

  // Тщательная проверка и нормализация данных пользователя
  const checkUserData = (user) => {
    if (!user) return null;

    // Создаем глубокую копию объекта пользователя
    const normalizedUser = JSON.parse(JSON.stringify(user));

    // Логирование для отладки
    console.log("Checking user data. Original speciality:", user.speciality);

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

  // Загружаем информацию о курсе при инициализации компонента
  useEffect(() => {
    if (user?.role === 'student' && user.group) {
      loadCourseInfo(user.group);
    }
  }, [user?.group]);

  // Загружаем количество непрочитанных тикетов при инициализации
  useEffect(() => {
    if (user) {
      loadUnreadTickets();
    }
  }, [user]);

  // Profile refresh handler
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      console.log("Starting profile refresh...");

      // Вызываем обновление профиля
      await refreshUserProfile();
      console.log("Profile refreshed successfully");

      // После обновления профиля, обновляем информацию о курсе
      if (user?.role === 'student' && user?.group) {
        await loadCourseInfo(user.group, true); // Форсируем обновление курса
      }

      // Обновляем количество непрочитанных тикетов
      await loadUnreadTickets();
    } catch (error) {
      console.error('Error refreshing profile:', error);
      Alert.alert(
        'Ошибка',
        'Не удалось обновить профиль. Пожалуйста, попробуйте еще раз.'
      );
    } finally {
      setRefreshing(false);
    }
  };

  // Handle email click
  const handleEmailPress = async (email) => {
    try {
      await Linking.openURL(`mailto:${email}`);
    } catch (error) {
      console.error('Error opening mail client:', error);

      // On error, offer to copy email to clipboard
      Alert.alert(
        'Почтовый клиент не доступен',
        'Хотите скопировать адрес электронной почты?',
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Копировать',
            onPress: async () => {
              try {
                await Clipboard.setStringAsync(email);
                Alert.alert('Готово', 'Email скопирован в буфер обмена');
              } catch (clipboardError) {
                console.error('Failed to copy to clipboard:', clipboardError);
              }
            }
          }
        ]
      );
    }
  };

  // Handler for switching accounts
  const handleSwitchAccount = () => {
    router.push('/profile/switch-account');
  };

  // Logout handler with confirmation
  const handleLogout = () => {
    Alert.alert(
        'Выход из аккаунта',
        'Вы уверены, что хотите выйти?',
        [
          {text: 'Отмена', style: 'cancel'},
          {
            text: 'Выйти',
            style: 'destructive',
            onPress: async () => {
              try {
                // Показываем индикатор загрузки перед выходом
                setRefreshing(true);

                // Выполняем выход из аккаунта, но не делаем навигацию внутри useAuth
                // Ждем завершения процесса выхода
                await logout();

                // Используем setTimeout чтобы дать время для завершения процессов очистки
                setTimeout(() => {
                  // Выполняем навигацию на экран логина только после завершения logout
                  router.replace('/login');
                }, 300);
              } catch (err) {
                setRefreshing(false);
                console.error('Error during logout:', err);
                Alert.alert('Ошибка', 'Не удалось выйти из аккаунта');
              }
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

  // Подготовка меню
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
        id: 'switch-account',
        title: 'Сменить аккаунт',
        subtitle: 'Переключение между аккаунтами',
        icon: 'people-outline',
        iconBgColor: '#E0F2F1',
        iconColor: '#00796B',
        route: '/profile/switch-account'
      },

      {
        id: 'notification-test',
        title: 'test',
        subtitle: 'test',
        icon: 'ticket-outline',
        iconBgColor: '#EDE7F6',
        iconColor: '#673AB7',
        route: '/profile/notification-test',
        badge: ticketsLoaded ? unreadTickets : undefined
      },

      // Notifications item removed as requested
      {
        id: 'tickets',
        title: 'Техническая поддержка',
        subtitle: 'Обращения в службу поддержки',
        icon: 'ticket-outline',
        iconBgColor: '#EDE7F6',
        iconColor: '#673AB7',
        route: '/profile/tickets',
        badge: ticketsLoaded ? unreadTickets : undefined
      },
      {
        id: 'support',
        title: 'Электронные услуги',
        subtitle: 'Справки и цифровые сервисы',
        icon: 'globe-outline',
        iconBgColor: '#FFF3E0',
        iconColor: '#F57C00',
        route: '/profile/support'
      },
      {
        id: 'about',
        title: 'О приложении',
        subtitle: 'Информация о приложении',
        icon: 'information-circle-outline',
        iconBgColor: '#E8EAF6',
        iconColor: '#3F51B5',
        route: '/profile/about'
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

  // Handler for support button click
  const handleSupportClick = () => {
    Alert.alert(
      'Электронные услуги',
      'Сервис электронных услуг и запроса справок находится в разработке.',
      [{ text: 'OK' }]
    );
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          // Apply conditional padding for Android
          Platform.OS === 'android' && styles.androidScrollContent
        ]}
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
            <TouchableOpacity
                style={styles.avatarContainer}
                activeOpacity={0.8}
                onLongPress={handleOpenQuickSwitch}
                delayLongPress={500}
            >
              <Text style={styles.avatarText}>{avatarLetter}</Text>

              {/* Show indicator if there are multiple accounts */}
              {savedAccounts && savedAccounts.length > 1 && (
                  <View style={styles.accountsIndicator}>
                    <Ionicons name="chevron-down" size={12} color="#fff"/>
                  </View>
              )}
            </TouchableOpacity>
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
            {/* Add username at the top as requested */}
            <Text style={styles.usernameTopText}>Логин: {user.username}</Text>
          </View>
        </View>

        {/* Quick Account Switch Modal */}
        <QuickAccountSwitch
            currentUser={user}
            savedAccounts={savedAccounts}
            visible={quickSwitchVisible}
            onClose={() => setQuickSwitchVisible(false)}
            onSwitchAccount={switchAccount}
            onAddAccount={() => router.push({pathname: '/login', params: {addAccount: 'true'}})}
        />

        {/* Персональная информация - новый дизайн */}
        <View style={styles.userInfoCard}>
          <Text style={styles.cardTitle}>Персональная информация</Text>

          {/* Email - для всех пользователей */}
          {user.email && (
              <TouchableOpacity
                  style={styles.infoBlock}
                  onPress={() => handleEmailPress(user.email)}
                  activeOpacity={0.7}
              >
                <View style={styles.infoBlockHeader}>
                  <Ionicons name="mail-outline" size={18} color="#666"/>
                  <Text style={styles.infoBlockLabel}>Email</Text>
                </View>
                <View style={styles.infoBlockContent}>
                  <Text style={styles.emailValue}>{user.email}</Text>
                  <Ionicons name="open-outline" size={14} color="#1976D2" style={styles.emailIcon}/>
                </View>
              </TouchableOpacity>
          )}

          {/* Блоки для студентов */}
          {user.role === 'student' && (
              <>
                {/* Группа и курс */}
                {user.group && (
                    <View style={styles.infoBlock}>
                      <View style={styles.infoBlockHeader}>
                        <Ionicons name="people-outline" size={18} color="#666"/>
                        <Text style={styles.infoBlockLabel}>Группа</Text>
                      </View>
                      <View style={styles.infoBlockContentRow}>
                        <Text style={styles.infoBlockValue}>{user.group}</Text>
                        {course !== null && (
                            <View style={styles.courseBadge}>
                              <Ionicons name="calendar-outline" size={12} color="#1976D2"/>
                              <Text style={styles.courseText}>{course}-й курс</Text>
                            </View>
                        )}
                        {isLoadingCourse && (
                            <ActivityIndicator size="small" color="#1976D2" style={{marginLeft: 8}}/>
                        )}
                      </View>
                    </View>
                )}

                {/* Факультет */}
                {user.faculty && (
                    <View style={styles.infoBlock}>
                      <View style={styles.infoBlockHeader}>
                        <Ionicons name="business-outline" size={18} color="#666"/>
                        <Text style={styles.infoBlockLabel}>Факультет</Text>
                      </View>
                      <Text style={styles.infoBlockValue}>{user.faculty}</Text>
                    </View>
                )}

                {/* Форма обучения */}
                {getFormName(user) && (
                    <View style={styles.infoBlock}>
                      <View style={styles.infoBlockHeader}>
                        <Ionicons name="time-outline" size={18} color="#666"/>
                        <Text style={styles.infoBlockLabel}>Форма обучения</Text>
                      </View>
                      <Text style={styles.infoBlockValue}>{getFormName(user)}</Text>
                    </View>
                )}

                {/* Специальность */}
                <View style={styles.infoBlock}>
                  <View style={styles.infoBlockHeader}>
                    <Ionicons name="school-outline" size={18} color="#666"/>
                    <Text style={styles.infoBlockLabel}>Направление подготовки</Text>
                  </View>
                  {user.speciality && (user.speciality.name || user.speciality.code) ? (
                      <View style={styles.infoBlockContent}>
                        {user.speciality.code && (
                            <View style={styles.codeContainer}>
                              <Text style={styles.codeValue}>{user.speciality.code}</Text>
                            </View>
                        )}
                        {user.speciality.name && (
                            <Text style={styles.specialityValue}>{user.speciality.name}</Text>
                        )}
                      </View>
                  ) : (
                      <Text style={styles.emptyValue}>
                        Информация о направлении подготовки отсутствует
                      </Text>
                  )}
                </View>

                {/* Верификация */}
                <TouchableOpacity
                    style={[styles.verificationBlock, {backgroundColor: verificationInfo.bgColor}]}
                    onPress={() => router.push('/verification')}
                >
                  <View style={styles.verificationContent}>
                    <Ionicons name={verificationInfo.icon} size={22} color={verificationInfo.color}/>
                    <Text style={[styles.verificationText, {color: verificationInfo.color}]}>
                      {verificationInfo.text}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={verificationInfo.color}/>
                </TouchableOpacity>
              </>
          )}

          {/* Блоки для преподавателей */}
          {user.role === 'teacher' && (
              <>
                {/* Должность */}
                {user.position && (
                    <View style={styles.infoBlock}>
                      <View style={styles.infoBlockHeader}>
                        <Ionicons name="briefcase-outline" size={18} color="#666"/>
                        <Text style={styles.infoBlockLabel}>Должность</Text>
                      </View>
                      <Text style={styles.infoBlockValue}>{user.position}</Text>
                    </View>
                )}

                {/* Кафедра */}
                {user.department && (
                    <View style={styles.infoBlock}>
                      <View style={styles.infoBlockHeader}>
                        <Ionicons name="business-outline" size={18} color="#666"/>
                        <Text style={styles.infoBlockLabel}>Кафедра</Text>
                      </View>
                      <Text style={styles.infoBlockValue}>{user.department}</Text>
                    </View>
                )}

                {/* Факультет */}
                {user.faculty && (
                    <View style={styles.infoBlock}>
                      <View style={styles.infoBlockHeader}>
                        <Ionicons name="school-outline" size={18} color="#666"/>
                        <Text style={styles.infoBlockLabel}>Факультет</Text>
                      </View>
                      <Text style={styles.infoBlockValue}>{user.faculty}</Text>
                    </View>
                )}
              </>
          )}
        </View>

        {/* Menu Grid */}
        <View style={styles.menuGrid}>
          {getMenuItems().map((item) => {
            // For the "Справка" item, use custom handler instead of router navigation
            if (item.id === 'support') {
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.menuItem}
                  onPress={handleSupportClick}
                  activeOpacity={0.7}
                >
                  <View style={[styles.menuIconContainer, { backgroundColor: item.iconBgColor }]}>
                    <Ionicons name={item.icon} size={24} color={item.iconColor} />
                  </View>
                  <Text style={styles.menuTitle}>{item.title}</Text>
                  <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity
                key={item.id}
                style={styles.menuItem}
                onPress={() => router.push(item.route)}
                activeOpacity={0.7}
              >
                <View style={[styles.menuIconContainer, { backgroundColor: item.iconBgColor }]}>
                  <Ionicons name={item.icon} size={24} color={item.iconColor} />
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <View style={styles.badgeContainer}>
                      <Text style={styles.badgeText}>{item.badge > 99 ? '99+' : item.badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Account Buttons Section - Logout and Switch Account */}
        <View style={styles.accountButtonsContainer}>
          <TouchableOpacity
              style={styles.switchAccountButton}
              onPress={handleOpenQuickSwitch}
              activeOpacity={0.8}
          >
            <Ionicons name="people-outline" size={20} color="#666"/>
            <Text style={styles.switchAccountText}>Сменить аккаунт</Text>
          </TouchableOpacity>

          <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={20} color="#FFF"/>
            <Text style={styles.logoutText}>Выйти из аккаунта</Text>
          </TouchableOpacity>
        </View>

        {/* Footer Info */}
        <View style={styles.footerInfo}>
            <Text style={styles.versionText}>Версия приложения 1.2.1</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
    // Add padding top for Android
    paddingTop: Platform.OS === 'android' ? STATUSBAR_HEIGHT : 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 30,
  },
  // New style for Android scroll content
  androidScrollContent: {
    paddingTop: 16,
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

  // Header styles - improved for Android
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start', // Changed from 'center' to 'flex-start'
    marginBottom: 20,
    paddingTop: 10, // Added padding at the top
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
    position: 'relative', // needed for the indicator
  },
  avatarText: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#fff',
  },
  accountsIndicator: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fff',
  },
  nameSection: {
    flex: 1,
    paddingRight: 8, // Added right padding to prevent text overflow
  },
  nameText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    flexWrap: 'wrap',
    width: '100%', // Ensure text doesn't overflow
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#770000',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  roleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  usernameTopText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },

  // Улучшенные стили для блока персональной информации
  userInfoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 5,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#444',
    marginBottom: 18,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoBlock: {
    marginBottom: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 12,
  },
  infoBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoBlockLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
    marginLeft: 8,
  },
  infoBlockContent: {
    paddingLeft: 26,
  },
  infoBlockContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 26,
    flexWrap: 'wrap',
  },
  infoBlockValue: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
    lineHeight: 20,
    paddingLeft: 26,
  },
  emailValue: {
    fontSize: 15,
    color: '#1976D2',
    fontWeight: '500',
    flexShrink: 1,
  },
  emailIcon: {
    marginLeft: 6,
  },
  codeContainer: {
    marginBottom: 4,
  },
  codeValue: {
    fontSize: 16,
    color: '#1976D2',
    fontWeight: 'bold',
  },
  specialityValue: {
    fontSize: 15,
    color: '#333',
    lineHeight: 20,
  },
  emptyValue: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
    paddingLeft: 26,
  },
  courseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  courseText: {
    fontSize: 13,
    color: '#1976D2',
    fontWeight: '600',
    marginLeft: 4,
  },
  verificationBlock: {
    borderRadius: 12,
    padding: 14,
    marginTop: 6,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  verificationContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verificationText: {
    marginLeft: 10,
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
    position: 'relative',
  },
  badgeContainer: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#bb0000',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
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

  // Logout and Account Buttons Styles
  accountButtonsContainer: {
    marginVertical: 12,
    gap: 10,
  },
  switchAccountButton: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  switchAccountText: {
    color: '#444',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    backgroundColor: '#bb0000',
    borderRadius: 12,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
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