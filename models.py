from db import db
from datetime import datetime
import random
import string
from werkzeug.security import generate_password_hash, check_password_hash


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    password_plain = db.Column(db.String(200), nullable=True)  # Для просмотра пароля
    is_admin = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __init__(self, username, password, is_admin=True):
        self.username = username
        self.password_plain = password  # Сохраняем пароль в открытом виде
        self.password = generate_password_hash(password)
        self.is_admin = is_admin

    def check_password(self, password):
        return check_password_hash(self.password, password)

    def __repr__(self):
        return f'<User {self.username}>'


class Teacher(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    position = db.Column(db.String(100))
    department = db.Column(db.String(200))
    has_account = db.Column(db.Boolean, default=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    user = db.relationship('User', backref='teacher', uselist=False)

    def __repr__(self):
        return f'<Teacher {self.name}>'

    @staticmethod
    def generate_credentials():
        # Генерация логина (строчные буквы, 6 символов)
        login = ''.join(random.choices(string.ascii_lowercase, k=6))

        # Генерация пароля (буквы + цифры, 8 символов)
        password = ''.join(random.choices(string.ascii_letters + string.digits, k=8))

        return login, password