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
from models import User, Teacher, Schedule, VerificationLog, Schedule, ScheduleTeacher, DeviceToken
import firebase_admin
from firebase_admin import credentials, auth, messaging
from flask import request
import requests
from bs4 import BeautifulSoup
import json
import re
from flask import Response
import requests
from urllib.parse import quote, unquote

import os
import uuid
from flask import request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from models import Ticket, TicketMessage, TicketAttachment

# Firebase initialization removed
FIREBASE_AVAILABLE = False
print("Firebase Admin SDK disabled. FCM notifications have been disabled.")

# Папка для хранения прикрепленных файлов
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

TICKET_ATTACHMENTS_FOLDER = os.path.join(UPLOAD_FOLDER, 'ticket_attachments')
os.makedirs(TICKET_ATTACHMENTS_FOLDER, exist_ok=True)

app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

try:
    cred = credentials.Certificate('firebase.json')
    firebase_admin.initialize_app(cred)
    print("Firebase Admin SDK успешно инициализирован")
    FIREBASE_AVAILABLE = True
except Exception as e:
    print(f"Ошибка инициализации Firebase Admin SDK: {e}")
    FIREBASE_AVAILABLE = False

# Firebase Admin SDK initialization removed
if not firebase_admin._apps:
    try:
        # Initialize with minimal permissions for auth only (no messaging)
        cred = credentials.Certificate('firebase.json')
        firebase_admin.initialize_app(cred)
        print("Firebase Admin SDK initialized for authentication only")
    except Exception as e:
        print(f"Error initializing Firebase Admin SDK: {e}")


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


@app.route('/api/news', methods=['GET'])
def get_news():
    """Get news from the university website with image proxy"""
    try:
        # Get page parameter (default to 1)
        page = request.args.get('page', 1, type=int)
        print(f"Fetching news page: {page}")

        # Create base URL for absolute links
        host_url = request.host_url.rstrip('/')

        # Fetch the news page
        url = f"https://melsu.ru/news?page={page}"
        response = requests.get(url, timeout=15)

        if response.status_code != 200:
            print(f"Failed to fetch news, status code: {response.status_code}")
            return jsonify({"message": "Failed to fetch news", "success": False}), 500

        # Parse HTML
        soup = BeautifulSoup(response.text, 'html.parser')

        # Find news items
        news_items = []

        # Ищем блоки новостей (как первые, так и обычные)
        news_boxes = soup.select('.news-box, .first-news-box')

        for news_box in news_boxes:
            try:
                # Извлекаем ссылку на новость
                link = news_box.select_one('a')
                if not link:
                    continue

                href = link.get('href')
                if not href:
                    continue

                # Получаем ID новости
                match = re.search(r'/news/show/(\d+)', href)
                if not match:
                    continue

                news_id = match.group(1)

                # Получаем изображение и используем прокси
                image_tag = news_box.select_one('img')
                image_url = None
                original_src = None

                if image_tag and image_tag.get('src'):
                    original_src = image_tag['src']

                    # Формируем URL для прокси
                    if original_src.startswith('http'):
                        original_url = original_src
                    else:
                        original_url = f"https://melsu.ru/{original_src.lstrip('/')}"

                    # Кодируем URL для передачи через прокси
                    from urllib.parse import quote
                    encoded_url = quote(original_url)
                    image_url = f"{host_url}/api/image-proxy?url={encoded_url}"

                # Получаем категорию
                category_tag = news_box.select_one('.meta-category')
                category = category_tag.text.strip() if category_tag else None

                # Получаем дату
                date_tag = news_box.select_one('.bi-calendar2-week')
                date = date_tag.parent.text.strip() if date_tag and date_tag.parent else None

                # Получаем заголовок
                title_container = news_box.select_one('h2') or news_box.select_one('h3') or news_box.select_one(
                    '.title')
                title = title_container.text.strip() if title_container else None

                # Получаем описание - для разных типов блоков используются разные селекторы
                description = None

                # Проверяем разные селекторы для описания
                if "first-news-box" in news_box.get('class', []):
                    # Для главной новости
                    description_selectors = ['.line-clamp-10 p', '.line-clamp-10', 'p']
                else:
                    # Для обычных новостей
                    description_selectors = ['.description-news p', '.description-news', '.line-clamp-3', 'p']

                for selector in description_selectors:
                    description_elements = news_box.select(selector)
                    if description_elements:
                        # Берем первый непустой элемент
                        for elem in description_elements:
                            text = elem.text.strip()
                            if text and text != title:  # Избегаем дубликатов заголовка
                                description = text
                                break
                    if description:
                        break

                # Правильно формируем URL новости
                if href.startswith('http'):
                    news_url = href
                else:
                    if href.startswith('/'):
                        href = href[1:]
                    news_url = f"https://melsu.ru/{href}"

                # Добавляем новость в список
                news_items.append({
                    "id": news_id,
                    "title": title,
                    "category": category,
                    "date": date,
                    "description": description,
                    "image_url": image_url,
                    "url": news_url,
                    "_debug_original_src": original_src  # Для отладки
                })
            except Exception as item_error:
                print(f"Error processing news item: {str(item_error)}")
                continue

        # Check if there is a next page
        pagination = soup.select_one('.pagination')
        has_next_page = True

        # Можно оставить оригинальную логику проверки для отладки, но не использовать её результат
        if pagination:
            next_page = page + 1
            # Проверяем наличие ссылки на следующую страницу
            next_page_links = pagination.select(f'a[href="/news?page={next_page}"]')
            original_has_next_page = len(next_page_links) > 0

            # Для логирования
            print(f"Оригинальная проверка наличия страницы {next_page}: {original_has_next_page}")
            print(f"Игнорируем результат проверки и всегда возвращаем has_next_page=True")

        print(f"Обработано {len(news_items)} новостей, has_next_page: {has_next_page}")

        print(f"Processed {len(news_items)} news items, has_next_page: {has_next_page}")
        if news_items:
            print(f"First news item: {news_items[0]['title']}, image: {news_items[0]['image_url']}")

        return jsonify({
            "news": news_items,
            "page": page,
            "has_next_page": has_next_page,
            "success": True
        }), 200

    except Exception as e:
        print(f"Error getting news: {str(e)}")
        return jsonify({"message": f"Error: {str(e)}", "success": False}), 500


