// src/navigation/index.js
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

// Существующие экраны
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import VerificationScreen from '../screens/VerificationScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ScheduleScreen from '../screens/ScheduleScreen';

// Новые экраны чата
import ChatListScreen from '../screens/chat/ChatListScreen';
import ChatScreen from '../screens/chat/ChatScreen';
import NewChatScreen from '../screens/chat/NewChatScreen';
import ChatInfoScreen from '../screens/chat/ChatInfoScreen';
import AddChatMemberScreen from '../screens/chat/AddChatMemberScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Общие настройки для Stack навигатора
const stackScreenOptions = {
  headerStyle: {
    backgroundColor: '#fff',
  },
  headerTintColor: '#770002',
  headerTitleStyle: {
    fontWeight: 'bold',
  },
};

// Навигатор для чатов
const ChatStack = () => {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen
        name="ChatList"
        component={ChatListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={({ route }) => ({ title: route.params.chatName })}
      />
      <Stack.Screen
        name="NewChat"
        component={NewChatScreen}
        options={{
          title: 'Новый чат',
          headerShown: false,
          presentation: 'modal'
        }}
      />
      <Stack.Screen
        name="ChatInfo"
        component={ChatInfoScreen}
        options={{ title: 'Информация о чате' }}
      />
      <Stack.Screen
        name="AddChatMember"
        component={AddChatMemberScreen}
        options={{ title: 'Добавить участников' }}
      />
    </Stack.Navigator>
  );
};

// Основная табы-навигация
const AppTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Schedule') {
            iconName = focused ? 'calendar' : 'calendar-outline';
          } else if (route.name === 'Chats') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#770002',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
      })}
    >
      <Tab.Screen
        name="Schedule"
        component={ScheduleScreen}
        options={{ title: 'Расписание' }}
      />
      <Tab.Screen
        name="Chats"
        component={ChatStack}
        options={{ title: 'Чаты' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Профиль' }}
      />
    </Tab.Navigator>
  );
};

// Корневой навигатор
const RootNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="App" component={AppTabs} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen
        name="Verification"
        component={VerificationScreen}
        options={{ headerShown: true, ...stackScreenOptions }}
      />
    </Stack.Navigator>
  );
};

export default RootNavigator;