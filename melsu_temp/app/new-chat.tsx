import React, {useEffect, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    SafeAreaView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import {router, Stack} from 'expo-router';
import {Ionicons} from '@expo/vector-icons';
import {useAuth} from '../hooks/useAuth';
import apiClient from '../src/api/apiClient';
import chatService from '../src/services/chatService';

export default function NewChatScreen() {
    const [users, setUsers] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [processingUser, setProcessingUser] = useState(null);
    const [processingGroup, setProcessingGroup] = useState(null);
    const [isGroupChat, setIsGroupChat] = useState(false);
    const {user} = useAuth();

    // Group chat is only available for teachers
    const canCreateGroupChat = user?.role === 'teacher';

    // Determine who to show in the list based on the current user's role
    const targetRole = user?.role === 'student' ? 'teacher' : 'student';
    const roleTitle = targetRole === 'teacher' ? 'преподавателей' : 'студентов';

    useEffect(() => {
        loadData();
    }, [isGroupChat]);

    const loadData = async () => {
        try {
            setLoading(true);

            if (!user || !user.role) {
                throw new Error('Информация о пользователе отсутствует');
            }

            // If creating a group chat, load available groups
            if (isGroupChat && canCreateGroupChat) {
                try {
                    const response = await apiClient.get('/schedule/groups');
                    console.log(`Loaded ${response.data?.length || 0} groups from API`);

                    // Sort groups alphabetically
                    const sortedGroups = (response.data || []).sort((a, b) =>
                        a.name ? a.name.localeCompare(b.name) : 0
                    );

                    setGroups(sortedGroups);
                } catch (error) {
                    console.error('Error loading groups from API:', error);
                    Alert.alert(
                        'Ошибка загрузки',
                        'Не удалось получить список групп. Проверьте подключение к интернету.',
                        [{text: 'OK'}]
                    );
                    setGroups([]);
                }
            }
            // Otherwise, load users of the target role
            else {
                console.log(`Current user role: ${user.role}, loading users with role: ${targetRole}`);

                try {
                    const response = await apiClient.get('/users', {
                        params: {role: targetRole}
                    });

                    console.log(`Loaded ${response.data?.length || 0} ${targetRole} from API`);

                    // Filter out unverified students if current user is a teacher and target role is student
                    let filteredUsers = response.data || [];
                    if (user.role === 'teacher' && targetRole === 'student') {
                        filteredUsers = filteredUsers.filter(student =>
                            student.verificationStatus === 'verified'
                        );
                        console.log(`Filtered to ${filteredUsers.length} verified students`);
                    }

                    setUsers(filteredUsers);
                } catch (error) {
                    console.error('Error loading users from API:', error);
                    Alert.alert(
                        'Ошибка загрузки',
                        'Не удалось получить список пользователей. Проверьте подключение к интернету.',
                        [{text: 'OK'}]
                    );
                    setUsers([]);
                }
            }
        } catch (error) {
            console.error('Error in loadData:', error);
            Alert.alert(
                'Ошибка',
                error.message || 'Произошла ошибка при загрузке данных'
            );
        } finally {
            setLoading(false);
        }
    };

    const handleSelectUser = async (selectedUser) => {
        if (processingUser) return; // Prevent multiple clicks

        try {
            setProcessingUser(selectedUser.id);

            // Initialize the chat service
            const initResult = await chatService.initialize();
            if (!initResult) {
                Alert.alert(
                    'Ошибка',
                    'Не удалось инициализировать сервис чата. Возможно, отсутствует подключение к интернету.',
                    [{text: 'OK'}]
                );
                return;
            }

            // Create a personal chat
            const chatId = await chatService.createPersonalChat(selectedUser.id);
            if (!chatId) {
                throw new Error('Failed to create chat - no chat ID returned');
            }

            // Navigate to the chat
            router.replace(`/chat/${chatId}`);
        } catch (error) {
            console.error('Error creating chat:', error);
            Alert.alert(
                'Ошибка',
                'Не удалось создать чат. Пожалуйста, попробуйте еще раз.',
                [{text: 'OK'}]
            );
        } finally {
            setProcessingUser(null);
        }
    };

    const handleCreateGroupChat = async (group) => {
        if (processingGroup) return; // Prevent multiple clicks

        try {
            setProcessingGroup(group.name);

            // Initialize the chat service
            const initResult = await chatService.initialize();
            if (!initResult) {
                Alert.alert(
                    'Ошибка',
                    'Не удалось инициализировать сервис чата. Возможно, отсутствует подключение к интернету.',
                    [{text: 'OK'}]
                );
                return;
            }

            // Create a group chat
            const chatId = await chatService.createGroupChat(group.name);
            if (!chatId) {
                throw new Error('Failed to create group chat - no chat ID returned');
            }

            // Navigate to the chat
            router.replace(`/chat/${chatId}`);
        } catch (error) {
            console.error('Error creating group chat:', error);
            Alert.alert(
                'Ошибка',
                'Не удалось создать групповой чат. Пожалуйста, попробуйте еще раз.',
                [{text: 'OK'}]
            );
        } finally {
            setProcessingGroup(null);
        }
    };

    const filteredUsers = users.filter(user => {
        if (!user) return false;

        const searchLower = searchText.toLowerCase();
        return (
            (user.fullName?.toLowerCase() || '').includes(searchLower) ||
            (user.username?.toLowerCase() || '').includes(searchLower) ||
            (user.department?.toLowerCase() || '').includes(searchLower) ||
            (user.group?.toLowerCase() || '').includes(searchLower) ||
            (user.position?.toLowerCase() || '').includes(searchLower) ||
            (user.faculty?.toLowerCase() || '').includes(searchLower)
        );
    });

    const filteredGroups = groups.filter(group => {
        if (!group || !group.name) return false;

        const searchLower = searchText.toLowerCase();
        return group.name.toLowerCase().includes(searchLower);
    });

    const renderUserItem = ({item}) => {
        if (!item) return null;

        // Format subtitle based on user role
        let subtitle = item.role === 'teacher' ? 'Преподаватель' : 'Студент';

        if (item.role === 'teacher') {
            if (item.department) {
                subtitle = `${subtitle} • ${item.department}`;
            }
            if (item.position) {
                subtitle = `${subtitle} • ${item.position}`;
            }
        } else { // student
            if (item.group) {
                subtitle = `${subtitle} • ${item.group}`;
            }
            if (item.faculty) {
                subtitle = `${subtitle} • ${item.faculty}`;
            }
        }

        const isProcessing = processingUser === item.id;
        const displayName = item.fullName || item.username || "Пользователь";
        const initials = (displayName || "??").substring(0, 2).toUpperCase();

        return (
            <TouchableOpacity
                style={styles.userItem}
                onPress={() => handleSelectUser(item)}
                disabled={isProcessing}
            >
                <View style={[
                    styles.avatar,
                    item.role === 'teacher' ? styles.teacherAvatar : styles.studentAvatar
                ]}>
                    <Text style={styles.avatarText}>{initials}</Text>
                </View>

                <View style={styles.userInfo}>
                    <Text style={styles.userName}>{displayName}</Text>
                    <Text style={styles.userSubtitle}>{subtitle}</Text>
                </View>

                {isProcessing ? (
                    <ActivityIndicator size="small" color="#770002"/>
                ) : (
                    <Ionicons name="chevron-forward" size={20} color="#999"/>
                )}
            </TouchableOpacity>
        );
    };

    const renderGroupItem = ({item}) => {
        if (!item || !item.name) return null;

        const isProcessing = processingGroup === item.name;

        return (
            <TouchableOpacity
                style={styles.userItem}
                onPress={() => handleCreateGroupChat(item)}
                disabled={isProcessing}
            >
                <View style={styles.avatar}>
                    <Ionicons name="people" size={22} color="#fff"/>
                </View>

                <View style={styles.userInfo}>
                    <Text style={styles.userName}>Группа {item.name}</Text>
                    <Text style={styles.userSubtitle}>Групповой чат для студентов</Text>
                </View>

                {isProcessing ? (
                    <ActivityIndicator size="small" color="#770002"/>
                ) : (
                    <Ionicons name="chevron-forward" size={20} color="#999"/>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <Stack.Screen
                options={{
                    title: 'Новый чат',
                    headerTintColor: '#770002',
                }}
            />

            {/* Group chat toggle for teachers */}
            {canCreateGroupChat && (
                <View style={styles.toggleContainer}>
                    <Text style={styles.toggleLabel}>
                        {isGroupChat ? 'Создание группового чата' : 'Личный чат'}
                    </Text>
                    <View style={styles.switchContainer}>
                        <Text style={styles.switchLabel}>Групповой чат</Text>
                        <Switch
                            trackColor={{false: '#ddd', true: '#770002'}}
                            thumbColor={'#fff'}
                            onValueChange={setIsGroupChat}
                            value={isGroupChat}
                        />
                    </View>
                </View>
            )}

            <View style={styles.headerContainer}>
                <Text style={styles.headerText}>
                    {isGroupChat
                        ? 'Выберите группу для создания чата'
                        : (targetRole === 'teacher'
                            ? 'Выберите преподавателя для начала общения'
                            : 'Выберите студента для начала общения')
                    }
                </Text>
            </View>

            {/* Show note about verified students for teachers */}
            {user?.role === 'teacher' && targetRole === 'student' && !isGroupChat && (
                <View style={styles.noteContainer}>
                    <Ionicons name="information-circle-outline" size={20} color="#770002"/>
                    <Text style={styles.noteText}>
                        Отображаются только верифицированные студенты
                    </Text>
                </View>
            )}

            <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color="#999"/>
                <TextInput
                    style={styles.searchInput}
                    placeholder={isGroupChat
                        ? 'Поиск группы...'
                        : `Поиск ${roleTitle}...`}
                    value={searchText}
                    onChangeText={setSearchText}
                />
                {searchText ? (
                    <TouchableOpacity onPress={() => setSearchText('')}>
                        <Ionicons name="close-circle" size={20} color="#999"/>
                    </TouchableOpacity>
                ) : null}
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#770002"/>
                </View>
            ) : (
                isGroupChat ? (
                    <FlatList
                        data={filteredGroups}
                        renderItem={renderGroupItem}
                        keyExtractor={item => String(item?.name || Math.random())}
                        contentContainerStyle={styles.listContent}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Ionicons name="people-outline" size={48} color="#ccc"/>
                                <Text style={styles.emptyText}>
                                    {searchText
                                        ? 'По вашему запросу ничего не найдено'
                                        : 'Нет доступных групп для создания чата'}
                                </Text>
                            </View>
                        }
                    />
                ) : (
                    <FlatList
                        data={filteredUsers}
                        renderItem={renderUserItem}
                        keyExtractor={item => String(item?.id || Math.random())}
                        contentContainerStyle={styles.listContent}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Ionicons name="people-outline" size={48} color="#ccc"/>
                                <Text style={styles.emptyText}>
                                    {searchText
                                        ? 'По вашему запросу ничего не найдено'
                                        : `Нет доступных ${roleTitle} для общения`}
                                </Text>
                            </View>
                        }
                    />
                )
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    toggleContainer: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    toggleLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#770002',
    },
    switchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    switchLabel: {
        marginRight: 8,
        fontSize: 14,
        color: '#666',
    },
    headerContainer: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    headerText: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
    },
    noteContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF3E0',
        margin: 16,
        marginTop: 0,
        padding: 10,
        borderRadius: 8,
    },
    noteText: {
        flex: 1,
        fontSize: 14,
        color: '#E65100',
        marginLeft: 8,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        margin: 16,
        padding: 10,
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
    },
    searchInput: {
        flex: 1,
        marginLeft: 8,
        fontSize: 16,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: 16,
        paddingTop: 0,
    },
    userItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#4CAF50',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    teacherAvatar: {
        backgroundColor: '#2E7D32', // Green for teachers
    },
    studentAvatar: {
        backgroundColor: '#0277BD', // Blue for students
    },
    avatarText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
    },
    userInfo: {
        flex: 1,
    },
    userName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    userSubtitle: {
        fontSize: 14,
        color: '#666',
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        fontSize: 16,
        color: '#999',
        textAlign: 'center',
        marginTop: 16,
    },
});