from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
import datetime
import os
import uuid
import random
import string
from functools import wraps
from db import db
from models import User, Teacher, Schedule, VerificationLog, DeviceToken
import firebase_admin
from firebase_admin import credentials, auth

app = Flask(__name__)
CORS(app)

# Загрузка конфигурации
app.config.from_object('config')

# Инициализация базы данных
db.init_app(app)

# Папка для хранения загруженных изображений
UPLOAD_FOLDER = 'uploads'
STUDENT_CARDS_FOLDER = os.path.join(UPLOAD_FOLDER, 'student_cards')

# Создаем папки, если их нет
os.makedirs(STUDENT_CARDS_FOLDER, exist_ok=True)


if not firebase_admin._apps:
    cred = credentials.Certificate('firebase.json')
    firebase_admin.initialize_app(cred)

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None

        # Получаем токен из заголовка
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]

        if not token:
            return jsonify({'message': 'Токен не предоставлен'}), 401

        try:
            # Декодируем токен
            payload = jwt.decode(token, app.config.get('SECRET_KEY'), algorithms=['HS256'])
            user_id = payload['sub']
            current_user = User.query.get(user_id)

            if not current_user:
                return jsonify({'message': 'Пользователь не найден'}), 401

        except jwt.ExpiredSignatureError:
            return jsonify({'message': 'Токен истек'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'message': 'Недействительный токен'}), 401

        return f(current_user, *args, **kwargs)

    return decorated

# Helper function to generate username
def generate_username(full_name, group=None):
    """Generate a username based on full name and group"""
    # Remove any non-alphanumeric characters and split the name
    clean_name = ''.join(c for c in full_name if c.isalnum() or c.isspace())
    name_parts = clean_name.split()

    if not name_parts:
        # Fallback if name is empty or has no valid parts
        return ''.join(random.choices(string.ascii_lowercase, k=6))

    # Take first letter of first name and first letter of last name if available
    if len(name_parts) >= 2:
        initials = name_parts[0][0] + name_parts[-1][0]
    else:
        initials = name_parts[0][0]

    # Make it lowercase
    initials = initials.lower()

    # Add group info if available
    suffix = ""
    if group:
        # Clean group and take up to 3 chars
        clean_group = ''.join(c for c in group if c.isalnum())
        suffix = clean_group[:3].lower()

    # Add random digits
    random_digits = ''.join(random.choices(string.digits, k=4))

    # Combine all parts
    username = f"{initials}{suffix}{random_digits}"

    return username


@app.route('/api/auth/firebase-token', methods=['POST'])
@token_required
def get_firebase_token(current_user):
    try:
        # Создаем кастомный токен для Firebase
        firebase_token = auth.create_custom_token(str(current_user.id))

        # Подготавливаем данные пользователя
        user_data = {
            'id': current_user.id,
            'username': current_user.username,
            'fullName': current_user.full_name,
            'role': current_user.role
        }

        if current_user.role == 'student':
            user_data['group'] = current_user.group
            user_data['faculty'] = current_user.faculty
        elif current_user.role == 'teacher':
            teacher = Teacher.query.filter_by(user_id=current_user.id).first()
            if teacher:
                user_data['department'] = teacher.department
                user_data['position'] = teacher.position

        return jsonify({
            'token': firebase_token.decode('utf-8'),
            'userData': user_data
        })
    except Exception as e:
        print(f"Error creating Firebase token: {str(e)}")
        return jsonify({'message': 'Ошибка создания токена'}), 500


# Add these endpoints to your api.py file

@app.route('/api/schedule/groups', methods=['GET'])
@token_required
def get_schedule_groups(current_user):
    """Get unique groups from the schedule"""
    try:
        # Get unique groups directly from schedule table
        groups = db.session.query(db.distinct(Schedule.group_name)) \
            .filter(Schedule.group_name.isnot(None)) \
            .order_by(Schedule.group_name).all()

        # Format response
        groups_list = [{"name": group[0]} for group in groups if group[0]]

        return jsonify(groups_list), 200
    except Exception as e:
        print(f"Error getting groups: {str(e)}")
        return jsonify({"message": f"Error getting groups: {str(e)}"}), 500