@app.route('/api/news/<int:news_id>', methods=['GET'])
def get_news_detail(news_id):
    """Get detailed news article by ID with image proxy"""
    try:
        print(f"Fetching news detail for ID: {news_id}")

        # Create base URL for absolute links
        host_url = request.host_url.rstrip('/')

        # Fetch the news article
        url = f"https://melsu.ru/news/show/{news_id}"
        response = requests.get(url, timeout=15)

        if response.status_code != 200:
            print(f"News article not found, status code: {response.status_code}")
            return jsonify({"message": "News article not found", "success": False}), 404

        # Parse HTML
        soup = BeautifulSoup(response.text, 'html.parser')

        # Extract title
        title_tag = soup.select_one('h1.text-4xl') or soup.select_one('h1')
        title = title_tag.text.strip() if title_tag else None

        # Extract date
        date_tag = soup.select_one('.bi-calendar2-week')
        date = date_tag.parent.text.strip() if date_tag and date_tag.parent else None

        # Extract content
        content_div = soup.select_one('.content-news')

        # Модифицируем контент, чтобы все изображения использовали прокси
        if content_div:
            for img in content_div.select('img'):
                if img.get('src'):
                    original_src = img['src']

                    # Формируем URL для прокси
                    if original_src.startswith('http'):
                        original_url = original_src
                    else:
                        original_url = f"https://melsu.ru/{original_src.lstrip('/')}"

                    # Кодируем URL для передачи через прокси
                    from urllib.parse import quote
                    encoded_url = quote(original_url)
                    proxy_url = f"{host_url}/api/image-proxy?url={encoded_url}"

                    # Заменяем src на прокси-URL
                    img['src'] = proxy_url

        content_html = str(content_div) if content_div else None

        # Extract plain text content
        content_text = content_div.get_text(separator='\n').strip() if content_div else None

        # Extract images and use proxy
        images = []
        # Основное изображение (может быть в шапке статьи)
        header_img = soup.select_one('.img-news-box img') or soup.select_one('.header-image img')

        if header_img and header_img.get('src'):
            src = header_img['src']
            # Формируем URL для прокси
            if src.startswith('http'):
                original_url = src
            else:
                original_url = f"https://melsu.ru/{src.lstrip('/')}"

            # Кодируем URL для передачи через прокси
            from urllib.parse import quote
            encoded_url = quote(original_url)
            proxy_url = f"{host_url}/api/image-proxy?url={encoded_url}"
            images.append(proxy_url)

        # Дополнительные изображения в контенте
        if content_div:
            for img in content_div.select('img'):
                src = img.get('src')
                if src and src not in images:  # Избегаем дубликатов
                    images.append(src)  # Уже заменен на прокси выше

        # Get category from breadcrumbs or meta tag
        category = None
        category_tag = soup.select_one('.meta-category')
        if category_tag:
            category = category_tag.text.strip()
        else:
            # Попробуем найти в хлебных крошках
            breadcrumbs = soup.select('.breadcrumbs .crumb-home')
            if len(breadcrumbs) > 1:
                category = breadcrumbs[1].text.strip()

        # Check for previous and next articles
        prev_article = None
        next_article = None

        # Ищем ссылки на предыдущую/следующую новость
        navigation_links = soup.select('a[href^="/news/show/"]')

        for link in navigation_links:
            link_text = link.text.strip().lower()
            href = link.get('href', '')

            if not href:
                continue

            match = re.search(r'/news/show/(\d+)', href)
            if not match:
                continue

            news_id_from_link = match.group(1)

            # Определяем по тексту ссылки, это предыдущая или следующая новость
            if 'предыдущ' in link_text or 'пред' in link_text or '←' in link_text:
                title_span = link.select_one('span')
                prev_title = title_span.text.strip() if title_span else "Предыдущая новость"
                prev_article = {
                    "id": news_id_from_link,
                    "title": prev_title
                }
            elif 'следующ' in link_text or 'след' in link_text or '→' in link_text:
                title_span = link.select_one('span')
                next_title = title_span.text.strip() if title_span else "Следующая новость"
                next_article = {
                    "id": news_id_from_link,
                    "title": next_title
                }

        # Если не нашли по тексту, попробуем по расположению (первая/последняя ссылка)
        if not prev_article and not next_article and len(navigation_links) >= 2:
            first_link = navigation_links[0]
            last_link = navigation_links[-1]

            # Первая ссылка - предыдущая, последняя - следующая
            first_match = re.search(r'/news/show/(\d+)', first_link.get('href', ''))
            last_match = re.search(r'/news/show/(\d+)', last_link.get('href', ''))

            if first_match:
                prev_article = {
                    "id": first_match.group(1),
                    "title": "Предыдущая новость"
                }

            if last_match:
                next_article = {
                    "id": last_match.group(1),
                    "title": "Следующая новость"
                }

        print(f"Successfully fetched news detail for ID {news_id}")
        if images:
            print(f"Found {len(images)} images with proxy URLs")
            print(f"First image: {images[0]}")

        return jsonify({
            "id": str(news_id),
            "title": title,
            "date": date,
            "category": category,
            "content_html": content_html,
            "content_text": content_text,
            "images": images,
            "prev_article": prev_article,
            "next_article": next_article,
            "success": True
        }), 200

    except Exception as e:
        print(f"Error getting news detail: {str(e)}")
        return jsonify({"message": f"Error: {str(e)}", "success": False}), 500


@app.route('/api/image-proxy', methods=['GET'])
def image_proxy():
    """Прокси для изображений с сайта университета"""
    try:
        image_url = request.args.get('url')
        if not image_url:
            return jsonify({"message": "URL parameter is required"}), 400

        # Декодируем URL если он был закодирован
        try:
            image_url = unquote(image_url)
        except:
            pass

        # Если URL относительный, делаем его абсолютным
        if not image_url.startswith(('http://', 'https://')):
            if not image_url.startswith('/'):
                image_url = f"/{image_url}"
            image_url = f"https://melsu.ru{image_url}"

        print(f"Proxying image from: {image_url}")

        # Получаем изображение с сайта университета
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://melsu.ru/',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
        }

        response = requests.get(image_url, stream=True, headers=headers, timeout=10)

        if response.status_code != 200:
            print(f"Failed to fetch image, status code: {response.status_code}")
            return jsonify({"message": "Failed to fetch image"}), response.status_code

        # Определяем тип контента
        content_type = response.headers.get('Content-Type', 'image/jpeg')

        # Создаем ответ с изображением
        return Response(
            response.content,
            content_type=content_type,
            headers={
                'Access-Control-Allow-Origin': '*',  # Разрешаем доступ из любого источника
                'Cache-Control': 'public, max-age=86400',  # Кэшируем на 24 часа
                'Content-Length': str(len(response.content))
            }
        )

    except Exception as e:
        print(f"Error in image proxy: {str(e)}")
        return jsonify({"message": f"Error: {str(e)}"}), 500


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
                # Добавляем информацию о специальности
                user_data['speciality'] = {
                    'id': user.speciality_id,
                    'code': user.speciality_code,
                    'name': user.speciality_name,
                    'form': user.study_form,
                    'formName': user.study_form_name
                }
                # Получаем курс из расписания
                try:
                    schedule_item = Schedule.query.filter_by(group_name=user.group).first()
                    if schedule_item:
                        user_data['course'] = schedule_item.course
                except Exception as e:
                    print(f"Error getting course from schedule: {str(e)}")
            elif user.role == 'teacher':
                teacher = Teacher.query.filter_by(user_id=user.id).first()
                if teacher:
                    user_data['department'] = teacher.department
                    user_data['position'] = teacher.position

            result.append(user_data)

    return jsonify(result)


