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
  Image,
  SafeAreaView,
  RefreshControl,
  Dimensions,
  Platform,
  StatusBar,
  ImageBackground
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../hooks/useAuth';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

// Get screen dimensions
const { width, height } = Dimensions.get('window');

export default function ProfileScreen() {
  const { user, isLoading, logout, refreshUserProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  // Profile refresh handler
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshUserProfile();
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

  // Helper function to get status text for verification
  const getVerificationStatusText = (status) => {
    switch(status) {
      case 'verified': return 'Аккаунт верифицирован';
      case 'pending': return 'Верификация на рассмотрении';
      case 'rejected': return 'Верификация отклонена';
      default: return 'Требуется верификация';
    }
  };

  // Helper function to get verification icon
  const getVerificationIcon = (status) => {
    switch(status) {
      case 'verified': return "shield-checkmark";
      case 'pending': return "time";
      case 'rejected': return "close-circle";
      default: return "shield";
    }
  };

  // Helper function to get verification color
  const getVerificationColor = (status) => {
    switch(status) {
      case 'verified': return "#34C759";
      case 'pending': return "#FF9500";
      case 'rejected': return "#FF3B30";
      default: return "#8E8E93";
    }
  };

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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#bb0000']}
            tintColor="#bb0000"
          />
        }
      >
        {/* Header with user info and stats */}
        <View style={styles.headerContainer}>
          <LinearGradient
            colors={['#bb0000', '#770000']}
            style={styles.headerGradient}
          >
            <View style={styles.headerContent}>
              <View style={styles.avatarOuterContainer}>
                <View style={styles.avatarInnerContainer}>
                  <Text style={styles.avatarText}>{avatarLetter}</Text>
                </View>
              </View>

              <Text style={styles.userNameHeader}>
                {user.fullName || user.username}
              </Text>

              <View style={styles.userRoleBadge}>
                <Text style={styles.userRoleBadgeText}>
                  {getRoleText(user.role)}
                </Text>
              </View>

              {/* Details row */}
              <View style={styles.detailsRow}>
                {user.group && (
                  <View style={styles.detailItem}>
                    <Ionicons name="people" size={16} color="#FFF" />
                    <Text style={styles.detailText}>{user.group}</Text>
                  </View>
                )}

                {user.department && (
                  <View style={styles.detailItem}>
                    <Ionicons name="business" size={16} color="#FFF" />
                    <Text style={styles.detailText}>{user.department}</Text>
                  </View>
                )}

                {user.faculty && (
                  <View style={styles.detailItem}>
                    <Ionicons name="school" size={16} color="#FFF" />
                    <Text style={styles.detailText}>{user.faculty}</Text>
                  </View>
                )}
              </View>

              {/* Verification status badge for students */}
              {user.role === 'student' && (
                <TouchableOpacity
                  style={[
                    styles.verificationBadge,
                    { backgroundColor: getVerificationColor(user.verificationStatus) + '20' }
                  ]}
                  onPress={() => router.push('/verification')}
                >
                  <Ionicons
                    name={getVerificationIcon(user.verificationStatus)}
                    size={16}
                    color={getVerificationColor(user.verificationStatus)}
                  />
                  <Text
                    style={[
                      styles.verificationText,
                      { color: getVerificationColor(user.verificationStatus) }
                    ]}
                  >
                    {getVerificationStatusText(user.verificationStatus)}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </LinearGradient>
        </View>

        {/* Menu Sections */}
        <View style={styles.contentContainer}>
          {/* Account Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Управление аккаунтом</Text>

            {/* Change Password */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => router.push('/profile/change-password')}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: '#E3F2FD' }]}>
                <Ionicons name="key" size={22} color="#1976D2" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuItemText}>Изменение пароля</Text>
                <Text style={styles.menuItemDescription}>
                  Обновите пароль вашей учетной записи
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>

            {/* Profile Edit */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => router.push('/profile/edit')}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="person" size={22} color="#43A047" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuItemText}>Редактировать профиль</Text>
                <Text style={styles.menuItemDescription}>
                  Обновите личную информацию
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          </View>

          {/* App Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Приложение</Text>

            {/* Student verification (only for students) */}
            {user.role === 'student' && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => router.push('/verification')}
              >
                <View style={[
                  styles.menuIconContainer,
                  { backgroundColor: getVerificationColor(user.verificationStatus) + '20' }
                ]}>
                  <Ionicons
                    name={getVerificationIcon(user.verificationStatus)}
                    size={22}
                    color={getVerificationColor(user.verificationStatus)}
                  />
                </View>
                <View style={styles.menuTextContainer}>
                  <Text style={styles.menuItemText}>Верификация студента</Text>
                  <Text style={styles.menuItemDescription}>
                    {getVerificationStatusText(user.verificationStatus)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>
            )}

            {/* Support/Help */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => router.push('/support')}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: '#FFF3E0' }]}>
                <Ionicons name="help-buoy" size={22} color="#F57C00" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuItemText}>Поддержка</Text>
                <Text style={styles.menuItemDescription}>
                  Получите помощь по использованию приложения
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>

            {/* About App */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => router.push('/about')}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: '#E8EAF6' }]}>
                <Ionicons name="information-circle" size={22} color="#3F51B5" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuItemText}>О приложении</Text>
                <Text style={styles.menuItemDescription}>
                  Информация о приложении и разработчиках
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          </View>

          {/* Logout button */}
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <Ionicons name="log-out" size={20} color="#FFF" />
            <Text style={styles.logoutText}>Выйти из аккаунта</Text>
          </TouchableOpacity>

          {/* Username & version info */}
          <View style={styles.footerInfo}>
            <Text style={styles.versionText}>
              Логин: {user.username}
            </Text>
            <Text style={styles.versionText}>
              Версия приложения 1.0.0
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
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  headerContainer: {
    width: '100%',
  },
  headerGradient: {
    paddingTop: Platform.OS === 'ios' ? 0 : StatusBar.currentHeight,
  },
  headerContent: {
    paddingTop: 30,
    paddingBottom: 40,
    alignItems: 'center',
  },
  avatarOuterContainer: {
    padding: 3,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginBottom: 12,
  },
  avatarInnerContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#bb0000',
  },
  userNameHeader: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  userRoleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    marginBottom: 12,
  },
  userRoleBadgeText: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '600',
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 20,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  detailText: {
    fontSize: 13,
    color: '#FFF',
    marginLeft: 6,
    fontWeight: '500',
  },
  verificationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 4,
  },
  verificationText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  contentContainer: {
    padding: 16,
    marginTop: -24,
  },
  sectionCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    marginLeft: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 6,
  },
  menuIconContainer: {
    width: 42,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    marginRight: 16,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuItemText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  menuItemDescription: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: 'row',
    backgroundColor: '#bb0000',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
    shadowColor: '#bb0000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  logoutText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  footerInfo: {
    marginBottom: 30,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  versionText: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
});