@app.route('/api/users', methods=['GET'])
@token_required
def get_users(current_user):
    """Get users filtered by role and optionally by group"""
    role = request.args.get('role')
    group = request.args.get('group')

    query = User.query
    if role:
        query = query.filter_by(role=role)

    # Add filter by group if specified
    if group:
        query = query.filter_by(group=group)

    users = query.all()

    result = []
    for user in users:
        if user.id != current_user.id:  # Exclude current user
            user_data = {
                'id': user.id,
                'username': user.username,
                'fullName': user.full_name,
                'role': user.role
            }

            if user.role == 'student':
                user_data['group'] = user.group
                user_data['faculty'] = user.faculty
            elif user.role == 'teacher':
                teacher = Teacher.query.filter_by(user_id=user.id).first()
                if teacher:
                    user_data['department'] = teacher.department
                    user_data['position'] = teacher.position

            result.append(user_data)

    return jsonify(result)


@app.route('/api/device/unregister', methods=['POST'])
@token_required
def unregister_device(current_user):
    """Отмена регистрации токена устройства при выходе из аккаунта"""

    try:
        data = request.json

        # Проверяем наличие токена в запросе
        if 'token' not in data or not data['token']:
            return jsonify({
                'message': 'Токен устройства не предоставлен',
                'success': False
            }), 400

        # Получаем токен из запроса
        device_token = data['token']

        # Ищем запись с этим токеном для текущего пользователя
        token_record = DeviceToken.query.filter_by(
            user_id=current_user.id,
            token=device_token
        ).first()

        # Если такой токен найден, удаляем его
        if token_record:
            db.session.delete(token_record)
            db.session.commit()

            return jsonify({
                'message': 'Токен устройства успешно удален',
                'success': True
            }), 200
        else:
            # Если токен не найден, сообщаем об этом, но возвращаем успех
            # чтобы клиент мог продолжить процесс выхода
            return jsonify({
                'message': 'Токен устройства не найден для данного пользователя',
                'success': True
            }), 200

    except Exception as e:
        print(f"Error unregistering device token: {str(e)}")

        # Даже при ошибке возвращаем успех, чтобы не блокировать процесс выхода
        return jsonify({
            'message': f'Произошла ошибка, но процесс выхода может быть продолжен',
            'error': str(e),
            'success': True
        }), 200


@app.route('/api/users/<int:user_id>', methods=['GET'])
@token_required
def get_user(current_user, user_id):
    user = User.query.get(user_id)

    if not user:
        return jsonify({'message': 'Пользователь не найден'}), 404

    user_data = {
        'id': user.id,
        'username': user.username,
        'name': user.full_name,
        'role': user.role,
        'group': user.group,
        'faculty': user.faculty
    }

    # Для преподавателей добавляем информацию о кафедре
    if user.role == 'teacher':
        teacher = Teacher.query.filter_by(user_id=user.id).first()
        if teacher:
            user_data['department'] = teacher.department
            user_data['position'] = teacher.position

    return jsonify(user_data)


