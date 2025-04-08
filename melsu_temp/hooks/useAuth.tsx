// File: melsu_temp/hooks/useAuth.tsx
import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { AppState, AppStateStatus } from 'react-native';
import authApi from '../src/api/authApi';
import userApi from '../src/api/userApi';
import chatService from '../src/services/chatService'; // Импортируем chatService

// Add refresh interval in milliseconds (check every 30 seconds)
const VERIFICATION_CHECK_INTERVAL = 30000;

// Типы для пользовательских данных
export type UserRole = 'student' | 'teacher' | 'admin';
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

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
  studentCardImage?: string;
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
  cancelVerification: () => Promise<boolean>;
  reuploadStudentCard: (imageUri: string) => Promise<void>;
  manuallyCheckVerificationStatus: () => Promise<void>;
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
  const appState = useRef(AppState.currentState);
  const checkInterval = useRef<NodeJS.Timeout | null>(null);

  // Function to check verification status and update if changed
  const checkVerificationUpdate = async () => {
    // Only check if user is authenticated and is a student
    if (!isAuthenticated || !user || user.role !== 'student') {
      return;
    }

    try {
      const { status } = await userApi.getVerificationStatus();

      // Update user data if status has changed
      if (user.verificationStatus !== status) {
        console.log(`Verification status changed: ${user.verificationStatus} -> ${status}`);
        const updatedUser = { ...user, verificationStatus: status };
        setUser(updatedUser);
        await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
      }
    } catch (error) {
      console.error('Error checking verification status:', error);
    }
  };

  // Start periodic checking
  const startPeriodicChecking = () => {
    if (checkInterval.current) {
      clearInterval(checkInterval.current);
    }

    checkInterval.current = setInterval(() => {
      checkVerificationUpdate();
    }, VERIFICATION_CHECK_INTERVAL);
  };

  // Stop periodic checking
  const stopPeriodicChecking = () => {
    if (checkInterval.current) {
      clearInterval(checkInterval.current);
      checkInterval.current = null;
    }
  };

  // Handle app state changes (background/foreground)
  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // App has come to the foreground - check status immediately
      checkVerificationUpdate();
    }

    // Save current state
    appState.current = nextAppState;
  };

  // Set up app state change listener
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [user]);

  // Start/stop periodic checking based on authentication state
  useEffect(() => {
    if (isAuthenticated && user?.role === 'student') {
      startPeriodicChecking();
    } else {
      stopPeriodicChecking();
    }

    return () => {
      stopPeriodicChecking();
    };
  }, [isAuthenticated, user?.role]);

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
        studentCardImage: userData.studentCardImage,
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

  // Авторизация с полной очисткой кэша
  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      // Перед входом в новый аккаунт сбрасываем сервис чатов
      console.log('Resetting chat service before login');

      // Полный сброс chatService
      if (typeof chatService.reset === 'function') {
        chatService.reset();
      } else {
        chatService.cleanup(); // Используем cleanup, если reset не доступен
        chatService.initialized = false;
        chatService.currentUser = null;
      }

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
      // Формируем данные для регистрации
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

      return { token, user };
    } catch (error) {
      console.error('Ошибка при регистрации:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Выход из аккаунта с полной очисткой кэша
  // Обновление функции logout в useAuth.tsx
// Найдите метод logout и замените его на следующую версию

// В файле useAuth.tsx:

// Обновленный метод logout с отменой регистрации токена устройства
const logout = async () => {
  setIsLoading(true);
  try {
    // Вызываем API для выхода
    await authApi.logout();

    // ВАЖНО: сначала отменяем регистрацию токена устройства через chatService
    console.log('Unregistering device token before logout...');
    try {
      // Если chatService инициализирован, вызываем сброс состояния
      // который также отменит регистрацию токена
      await chatService.reset();
    } catch (chatError) {
      console.error('Error resetting chat service during logout:', chatError);
    }

    // ВАЖНО: Полностью сбрасываем состояние сервиса чатов перед выходом
    console.log('Resetting chat service and clearing all cached data');

    // Удаляем данные сессии
    await SecureStore.deleteItemAsync('userToken');
    await AsyncStorage.removeItem('userData');

    // Очищаем кэш AsyncStorage - РАДИКАЛЬНОЕ РЕШЕНИЕ
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys);
    console.log('AsyncStorage cache completely cleared');

    // Сбрасываем состояние
    setUser(null);
    setIsAuthenticated(false);

    // Перенаправляем на экран входа
    router.replace('/login');
  } catch (error) {
    console.error('Ошибка при выходе:', error);

    // Даже при ошибке выполняем сброс кэша и чатов
    try {
      await chatService.reset();
    } catch (chatError) {
      console.error('Error resetting chat service during error handling:', chatError);
    }

    await SecureStore.deleteItemAsync('userToken');

    // Радикальная очистка AsyncStorage
    try {
      const keys = await AsyncStorage.getAllKeys();
      await AsyncStorage.multiRemove(keys);
      console.log('AsyncStorage cache cleared despite error');
    } catch (storageError) {
      console.error('Error clearing AsyncStorage:', storageError);
    }

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

  // Повторная загрузка фото студенческого билета
  const reuploadStudentCard = async (imageUri: string) => {
    setIsLoading(true);
    try {
      // Отправляем фото на сервер
      await userApi.reuploadStudentCard(imageUri);

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
      console.error('Ошибка при повторной загрузке фото студенческого:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Отмена верификации для повторной загрузки
  const cancelVerification = async () => {
    try {
      await userApi.cancelVerification();

      // Обновляем статус пользователя
      if (user) {
        const updatedUser = { ...user, verificationStatus: 'unverified' as VerificationStatus };
        setUser(updatedUser);
        await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
      }

      return true;
    } catch (error) {
      console.error('Ошибка при отмене верификации:', error);
      throw error;
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

  // Check verification status manually (e.g., on screen focus)
  const manuallyCheckVerificationStatus = async () => {
    try {
      await checkVerificationStatus();
    } catch (error) {
      console.error('Error in manual verification check:', error);
      throw error;
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
        refreshUserProfile,
        cancelVerification,
        reuploadStudentCard,
        manuallyCheckVerificationStatus
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