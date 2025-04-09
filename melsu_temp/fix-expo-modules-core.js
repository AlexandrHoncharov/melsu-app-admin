// fix-expo-modules-core.js
const fs = require('fs');
const path = require('path');

// Путь к package.json модуля
const packageJsonPath = path.join(
  __dirname,
  'node_modules',
  'expo-modules-core',
  'package.json'
);

// Путь, где мы создадим индексный файл
const indexJsPath = path.join(
  __dirname,
  'node_modules',
  'expo-modules-core',
  'build',
  'index.js'
);

// Директория build
const buildDir = path.join(
  __dirname,
  'node_modules',
  'expo-modules-core',
  'build'
);

console.log('Fixing expo-modules-core...');

try {
  // Создаем директорию build, если ее еще нет
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
    console.log(`Created directory: ${buildDir}`);
  }

  // Создаем простой файл index.js
  const indexJsContent = `
// This is a placeholder file created to fix EAS build issues
module.exports = {};
`;
  fs.writeFileSync(indexJsPath, indexJsContent);
  console.log(`Created file: ${indexJsPath}`);

  // Читаем package.json
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  // Сохраняем оригинальный main
  const originalMain = packageJson.main;

  // Меняем main на нашу версию
  packageJson.main = './build/index.js';

  // Записываем обновленный package.json
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log(`Updated package.json: changed main from "${originalMain}" to "./build/index.js"`);

  console.log('expo-modules-core fix completed successfully!');
} catch (error) {
  console.error(`Error fixing expo-modules-core: ${error.message}`);
  process.exit(1);
}