@app.route('/api/chat/send-notification', methods=['POST'])
@token_required
def send_chat_notification(current_user):
    """Send a push notification about a new chat message"""
    try:
        data = request.json
        required_fields = ['recipient_id', 'chat_id', 'message_preview', 'sender_name']

        # Verify all required fields are present
        for field in required_fields:
            if field not in data:
                return jsonify({'message': f'Field {field} is required'}), 400

        recipient_id = data['recipient_id']
        chat_id = data['chat_id']
        message_preview = data['message_preview']
        sender_name = data['sender_name']

        # Get recipient's device tokens
        device_tokens = DeviceToken.query.filter_by(user_id=recipient_id).all()

        if not device_tokens:
            return jsonify({
                'message': 'No device tokens found for recipient',
                'success': False
            }), 404

        # Send notification to all recipient's devices
        notification_title = f'Новое сообщение от {sender_name}'
        notification_body = message_preview

        results = []
        success_count = 0

        for token_obj in device_tokens:
            result = send_push_message(
                token_obj.token,
                notification_title,
                notification_body,
                {
                    'type': 'chat_message',
                    'chat_id': chat_id,
                    'sender_name': sender_name,
                    'timestamp': datetime.datetime.now().isoformat()
                }
            )

            if result.get("success", False):
                success_count += 1

            results.append({
                "device": token_obj.device_name,
                "platform": token_obj.platform,
                "success": result.get("success", False)
            })

        return jsonify({
            'message': f'Notifications sent to {success_count} of {len(device_tokens)} devices',
            'success': success_count > 0,
            'results': results
        })

    except Exception as e:
        print(f"Error sending chat notification: {str(e)}")
        return jsonify({'message': f'Error: {str(e)}', 'success': False}), 500

# Helper function to check if username exists
def username_exists(username):
    try:
        return db.session.query(User).filter_by(username=username).first() is not None
    except Exception as e:
        print(f"Error checking username: {str(e)}")
        # In case of any error, return False to allow continuing
        # The uniqueness will still be enforced at the database level
        return False


# Функция для создания JWT токена
def create_token(user_id):
    payload = {
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7),
        'iat': datetime.datetime.utcnow(),
        'sub': user_id
    }
    return jwt.encode(
        payload,
        app.config.get('SECRET_KEY'),
        algorithm='HS256'
    )


# Декоратор для проверки токена



# Маршрут для регистрации студента
@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json

    # Проверяем обязательные поля
    required_fields = ['password', 'fullName', 'role']
    for field in required_fields:
        if field not in data:
            return jsonify({'message': f'Поле {field} обязательно'}), 400

    # Генерируем имя пользователя, если оно не предоставлено
    if 'username' not in data or not data['username']:
        username = generate_username(data['fullName'], data.get('group'))

        # Проверяем, что username уникален
        attempt = 0
        base_username = username
        while username_exists(username):
            attempt += 1
            username = f"{base_username}{attempt}"
    else:
        username = data['username']

    # Проверяем, существует ли пользователь с таким именем
    if username_exists(username):
        return jsonify({'message': 'Пользователь с таким логином уже существует'}), 400

    # Создаем нового пользователя
    new_user = User(
        username=username,
        password=data['password'],  # Хэширование произойдет в модели
        is_admin=False
    )

    # Добавляем дополнительные поля
    new_user.role = data.get('role')
    new_user.full_name = data.get('fullName')
    new_user.group = data.get('group')
    new_user.faculty = data.get('faculty')

    # Для студентов устанавливаем статус верификации
    if data.get('role') == 'student':
        new_user.verification_status = 'unverified'
    elif data.get('role') == 'teacher':
        new_user.verification_status = 'verified'  # Преподаватели по умолчанию верифицированы

    db.session.add(new_user)
    db.session.commit()

    # Создаем токен для пользователя
    token = create_token(new_user.id)

    # Возвращаем данные и токен
    return jsonify({
        'message': 'Пользователь успешно создан',
        'token': token,
        'user': {
            'id': new_user.id,
            'username': new_user.username,
            'fullName': new_user.full_name,
            'role': new_user.role,
            'group': new_user.group,
            'faculty': new_user.faculty,
            'verificationStatus': new_user.verification_status
        }
    }), 201


