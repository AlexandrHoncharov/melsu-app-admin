import React, {useEffect, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Linking,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import {useAuth} from '../hooks/useAuth';
import {router} from 'expo-router';
import {Ionicons} from '@expo/vector-icons';
import {StatusBar as ExpoStatusBar} from 'expo-status-bar';
import CustomDropdown from '../components/CustomDropdown';

// Типы для ошибок валидации
interface ValidationErrors {
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    group?: string;
    speciality?: string;
}

// Interface for speciality data
interface Speciality {
    id: number;
    spec_code: string;
    name: string;
    faculty_name: string;
    level: string;
    forms: {
        'full-time': string;
        'full-part': string;
        'correspondence': string;
    };
}

export default function RegisterScreen() {
    // Состояния для полей формы
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [group, setGroup] = useState('');
    const [specialityId, setSpecialityId] = useState<string>('');
    const [secureTextEntry, setSecureTextEntry] = useState(true);
    const [errors, setErrors] = useState<ValidationErrors>({});
    const [generalError, setGeneralError] = useState<string | null>(null);
    const [specialities, setSpecialities] = useState<Record<string, Speciality>>({});
    const [loadingSpecialities, setLoadingSpecialities] = useState(true);

    const {register, isLoading, isAuthenticated} = useAuth();

    // Fetch specialities when component mounts
    useEffect(() => {
        fetchSpecialities();
    }, []);

    // Проверяем, авторизован ли пользователь
    useEffect(() => {
        if (isAuthenticated) {
            router.replace('/(tabs)');
        }
    }, [isAuthenticated]);

    // Fetch specialities from API
    const fetchSpecialities = async () => {
        setLoadingSpecialities(true);
        try {
            // Using the API endpoint you provided
            const response = await fetch('https://melsu.ru/api/specialities/list');
            if (!response.ok) {
                throw new Error('Failed to fetch specialities');
            }

            const data = await response.json();
            setSpecialities(data);
        } catch (error) {
            console.error('Error fetching specialities:', error);
            Alert.alert(
                'Ошибка',
                'Не удалось загрузить список направлений подготовки. Пожалуйста, проверьте подключение к интернету.'
            );
        } finally {
            setLoadingSpecialities(false);
        }
    };

    // Validate email
    const validateEmail = (email: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    // Prepare dropdown items from specialities data
    const getSpecialityDropdownItems = () => {
        return Object.keys(specialities).map(key => ({
            id: key,
            label: `${specialities[key].spec_code} - ${specialities[key].name}`,
            value: key
        }));
    };

    // Validate group format
    const validateGroupFormat = (groupValue: string) => {
        // Format should be xxxx-xxxx.x
        const groupRegex = /^\d{4}-\d{4}\.\d$/;

        if (!groupRegex.test(groupValue)) {
            return 'Формат группы должен быть xxxx-xxxx.x';
        }

        // Check the 4th digit for validity
        const fourthDigit = groupValue.charAt(3);
        if (!['1', '2', '3'].includes(fourthDigit)) {
            return 'Неверный формат обучения: 1 - очная, 2 - очно-заочная, 3 - заочная';
        }

        return '';
    };

    // Функции для открытия юридических документов
    const openPrivacyPolicy = () => {
        Linking.openURL('https://melsu.ru/storage/documents/go/Privacy_policy.pdf');
    };

    const openTermsOfUse = () => {
        Linking.openURL('https://melsu.ru/storage/documents/go/Terms_of_use_MelSU_Go.pdf');
    };

    // Handle registration
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

        // Проверка email
        if (!email.trim()) {
            newErrors.email = 'Введите email';
        } else if (!validateEmail(email.trim())) {
            newErrors.email = 'Некорректный формат email';
        }

        if (!password) {
            newErrors.password = 'Введите пароль';
        } else if (password.length < 6) {
            newErrors.password = 'Пароль должен содержать минимум 6 символов';
        }

        if (password !== confirmPassword) {
            newErrors.confirmPassword = 'Пароли не совпадают';
        }

        if (!specialityId) {
            newErrors.speciality = 'Выберите направление подготовки';
        }

        if (!group.trim()) {
            newErrors.group = 'Введите группу';
        } else {
            const groupError = validateGroupFormat(group);
            if (groupError) {
                newErrors.group = groupError;
            }
        }

        // Если есть ошибки, показываем их и прерываем отправку
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        // Get selected speciality data
        const selectedSpeciality = specialities[specialityId];
        if (!selectedSpeciality) {
            setErrors({speciality: 'Выбранное направление не найдено'});
            return;
        }

        try {
            // Determine study form based on 4th digit of group
            const formCode = group.charAt(3);
            let studyForm = '';

            if (formCode === '1') {
                studyForm = 'full-time';
            } else if (formCode === '2') {
                studyForm = 'full-part';
            } else if (formCode === '3') {
                studyForm = 'correspondence';
            }

            // Вызываем API для регистрации
            const result = await register({
                fullName,
                email,
                password,
                group,
                role: 'student',
                speciality: {
                    id: selectedSpeciality.id,
                    code: selectedSpeciality.spec_code,
                    name: selectedSpeciality.name,
                    faculty: selectedSpeciality.faculty_name,
                    form: studyForm,
                    formName: selectedSpeciality.forms[studyForm] || ''
                }
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
            <ExpoStatusBar style="dark"/>

            {/* Кастомный заголовок с кнопкой назад */}
            <View style={styles.customHeader}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <Ionicons name="chevron-back" size={24} color="#770002"/>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Регистрация</Text>
                <View style={styles.placeholderRight}/>
            </View>

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
                            <Ionicons name="alert-circle" size={16} color="#d32f2f"/>
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
                                <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon}/>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Иванов Иван Иванович"
                                    placeholderTextColor="#999"
                                    value={fullName}
                                    onChangeText={(text) => {
                                        setFullName(text);
                                        if (errors.fullName) {
                                            setErrors(prev => ({...prev, fullName: undefined}));
                                        }
                                    }}
                                    testID="register-fullname"
                                />
                            </View>
                            {errors.fullName && (
                                <Text style={styles.fieldErrorText}>{errors.fullName}</Text>
                            )}
                        </View>

                        {/* Email */}
                        <View style={styles.inputBlock}>
                            <Text style={styles.inputLabel}>Email</Text>
                            <View style={[
                                styles.inputContainer,
                                errors.email ? styles.inputError : {}
                            ]}>
                                <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon}/>
                                <TextInput
                                    style={styles.input}
                                    placeholder="example@mail.ru"
                                    placeholderTextColor="#999"
                                    value={email}
                                    onChangeText={(text) => {
                                        setEmail(text);
                                        if (errors.email) {
                                            setErrors(prev => ({...prev, email: undefined}));
                                        }
                                    }}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    testID="register-email"
                                />
                            </View>
                            {errors.email && (
                                <Text style={styles.fieldErrorText}>{errors.email}</Text>
                            )}
                        </View>

                        {/* Направление подготовки */}
                        <View style={styles.inputBlock}>
                            <Text style={styles.inputLabel}>Направление подготовки</Text>
                            {loadingSpecialities ? (
                                <View style={styles.loadingContainer}>
                                    <ActivityIndicator size="small" color="#770002"/>
                                    <Text style={styles.loadingText}>Загрузка направлений...</Text>
                                </View>
                            ) : (
                                <>
                                    <CustomDropdown
                                        items={getSpecialityDropdownItems()}
                                        selectedValue={specialityId}
                                        onValueChange={(value) => {
                                            setSpecialityId(value);
                                            if (errors.speciality) {
                                                setErrors(prev => ({...prev, speciality: undefined}));
                                            }
                                        }}
                                        placeholder="Выберите направление подготовки"
                                        error={Boolean(errors.speciality)}
                                        searchable={true}
                                    />
                                    {errors.speciality && (
                                        <Text style={styles.fieldErrorText}>{errors.speciality}</Text>
                                    )}
                                </>
                            )}
                        </View>

                        {/* Группа */}
                        <View style={styles.inputBlock}>
                            <Text style={styles.inputLabel}>Учебная группа</Text>
                            <View style={[
                                styles.inputContainer,
                                errors.group ? styles.inputError : {}
                            ]}>
                                <Ionicons name="people-outline" size={20} color="#666" style={styles.inputIcon}/>
                                <TextInput
                                    style={styles.input}
                                    placeholder="xxxx-xxxx.x"
                                    placeholderTextColor="#999"
                                    value={group}
                                    onChangeText={(text) => {
                                        setGroup(text);
                                        if (errors.group) {
                                            setErrors(prev => ({...prev, group: undefined}));
                                        }
                                    }}
                                    testID="register-group"
                                />
                            </View>
                            {errors.group ? (
                                <Text style={styles.fieldErrorText}>{errors.group}</Text>
                            ) : (
                                <Text style={styles.helperText}>
                                    Формат: xxxx-xxxx.x, где 4-ая цифра означает форму обучения:
                                    1 - очная, 2 - очно-заочная, 3 - заочная
                                </Text>
                            )}
                        </View>

                        {/* Пароль */}
                        <View style={styles.inputBlock}>
                            <Text style={styles.inputLabel}>Пароль</Text>
                            <View style={[
                                styles.inputContainer,
                                errors.password ? styles.inputError : {}
                            ]}>
                                <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon}/>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Минимум 6 символов"
                                    placeholderTextColor="#999"
                                    value={password}
                                    onChangeText={(text) => {
                                        setPassword(text);
                                        if (errors.password) {
                                            setErrors(prev => ({...prev, password: undefined}));
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
                                <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon}/>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Повторите пароль"
                                    placeholderTextColor="#999"
                                    value={confirmPassword}
                                    onChangeText={(text) => {
                                        setConfirmPassword(text);
                                        if (errors.confirmPassword) {
                                            setErrors(prev => ({...prev, confirmPassword: undefined}));
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
                            <Ionicons name="information-circle-outline" size={18} color="#2196F3"/>
                            <Text style={styles.noteText}>
                                После регистрации вам потребуется верифицировать студенческий билет
                            </Text>
                        </View>

                        <View style={styles.termsContainer}>
                            <Text style={styles.termsText}>
                                Нажимая на "Зарегистрироваться", вы соглашаетесь с
                                <Text style={styles.termsLink} onPress={openTermsOfUse}> Условиями
                                    использования</Text> и
                                <Text style={styles.termsLink} onPress={openPrivacyPolicy}> Политикой
                                    конфиденциальности</Text>
                            </Text>
                        </View>

                        <TouchableOpacity
                            style={styles.registerButton}
                            onPress={handleRegister}
                            disabled={isLoading}
                            testID="register-button"
                        >
                            {isLoading ? (
                                <ActivityIndicator color="#fff"/>
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
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    customHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E5EA',
        backgroundColor: '#FFFFFF',
        zIndex: 10,
    },
    backButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#770002',
        flex: 1,
        textAlign: 'center',
        marginHorizontal: 8,
    },
    placeholderRight: {
        width: 40,
        height: 40,
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
    helperText: {
        color: '#666',
        fontSize: 12,
        marginTop: 4,
        marginLeft: 4,
    },
    loadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#f0f0f0',
    },
    loadingText: {
        marginLeft: 8,
        color: '#666',
        fontSize: 14,
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
    termsContainer: {
        marginBottom: 16,
        paddingHorizontal: 4,
    },
    termsText: {
        fontSize: 12,
        color: '#666',
        textAlign: 'center',
        lineHeight: 18,
    },
    termsLink: {
        color: '#770002',
        fontWeight: '500',
        textDecorationLine: 'underline',
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