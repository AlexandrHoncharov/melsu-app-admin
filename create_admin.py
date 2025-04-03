# create_admin.py
from app import create_app, db, bcrypt
from app.models import User
import sys

app = create_app()


def create_admin(username, email, password):
    with app.app_context():
        # Проверка, существует ли уже пользователь с таким email
        existing_user = User.query.filter_by(email=email).first()
        if existing_user:
            print(f"Пользователь с email {email} уже существует.")
            return

        # Хеширование пароля
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')

        # Создание пользователя
        admin = User(
            username=username,
            email=email,
            password=hashed_password,
            role='admin'
        )

        # Сохранение в базу данных
        db.session.add(admin)
        db.session.commit()

        print(f"Администратор {username} успешно создан!")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Использование: python create_admin.py <username> <email> <password>")
    else:
        username, email, password = sys.argv[1], sys.argv[2], sys.argv[3]
        create_admin(username, email, password)