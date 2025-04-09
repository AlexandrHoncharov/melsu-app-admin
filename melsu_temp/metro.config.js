// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Указываем дополнительные расширения для обработки
config.resolver.sourceExts = ['jsx', 'js', 'ts', 'tsx', 'cjs', 'json'];

// Настраиваем extraNodeModules для замены некоторых модулей
config.resolver.extraNodeModules = {
  // Предоставляем пустую реализацию idb
  'idb': path.resolve(__dirname, 'empty-modules/idb.js')
};
config.resolver.blockList = [
  /node_modules\/.*\/node_modules\/react-native\/.*/,
];
// Создаем директорию для пустых модулей, если её нет
const emptyModulesDir = path.join(__dirname, 'empty-modules');
const fs = require('fs');
if (!fs.existsSync(emptyModulesDir)) {
  fs.mkdirSync(emptyModulesDir, { recursive: true });
  fs.writeFileSync(
    path.join(emptyModulesDir, 'idb.js'),
    `
// Empty implementation of idb
export const openDB = () => Promise.resolve({});
export const deleteDB = () => Promise.resolve(true);
export const unwrap = (obj) => obj;
export const wrap = (obj) => obj;
export default { openDB, deleteDB, unwrap, wrap };
    `
  );
}

// Настраиваем обработку некоторых модулей
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

module.exports = config;