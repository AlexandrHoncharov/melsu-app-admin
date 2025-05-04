// src/firebase.js  (React Native friendly)
import {initializeApp} from 'firebase/app';
import {
    initializeAuth,
    getReactNativePersistence,
} from 'firebase/auth';
import {getDatabase} from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';

// --- конфигурация ---
const firebaseConfig = {
    apiKey: 'AIzaSyABbRQxcIx-l10TbnGcSQIHBGU7k9cZ-3o',
    authDomain: 'melsuchat.firebaseapp.com',
    projectId: 'melsuchat',
    storageBucket: 'melsuchat.appspot.com',
    messagingSenderId: '614010409697',
    appId: '1:614010409697:web:cc0b63b924ebbdf79ddda0',
    measurementId: 'G-LZKWGF5SZK',
    databaseURL:
        'https://melsuchat-default-rtdb.europe-west1.firebasedatabase.app',
};

// --- инициализация ---
export const app = initializeApp(firebaseConfig);

// Auth надо создавать ровно ОДИН раз ➜ оборачиваем в ленивую функцию
let _auth = null;

export function getAuth() {
    if (!_auth) {
        _auth = initializeAuth(app, {
            persistence: getReactNativePersistence(AsyncStorage),
        });
    }
    return _auth;
}

export const database = getDatabase(app);
