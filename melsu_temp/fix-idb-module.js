// fix-idb-module.js
const fs = require('fs');
const path = require('path');

// Путь к package.json модуля idb
const packageJsonPath = path.join(
  __dirname,
  'node_modules',
  'idb',
  'package.json'
);

// Путь, где мы создадим отсутствующий файл
const indexJsPath = path.join(
  __dirname,
  'node_modules',
  'idb',
  'build',
  'index.cjs'
);

// Директория build
const buildDir = path.join(
  __dirname,
  'node_modules',
  'idb',
  'build'
);

console.log('Fixing idb module...');

try {
  // Проверяем существование package.json
  if (!fs.existsSync(packageJsonPath)) {
    console.log('idb package.json not found, skipping fix');
    process.exit(0);
  }

  // Создаем директорию build, если ее еще нет
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
    console.log(`Created directory: ${buildDir}`);
  }

  // Создаем простой файл index.cjs
  const indexJsContent = `
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
`;

  fs.writeFileSync(indexJsPath, indexJsContent);
  console.log(`Created file: ${indexJsPath}`);

  console.log('idb module fix completed successfully!');
} catch (error) {
  console.error(`Error fixing idb module: ${error.message}`);
  process.exit(1);
}