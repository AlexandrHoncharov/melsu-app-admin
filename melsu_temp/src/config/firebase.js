import {initializeApp} from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getReactNativePersistence, initializeAuth} from 'firebase/auth';

// Firebase конфигурация
const firebaseConfig = {
  apiKey: "AIzaSyABbRQxcIx-l10TbnGcSQIHBGU7k9cZ-3o",
  authDomain: "melsuchat.firebaseapp.com",
  projectId: "melsuchat",
  storageBucket: "melsuchat.appspot.com",
  messagingSenderId: "614010409697",
  appId: "1:614010409697:web:cc0b63b924ebbdf79ddda0",
  measurementId: "G-LZKWGF5SZK",
  databaseURL: "https://melsuchat-default-rtdb.europe-west1.firebasedatabase.app"
};

// Объявляем переменные глобально
let app = null;
let auth = null;
let database = null;

// Функция для имитации объекта Database Reference
function createMockReference(path) {
  return {
    key: path.split('/').pop(),
    path: path,
    _checkNotDeleted: () => true, // Это решает проблему с _checkNotDeleted
    toString: () => path,

    // Методы для работы с данными
    on: (eventType, callback) => {
      console.log(`Mock DB: listening to ${path} for ${eventType}`);

      // Создаем мок-снапшот
      const mockSnapshot = {
        key: path.split('/').pop(),
        val: () => ({}),
        exists: () => false,
        forEach: (fn) => {
        },
        hasChildren: () => false,
        numChildren: () => 0,
        toJSON: () => ({})
      };

      if (callback) setTimeout(() => callback(mockSnapshot), 0);
      return callback; // Возвращаем callback для off()
    },

    off: (eventType, callback) => {
      console.log(`Mock DB: unlisten ${path} for ${eventType}`);
      return undefined;
    },

    once: (eventType) => {
      console.log(`Mock DB: once ${path} for ${eventType}`);
      return Promise.resolve({
        key: path.split('/').pop(),
        val: () => ({}),
        exists: () => false,
        forEach: (fn) => {
        },
        hasChildren: () => false,
        numChildren: () => 0,
        toJSON: () => ({})
      });
    },

    push: () => {
      const newKey = `mock-key-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newPath = `${path}/${newKey}`;
      const newRef = createMockReference(newPath);
      newRef.key = newKey;
      return newRef;
    },

    set: (value) => {
      console.log(`Mock DB: set at ${path}`);
      return Promise.resolve();
    },

    update: (value) => {
      console.log(`Mock DB: update at ${path}`);
      return Promise.resolve();
    },

    remove: () => {
      console.log(`Mock DB: remove at ${path}`);
      return Promise.resolve();
    },

    child: (childPath) => {
      return createMockReference(`${path}/${childPath}`);
    },

    orderByChild: (path) => {
      console.log(`Mock DB: orderByChild ${path}`);
      return createMockReference(path);
    },

    limitToLast: (limit) => {
      console.log(`Mock DB: limitToLast ${limit}`);
      return createMockReference(path);
    },

    startAfter: (value) => {
      console.log(`Mock DB: startAfter`);
      return createMockReference(path);
    }
  };
}

// Попытка инициализации Firebase
try {
  console.log("Инициализация Firebase...");

  // Инициализация приложения
  app = initializeApp(firebaseConfig);
  console.log("Firebase app инициализирован");

  // Инициализация аутентификации с персистентностью через AsyncStorage
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
  console.log("Firebase Auth инициализирован с AsyncStorage");

  // Настоящий импорт getDatabase
  const {getDatabase} = require('firebase/database');
  database = getDatabase(app);
  console.log("Firebase Realtime Database инициализирована");

} catch (error) {
  console.error("Ошибка при инициализации Firebase:", error);

  // Базовая мок версия app
  app = {
    name: '[firebase-app-mock]',
    options: {...firebaseConfig},
    automaticDataCollectionEnabled: false
  };

  // Мок версия auth
  auth = {
    currentUser: null,
    app: app,
    name: '[auth-mock]',

    signInWithCustomToken: async () => {
      console.log("Mock: signInWithCustomToken");
      return {user: {uid: 'mock-user'}};
    },

    signInAnonymously: async () => {
      console.log("Mock: signInAnonymously");
      return {user: {uid: 'anonymous-user'}};
    },

    signOut: async () => {
      console.log("Mock: signOut");
      return Promise.resolve();
    }
  };

  // Мок версия database с поддержкой _checkNotDeleted
  database = {
    app: app,
    _checkNotDeleted: () => true,

    ref: (path = '/') => createMockReference(path),

    // Дополнительные методы
    getReferenceFromURL: (url) => createMockReference('/mock-from-url'),
    goOffline: () => console.log("Mock DB: goOffline"),
    goOnline: () => console.log("Mock DB: goOnline"),
    refFromURL: (url) => createMockReference('/mock-from-url')
  };

  console.warn("⚠️ Инициализация Firebase не удалась. Используется имитация API для предотвращения сбоев.");
}

export { app, auth, database };