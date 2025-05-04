import React, {useMemo, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useAuth} from '../../../hooks/useAuth';
import {router} from 'expo-router';
import AccountListItem from '../../../components/AccountListItem';

export default function SwitchAccountScreen() {
    const {user: currentUser, savedAccounts, switchAccount, removeSavedAccount, isLoading} = useAuth();
    const [loading, setLoading] = useState(false);

    // Sort saved accounts with current account first, then by lastUsed date
    const sortedAccounts = useMemo(() => {
        if (!savedAccounts || savedAccounts.length === 0) return [];

        return [...savedAccounts].sort((a, b) => {
            // Current account always comes first
            if (currentUser && a.id === currentUser.id) return -1;
            if (currentUser && b.id === currentUser.id) return 1;

            // Sort by lastUsed date if available (most recent first)
            if (a.lastUsed && b.lastUsed) {
                return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
            }

            // If one has lastUsed and the other doesn't, the one with lastUsed comes first
            if (a.lastUsed) return -1;
            if (b.lastUsed) return 1;

            // Finally, sort alphabetically by name
            const aName = a.fullName || a.username;
            const bName = b.fullName || b.username;
            return aName.localeCompare(bName);
        });
    }, [savedAccounts, currentUser]);

    // Handler for switching accounts
    const handleSwitchAccount = async (accountId) => {
        if (currentUser?.id === accountId) {
            Alert.alert('Информация', 'Вы уже используете этот аккаунт');
            return;
        }

        setLoading(true);
        try {
            await switchAccount(accountId);

            // Navigate back to profile after successful switch
            router.replace('/(tabs)/profile');
        } catch (error) {
            console.error('Error switching account:', error);
            Alert.alert('Ошибка', 'Не удалось переключить аккаунт. Пожалуйста, попробуйте еще раз.');
        } finally {
            setLoading(false);
        }
    };

    // Handler for removing saved account
    const handleRemoveAccount = (accountId) => {
        Alert.alert(
            'Удаление аккаунта',
            'Вы уверены, что хотите удалить этот аккаунт из сохраненных? Вы сможете войти в него снова, но потребуется ввести пароль.',
            [
                {text: 'Отмена', style: 'cancel'},
                {
                    text: 'Удалить',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await removeSavedAccount(accountId);
                        } catch (error) {
                            console.error('Error removing account:', error);
                            Alert.alert('Ошибка', 'Не удалось удалить аккаунт');
                        }
                    }
                }
            ]
        );
    };

    // Handler for adding a new account
    const handleAddAccount = () => {
        // Navigate to login screen with parameter indicating we're adding another account
        router.push({
            pathname: '/login',
            params: {addAccount: 'true'}
        });
    };

    // Loading state
    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#bb0000"/>
                <Text style={styles.loadingText}>Загрузка аккаунтов...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content"/>

            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <Ionicons name="arrow-back" size={24} color="#770002"/>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Переключение аккаунта</Text>
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#bb0000"/>
                    <Text style={styles.loadingText}>Переключение аккаунта...</Text>
                </View>
            ) : (
                <>
                    <Text style={styles.sectionTitle}>Ваши аккаунты</Text>

                    {sortedAccounts.length > 0 ? (
                        <FlatList
                            data={sortedAccounts}
                            keyExtractor={(item) => item.id.toString()}
                            renderItem={({item}) => (
                                <AccountListItem
                                    account={item}
                                    isCurrentAccount={currentUser?.id === item.id}
                                    onSwitchAccount={handleSwitchAccount}
                                    onRemoveAccount={handleRemoveAccount}
                                />
                            )}
                            contentContainerStyle={styles.accountsList}
                            ItemSeparatorComponent={() => <View style={styles.separator}/>}
                        />
                    ) : (
                        <View style={styles.emptyContainer}>
                            <Ionicons name="people-outline" size={48} color="#aaa"/>
                            <Text style={styles.emptyText}>У вас нет сохраненных аккаунтов</Text>
                        </View>
                    )}

                    <TouchableOpacity
                        style={styles.addAccountButton}
                        onPress={handleAddAccount}
                    >
                        <Ionicons name="add-circle-outline" size={20} color="#FFF"/>
                        <Text style={styles.addAccountText}>Добавить аккаунт</Text>
                    </TouchableOpacity>
                </>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f7fa',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        backgroundColor: '#fff',
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
        marginLeft: 8,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: '#666',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#555',
        margin: 16,
    },
    accountsList: {
        paddingHorizontal: 16,
    },
    accountItem: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 16,
        marginBottom: 8,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 1},
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    accountInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    avatarContainer: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#bb0000',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        shadowColor: '#bb0000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 3,
    },
    avatarText: {
        fontSize: 22,
        fontWeight: 'bold',
        color: 'white',
    },
    accountDetails: {
        flex: 1,
    },
    accountName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 2,
    },
    accountUsername: {
        fontSize: 13,
        color: '#777',
        marginBottom: 4,
    },
    roleBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#770000',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        alignSelf: 'flex-start',
    },
    roleText: {
        color: 'white',
        fontSize: 11,
        fontWeight: '500',
        marginLeft: 3,
    },
    actionButtons: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    currentAccountBadge: {
        backgroundColor: '#E3F2FD',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        marginRight: 8,
    },
    currentAccountText: {
        color: '#1976D2',
        fontSize: 13,
        fontWeight: '500',
    },
    switchButton: {
        backgroundColor: '#770002',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        marginRight: 8,
    },
    switchButtonText: {
        color: 'white',
        fontSize: 13,
        fontWeight: '500',
    },
    removeButton: {
        padding: 8,
    },
    separator: {
        height: 8,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingBottom: 100,
    },
    emptyText: {
        fontSize: 16,
        color: '#888',
        marginTop: 16,
    },
    addAccountButton: {
        flexDirection: 'row',
        backgroundColor: '#770002',
        borderRadius: 12,
        paddingVertical: 14,
        justifyContent: 'center',
        alignItems: 'center',
        margin: 16,
        shadowColor: '#bb0000',
        shadowOffset: {width: 0, height: 3},
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 4,
    },
    addAccountText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 8,
    },
});