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

// Update RegisterData interface
interface RegisterData {
  fullName: string;
  password: string;
  group?: string;
  role: UserRole;
  speciality?: SpecialityData;  // Add this field
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

// This is just the relevant login method from hooks/useAuth.tsx that needs updating
// The rest of the file would remain the same

const login = async (username: string, password: string) => {
  setIsLoading(true);
  try {
    console.log('Starting login process...');

    // Before logging into a new account, reset notification services
    console.log('Resetting notification services before login');

    // Reset OneSignal service safely with error handling
    try {
      // Import OneSignal service
      const oneSignalService = (await import('../src/services/OneSignalService')).default;

      if (oneSignalService) {
        await oneSignalService.reset().catch(e => {
          console.warn('Non-critical error resetting OneSignal:', e);
          // Continue login process even if reset fails
        });
      }
    } catch (oneSignalError) {
      console.warn('Error importing or resetting OneSignal (continuing login):', oneSignalError);
      // Continue with login even if OneSignal reset fails
    }

    // Reset chat service
    try {
      if (typeof chatService.reset === 'function') {
        chatService.reset().catch(e => {
          console.warn('Non-critical error resetting chat service:', e);
          // Continue login process even if reset fails
        });
      } else {
        chatService.cleanup();
        chatService.initialized = false;
        chatService.currentUser = null;
      }
    } catch (chatError) {
      console.warn('Error resetting chat service (continuing login):', chatError);
      // Continue with login even if chat service reset fails
    }

    // Proceed with login API call
    const { token, user } = await authApi.login({ username, password });
    console.log('Login successful, storing tokens...');

    // Save token
    await SecureStore.setItemAsync('userToken', token);

    // Save user data
    await AsyncStorage.setItem('userData', JSON.stringify(user));
    setUser(user);
    setIsAuthenticated(true);

    // Initialize OneSignal with user ID - do this safely
    try {
      const oneSignalService = (await import('../src/services/OneSignalService')).default;

      if (oneSignalService) {
        await oneSignalService.initialize().catch(e => {
          console.warn('Non-critical error initializing OneSignal:', e);
        });

        await oneSignalService.registerForPushNotifications(user.id.toString()).catch(e => {
          console.warn('Non-critical error registering for push notifications:', e);
        });
      }
    } catch (oneSignalError) {
      console.warn('Error with OneSignal operations (continuing):', oneSignalError);
      // Continue with login even if OneSignal operations fail
    }

    // Wait for small pause for state initialization
    await new Promise(resolve => setTimeout(resolve, 300));

    console.log('Login complete, redirecting to main app');

    // Redirect based on role and verification status
    router.replace('/(tabs)');

    // Explicitly return data for potential use in components
    return { user, token };
  } catch (error) {
    console.error('Error during login:', error);
    throw error;
  } finally {
    setIsLoading(false);
  }
};

// Similar improvements would be needed for the logout function

  // Update the register function
const register = async (userData: RegisterData) => {
  setIsLoading(true);
  try {
    // Формируем данные для регистрации
    const registerData = {
      fullName: userData.fullName,
      password: userData.password,
      group: userData.group,
      role: userData.role,
      speciality: userData.speciality  // Add speciality data
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

// This is just the relevant logout method from hooks/useAuth.tsx that needs updating
// The rest of the file would remain the same

const logout = async () => {
  setIsLoading(true);
  try {
    console.log('Starting logout process...');

    // CRITICAL: First unregister device tokens before any other logout actions
    console.log('Unregistering device tokens before logout...');

    // Try to reset OneSignal service safely
    try {
      // Import OneSignal service
      const oneSignalService = (await import('../src/services/OneSignalService')).default;

      if (oneSignalService) {
        try {
          // Reset OneSignal - this will unregister device tokens and clean up
          await oneSignalService.reset();
          console.log('OneSignal reset completed');
        } catch (resetError) {
          console.warn('Non-critical error during OneSignal reset:', resetError);
          // Continue with logout even if this fails
        }
      } else {
        console.warn('OneSignal service not available - continuing logout');
      }
    } catch (oneSignalImportError) {
      console.warn('Error importing OneSignal service:', oneSignalImportError);
      // Continue with logout even if this fails
    }

    // Clean up chat service
    if (chatService) {
      try {
        // First, force unregistration of ALL device tokens
        try {
          const tokenUnregistered = await chatService.unregisterDeviceToken();
          console.log(`Device token unregistration ${tokenUnregistered ? 'successful' : 'failed'}`);
        } catch (tokenError) {
          console.warn('Non-critical error unregistering device token:', tokenError);
        }

        // Then, reset the entire chat service state
        try {
          await chatService.reset();
          console.log('Chat service reset completed');
        } catch (resetError) {
          console.warn('Non-critical error resetting chat service:', resetError);
        }
      } catch (chatError) {
        console.warn('Error during chat service cleanup (continuing):', chatError);
        // Continue with logout even if this fails
      }
    }

    // Only after token cleanup, call the API logout endpoint
    try {
      await authApi.logout();
      console.log('API logout successful');
    } catch (apiError) {
      console.warn('API logout error (continuing):', apiError);
      // Continue with local logout regardless of API result
    }

    // Now handle local session data cleanup
    try {
      await SecureStore.deleteItemAsync('userToken');
      await AsyncStorage.removeItem('userData');
      console.log('Auth tokens removed');

      // Targeted AsyncStorage cleanup instead of clearing everything
      const keysToRemove = [
        'userData',
        'devicePushToken',
        'onesignal_player_id',
        'onesignal_subscription_status',
        'onesignal_device_id',
        'onesignal_registration_status'
      ];

      await AsyncStorage.multiRemove(keysToRemove);
      console.log('Auth-related AsyncStorage data cleared');
    } catch (storageError) {
      console.warn('Error clearing storage (continuing):', storageError);
      // Continue with logout even if storage cleanup fails
    }

    // Final state reset
    setUser(null);
    setIsAuthenticated(false);

    console.log('Logout process complete, redirecting to login screen');
    router.replace('/login');
  } catch (error) {
    console.error('Unexpected error during logout:', error);

    // Emergency cleanup - do this no matter what
    try {
      // Force token removal
      await SecureStore.deleteItemAsync('userToken');
      await AsyncStorage.removeItem('userData');
    } catch (finalError) {
      console.error('Critical error during emergency cleanup:', finalError);
    }

    // Force state reset and navigation regardless of errors
    setUser(null);
    setIsAuthenticated(false);
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