# Маршрут для авторизации
@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json

    # Проверяем обязательные поля
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'message': 'Необходимо указать логин и пароль'}), 400

    # Ищем пользователя
    user = User.query.filter_by(username=data['username']).first()

    # Проверяем пароль
    if not user or not user.check_password(data['password']):
        return jsonify({'message': 'Неверный логин или пароль'}), 401

    # Создаем токен
    token = create_token(user.id)

    # Определяем роль и данные пользователя
    role = user.role or ('admin' if user.is_admin else 'unknown')

    # Для преподавателей получаем дополнительную информацию
    teacher_info = None
    if role == 'teacher':
        teacher = Teacher.query.filter_by(user_id=user.id).first()
        if teacher:
            teacher_info = {
                'position': teacher.position,
                'department': teacher.department,
                'name': teacher.name
            }

    # Возвращаем данные и токен
    return jsonify({
        'token': token,
        'user': {
            'id': user.id,
            'username': user.username,
            'fullName': user.full_name or (teacher_info['name'] if teacher_info else ''),
            'role': role,
            'group': user.group,
            'faculty': user.faculty,
            'department': teacher_info['department'] if teacher_info else None,
            'position': teacher_info['position'] if teacher_info else None,
            'verificationStatus': user.verification_status or 'verified'
        }
    }), 200


# Маршрут для получения профиля
@app.route('/api/user/profile', methods=['GET'])
@token_required
def get_profile(current_user):
    # Определяем роль
    role = current_user.role or ('admin' if current_user.is_admin else 'unknown')

    # Для преподавателей получаем дополнительную информацию
    teacher_info = None
    if role == 'teacher':
        teacher = Teacher.query.filter_by(user_id=current_user.id).first()
        if teacher:
            teacher_info = {
                'position': teacher.position,
                'department': teacher.department,
                'name': teacher.name
            }

    # Формируем данные профиля
    profile_data = {
        'id': current_user.id,
        'username': current_user.username,
        'fullName': current_user.full_name or (teacher_info['name'] if teacher_info else ''),
        'role': role,
        'group': current_user.group,
        'faculty': current_user.faculty,
        'department': teacher_info['department'] if teacher_info else None,
        'position': teacher_info['position'] if teacher_info else None,
        'verificationStatus': current_user.verification_status or 'verified',
        'studentCardImage': current_user.student_card_image
    }

    return jsonify(profile_data), 200


# Маршрут для загрузки фото студенческого билета
@app.route('/api/student/verify', methods=['POST'])
@token_required
def upload_student_card(current_user):
    # Проверяем, что пользователь - студент
    if current_user.role != 'student':
        return jsonify({'message': 'Только студенты могут загружать студенческий билет'}), 403

    # Проверяем, что файл был отправлен
    if 'studentCard' not in request.files:
        return jsonify({'message': 'Файл не отправлен'}), 400

    file = request.files['studentCard']

    # Проверяем, что файл не пустой
    if file.filename == '':
        return jsonify({'message': 'Файл не выбран'}), 400

    # Генерируем уникальное имя файла
    filename = f"{uuid.uuid4()}{os.path.splitext(file.filename)[1]}"
    file_path = os.path.join(STUDENT_CARDS_FOLDER, filename)

    # Сохраняем файл
    file.save(file_path)

    # Записываем в лог действие
    previous_status = current_user.verification_status

    # Обновляем данные пользователя
    current_user.student_card_image = filename
    current_user.verification_status = 'pending'

    # Создаем запись в журнале верификации
    log_entry = VerificationLog(
        student_id=current_user.id,
        action='upload',
        status_before=previous_status,
        status_after='pending',
        comment='Загрузка студенческого билета'
    )

    db.session.add(log_entry)
    db.session.commit()

    return jsonify({
        'message': 'Файл успешно загружен',
        'status': 'pending'
    }), 200


# Маршрут для получения статуса верификации
@app.route('/api/student/verification-status', methods=['GET'])
@token_required
def get_verification_status(current_user):
    # Проверяем, что пользователь - студент
    if current_user.role != 'student':
        return jsonify({'message': 'Только студенты имеют статус верификации'}), 403

    # Get status message based on verification status
    status_message = ""
    if current_user.verification_status == 'pending':
        status_message = "Ваш студенческий билет находится на проверке. Обычно это занимает 1-2 рабочих дня."
    elif current_user.verification_status == 'verified':
        status_message = "Ваш студенческий билет успешно верифицирован."
    elif current_user.verification_status == 'rejected':
        status_message = "Верификация студенческого билета отклонена. Пожалуйста, загрузите его снова."
    else:  # unverified
        status_message = "Для доступа ко всем функциям приложения необходимо верифицировать студенческий билет."

    return jsonify({
        'status': current_user.verification_status or 'unverified',
        'message': status_message,
        'updatedAt': datetime.datetime.now().isoformat()
    }), 200


