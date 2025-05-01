// File: hooks/useAuth.tsx
import {createContext, ReactNode, useContext, useEffect, useRef, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {Alert, AppState, AppStateStatus} from 'react-native';
import authApi from '../src/api/authApi';
import userApi from '../src/api/userApi';
import chatService from '../src/services/chatService';
import apiClient from '../src/api/apiClient';

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

// Storage key constants
const STORAGE_KEYS = {
  // Current user token
  USER_TOKEN: 'userToken',
  // Current user data
  USER_DATA: 'userData',
  // List of saved account IDs
  SAVED_ACCOUNTS: 'savedAccounts',
  // Prefix for saved account tokens
  ACCOUNT_TOKEN_PREFIX: 'account_token_',
  // Prefix for saved account data
  ACCOUNT_DATA_PREFIX: 'account_data_',
  // Selected account ID
  SELECTED_ACCOUNT_ID: 'selectedAccountId',
};

// Интерфейс контекста авторизации
interface AuthContextProps {
  user: User | null;
  savedAccounts: User[];
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string, addAccount?: boolean) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  uploadStudentCard: (imageUri: string) => Promise<void>;
  checkVerificationStatus: () => Promise<VerificationStatus>;
  refreshUserProfile: () => Promise<void>;
  cancelVerification: () => Promise<boolean>;
  reuploadStudentCard: (imageUri: string) => Promise<void>;
  manuallyCheckVerificationStatus: () => Promise<void>;
  switchAccount: (accountId: number) => Promise<void>;
  removeSavedAccount: (accountId: number) => Promise<void>;
}

interface RegisterData {
  fullName: string;
  email: string;
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
  form: string;
  formName: string;
}

// Создание контекста
const AuthContext = createContext<AuthContextProps | undefined>(undefined);

