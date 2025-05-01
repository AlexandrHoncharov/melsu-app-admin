// File: melsu_temp/hooks/useAuth.tsx
import {createContext, ReactNode, useContext, useEffect, useRef, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {router} from 'expo-router';
import {AppState, AppStateStatus} from 'react-native';
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
  email?: string;
  verificationStatus?: VerificationStatus;
  fullName?: string;
  faculty?: string;
  group?: string;
  department?: string;
  position?: string;
  studentCardImage?: string;
  // Add speciality information
  speciality?: {
    id: number;
    code: string;
    name: string;
    form: string;
    formName: string;
  };
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

interface RegisterData {
  fullName: string;
  email: string;  // Add email field
  password: string;
  group?: string;
  role: UserRole;
  speciality?: SpecialityData;
}

interface SpecialityData {
  id: number;
  code: string;
  name: string;
  faculty: string;
  form: string;  // 'full-time', 'full-part', or 'correspondence'
  formName: string;
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
      console.log("API response for user profile:", userData);

      // Преобразуем данные в формат User
      const user: User = {
        id: userData.id,
        username: userData.username,
        role: userData.role,
        email: userData.email,
        verificationStatus: userData.verificationStatus,
        fullName: userData.fullName,
        group: userData.group,
        faculty: userData.faculty,
        studentCardImage: userData.studentCardImage,
        // Дополнительные поля для преподавателей
        department: userData.department,
        position: userData.position,
        // Важно! Сохраняем данные направления подготовки
        speciality: userData.speciality
      };

      // Логирование для отладки
      console.log("Speciality data from API:", userData.speciality);

      // Если speciality не пришел как объект, но есть отдельные поля, создаем объект
      if (!user.speciality && userData.speciality_id) {
        user.speciality = {
          id: userData.speciality_id,
          code: userData.speciality_code,
          name: userData.speciality_name,
          form: userData.study_form,
          formName: userData.study_form_name
        };
        console.log("Created speciality object from fields:", user.speciality);
      }

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

const login = async (identifier: string, password: string) => {
  setIsLoading(true);
  try {
    console.log('Starting login process...');

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

    // Здесь identifier может быть либо логином, либо email
    const { token, user } = await authApi.login(identifier, password);
    console.log('Login successful, storing tokens...');

    // Сохраняем токен
    await SecureStore.setItemAsync('userToken', token);

    // Сохраняем данные пользователя
    await AsyncStorage.setItem('userData', JSON.stringify(user));
    setUser(user);
    setIsAuthenticated(true);

    // Ожидаем малую паузу для инициализации состояния
    await new Promise(resolve => setTimeout(resolve, 300));

    console.log('Login complete, redirecting to main app');

    // Перенаправление в зависимости от роли и статуса верификации
    router.replace('/(tabs)');

    // Явно возвращаем данные для возможности использования в компонентах
    return { user, token };
  } catch (error) {
    console.error('Error during login:', error);
    throw error;
  } finally {
    setIsLoading(false);
  }
};

const register = async (userData: RegisterData) => {
  setIsLoading(true);
  try {
    // Формируем данные для регистрации
    const registerData = {
      fullName: userData.fullName,
      email: userData.email,  // Include email in the registration data
      password: userData.password,
      group: userData.group,
      role: userData.role,
      speciality: userData.speciality
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
}

// Enhanced logout function to ensure reliable token deletion
const logout = async () => {
  setIsLoading(true);
  try {
    console.log('Starting logout process...');

    // FIRST PHASE: Unregister device tokens before any other logout actions
    console.log('Unregistering device tokens before logout...');
    if (chatService) {
      try {
        // First, force unregistration of ALL device tokens
        const tokenUnregistered = await chatService.unregisterDeviceToken();
        console.log(`Device token unregistration ${tokenUnregistered ? 'successful' : 'failed'}`);

        // Then, reset the entire chat service state
        await chatService.reset();
        console.log('Chat service reset completed');
      } catch (chatError) {
        console.error('Error during chat service cleanup:', chatError);
        // Continue with logout even if this fails
      }
    }

    // SECOND PHASE: Directly call the device unregistration API
    try {
      // Get the token before we potentially delete it
      const token = await AsyncStorage.getItem('devicePushToken');
      if (token) {
        console.log(`Making direct API call to unregister token: ${token.substring(0, 10)}...`);
        try {
          await notificationsApi.unregisterDeviceToken(token);
          console.log('Direct API unregistration completed');
        } catch (directApiError) {
          console.warn('Direct API unregistration failed:', directApiError);
          // Continue with logout process
        }
      }
    } catch (tokenError) {
      console.warn('Error getting device token for direct unregistration:', tokenError);
    }

    // THIRD PHASE: Call the API logout endpoint to delete ALL tokens for this user from database
    try {
      // Get the current user ID before we clear any tokens
      const userData = await AsyncStorage.getItem('userData');
      const userId = userData ? JSON.parse(userData).id : null;

      // First, make sure we properly unregister the current device token
      const deviceToken = await AsyncStorage.getItem('devicePushToken');
      if (deviceToken) {
        try {
          console.log('Removing current token from database...');
          await apiClient.post('/device/unregister', {
            token: deviceToken,
            // Add authorization header explicitly in case it was cleared
            headers: {
              'Authorization': `Bearer ${await SecureStore.getItemAsync('userToken')}`
            }
          });
          console.log('Current token unregistration requested');
        } catch (tokenDbError) {
          console.warn('Error unregistering current token:', tokenDbError);
        }
      }

      // IMPORTANT: Force removal of ALL tokens for this user using both methods

      // Method 1: Try sending user_id directly
      if (userId) {
        try {
          console.log(`Explicitly requesting removal of ALL tokens for user ${userId}...`);
          await apiClient.post('/device/unregister/all', {
            user_id: userId,
            // Add authorization header explicitly
            headers: {
              'Authorization': `Bearer ${await SecureStore.getItemAsync('userToken')}`
            }
          });
          console.log('All user tokens deletion requested successfully with user_id');
        } catch (userIdError) {
          console.warn('Error requesting token deletion with user_id:', userIdError);

          // Method 2: Try alternate endpoint if first method fails
          try {
            console.log('Attempting alternate method for token deletion...');
            await apiClient.delete(`/api/user/${userId}/tokens`, {
              headers: {
                'Authorization': `Bearer ${await SecureStore.getItemAsync('userToken')}`
              }
            });
            console.log('Alternate token deletion method successful');
          } catch (alternateError) {
            console.warn('Alternate token deletion method also failed:', alternateError);
          }
        }
      }

      // Method 3: Try with session-based approach
      try {
        console.log('Requesting removal of ALL tokens for current user from database via session...');
        await apiClient.post('/device/unregister', {
          token: 'force_all_tokens_removal',
          all_user_tokens: true,
          // Add authorization header explicitly
          headers: {
            'Authorization': `Bearer ${await SecureStore.getItemAsync('userToken')}`
          }
        });
        console.log('All user tokens deletion from database requested via session');
      } catch (allTokensError) {
        console.warn('Error requesting all tokens deletion via session:', allTokensError);
      }

      // Standard logout call
      await authApi.logout();
      console.log('API logout successful');
    } catch (apiError) {
      console.warn('API logout error (continuing):', apiError);
      // Continue with local logout regardless of API result
    }

    // FOURTH PHASE: All SecureStore and AsyncStorage cleanup
    try {
      // Critical: First delete authentication token from SecureStore
      await SecureStore.deleteItemAsync('userToken');
      console.log('Auth token removed from SecureStore');

      // Then delete device token from AsyncStorage
      await AsyncStorage.removeItem('devicePushToken');
      console.log('Device token removed from AsyncStorage');

      // Remove user data
      await AsyncStorage.removeItem('userData');
      console.log('User data removed from AsyncStorage');

      // Get all AsyncStorage keys and remove everything except critical system keys
      const allKeys = await AsyncStorage.getAllKeys();
      const keysToRemove = allKeys.filter(key =>
          !key.startsWith('EXPO_CONSTANTS') &&
          !key.startsWith('SYSTEM_') &&
          !key.includes('PREFERENCES')
      );

      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
        console.log(`Removed ${keysToRemove.length} keys from AsyncStorage`);
      }
    } catch (storageError) {
      console.error('Error clearing storage:', storageError);

      // EMERGENCY CLEANUP: Try individual critical keys if bulk removal fails
      try {
        await SecureStore.deleteItemAsync('userToken');
        await AsyncStorage.removeItem('devicePushToken');
        await AsyncStorage.removeItem('userData');
        console.log('Emergency cleanup of critical keys completed');
      } catch (finalError) {
        console.error('Critical error during emergency cleanup:', finalError);
      }
    }

    // FIFTH PHASE: Firebase signout
    try {
      if (auth && auth.currentUser) {
        await auth.signOut();
        console.log('Firebase signout completed');
      }
    } catch (firebaseError) {
      console.warn('Firebase signout error:', firebaseError);
    }

    // FINAL PHASE: Reset app state
    setUser(null);
    setIsAuthenticated(false);

    console.log('Logout process complete, redirecting to login screen');
    router.replace('/login');
  } catch (error) {
    console.error('Unexpected error during logout:', error);

    // FAIL-SAFE: Force reset the app state regardless of errors
    setUser(null);
    setIsAuthenticated(false);

    // Forcibly delete the most critical tokens
    try {
      await SecureStore.deleteItemAsync('userToken');
      await AsyncStorage.removeItem('devicePushToken');
    } catch (e) {
      // Nothing more we can do here
    }

    router.replace('/login');
  } finally {
    setIsLoading(false);
    console.log('Logout process finished');
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