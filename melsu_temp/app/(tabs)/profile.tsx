// File: app/(tabs)/profile.tsx
// Обновленная версия без статичных данных
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  SafeAreaView,
  Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { router, useFocusEffect } from 'expo-router';

export default function ProfileScreen() {
  const { user, logout, isLoading, refreshUserProfile, manuallyCheckVerificationStatus } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  // Refresh profile data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (user?.role === 'student') {
        // Check for verification status updates when screen comes into focus
        manuallyCheckVerificationStatus();
      }
    }, [])
  );

  // Обработка обновления профиля
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // First refresh the user profile completely
      await refreshUserProfile();

      // Then check specific verification status which might have changed
      if (user?.role === 'student') {
        await manuallyCheckVerificationStatus();
      }
    } catch (error) {
      console.error('Error refreshing profile:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Обработка выхода из аккаунта
  const handleLogout = () => {
    Alert.alert(
      'Выход из аккаунта',
      'Вы уверены, что хотите выйти?',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выйти', onPress: logout, style: 'destructive' }
      ]
    );
  };

  // Обработка нажатия на кнопку верификации
  const handleVerification = () => {
    router.push('/verification');
  };

  // Переход в раздел справок
  const handleDocuments = () => {
    router.push('/under-development?title=Справки&message=Раздел справок пока находится в разработке. Здесь будет возможность запросить различные виды справок и отслеживать статус их готовности.');
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#770002" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Пользователь не найден</Text>
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => router.replace('/login')}
        >
          <Text style={styles.loginButtonText}>Войти в аккаунт</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#770002']}
            tintColor="#770002"
          />
        }
      >
        {/* Шапка профиля */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {user.fullName
                ? user.fullName.split(' ').slice(0, 2).map(n => n[0]).join('')
                : user.username.substring(0, 2).toUpperCase()}
            </Text>
          </View>

          <Text style={styles.userName}>{user.fullName || user.username}</Text>

          <View style={styles.badgeContainer}>
            <View style={styles.roleBadge}>
              <Ionicons
                name={user.role === 'student' ? 'school-outline' : 'briefcase-outline'}
                size={14}
                color="#555"
              />
              <Text style={styles.roleText}>
                {user.role === 'student' ? 'Студент' : 'Преподаватель'}
              </Text>
            </View>

            {user.role === 'student' && user.verificationStatus && (
              <View style={[
                styles.verificationBadge,
                user.verificationStatus === 'verified'
                  ? styles.verifiedBadge
                  : user.verificationStatus === 'pending'
                  ? styles.pendingBadge
                  : user.verificationStatus === 'rejected'
                  ? styles.rejectedBadge
                  : styles.unverifiedBadge
              ]}>
                <Ionicons
                  name={
                    user.verificationStatus === 'verified'
                      ? 'checkmark-circle-outline'
                      : user.verificationStatus === 'pending'
                      ? 'time-outline'
                      : user.verificationStatus === 'rejected'
                      ? 'close-circle-outline'
                      : 'alert-circle-outline'
                  }
                  size={14}
                  color={
                    user.verificationStatus === 'verified'
                      ? '#2E7D32'
                      : user.verificationStatus === 'pending'
                      ? '#0277BD'
                      : user.verificationStatus === 'rejected'
                      ? '#C62828'
                      : '#F57C00'
                  }
                />
                <Text style={[
                  styles.verificationText,
                  user.verificationStatus === 'verified'
                    ? styles.verifiedText
                    : user.verificationStatus === 'pending'
                    ? styles.pendingText
                    : user.verificationStatus === 'rejected'
                    ? styles.rejectedText
                    : styles.unverifiedText
                ]}>
                  {user.verificationStatus === 'verified'
                    ? 'Верифицирован'
                    : user.verificationStatus === 'pending'
                    ? 'На проверке'
                    : user.verificationStatus === 'rejected'
                    ? 'Отклонен'
                    : 'Не верифицирован'}
                </Text>
              </View>
            )}
          </View>

          {user.role === 'student' && user.group && (
            <View style={styles.groupContainer}>
              <Ionicons name="people-outline" size={18} color="#555" />
              <Text style={styles.groupText}>Группа {user.group}</Text>
            </View>
          )}
        </View>

        {/* Основная информация - только логин */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Основная информация</Text>
          <View style={styles.infoContainer}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Логин:</Text>
              <Text style={styles.infoValue}>{user.username}</Text>
            </View>

            {user.role === 'student' && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Группа:</Text>
                <Text style={styles.infoValue}>{user.group || 'Не указана'}</Text>
              </View>
            )}

            {user.role === 'teacher' && (
              <>
                {user.department && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Кафедра:</Text>
                    <Text style={styles.infoValue}>{user.department}</Text>
                  </View>
                )}
                {user.position && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Должность:</Text>
                    <Text style={styles.infoValue}>{user.position}</Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {/* Меню дополнительных разделов */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Дополнительно</Text>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleDocuments}
          >
            <Ionicons name="document-text-outline" size={22} color="#555" />
            <View style={styles.menuItemTextContainer}>
              <Text style={styles.menuItemText}>Справки</Text>
              <Text style={styles.menuItemDescription}>
                Заказ и получение справок
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#aaa" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/notification-settings')}
          >
            <Ionicons name="notifications-outline" size={22} color="#555" />
            <View style={styles.menuItemTextContainer}>
              <Text style={styles.menuItemText}>Уведомления</Text>
              <Text style={styles.menuItemDescription}>
                Настройки push-уведомлений
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#aaa" />
          </TouchableOpacity>
        </View>

        {/* Секция верификации для неверифицированных студентов */}
        {user.role === 'student' && user.verificationStatus !== 'verified' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Верификация</Text>
            <View style={styles.verificationContainer}>
              <Text style={styles.verificationInfoText}>
                {user.verificationStatus === 'pending'
                  ? 'Ваш студенческий билет находится на проверке. Обычно это занимает 1-2 рабочих дня.'
                  : user.verificationStatus === 'rejected'
                  ? 'Ваш студенческий билет был отклонен. Пожалуйста, загрузите новую фотографию.'
                  : 'Для доступа ко всем функциям приложения необходимо подтвердить, что вы являетесь студентом университета.'}
              </Text>

              {(user.verificationStatus === 'unverified' || user.verificationStatus === 'rejected') && (
                <TouchableOpacity
                  style={styles.verificationButton}
                  onPress={handleVerification}
                >
                  <Ionicons name="camera-outline" size={20} color="#fff" />
                  <Text style={styles.verificationButtonText}>
                    {user.verificationStatus === 'rejected'
                      ? 'Загрузить новый студенческий'
                      : 'Верифицировать студенческий'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Кнопка выхода */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color="#fff" />
          <Text style={styles.logoutButtonText}>Выйти из аккаунта</Text>
        </TouchableOpacity>

        {/* Версия приложения */}
        <Text style={styles.versionText}>Версия: 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// Оставляем стили без изменений
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
  scrollContent: {
    padding: 20,
    paddingBottom: 30,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 60,
    height: 60,
    marginBottom: 16,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#770002',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  badgeContainer: {
    flexDirection: 'row',
    marginBottom: 8,
    gap: 8,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  roleText: {
    fontSize: 12,
    color: '#555',
    marginLeft: 4,
  },
  verificationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  verifiedBadge: {
    backgroundColor: '#E8F5E9',
  },
  pendingBadge: {
    backgroundColor: '#E1F5FE',
  },
  unverifiedBadge: {
    backgroundColor: '#FFF3E0',
  },
  rejectedBadge: {
    backgroundColor: '#FFEBEE',
  },
  verificationText: {
    fontSize: 12,
    marginLeft: 4,
  },
  verifiedText: {
    color: '#2E7D32',
  },
  pendingText: {
    color: '#0277BD',
  },
  unverifiedText: {
    color: '#F57C00',
  },
  rejectedText: {
    color: '#C62828',
  },
  groupContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupText: {
    fontSize: 14,
    color: '#555',
    marginLeft: 6,
  },
  section: {
    backgroundColor: '#fff',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  infoContainer: {
    padding: 12,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  infoLabel: {
    width: 110,
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  // Стили для меню
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuItemTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  menuItemDescription: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
  verificationContainer: {
    padding: 16,
  },
  verificationInfoText: {
    color: '#555',
    marginBottom: 16,
  },
  verificationButton: {
    backgroundColor: '#770002',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  verificationButtonText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#770002',
    borderRadius: 8,
    paddingVertical: 12,
    marginBottom: 16,
  },
  logoutButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
    marginLeft: 8,
  },
  versionText: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#555',
    marginBottom: 20,
  },
  loginButton: {
    backgroundColor: '#770002',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  loginButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});