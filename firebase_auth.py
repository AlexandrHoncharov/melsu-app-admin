import os
import firebase_admin
from firebase_admin import auth, credentials
from flask import Blueprint, request, jsonify

# Создаем Blueprint для Firebase маршрутов
firebase_routes = Blueprint('firebase', __name__)

# Инициализируем Firebase Admin SDK
cred_path = os.environ.get('FIREBASE_CREDENTIALS_PATH', 'path/to/serviceAccountKey.json')
firebase_cred = credentials.Certificate(cred_path)

# Проверяем, инициализирован ли Firebase
try:
    default_app = firebase_admin.get_app()
except ValueError:
    default_app = firebase_admin.initialize_app(firebase_cred)


@firebase_routes.route('/api/firebase/token', methods=['GET'])
def get_firebase_token():
    """
    Генерирует Firebase Custom Token на основе существующего JWT токена
    для обеспечения аутентификации между вашим API и Firebase
    """
    # Получаем токен из заголовка
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Необходима авторизация'}), 401

    token = auth_header.split(' ')[1]

    try:
        # Проверяем токен вашего API и получаем ID пользователя
        # Используем вашу существующую функцию проверки токена
        from api import token_required
        from functools import wraps

        # Мокаем request для использования в token_required
        class RequestMock:
            def __init__(self, token):
                self.headers = {'Authorization': f'Bearer {token}'}

        mock_request = RequestMock(token)

        # Получаем пользователя из токена
        @wraps(token_required)
        def get_user_from_token(*args, **kwargs):
            return token_required(lambda user: user)(*args, **kwargs)

        current_user = get_user_from_token()
        user_id = str(current_user.id)

        # Генерируем Firebase токен с claims
        custom_claims = {
            'role': current_user.role,
            'username': current_user.username,
            'fullName': current_user.full_name,
        }

        # Если есть дополнительные поля, добавляем их
        if current_user.group:
            custom_claims['group'] = current_user.group

        if current_user.faculty:
            custom_claims['faculty'] = current_user.faculty

        # Создаем пользовательский токен Firebase
        firebase_token = auth.create_custom_token(user_id, custom_claims)

        return jsonify({
            'firebaseToken': firebase_token.decode('utf-8'),
            'uid': user_id
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Ошибка аутентификации: {str(e)}'}), 401


# Регистрация Blueprint в основном приложении
def init_firebase_routes(app):
    app.register_blueprint(firebase_routes)
    app.logger.info('Firebase routes initialized')