import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {usePushNotifications} from '../hooks/usePushNotifications';
import * as Device from 'expo-device';
import {Ionicons} from '@expo/vector-icons';

export default function PushDiagnostics() {
    const {
        expoPushToken,
        sendTestNotification,
        tokenRegistered,
        registrationError,
        getNotificationStatus
    } = usePushNotifications();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(false);
    const [sendingTest, setSendingTest] = useState(false);

    useEffect(() => {
        checkStatus();
    }, [expoPushToken, tokenRegistered]);

    const checkStatus = async () => {
        setLoading(true);
        try {
            const status = await getNotificationStatus();
            setStatus(status);
        } catch (error) {
            console.error('Error checking notification status:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSendTest = async () => {
        setSendingTest(true);
        try {
            await sendTestNotification();
        } catch (error) {
            // Error is handled in the hook
            console.error('Error sending test notification:', error);
        } finally {
            setSendingTest(false);
        }
    };

    const copyTokenToClipboard = () => {
        if (expoPushToken) {
            // In a real app, you would use Clipboard.setString(expoPushToken)
            Alert.alert('Token copied to clipboard', expoPushToken);
        }
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Push-уведомления: Диагностика</Text>
                <TouchableOpacity style={styles.refreshButton} onPress={checkStatus}>
                    <Ionicons name="refresh" size={18} color="#fff"/>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#770002"/>
                    <Text style={styles.loadingText}>Проверка статуса уведомлений...</Text>
                </View>
            ) : (
                <>
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Информация об устройстве</Text>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Устройство:</Text>
                            <Text style={styles.infoValue}>{Device.modelName || 'Неизвестно'}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>ОС:</Text>
                            <Text style={styles.infoValue}>{Device.osName} {Device.osVersion}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Физическое устройство:</Text>
                            <View style={styles.statusContainer}>
                                {Device.isDevice ? (
                                    <Ionicons name="checkmark-circle" size={18} color="#4CAF50"/>
                                ) : (
                                    <Ionicons name="close-circle" size={18} color="#F44336"/>
                                )}
                                <Text style={[
                                    styles.statusText,
                                    {color: Device.isDevice ? '#4CAF50' : '#F44336'}
                                ]}>
                                    {Device.isDevice ? 'Да' : 'Нет (эмулятор)'}
                                </Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Статус уведомлений</Text>

                        {status && (
                            <>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Разрешения:</Text>
                                    <View style={styles.statusContainer}>
                                        {status.enabled ? (
                                            <Ionicons name="checkmark-circle" size={18} color="#4CAF50"/>
                                        ) : (
                                            <Ionicons name="close-circle" size={18} color="#F44336"/>
                                        )}
                                        <Text style={[
                                            styles.statusText,
                                            {color: status.enabled ? '#4CAF50' : '#F44336'}
                                        ]}>
                                            {status.enabled ? 'Предоставлены' : 'Отклонены'}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Expo Token:</Text>
                                    <View style={styles.statusContainer}>
                                        {expoPushToken ? (
                                            <Ionicons name="checkmark-circle" size={18} color="#4CAF50"/>
                                        ) : (
                                            <Ionicons name="close-circle" size={18} color="#F44336"/>
                                        )}
                                        <Text style={[
                                            styles.statusText,
                                            {color: expoPushToken ? '#4CAF50' : '#F44336'}
                                        ]}>
                                            {expoPushToken ? 'Получен' : 'Отсутствует'}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Регистрация на сервере:</Text>
                                    <View style={styles.statusContainer}>
                                        {tokenRegistered ? (
                                            <Ionicons name="checkmark-circle" size={18} color="#4CAF50"/>
                                        ) : (
                                            <Ionicons name="close-circle" size={18} color="#F44336"/>
                                        )}
                                        <Text style={[
                                            styles.statusText,
                                            {color: tokenRegistered ? '#4CAF50' : '#F44336'}
                                        ]}>
                                            {tokenRegistered ? 'Зарегистрирован' : 'Не зарегистрирован'}
                                        </Text>
                                    </View>
                                </View>
                            </>
                        )}

                        {registrationError && (
                            <View style={styles.errorContainer}>
                                <Ionicons name="warning" size={18} color="#F44336"/>
                                <Text style={styles.errorText}>{registrationError}</Text>
                            </View>
                        )}

                        {expoPushToken && (
                            <View style={styles.tokenContainer}>
                                <Text style={styles.tokenLabel}>Токен устройства:</Text>
                                <Text style={styles.tokenValue} numberOfLines={1} ellipsizeMode="middle">
                                    {expoPushToken}
                                </Text>
                                <TouchableOpacity style={styles.copyButton} onPress={copyTokenToClipboard}>
                                    <Ionicons name="copy-outline" size={16} color="#555"/>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    <TouchableOpacity
                        style={[
                            styles.testButton,
                            (!expoPushToken || !tokenRegistered) && styles.disabledButton
                        ]}
                        onPress={handleSendTest}
                        disabled={!expoPushToken || !tokenRegistered || sendingTest}
                    >
                        {sendingTest ? (
                            <ActivityIndicator size="small" color="#fff"/>
                        ) : (
                            <>
                                <Ionicons name="notifications-outline" size={20} color="#fff"/>
                                <Text style={styles.buttonText}>Отправить тестовое уведомление</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <View style={styles.troubleshootingSection}>
                        <Text style={styles.troubleshootingTitle}>Решение проблем:</Text>
                        <View style={styles.troubleshootingItem}>
                            <Ionicons name="information-circle-outline" size={16} color="#0277BD"/>
                            <Text style={styles.troubleshootingText}>
                                Push-уведомления работают только на физических устройствах.
                            </Text>
                        </View>
                        <View style={styles.troubleshootingItem}>
                            <Ionicons name="information-circle-outline" size={16} color="#0277BD"/>
                            <Text style={styles.troubleshootingText}>
                                Убедитесь, что в настройках устройства разрешены уведомления для приложения.
                            </Text>
                        </View>
                        <View style={styles.troubleshootingItem}>
                            <Ionicons name="information-circle-outline" size={16} color="#0277BD"/>
                            <Text style={styles.troubleshootingText}>
                                Если перезагрузка не помогает, переустановите приложение.
                            </Text>
                        </View>
                    </View>
                </>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 12,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    refreshButton: {
        backgroundColor: '#770002',
        borderRadius: 4,
        padding: 6,
    },
    loadingContainer: {
        paddingVertical: 30,
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        color: '#555',
    },
    section: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 12,
    },
    infoRow: {
        flexDirection: 'row',
        marginBottom: 10,
    },
    infoLabel: {
        width: 150,
        fontSize: 14,
        color: '#666',
    },
    infoValue: {
        flex: 1,
        fontSize: 14,
        color: '#333',
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusText: {
        marginLeft: 6,
        fontSize: 14,
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 12,
        backgroundColor: '#FFEBEE',
        borderRadius: 6,
        marginTop: 10,
    },
    errorText: {
        marginLeft: 8,
        color: '#D32F2F',
        flex: 1,
        fontSize: 13,
    },
    tokenContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        padding: 10,
        backgroundColor: '#F5F5F5',
        borderRadius: 6,
    },
    tokenLabel: {
        fontSize: 14,
        color: '#666',
        marginRight: 8,
    },
    tokenValue: {
        flex: 1,
        fontSize: 12,
        color: '#333',
        fontFamily: 'monospace',
    },
    copyButton: {
        padding: 6,
    },
    testButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#770002',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 6,
        margin: 16,
    },
    disabledButton: {
        backgroundColor: '#ccc',
    },
    buttonText: {
        color: '#fff',
        fontWeight: '600',
        marginLeft: 8,
    },
    troubleshootingSection: {
        padding: 16,
        backgroundColor: '#E3F2FD',
        margin: 16,
        borderRadius: 6,
        marginTop: 0,
    },
    troubleshootingTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#0277BD',
        marginBottom: 8,
    },
    troubleshootingItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    troubleshootingText: {
        flex: 1,
        marginLeft: 8,
        fontSize: 14,
        color: '#0277BD',
    },
});