# Endpoint to cancel a pending verification and reupload
@app.route('/api/student/cancel-verification', methods=['POST'])
@token_required
def cancel_verification(current_user):
    """Cancel a pending verification to allow reupload"""
    # Check that the user is a student
    if current_user.role != 'student':
        return jsonify({'message': 'Только студенты могут отменить верификацию'}), 403

    # Check that status is pending or rejected
    if current_user.verification_status not in ['pending', 'rejected']:
        return jsonify({'message': 'Невозможно отменить верификацию в текущем статусе'}), 400

    # Записываем в лог действие
    previous_status = current_user.verification_status

    # Delete the current image if it exists
    if current_user.student_card_image:
        try:
            file_path = os.path.join(STUDENT_CARDS_FOLDER, current_user.student_card_image)
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            # Log error but continue with status update
            print(f"Error removing student card image: {str(e)}")

    # Reset verification status
    current_user.student_card_image = None
    current_user.verification_status = 'unverified'

    # Создаем запись в журнале верификации
    log_entry = VerificationLog(
        student_id=current_user.id,
        action='cancel',
        status_before=previous_status,
        status_after='unverified',
        comment='Отмена верификации пользователем'
    )

    db.session.add(log_entry)
    db.session.commit()

    return jsonify({
        'message': 'Верификация отменена. Вы можете загрузить студенческий билет снова.',
        'status': 'unverified'
    }), 200


# Endpoint to reupload student card after rejection
@app.route('/api/student/reupload', methods=['POST'])
@token_required
def reupload_student_card(current_user):
    """Reupload student card after rejection"""
    # Check that the user is a student
    if current_user.role != 'student':
        return jsonify({'message': 'Только студенты могут загружать студенческий билет'}), 403

    # Check if status is rejected or unverified (we already have cancel-verification for pending)
    if current_user.verification_status not in ['rejected', 'unverified']:
        return jsonify({'message': 'Загрузка невозможна в текущем статусе верификации'}), 400

    # Check that a file was sent
    if 'studentCard' not in request.files:
        return jsonify({'message': 'Файл не отправлен'}), 400

    file = request.files['studentCard']

    # Check that the file is not empty
    if file.filename == '':
        return jsonify({'message': 'Файл не выбран'}), 400

    # Записываем в лог действие
    previous_status = current_user.verification_status

    # Delete the current image if it exists
    if current_user.student_card_image:
        try:
            file_path = os.path.join(STUDENT_CARDS_FOLDER, current_user.student_card_image)
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            # Log error but continue with upload
            print(f"Error removing previous student card image: {str(e)}")

    # Generate unique filename
    filename = f"{uuid.uuid4()}{os.path.splitext(file.filename)[1]}"
    file_path = os.path.join(STUDENT_CARDS_FOLDER, filename)

    # Save the file
    file.save(file_path)

    # Update user data
    current_user.student_card_image = filename
    current_user.verification_status = 'pending'

    # Создаем запись в журнале верификации
    log_entry = VerificationLog(
        student_id=current_user.id,
        action='reupload',
        status_before=previous_status,
        status_after='pending',
        comment='Повторная загрузка студенческого билета'
    )

    db.session.add(log_entry)
    db.session.commit()

    return jsonify({
        'message': 'Файл успешно загружен',
        'status': 'pending'
    }), 200


# Маршрут для получения изображения студенческого билета
@app.route('/api/uploads/student_cards/<filename>', methods=['GET'])
@token_required
def get_student_card(current_user, filename):
    # Проверяем права доступа (только админ или владелец файла)
    if not current_user.is_admin and current_user.student_card_image != filename:
        return jsonify({'message': 'Доступ запрещен'}), 403

    return send_from_directory(STUDENT_CARDS_FOLDER, filename)


