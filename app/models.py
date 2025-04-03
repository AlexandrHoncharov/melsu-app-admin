# app/models.py
from datetime import datetime
import base64
from flask_login import UserMixin
from app import db, login_manager


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


class User(db.Model, UserMixin):
    """Модель пользователя"""
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(20), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(60), nullable=False)
    first_name = db.Column(db.String(30), nullable=True)
    last_name = db.Column(db.String(30), nullable=True)
    role = db.Column(db.String(20), nullable=False, default='user')
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    last_login = db.Column(db.DateTime, nullable=True)

    def __repr__(self):
        return f"User('{self.username}', '{self.email}', '{self.role}')"

    @property
    def full_name(self):
        """Возвращает полное имя пользователя"""
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.username

    def has_role(self, role):
        """Проверяет роль пользователя"""
        return self.role == role


class Department(db.Model):
    """Модель кафедры"""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    description = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    # Отношения
    teachers = db.relationship('Teacher', backref='department', lazy=True)

    def __repr__(self):
        return f"Department('{self.name}')"


class ScheduleTeacher(db.Model):
    """Модель преподавателя из расписания"""
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(20), nullable=False, unique=True)
    full_name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Отношения
    teachers = db.relationship('Teacher', backref='schedule_teacher', lazy=True)

    def __repr__(self):
        return f"ScheduleTeacher('{self.code}', '{self.full_name}')"


class Teacher(db.Model):
    """Модель преподавателя"""
    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(100), nullable=False)
    position = db.Column(db.String(50), nullable=True)
    department_id = db.Column(db.Integer, db.ForeignKey('department.id'), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    schedule_teacher_id = db.Column(db.Integer, db.ForeignKey('schedule_teacher.id'), nullable=True)

    # Отношения
    credentials = db.relationship('TeacherCredential', backref='teacher', lazy=True, cascade="all, delete-orphan")
    user = db.relationship('User', backref='teacher_profile', lazy=True)

    def __repr__(self):
        return f"Teacher('{self.full_name}', '{self.position}')"

    def generate_credentials(self):
        """Генерирует учетные данные для преподавателя"""
        from app import bcrypt

        # Транслитерируем ФИО и создаем логин на латинице
        transliterated_name = self.transliterate(self.full_name).lower()
        parts = transliterated_name.split()

        if len(parts) >= 2:
            username = f"{parts[0]}_{parts[1][0]}"
            if len(parts) > 2:
                username += parts[2][0]
        else:
            username = f"teacher_{self.id}"

        # Удаляем специальные символы из имени пользователя
        import re
        username = re.sub(r'[^a-z0-9_]', '', username)

        # Генерируем случайный пароль (уже на латинице)
        import secrets
        password = secrets.token_urlsafe(8)

        # Проверяем, существует ли уже пользователь с таким именем
        counter = 0
        temp_username = username
        while User.query.filter_by(username=temp_username).first():
            counter += 1
            temp_username = f"{username}{counter}"

        username = temp_username

        # Создаем пользователя для преподавателя
        user = User(
            username=username,
            email=f"{username}@melgu.ru",
            password=bcrypt.generate_password_hash(password).decode('utf-8'),
            first_name=self.transliterate(self.full_name.split()[0]) if ' ' in self.full_name else self.transliterate(
                self.full_name),
            last_name=self.transliterate(' '.join(self.full_name.split()[1:])) if ' ' in self.full_name else '',
            role='teacher'
        )

        db.session.add(user)
        db.session.commit()

        # Связываем пользователя с преподавателем
        self.user_id = user.id

        # Удаляем старые учетные данные, если они есть
        TeacherCredential.query.filter_by(teacher_id=self.id).delete()

        # Создаем запись с учетными данными
        credential = TeacherCredential(
            teacher_id=self.id,
            username=username,
            password=base64.b64encode(password.encode()).decode()
        )

        db.session.add(credential)
        db.session.commit()

        return {
            'username': username,
            'password': password,
            'email': f"{username}@melgu.ru"
        }

    def get_credentials(self):
        """Возвращает последние учетные данные преподавателя"""
        credential = TeacherCredential.query.filter_by(teacher_id=self.id).order_by(
            TeacherCredential.created_at.desc()).first()

        if credential:
            try:
                decrypted_password = base64.b64decode(credential.password.encode()).decode()

                return {
                    'username': credential.username,
                    'password': decrypted_password,
                    'email': f"{credential.username}@melgu.ru"
                }
            except Exception:
                # В случае ошибки дешифровки возвращаем только логин
                return {
                    'username': credential.username,
                    'password': '********',
                    'email': f"{credential.username}@melgu.ru"
                }

        return None

    # Добавьте эту функцию в класс Teacher в файле app/models.py

    def transliterate(self, text):
        """Транслитерация русского текста в латиницу"""
        char_map = {
            'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
            'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
            'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
            'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
            'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
            'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'E',
            'Ж': 'ZH', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
            'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
            'Ф': 'F', 'Х': 'KH', 'Ц': 'TS', 'Ч': 'CH', 'Ш': 'SH', 'Щ': 'SCH',
            'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'YU', 'Я': 'YA'
        }

        result = ""
        for char in text:
            result += char_map.get(char, char)

        return result


class TeacherCredential(db.Model):
    """Модель для хранения учетных данных преподавателей"""
    id = db.Column(db.Integer, primary_key=True)
    teacher_id = db.Column(db.Integer, db.ForeignKey('teacher.id'), nullable=False)
    username = db.Column(db.String(50), nullable=False)
    password = db.Column(db.String(100), nullable=False)  # Храним в зашифрованном виде для возможности показа
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self):
        return f"TeacherCredential(teacher_id={self.teacher_id})"