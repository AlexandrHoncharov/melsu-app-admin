import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';

// Ваша Firebase конфигурация
const firebaseConfig = {
  apiKey: "AIzaSyABbRQxcIx-l10TbnGcSQIHBGU7k9cZ-3o",
  authDomain: "melsuchat.firebaseapp.com",
  projectId: "melsuchat",
  storageBucket: "melsuchat.appspot.com", // Исправьте на appspot вместо firebasestorage
  messagingSenderId: "614010409697",
  appId: "1:614010409697:web:cc0b63b924ebbdf79ddda0",
  measurementId: "G-LZKWGF5SZK",
  databaseURL: "https://melsuchat-default-rtdb.europe-west1.firebasedatabase.app" // Добавьте этот URL
};

// Инициализация Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

export { app, auth, database };