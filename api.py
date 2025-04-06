from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
import datetime
import os
import uuid
from functools import wraps
from db import db
from models import User, Teacher, Schedule

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


# Маршрут для регистрации студента
@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json

    # Проверяем обязательные поля
    required_fields = ['username', 'password', 'fullName', 'role']
    for field in required_fields:
        if field not in data:
            return jsonify({'message': f'Поле {field} обязательно'}), 400

    # Проверяем, существует ли пользователь с таким именем
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'message': 'Пользователь с таким логином уже существует'}), 400

    # Создаем нового пользователя
    new_user = User(
        username=data['username'],
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

    # Обновляем данные пользователя
    current_user.student_card_image = filename
    current_user.verification_status = 'pending'
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

    return jsonify({
        'status': current_user.verification_status or 'unverified'
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

    app.run(debug=True, host='0.0.0.0', port=5000)