#!/bin/bash

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # Сброс цвета

# Функция для вывода сообщений с временной меткой
log() {
  echo -e "${GREEN}[$(date +"%T")]${NC} $1"
}

# Функция для вывода ошибок
error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Проверяем наличие eas
if ! command -v eas &> /dev/null
then
    error "eas не найден. Устанавливаем..."
    npm install -g eas-cli
    if [ $? -ne 0 ]; then
        error "Не удалось установить eas-cli. Выход."
        exit 1
    fi
fi

# Проверяем логин в EAS
log "Проверяем авторизацию в EAS..."
eas whoami
if [ $? -ne 0 ]; then
    log "Требуется авторизация в EAS"
    eas login
    if [ $? -ne 0 ]; then
        error "Не удалось авторизоваться в EAS. Выход."
        exit 1
    fi
fi

# Спрашиваем, какую версию сборки нужно создать
echo "Выберите тип сборки:"
echo "1) Разработка (development)"
echo "2) Предпросмотр (preview)"
echo "3) Релиз (production)"
read -p "Введите номер (1-3): " BUILD_TYPE

case $BUILD_TYPE in
  1)
    PROFILE="development"
    ;;
  2)
    PROFILE="preview"
    ;;
  3)
    PROFILE="production"
    ;;
  *)
    error "Неверный выбор. Выход."
    exit 1
    ;;
esac

# Запускаем сборку
log "Запуск сборки Android APK с профилем: $PROFILE"
eas build --platform android --profile $PROFILE --non-interactive

if [ $? -eq 0 ]; then
  log "Сборка APK успешно запущена! Посмотреть статус можно на https://expo.dev"
else
  error "Произошла ошибка при сборке APK."
fi