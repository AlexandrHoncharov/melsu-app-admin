const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Убедимся, что директория web существует
const webDir = path.join(__dirname, '../web');
if (!fs.existsSync(webDir)) {
  fs.mkdirSync(webDir, { recursive: true });
}

// Проверим наличие service-worker.js и offline.html
const swPath = path.join(webDir, 'service-worker.js');
const offlinePath = path.join(webDir, 'offline.html');

if (!fs.existsSync(swPath) || !fs.existsSync(offlinePath)) {
  console.error('Ошибка: Не найдены необходимые файлы для PWA.');
  console.error('Убедитесь, что созданы файлы:');
  console.error('- web/service-worker.js');
  console.error('- web/offline.html');
  process.exit(1);
}

console.log('Начинаем сборку PWA-приложения...');

// Запускаем сборку для веб
exec('expo build:web', (error, stdout, stderr) => {
  if (error) {
    console.error(`Ошибка сборки: ${error.message}`);
    return;
  }
  
  console.log(stdout);
  
  console.log('PWA успешно собрана! Файлы находятся в директории web-build.');
  console.log('Вы можете развернуть эти файлы на любом статическом хостинге.');
});