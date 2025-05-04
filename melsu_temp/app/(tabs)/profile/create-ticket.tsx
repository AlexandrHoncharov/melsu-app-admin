import React, {useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
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
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {useAuth} from '../../../hooks/useAuth';
import ticketsApi, {CreateTicketRequest} from '../../../src/api/ticketsApi';
import * as ImagePicker from 'expo-image-picker';


// Add the statusBarHeight calculation
const STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

// Категории тикетов
const categories = [
    {
        value: 'technical',
        label: 'Техническая проблема',
        icon: 'hardware-chip-outline',
        color: '#7B1FA2',
        bgColor: '#F3E5F5'
    },
    {
        value: 'schedule',
        label: 'Проблема с расписанием',
        icon: 'calendar-outline',
        color: '#388E3C',
        bgColor: '#E8F5E9'
    },
    {
        value: 'verification',
        label: 'Вопрос по верификации',
        icon: 'shield-checkmark-outline',
        color: '#1976D2',
        bgColor: '#E3F2FD'
    },
    {value: 'other', label: 'Другое', icon: 'help-circle-outline', color: '#616161', bgColor: '#F5F5F5'}
];

// Приоритеты тикетов
const priorities = [
    {value: 'low', label: 'Низкий', color: '#388E3C', bgColor: '#E8F5E9'},
    {value: 'medium', label: 'Средний', color: '#FFA000', bgColor: '#FFF8E1'},
    {value: 'high', label: 'Высокий', color: '#D32F2F', bgColor: '#FFEBEE'},
];

export default function CreateTicketScreen() {
    const {user} = useAuth();
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [category, setCategory] = useState('technical');
    const [priority, setPriority] = useState('medium');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    // Обработка выбора изображения
    const handleSelectImage = async () => {
        // Запрашиваем разрешения
        const {status} = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (status !== 'granted') {
            Alert.alert('Ошибка', 'Необходимо разрешение на доступ к галерее изображений');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
        });

        if (!result.canceled && result.assets && result.assets[0]) {
            setSelectedImage(result.assets[0].uri);
        }
    };

    // Обработка отправки тикета
    const handleSubmit = async () => {
        try {
            // Валидация
            if (!title.trim()) {
                Alert.alert('Ошибка', 'Пожалуйста, укажите заголовок обращения');
                return;
            }

            if (!message.trim()) {
                Alert.alert('Ошибка', 'Пожалуйста, опишите вашу проблему в сообщении');
                return;
            }

            setIsSubmitting(true);

            // Создаем тикет без вложения
            const ticketData: CreateTicketRequest = {
                title: title.trim(),
                category: category as 'technical' | 'schedule' | 'verification' | 'other',
                message: message.trim(),
                priority: priority as 'low' | 'medium' | 'high'
            };

            // Если есть информация о верификации студента и выбрана категория "верификация",
            // добавляем связанные данные
            if (category === 'verification' && user?.role === 'student') {
                ticketData.related_type = 'verification';
                ticketData.related_id = user.id;
            }

            // Создаем тикет
            const result = await ticketsApi.createTicket(ticketData);

            // Если выбрано изображение, загружаем его как вложение
            if (selectedImage && result.ticket) {
                try {
                    await ticketsApi.uploadAttachment(result.ticket.id, selectedImage);
                } catch (attachmentError) {
                    console.error('Error uploading attachment:', attachmentError);
                    // Сообщаем об ошибке, но не прерываем процесс, так как тикет уже создан
                    Alert.alert(
                        'Частичная ошибка',
                        'Тикет создан, но не удалось загрузить прикрепленное изображение. Вы можете прикрепить его позже.'
                    );
                }
            }

            Alert.alert(
                'Успех',
                'Ваше обращение успешно отправлено. Мы рассмотрим его в ближайшее время.',
                [
                    {
                        text: 'OK',
                        onPress: () => router.push('/profile/tickets')
                    }
                ]
            );

        } catch (error) {
            console.error('Error creating ticket:', error);
            Alert.alert('Ошибка', 'Не удалось создать обращение. Пожалуйста, попробуйте позже.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                style={styles.keyboardAvoid}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => router.back()}
                    >
                        <Ionicons name="chevron-back" size={24} color="#000"/>
                    </TouchableOpacity>
                    <Text style={styles.title}>Новое обращение</Text>
                    <View style={{width: 40}}/>
                </View>

                <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Заголовок</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Кратко опишите проблему"
                            value={title}
                            onChangeText={setTitle}
                            maxLength={100}
                        />
                    </View>

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Категория</Text>
                        <View style={styles.categoryContainer}>
                            {categories.map((cat) => (
                                <TouchableOpacity
                                    key={cat.value}
                                    style={[
                                        styles.categoryButton,
                                        {backgroundColor: cat.bgColor},
                                        category === cat.value && styles.selectedCategory
                                    ]}
                                    onPress={() => setCategory(cat.value)}
                                >
                                    <Ionicons name={cat.icon} size={24} color={cat.color} style={styles.categoryIcon}/>
                                    <Text
                                        style={[
                                            styles.categoryLabel,
                                            {color: cat.color},
                                            category === cat.value && styles.selectedCategoryText
                                        ]}
                                    >
                                        {cat.label}
                                    </Text>
                                    {category === cat.value && (
                                        <Ionicons name="checkmark-circle" size={18} color="#fff"
                                                  style={styles.checkIcon}/>
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Приоритет</Text>
                        <View style={styles.priorityContainer}>
                            {priorities.map((pri) => (
                                <TouchableOpacity
                                    key={pri.value}
                                    style={[
                                        styles.priorityButton,
                                        {backgroundColor: pri.bgColor},
                                        priority === pri.value && {backgroundColor: pri.color}
                                    ]}
                                    onPress={() => setPriority(pri.value)}
                                >
                                    <Text
                                        style={[
                                            styles.priorityText,
                                            {color: pri.color},
                                            priority === pri.value && {color: '#fff'}
                                        ]}
                                    >
                                        {pri.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Описание проблемы</Text>
                        <TextInput
                            style={styles.messageInput}
                            placeholder="Опишите подробно вашу проблему..."
                            value={message}
                            onChangeText={setMessage}
                            multiline
                            textAlignVertical="top"
                            numberOfLines={6}
                        />
                    </View>

                    <View style={styles.formGroup}>
                        <View style={styles.attachmentHeader}>
                            <Text style={styles.label}>Прикрепить изображение (опционально)</Text>
                            {selectedImage && (
                                <TouchableOpacity
                                    onPress={() => setSelectedImage(null)}
                                    style={styles.removeButton}
                                >
                                    <Text style={styles.removeText}>Удалить</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {selectedImage ? (
                            <View style={styles.imagePreviewContainer}>
                                <Image source={{uri: selectedImage}} style={styles.imagePreview}/>
                            </View>
                        ) : (
                            <TouchableOpacity
                                style={styles.attachmentButton}
                                onPress={handleSelectImage}
                            >
                                <Ionicons name="image-outline" size={24} color="#666"/>
                                <Text style={styles.attachmentText}>Выбрать изображение</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <TouchableOpacity
                        style={styles.submitButton}
                        onPress={handleSubmit}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator color="#FFF"/>
                        ) : (
                            <>
                                <Ionicons name="paper-plane-outline" size={18} color="#FFF" style={styles.submitIcon}/>
                                <Text style={styles.submitText}>Отправить обращение</Text>
                            </>
                        )}
                    </TouchableOpacity>
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
    keyboardAvoid: {
        flex: 1
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
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 32,
    },
    formGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: '#E0E0E0',
        fontSize: 16,
    },
    messageInput: {
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: '#E0E0E0',
        fontSize: 16,
        height: 150,
    },
    categoryContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginHorizontal: -4,
    },
    categoryButton: {
        width: '48%',
        marginHorizontal: '1%',
        marginBottom: 8,
        padding: 12,
        borderRadius: 10,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    selectedCategory: {
        borderColor: '#bb0000',
    },
    categoryIcon: {
        marginRight: 8,
    },
    categoryLabel: {
        fontSize: 14,
        fontWeight: '500',
        flex: 1,
    },
    selectedCategoryText: {
        fontWeight: '700',
    },
    checkIcon: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: '#bb0000',
        borderRadius: 10,
        overflow: 'hidden',
    },
    priorityContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    priorityButton: {
        flex: 1,
        marginHorizontal: 4,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    priorityText: {
        fontSize: 14,
        fontWeight: '500',
    },
    attachmentHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    removeButton: {
        paddingVertical: 4,
        paddingHorizontal: 10,
        backgroundColor: '#FFEBEE',
        borderRadius: 8,
    },
    removeText: {
        color: '#D32F2F',
        fontSize: 12,
        fontWeight: '500',
    },
    attachmentButton: {
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E0E0E0',
        borderStyle: 'dashed',
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
    },
    attachmentText: {
        color: '#666',
        marginLeft: 8,
        fontSize: 16,
    },
    imagePreviewContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E0E0E0',
        overflow: 'hidden',
        height: 200,
    },
    imagePreview: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    submitButton: {
        backgroundColor: '#bb0000',
        borderRadius: 10,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 10,
        flexDirection: 'row',
    },
    submitIcon: {
        marginRight: 8,
    },
    submitText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
});