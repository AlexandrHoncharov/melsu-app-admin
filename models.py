import json
import random
import string
from datetime import datetime

from werkzeug.security import generate_password_hash, check_password_hash

from db import db


# === User Model === #

class User(db.Model):
    """User model"""
    __tablename__ = 'user'
    __table_args__ = {'mysql_charset': 'utf8mb4', 'mysql_collate': 'utf8mb4_unicode_ci'}

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80, collation='utf8mb4_unicode_ci'), unique=True, nullable=False)
    password = db.Column(db.String(200, collation='utf8mb4_unicode_ci'), nullable=False)
    password_plain = db.Column(db.String(200, collation='utf8mb4_unicode_ci'), nullable=True)
    is_admin = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    email = db.Column(db.String(120, collation='utf8mb4_unicode_ci'), unique=True, nullable=True)

    role = db.Column(db.String(20), default=None)
    verification_status = db.Column(db.String(20), default=None)
    student_card_image = db.Column(db.String(255), default=None)
    full_name = db.Column(db.String(255), default=None)
    group = db.Column(db.String(50), default=None)
    faculty = db.Column(db.String(255), default=None)

    speciality_id = db.Column(db.Integer, default=None)
    speciality_code = db.Column(db.String(20), default=None)
    speciality_name = db.Column(db.String(255), default=None)
    study_form = db.Column(db.String(20), default=None)
    study_form_name = db.Column(db.String(50), default=None)

    def __init__(self, username, password, email=None, is_admin=False):
        """Initializes a new User."""
        self.username = username
        self.password_plain = password
        self.password = generate_password_hash(password)
        self.email = email
        self.is_admin = is_admin

    def check_password(self, password):
        """Checks if the provided password matches the stored hash."""
        return check_password_hash(self.password, password)

    def __repr__(self):
        return f'<User {self.username}>'


# === Teacher Model === #

class Teacher(db.Model):
    """Teacher model from external HR data"""
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
    def generate_credentials(name=None):
        """Generates username and password for a teacher."""
        password = ''.join(random.choices(string.ascii_letters + string.digits, k=8))

        if not name or not name.strip():
            login = ''.join(random.choices(string.ascii_lowercase, k=6))
            return login, password

        try:
            try:
                from transliterate import translit
                latin_name = translit(name, 'ru', reversed=True)
            except ImportError:
                latin_name = name

            latin_name = latin_name.lower()
            import re
            latin_name = re.sub(r'[^\w\s]', '', latin_name)

            name_parts = latin_name.split()
            username_formats = []

            if len(name_parts) >= 1:
                username_formats.append(f"{name_parts[0]}")
            if len(name_parts) >= 2:
                username_formats.append(f"{name_parts[0]}.{name_parts[1]}")
            if len(name_parts) >= 2 and len(name_parts[1]) > 0:
                username_formats.append(f"{name_parts[1][0]}{name_parts[0]}")
            if len(name_parts) >= 2 and len(name_parts[1]) > 0:
                username_formats.append(f"{name_parts[0]}{name_parts[1][0]}")
            if len(name_parts) >= 2:
                username_formats.append(f"{name_parts[1]}.{name_parts[0]}")

            for base_username in username_formats:
                username = base_username
                suffix = 1
                while User.query.filter_by(username=username).first() is not None:
                    username = f"{base_username}{suffix}"
                    suffix += 1
                    if suffix > 100:
                        username = 'teacher_' + ''.join(random.choices(string.ascii_lowercase, k=6))
                        break

                if User.query.filter_by(username=username).first() is None:
                    return username, password

            username = 'teacher_' + ''.join(random.choices(string.ascii_lowercase, k=6))
            return username, password

        except Exception as e:
            print(f"Error generating credentials: {str(e)}")
            username = 'teacher_' + ''.join(random.choices(string.ascii_lowercase, k=6))
            return username, password


# === Schedule Models === #

