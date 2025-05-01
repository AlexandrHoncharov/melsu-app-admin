import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';

interface AccountListItemProps {
    account: {
        id: number;
        username: string;
        fullName?: string;
        role: string;
        lastUsed?: string; // ISO date string
    };
    isCurrentAccount: boolean;
    onSwitchAccount: (accountId: number) => void;
    onRemoveAccount: (accountId: number) => void;
}

const AccountListItem = ({
                             account,
                             isCurrentAccount,
                             onSwitchAccount,
                             onRemoveAccount
                         }: AccountListItemProps) => {
    // Get avatar letter from name or username
    const avatarLetter = account.fullName
        ? account.fullName.charAt(0).toUpperCase()
        : account.username.charAt(0).toUpperCase();

    // Get role text in Russian
    const getRoleText = (role: string) => {
        switch (role) {
            case 'student':
                return 'Студент';
            case 'teacher':
                return 'Преподаватель';
            case 'admin':
                return 'Администратор';
            default:
                return 'Пользователь';
        }
    };

    return (
        <View style={styles.accountItem}>
            <View style={styles.accountInfo}>
                <View style={styles.avatarContainer}>
                    <Text style={styles.avatarText}>{avatarLetter}</Text>
                </View>

                <View style={styles.accountDetails}>
                    <Text style={styles.accountName}>
                        {account.fullName || account.username}
                    </Text>
                    <Text style={styles.accountUsername}>{account.username}</Text>
                    <View style={styles.roleBadge}>
                        <Ionicons
                            name={account.role === 'student' ? 'school-outline' : 'briefcase-outline'}
                            size={12}
                            color="#fff"
                        />
                        <Text style={styles.roleText}>{getRoleText(account.role)}</Text>
                    </View>
                </View>
            </View>

            <View style={styles.actionButtons}>
                {isCurrentAccount && (
                    <View style={styles.currentAccountBadge}>
                        <Text style={styles.currentAccountText}>Текущий</Text>
                    </View>
                )}

                {!isCurrentAccount && (
                    <TouchableOpacity
                        style={styles.switchButton}
                        onPress={() => onSwitchAccount(account.id)}
                    >
                        <Text style={styles.switchButtonText}>Выбрать</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => onRemoveAccount(account.id)}
                >
                    <Ionicons name="trash-outline" size={18} color="#FF3B30"/>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
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
});

export default AccountListItem;