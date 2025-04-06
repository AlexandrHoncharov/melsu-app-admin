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
  SafeAreaView,
  Keyboard,
  TouchableWithoutFeedback
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const { login, isLoading, isAuthenticated } = useAuth();

  // Проверяем, авторизован ли пользователь
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated]);

  const handleLogin = async () => {
    // Сбрасываем предыдущую ошибку
    setLoginError(null);

    // Проверяем заполненность полей
    if (!username.trim()) {
      setLoginError('Введите логин');
      return;
    }

    if (!password) {
      setLoginError('Введите пароль');
      return;
    }

    try {
      // Вызываем API для входа в систему
      await login(username, password);
    } catch (error) {
      // Отображаем ошибку под формой, а не в алерте
      setLoginError((error as Error).message);
    }
  };

  const toggleSecureTextEntry = () => {
    setSecureTextEntry(!secureTextEntry);
  };

  // Скрытие клавиатуры при нажатии вне полей ввода
  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  return (
    <TouchableWithoutFeedback onPress={dismissKeyboard}>
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.content}
        >
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/images/university-logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.title}>Вход в систему</Text>
          </View>

          <View style={styles.formContainer}>
            <View style={[
              styles.inputContainer,
              loginError && !username && styles.inputError
            ]}>
              <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Логин"
                placeholderTextColor="#999"
                value={username}
                onChangeText={(text) => {
                  setUsername(text);
                  setLoginError(null); // Сбрасываем ошибку при вводе
                }}
                autoCapitalize="none"
                testID="login-username"
              />
            </View>

            <View style={[
              styles.inputContainer,
              loginError && !password && styles.inputError
            ]}>
              <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Пароль"
                placeholderTextColor="#999"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setLoginError(null); // Сбрасываем ошибку при вводе
                }}
                secureTextEntry={secureTextEntry}
                testID="login-password"
              />
              <TouchableOpacity onPress={toggleSecureTextEntry} style={styles.passwordToggle}>
                <Ionicons
                  name={secureTextEntry ? "eye-outline" : "eye-off-outline"}
                  size={20}
                  color="#666"
                />
              </TouchableOpacity>
            </View>

            {loginError && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color="#d32f2f" />
                <Text style={styles.errorText}>{loginError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.loginButton}
              onPress={handleLogin}
              disabled={isLoading}
              testID="login-button"
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginButtonText}>Войти</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.registerContainer}>
            <Text style={styles.registerText}>Нет учетной записи?</Text>
            <Link href="/register" asChild>
              <TouchableOpacity testID="register-link">
                <Text style={styles.registerLink}>Зарегистрироваться</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  formContainer: {
    marginBottom: 30,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  inputError: {
    borderColor: '#d32f2f',
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
  passwordToggle: {
    padding: 10,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
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
  loginButton: {
    backgroundColor: '#770002',
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  registerText: {
    fontSize: 14,
    color: '#555',
    marginRight: 5,
  },
  registerLink: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#770002',
  },
});