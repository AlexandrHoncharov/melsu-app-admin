// src/config/firebase.js
import {initializeApp} from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

// Флаг для отслеживания статуса инициализации
let initialized = false;
let initializationAttempted = false;

// Безопасная инициализация Firebase
const initializeFirebase = async () => {
  // Если уже была попытка инициализации, не повторяем её
  if (initializationAttempted) {
    return { app, auth, database, initialized };
  }

  initializationAttempted = true;

  try {
    console.log("Инициализация Firebase...");

    // 1. Инициализация приложения
    app = initializeApp(firebaseConfig);
    console.log("Firebase app инициализирован");

    // 2. Инициализация аутентификации с персистентностью через AsyncStorage
    // Используем динамический импорт для предотвращения ошибок при первичной загрузке
    try {
      const { getReactNativePersistence, initializeAuth } = await import('firebase/auth');
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage)
      });
      console.log("Firebase Auth инициализирован с AsyncStorage");
    } catch (authError) {
      console.error("Ошибка при инициализации Firebase Auth:", authError);
      // Если произошла ошибка с Auth, продолжаем с Database
    }

    // 3. Инициализация базы данных
    try {
      const { getDatabase } = await import('firebase/database');
      database = getDatabase(app);
      console.log("Firebase Realtime Database инициализирована");
    } catch (dbError) {
      console.error("Ошибка при инициализации Firebase Database:", dbError);
    }

    // Если дошли до этой точки, считаем инициализацию успешной
    initialized = true;
    return { app, auth, database, initialized };

  } catch (error) {
    console.error("Ошибка при инициализации Firebase:", error);
    initialized = false;

    // Создаем заглушки для предотвращения ошибок в коде
    app = app || {
      name: '[firebase-app-mock]',
      options: {...firebaseConfig},
      automaticDataCollectionEnabled: false
    };

    auth = auth || {
      currentUser: null,
      app: app,
      name: '[auth-mock]',
      signInWithCustomToken: async () => ({ user: { uid: 'mock-user' } }),
      signInAnonymously: async () => ({ user: { uid: 'anonymous-user' } }),
      signOut: async () => Promise.resolve()
    };

    database = database || createMockDatabase();

    return { app, auth, database, initialized };
  }
};

// Функция для создания имитации базы данных
function createMockDatabase() {
  return {
    app,
    _checkNotDeleted: () => true,
    ref: (path = '/') => createMockReference(path),
    getReferenceFromURL: (url) => createMockReference('/mock-from-url'),
    goOffline: () => console.log("Mock DB: goOffline"),
    goOnline: () => console.log("Mock DB: goOnline"),
    refFromURL: (url) => createMockReference('/mock-from-url')
  };
}