// Провайдер контекста
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<User[]>([]);
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
        await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(updatedUser));

        // Also update in saved accounts
        if (user.id) {
          await updateSavedAccountData(user.id, updatedUser);
        }
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

  // Load saved accounts
  const loadSavedAccounts = async () => {
    try {
      const savedAccountsJson = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_ACCOUNTS);
      const accountIds = savedAccountsJson ? JSON.parse(savedAccountsJson) : [];

      const accounts: User[] = [];

      for (const id of accountIds) {
        const accountDataJson = await AsyncStorage.getItem(`${STORAGE_KEYS.ACCOUNT_DATA_PREFIX}${id}`);
        if (accountDataJson) {
          try {
            const accountData = JSON.parse(accountDataJson) as User;
            accounts.push(accountData);
          } catch (e) {
            console.error(`Error parsing saved account data for ID ${id}:`, e);
          }
        }
      }

      setSavedAccounts(accounts);
      return accounts;
    } catch (error) {
      console.error('Error loading saved accounts:', error);
      return [];
    }
  };

  // Save account to storage
  const saveAccount = async (userData: User, token: string) => {
    try {
      if (!userData || !userData.id) {
        console.error('Cannot save account without user ID');
        return false;
      }

      const userId = userData.id;

      // 1. Update saved accounts list
      const savedAccountsJson = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_ACCOUNTS);
      const accountIds = savedAccountsJson ? JSON.parse(savedAccountsJson) : [];

      if (!accountIds.includes(userId)) {
        accountIds.push(userId);
        await AsyncStorage.setItem(STORAGE_KEYS.SAVED_ACCOUNTS, JSON.stringify(accountIds));
      }

      // 2. Save account data and token
      await AsyncStorage.setItem(`${STORAGE_KEYS.ACCOUNT_DATA_PREFIX}${userId}`, JSON.stringify(userData));
      await SecureStore.setItemAsync(`${STORAGE_KEYS.ACCOUNT_TOKEN_PREFIX}${userId}`, token);

      // 3. Refresh saved accounts list
      await loadSavedAccounts();

      return true;
    } catch (error) {
      console.error('Error saving account:', error);
      return false;
    }
  };

  // Update saved account data (without changing the token)
  const updateSavedAccountData = async (userId: number, userData: User) => {
    try {
      await AsyncStorage.setItem(`${STORAGE_KEYS.ACCOUNT_DATA_PREFIX}${userId}`, JSON.stringify(userData));

      // Refresh accounts list
      await loadSavedAccounts();
      return true;
    } catch (error) {
      console.error(`Error updating account data for user ${userId}:`, error);
      return false;
    }
  };

  // Проверка токена при запуске
  useEffect(() => {
    const loadToken = async () => {
      setIsLoading(true);
      try {
        // 1. Load saved accounts first
        const accounts = await loadSavedAccounts();

        // 2. Check if there's a selected account
        const selectedAccountId = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_ACCOUNT_ID);

        // 3. Try to load the selected account or the default token
        let token = null;
        let userData = null;

        if (selectedAccountId) {
          // Try to load the selected account
          token = await SecureStore.getItemAsync(`${STORAGE_KEYS.ACCOUNT_TOKEN_PREFIX}${selectedAccountId}`);
          const userDataJson = await AsyncStorage.getItem(`${STORAGE_KEYS.ACCOUNT_DATA_PREFIX}${selectedAccountId}`);

          if (token && userDataJson) {
            userData = JSON.parse(userDataJson);
            console.log(`Restored selected account: ${userData.username} (ID: ${userData.id})`);
          } else {
            console.log(`Selected account ID ${selectedAccountId} not found, falling back to default token`);
          }
        }

        // If no selected account is available, try the default token
        if (!token) {
          token = await SecureStore.getItemAsync(STORAGE_KEYS.USER_TOKEN);
          const userDataJson = await AsyncStorage.getItem(STORAGE_KEYS.USER_DATA);

          if (token && userDataJson) {
            userData = JSON.parse(userDataJson);
            console.log(`Restored default account: ${userData.username} (ID: ${userData.id})`);
          }
        }

        if (token && userData) {
          // Set up the current user with the token we found
          setUser(userData);
          setIsAuthenticated(true);

          // Store this as the active user token for API requests
          await SecureStore.setItemAsync(STORAGE_KEYS.USER_TOKEN, token);
          await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));

          // Store the ID as selected account
          if (userData.id) {
            await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_ACCOUNT_ID, userData.id.toString());
          }

          // Try to update profile in background
          try {
            await refreshUserProfile();
          } catch (profileError) {
            console.error('Error refreshing profile during startup:', profileError);
          }
        } else {
          // No valid token found
          setIsAuthenticated(false);
          setUser(null);
        }
      } catch (error) {
        console.error('Error loading token:', error);
        await logout();
      } finally {
        setIsLoading(false);
      }
    };

    loadToken();
  }, []);

  // Switch to another account
  const switchAccount = async (accountId: number) => {
    try {
      setIsLoading(true);

      // 1. Get token and data for the selected account
      const token = await SecureStore.getItemAsync(`${STORAGE_KEYS.ACCOUNT_TOKEN_PREFIX}${accountId}`);
      const userDataJson = await AsyncStorage.getItem(`${STORAGE_KEYS.ACCOUNT_DATA_PREFIX}${accountId}`);

      if (!token || !userDataJson) {
        throw new Error(`Account data not found for ID ${accountId}`);
      }

      // 2. Clean up current account resources
      if (chatService) {
        await chatService.cleanup();
      }

      // 3. Set the new account as active
      const userData = JSON.parse(userDataJson);

      // Update the current token in SecureStore (this is what apiClient uses)
      await SecureStore.setItemAsync(STORAGE_KEYS.USER_TOKEN, token);

      // Update current user data
      await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));

      // Save as selected account
      await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_ACCOUNT_ID, accountId.toString());

      // Update state
      setUser(userData);
      setIsAuthenticated(true);

      // 4. Initialize chat service with new user
      if (chatService) {
        await chatService.initialize();
      }

      // 5. Try to refresh profile in background
      try {
        await refreshUserProfile();
      } catch (error) {
        console.error('Error refreshing profile after account switch:', error);
      }

      console.log(`Successfully switched to account: ${userData.username} (ID: ${userData.id})`);
      return true;
    } catch (error) {
      console.error('Error switching account:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Remove saved account
  const removeSavedAccount = async (accountId: number) => {
    try {
      // Cannot remove the current account
      if (user && user.id === accountId) {
        Alert.alert(
            'Ошибка',
            'Невозможно удалить текущий аккаунт. Пожалуйста, сначала переключитесь на другой аккаунт.'
        );
        return;
      }

      // 1. Remove from saved accounts list
      const savedAccountsJson = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_ACCOUNTS);
      if (savedAccountsJson) {
        const accountIds = JSON.parse(savedAccountsJson);
        const updatedIds = accountIds.filter(id => id !== accountId);
        await AsyncStorage.setItem(STORAGE_KEYS.SAVED_ACCOUNTS, JSON.stringify(updatedIds));
      }

      // 2. Remove account data and token
      await AsyncStorage.removeItem(`${STORAGE_KEYS.ACCOUNT_DATA_PREFIX}${accountId}`);
      await SecureStore.deleteItemAsync(`${STORAGE_KEYS.ACCOUNT_TOKEN_PREFIX}${accountId}`);

      // 3. Refresh accounts list
      await loadSavedAccounts();

      console.log(`Account ${accountId} removed from saved accounts`);
      return true;
    } catch (error) {
      console.error('Error removing saved account:', error);
      throw error;
    }
  };

  // Get full user profile
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

      // Update current user state
      setUser(user);

      // Update user data in storage
      await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(user));

      // Also update in saved accounts if this is a saved account
      if (user.id) {
        await updateSavedAccountData(user.id, user);
      }

      setIsAuthenticated(true);

      return user;
    } catch (error) {
      console.error('Error refreshing user profile:', error);
      throw error;
    }
  };

