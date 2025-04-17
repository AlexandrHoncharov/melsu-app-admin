#!/usr/bin/env python
# -*- coding: utf-8 -*-
# migrate_add_email.py - Миграция для добавления поля email в таблицу user

import sys
import os
import argparse
import logging
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.exc import SQLAlchemyError

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("migration")


def get_db_url(db_config=None):
    """
    Получает URL подключения к базе данных из конфигурации или переменных окружения
    """
    if db_config:
        # Если предоставлена конфигурация, используем ее
        return db_config.get('SQLALCHEMY_DATABASE_URI')

    # В противном случае, пробуем получить из переменных окружения
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        # Пытаемся сконструировать URL из отдельных переменных
        db_user = os.environ.get('DB_USER', 'root')
        db_password = os.environ.get('DB_PASSWORD', 'your_new_password')
        db_host = os.environ.get('DB_HOST', 'localhost')
        db_port = os.environ.get('DB_PORT', '3306')
        db_name = os.environ.get('DB_NAME', 'university')

        db_url = f"mysql+pymysql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"

    return db_url


def run_migration(db_url=None, skip_confirmation=False):
    """
    Выполняет миграцию для добавления поля email в таблицу user
    """
    try:
        # Получаем URL подключения к БД
        if not db_url:
            # Пытаемся импортировать конфигурацию из проекта
            try:
                import config
                db_url = get_db_url(config)
            except ImportError:
                db_url = get_db_url()

        logger.info(f"Попытка подключения к базе данных")

        # Создаем подключение к базе данных
        engine = create_engine(db_url)
        inspector = inspect(engine)

        # Проверяем существование таблицы user
        if not inspector.has_table('user'):
            logger.error("Таблица 'user' не найдена в базе данных")
            return False

        # Получаем список колонок таблицы user
        columns = inspector.get_columns('user')
        column_names = [column['name'] for column in columns]

        # Проверяем, есть ли уже колонка email
        if 'email' in column_names:
            logger.info("Колонка 'email' уже существует в таблице 'user'")
            return True

        # Запрашиваем подтверждение перед изменением БД, если нужно
        if not skip_confirmation:
            confirmation = input("Вы собираетесь добавить колонку 'email' в таблицу 'user'. Продолжить? (y/n): ")
            if confirmation.lower() not in ('y', 'yes'):
                logger.info("Миграция отменена пользователем")
                return False

        # Добавляем колонку email
        with engine.connect() as connection:
            logger.info("Добавление колонки 'email' в таблицу 'user'...")
            connection.execute(text("ALTER TABLE user ADD COLUMN email VARCHAR(120) DEFAULT NULL"))

            # Создаем уникальный индекс для email
            logger.info("Создание уникального индекса для колонки 'email'...")
            try:
                connection.execute(text("CREATE UNIQUE INDEX idx_user_email ON user(email)"))
            except SQLAlchemyError as e:
                # Если индекс не удалось создать, выводим предупреждение, но продолжаем
                logger.warning(f"Не удалось создать уникальный индекс: {str(e)}")

            # Фиксируем транзакцию
            connection.commit()

        logger.info("Миграция успешно выполнена: добавлена колонка 'email' в таблицу 'user'")
        return True

    except SQLAlchemyError as e:
        logger.error(f"Ошибка SQLAlchemy при выполнении миграции: {str(e)}")
        return False
    except Exception as e:
        logger.error(f"Неожиданная ошибка при выполнении миграции: {str(e)}")
        return False


def main():
    parser = argparse.ArgumentParser(description='Миграция для добавления поля email в таблицу user')
    parser.add_argument('--db-url', help='URL подключения к базе данных')
    parser.add_argument('--yes', '-y', action='store_true', help='Пропустить подтверждение')
    args = parser.parse_args()

    success = run_migration(db_url=args.db_url, skip_confirmation=args.yes)
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()