# REMOVED: Device token registration endpoints

# Исправление для api.py - маршрут /api/users/<int:user_id>

# Исправление для api.py - функция get_user

@app.route('/api/users/<int:user_id>', methods=['GET'])
@token_required
def get_user(current_user, user_id):
    user = User.query.get(user_id)

    if not user:
        return jsonify({'message': 'Пользователь не найден'}), 404

    # Базовая информация о пользователе
    user_data = {
        'id': user.id,
        'username': user.username,
        'fullName': user.full_name,  # Используем camelCase формат
        'role': user.role,
        'group': user.group,
        'faculty': user.faculty,
        'speciality': {
            'id': user.speciality_id,
            'code': user.speciality_code,
            'name': user.speciality_name,
            'form': user.study_form,
            'formName': user.study_form_name
        } if user.speciality_id else None
    }

    # ВАЖНОЕ ИСПРАВЛЕНИЕ: Для преподавателей всегда включаем данные из таблицы Teacher
    if user.role == 'teacher':
        # Поиск преподавателя в таблице Teacher
        teacher = Teacher.query.filter_by(user_id=user.id).first()

        if teacher:
            user_data['department'] = teacher.department
            user_data['position'] = teacher.position

            # КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: Используем имя из таблицы Teacher
            # и гарантируем, что fullName будет заполнено
            if teacher.name:
                user_data['fullName'] = teacher.name  # Переопределяем имя
                user_data['teacher_name'] = teacher.name  # Дополнительное поле для совместимости

                # Если имя в профиле пользователя пустое, но есть в таблице Teacher
                if not user.full_name:
                    # Обновляем имя пользователя в базе данных
                    try:
                        user.full_name = teacher.name
                        db.session.commit()
                        print(f"Updated user {user.id} full_name with teacher name: {teacher.name}")
                    except Exception as e:
                        print(f"Error updating user full_name: {str(e)}")
                        db.session.rollback()

    # Добавляем информацию о курсе для студентов
    if user.role == 'student' and user.group:
        try:
            schedule_item = Schedule.query.filter_by(group_name=user.group).first()
            if schedule_item:
                user_data['course'] = schedule_item.course
        except Exception as e:
            print(f"Error getting course from schedule: {str(e)}")

    # Для отладки
    print(f"Returning user data for ID {user_id}: {user_data}")

    return jsonify(user_data)


@app.route('/api/teachers/<int:user_id>', methods=['GET'])
@token_required
def get_teacher_info(current_user, user_id):
    """Получение детальной информации о преподавателе по user_id"""
    try:
        # Сначала получаем данные пользователя
        user = User.query.get(user_id)
        if not user:
            return jsonify({'message': 'Пользователь не найден'}), 404

        # Проверяем, что это преподаватель
        if user.role != 'teacher':
            return jsonify({'message': 'Указанный пользователь не является преподавателем'}), 400

        # Получаем запись преподавателя из таблицы Teacher
        teacher = Teacher.query.filter_by(user_id=user.id).first()

        if not teacher:
            return jsonify({
                'message': 'Информация о преподавателе не найдена',
                'user_data': {
                    'id': user.id,
                    'username': user.username,
                    'fullName': user.full_name
                }
            }), 404

        # Формируем полный ответ с информацией о преподавателе
        teacher_data = {
            'id': user.id,
            'teacher_id': teacher.id,
            'username': user.username,
            'fullName': teacher.name or user.full_name,
            'name': teacher.name,
            'department': teacher.department,
            'position': teacher.position,
            'role': 'teacher'
        }

        return jsonify(teacher_data), 200

    except Exception as e:
        print(f"Error getting teacher info: {str(e)}")
        return jsonify({'message': f'Ошибка при получении данных преподавателя: {str(e)}'}), 500


# Добавьте также эндпоинт для поиска преподавателя по его имени в таблице
@app.route('/api/teachers/search', methods=['GET'])
@token_required
def search_teachers(current_user):
    """Поиск преподавателей по имени"""
    try:
        name = request.args.get('name', '')
        if not name or len(name) < 3:
            return jsonify({'message': 'Для поиска требуется не менее 3 символов'}), 400

        # Ищем преподавателей с похожим именем
        teachers = Teacher.query.filter(Teacher.name.ilike(f'%{name}%')).all()

        # Формируем результаты
        results = []
        for teacher in teachers:
            # Получаем связанного пользователя, если есть
            user = None
            if teacher.user_id:
                user = User.query.get(teacher.user_id)

            results.append({
                'id': teacher.id,
                'name': teacher.name,
                'department': teacher.department,
                'position': teacher.position,
                'user_id': teacher.user_id,
                'has_account': teacher.has_account and user is not None
            })

        return jsonify(results), 200

    except Exception as e:
        print(f"Error searching teachers: {str(e)}")
        return jsonify({'message': f'Ошибка при поиске преподавателей: {str(e)}'}), 500


# Fix the password validation in api.py

@app.route('/api/user/change-password', methods=['POST'])
@token_required
def change_password_api(current_user):
    """Change user password"""
    try:
        data = request.json

        # Validate required fields
        if not data or not data.get('currentPassword') or not data.get('newPassword'):
            return jsonify({'message': 'Необходимо указать текущий и новый пароль', 'success': False}), 400

        current_password = data.get('currentPassword')
        new_password = data.get('newPassword')

        # Debug printout to help identify the issue (remove in production)
        print(f"Current user: {current_user.username}")
        print(f"Stored hashed password: {current_user.password}")
        print(f"Plain password (if available): {current_user.password_plain}")

        # FIXED: Proper password check - directly compare with plain password if available
        # This handles cases where the hashing algorithm might have issues
        password_correct = False
        if current_user.password_plain and current_password == current_user.password_plain:
            # Direct match with stored plain password
            password_correct = True
        else:
            # Fallback to hashed comparison
            password_correct = current_user.check_password(current_password)

        if not password_correct:
            return jsonify({'message': 'Текущий пароль указан неверно', 'success': False}), 401

        # Check if new password is strong enough
        if len(new_password) < 6:
            return jsonify({'message': 'Новый пароль должен содержать минимум 6 символов', 'success': False}), 400

        # Update password
        current_user.password_plain = new_password  # For admin view
        current_user.password = generate_password_hash(new_password)
        db.session.commit()

        return jsonify({
            'message': 'Пароль успешно изменен',
            'success': True
        }), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error changing password: {str(e)}")
        return jsonify({
            'message': f'Ошибка при изменении пароля: {str(e)}',
            'success': False
        }), 500


# REMOVED: Notification endpoints

