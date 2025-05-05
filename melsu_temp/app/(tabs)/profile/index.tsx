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

const {width} = Dimensions.get('window');

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
                    {text: 'Отмена', style: 'cancel'},
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
        switch (role) {
            case 'student':
                return 'Студент';
            case 'teacher':
                return 'Преподаватель';
            case 'admin':
                return 'Администратор';
            default:
                return 'Пользователь';
        }
    };

    // Helper function to get verification status info
    const getVerificationInfo = (status) => {
        switch (status) {
            case 'verified':
                return {
                    text: 'Аккаунт верифицирован',
                    icon: "shield-checkmark",
                    color: "#34C759",
                    bgColor: "#F5FFF9"
                };
            case 'pending':
                return {
                    text: 'Верификация на рассмотрении',
                    icon: "time",
                    color: "#FF9500",
                    bgColor: "#FFFAF5"
                };
            case 'rejected':
                return {
                    text: 'Верификация отклонена',
                    icon: "close-circle",
                    color: "#FF3B30",
                    bgColor: "#FFF5F5"
                };
            default:
                return {
                    text: 'Требуется верификация',
                    icon: "shield",
                    color: "#8E8E93",
                    bgColor: "#F8F8F8"
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
                case '1':
                    return 'Очная';
                case '2':
                    return 'Очно-заочная';
                case '3':
                    return 'Заочная';
                default:
                    return '';
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
                iconBgColor: '#EBF3FC',
                iconColor: '#1976D2',
                route: '/profile/change-password'
            },

            // {
            //     id: 'notification-test',
            //     title: 'test',
            //     subtitle: 'test',
            //     icon: 'ticket-outline',
            //     iconBgColor: '#F3EFFA',
            //     iconColor: '#673AB7',
            //     route: '/profile/notification-test',
            //     badge: ticketsLoaded ? unreadTickets : undefined
            // },

            // Notifications item removed as requested
            {
                id: 'tickets',
                title: 'Техническая поддержка',
                subtitle: 'Обращения в службу поддержки',
                icon: 'ticket-outline',
                iconBgColor: '#F3EFFA',
                iconColor: '#673AB7',
                route: '/profile/tickets',
                badge: ticketsLoaded ? unreadTickets : undefined
            },
            {
                id: 'support',
                title: 'Электронные услуги',
                subtitle: 'Справки и цифровые сервисы',
                icon: 'globe-outline',
                iconBgColor: '#FFF5E6',
                iconColor: '#F57C00',
                route: '/profile/support'
            },
            // {
            //     id: 'about',
            //     title: 'О приложении',
            //     subtitle: 'Информация о приложении',
            //     icon: 'information-circle-outline',
            //     iconBgColor: '#ECEFF9',
            //     iconColor: '#3F51B5',
            //     route: '/profile/about'
            // }
        ];

        // Add verification item for students
        if (user?.role === 'student') {
            const verificationInfo = getVerificationInfo(user.verificationStatus);

            // Сначала добавляем верификацию
            // commonItems.splice(1, 0, {
            //     id: 'verification',
            //     title: 'Верификация студента',
            //     subtitle: verificationInfo.text,
            //     icon: verificationInfo.icon,
            //     iconBgColor: verificationInfo.bgColor,
            //     iconColor: verificationInfo.color,
            //     route: '/verification'
            // });

            // // Затем добавляем дополнительные занятия для студентов
            // commonItems.splice(2, 0, {
            //     id: 'student-retakes',
            //     title: 'Пересдачи',
            //     subtitle: 'Запись на пересдачи и консультации',
            //     icon: 'calendar-outline',
            //     iconBgColor: '#E3F2FD',
            //     iconColor: '#1976D2',
            //     route: '/profile/student-retakes'
            // });
        }

        // Add retake schedule for teachers
        if (user?.role === 'teacher') {
            // commonItems.splice(1, 0, {
            //     id: 'retakes',
            //     title: 'Мой график пересдач',
            //     subtitle: 'Управление пересдачами и консультациями',
            //     icon: 'calendar-outline',
            //     iconBgColor: '#E0F2F1',
            //     iconColor: '#009688',
            //     route: '/profile/retakes'
            // });
        }

        return commonItems;
    };

    // Handler for support button click
    const handleSupportClick = () => {
        Alert.alert(
            'Электронные услуги',
            'Сервис электронных услуг и запроса справок находится в разработке.',
            [{text: 'OK'}]
        );
    };

    // Loading state
    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#bb0000"/>
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

    // Определяем, iOS это или нет
    const isIOS = Platform.OS === 'ios';

    return (
        <SafeAreaView style={[styles.container, {backgroundColor: isIOS ? '#bb0000' : '#f5f6fa'}]}>
            <StatusBar barStyle="light-content" backgroundColor="#bb0000"/>

            <View style={{flex: 1, backgroundColor: '#bb0000'}}>
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={[styles.scrollContent, {backgroundColor: '#f5f6fa'}]}
                    contentInsetAdjustmentBehavior="automatic"
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            colors={['#ffffff']}
                            tintColor="#ffffff"
                            progressBackgroundColor="#bb0000"
                        />
                    }
                >
                    {/* Header section with background and avatar */}
                    <View style={styles.headerBackground}>
                        <View style={styles.headerTop}>
                            <Text style={styles.welcomeText}>Добрый день</Text>
                            <TouchableOpacity
                                onPress={handleOpenQuickSwitch}
                                style={styles.switchAccountIconButton}
                            >
                                <Ionicons name="people" size={22} color="#ffffff"/>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.headerContent}>
                            <View style={styles.avatarSection}>
                                <TouchableOpacity
                                    style={styles.avatarContainer}
                                    activeOpacity={0.8}
                                    onLongPress={handleOpenQuickSwitch}
                                    delayLongPress={500}
                                >
                                    <Text style={styles.avatarText}>{avatarLetter}</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.nameSection}>
                                <Text style={styles.nameText} numberOfLines={2} ellipsizeMode="tail">
                                    {user.fullName || user.username}
                                </Text>
                                <View style={styles.roleContainer}>
                                    <View style={styles.roleBadge}>
                                        <Ionicons
                                            name={user.role === 'student' ? 'school-outline' : 'briefcase-outline'}
                                            size={14}
                                            color="#fff"
                                        />
                                        <Text style={styles.roleText}>{getRoleText(user.role)}</Text>
                                    </View>
                                    <Text style={styles.usernameTopText}>Логин: {user.username}</Text>
                                </View>
                            </View>
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

                    {/* Main content area */}
                    <View style={styles.mainContent}>
                        {/* Персональная информация - новый дизайн карт */}
                        <View style={styles.cardContainer}>
                            <View style={styles.cardHeader}>
                                <View style={styles.cardIconContainer}>
                                    <Ionicons name="person" size={18} color="#ffffff"/>
                                </View>
                                <Text style={styles.cardTitle}>Персональная информация</Text>
                            </View>

                            {/* Improved personal information layout */}
                            <View style={styles.infoCardContent}>
                                {/* Email для всех пользователей */}
                                {user.email && (
                                    <TouchableOpacity
                                        style={styles.infoItem}
                                        onPress={() => handleEmailPress(user.email)}
                                        activeOpacity={0.7}
                                    >
                                        <View style={styles.infoIconContainer}>
                                            <Ionicons name="mail" size={18} color="#bb0000"/>
                                        </View>
                                        <View style={styles.infoTextContainer}>
                                            <Text style={styles.infoLabel}>Email</Text>
                                            <Text style={styles.emailValue}>{user.email}</Text>
                                        </View>
                                        <Ionicons name="open-outline" size={18} color="#909090"/>
                                    </TouchableOpacity>
                                )}

                                {/* Блоки для студентов */}
                                {user.role === 'student' && (
                                    <>
                                        {/* Группа и курс */}
                                        {user.group && (
                                            <View style={styles.infoItem}>
                                                <View style={styles.infoIconContainer}>
                                                    <Ionicons name="people" size={18} color="#F57C00"/>
                                                </View>
                                                <View style={styles.infoTextContainer}>
                                                    <Text style={styles.infoLabel}>Группа</Text>
                                                    <View style={styles.infoValueRow}>
                                                        <Text style={styles.infoValue}>{user.group}</Text>
                                                        {course !== null && (
                                                            <View style={styles.courseBadge}>
                                                                <Text style={styles.courseText}>{course}-й курс</Text>
                                                            </View>
                                                        )}
                                                        {isLoadingCourse && (
                                                            <ActivityIndicator size="small" color="#1976D2"
                                                                               style={{marginLeft: 8}}/>
                                                        )}
                                                    </View>
                                                </View>
                                            </View>
                                        )}

                                        {/* Факультет */}
                                        {user.faculty && (
                                            <View style={styles.infoItem}>
                                                <View style={styles.infoIconContainer}>
                                                    <Ionicons name="business" size={18} color="#3F51B5"/>
                                                </View>
                                                <View style={styles.infoTextContainer}>
                                                    <Text style={styles.infoLabel}>Факультет</Text>
                                                    <Text style={styles.infoValue}>{user.faculty}</Text>
                                                </View>
                                            </View>
                                        )}

                                        {/* Форма обучения */}
                                        {getFormName(user) && (
                                            <View style={styles.infoItem}>
                                                <View style={styles.infoIconContainer}>
                                                    <Ionicons name="time" size={18} color="#009688"/>
                                                </View>
                                                <View style={styles.infoTextContainer}>
                                                    <Text style={styles.infoLabel}>Форма обучения</Text>
                                                    <Text style={styles.infoValue}>{getFormName(user)}</Text>
                                                </View>
                                            </View>
                                        )}

                                        {/* Специальность */}
                                        <View style={styles.infoItem}>
                                            <View style={styles.infoIconContainer}>
                                                <Ionicons name="school" size={18} color="#1976D2"/>
                                            </View>
                                            <View style={styles.infoTextContainer}>
                                                <Text style={styles.infoLabel}>Направление подготовки</Text>
                                                {user.speciality && (user.speciality.name || user.speciality.code) ? (
                                                    <View>
                                                        {user.speciality.code && (
                                                            <View style={styles.codeContainer}>
                                                                <Text
                                                                    style={styles.codeValue}>{user.speciality.code}</Text>
                                                            </View>
                                                        )}
                                                        {user.speciality.name && (
                                                            <Text
                                                                style={styles.specialityValue}>{user.speciality.name}</Text>
                                                        )}
                                                    </View>
                                                ) : (
                                                    <Text style={styles.emptyValue}>
                                                        Информация о направлении подготовки отсутствует
                                                    </Text>
                                                )}
                                            </View>
                                        </View>
                                    </>
                                )}

                                {/* Блоки для преподавателей */}
                                {user.role === 'teacher' && (
                                    <>
                                        {/* Должность */}
                                        {user.position && (
                                            <View style={styles.infoItem}>
                                                <View style={styles.infoIconContainer}>
                                                    <Ionicons name="briefcase" size={18} color="#673AB7"/>
                                                </View>
                                                <View style={styles.infoTextContainer}>
                                                    <Text style={styles.infoLabel}>Должность</Text>
                                                    <Text style={styles.infoValue}>{user.position}</Text>
                                                </View>
                                            </View>
                                        )}

                                        {/* Кафедра */}
                                        {user.department && (
                                            <View style={styles.infoItem}>
                                                <View style={styles.infoIconContainer}>
                                                    <Ionicons name="business" size={18} color="#3F51B5"/>
                                                </View>
                                                <View style={styles.infoTextContainer}>
                                                    <Text style={styles.infoLabel}>Кафедра</Text>
                                                    <Text style={styles.infoValue}>{user.department}</Text>
                                                </View>
                                            </View>
                                        )}

                                        {/* Факультет */}
                                        {user.faculty && (
                                            <View style={styles.infoItem}>
                                                <View style={styles.infoIconContainer}>
                                                    <Ionicons name="school" size={18} color="#1976D2"/>
                                                </View>
                                                <View style={styles.infoTextContainer}>
                                                    <Text style={styles.infoLabel}>Факультет</Text>
                                                    <Text style={styles.infoValue}>{user.faculty}</Text>
                                                </View>
                                            </View>
                                        )}
                                    </>
                                )}
                            </View>
                        </View>

                        {/* Верификация для студентов */}
                        {user.role === 'student' && (
                            <TouchableOpacity
                                style={[styles.verificationCard, {backgroundColor: verificationInfo.bgColor}]}
                                onPress={() => router.push('/verification')}
                                activeOpacity={0.8}
                            >
                                <Ionicons
                                    name={verificationInfo.icon}
                                    size={24}
                                    color={verificationInfo.color}
                                    style={styles.verificationIcon}
                                />
                                <View style={styles.verificationTextContainer}>
                                    <Text style={[styles.verificationTitle, {color: verificationInfo.color}]}>
                                        Статус верификации
                                    </Text>
                                    <Text style={[styles.verificationText, {color: verificationInfo.color}]}>
                                        {verificationInfo.text}
                                    </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={verificationInfo.color}/>
                            </TouchableOpacity>
                        )}

                        {/* Меню сервисов */}
                        <View style={styles.cardContainer}>
                            <View style={styles.cardHeader}>
                                <View style={[styles.cardIconContainer, {backgroundColor: '#3F51B5'}]}>
                                    <Ionicons name="apps" size={18} color="#ffffff"/>
                                </View>
                                <Text style={styles.cardTitle}>Сервисы</Text>
                            </View>

                            <View style={styles.menuListContainer}>
                                {getMenuItems().map((item) => {
                                    // For the "Справка" item, use custom handler instead of router navigation
                                    if (item.id === 'support') {
                                        return (
                                            <TouchableOpacity
                                                key={item.id}
                                                style={styles.menuListItem}
                                                onPress={handleSupportClick}
                                                activeOpacity={0.7}
                                            >
                                                <View
                                                    style={[styles.menuIconCircle, {backgroundColor: item.iconBgColor}]}>
                                                    <Ionicons name={item.icon} size={20} color={item.iconColor}/>
                                                </View>
                                                <View style={styles.menuTextContainer}>
                                                    <Text style={styles.menuItemTitle}>{item.title}</Text>
                                                    <Text style={styles.menuItemSubtitle}>{item.subtitle}</Text>
                                                </View>
                                                <Ionicons name="chevron-forward" size={18} color="#bbbbbb"/>
                                            </TouchableOpacity>
                                        );
                                    }

                                    return (
                                        <TouchableOpacity
                                            key={item.id}
                                            style={styles.menuListItem}
                                            onPress={() => router.push(item.route)}
                                            activeOpacity={0.7}
                                        >
                                            <View style={[styles.menuIconCircle, {backgroundColor: item.iconBgColor}]}>
                                                <Ionicons name={item.icon} size={20} color={item.iconColor}/>
                                                {typeof item.badge === 'number' && item.badge > 0 && (
                                                    <View style={styles.badgeContainer}>
                                                        <Text
                                                            style={styles.badgeText}>{item.badge > 99 ? '99+' : item.badge}</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <View style={styles.menuTextContainer}>
                                                <Text style={styles.menuItemTitle}>{item.title}</Text>
                                                <Text style={styles.menuItemSubtitle}>{item.subtitle}</Text>
                                            </View>
                                            <Ionicons name="chevron-forward" size={18} color="#bbbbbb"/>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>

                        {/* Account Buttons Section */}
                        <View style={styles.accountButtonsContainer}>
                            <TouchableOpacity
                                style={styles.switchAccountButton}
                                onPress={handleOpenQuickSwitch}
                                activeOpacity={0.8}
                            >
                                <Ionicons name="people" size={20} color="#555"/>
                                <Text style={styles.switchAccountText}>Сменить аккаунт</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.logoutButton}
                                onPress={handleLogout}
                                activeOpacity={0.8}
                            >
                                <Ionicons name="log-out" size={20} color="#FFF"/>
                                <Text style={styles.logoutText}>Выйти из аккаунта</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Footer Info */}
                        <View style={styles.footerInfo}>
                            <Text style={styles.versionText}>Версия приложения 1.2.1</Text>
                        </View>
                    </View>
                </ScrollView>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f6fa',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 30,
        backgroundColor: '#f5f6fa',
    },
    mainContent: {
        paddingHorizontal: 16,
        paddingTop: 16,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f6fa',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: '#666',
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },

    // Modern header with background
    headerBackground: {
        backgroundColor: '#bb0000',
        paddingTop: Platform.OS === 'android' ? STATUSBAR_HEIGHT : 0,
        paddingBottom: 20,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 0 : 10, // Убираем отступ сверху для iOS
        paddingBottom: 15,
    },
    welcomeText: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.9)',
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
    switchAccountIconButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerContent: {
        flexDirection: 'row',
        paddingHorizontal: 20,
    },
    avatarSection: {
        marginRight: 16,
    },
    avatarContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    avatarText: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#fff',
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
    nameSection: {
        flex: 1,
        justifyContent: 'center',
    },
    nameText: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 10,
        flexWrap: 'wrap',
        width: '100%',
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
    roleContainer: {
        gap: 8,
    },
    roleBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        alignSelf: 'flex-start',
    },
    roleText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '500',
        marginLeft: 6,
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
    usernameTopText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.85)',
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },

    // Modern card design
    cardContainer: {
        backgroundColor: '#ffffff',
        borderRadius: 16,
        shadowColor: 'rgba(0, 0, 0, 0.1)',
        shadowOffset: {width: 0, height: 4},
        shadowOpacity: 1,
        shadowRadius: 12,
        elevation: 4,
        marginBottom: 16,
        overflow: 'hidden',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#fafafa',
        borderBottomWidth: 1,
        borderBottomColor: '#eeeeee',
    },
    cardIconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#bb0000',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333333',
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
    infoCardContent: {
        padding: 8,
    },

    // Improved info items
    infoItem: {
        flexDirection: 'row',
        paddingVertical: 14,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        alignItems: 'center',
    },
    infoIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#f5f5f5',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    infoTextContainer: {
        flex: 1,
    },
    infoLabel: {
        fontSize: 13,
        color: '#999999',
        marginBottom: 4,
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
    infoValue: {
        fontSize: 15,
        color: '#333333',
        fontWeight: '500',
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
    infoValueRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
    },
    emailValue: {
        fontSize: 15,
        color: '#1976D2',
        fontWeight: '500',
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
    codeContainer: {
        backgroundColor: '#e3f2fd',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        alignSelf: 'flex-start',
        marginBottom: 4,
        marginTop: 2,
    },
    codeValue: {
        fontSize: 14,
        color: '#1976D2',
        fontWeight: '600',
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
    specialityValue: {
        fontSize: 15,
        color: '#333333',
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
    emptyValue: {
        fontSize: 14,
        color: '#999999',
        fontStyle: 'italic',
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
    courseBadge: {
        backgroundColor: '#e3f2fd',
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 3,
        marginLeft: 8,
    },
    courseText: {
        fontSize: 13,
        color: '#1976D2',
        fontWeight: '500',
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },

    // Verification card
    verificationCard: {
        flexDirection: 'row',
        backgroundColor: '#ffffff',
        borderRadius: 16,
        shadowColor: 'rgba(0, 0, 0, 0.1)',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 1,
        shadowRadius: 6,
        elevation: 2,
        padding: 16,
        marginBottom: 16,
        alignItems: 'center',
    },
    verificationIcon: {
        marginRight: 16,
    },
    verificationTextContainer: {
        flex: 1,
    },
    verificationTitle: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 4,
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
    verificationText: {
        fontSize: 13,
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },

    // Modern menu list
    menuListContainer: {
        padding: 8,
    },
    menuListItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    menuIconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
        position: 'relative',
    },
    menuTextContainer: {
        flex: 1,
        marginRight: 8,
    },
    menuItemTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#333333',
        marginBottom: 4,
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
    menuItemSubtitle: {
        fontSize: 13,
        color: '#888888',
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
    badgeContainer: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#bb0000',
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
        borderWidth: 1,
        borderColor: '#fff',
    },
    badgeText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: 'bold',
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },

    // Account buttons
    accountButtonsContainer: {
        marginTop: 4,
        marginBottom: 16,
        gap: 12,
    },
    switchAccountButton: {
        flexDirection: 'row',
        backgroundColor: '#ffffff',
        borderRadius: 12,
        paddingVertical: 15,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: 'rgba(0, 0, 0, 0.1)',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.5,
        shadowRadius: 4,
        elevation: 2,
    },
    switchAccountText: {
        color: '#444',
        fontSize: 16,
        fontWeight: '500',
        marginLeft: 10,
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
    logoutButton: {
        flexDirection: 'row',
        backgroundColor: '#bb0000',
        borderRadius: 12,
        paddingVertical: 15,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: 'rgba(187, 0, 0, 0.3)',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 1,
        shadowRadius: 4,
        elevation: 3,
    },
    logoutText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '500',
        marginLeft: 10,
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
    footerInfo: {
        alignItems: 'center',
        paddingVertical: 12,
    },
    versionText: {
        fontSize: 12,
        color: '#888',
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
});