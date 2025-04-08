import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Alert
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import apiClient from '../src/api/apiClient';
import chatService from '../src/services/chatService';

export default function NewChatScreen() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [processingUser, setProcessingUser] = useState(null);
  const { user } = useAuth();

  // Определяем, кого показывать в списке на основе роли текущего пользователя
  const targetRole = user?.role === 'student' ? 'teacher' : 'student';
  const roleTitle = targetRole === 'teacher' ? 'преподавателей' : 'студентов';

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);

      if (!user || !user.role) {
        throw new Error('Информация о пользователе отсутствует');
      }

      console.log(`Current user role: ${user.role}, loading users with role: ${targetRole}`);

      try {
        // Получаем пользователей с сервера ТОЛЬКО с нужной ролью
        const response = await apiClient.get('/users', {
          params: { role: targetRole }
        });

        console.log(`Loaded ${response.data?.length || 0} ${targetRole} from API`);
        setUsers(response.data || []);
      } catch (error) {
        console.error('Error loading users from API:', error);
        Alert.alert(
          'Ошибка загрузки',
          'Не удалось получить список пользователей. Проверьте подключение к интернету.',
          [{ text: 'OK' }]
        );
        setUsers([]);
      }
    } catch (error) {
      console.error('Error in loadUsers:', error);
      Alert.alert(
        'Ошибка',
        error.message || 'Произошла ошибка при загрузке пользователей'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSelectUser = async (selectedUser) => {
    if (processingUser) return; // Предотвращаем множественные нажатия

    try {
      setProcessingUser(selectedUser.id);

      // Инициализируем сервис чата
      const initResult = await chatService.initialize();
      if (!initResult) {
        Alert.alert(
          'Ошибка',
          'Не удалось инициализировать сервис чата. Возможно, отсутствует подключение к интернету.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Создаем личный чат
      const chatId = await chatService.createPersonalChat(selectedUser.id);
      if (!chatId) {
        throw new Error('Failed to create chat - no chat ID returned');
      }

      // Переходим в чат
      router.replace(`/chat/${chatId}`);
    } catch (error) {
      console.error('Error creating chat:', error);
      Alert.alert(
        'Ошибка',
        'Не удалось создать чат. Пожалуйста, попробуйте еще раз.',
        [{ text: 'OK' }]
      );
    } finally {
      setProcessingUser(null);
    }
  };

  const filteredUsers = users.filter(user => {
    if (!user) return false;

    const searchLower = searchText.toLowerCase();
    return (
      (user.fullName?.toLowerCase() || '').includes(searchLower) ||
      (user.username?.toLowerCase() || '').includes(searchLower) ||
      (user.department?.toLowerCase() || '').includes(searchLower) ||
      (user.group?.toLowerCase() || '').includes(searchLower) ||
      (user.position?.toLowerCase() || '').includes(searchLower) ||
      (user.faculty?.toLowerCase() || '').includes(searchLower)
    );
  });

  const renderUserItem = ({ item }) => {
    if (!item) return null;

    // Формируем подзаголовок в зависимости от роли пользователя
    let subtitle = item.role === 'teacher' ? 'Преподаватель' : 'Студент';

    if (item.role === 'teacher') {
      if (item.department) {
        subtitle = `${subtitle} • ${item.department}`;
      }
      if (item.position) {
        subtitle = `${subtitle} • ${item.position}`;
      }
    } else { // student
      if (item.group) {
        subtitle = `${subtitle} • ${item.group}`;
      }
      if (item.faculty) {
        subtitle = `${subtitle} • ${item.faculty}`;
      }
    }

    const isProcessing = processingUser === item.id;
    const displayName = item.fullName || item.username || "Пользователь";
    const initials = (displayName || "??").substring(0, 2).toUpperCase();

    return (
      <TouchableOpacity
        style={styles.userItem}
        onPress={() => handleSelectUser(item)}
        disabled={isProcessing}
      >
        <View style={[
          styles.avatar,
          item.role === 'teacher' ? styles.teacherAvatar : styles.studentAvatar
        ]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        <View style={styles.userInfo}>
          <Text style={styles.userName}>{displayName}</Text>
          <Text style={styles.userSubtitle}>{subtitle}</Text>
        </View>

        {isProcessing ? (
          <ActivityIndicator size="small" color="#770002" />
        ) : (
          <Ionicons name="chevron-forward" size={20} color="#999" />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Новый чат',
          headerTintColor: '#770002',
        }}
      />

      <View style={styles.headerContainer}>
        <Text style={styles.headerText}>
          {targetRole === 'teacher'
            ? 'Выберите преподавателя для начала общения'
            : 'Выберите студента для начала общения'}
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" />
        <TextInput
          style={styles.searchInput}
          placeholder={`Поиск ${roleTitle}...`}
          value={searchText}
          onChangeText={setSearchText}
        />
        {searchText ? (
          <TouchableOpacity onPress={() => setSearchText('')}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#770002" />
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          renderItem={renderUserItem}
          keyExtractor={item => String(item?.id || Math.random())}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>
                {searchText
                  ? 'По вашему запросу ничего не найдено'
                  : `Нет доступных ${roleTitle} для общения`}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#770002',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  teacherAvatar: {
    backgroundColor: '#2E7D32', // Зеленый для преподавателей
  },
  studentAvatar: {
    backgroundColor: '#0277BD', // Синий для студентов
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  userSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
  },
});