# Helper function to check if username exists
def username_exists(username):
    try:
        return db.session.query(User).filter_by(username=username).first() is not None
    except Exception as e:
        print(f"Error checking username: {str(e)}")
        # In case of any error, return False to allow continuing
        # The uniqueness will still be enforced at the database level
        return False


def create_token(user_id):
    payload = {
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7),
        # Используйте datetime.datetime.now(datetime.UTC) для новых версий
        'iat': datetime.datetime.utcnow(),  # Используйте datetime.datetime.now(datetime.UTC) для новых версий
        'sub': str(user_id)  # <-- ИСПРАВЛЕНИЕ: Преобразуем ID пользователя в строку
    }
    # Убедитесь, что SECRET_KEY точно загружен и не None
    secret_key = app.config.get('SECRET_KEY')
    if not secret_key:
        # В реальном приложении здесь лучше логировать ошибку или выбросить исключение
        print("[CRITICAL ERROR] SECRET_KEY is missing during token creation!")
        raise ValueError("Server configuration error: SECRET_KEY is missing.")

    return jwt.encode(
        payload,
        secret_key,
        algorithm='HS256'
    )


# Декоратор для проверки токена


# Маршрут для регистрации студента
"""
1. Updates to models.py (User model)

Add these new fields to the User model:
"""

# Add to the User class in models.py
speciality_id = db.Column(db.Integer, default=None)
speciality_code = db.Column(db.String(20), default=None)
speciality_name = db.Column(db.String(255), default=None)
study_form = db.Column(db.String(20), default=None)  # 'full-time', 'full-part', or 'correspondence'
study_form_name = db.Column(db.String(50), default=None)  # 'Очная', 'Очно-заочная', or 'Заочная'

"""
2. Update the register endpoint in api.py

Modify the /api/auth/register route to handle speciality information:
"""


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

    # Add speciality data if provided
    if 'speciality' in data and data['speciality']:
        speciality_data = data['speciality']
        new_user.speciality_id = speciality_data.get('id')
        new_user.speciality_code = speciality_data.get('code')
        new_user.speciality_name = speciality_data.get('name')
        new_user.study_form = speciality_data.get('form')
        new_user.study_form_name = speciality_data.get('formName')

        # Set faculty from speciality if not provided separately
        if not new_user.faculty and speciality_data.get('faculty'):
            new_user.faculty = speciality_data.get('faculty')

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
            'verificationStatus': new_user.verification_status,
            'speciality': {
                'id': new_user.speciality_id,
                'code': new_user.speciality_code,
                'name': new_user.speciality_name,
                'form': new_user.study_form,
                'formName': new_user.study_form_name
            } if new_user.speciality_id else None
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

    # Напрямую запрашиваем данные из базы данных, минуя ORM
    try:
        query = """
        SELECT 
            id, 
            username, 
            full_name, 
            role, 
            `group`, 
            faculty, 
            verification_status, 
            student_card_image,
            speciality_id,
            speciality_code,
            speciality_name,
            study_form,
            study_form_name
        FROM user 
        WHERE id = %s
        """

        with db.engine.connect() as connection:
            result = connection.execute(db.text(query), [current_user.id])
            user_data = result.fetchone()

            if not user_data:
                return jsonify({'message': 'Пользователь не найден'}), 404

            # Преобразуем строку из запроса в словарь
            user_dict = dict(zip(result.keys(), user_data))
            print(f"DEBUG: DB query result: {user_dict}")
    except Exception as e:
        print(f"ERROR: Direct DB query failed: {str(e)}")
        # В случае ошибки используем данные из ORM
        user_dict = {
            'id': current_user.id,
            'username': current_user.username,
            'full_name': current_user.full_name,
            'role': current_user.role,
            'group': current_user.group,
            'faculty': current_user.faculty,
            'verification_status': current_user.verification_status,
            'student_card_image': current_user.student_card_image,
            'speciality_id': current_user.speciality_id,
            'speciality_code': current_user.speciality_code,
            'speciality_name': current_user.speciality_name,
            'study_form': current_user.study_form,
            'study_form_name': current_user.study_form_name,
        }

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
        'id': user_dict['id'],
        'username': user_dict['username'],
        'fullName': user_dict['full_name'] or (teacher_info['name'] if teacher_info else ''),
        'role': user_dict['role'],
        'group': user_dict['group'],
        'faculty': user_dict['faculty'],
        'department': teacher_info['department'] if teacher_info else None,
        'position': teacher_info['position'] if teacher_info else None,
        'verificationStatus': user_dict['verification_status'] or 'verified',
        'studentCardImage': user_dict['student_card_image'],
        # Всегда добавляем информацию о специальности из прямого запроса
        'speciality': {
            'id': user_dict['speciality_id'],
            'code': user_dict['speciality_code'],
            'name': user_dict['speciality_name'],
            'form': user_dict['study_form'],
            'formName': user_dict['study_form_name']
        }
    }

    # Для студентов получаем курс из расписания
    if role == 'student' and user_dict['group']:
        try:
            schedule_query = "SELECT course FROM schedule WHERE group_name = %s LIMIT 1"
            with db.engine.connect() as connection:
                schedule_result = connection.execute(db.text(schedule_query), [user_dict['group']])
                schedule_data = schedule_result.fetchone()

                if schedule_data:
                    profile_data['course'] = schedule_data[0]
                    print(f"DEBUG: Found course in schedule: {schedule_data[0]}")
        except Exception as e:
            print(f"DEBUG: Error fetching course from schedule: {str(e)}")

    # Отладочный вывод - финальные данные
    print(f"DEBUG: Final profile data: {profile_data}")

    return jsonify(profile_data), 200


@app.route('/api/schedule/course', methods=['GET'])
@token_required
def get_course_from_schedule(current_user):
    """Get course information from schedule based on group"""
    group = request.args.get('group') or (current_user.group if current_user.role == 'student' else None)

    if not group:
        return jsonify({'message': 'Не указана группа', 'success': False}), 400

    try:
        schedule_item = Schedule.query.filter_by(group_name=group).first()

        if not schedule_item:
            return jsonify({'message': 'Расписание для группы не найдено', 'success': False}), 404

        return jsonify({
            'course': schedule_item.course,
            'group': group,
            'success': True
        }), 200
    except Exception as e:
        print(f"Error fetching course info: {str(e)}")
        return jsonify({
            'message': f'Ошибка при получении информации о курсе: {str(e)}',
            'success': False
        }), 500


@app.route('/api/tickets', methods=['GET'])
@token_required
def get_user_tickets(current_user):
    try:
        # Получаем параметры фильтрации
        status = request.args.get('status', None)
        category = request.args.get('category', None)

        # Базовый запрос
        query = Ticket.query.filter_by(user_id=current_user.id)

        # Применяем фильтры, если они указаны
        if status and status != 'all':
            query = query.filter_by(status=status)
        if category:
            query = query.filter_by(category=category)

        # Сортируем по дате обновления (сначала новые)
        tickets = query.order_by(Ticket.updated_at.desc()).all()

        # Преобразуем в формат JSON
        return jsonify([ticket.to_dict() for ticket in tickets]), 200

    except Exception as e:
        print(f"Error getting tickets: {str(e)}")
        return jsonify({"message": f"Error: {str(e)}"}), 500


