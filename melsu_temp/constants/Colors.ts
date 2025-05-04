const tintColorLight = '#770002';
const tintColorDark = '#ff4d4f';

// Определение дополнительных цветов, которые используются в нашем приложении
export const AppColors = {
    primary: '#770002',
    primaryDark: '#5a0001',
    primaryLight: '#9a1f21',
    background: '#f7f7f7',
    white: '#FFFFFF',
    black: '#000000',
    text: '#333333',
    gray: '#888888',
    lightGray: '#EEEEEE',
    error: '#B00020',
    success: '#4CAF50',
    warning: '#FFC107',
    info: '#2196F3',
    border: '#DDDDDD',
    placeholder: '#AAAAAA',
    unverified: '#FFC107', // Желтый - не верифицирован
    pending: '#2196F3',    // Синий - на проверке
    verified: '#4CAF50'    // Зеленый - верифицирован
};

export default {
  light: {
    text: '#000',
    background: '#fff',
    tint: tintColorLight,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorLight,
      // Добавляем наши цвета
      ...AppColors
  },
  dark: {
    text: '#fff',
    background: '#000',
    tint: tintColorDark,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorDark,
      // Добавляем наши цвета (для темной темы можно было бы применить другие оттенки)
      ...AppColors
  },
};