class Schedule(db.Model):
    """Schedule entry model"""
    __tablename__ = 'schedule'
    __table_args__ = {'mysql_charset': 'utf8mb4', 'mysql_collate': 'utf8mb4_unicode_ci',
                      'mysql_engine': 'InnoDB'}

    id = db.Column(db.Integer, primary_key=True)
    semester = db.Column(db.Integer, nullable=False, index=True)
    week_number = db.Column(db.Integer, nullable=False)

    group_name = db.Column(db.String(20, collation='utf8mb4_unicode_ci'), nullable=False, index=True)
    course = db.Column(db.Integer, nullable=False)
    faculty = db.Column(db.String(100, collation='utf8mb4_unicode_ci'))

    subject = db.Column(db.String(256, collation='utf8mb4_unicode_ci'), nullable=False, index=True)
    lesson_type = db.Column(db.String(20, collation='utf8mb4_unicode_ci'))
    subgroup = db.Column(db.Integer, default=0, index=True)

    date = db.Column(db.Date, nullable=False, index=True)
    time_start = db.Column(db.String(5, collation='utf8mb4_unicode_ci'), nullable=False)
    time_end = db.Column(db.String(5, collation='utf8mb4_unicode_ci'), nullable=False)
    weekday = db.Column(db.Integer, nullable=False, index=True)

    teacher_name = db.Column(db.String(100, collation='utf8mb4_unicode_ci'), default='', index=True)
    auditory = db.Column(db.String(256, collation='utf8mb4_unicode_ci'), default='')

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<Schedule {self.group_name} {self.subject} {self.date}>'


class ScheduleTeacher(db.Model):
    """Model for schedule teachers, potentially mapped to a User"""
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


# === Verification Log Model === #

class VerificationLog(db.Model):
    """Log for student verification actions"""
    __tablename__ = 'verification_log'
    __table_args__ = {'mysql_charset': 'utf8mb4', 'mysql_collate': 'utf8mb4_unicode_ci'}

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    admin_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

    student = db.relationship('User', foreign_keys=[student_id], backref='verification_logs')
    admin = db.relationship('User', foreign_keys=[admin_id], backref='admin_verifications')

    action = db.Column(db.String(20, collation='utf8mb4_unicode_ci'), nullable=False)
    status_before = db.Column(db.String(20, collation='utf8mb4_unicode_ci'))
    status_after = db.Column(db.String(20, collation='utf8mb4_unicode_ci'), nullable=False)
    comment = db.Column(db.Text(collation='utf8mb4_unicode_ci'))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<VerificationLog {self.student_id} {self.action} {self.created_at}>'


# === Device Token Model === #

class DeviceToken(db.Model):
    """Model for storing user device tokens"""
    __tablename__ = 'device_token'
    __table_args__ = {'mysql_charset': 'utf8mb4', 'mysql_collate': 'utf8mb4_unicode_ci'}

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    token = db.Column(db.String(255), nullable=False, unique=True)
    device_name = db.Column(db.String(100))
    platform = db.Column(db.String(20))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    token_type = db.Column(db.String(20), nullable=True)
    last_used_at = db.Column(db.DateTime)

    user = db.relationship('User', backref=db.backref('device_tokens', lazy=True)) # Added relationship

    def __repr__(self):
        return f'<DeviceToken {self.token[:10]}...>'


# === Ticket Models === #

class Ticket(db.Model):
    """Model for support tickets"""
    __tablename__ = 'ticket'
    __table_args__ = {'mysql_charset': 'utf8mb4', 'mysql_collate': 'utf8mb4_unicode_ci'}

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User', backref=db.backref('tickets', lazy=True))

    title = db.Column(db.String(255, collation='utf8mb4_unicode_ci'), nullable=False)
    category = db.Column(db.String(50, collation='utf8mb4_unicode_ci'),nullable=False)
    priority = db.Column(db.String(20, collation='utf8mb4_unicode_ci'), default='medium')
    status = db.Column(db.String(20, collation='utf8mb4_unicode_ci'),default='new')

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    related_type = db.Column(db.String(50, collation='utf8mb4_unicode_ci'), nullable=True)
    related_id = db.Column(db.Integer, nullable=True)

    has_user_unread = db.Column(db.Boolean, default=False)
    has_admin_unread = db.Column(db.Boolean, default=True)

    def __repr__(self):
        return f'<Ticket {self.id} {self.title}>'

    def to_dict(self):
        """Converts ticket to dictionary for API"""
        return {
            'id': self.id,
            'title': self.title,
            'category': self.category,
            'priority': self.priority,
            'status': self.status,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'has_unread': self.has_user_unread,
            'messages_count': len(self.messages),
            'last_message': self.messages[-1].to_dict() if self.messages else None
        }


