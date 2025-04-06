import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
  SafeAreaView
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

// Типы для ошибок валидации
interface ValidationErrors {
  fullName?: string;
  password?: string;
  confirmPassword?: string;
  group?: string;
}

export default function RegisterScreen() {
  // Состояния для полей формы
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [group, setGroup] = useState('');
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  const { register, isLoading, isAuthenticated } = useAuth();

  // Проверяем, авторизован ли пользователь
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated]);

  // Регистрация
  // Update the handleRegister function in register.tsx

const handleRegister = async () => {
  // Сбрасываем ошибки
  setErrors({});
  setGeneralError(null);

  // Проверяем заполненность полей
  const newErrors: ValidationErrors = {};

  if (!fullName.trim()) {
    newErrors.fullName = 'Введите ФИО';
  } else if (fullName.trim().split(' ').length < 2) {
    newErrors.fullName = 'Введите фамилию и имя';
  }

  if (!password) {
    newErrors.password = 'Введите пароль';
  } else if (password.length < 6) {
    newErrors.password = 'Пароль должен содержать минимум 6 символов';
  }

  if (password !== confirmPassword) {
    newErrors.confirmPassword = 'Пароли не совпадают';
  }

  if (!group.trim()) {
    newErrors.group = 'Введите группу';
  }

  // Если есть ошибки, показываем их и прерываем отправку
  if (Object.keys(newErrors).length > 0) {
    setErrors(newErrors);
    return;
  }

  try {
    // Вызываем API для регистрации
    const result = await register({
      fullName,
      password,
      group,
      role: 'student'
    });

    // Show success message with generated username
    Alert.alert(
      'Регистрация успешна',
      `Ваш логин: ${result.user.username}\nЗапишите его для будущего входа в систему.`,
      [
        {
          text: 'OK',
          onPress: () => {
            // Continue with normal flow - either to verification or tabs
            if (result.user.role === 'student' && result.user.verificationStatus === 'unverified') {
              router.replace('/verification');
            } else {
              router.replace('/(tabs)');
            }
          }
        }
      ]
    );
  } catch (error) {
    setGeneralError((error as Error).message);
  }
};

  // Переключение видимости пароля
  const toggleSecureTextEntry = () => {
    setSecureTextEntry(!secureTextEntry);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <Stack.Screen
        options={{
          title: 'Регистрация',
          headerTintColor: '#770002',
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Image
            source={require('../assets/images/university-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.title}>Регистрация</Text>

          {generalError && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color="#d32f2f" />
              <Text style={styles.errorText}>{generalError}</Text>
            </View>
          )}

          <View style={styles.formContainer}>
            {/* ФИО */}
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>ФИО</Text>
              <View style={[
                styles.inputContainer,
                errors.fullName ? styles.inputError : {}
              ]}>
                <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Иванов Иван Иванович"
                  placeholderTextColor="#999"
                  value={fullName}
                  onChangeText={(text) => {
                    setFullName(text);
                    if (errors.fullName) {
                      setErrors(prev => ({ ...prev, fullName: undefined }));
                    }
                  }}
                  testID="register-fullname"
                />
              </View>
              {errors.fullName && (
                <Text style={styles.fieldErrorText}>{errors.fullName}</Text>
              )}
            </View>

            {/* Группа */}
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Учебная группа</Text>
              <View style={[
                styles.inputContainer,
                errors.group ? styles.inputError : {}
              ]}>
                <Ionicons name="people-outline" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="И-194"
                  placeholderTextColor="#999"
                  value={group}
                  onChangeText={(text) => {
                    setGroup(text);
                    if (errors.group) {
                      setErrors(prev => ({ ...prev, group: undefined }));
                    }
                  }}
                  testID="register-group"
                />
              </View>
              {errors.group && (
                <Text style={styles.fieldErrorText}>{errors.group}</Text>
              )}
            </View>

            {/* Пароль */}
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Пароль</Text>
              <View style={[
                styles.inputContainer,
                errors.password ? styles.inputError : {}
              ]}>
                <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Минимум 6 символов"
                  placeholderTextColor="#999"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errors.password) {
                      setErrors(prev => ({ ...prev, password: undefined }));
                    }
                  }}
                  secureTextEntry={secureTextEntry}
                  testID="register-password"
                />
                <TouchableOpacity onPress={toggleSecureTextEntry} style={styles.passwordToggle}>
                  <Ionicons
                    name={secureTextEntry ? "eye-outline" : "eye-off-outline"}
                    size={20}
                    color="#666"
                  />
                </TouchableOpacity>
              </View>
              {errors.password && (
                <Text style={styles.fieldErrorText}>{errors.password}</Text>
              )}
            </View>

            {/* Подтверждение пароля */}
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Подтверждение пароля</Text>
              <View style={[
                styles.inputContainer,
                errors.confirmPassword ? styles.inputError : {}
              ]}>
                <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Повторите пароль"
                  placeholderTextColor="#999"
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    if (errors.confirmPassword) {
                      setErrors(prev => ({ ...prev, confirmPassword: undefined }));
                    }
                  }}
                  secureTextEntry={secureTextEntry}
                  testID="register-confirm-password"
                />
              </View>
              {errors.confirmPassword && (
                <Text style={styles.fieldErrorText}>{errors.confirmPassword}</Text>
              )}
            </View>

            <View style={styles.noteContainer}>
              <Ionicons name="information-circle-outline" size={18} color="#2196F3" />
              <Text style={styles.noteText}>
                После регистрации вам потребуется верифицировать студенческий билет
              </Text>
            </View>

            <TouchableOpacity
              style={styles.registerButton}
              onPress={handleRegister}
              disabled={isLoading}
              testID="register-button"
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.registerButtonText}>Зарегистрироваться</Text>
              )}
            </TouchableOpacity>

            <View style={styles.loginContainer}>
              <Text style={styles.loginText}>Уже есть аккаунт?</Text>
              <TouchableOpacity onPress={() => router.back()} testID="login-link">
                <Text style={styles.loginLink}>Войти</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 24,
  },
  errorContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  formContainer: {
    width: '100%',
  },
  inputBlock: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 50,
    color: '#333',
    fontSize: 16,
  },
  inputError: {
    borderColor: '#d32f2f',
  },
  fieldErrorText: {
    color: '#d32f2f',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  passwordToggle: {
    padding: 10,
  },
  noteContainer: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    marginTop: 10,
  },
  noteText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: '#2196F3',
  },
  registerButton: {
    backgroundColor: '#770002',
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  registerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  loginText: {
    fontSize: 14,
    color: '#555',
    marginRight: 5,
  },
  loginLink: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#770002',
  },
});