// Updated login function to support adding multiple accounts
  const login = async (identifier: string, password: string, addAccount: boolean = false) => {
  setIsLoading(true);
  try {
    console.log(`Starting login process...${addAccount ? ' (adding account)' : ''}`);

    // Only reset chat service if we're not adding an account
    if (!addAccount) {
      console.log('Resetting chat service before login');
      if (typeof chatService.reset === 'function') {
        chatService.reset();
      } else {
        chatService.cleanup();
        chatService.initialized = false;
        chatService.currentUser = null;
      }
    }

    // Authenticate with the API
    const { token, user } = await authApi.login(identifier, password);
    console.log('Login successful, storing tokens...');

    // Save this account to our accounts list
    await saveAccount(user, token);

    // If we're adding an account without switching to it, don't change the current session
    if (addAccount && isAuthenticated) {
      console.log('Account added successfully, but keeping current session');
      setIsLoading(false);

      // Refresh the accounts list
      await loadSavedAccounts();

      return;
    }

    // Set this account as the active one
    await SecureStore.setItemAsync(STORAGE_KEYS.USER_TOKEN, token);
    await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(user));

    // Remember this as the selected account
    if (user.id) {
      await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_ACCOUNT_ID, user.id.toString());
    }

    setUser(user);
    setIsAuthenticated(true);

    // Allow a moment for state to update
    await new Promise(resolve => setTimeout(resolve, 300));

    console.log('Login complete, redirecting to main app');

    // Navigation is handled by the component

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
      email: userData.email,
      password: userData.password,
      group: userData.group,
      role: userData.role,
      speciality: userData.speciality
    };

    const { token, user } = await authApi.register(registerData);

    // Save account to our accounts system
    await saveAccount(user, token);

    // Set as current active account
    await SecureStore.setItemAsync(STORAGE_KEYS.USER_TOKEN, token);
    await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(user));

    // Remember this as the selected account
    if (user.id) {
      await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_ACCOUNT_ID, user.id.toString());
    }

    setUser(user);
    setIsAuthenticated(true);

    // Navigation will be handled by the component

    return { token, user };
  } catch (error) {
    console.error('Error during registration:', error);
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

    // Get current user ID before logout
    const currentUserId = user?.id;

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
          await apiClient.post('/device/unregister', {
            token: token,
            all_user_tokens: true
          });
          console.log('Direct API unregistration completed');
        } catch (directApiError) {
          console.warn('Direct API unregistration failed:', directApiError);
          // Continue with logout process
        }
      }
    } catch (tokenError) {
      console.warn('Error getting device token for direct unregistration:', tokenError);
    }

    try {
      // Standard logout call
      await authApi.logout();
      console.log('API logout successful');
    } catch (apiError) {
      console.warn('API logout error (continuing):', apiError);
      // Continue with local logout regardless of API result
    }

    // If this is a saved account, keep the data but clear current session
    if (currentUserId) {
      const savedAccountsJson = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_ACCOUNTS);
      const accountIds = savedAccountsJson ? JSON.parse(savedAccountsJson) : [];

      if (accountIds.includes(currentUserId)) {
        console.log(`User ${currentUserId} is a saved account, keeping stored data`);
        // Remove current token but keep the account token
      } else {
        console.log(`User ${currentUserId} is not a saved account, removing all data`);
        // If not a saved account, remove all data
      }
    }

    // CLEANUP CURRENT SESSION
    // Critical: Delete authentication token from SecureStore
    await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_TOKEN);
    console.log('Current session token removed');

    // Remove current user data
    await AsyncStorage.removeItem(STORAGE_KEYS.USER_DATA);
    console.log('Current user data removed');

    // Clear selected account ID
    await AsyncStorage.removeItem(STORAGE_KEYS.SELECTED_ACCOUNT_ID);
    console.log('Selected account cleared');

    // Remove device token
    await AsyncStorage.removeItem('devicePushToken');
    console.log('Device token removed');

    // FINAL PHASE: Reset app state
    setUser(null);
    setIsAuthenticated(false);

    console.log('Logout process complete');
    return true;
  } catch (error) {
    console.error('Unexpected error during logout:', error);

    // FAIL-SAFE: Force reset the app state regardless of errors
    setUser(null);
    setIsAuthenticated(false);

    // Forcibly delete the most critical tokens
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_TOKEN);
      await AsyncStorage.removeItem(STORAGE_KEYS.USER_DATA);
      await AsyncStorage.removeItem(STORAGE_KEYS.SELECTED_ACCOUNT_ID);
    } catch (e) {
      // Nothing more we can do here
    }

    return false;
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
        await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(newUser));

        // Also update in saved accounts
        if (user.id) {
          await updateSavedAccountData(user.id, newUser);
        }
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
        await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(newUser));

        // Also update in saved accounts
        if (user.id) {
          await updateSavedAccountData(user.id, newUser);
        }
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
        await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(updatedUser));

        // Also update in saved accounts
        if (user.id) {
          await updateSavedAccountData(user.id, updatedUser);
        }
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
        await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(updatedUser));

        // Also update in saved accounts
        if (user.id) {
          await updateSavedAccountData(user.id, updatedUser);
        }
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
        savedAccounts,
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
        manuallyCheckVerificationStatus,
        switchAccount,
        removeSavedAccount
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