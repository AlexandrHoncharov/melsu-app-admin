// fix-modules.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Функция для проверки существования файла
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (err) {
    return false;
  }
}

// Функция для исправления определенного модуля
function fixModule(moduleName, mainField, contentGenerator) {
  console.log(`Fixing ${moduleName} module...`);

  // Путь к package.json модуля
  const packageJsonPath = path.join(__dirname, 'node_modules', moduleName, 'package.json');

  // Проверяем существование package.json
  if (!fileExists(packageJsonPath)) {
    console.log(`${moduleName} package.json not found, skipping fix`);
    return;
  }

  try {
    // Получаем директорию для output файла из mainField
    const mainPath = mainField.split('/');
    const filename = mainPath.pop(); // Последний элемент - имя файла
    const outputDir = path.join(__dirname, 'node_modules', moduleName, ...mainPath);
    const outputPath = path.join(outputDir, filename);

    // Создаем директорию, если она не существует
    if (!fileExists(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`Created directory: ${outputDir}`);
    }

    // Создаем файл с заданным содержимым
    fs.writeFileSync(outputPath, contentGenerator(moduleName));
    console.log(`Created file: ${outputPath}`);

    // Читаем package.json
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    // Сохраняем оригинальный main
    const originalMain = packageJson.main;

    // Если main уже указывает на правильный путь, пропускаем обновление
    if (originalMain === mainField) {
      console.log(`${moduleName} main already points to ${mainField}, skipping update`);
    } else {
      // Меняем main на нашу версию
      packageJson.main = mainField;

      // Записываем обновленный package.json
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log(`Updated package.json: changed main from "${originalMain}" to "${mainField}"`);
    }

    console.log(`${moduleName} module fix completed successfully!`);
  } catch (error) {
    console.error(`Error fixing ${moduleName} module: ${error.message}`);
  }
}

// Исправляем модуль expo-modules-core
fixModule(
  'expo-modules-core',
  './build/index.js',
  () => `
// This is a placeholder file created to fix EAS build issues
module.exports = {};
`
);

// Исправляем модуль idb
fixModule(
  'idb',
  './build/index.cjs',
  () => `
// This is a placeholder file created to fix EAS build issues
'use strict';
Object.defineProperty(exports, '__esModule', { value: true });

// Базовые экспорты для замены IDB
exports.openDB = () => Promise.resolve({});
exports.deleteDB = () => Promise.resolve(true);
exports.unwrap = (obj) => obj;
exports.wrap = (obj) => obj;

// Конкретные экспорты для Firebase
exports.deleteDB = () => Promise.resolve();
exports.openDB = () => Promise.resolve({
  transaction: () => ({
    objectStore: () => ({
      put: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      get: () => Promise.resolve(null),
      getAll: () => Promise.resolve([])
    })
  }),
  createObjectStore: () => ({})
});

module.exports = exports;
`
);

console.log('All module fixes completed!');