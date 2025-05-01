import React, {useState} from 'react';
import {FlatList, Modal, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {User} from '../../hooks/useAuth';

interface QuickSwitchProps {
    currentUser: User | null;
    savedAccounts: User[];
    visible: boolean;
    onClose: () => void;
    onSwitchAccount: (accountId: number) => Promise<void>;
    onAddAccount: () => void;
}

const QuickAccountSwitch = ({
                                currentUser,
                                savedAccounts,
                                visible,
                                onClose,
                                onSwitchAccount,
                                onAddAccount
                            }: QuickSwitchProps) => {
    const [switchingAccount, setSwitchingAccount] = useState<number | null>(null);

    const handleAccountPress = async (accountId: number) => {
        try {
            // If this is already the current user, just close modal
            if (currentUser?.id === accountId) {
                onClose();
                return;
            }

            // Set the account as switching (for UI feedback)
            setSwitchingAccount(accountId);

            // Switch account
            await onSwitchAccount(accountId);

            // Reset and close when done
            setSwitchingAccount(null);
            onClose();
        } catch (error) {
            console.error('Error in quick switch:', error);
            setSwitchingAccount(null);
        }
    };

    // Max number of accounts to show directly in the quick switch
    const MAX_VISIBLE_ACCOUNTS = 4;

    // Sort accounts: current user first, then most recently used
    const sortedAccounts = [...savedAccounts].sort((a, b) => {
        // Current user first
        if (currentUser && a.id === currentUser.id) return -1;
        if (currentUser && b.id === currentUser.id) return 1;

        // Then by lastUsed if available
        if (a.lastUsed && b.lastUsed) {
            return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
        }

        // Fallback to alphabetical by name
        const aName = a.fullName || a.username;
        const bName = b.fullName || b.username;
        return aName.localeCompare(bName);
    });

    // Show all accounts if 4 or fewer, otherwise show the first 3 plus "More accounts..." option
    const displayAccounts = sortedAccounts.length <= MAX_VISIBLE_ACCOUNTS
        ? sortedAccounts
        : sortedAccounts.slice(0, MAX_VISIBLE_ACCOUNTS - 1);

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.modalOverlay}>
                    <TouchableWithoutFeedback>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Переключение аккаунта</Text>
                                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                    <Ionicons name="close" size={24} color="#666"/>
                                </TouchableOpacity>
                            </View>

                            <FlatList
                                data={displayAccounts}
                                keyExtractor={(item) => item.id.toString()}
                                renderItem={({item}) => (
                                    <TouchableOpacity
                                        style={[
                                            styles.accountItem,
                                            currentUser?.id === item.id && styles.currentAccountItem
                                        ]}
                                        onPress={() => handleAccountPress(item.id)}
                                        disabled={switchingAccount !== null}
                                    >
                                        <View style={styles.accountAvatar}>
                                            <Text style={styles.avatarText}>
                                                {item.fullName
                                                    ? item.fullName.charAt(0).toUpperCase()
                                                    : item.username.charAt(0).toUpperCase()}
                                            </Text>
                                        </View>

                                        <View style={styles.accountInfo}>
                                            <Text style={styles.accountName} numberOfLines={1}>
                                                {item.fullName || item.username}
                                            </Text>
                                            <Text style={styles.accountDetails} numberOfLines={1}>
                                                {item.username}
                                                {item.role === 'student' && item.group && ` • ${item.group}`}
                                            </Text>
                                        </View>

                                        {switchingAccount === item.id ? (
                                            <View style={styles.loadingIndicator}>
                                                <Ionicons name="sync" size={16} color="#770002"/>
                                            </View>
                                        ) : currentUser?.id === item.id ? (
                                            <View style={styles.checkmark}>
                                                <Ionicons name="checkmark-circle" size={18} color="#34C759"/>
                                            </View>
                                        ) : null}
                                    </TouchableOpacity>
                                )}
                                scrollEnabled={false}
                                contentContainerStyle={styles.accountsList}
                            />

                            {sortedAccounts.length > MAX_VISIBLE_ACCOUNTS && (
                                <TouchableOpacity
                                    style={styles.moreAccountsButton}
                                    onPress={() => {
                                        onClose();
                                        // Delay navigation slightly to allow modal to close
                                        setTimeout(() => {
                                            require('expo-router').router.push('/profile/switch-account');
                                        }, 100);
                                    }}
                                >
                                    <Ionicons name="people-outline" size={16} color="#770002"/>
                                    <Text style={styles.moreAccountsText}>
                                        Показать все аккаунты ({sortedAccounts.length})
                                    </Text>
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity
                                style={styles.addAccountButton}
                                onPress={() => {
                                    onClose();
                                    onAddAccount();
                                }}
                            >
                                <Ionicons name="add-circle-outline" size={16} color="#770002"/>
                                <Text style={styles.addAccountText}>Добавить аккаунт</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '85%',
        backgroundColor: 'white',
        borderRadius: 16,
        paddingVertical: 16,
        paddingHorizontal: 8,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        maxHeight: '80%', // Ensure it doesn't take up too much screen space
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        marginBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        paddingBottom: 12,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    closeButton: {
        padding: 4,
    },
    accountsList: {
        marginBottom: 8,
    },
    accountItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 10,
        marginVertical: 2,
    },
    currentAccountItem: {
        backgroundColor: '#F0F7FF',
    },
    accountAvatar: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: '#bb0000',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#bb0000',
        shadowOffset: {width: 0, height: 1},
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 2,
    },
    avatarText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: 'white',
    },
    accountInfo: {
        flex: 1,
        marginLeft: 14,
    },
    accountName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#333',
        marginBottom: 2,
    },
    accountDetails: {
        fontSize: 12,
        color: '#777',
    },
    checkmark: {
        marginLeft: 8,
    },
    loadingIndicator: {
        marginLeft: 8,
    },
    moreAccountsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginHorizontal: 12,
        marginTop: 8,
        borderRadius: 10,
        backgroundColor: '#f8f8f8',
        borderWidth: 1,
        borderColor: '#eaeaea',
    },
    moreAccountsText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#770002',
        marginLeft: 8,
    },
    addAccountButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginHorizontal: 12,
        marginTop: 10,
        marginBottom: 6,
        borderRadius: 10,
        backgroundColor: '#770002',
    },
    addAccountText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#ffffff',
        marginLeft: 8,
    },
});

export default QuickAccountSwitch;