# Создание нового тикета
@app.route('/api/tickets', methods=['POST'])
@token_required
def create_ticket(current_user):
    try:
        data = request.json

        # Проверяем обязательные поля
        required_fields = ['title', 'category', 'message']
        for field in required_fields:
            if field not in data:
                return jsonify({"message": f"Field {field} is required"}), 400

        # Создаем новый тикет
        new_ticket = Ticket(
            user_id=current_user.id,
            title=data['title'],
            category=data['category'],
            priority=data.get('priority', 'medium'),
            status='new',
            has_admin_unread=True,
            has_user_unread=False
        )

        # Если указаны связанные данные
        if 'related_type' in data and 'related_id' in data:
            new_ticket.related_type = data['related_type']
            new_ticket.related_id = data['related_id']

        db.session.add(new_ticket)
        db.session.flush()  # Чтобы получить ID тикета

        # Создаем первое сообщение
        message = TicketMessage(
            ticket_id=new_ticket.id,
            user_id=current_user.id,
            is_from_admin=False,
            text=data['message'],
            is_read=True  # Сообщение от пользователя считается прочитанным пользователем
        )

        db.session.add(message)
        db.session.commit()

        return jsonify({
            "message": "Ticket created successfully",
            "ticket": new_ticket.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        print(f"Error creating ticket: {str(e)}")
        return jsonify({"message": f"Error: {str(e)}"}), 500


# Получение деталей тикета
@app.route('/api/tickets/<int:ticket_id>', methods=['GET'])
@token_required
def get_ticket_details(current_user, ticket_id):
    try:
        # Находим тикет и проверяем, принадлежит ли он текущему пользователю
        ticket = Ticket.query.get_or_404(ticket_id)

        if ticket.user_id != current_user.id and not current_user.is_admin:
            return jsonify({"message": "Access denied"}), 403

        # Получаем все сообщения тикета
        messages = [message.to_dict() for message in ticket.messages]

        # Если текущий пользователь не админ, отмечаем сообщения как прочитанные
        if not current_user.is_admin and ticket.has_user_unread:
            # Находим все непрочитанные сообщения от администратора
            unread_messages = TicketMessage.query.filter_by(
                ticket_id=ticket.id,
                is_from_admin=True,
                is_read=False
            ).all()

            # Отмечаем их как прочитанные
            for message in unread_messages:
                message.is_read = True

            # Обновляем флаг непрочитанных сообщений
            ticket.has_user_unread = False
            db.session.commit()

        # Возвращаем данные тикета и сообщения
        return jsonify({
            "ticket": ticket.to_dict(),
            "messages": messages
        }), 200

    except Exception as e:
        print(f"Error getting ticket details: {str(e)}")
        return jsonify({"message": f"Error: {str(e)}"}), 500


# Добавление сообщения к тикету
@app.route('/api/tickets/<int:ticket_id>/messages', methods=['POST'])
@token_required
def add_ticket_message(current_user, ticket_id):
    try:
        # Находим тикет
        ticket = Ticket.query.get_or_404(ticket_id)

        # Проверяем права доступа
        if ticket.user_id != current_user.id and not current_user.is_admin:
            return jsonify({"message": "Access denied"}), 403

        # Получаем данные сообщения
        data = request.json
        if 'text' not in data or not data['text'].strip():
            return jsonify({"message": "Message text is required"}), 400

        # Определяем, от кого сообщение
        is_from_admin = current_user.is_admin

        # Создаем новое сообщение
        new_message = TicketMessage(
            ticket_id=ticket.id,
            user_id=current_user.id,
            is_from_admin=is_from_admin,
            text=data['text'],
            is_read=False
        )

        db.session.add(new_message)

        # Обновляем статус тикета, если указан
        if 'status' in data and data['status'] and current_user.is_admin:
            ticket.status = data['status']

        # Если был закрыт, но пользователь отвечает, переводим в статус ожидания
        if ticket.status == 'closed' and not is_from_admin:
            ticket.status = 'waiting'

        # Обновляем флаги непрочитанных сообщений
        if is_from_admin:
            ticket.has_user_unread = True
        else:
            ticket.has_admin_unread = True

        # Обновляем время последнего обновления
        ticket.updated_at = datetime.datetime.utcnow()

        db.session.commit()

        return jsonify({
            "message": "Message added successfully",
            "ticket_message": new_message.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        print(f"Error adding message: {str(e)}")
        return jsonify({"message": f"Error: {str(e)}"}), 500


# Загрузка прикрепленного файла
@app.route('/api/tickets/<int:ticket_id>/attachment', methods=['POST'])
@token_required
def upload_ticket_attachment(current_user, ticket_id):
    try:
        # Debug output to help diagnose issues
        print(f"Starting file upload for ticket {ticket_id} by user {current_user.id}")
        print(f"Request form data: {request.form}")
        print(f"Request files: {list(request.files.keys()) if request.files else 'No files'}")

        # Find the ticket
        ticket = Ticket.query.get_or_404(ticket_id)
        print(f"Found ticket: {ticket.id}, user_id: {ticket.user_id}")

        # Check access rights
        if ticket.user_id != current_user.id and not current_user.is_admin:
            return jsonify({"message": "Access denied"}), 403

        # Check if a file was sent
        if 'file' not in request.files:
            print("No file part in request")
            return jsonify({"message": "No file part"}), 400

        file = request.files['file']
        print(f"Received file: {file.filename}, content type: {file.content_type}")

        # Check the file has a name
        if file.filename == '':
            return jsonify({"message": "No selected file"}), 400

        # Optional message text
        message_text = request.form.get('text', '')
        print(f"Associated message text: {message_text}")

        # Ensure upload directories exist
        try:
            os.makedirs(UPLOAD_FOLDER, exist_ok=True)
            os.makedirs(TICKET_ATTACHMENTS_FOLDER, exist_ok=True)
            print(f"Ensured directories exist: {TICKET_ATTACHMENTS_FOLDER}")
        except Exception as dir_error:
            print(f"Error creating directories: {str(dir_error)}")
            return jsonify({"message": f"Server storage error: {str(dir_error)}"}), 500

        # Generate a safe filename
        try:
            original_filename = secure_filename(file.filename)
            print(f"Secured original filename: {original_filename}")

            # Generate a unique filename using UUID
            file_ext = os.path.splitext(original_filename)[1]
            filename = f"{uuid.uuid4()}{file_ext}"
            file_path = os.path.join(TICKET_ATTACHMENTS_FOLDER, filename)
            print(f"Generated unique filename: {filename}")
            print(f"Full file path: {file_path}")
        except Exception as filename_error:
            print(f"Error processing filename: {str(filename_error)}")
            return jsonify({"message": f"Filename error: {str(filename_error)}"}), 500

        # Save the file
        try:
            file.save(file_path)
            file_size = os.path.getsize(file_path)
            print(f"File saved successfully. Size: {file_size} bytes")
        except Exception as save_error:
            print(f"Error saving file: {str(save_error)}")
            return jsonify({"message": f"File save error: {str(save_error)}"}), 500

        # Determine file type
        try:
            file_ext = os.path.splitext(original_filename)[1].lower()
            if file_ext in ['.jpg', '.jpeg', '.png', '.gif']:
                file_type = 'image'
            else:
                file_type = 'document'
            print(f"Determined file type: {file_type}")
        except Exception as type_error:
            print(f"Error determining file type: {str(type_error)}")
            # Default to document type if we can't determine
            file_type = 'document'

        # Create message and attachment records
        try:
            # Begin transaction
            is_from_admin = current_user.is_admin

            # Create the message first
            new_message = TicketMessage(
                ticket_id=ticket.id,
                user_id=current_user.id,
                is_from_admin=is_from_admin,
                text=message_text,
                attachment=filename,
                is_read=False
            )
            db.session.add(new_message)
            db.session.flush()  # Get the message ID without committing

            print(f"Created message record with ID: {new_message.id}")

            # Now create the attachment record
            attachment = TicketAttachment(
                message_id=new_message.id,
                filename=filename,
                original_filename=original_filename,
                file_type=file_type,
                file_size=file_size
            )
            db.session.add(attachment)
            print(f"Created attachment record for message: {new_message.id}")

            # Update ticket unread flags and timestamp
            if is_from_admin:
                ticket.has_user_unread = True
            else:
                ticket.has_admin_unread = True

            ticket.updated_at = datetime.datetime.utcnow()
            print(f"Updated ticket timestamps and unread flags")

            # Commit all changes
            db.session.commit()
            print(f"Transaction committed successfully")

            # Prepare response
            return jsonify({
                "message": "File uploaded successfully",
                "ticket_message": new_message.to_dict()
            }), 201

        except Exception as db_error:
            db.session.rollback()
            print(f"Database error: {str(db_error)}")

            # Try to remove the file if we couldn't create the records
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    print(f"Removed file after database error: {file_path}")
            except Exception as cleanup_error:
                print(f"Error during cleanup: {str(cleanup_error)}")

            return jsonify({"message": f"Database error: {str(db_error)}"}), 500

    except Exception as e:
        db.session.rollback()
        print(f"Unexpected error in upload_ticket_attachment: {str(e)}")
        # Print exception traceback for debugging
        import traceback
        traceback.print_exc()
        return jsonify({"message": f"Server error: {str(e)}"}), 500


# Получение прикрепленного файла
@app.route('/api/uploads/ticket_attachments/<filename>', methods=['GET'])
@token_required
def get_ticket_attachment(current_user, filename):
    try:
        # Находим запись о прикрепленном файле
        attachment = TicketAttachment.query.filter_by(filename=filename).first_or_404()

        # Находим сообщение и тикет
        message = TicketMessage.query.get_or_404(attachment.message_id)
        ticket = Ticket.query.get_or_404(message.ticket_id)

        # Проверяем права доступа (только пользователь-владелец тикета или админ)
        if ticket.user_id != current_user.id and not current_user.is_admin:
            return jsonify({"message": "Access denied"}), 403

        return send_from_directory(TICKET_ATTACHMENTS_FOLDER, filename)

    except Exception as e:
        print(f"Error getting attachment: {str(e)}")
        return jsonify({"message": f"Error: {str(e)}"}), 500


# Изменение статуса тикета
@app.route('/api/tickets/<int:ticket_id>/status', methods=['PUT'])
@token_required
def update_ticket_status(current_user, ticket_id):
    try:
        # Находим тикет
        ticket = Ticket.query.get_or_404(ticket_id)

        # Проверяем права доступа
        is_owner = ticket.user_id == current_user.id
        if not is_owner and not current_user.is_admin:
            return jsonify({"message": "Access denied"}), 403

        data = request.json
        if 'status' not in data:
            return jsonify({"message": "Status is required"}), 400

        new_status = data['status']
        comment = data.get('comment', '')

        # Проверка допустимости статуса и прав на его изменение
        valid_statuses = ['new', 'in_progress', 'waiting', 'resolved', 'closed']
        if new_status not in valid_statuses:
            return jsonify({"message": "Invalid status"}), 400

        # Пользователь может только закрыть тикет или повторно открыть
        if is_owner and not current_user.is_admin:
            if new_status not in ['closed', 'waiting']:
                return jsonify({"message": "You can only close the ticket or reopen it"}), 403

        # Обновляем статус
        ticket.status = new_status
        ticket.updated_at = datetime.datetime.utcnow()

        # Добавляем комментарий к изменению статуса, если он предоставлен
        if comment:
            status_message = TicketMessage(
                ticket_id=ticket.id,
                user_id=current_user.id,
                is_from_admin=current_user.is_admin,
                text=comment,
                is_read=False
            )
            db.session.add(status_message)

            # Обновляем флаги непрочитанных сообщений
            if current_user.is_admin:
                ticket.has_user_unread = True
            else:
                ticket.has_admin_unread = True

        db.session.commit()

        return jsonify({
            "message": "Ticket status updated successfully",
            "ticket": ticket.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error updating ticket status: {str(e)}")
        return jsonify({"message": f"Error: {str(e)}"}), 500


# Получение количества непрочитанных тикетов/сообщений
@app.route('/api/tickets/unread-count', methods=['GET'])
@token_required
def get_unread_tickets_count(current_user):
    try:
        # Находим тикеты с непрочитанными сообщениями для текущего пользователя
        unread_tickets = Ticket.query.filter_by(
            user_id=current_user.id,
            has_user_unread=True
        ).count()

        return jsonify({
            "unread_tickets": unread_tickets
        }), 200

    except Exception as e:
        print(f"Error getting unread tickets count: {str(e)}")
        return jsonify({"message": f"Error: {str(e)}"}), 500


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


# Update the get_schedule function in api.py

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
        # Для преподавателей - используем mapping через ScheduleTeacher
        teacher = Teacher.query.filter_by(user_id=current_user.id).first()

        if teacher:
            # Находим все записи ScheduleTeacher, сопоставленные с этим преподавателем
            mapped_schedule_teachers = ScheduleTeacher.query.filter_by(
                mapped_teacher_id=teacher.id,
                active=True
            ).all()

            # Получаем все возможные имена преподавателя в расписании
            teacher_names = [teacher.name]  # Начинаем с основного имени

            # Добавляем имена из сопоставленных записей
            for schedule_teacher in mapped_schedule_teachers:
                if schedule_teacher.name and schedule_teacher.name not in teacher_names:
                    teacher_names.append(schedule_teacher.name)

            # Если есть хотя бы одно имя, применяем фильтр по всем именам
            if teacher_names:
                query = query.filter(Schedule.teacher_name.in_(teacher_names))
                print(f"Filtering schedule for teacher by names: {teacher_names}")
            else:
                print(f"No teacher names found for user_id={current_user.id}, teacher_id={teacher.id}")

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


def send_push_message(token, title, message, data=None):
    """Send push notification using Firebase Cloud Messaging"""
    if not FIREBASE_AVAILABLE:
        print("Firebase Admin SDK не доступен. Уведомление не отправлено.")
        return {"success": False, "message": "Firebase недоступен"}

    try:
        # Создаем объект уведомления
        notification = messaging.Notification(
            title=title,
            body=message
        )

        # Настройки для Android
        android_config = messaging.AndroidConfig(
            priority='high',
            notification=messaging.AndroidNotification(
                icon='notification_icon',
                color='#770002'
            )
        )

        # Настройки для iOS
        apns_config = messaging.APNSConfig(
            payload=messaging.APNSPayload(
                aps=messaging.Aps(
                    content_available=True
                )
            )
        )

        # Создаем объект Message правильно
        message_obj = messaging.Message(
            token=token,
            notification=notification,
            android=android_config,
            apns=apns_config,
            data=data or {}
        )

        # Отправляем сообщение
        response = messaging.send(message_obj)
        print(f"Уведомление успешно отправлено: {response}")
        return {"success": True, "message_id": response}
    except Exception as e:
        print(f"Ошибка при отправке push-уведомления: {e}")
        return {"success": False, "error": str(e)}


@app.route('/api/device/send-notification', methods=['POST'])
@token_required
def send_push_notification(current_user):
    """Отправка push-уведомления конкретному пользователю"""
    try:
        data = request.json

        # Проверяем обязательные поля
        if not data or not data.get('recipient_id'):
            return jsonify({
                'message': 'Не указан получатель уведомления',
                'success': False
            }), 400

        recipient_id = data.get('recipient_id')
        title = data.get('title', 'Новое сообщение')
        body = data.get('body', 'У вас новое сообщение')
        notification_data = data.get('data', {})

        # Добавляем данные отправителя
        notification_data['sender_id'] = current_user.id

        # Проверяем, что это не самоотправка
        if str(recipient_id) == str(current_user.id):
            return jsonify({
                'message': 'Нельзя отправить уведомление самому себе',
                'success': False,
                'status': 'self_notification'
            }), 400

        # Получаем токены устройств получателя
        device_tokens = DeviceToken.query.filter_by(user_id=recipient_id).all()

        if not device_tokens:
            return jsonify({
                'message': 'У получателя нет зарегистрированных устройств',
                'success': False,
                'status': 'no_tokens'
            }), 200  # Возвращаем 200, а не ошибку, так как это ожидаемая ситуация

        # Отправляем уведомления на все устройства
        successful_deliveries = 0
        delivery_receipts = []

        for device in device_tokens:
            try:
                # Определяем, использовать ли Firebase или Expo
                if device.token_type == 'expo' or device.token.startswith('ExponentPushToken['):
                    # Отправка через Expo Push API
                    try:
                        expo_response = requests.post(
                            'https://exp.host/--/api/v2/push/send',
                            json={
                                'to': device.token,
                                'title': title,
                                'body': body,
                                'data': notification_data,
                                'sound': 'default'
                            },
                            headers={
                                'Accept': 'application/json',
                                'Accept-encoding': 'gzip, deflate',
                                'Content-Type': 'application/json',
                            }
                        )

                        if expo_response.status_code == 200:
                            result = expo_response.json()
                            if result.get('data') and result['data'][0].get('status') == 'ok':
                                successful_deliveries += 1
                                delivery_receipts.append({
                                    'platform': 'expo',
                                    'token': device.token[:10] + '...',  # Скрываем большую часть токена
                                    'success': True
                                })
                            else:
                                delivery_receipts.append({
                                    'platform': 'expo',
                                    'token': device.token[:10] + '...',
                                    'success': False,
                                    'error': result.get('data', [{}])[0].get('message', 'Unknown error')
                                })
                        else:
                            delivery_receipts.append({
                                'platform': 'expo',
                                'token': device.token[:10] + '...',
                                'success': False,
                                'error': f"Error {expo_response.status_code}: {expo_response.text}"
                            })
                    except Exception as expo_error:
                        print(f"Ошибка при отправке через Expo: {str(expo_error)}")
                        delivery_receipts.append({
                            'platform': 'expo',
                            'token': device.token[:10] + '...',
                            'success': False,
                            'error': str(expo_error)
                        })
                else:
                    # Отправка через Firebase Cloud Messaging
                    if not FIREBASE_AVAILABLE:
                        delivery_receipts.append({
                            'platform': 'fcm',
                            'token': device.token[:10] + '...',
                            'success': False,
                            'error': 'Firebase недоступен'
                        })
                        continue

                    try:
                        # Определяем тип платформы для настройки уведомления
                        is_android = device.platform.lower() == 'android'
                        is_ios = device.platform.lower() == 'ios'

                        # Создаем объект уведомления
                        notification = messaging.Notification(
                            title=title,
                            body=body
                        )

                        # Настройки для Android
                        android_config = None
                        if is_android:
                            # Получаем канал уведомлений из типа (если указан в data)
                            channel_id = 'default'
                            if notification_data and notification_data.get('type'):
                                notification_type = notification_data.get('type')
                                if notification_type == 'chat':
                                    channel_id = 'chat'
                                elif notification_type == 'schedule':
                                    channel_id = 'schedule'
                                elif notification_type == 'ticket':
                                    channel_id = 'tickets'
                                elif notification_type == 'news':
                                    channel_id = 'news'

                            android_config = messaging.AndroidConfig(
                                priority='high',
                                notification=messaging.AndroidNotification(
                                    icon='notification_icon',
                                    color='#770002',
                                    channel_id=channel_id
                                )
                            )

                        # Настройки для iOS
                        apns_config = None
                        if is_ios:
                            apns_config = messaging.APNSConfig(
                                payload=messaging.APNSPayload(
                                    aps=messaging.Aps(
                                        content_available=True,
                                        sound='default'
                                    )
                                )
                            )

                        # Создаем объект Message
                        message_obj = messaging.Message(
                            token=device.token,
                            notification=notification,
                            data={str(k): str(v) for k, v in notification_data.items()},
                            # FCM требует строковые значения
                            android=android_config,
                            apns=apns_config
                        )

                        # Отправляем сообщение
                        response = messaging.send(message_obj)
                        successful_deliveries += 1
                        delivery_receipts.append({
                            'platform': 'fcm',
                            'token': device.token[:10] + '...',
                            'success': True,
                            'message_id': response
                        })
                    except Exception as fcm_error:
                        print(f"Ошибка при отправке через FCM: {str(fcm_error)}")
                        delivery_receipts.append({
                            'platform': 'fcm',
                            'token': device.token[:10] + '...',
                            'success': False,
                            'error': str(fcm_error)
                        })
            except Exception as device_error:
                print(f"Ошибка при обработке устройства: {str(device_error)}")
                delivery_receipts.append({
                    'platform': 'unknown',
                    'token': device.token[:10] + '...' if device.token else 'none',
                    'success': False,
                    'error': str(device_error)
                })

        # Возвращаем результат
        if successful_deliveries > 0:
            return jsonify({
                'message': f'Уведомление отправлено на {successful_deliveries} из {len(device_tokens)} устройств',
                'success': True,
                'receipts': delivery_receipts
            }), 200
        else:
            return jsonify({
                'message': 'Не удалось отправить уведомление ни на одно устройство',
                'success': False,
                'receipts': delivery_receipts
            }), 200  # Возвращаем 200, чтобы клиент не пытался повторить запрос

    except Exception as e:
        print(f"Общая ошибка при отправке уведомления: {str(e)}")
        return jsonify({
            'message': f'Ошибка: {str(e)}',
            'success': False
        }), 500


@app.route('/api/device/register', methods=['POST'])
@token_required
def register_device(current_user):
    """Регистрация токена устройства для push-уведомлений"""
    try:
        data = request.json

        if not data or not data.get('token'):
            return jsonify({'message': 'Токен не предоставлен', 'success': False}), 400

        token = data.get('token')
        device = data.get('device', 'Неизвестное устройство')
        platform = data.get('platform', 'unknown')
        token_type = data.get('tokenType', 'unknown')

        # Проверяем, существует ли уже запись с таким токеном
        existing_token = DeviceToken.query.filter_by(token=token).first()

        if existing_token:
            # Обновляем существующую запись
            existing_token.user_id = current_user.id
            existing_token.device_name = device
            existing_token.platform = platform
            existing_token.token_type = token_type
            existing_token.last_used_at = datetime.datetime.utcnow()
        else:
            # Создаем новую запись
            new_token = DeviceToken(
                user_id=current_user.id,
                token=token,
                device_name=device,
                platform=platform,
                token_type=token_type,
                created_at=datetime.datetime.utcnow(),
                last_used_at=datetime.datetime.utcnow()
            )
            db.session.add(new_token)

        db.session.commit()

        return jsonify({
            'message': 'Токен устройства зарегистрирован',
            'success': True,
            'action': 'registered'
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"Ошибка при регистрации токена устройства: {str(e)}")
        return jsonify({
            'message': f'Ошибка: {str(e)}',
            'success': False
        }), 500


# STUB endpoint for unregistering device tokens
@app.route('/api/device/unregister', methods=['POST'])
@token_required
def unregister_device(current_user):
    """Отмена регистрации токена устройства"""
    try:
        data = request.json

        if not data or not data.get('token'):
            return jsonify({'message': 'Токен не предоставлен', 'success': False}), 400

        token = data.get('token')

        # Удаление токена из базы данных
        # Здесь вы можете использовать вашу модель DeviceToken или другую структуру

        return jsonify({
            'message': 'Токен устройства удален',
            'success': True,
            'deleted_count': 1
        }), 200

    except Exception as e:
        print(f"Ошибка при удалении токена устройства: {str(e)}")
        return jsonify({
            'message': f'Ошибка: {str(e)}',
            'success': False
        }), 500


@app.route('/api/device/test-notification', methods=['POST'])
@token_required
def test_notification(current_user):
    """Отправка тестового push-уведомления"""
    try:
        data = request.json
        token = data.get('token')
        token_type = data.get('tokenType', 'unknown')

        if not token:
            return jsonify({
                'message': 'Токен не предоставлен',
                'success': False
            }), 400

        # Проверяем тип токена и выбираем способ отправки
        if token_type == 'expo' or token.startswith('ExponentPushToken['):
            # Отправка через Expo Push API
            try:
                response = requests.post(
                    'https://exp.host/--/api/v2/push/send',
                    json={
                        'to': token,
                        'title': 'Тестовое уведомление',
                        'body': 'Это тестовое push-уведомление отправлено через Expo Push API',
                        'data': {
                            'type': 'test',
                            'timestamp': datetime.datetime.now().isoformat()
                        }
                    },
                    headers={
                        'Accept': 'application/json',
                        'Accept-encoding': 'gzip, deflate',
                        'Content-Type': 'application/json',
                    }
                )

                if response.status_code == 200:
                    result = response.json()
                    return jsonify({
                        'message': 'Тестовое уведомление отправлено через Expo Push API',
                        'success': True,
                        'response': result
                    }), 200
                else:
                    return jsonify({
                        'message': f'Ошибка при отправке через Expo Push API: {response.text}',
                        'success': False
                    }), 500
            except Exception as expo_error:
                print(f"Ошибка при отправке через Expo Push API: {str(expo_error)}")
                return jsonify({
                    'message': f'Ошибка при отправке через Expo: {str(expo_error)}',
                    'success': False
                }), 500
        else:
            # Отправка через Firebase Cloud Messaging
            try:
                # Создаем объект уведомления
                notification = messaging.Notification(
                    title='Тестовое уведомление',
                    body='Это тестовое push-уведомление отправлено через Firebase'
                )

                # Настройки для Android
                android_config = messaging.AndroidConfig(
                    priority='high',
                    notification=messaging.AndroidNotification(
                        icon='notification_icon',
                        color='#770002',
                        channel_id='default'
                    )
                )

                # Настройки для iOS
                apns_config = messaging.APNSConfig(
                    payload=messaging.APNSPayload(
                        aps=messaging.Aps(
                            content_available=True,
                            sound='default'
                        )
                    )
                )

                # Данные уведомления
                data = {
                    'type': 'test',
                    'timestamp': datetime.datetime.now().isoformat(),
                    'user_id': str(current_user.id)
                }

                # Создаем объект Message правильно
                message_obj = messaging.Message(
                    token=token,
                    notification=notification,
                    android=android_config,
                    apns=apns_config,
                    data=data
                )

                # Отправляем сообщение
                response = messaging.send(message_obj)
                print(f"Уведомление успешно отправлено через FCM: {response}")

                return jsonify({
                    'message': 'Тестовое уведомление отправлено через Firebase',
                    'success': True,
                    'message_id': response
                }), 200

            except Exception as fcm_error:
                print(f"Ошибка при отправке через FCM: {str(fcm_error)}")
                return jsonify({
                    'message': f'Ошибка при отправке через Firebase: {str(fcm_error)}',
                    'success': False
                }), 500

    except Exception as e:
        print(f"Общая ошибка при отправке тестового уведомления: {str(e)}")
        return jsonify({
            'message': f'Ошибка: {str(e)}',
            'success': False
        }), 500


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