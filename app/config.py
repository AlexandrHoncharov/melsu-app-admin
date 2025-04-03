# app/config.py
import os
import secrets
import base64
from datetime import timedelta
from cryptography.fernet import Fernet


def generate_secret_key(length=32):
    """Генерирует криптографически безопасный случайный ключ"""
    return secrets.token_hex(length)


class Config:
    """Базовая конфигурация приложения"""
    SECRET_KEY = os.environ.get('SECRET_KEY') or generate_secret_key()

    # Ключ для шифрования учетных данных
    CREDENTIAL_KEY = os.environ.get('CREDENTIAL_KEY') or Fernet.generate_key()

    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///melgu.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Настройки сессии
    PERMANENT_SESSION_LIFETIME = timedelta(days=1)

    # Настройки шаблонов
    TEMPLATES_AUTO_RELOAD = True

    # Настройки приложения
    APP_NAME = 'МелГУ - Админ панель'
    APP_COLOR = '#770002'
    APP_FONT = 'Montserrat'

    # Настройки загрузки файлов
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 МБ


class DevelopmentConfig(Config):
    """Конфигурация для разработки"""
    DEBUG = True


class ProductionConfig(Config):
    """Конфигурация для продакшена"""
    DEBUG = False
    # Добавить дополнительные настройки для продакшена
    # например, настройки для SSL, логирование и т.д.


# По умолчанию используем конфигурацию для разработки
config_by_name = {
    'dev': DevelopmentConfig,
    'prod': ProductionConfig
}