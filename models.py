from db import db
from datetime import datetime
import random
import string
from werkzeug.security import generate_password_hash, check_password_hash


class User(db.Model):
    __tablename__ = 'user'
    __table_args__ = {'mysql_charset': 'utf8mb4', 'mysql_collate': 'utf8mb4_unicode_ci'}

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80, collation='utf8mb4_unicode_ci'), unique=True, nullable=False)
    password = db.Column(db.String(200, collation='utf8mb4_unicode_ci'), nullable=False)
    password_plain = db.Column(db.String(200, collation='utf8mb4_unicode_ci'), nullable=True)  # Для просмотра пароля
    is_admin = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Дополнительные поля для мобильного приложения
    role = db.Column(db.String(20), default=None)  # student / teacher
    verification_status = db.Column(db.String(20), default=None)  # unverified / pending / verified / rejected
    student_card_image = db.Column(db.String(255), default=None)
    full_name = db.Column(db.String(255), default=None)
    group = db.Column(db.String(50), default=None)
    faculty = db.Column(db.String(255), default=None)

    speciality_id = db.Column(db.Integer, default=None)
    speciality_code = db.Column(db.String(20), default=None)
    speciality_name = db.Column(db.String(255), default=None)
    study_form = db.Column(db.String(20), default=None)  # 'full-time', 'full-part', or 'correspondence'
    study_form_name = db.Column(db.String(50), default=None)  # 'Очная', 'Очно-заочная', or 'Заочная'

    def __init__(self, username, password, is_admin=False):
        self.username = username
        self.password_plain = password  # Сохраняем пароль в открытом виде
        self.password = generate_password_hash(password)
        self.is_admin = is_admin

    def check_password(self, password):
        return check_password_hash(self.password, password)

    def __repr__(self):
        return f'<User {self.username}>'


class Teacher(db.Model):
    __tablename__ = 'teacher'
    __table_args__ = {'mysql_charset': 'utf8mb4', 'mysql_collate': 'utf8mb4_unicode_ci'}

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100, collation='utf8mb4_unicode_ci'), nullable=False)
    position = db.Column(db.String(100, collation='utf8mb4_unicode_ci'))
    department = db.Column(db.String(200, collation='utf8mb4_unicode_ci'))
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


class Schedule(db.Model):
    __tablename__ = 'schedule'
    __table_args__ = {'mysql_charset': 'utf8mb4', 'mysql_collate': 'utf8mb4_unicode_ci',
                      'mysql_engine': 'InnoDB'}

    id = db.Column(db.Integer, primary_key=True)
    semester = db.Column(db.Integer, nullable=False, index=True)
    week_number = db.Column(db.Integer, nullable=False)
    # Информация о группе
    group_name = db.Column(db.String(20, collation='utf8mb4_unicode_ci'), nullable=False, index=True)
    course = db.Column(db.Integer, nullable=False)
    faculty = db.Column(db.String(100, collation='utf8mb4_unicode_ci'))

    # Информация о занятии
    subject = db.Column(db.String(256, collation='utf8mb4_unicode_ci'), nullable=False, index=True)
    lesson_type = db.Column(db.String(20, collation='utf8mb4_unicode_ci'))  # тип занятия (лекция, практика и т.д.)
    subgroup = db.Column(db.Integer, default=0, index=True)

    # Время занятия
    date = db.Column(db.Date, nullable=False, index=True)
    time_start = db.Column(db.String(5, collation='utf8mb4_unicode_ci'), nullable=False)
    time_end = db.Column(db.String(5, collation='utf8mb4_unicode_ci'), nullable=False)
    weekday = db.Column(db.Integer, nullable=False, index=True)

    # Место проведения и преподаватель
    teacher_name = db.Column(db.String(100, collation='utf8mb4_unicode_ci'), default='', index=True)
    auditory = db.Column(db.String(256, collation='utf8mb4_unicode_ci'), default='')

    # Метаданные
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<Schedule {self.group_name} {self.subject} {self.date}>'


class ScheduleTeacher(db.Model):
    __tablename__ = 'schedule_teacher'
    __table_args__ = {'mysql_charset': 'utf8mb4', 'mysql_collate': 'utf8mb4_unicode_ci'}

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100, collation='utf8mb4_unicode_ci'), nullable=False, unique=True, index=True)
    mapped_teacher_id = db.Column(db.Integer, db.ForeignKey('teacher.id'), nullable=True)
    mapped_teacher = db.relationship('Teacher', backref='schedule_teachers')
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<ScheduleTeacher {self.name}>'


class VerificationLog(db.Model):
    """Log for student verification actions"""
    __tablename__ = 'verification_log'
    __table_args__ = {'mysql_charset': 'utf8mb4', 'mysql_collate': 'utf8mb4_unicode_ci'}

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    admin_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

    # Explicit specification of foreign keys for each relationship
    student = db.relationship('User', foreign_keys=[student_id], backref='verification_logs')
    admin = db.relationship('User', foreign_keys=[admin_id], backref='admin_verifications')

    action = db.Column(db.String(20, collation='utf8mb4_unicode_ci'), nullable=False)  # upload, approve, reject, cancel
    status_before = db.Column(db.String(20, collation='utf8mb4_unicode_ci'))  # Previous status
    status_after = db.Column(db.String(20, collation='utf8mb4_unicode_ci'), nullable=False)  # New status
    comment = db.Column(db.Text(collation='utf8mb4_unicode_ci'))  # Optional comment

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<VerificationLog {self.student_id} {self.action} {self.created_at}>'


# Добавьте этот класс в models.py

class DeviceToken(db.Model):
    """Токены устройств для push-уведомлений"""
    __tablename__ = 'device_token'
    __table_args__ = {'mysql_charset': 'utf8mb4', 'mysql_collate': 'utf8mb4_unicode_ci'}

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User', backref='device_tokens')

    token = db.Column(db.String(255, collation='utf8mb4_unicode_ci'), nullable=False)
    device_name = db.Column(db.String(100, collation='utf8mb4_unicode_ci'))
    platform = db.Column(db.String(20, collation='utf8mb4_unicode_ci'))  # ios / android

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<DeviceToken {self.token[:10]}... ({self.platform})>'