# Маршрут для получения расписания
@app.route('/api/schedule', methods=['GET'])
@token_required
def get_schedule(current_user):
    # Получаем параметры запроса
    group = request.args.get('group')
    date = request.args.get('date')
    teacher_id = request.args.get('teacher_id')

    # Базовый запрос
    query = Schedule.query

    # Применяем фильтры в зависимости от роли
    if current_user.role == 'student':
        # Для студентов - по группе
        if not group and current_user.group:
            group = current_user.group

        if group:
            query = query.filter_by(group_name=group)

    elif current_user.role == 'teacher':
        # Для преподавателей - по имени преподавателя
        teacher = Teacher.query.filter_by(user_id=current_user.id).first()

        if teacher:
            query = query.filter_by(teacher_name=teacher.name)

    # Общий фильтр по дате
    if date:
        try:
            query_date = datetime.datetime.strptime(date, '%Y-%m-%d').date()
            query = query.filter_by(date=query_date)
        except ValueError:
            pass

    # Сортировка
    query = query.order_by(Schedule.date, Schedule.time_start)

    # Ограничиваем количество результатов
    query = query.limit(100)

    # Получаем результаты
    schedules = query.all()

    # Формируем ответ
    result = []
    for schedule in schedules:
        result.append({
            'id': schedule.id,
            'date': schedule.date.strftime('%Y-%m-%d'),
            'timeStart': schedule.time_start,
            'timeEnd': schedule.time_end,
            'weekday': schedule.weekday,
            'subject': schedule.subject,
            'lessonType': schedule.lesson_type,
            'group': schedule.group_name,
            'teacher': schedule.teacher_name,
            'auditory': schedule.auditory,
            'subgroup': schedule.subgroup
        })

    return jsonify(result), 200