// Функция для имитации объекта Database Reference
function createMockReference(path) {
  return {
    key: path.split('/').pop(),
    path: path,
    _path: path,
    _checkNotDeleted: () => true,
    toString: () => path,
    on: (eventType, callback) => {
      console.log(`Mock DB: listening to ${path} for ${eventType}`);
      if (callback) setTimeout(() => callback({
        key: path.split('/').pop(),
        val: () => ({}),
        exists: () => false,
        forEach: (fn) => {},
        hasChildren: () => false,
        numChildren: () => 0,
        toJSON: () => ({})
      }), 0);
      return callback;
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
        forEach: (fn) => {},
        hasChildren: () => false,
        numChildren: () => 0,
        toJSON: () => ({})
      });
    },
    push: () => {
      const newKey = `mock-key-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
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

// Экспортируем соответствующие методы для использования в компонентах
let cachedResult = null;

// Экспортируем функции Firebase/database
export const get = async (...args) => {
  if (!cachedResult) {
    cachedResult = await initializeFirebase();
  }
  if (!cachedResult.initialized) {
    return { exists: () => false, val: () => null };
  }
  try {
    const { get } = await import('firebase/database');
    return await get(...args);
  } catch (error) {
    console.warn('Error using Firebase get:', error);
    return { exists: () => false, val: () => null };
  }
};

export const set = async (...args) => {
  if (!cachedResult) {
    cachedResult = await initializeFirebase();
  }
  if (!cachedResult.initialized) {
    return Promise.resolve();
  }
  try {
    const { set } = await import('firebase/database');
    return await set(...args);
  } catch (error) {
    console.warn('Error using Firebase set:', error);
    return Promise.resolve();
  }
};

export const update = async (...args) => {
  if (!cachedResult) {
    cachedResult = await initializeFirebase();
  }
  if (!cachedResult.initialized) {
    return Promise.resolve();
  }
  try {
    const { update } = await import('firebase/database');
    return await update(...args);
  } catch (error) {
    console.warn('Error using Firebase update:', error);
    return Promise.resolve();
  }
};

export const push = (...args) => {
  if (!cachedResult) {
    // Для push мы не делаем await, вместо этого возвращаем
    // мок-объект с методом key, чтобы код не ломался
    setTimeout(() => initializeFirebase(), 0);
    const mockRef = createMockReference('mock/path');
    mockRef.key = `mock-key-${Date.now()}`;
    return mockRef;
  }
  if (!cachedResult.initialized) {
    const mockRef = createMockReference('mock/path');
    mockRef.key = `mock-key-${Date.now()}`;
    return mockRef;
  }
  try {
    const { push } = require('firebase/database');
    return push(...args);
  } catch (error) {
    console.warn('Error using Firebase push:', error);
    const mockRef = createMockReference('mock/path');
    mockRef.key = `mock-key-${Date.now()}`;
    return mockRef;
  }
};

export const ref = (...args) => {
  if (!cachedResult) {
    // Аналогично push
    setTimeout(() => initializeFirebase(), 0);
    return createMockReference(args[1] || '/');
  }
  if (!cachedResult.initialized || !cachedResult.database) {
    return createMockReference(args[1] || '/');
  }
  try {
    const { ref } = require('firebase/database');
    return ref(...args);
  } catch (error) {
    console.warn('Error using Firebase ref:', error);
    return createMockReference(args[1] || '/');
  }
};

export const onValue = (...args) => {
  if (!cachedResult) {
    setTimeout(() => initializeFirebase(), 0);
    return () => {}; // Возвращаем пустую функцию для отписки
  }
  if (!cachedResult.initialized) {
    // Если не инициализировано, просто вызываем callback с пустыми данными
    setTimeout(() => {
      if (args[1]) {
        args[1]({
          exists: () => false,
          val: () => null,
          forEach: () => {}
        });
      }
    }, 0);
    return () => {}; // Возвращаем пустую функцию для отписки
  }
  try {
    const { onValue } = require('firebase/database');
    return onValue(...args);
  } catch (error) {
    console.warn('Error using Firebase onValue:', error);
    // Если ошибка, просто вызываем callback с пустыми данными
    setTimeout(() => {
      if (args[1]) {
        args[1]({
          exists: () => false,
          val: () => null,
          forEach: () => {}
        });
      }
    }, 0);
    return () => {}; // Возвращаем пустую функцию для отписки
  }
};

export const off = (...args) => {
  if (!cachedResult || !cachedResult.initialized) {
    return; // Ничего не делаем, если не инициализировано
  }
  try {
    const { off } = require('firebase/database');
    return off(...args);
  } catch (error) {
    console.warn('Error using Firebase off:', error);
  }
};

export const query = (...args) => {
  if (!cachedResult || !cachedResult.initialized) {
    return args[0]; // Просто возвращаем первый аргумент (ref)
  }
  try {
    const { query } = require('firebase/database');
    return query(...args);
  } catch (error) {
    console.warn('Error using Firebase query:', error);
    return args[0]; // В случае ошибки возвращаем первый аргумент (ref)
  }
};

export const orderByChild = (path) => {
  if (!cachedResult || !cachedResult.initialized) {
    return (ref) => ref; // Возвращаем функцию-заглушку
  }
  try {
    const { orderByChild } = require('firebase/database');
    return orderByChild(path);
  } catch (error) {
    console.warn('Error using Firebase orderByChild:', error);
    return (ref) => ref; // В случае ошибки возвращаем функцию-заглушку
  }
};

export const limitToLast = (limit) => {
  if (!cachedResult || !cachedResult.initialized) {
    return (ref) => ref; // Возвращаем функцию-заглушку
  }
  try {
    const { limitToLast } = require('firebase/database');
    return limitToLast(limit);
  } catch (error) {
    console.warn('Error using Firebase limitToLast:', error);
    return (ref) => ref; // В случае ошибки возвращаем функцию-заглушку
  }
};

export const startAfter = (value) => {
  if (!cachedResult || !cachedResult.initialized) {
    return (ref) => ref; // Возвращаем функцию-заглушку
  }
  try {
    const { startAfter } = require('firebase/database');
    return startAfter(value);
  } catch (error) {
    console.warn('Error using Firebase startAfter:', error);
    return (ref) => ref; // В случае ошибки возвращаем функцию-заглушку
  }
};

export const serverTimestamp = () => {
  if (!cachedResult || !cachedResult.initialized) {
    return Date.now(); // Возвращаем текущее время
  }
  try {
    const { serverTimestamp } = require('firebase/database');
    return serverTimestamp();
  } catch (error) {
    console.warn('Error using Firebase serverTimestamp:', error);
    return Date.now(); // В случае ошибки возвращаем текущее время
  }
};

// Экспортируем функции Firebase/auth
export const signInWithCustomToken = async (...args) => {
  if (!cachedResult) {
    cachedResult = await initializeFirebase();
  }
  if (!cachedResult.initialized || !cachedResult.auth) {
    return { user: { uid: 'mock-user' } };
  }
  try {
    const { signInWithCustomToken } = await import('firebase/auth');
    return await signInWithCustomToken(...args);
  } catch (error) {
    console.warn('Error using Firebase signInWithCustomToken:', error);
    return { user: { uid: 'mock-user' } };
  }
};

export const signInAnonymously = async (...args) => {
  if (!cachedResult) {
    cachedResult = await initializeFirebase();
  }
  if (!cachedResult.initialized || !cachedResult.auth) {
    return { user: { uid: 'anonymous-user' } };
  }
  try {
    const { signInAnonymously } = await import('firebase/auth');
    return await signInAnonymously(...args);
  } catch (error) {
    console.warn('Error using Firebase signInAnonymously:', error);
    return { user: { uid: 'anonymous-user' } };
  }
};

// Инициализируем Firebase и экспортируем основные объекты
export { app, auth, database };

// Запускаем инициализацию сразу для ускорения
initializeFirebase().then(({ app: a, auth: au, database: db, initialized: init }) => {
  // Обновляем экспортируемые объекты после инициализации
  if (init) {
    app = a;
    auth = au;
    database = db;
  }
});