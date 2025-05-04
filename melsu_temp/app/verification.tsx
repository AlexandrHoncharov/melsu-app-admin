import React, {useEffect, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    BackHandler,
    Image,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import {router, Stack} from 'expo-router';
import {Ionicons} from '@expo/vector-icons';
import {StatusBar} from 'expo-status-bar';
import {useAuth} from '../hooks/useAuth';
import * as ImagePicker from 'expo-image-picker';

export default function VerificationScreen() {
    const {
        user,
        isLoading,
        uploadStudentCard,
        checkVerificationStatus,
        cancelVerification,
        reuploadStudentCard
    } = useAuth();
    const [image, setImage] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
    const [isReuploading, setIsReuploading] = useState(false);

    // Handle hardware back button press
    useEffect(() => {
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            // Show the same alert as the skip button
            handleSkip();
            // Return true to prevent default back behavior
            return true;
        });

        return () => backHandler.remove();
    }, []);

    useEffect(() => {
        // Check verification status immediately when component mounts
        checkVerificationStatus().then(status => {
            if (status !== user?.verificationStatus) {
                // Status has changed, update UI accordingly
                if (status === 'verified') {
                    Alert.alert(
                        'Верификация завершена',
                        'Ваш студенческий билет был успешно верифицирован.',
                        [
                            {text: 'OK', onPress: () => router.replace('/(tabs)')}
                        ]
                    );
                } else if (status === 'rejected' && user?.verificationStatus === 'pending') {
                    setIsReuploading(true);
                    Alert.alert(
                        'Верификация отклонена',
                        'Ваш студенческий билет был отклонен. Пожалуйста, загрузите корректное изображение.',
                        [
                            {text: 'OK'}
                        ]
                    );
                }
            }
        }).catch(error => {
            console.error('Error checking verification status:', error);
        });

        // Проверяем, верифицирован ли пользователь
        const checkUserStatus = async () => {
            if (user?.verificationStatus === 'verified') {
                Alert.alert(
                    'Уже верифицировано',
                    'Ваш студенческий билет уже прошел верификацию.',
                    [
                        {text: 'OK', onPress: () => router.replace('/(tabs)')}
                    ]
                );
            } else if (user?.verificationStatus === 'pending') {
                // Если статус "на проверке", проверяем, не изменился ли он
                try {
                    const status = await checkVerificationStatus();
                    if (status === 'verified') {
                        Alert.alert(
                            'Верификация завершена',
                            'Ваш студенческий билет был успешно верифицирован.',
                            [
                                {text: 'OK', onPress: () => router.replace('/(tabs)')}
                            ]
                        );
                    } else if (status === 'rejected') {
                        setIsReuploading(true);
                        Alert.alert(
                            'Верификация отклонена',
                            'Ваш студенческий билет был отклонен. Пожалуйста, загрузите корректное изображение.',
                            [
                                {text: 'OK'}
                            ]
                        );

                        // Автоматически сбрасываем предыдущую верификацию
                        try {
                            await cancelVerification();
                        } catch (error) {
                            console.error('Ошибка при отмене верификации:', error);
                        }
                    }
                } catch (error) {
                    console.error('Ошибка при проверке статуса верификации:', error);
                }
            } else if (user?.verificationStatus === 'rejected') {
                setIsReuploading(true);
                // Если статус "отклонен", предлагаем загрузить новый
                Alert.alert(
                    'Верификация отклонена',
                    'Предыдущая загрузка студенческого билета была отклонена. Пожалуйста, загрузите корректное изображение.',
                    [
                        {text: 'OK'}
                    ]
                );

                // Автоматически отменяем предыдущую верификацию
                try {
                    await cancelVerification();
                } catch (error) {
                    console.error('Ошибка при отмене верификации:', error);
                }
            }
        };

        checkUserStatus();

        // Запрашиваем разрешение на использование камеры
        (async () => {
            const {status} = await ImagePicker.requestCameraPermissionsAsync();
            setCameraPermission(status === 'granted');
        })();
    }, []);

    // Выбор изображения из галереи
    const pickImage = async () => {
        setError(null);

        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                // Проверяем размер файла (ограничим 10 МБ)
                const fileInfo = await fetch(result.assets[0].uri).then(res => res.blob());
                const fileSize = fileInfo.size / (1024 * 1024); // в МБ

                if (fileSize > 10) {
                    setError('Размер файла не должен превышать 10 МБ');
                    return;
                }

                setImage(result.assets[0].uri);
            }
        } catch (error) {
            setError('Не удалось выбрать изображение');
            console.error('Ошибка при выборе изображения:', error);
        }
    };

    // Съемка фото с камеры
    const takePhoto = async () => {
        setError(null);

        try {
            if (!cameraPermission) {
                Alert.alert(
                    'Доступ запрещен',
                    'Для использования камеры необходимо разрешение. Пожалуйста, разрешите доступ к камере в настройках приложения.',
                    [
                        {text: 'OK'}
                    ]
                );
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                setImage(result.assets[0].uri);
            }
        } catch (error) {
            setError('Не удалось сделать фото');
            console.error('Ошибка при съемке фото:', error);
        }
    };

    // Функция отправки на сервер
    const handleSubmit = async () => {
        if (!image) {
            setError('Пожалуйста, загрузите фото студенческого билета');
            return;
        }

        setUploading(true);
        setError(null);

        try {
            // Выбираем метод в зависимости от контекста - новая загрузка или повторная после отклонения
            if (isReuploading) {
                await reuploadStudentCard(image);
            } else {
                await uploadStudentCard(image);
            }

            // Успешная отправка
            Alert.alert(
                'Успешная отправка',
                'Фото студенческого билета отправлено на проверку. Обычно проверка занимает 1-2 рабочих дня.',
                [
                    {text: 'OK', onPress: () => router.replace('/(tabs)')}
                ]
            );
        } catch (error) {
            setError((error as Error).message || 'Не удалось загрузить фото. Пожалуйста, попробуйте еще раз.');
        } finally {
            setUploading(false);
        }
    };

    // Обработка кнопки "Пропустить"
    const handleSkip = () => {
        Alert.alert(
            'Пропустить верификацию?',
            'Без верификации студенческого билета вам будут доступны не все функции приложения.',
            [
                {text: 'Отмена', style: 'cancel'},
                {text: 'Пропустить', onPress: () => router.replace('/(tabs)')}
            ]
        );
    };

    // Custom header back button
    const renderCustomBackButton = () => (
        <TouchableOpacity
            style={styles.backButton}
            onPress={handleSkip}
        >
            <Ionicons name="arrow-back" size={24} color="#770002"/>
        </TouchableOpacity>
    );

    if (isLoading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator size="large" color="#770002"/>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="dark"/>

            <Stack.Screen
                options={{
                    title: isReuploading ? 'Повторная верификация' : 'Верификация',
                    headerTintColor: '#770002',
                    headerLeft: () => renderCustomBackButton(),
                }}
            />

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Image
                    source={require('../assets/images/university-logo.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />

                <Text style={styles.title}>
                    {isReuploading ? 'Повторная загрузка студенческого билета' : 'Верификация студенческого билета'}
                </Text>

                <Text style={styles.description}>
                    {isReuploading
                        ? 'Ваша предыдущая загрузка была отклонена. Пожалуйста, загрузите более четкую фотографию студенческого билета.'
                        : 'Для доступа ко всем функциям приложения необходимо подтвердить, что вы являетесь студентом университета. Пожалуйста, загрузите фото вашего студенческого билета.'}
                </Text>

                {/* Инструкции по фотографии */}
                <View style={styles.instructionsContainer}>
                    <View style={styles.instructionItem}>
                        <Ionicons name="checkmark-circle-outline" size={20} color="#555"/>
                        <Text style={styles.instructionText}>
                            Убедитесь, что студенческий билет хорошо освещен
                        </Text>
                    </View>

                    <View style={styles.instructionItem}>
                        <Ionicons name="checkmark-circle-outline" size={20} color="#555"/>
                        <Text style={styles.instructionText}>
                            ФИО, номер билета и фото должны быть четко видны
                        </Text>
                    </View>

                    <View style={styles.instructionItem}>
                        <Ionicons name="checkmark-circle-outline" size={20} color="#555"/>
                        <Text style={styles.instructionText}>
                            Фотографируйте на ровной поверхности без бликов
                        </Text>
                    </View>
                </View>

                {/* Отображение ошибки */}
                {error && (
                    <View style={styles.errorContainer}>
                        <Ionicons name="alert-circle" size={16} color="#d32f2f"/>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                {/* Предпросмотр изображения */}
                {image ? (
                    <View style={styles.previewContainer}>
                        <Image
                            source={{uri: image}}
                            style={styles.previewImage}
                            resizeMode="contain"
                        />

                        <View style={styles.previewActions}>
                            <TouchableOpacity
                                style={styles.retakeButton}
                                onPress={() => setImage(null)}
                                testID="retake-button"
                            >
                                <Ionicons name="refresh-outline" size={18} color="#555"/>
                                <Text style={styles.retakeButtonText}>Переснять</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.submitButton}
                                onPress={handleSubmit}
                                disabled={uploading}
                                testID="submit-button"
                            >
                                {uploading ? (
                                    <ActivityIndicator color="#fff" size="small"/>
                                ) : (
                                    <>
                                        <Text style={styles.submitButtonText}>Отправить</Text>
                                        <Ionicons name="send-outline" size={18} color="#fff"/>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <View style={styles.uploadOptions}>
                        <TouchableOpacity
                            style={styles.uploadButton}
                            onPress={takePhoto}
                            testID="take-photo-button"
                        >
                            <Ionicons name="camera-outline" size={24} color="#fff"/>
                            <Text style={styles.uploadButtonText}>Сделать фото</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.uploadButton}
                            onPress={pickImage}
                            testID="pick-image-button"
                        >
                            <Ionicons name="images-outline" size={24} color="#fff"/>
                            <Text style={styles.uploadButtonText}>Выбрать из галереи</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {!image && !isReuploading && (
                    <TouchableOpacity
                        style={styles.skipButton}
                        onPress={handleSkip}
                        testID="skip-button"
                    >
                        <Text style={styles.skipButtonText}>Пропустить верификацию</Text>
                    </TouchableOpacity>
                )}

                <View style={styles.noteContainer}>
                    <Ionicons name="shield-checkmark-outline" size={18} color="#4CAF50"/>
                    <Text style={styles.noteText}>
                        Фото будет использовано только для верификации вашего студенческого статуса
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
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
        fontSize: 22,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 16,
        textAlign: 'center',
    },
    description: {
        fontSize: 16,
        color: '#555',
        textAlign: 'center',
        marginBottom: 24,
    },
    instructionsContainer: {
        width: '100%',
        backgroundColor: '#f9f9f9',
        borderRadius: 8,
        padding: 16,
        marginBottom: 20,
    },
    instructionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    instructionText: {
        flex: 1,
        marginLeft: 12,
        fontSize: 14,
        color: '#444',
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
    previewContainer: {
        width: '100%',
        marginBottom: 20,
    },
    previewImage: {
        width: '100%',
        height: 250,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#eee',
        marginBottom: 16,
    },
    previewActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    retakeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        backgroundColor: '#f0f0f0',
        borderRadius: 8,
    },
    retakeButtonText: {
        fontSize: 14,
        color: '#555',
        marginLeft: 6,
    },
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 20,
        backgroundColor: '#770002',
        borderRadius: 8,
    },
    submitButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
        marginRight: 6,
    },
    uploadOptions: {
        width: '100%',
        marginBottom: 20,
        gap: 12,
    },
    uploadButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#770002',
        paddingVertical: 12,
        borderRadius: 8,
    },
    uploadButtonText: {
        color: '#fff',
        fontWeight: '600',
        marginLeft: 8,
    },
    skipButton: {
        paddingVertical: 12,
        paddingHorizontal: 20,
    },
    skipButtonText: {
        color: '#888',
        fontSize: 14,
    },
    noteContainer: {
        flexDirection: 'row',
        backgroundColor: '#E8F5E9',
        borderRadius: 8,
        padding: 12,
        marginTop: 20,
        width: '100%',
    },
    noteText: {
        flex: 1,
        fontSize: 14,
        color: '#4CAF50',
        marginLeft: 8,
    },
    backButton: {
        padding: 8,
    },
});