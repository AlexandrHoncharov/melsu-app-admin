import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import authApi from '../src/api/authApi';
import userApi from '../src/api/userApi';

// Типы для пользовательских данных
export type UserRole = 'student' | 'teacher' | 'admin';
export type VerificationStatus = 'unverified' | 'pending' | 'verified';

export interface User {
  id: number;
  username: string;
  role: UserRole;
  verificationStatus?: VerificationStatus;
  fullName?: string;
  faculty?: string;
  group?: string;
  department?: string;
  position?: string;
}

// Интерфейс контекста авторизации
interface AuthContextProps {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  uploadStudentCard: (imageUri: string) => Promise<void>;
  checkVerificationStatus: () => Promise<VerificationStatus>;
  refreshUserProfile: () => Promise<void>;
}

// Данные для регистрации
interface RegisterData {
  fullName: string;
  password: string;
  group?: string;
  role: UserRole;
}

// Создание контекста
const AuthContext = createContext<AuthContextProps | undefined>(undefined);

// Провайдер контекста
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Проверка токена при запуске
  useEffect(() => {
    const loadToken = async () => {
      setIsLoading(true);
      try {
        const token = await SecureStore.getItemAsync('userToken');
        if (token) {
          // Пытаемся загрузить данные пользователя из AsyncStorage
          const userDataString = await AsyncStorage.getItem('userData');
          if (userDataString) {
            const userData = JSON.parse(userDataString) as User;
            setUser(userData);
            setIsAuthenticated(true);
          }

          // Обновляем данные пользователя с сервера
          try {
            await refreshUserProfile();
          } catch (error) {
            console.error('Ошибка при обновлении профиля:', error);
            // Если не удалось получить данные пользователя, но локальные данные есть,
            // то мы все равно считаем пользователя авторизованным
            if (!userDataString) {
              throw error; // перебрасываем ошибку, если нет локальных данных
            }
          }
        } else {
          // Если токена нет, пользователь не авторизован
          setIsAuthenticated(false);
          setUser(null);
        }
      } catch (error) {
        console.error('Ошибка при загрузке токена:', error);
        await logout();
      } finally {
        setIsLoading(false);
      }
    };

    loadToken();
  }, []);

  // Обновление профиля пользователя
  const refreshUserProfile = async () => {
    try {
      const userData = await authApi.getCurrentUser();

      // Преобразуем данные в формат User
      const user: User = {
        id: userData.id,
        username: userData.username,
        role: userData.role,
        verificationStatus: userData.verificationStatus,
        fullName: userData.fullName,
        group: userData.group,
        faculty: userData.faculty,
        // Дополнительные поля для преподавателей
        department: userData.department,
        position: userData.position
      };

      // Сохраняем данные
      setUser(user);
      await AsyncStorage.setItem('userData', JSON.stringify(user));
      setIsAuthenticated(true);

      return user;
    } catch (error) {
      console.error('Ошибка при получении профиля:', error);
      throw error;
    }
  };

  // Авторизация
  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const { token, user } = await authApi.login({ username, password });

      // Сохраняем токен
      await SecureStore.setItemAsync('userToken', token);

      // Сохраняем данные пользователя
      await AsyncStorage.setItem('userData', JSON.stringify(user));
      setUser(user);
      setIsAuthenticated(true);

      // Перенаправление в зависимости от роли и статуса верификации
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Ошибка при авторизации:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Регистрация
  const register = async (userData: RegisterData) => {
    setIsLoading(true);
    try {
      // Если нужно генерировать логин на сервере
      const registerData = {
        fullName: userData.fullName,
        password: userData.password,
        group: userData.group,
        role: userData.role
      };

      const { token, user } = await authApi.register(registerData);

      // Сохраняем токен
      await SecureStore.setItemAsync('userToken', token);

      // Сохраняем данные пользователя
      await AsyncStorage.setItem('userData', JSON.stringify(user));
      setUser(user);
      setIsAuthenticated(true);

      // Перенаправление на экран верификации или главную
      if (user.role === 'student' && user.verificationStatus === 'unverified') {
        router.replace('/verification');
      } else {
        router.replace('/(tabs)');
      }
    } catch (error) {
      console.error('Ошибка при регистрации:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Выход из аккаунта
  const logout = async () => {
    setIsLoading(true);
    try {
      // Вызываем API для выхода
      await authApi.logout();

      // Удаляем данные сессии
      await SecureStore.deleteItemAsync('userToken');
      await AsyncStorage.removeItem('userData');
      setUser(null);
      setIsAuthenticated(false);

      // Перенаправляем на экран входа
      router.replace('/login');
    } catch (error) {
      console.error('Ошибка при выходе:', error);
      // Даже при ошибке, удаляем данные сессии
      await SecureStore.deleteItemAsync('userToken');
      await AsyncStorage.removeItem('userData');
      setUser(null);
      setIsAuthenticated(false);
      router.replace('/login');
    } finally {
      setIsLoading(false);
    }
  };

  // Загрузка фото студенческого билета
  const uploadStudentCard = async (imageUri: string) => {
    setIsLoading(true);
    try {
      // Отправляем фото на сервер
      await userApi.uploadStudentCard(imageUri);

      // Обновляем статус верификации
      if (user) {
        const newUser = {
          ...user,
          verificationStatus: 'pending' as VerificationStatus
        };
        setUser(newUser);
        await AsyncStorage.setItem('userData', JSON.stringify(newUser));
      }

      return;
    } catch (error) {
      console.error('Ошибка при загрузке фото студенческого:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Проверка статуса верификации
  const checkVerificationStatus = async (): Promise<VerificationStatus> => {
    try {
      const { status } = await userApi.getVerificationStatus();

      // Обновляем данные пользователя
      if (user && user.verificationStatus !== status) {
        const updatedUser = { ...user, verificationStatus: status };
        setUser(updatedUser);
        await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
      }

      return status;
    } catch (error) {
      console.error('Ошибка при проверке статуса верификации:', error);
      return user?.verificationStatus || 'unverified';
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        login,
        register,
        logout,
        uploadStudentCard,
        checkVerificationStatus,
        refreshUserProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Хук для использования контекста
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth должен использоваться внутри AuthProvider');
  }
  return context;
};