# Обработка ошибок
@app.errorhandler(404)
def not_found(error):
    return jsonify({'message': 'Ресурс не найден'}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({'message': 'Внутренняя ошибка сервера'}), 500


def send_push_message(token, title, message, extra=None):
    """
    Отправляет push-уведомление через HTTP запрос к Expo Push Service

    Args:
        token (str): Expo Push Token
        title (str): Заголовок уведомления
        message (str): Текст уведомления
        extra (dict, optional): Дополнительные данные для уведомления

    Returns:
        dict: Результат отправки с информацией об успехе/ошибке
    """
    try:
        import requests
        import json

        # Экспо API для push-уведомлений
        expo_push_url = "https://exp.host/--/api/v2/push/send"

        # Подготовка данных для отправки
        push_message = {
            "to": token,
            "title": title,
            "body": message,
            "data": extra or {},
            "sound": "default",
            "priority": "high"
        }

        # Выполнение запроса
        headers = {
            "Accept": "application/json",
            "Accept-encoding": "gzip, deflate",
            "Content-Type": "application/json",
        }

        response = requests.post(
            expo_push_url,
            data=json.dumps(push_message),
            headers=headers
        )

        # Проверка ответа
        if response.status_code != 200:
            error_msg = f"Push message to {token} failed with status code {response.status_code}: {response.text}"
            print(error_msg)
            return {"success": False, "error": error_msg}

        # Корректная обработка ответа Expo
        # Expo возвращает массив объектов с полями id, status
        result = response.json()

        # Проверка на наличие ошибок в ответе
        if "errors" in result or "data" in result and "error" in result["data"]:
            error_msg = f"Push message to {token} failed: {result}"
            print(error_msg)
            return {"success": False, "error": error_msg}

        print(f"Successfully sent push notification to {token}")
        return {"success": True, "receipt": result}

    except Exception as exc:
        error_msg = f"Push message failed: {exc}"
        print(error_msg)
        return {"success": False, "error": error_msg}


# Маршрут для регистрации токена устройства
@app.route('/api/device/register', methods=['POST'])
@token_required
def register_device(current_user):
    """Регистрация токена устройства для push-уведомлений"""

    data = request.json
    required_fields = ['token', 'platform']

    # Проверяем обязательные поля
    for field in required_fields:
        if field not in data:
            return jsonify({'message': f'Поле {field} обязательно'}), 400

    # Получаем данные из запроса
    token = data.get('token')
    platform = data.get('platform')
    device_name = data.get('device_name', '')

    # Проверяем, существует ли уже такой токен для этого пользователя
    existing_token = DeviceToken.query.filter_by(
        user_id=current_user.id,
        token=token
    ).first()

    if existing_token:
        # Обновляем существующий токен
        existing_token.platform = platform
        existing_token.device_name = device_name
        existing_token.updated_at = datetime.datetime.utcnow()
    else:
        # Создаем новую запись
        new_token = DeviceToken(
            user_id=current_user.id,
            token=token,
            platform=platform,
            device_name=device_name
        )
        db.session.add(new_token)

    db.session.commit()

    return jsonify({
        'message': 'Токен устройства успешно зарегистрирован',
        'success': True
    }), 200


# Маршрут для тестовой отправки уведомления
@app.route('/api/device/test-notification', methods=['POST'])
@token_required
def test_notification(current_user):
    """Тестовая отправка push-уведомления с подробным выводом результатов"""

    # Получаем все токены пользователя
    tokens = DeviceToken.query.filter_by(user_id=current_user.id).all()

    if not tokens:
        return jsonify({
            'message': 'Нет зарегистрированных устройств',
            'success': False
        }), 404

    # Отправляем тестовое уведомление на каждое устройство
    results = []
    success_count = 0

    for token_obj in tokens:
        result = send_push_message(
            token_obj.token,
            'Тестовое уведомление',
            'Это тестовое push-уведомление от приложения Университет',
            {'type': 'test'}
        )

        if result["success"]:
            success_count += 1

        # Сохраняем результат для каждого устройства
        results.append({
            "device_name": token_obj.device_name,
            "platform": token_obj.platform,
            "token_preview": token_obj.token[:10] + "...",
            "success": result["success"],
            "details": result.get("receipt") if result["success"] else result.get("error")
        })

    return jsonify({
        'message': f'Уведомления отправлены на {success_count} из {len(tokens)} устройств',
        'success': success_count > 0,
        'results': results
    }), 200


if __name__ == '__main__':
    with app.app_context():
        # Создаем необходимые таблицы и поля
        try:
            # Проверяем, есть ли у модели User необходимые поля
            inspect_columns = db.inspect(db.engine).get_columns('user')
            column_names = [column['name'] for column in inspect_columns]

            # Если не хватает полей, добавляем их
            with db.engine.connect() as connection:
                if 'role' not in column_names:
                    connection.execute(db.text("ALTER TABLE user ADD COLUMN role VARCHAR(20) DEFAULT NULL"))

                if 'verification_status' not in column_names:
                    connection.execute(
                        db.text("ALTER TABLE user ADD COLUMN verification_status VARCHAR(20) DEFAULT NULL"))

                if 'student_card_image' not in column_names:
                    connection.execute(
                        db.text("ALTER TABLE user ADD COLUMN student_card_image VARCHAR(255) DEFAULT NULL"))

                if 'full_name' not in column_names:
                    connection.execute(db.text("ALTER TABLE user ADD COLUMN full_name VARCHAR(255) DEFAULT NULL"))

                if 'group' not in column_names:
                    connection.execute(db.text("ALTER TABLE user ADD COLUMN `group` VARCHAR(50) DEFAULT NULL"))

                if 'faculty' not in column_names:
                    connection.execute(db.text("ALTER TABLE user ADD COLUMN faculty VARCHAR(255) DEFAULT NULL"))

                connection.commit()

            print("База данных успешно обновлена")
        except Exception as e:
            print(f"Ошибка при обновлении базы данных: {str(e)}")

    app.run(debug=True, host='0.0.0.0', port=5001)