// File: melsu_temp/app/(tabs)/profile/change-password.tsx
import React, {useState} from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    ScrollView,
    SafeAreaView,
    KeyboardAvoidingView,
    Platform,
    StatusBar
} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useAuth} from '../../../hooks/useAuth';
import {router} from 'expo-router';
import authApi from '../../../src/api/authApi';

// Add the statusBarHeight calculation
const STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

export default function ChangePasswordScreen() {
    const {user} = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');

    const handleChangePassword = async () => {
        try {
            // Reset error state
            setError('');

            // Validate inputs
            if (!currentPassword || !newPassword || !confirmPassword) {
                setError('Пожалуйста, заполните все поля');
                return;
            }

            if (newPassword !== confirmPassword) {
                setError('Новые пароли не совпадают');
                return;
            }

            if (newPassword.length < 6) {
                setError('Новый пароль должен содержать минимум 6 символов');
                return;
            }

            setIsLoading(true);

            // Call API to change password
            const result = await authApi.changePassword(currentPassword, newPassword);

            if (result.success) {
                Alert.alert(
                    'Успех',
                    'Пароль успешно изменен',
                    [{text: 'OK', onPress: () => router.back()}]
                );
            } else {
                setError(result.message || 'Ошибка при изменении пароля');
            }
        } catch (error) {
            let errorMessage = 'Ошибка при изменении пароля';

            if (error instanceof Error) {
                // Handle specific error cases
                if (error.message.includes('401') || error.message.includes('неверно')) {
                    errorMessage = 'Текущий пароль указан неверно';
                } else {
                    errorMessage = error.message;
                }
            }

            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{flex: 1}}
            >
                <ScrollView
                    contentContainerStyle={[
                        styles.scrollContent,
                        // Apply conditional padding for Android
                        Platform.OS === 'android' && styles.androidScrollContent
                    ]}
                >
                    <View style={styles.header}>
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={() => router.back()}
                        >
                            <Ionicons name="chevron-back" size={24} color="#000"/>
                        </TouchableOpacity>
                        <Text style={styles.title}>Изменение пароля</Text>
                        <View style={{width: 40}}/>
                    </View>

                    <View style={styles.formContainer}>
                        {error ? (
                            <View style={styles.errorContainer}>
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        ) : null}

                        <View style={styles.inputContainer}>
                            <Text style={styles.inputLabel}>Текущий пароль</Text>
                            <View style={styles.passwordContainer}>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Введите текущий пароль"
                                    secureTextEntry={!showCurrentPassword}
                                    value={currentPassword}
                                    onChangeText={setCurrentPassword}
                                    autoCapitalize="none"
                                />
                                <TouchableOpacity
                                    style={styles.eyeButton}
                                    onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                                >
                                    <Ionicons
                                        name={showCurrentPassword ? "eye-off-outline" : "eye-outline"}
                                        size={24}
                                        color="#666"
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.inputContainer}>
                            <Text style={styles.inputLabel}>Новый пароль</Text>
                            <View style={styles.passwordContainer}>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Введите новый пароль"
                                    secureTextEntry={!showNewPassword}
                                    value={newPassword}
                                    onChangeText={setNewPassword}
                                    autoCapitalize="none"
                                />
                                <TouchableOpacity
                                    style={styles.eyeButton}
                                    onPress={() => setShowNewPassword(!showNewPassword)}
                                >
                                    <Ionicons
                                        name={showNewPassword ? "eye-off-outline" : "eye-outline"}
                                        size={24}
                                        color="#666"
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.inputContainer}>
                            <Text style={styles.inputLabel}>Подтверждение пароля</Text>
                            <View style={styles.passwordContainer}>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Подтвердите новый пароль"
                                    secureTextEntry={!showConfirmPassword}
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    autoCapitalize="none"
                                />
                                <TouchableOpacity
                                    style={styles.eyeButton}
                                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                                >
                                    <Ionicons
                                        name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                                        size={24}
                                        color="#666"
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.buttonContainer}>
                            <TouchableOpacity
                                style={styles.saveButton}
                                onPress={handleChangePassword}
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <ActivityIndicator color="#FFF" size="small"/>
                                ) : (
                                    <Text style={styles.saveButtonText}>Сохранить</Text>
                                )}
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
        backgroundColor: '#F9F9F9',
        // Add padding top for Android
        paddingTop: Platform.OS === 'android' ? STATUSBAR_HEIGHT : 0,
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 30,
    },
    // New style for Android scroll content
    androidScrollContent: {
        paddingTop: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E5EA',
        backgroundColor: '#FFFFFF',
    },
    backButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#000',
    },
    formContainer: {
        padding: 20,
    },
    inputContainer: {
        marginBottom: 20,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: '#333',
        marginBottom: 8,
    },
    input: {
        flex: 1,
        height: 50,
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        paddingHorizontal: 12,
        fontSize: 16,
        color: '#333',
    },
    passwordContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E0E0E0',
    },
    eyeButton: {
        padding: 12,
    },
    buttonContainer: {
        marginTop: 20,
    },
    saveButton: {
        backgroundColor: '#bb0000',
        height: 50,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    errorContainer: {
        backgroundColor: '#ffebee',
        padding: 12,
        borderRadius: 8,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#ffcdd2',
    },
    errorText: {
        color: '#c62828',
        fontSize: 14,
    },
});