class TicketMessage(db.Model):
    """Model for messages within a ticket"""
    __tablename__ = 'ticket_message'
    __table_args__ = {'mysql_charset': 'utf8mb4', 'mysql_collate': 'utf8mb4_unicode_ci'}

    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.Integer, db.ForeignKey('ticket.id'), nullable=False)
    ticket = db.relationship('Ticket', backref=db.backref('messages', lazy=True, order_by='TicketMessage.created_at'))

    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User')
    is_from_admin = db.Column(db.Boolean, default=False)

    text = db.Column(db.Text(collation='utf8mb4_unicode_ci'), nullable=False)
    attachment = db.Column(db.String(255, collation='utf8mb4_unicode_ci'), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    is_read = db.Column(db.Boolean, default=False)

    def __repr__(self):
        return f'<TicketMessage {self.id} ticket:{self.ticket_id}>'

    def to_dict(self):
        """Converts message to dictionary for API"""
        return {
            'id': self.id,
            'text': self.text,
            'is_from_admin': self.is_from_admin,
            'created_at': self.created_at.isoformat(),
            'is_read': self.is_read,
            'attachment': self.attachment,
            'user': {
                'id': self.user.id,
                'name': self.user.full_name or self.user.username
            }
        }


class TicketAttachment(db.Model):
    """Model for storing information about ticket attachments"""
    __tablename__ = 'ticket_attachment'
    __table_args__ = {'mysql_charset': 'utf8mb4', 'mysql_collate': 'utf8mb4_unicode_ci'}

    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey('ticket_message.id'), nullable=False)
    message = db.relationship('TicketMessage', backref=db.backref('attachments', lazy=True))

    filename = db.Column(db.String(255, collation='utf8mb4_unicode_ci'), nullable=False)
    original_filename = db.Column(db.String(255, collation='utf8mb4_unicode_ci'), nullable=False)
    file_type = db.Column(db.String(50, collation='utf8mb4_unicode_ci'), nullable=False)
    file_size = db.Column(db.Integer, nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<TicketAttachment {self.id} {self.filename}>'


# === Notification Model === #

class Notification(db.Model):
    """Model for storing sent notifications"""
    __tablename__ = 'notification'
    __table_args__ = {'mysql_charset': 'utf8mb4', 'mysql_collate': 'utf8mb4_unicode_ci'}

    id = db.Column(db.Integer, primary_key=True)

    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, index=True)
    user = db.relationship('User', foreign_keys=[user_id],
                           backref=db.backref('notifications', lazy=True, order_by='Notification.created_at.desc()'))

    sender_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    sender = db.relationship('User', foreign_keys=[sender_id], backref=db.backref('sent_notifications', lazy=True))

    title = db.Column(db.String(255, collation='utf8mb4_unicode_ci'), nullable=False)
    body = db.Column(db.Text(collation='utf8mb4_unicode_ci'), nullable=False)
    notification_type = db.Column(db.String(50, collation='utf8mb4_unicode_ci'), nullable=False,index=True)

    is_read = db.Column(db.Boolean, default=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    read_at = db.Column(db.DateTime, nullable=True)

    data = db.Column(db.Text(collation='utf8mb4_unicode_ci'), nullable=True)

    related_type = db.Column(db.String(50, collation='utf8mb4_unicode_ci'), nullable=True)
    related_id = db.Column(db.Integer, nullable=True)

    def __repr__(self):
        return f'<Notification {self.id} to:{self.user_id} type:{self.notification_type}>'

    def to_dict(self):
        """Converts notification to dictionary for API"""
        data_dict = {}
        if self.data:
            try:
                data_dict = json.loads(self.data)
            except json.JSONDecodeError:
                # Handle invalid JSON data gracefully
                pass

        return {
            'id': self.id,
            'title': self.title,
            'body': self.body,
            'type': self.notification_type,
            'is_read': self.is_read,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'read_at': self.read_at.isoformat() if self.read_at else None,
            'data': data_dict,
            'related_type': self.related_type,
            'related_id': self.related_id,
            'sender': {
                'id': self.sender.id,
                'name': self.sender.full_name or self.sender.username
            } if self.sender else None
        }

    def mark_as_read(self):
        """Marks the notification as read"""
        if not self.is_read:
            self.is_read = True
            self.read_at = datetime.utcnow()
            return True
        return False

    @classmethod
    def create_notification(cls, user_id, title, body, notification_type, sender_id=None, data=None, related_type=None,
                            related_id=None):
        """Creates a new notification instance"""
        notification = cls(
            user_id=user_id,
            sender_id=sender_id,
            title=title,
            body=body,
            notification_type=notification_type,
            related_type=related_type,
            related_id=related_id
        )
        if data:
            notification.data = json.dumps(data)

        return notification