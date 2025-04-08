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

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);

      // Определяем, кого искать - для студентов преподавателей, для преподавателей студентов
      const targetRole = user?.role === 'student' ? 'teacher' : 'student';

      try {
        // Получаем пользователей с сервера
        const response = await apiClient.get('/users', {
          params: { role: targetRole }
        });

        setUsers(response.data || []);
      } catch (error) {
        console.error('Error loading users from API:', error);
        Alert.alert(
          'Ошибка загрузки',
          'Не удалось получить список пользователей. Проверьте подключение к интернету.',
          [{ text: 'OK' }]
        );
        // Устанавливаем пустой массив пользователей в случае ошибки
        setUsers([]);
      }
    } catch (error) {
      console.error('Error in loadUsers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectUser = async (selectedUser) => {
    if (processingUser) return; // Предотвращаем множественные нажатия

    try {
      setProcessingUser(selectedUser.id);

      // Проверяем инициализацию сервиса
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
    const searchLower = searchText.toLowerCase();
    return (
      (user.fullName?.toLowerCase() || '').includes(searchLower) ||
      (user.username?.toLowerCase() || '').includes(searchLower) ||
      (user.department?.toLowerCase() || '').includes(searchLower) ||
      (user.group?.toLowerCase() || '').includes(searchLower)
    );
  });

  const renderUserItem = ({ item }) => {
    let subtitle = item.role === 'teacher' ? 'Преподаватель' : 'Студент';
    if (item.department) {
      subtitle = `${subtitle} • ${item.department}`;
    } else if (item.group) {
      subtitle = `${subtitle} • ${item.group}`;
    }

    const isProcessing = processingUser === item.id;

    return (
      <TouchableOpacity
        style={styles.userItem}
        onPress={() => handleSelectUser(item)}
        disabled={isProcessing}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(item.fullName || item.username || "??").substring(0, 2).toUpperCase()}
          </Text>
        </View>

        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.fullName || item.username || "Пользователь"}</Text>
          <Text style={styles.userSubtitle}>{subtitle}</Text>
        </View>

        {isProcessing && (
          <ActivityIndicator size="small" color="#770002" />
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

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" />
        <TextInput
          style={styles.searchInput}
          placeholder="Поиск..."
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
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {searchText
                  ? 'По вашему запросу ничего не найдено'
                  : 'Нет доступных пользователей'}
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
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
});