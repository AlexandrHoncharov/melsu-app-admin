# run.py
import os
from datetime import datetime
from app import create_app, db
from app.models import User
from flask_migrate import Migrate

app = create_app()
migrate = Migrate(app, db)


# Добавляем в контекст шаблона текущую дату
@app.context_processor
def inject_now():
    return {'now': datetime.utcnow()}


@app.cli.command("init-db")
def init_db():
    """Инициализация базы данных"""
    db.create_all()
    print("База данных создана!")


@app.cli.command("create-admin")
def create_admin():
    """Создание пользователя с правами администратора"""
    from app import bcrypt

    # Проверяем, существует ли уже пользователь с ролью admin
    admin = User.query.filter_by(role='admin').first()
    if admin:
        print(f"Администратор уже существует: {admin.username} ({admin.email})")
        return

    username = input("Введите имя пользователя: ")
    email = input("Введите email: ")
    password = input("Введите пароль: ")

    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')

    admin = User(
        username=username,
        email=email,
        password=hashed_password,
        role='admin'
    )

    db.session.add(admin)
    db.session.commit()

    print(f"Администратор {username} успешно создан!")


@app.cli.command("create-test-data")
def create_test_data():
    """Создание тестовых данных для разработки"""
    # Здесь можно добавить код для создания тестовых данных
    pass


if __name__ == '__main__':
    app.run(debug=True)