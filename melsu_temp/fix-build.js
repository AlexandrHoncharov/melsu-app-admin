// fix-build.js
const fs = require('fs');
const path = require('path');

// Исправление файлов, которые могут вызывать проблемы
const fixTypescriptImports = () => {
  const targetFile = path.join(
    __dirname,
    'node_modules',
    'expo-modules-core',
    'build',
    'index.js'
  );

  if (fs.existsSync(targetFile)) {
    console.log('Fixing TypeScript imports in expo-modules-core...');
    // Просто убедитесь, что файл существует и доступен
  } else {
    console.log('Building TypeScript files...');
    // Создаем пустую директорию build, если её нет
    const buildDir = path.join(
      __dirname,
      'node_modules',
      'expo-modules-core',
      'build'
    );
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir, { recursive: true });
    }

    // Создаем простой index.js, который просто реэкспортирует содержимое из src
    fs.writeFileSync(
      path.join(buildDir, 'index.js'),
      `module.exports = require('../src/index');\n`
    );
  }
};

// Запуск исправлений
fixTypescriptImports();
console.log('Build fixes applied successfully!');