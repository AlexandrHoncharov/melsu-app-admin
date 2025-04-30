import datetime
import os
import uuid
from functools import wraps
from urllib.parse import unquote
import os
import re
import firebase_admin
import jwt
import requests
from bs4 import BeautifulSoup
from firebase_admin import credentials, auth, messaging
from flask import Flask
from flask import Response
from flask import request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash
from werkzeug.utils import secure_filename

from db import db
from models import Ticket, TicketMessage, TicketAttachment
from models import User, Teacher, VerificationLog, Schedule, ScheduleTeacher, DeviceToken

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


def validate_fcm_token(token):
    """Проверяет формат и тип токена для уведомлений"""
    if not token:
        return False

    # Преобразуем в строку на всякий случай
    token = str(token)

    # Обрезаем токен для логирования
    token_preview = token[:15] + "..." if len(token) > 15 else token

    # Проверяем по шаблонам
    is_jwt = token.count('.') == 2 and token.startswith('ey')
    is_expo = token.startswith('ExponentPushToken[')
    is_fcm_format = bool(re.match(r'^[a-zA-Z0-9:_-]+$', token))

    print(f"💫 ПРОВЕРКА ТОКЕНА: {token_preview}")
    print(f"   - Длина токена: {len(token)} символов")
    print(f"   - Похож на JWT: {is_jwt}")
    print(f"   - Похож на Expo token: {is_expo}")
    print(f"   - Соответствует формату FCM: {is_fcm_format}")

    if is_jwt:
        print(f"   ❌ ОШИБКА: Получен JWT-токен аутентификации вместо FCM-токена")
        return False
    elif is_expo:
        print(f"   ⚠️ ВНИМАНИЕ: Получен Expo token, может не работать с Firebase Admin SDK")
        # Для Expo токенов требуется другой сервис отправки
        return False
    elif not is_fcm_format:
        print(f"   ❌ ОШИБКА: Токен не соответствует формату FCM")
        return False

    return True


# Замените или модифицируйте блок инициализации Firebase (найдите этот код в вашем файле)
try:
    print(f"📱 Попытка инициализации Firebase Admin SDK")
    print(f"   - Текущая директория: {os.getcwd()}")
    print(f"   - Путь к файлу: {os.path.abspath('firebase.json')}")
    print(f"   - Файл существует: {os.path.exists('firebase.json')}")

    if not os.path.exists('firebase.json'):
        print(f"   ❌ ОШИБКА: Файл firebase.json не найден!")
        raise FileNotFoundError("Файл firebase.json не найден")

    cred = credentials.Certificate('firebase.json')
    firebase_admin.initialize_app(cred)
    print(f"   ✅ Firebase Admin SDK успешно инициализирован")
    FIREBASE_AVAILABLE = True
except Exception as e:
    print(f"   ❌ ОШИБКА инициализации Firebase Admin SDK: {str(e)}")
    print(f"   - Тип ошибки: {type(e).__name__}")
    import traceback

    traceback.print_exc()
    FIREBASE_AVAILABLE = False
    print(f"   ⚠️ Уведомления FCM отключены из-за ошибки")

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


# Функции для очистки и форматирования текста
import re
import html


def clean_text(text):
    """
    Очищает текст от невидимых символов и лишних пробелов
    """
    if not text:
        return ""

    # Удаление невидимых символов Unicode
    text = re.sub(r'[\u200B-\u200D\uFEFF]', '', text)

    # Декодирование HTML-сущностей (&nbsp; и т.д.)
    text = html.unescape(text)

    # Удаление символов нулевой ширины
    text = text.replace('\u200b', '')

    # Удаление лишних пробелов в начале и конце
    return text.strip()


def format_content_text(content_text):
    """
    Форматирует текст содержимого для правильного отображения в приложении
    """
    if not content_text:
        return ""

    # Очистка от невидимых символов
    text = clean_text(content_text)

    # Исправление отступов абзацев
    text = re.sub(r'(?m)^\s+', '', text)

    # Форматирование абзацев
    paragraphs = text.split('\n\n')
    formatted_paragraphs = [p.strip() for p in paragraphs if p.strip()]

    # Соединяем абзацы с двойным переносом для лучшего отображения
    return '\n\n'.join(formatted_paragraphs)


def extract_formatted_text_from_html(html_content):
    """
    Извлекает текст из HTML-контента с сохранением базового форматирования (жирный, списки и т.д.)
    """
    if not html_content:
        return ""

    soup = BeautifulSoup(html_content, 'html.parser')

    # Преобразуем HTML в формат, подходящий для мобильного отображения
    result_text = ""
    current_list_index = 0

    # Обработка содержимого
    for element in soup.find_all(['p', 'strong', 'b', 'ol', 'ul', 'li', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']):
        tag_name = element.name

        # Пропускаем элементы внутри списков, так как мы обрабатываем их отдельно
        if element.parent.name in ['ol', 'ul'] and tag_name != 'li':
            continue

        # Обработка абзацев
        if tag_name == 'p':
            paragraph_text = element.get_text().strip()
            if paragraph_text:
                result_text += paragraph_text + "\n\n"

        # Обработка заголовков
        elif tag_name.startswith('h'):
            result_text += element.get_text().strip() + "\n\n"

        # Обработка упорядоченных (нумерованных) списков
        elif tag_name == 'ol':
            current_list_index = 0  # Сбрасываем индекс
            # Обработаем каждый элемент списка
            for li in element.find_all('li', recursive=False):
                current_list_index += 1
                li_text = li.get_text().strip()
                result_text += f"{current_list_index}. {li_text}\n"
            result_text += "\n"  # Добавляем дополнительный перенос строки после списка

        # Обработка неупорядоченных списков
        elif tag_name == 'ul':
            for li in element.find_all('li', recursive=False):
                li_text = li.get_text().strip()
                result_text += f"• {li_text}\n"
            result_text += "\n"

        # Обработка элементов списка (если они не вложены в ol/ul)
        elif tag_name == 'li' and element.parent.name not in ['ol', 'ul']:
            li_text = element.get_text().strip()
            result_text += f"• {li_text}\n"

        # Обработка базовых блоков
        elif tag_name == 'div':
            div_text = element.get_text().strip()
            if div_text:
                result_text += div_text + "\n\n"

    # Удаляем лишние переносы строк
    result_text = re.sub(r'\n{3,}', '\n\n', result_text)

    # Удаление лишних пробелов и невидимых символов
    return clean_text(result_text)


def process_html_for_mobile_display(html_content):
    """
    Обрабатывает HTML-контент для правильного отображения на мобильных устройствах,
    сохраняя форматирование текста (жирный, списки и т.д.)
    """
    if not html_content:
        return ""

    soup = BeautifulSoup(html_content, 'html.parser')

    # 1. Обрабатываем изображения
    for img in soup.find_all('img'):
        # Добавляем стили для мобильных устройств
        img['style'] = 'max-width: 100%; height: auto; display: block; margin: 10px auto;'

    # 2. Обрабатываем абзацы
    for p in soup.find_all('p'):
        p['style'] = 'margin-bottom: 16px; line-height: 1.5;'

    # 3. Обрабатываем заголовки
    for i in range(1, 7):
        for heading in soup.find_all(f'h{i}'):
            heading['style'] = f'font-size: {24 - (i - 1) * 2}px; font-weight: bold; margin: 20px 0 10px 0;'

    # 4. Обрабатываем списки
    for ol in soup.find_all('ol'):
        ol['style'] = 'margin-bottom: 16px; padding-left: 24px;'

    for ul in soup.find_all('ul'):
        ul['style'] = 'margin-bottom: 16px; padding-left: 24px; list-style-type: disc;'

    for li in soup.find_all('li'):
        li['style'] = 'margin-bottom: 8px;'

    # 5. Выделенный текст
    for strong in soup.find_all(['strong', 'b']):
        strong['style'] = 'font-weight: bold;'

    # 6. Таблицы
    for table in soup.find_all('table'):
        table['style'] = 'width: 100%; margin-bottom: 16px; border-collapse: collapse;'

        for td in table.find_all('td'):
            td['style'] = 'padding: 8px; border: 1px solid #ddd;'

    # Возвращаем обработанный HTML
    return str(soup)


def process_text_with_formatting(html_text):
    """Обрабатывает HTML-текст, сохраняя форматирование (жирный, курсив и т.д.)"""
    if not html_text:
        return ""

    # Убеждаемся, что работаем со строкой
    if not isinstance(html_text, str):
        html_text = str(html_text)

    # Удаляем маркеры изображений
    html_text = re.sub(r'<span class="image-marker"[^>]*>.*?</span>', '', html_text)

    # Заменяем теги <strong> и <b> на маркеры для жирного текста
    html_text = re.sub(r'<(strong|b)>(.*?)</(strong|b)>', r'**\2**', html_text, flags=re.DOTALL)

    # Заменяем теги <em> и <i> на маркеры для курсивного текста
    html_text = re.sub(r'<(em|i)>(.*?)</(em|i)>', r'_\2_', html_text, flags=re.DOTALL)

    # Удаляем все оставшиеся HTML теги
    html_text = re.sub(r'<[^>]+>', '', html_text)

    # Декодируем HTML-сущности
    html_text = html.unescape(html_text)

    # Удаляем лишние пробелы
    html_text = re.sub(r'\s+', ' ', html_text).strip()

    return html_text


def parse_news_detail_for_mobile(html_content):
    """
    Парсит HTML-содержимое новости и преобразует его в структуру для мобильного приложения
    с сохранением расположения изображений и форматирования текста

    Возвращает список объектов с типами:
    - "text": обычный текст (поддерживает жирное выделение)
    - "image": изображение с URL
    - "list": нумерованный или маркированный список
    - "table": таблица
    """
    if not html_content:
        return []

    try:
        soup = BeautifulSoup(html_content, 'html.parser')

        # Результирующий массив с различными типами контента
        content_blocks = []

        # Находим все изображения, чтобы потом можно было отслеживать их позиции
        all_images = soup.find_all('img')
        image_positions = {}

        for img in all_images:
            if img.get('src'):
                # Используем прогрессивный идентификатор для изображений
                img_id = f"img_{len(image_positions)}"
                image_positions[img_id] = {
                    'src': img.get('src'),
                    'processed': False
                }
                # Заменяем тег img на маркер в тексте
                marker = soup.new_tag('span')
                marker['class'] = 'image-marker'
                marker['data-image-id'] = img_id
                img.replace_with(marker)

        # Обработка абзацев и других текстовых элементов
        for element in soup.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table']):
            tag_name = element.name

            # Обработка абзацев
            if tag_name == 'p':
                # Ищем маркеры изображений внутри абзаца
                element_text = str(element)
                markers = element.find_all('span', class_='image-marker')

                # Если есть маркеры изображений, разбиваем текст на части
                if markers:
                    # Добавляем текст до первого маркера
                    text_before = process_text_with_formatting(str(element))
                    if text_before.strip():
                        content_blocks.append({
                            "type": "text",
                            "content": text_before
                        })

                    # Добавляем изображения
                    for marker in markers:
                        img_id = marker.get('data-image-id')
                        if img_id and img_id in image_positions and not image_positions[img_id]['processed']:
                            content_blocks.append({
                                "type": "image",
                                "src": image_positions[img_id]['src']
                            })
                            image_positions[img_id]['processed'] = True
                else:
                    # Парсим абзац с сохранением жирного выделения (без изображений)
                    formatted_text = process_text_with_formatting(str(element))
                    if formatted_text.strip():
                        content_blocks.append({
                            "type": "text",
                            "content": formatted_text
                        })

            # Обработка заголовков
            elif tag_name.startswith('h'):
                level = int(tag_name[1])
                content_blocks.append({
                    "type": "header",
                    "level": level,
                    "content": process_text_with_formatting(element.get_text())
                })

            # Обработка списков
            elif tag_name == 'ul' or tag_name == 'ol':
                list_items = []
                for li in element.find_all('li', recursive=False):
                    list_items.append(process_text_with_formatting(li.get_text()))

                content_blocks.append({
                    "type": "list",
                    "list_type": "ordered" if tag_name == 'ol' else "unordered",
                    "items": list_items
                })

            # Обработка таблиц
            elif tag_name == 'table':
                # Ищем изображения в таблице
                table_images = element.find_all('span', class_='image-marker')
                for marker in table_images:
                    img_id = marker.get('data-image-id')
                    if img_id and img_id in image_positions and not image_positions[img_id]['processed']:
                        content_blocks.append({
                            "type": "image",
                            "src": image_positions[img_id]['src']
                        })
                        image_positions[img_id]['processed'] = True

                # Упрощенно извлекаем текст таблицы
                table_text = element.get_text().strip()
                if table_text:
                    content_blocks.append({
                        "type": "text",
                        "content": "Таблица: " + table_text
                    })

        # Добавляем все необработанные изображения в конец
        for img_id, img_info in image_positions.items():
            if not img_info['processed']:
                content_blocks.append({
                    "type": "image",
                    "src": img_info['src']
                })
                img_info['processed'] = True

        # Объединяем последовательные текстовые блоки
        merged_blocks = []
        current_text = ""

        for block in content_blocks:
            if block["type"] == "text":
                if current_text:
                    current_text += "\n\n" + block["content"]
                else:
                    current_text = block["content"]
            else:
                if current_text:
                    merged_blocks.append({
                        "type": "text",
                        "content": current_text
                    })
                    current_text = ""
                merged_blocks.append(block)

        # Добавляем последний текстовый блок, если он есть
        if current_text:
            merged_blocks.append({
                "type": "text",
                "content": current_text
            })

        return merged_blocks

    except Exception as e:
        print(f"Error parsing HTML content: {str(e)}")
        # В случае ошибки парсинга возвращаем один текстовый блок с исходным текстом
        return [{
            "type": "text",
            "content": BeautifulSoup(html_content, 'html.parser').get_text()
        }]


def update_api_response_with_content_blocks(api_response, host_url):
    """
    Обновляет ответ API, добавляя в него разобранные блоки контента
    с правильными URL для изображений.
    """
    if not api_response or not api_response.get('content_html'):
        return api_response

    try:
        # Разбираем HTML-контент
        content_blocks = parse_news_detail_for_mobile(api_response['content_html'])

        # Обрабатываем URL изображений через прокси
        for block in content_blocks:
            if block['type'] == 'image' and block.get('src'):
                src = block['src']

                # Формируем URL для прокси
                if src.startswith('http'):
                    original_url = src
                else:
                    original_url = f"https://melsu.ru/{src.lstrip('/')}"

                # Кодируем URL для передачи через прокси
                from urllib.parse import quote
                encoded_url = quote(original_url)
                proxy_url = f"{host_url}/api/image-proxy?url={encoded_url}"

                # Заменяем на прокси-URL
                block['src'] = proxy_url

        # Добавляем блоки в ответ API
        api_response['content_blocks'] = content_blocks

        return api_response
    except Exception as e:
        print(f"Error creating content blocks: {str(e)}")
        # В случае ошибки возвращаем исходный ответ без изменений
        return api_response


# Добавьте эту улучшенную версию функции get_news_detail в api.py

@app.route('/api/news/<int:news_id>', methods=['GET'])
def get_news_detail(news_id):
    """Get detailed news article by ID with image proxy and improved content structure"""
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

        # Extract title and clean it
        title_tag = soup.select_one('h1.text-4xl') or soup.select_one('h1')
        title = clean_text(title_tag.text.strip()) if title_tag else None

        # Extract date
        date_tag = soup.select_one('.bi-calendar2-week')
        date = clean_text(date_tag.parent.text.strip()) if date_tag and date_tag.parent else None

        # Extract content
        content_div = soup.select_one('.content-news')
        content_html = None
        content_text = None

        # Подготовим данные для ответа
        result = {
            "id": str(news_id),
            "title": title,
            "date": date,
            "category": None,
            "content_html": None,
            "content_text": None,
            "images": [],
            "success": True
        }

        # Get category from breadcrumbs or meta tag
        category_tag = soup.select_one('.meta-category')
        if category_tag:
            result["category"] = clean_text(category_tag.text.strip())
        else:
            # Попробуем найти в хлебных крошках
            breadcrumbs = soup.select('.breadcrumbs .crumb-home')
            if len(breadcrumbs) > 1:
                result["category"] = clean_text(breadcrumbs[1].text.strip())

        # Обрабатываем содержимое новости
        if content_div:
            # Сохраняем HTML-контент
            result["content_html"] = str(content_div)

            # Извлекаем текст с сохранением форматирования
            result["content_text"] = extract_formatted_text_from_html(str(content_div))

            # Находим главное изображение (может быть в шапке статьи)
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
                result["images"].append(proxy_url)

            # Обрабатываем контент с использованием нового парсера, который
            # создает структурированные блоки контента с изображениями по месту их расположения
            result = update_api_response_with_content_blocks(result, host_url)

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
                prev_title = clean_text(title_span.text.strip()) if title_span else "Предыдущая новость"
                prev_article = {
                    "id": news_id_from_link,
                    "title": prev_title
                }
            elif 'следующ' in link_text or 'след' in link_text or '→' in link_text:
                title_span = link.select_one('span')
                next_title = clean_text(title_span.text.strip()) if title_span else "Следующая новость"
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

        # Добавляем данные о предыдущей и следующей статье
        result["prev_article"] = prev_article
        result["next_article"] = next_article

        print(f"Successfully fetched news detail for ID {news_id}")
        if result["images"]:
            print(f"Found {len(result['images'])} main images")

        if "content_blocks" in result:
            image_blocks = [block for block in result["content_blocks"] if block.get("type") == "image"]
            print(f"Found {len(image_blocks)} content blocks with images")

        return jsonify(result), 200

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


def generate_username(full_name, group=None, role=None, department=None):
    """Generate a username based on full name, role, and other details

    Args:
        full_name (str): The person's full name
        group (str, optional): Student's group (for students)
        role (str, optional): 'student' or 'teacher'
        department (str, optional): Teacher's department (for teachers)

    Returns:
        str: A generated username
    """
    import re
    import random
    import string
    import transliterate

    # Handle empty or invalid name
    if not full_name or full_name.strip() == '':
        return ''.join(random.choices(string.ascii_lowercase, k=6))

    # Remove any non-alphanumeric characters and split the name
    # First try to transliterate if the name contains Cyrillic characters
    if re.search('[а-яА-Я]', full_name):
        try:
            transliterated = transliterate.translit(full_name, 'ru', reversed=True)
            # Remove diacritical marks
            transliterated = ''.join(c for c in unicodedata.normalize('NFD', transliterated)
                                     if unicodedata.category(c) != 'Mn')
            clean_name = transliterated
        except:
            # If transliteration fails, just use the original with non-alphanumeric chars removed
            clean_name = ''.join(c for c in full_name if c.isalnum() or c.isspace())
    else:
        clean_name = ''.join(c for c in full_name if c.isalnum() or c.isspace())

    name_parts = clean_name.split()

    if not name_parts:
        return ''.join(random.choices(string.ascii_lowercase, k=6))

    # Different username formation based on role
    if role == 'teacher':
        # For teachers: lastname.firstname or lastname.initial
        if len(name_parts) >= 2:
            lastname = name_parts[-1].lower()
            firstname = name_parts[0].lower()

            # Include department code if available (first 2-3 letters)
            dept_code = ""
            if department:
                # Extract department code
                dept_words = department.split()
                if dept_words:
                    # Take first letters of each word in department name
                    dept_code = ''.join(word[0].lower() for word in dept_words if word)
                    dept_code = dept_code[:3]  # Limit to 3 chars

            # Try a few username patterns
            if len(lastname) > 2 and len(firstname) > 2:
                username = f"{lastname}.{firstname[:3]}{dept_code}"
            else:
                # If names are very short, use full first name
                username = f"{lastname}.{firstname}{dept_code}"
        else:
            # If only one name part is available
            username = f"{name_parts[0].lower()}"
    else:
        # For students or default
        if len(name_parts) >= 2:
            # Get first name and last name
            firstname = name_parts[0].lower()
            lastname = name_parts[-1].lower()

            # Take first three letters of first name and last name
            # unless they're shorter
            first_part = firstname[:min(3, len(firstname))]
            last_part = lastname[:min(4, len(lastname))]

            # Group code (clean and take up to 3 chars)
            group_code = ""
            if group:
                # Extract numeric part of the group if possible
                match = re.search(r'\d+', group)
                if match:
                    group_code = match.group()[:2]  # Take first 2 digits
                else:
                    # Otherwise take first 2-3 alphanumeric chars
                    clean_group = ''.join(c for c in group if c.isalnum())
                    group_code = clean_group[:3].lower()

            # Build the username with a more readable structure
            username = f"{first_part}_{last_part}"

            if group_code:
                username = f"{username}{group_code}"
        else:
            # If only one name part is available
            name = name_parts[0].lower()
            username = f"{name[:6]}"  # Take up to 6 chars

    # Add a small random suffix to handle duplicates (2 digits)
    random_suffix = ''.join(random.choices(string.digits, k=2))
    username = f"{username}{random_suffix}"

    # Remove any non-alphanumeric characters
    username = ''.join(c for c in username if c.isalnum() or c == '_' or c == '.')

    # Ensure username is not too long
    if len(username) > 20:
        username = username[:20]

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
    """Get users filtered by role and optionally by group and verification status"""
    role = request.args.get('role')
    group = request.args.get('group')
    verification_status = request.args.get('verification_status')

    query = User.query
    if role:
        query = query.filter_by(role=role)

    # Add filter by group if specified
    if group:
        query = query.filter_by(group=group)

    # Add filter by verification status if specified
    if verification_status:
        if verification_status == 'verified_only':
            query = query.filter_by(verification_status='verified')
        elif verification_status == 'all':
            # No filtering, return all users regardless of verification
            pass
        elif verification_status == 'unverified_only':
            query = query.filter(User.verification_status.in_(['unverified', 'pending', 'rejected']))

    users = query.all()

    result = []
    for user in users:
        if user.id != current_user.id:  # Exclude current user
            user_data = {
                'id': user.id,
                'username': user.username,
                'fullName': user.full_name,
                'role': user.role,
                'verificationStatus': user.verification_status or 'verified'  # Add verification status
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
                } if user.speciality_id else None
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


@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json

    # Проверяем обязательные поля
    # Remove email from required fields to make it optional
    required_fields = ['password', 'fullName', 'role']
    for field in required_fields:
        if field not in data:
            return jsonify({'message': f'Поле {field} обязательно'}), 400

    # Still validate email format if provided
    email = data.get('email', '')  # Default to empty string instead of None
    if email and '@' not in email:
        return jsonify({'message': 'Некорректный формат email'}), 400

    # Генерируем имя пользователя, если оно не предоставлено
    if 'username' not in data or not data['username']:
        username = generate_username(data['fullName'], data.get('group'), data.get('role'))

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

    try:
        # Create user with email field (empty string if not provided)
        new_user = User(
            username=username,
            password=data['password'],
            email=email,  # Set email (will be empty string if not provided)
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
                'email': email,  # Include email in response
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

    except Exception as e:
        db.session.rollback()
        print(f"Error during registration: {str(e)}")
        error_details = str(e)

        # Check for specific database errors
        if "field 'email' doesn't have a default value" in error_details:
            return jsonify({
                'message': 'Ошибка при сохранении email. Пожалуйста, попробуйте заполнить поле email или сообщите администратору.'
            }), 500

        return jsonify({
            'message': 'Ошибка при создании пользователя',
            'error': error_details
        }), 500


# Обновленный endpoint для входа в api.py

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json

    # Проверяем обязательные поля
    if not data or not data.get('password'):
        return jsonify({'message': 'Необходимо указать пароль'}), 400

    # Проверяем наличие идентификатора (логин или email)
    if not data.get('username') and not data.get('email'):
        return jsonify({'message': 'Необходимо указать логин или email'}), 400

    # Ищем пользователя по логину или email
    user = None
    if data.get('email'):
        # Если указан email, ищем по нему
        user = User.query.filter_by(email=data['email']).first()
    else:
        # Иначе ищем по логину (username)
        user = User.query.filter_by(username=data['username']).first()

    # Проверяем пароль
    if not user or not user.check_password(data['password']):
        return jsonify({'message': 'Неверный логин/email или пароль'}), 401

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

    # Создаем объект ответа с безопасным доступом к атрибутам
    user_data = {
        'id': user.id,
        'username': user.username,
        'fullName': user.full_name or (teacher_info['name'] if teacher_info else ''),
        'role': role,
        'group': user.group,
        'faculty': user.faculty,
        'department': teacher_info['department'] if teacher_info else None,
        'position': teacher_info['position'] if teacher_info else None,
        'verificationStatus': user.verification_status or 'verified',
        'email': user.email  # Добавляем email в ответ
    }

    # Возвращаем данные и токен
    return jsonify({
        'token': token,
        'user': user_data
    }), 200


# Добавьте эти функции в api.py

from models import Notification


# Получение списка уведомлений пользователя
@app.route('/api/notifications', methods=['GET'])
@token_required
def get_user_notifications(current_user):
    """Получение списка уведомлений текущего пользователя"""
    try:
        # Параметры фильтрации и пагинации
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        unread_only = request.args.get('unread_only', 'false').lower() == 'true'
        notification_type = request.args.get('type')

        # Строим запрос
        query = Notification.query.filter_by(user_id=current_user.id)

        # Фильтр по статусу прочтения
        if unread_only:
            query = query.filter_by(is_read=False)

        # Фильтр по типу уведомления
        if notification_type:
            query = query.filter_by(notification_type=notification_type)

        # Сортировка по времени создания (сначала новые)
        query = query.order_by(Notification.created_at.desc())

        # Выполняем запрос с пагинацией
        notifications = query.paginate(page=page, per_page=per_page)

        # Получаем количество непрочитанных уведомлений
        unread_count = Notification.query.filter_by(
            user_id=current_user.id,
            is_read=False
        ).count()

        # Формируем ответ
        return jsonify({
            'notifications': [n.to_dict() for n in notifications.items],
            'unread_count': unread_count,
            'total_count': notifications.total,
            'page': page,
            'per_page': per_page,
            'pages': notifications.pages,
            'has_next': notifications.has_next,
            'has_prev': notifications.has_prev,
            'success': True
        }), 200

    except Exception as e:
        print(f"Error getting notifications: {str(e)}")
        return jsonify({
            'message': f"Error: {str(e)}",
            'success': False
        }), 500


# Отметка уведомления как прочитанного
@app.route('/api/notifications/<int:notification_id>/read', methods=['POST'])
@token_required
def mark_notification_read(current_user, notification_id):
    """Отмечает уведомление как прочитанное"""
    try:
        notification = Notification.query.get_or_404(notification_id)

        # Проверяем, что уведомление принадлежит текущему пользователю
        if notification.user_id != current_user.id:
            return jsonify({
                'message': 'Access denied',
                'success': False
            }), 403

        # Отмечаем как прочитанное
        was_updated = notification.mark_as_read()
        db.session.commit()

        return jsonify({
            'message': 'Notification marked as read',
            'was_updated': was_updated,
            'success': True
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error marking notification as read: {str(e)}")
        return jsonify({
            'message': f"Error: {str(e)}",
            'success': False
        }), 500


# Отметка всех уведомлений как прочитанных
@app.route('/api/notifications/read-all', methods=['POST'])
@token_required
def mark_all_notifications_read(current_user):
    """Отмечает все уведомления пользователя как прочитанные"""
    try:
        # Получаем все непрочитанные уведомления пользователя
        notifications = Notification.query.filter_by(
            user_id=current_user.id,
            is_read=False
        ).all()

        # Отмечаем все как прочитанные
        now = datetime.utcnow()
        count = 0

        for notification in notifications:
            notification.is_read = True
            notification.read_at = now
            count += 1

        db.session.commit()

        return jsonify({
            'message': f'{count} notifications marked as read',
            'count': count,
            'success': True
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error marking all notifications as read: {str(e)}")
        return jsonify({
            'message': f"Error: {str(e)}",
            'success': False
        }), 500


# Удаление уведомления
@app.route('/api/notifications/<int:notification_id>', methods=['DELETE'])
@token_required
def delete_notification(current_user, notification_id):
    """Удаляет уведомление пользователя"""
    try:
        notification = Notification.query.get_or_404(notification_id)

        # Проверяем, что уведомление принадлежит текущему пользователю
        if notification.user_id != current_user.id:
            return jsonify({
                'message': 'Access denied',
                'success': False
            }), 403

        # Удаляем уведомление
        db.session.delete(notification)
        db.session.commit()

        return jsonify({
            'message': 'Notification deleted',
            'success': True
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error deleting notification: {str(e)}")
        return jsonify({
            'message': f"Error: {str(e)}",
            'success': False
        }), 500


# Получение количества непрочитанных уведомлений
@app.route('/api/notifications/unread-count', methods=['GET'])
@token_required
def get_unread_count(current_user):
    """Возвращает количество непрочитанных уведомлений пользователя"""
    try:
        unread_count = Notification.query.filter_by(
            user_id=current_user.id,
            is_read=False
        ).count()

        return jsonify({
            'unread_count': unread_count,
            'success': True
        }), 200

    except Exception as e:
        print(f"Error getting unread count: {str(e)}")
        return jsonify({
            'message': f"Error: {str(e)}",
            'success': False
        }), 500

@app.route('/api/user/profile', methods=['GET'])
@token_required
def get_profile(current_user):
    # Определяем роль
    role = current_user.role or ('admin' if current_user.is_admin else 'unknown')

    # Напрямую запрашиваем данные из базы данных, минуя ORM
    try:
        # Add email to the SQL query
        query = """
        SELECT 
            id, 
            username, 
            full_name,
            email,              role, 
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
        WHERE id = :user_id
        """

        with db.engine.connect() as connection:
            # Use named parameters with a dictionary
            result = connection.execute(db.text(query), {"user_id": current_user.id})
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
            # Safely check if email attribute exists
            'email': getattr(current_user, 'email', None),
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
        'email': user_dict.get('email'),  # Use .get() for safe access
        'fullName': user_dict['full_name'] or (teacher_info['name'] if teacher_info else ''),
        'role': user_dict['role'],
        'group': user_dict['group'],
        'faculty': user_dict['faculty'],
        'department': teacher_info['department'] if teacher_info else None,
        'position': teacher_info['position'] if teacher_info else None,
        'verificationStatus': user_dict['verification_status'] or 'verified',
        'studentCardImage': user_dict['student_card_image'],
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
            schedule_query = "SELECT course FROM schedule WHERE group_name = :group_name LIMIT 1"
            with db.engine.connect() as connection:
                schedule_result = connection.execute(db.text(schedule_query), {"group_name": user_dict['group']})
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
    """Send push notification using Firebase Cloud Messaging or Expo Push service"""
    # Создаем безопасную копию data для вывода в логи
    safe_data = {**data} if data else {}
    if 'token' in safe_data:
        safe_data['token'] = safe_data['token'][:10] + '...' if safe_data['token'] else None

    print(f"🔔 Запрос на отправку push-уведомления:")
    print(f"   - Заголовок: {title}")
    print(f"   - Сообщение: {message}")
    print(f"   - Данные: {safe_data}")

    # Получаем тип токена из данных, если он есть
    token_type = safe_data.get('tokenType', 'unknown')
    print(f"   - Тип токена: {token_type}")

    # Проверяем тип токена напрямую по его формату
    is_expo_token = token.startswith('ExponentPushToken[')
    is_jwt_token = token.count('.') == 2 and token.startswith('ey')

    # Если токен - Expo токен или тип указан явно как 'expo'
    if is_expo_token or token_type == 'expo':
        print(f"   📱 Обнаружен Expo токен, используем Expo Push API")
        try:
            # Импортируем необходимые модули
            import uuid
            import requests
            import json
            from datetime import datetime

            # Формируем запрос для Expo Push API
            expo_message = {
                'to': token,
                'title': title,
                'body': message,
                'data': data or {},
                'sound': 'default'
            }

            # Для iOS добавляем дополнительные параметры
            if data and data.get('platform') == 'ios':
                expo_message.update({
                    'badge': 1,
                    'priority': 'high',
                    '_displayInForeground': True
                })

            print(f"   📤 Отправка Expo уведомления: {json.dumps(expo_message)[:100]}...")

            # Отправляем уведомление через Expo Push API
            response = requests.post(
                'https://exp.host/--/api/v2/push/send',
                json=expo_message,
                headers={
                    'Accept': 'application/json',
                    'Accept-encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                timeout=10
            )

            # Проверяем ответ
            if response.status_code == 200:
                response_data = response.json()
                print(f"   ✅ Expo Push уведомление отправлено: {response_data}")

                # ИСПРАВЛЕНИЕ: Проверка структуры ответа от Expo API
                if (response_data.get('data') and
                        isinstance(response_data['data'], dict) and
                        response_data['data'].get('status') == 'ok'):
                    # Успешный ответ в новом формате (одиночное сообщение)
                    ticket_id = response_data['data'].get('id', str(uuid.uuid4()))
                    return {"success": True, "message_id": f"expo_{ticket_id}"}
                elif (response_data.get('data') and
                      isinstance(response_data['data'], list) and
                      len(response_data['data']) > 0 and
                      response_data['data'][0].get('status') == 'ok'):
                    # Успешный ответ в старом формате (список сообщений)
                    ticket_id = response_data['data'][0].get('id', str(uuid.uuid4()))
                    return {"success": True, "message_id": f"expo_{ticket_id}"}
                else:
                    # Если мы не можем определить статус, но получили 200 OK
                    print(f"   ⚠️ Необычный формат ответа Expo API, но статус 200. Считаем успехом.")
                    return {"success": True, "message_id": f"expo_{str(uuid.uuid4())}"}
            else:
                print(f"   ❌ Ошибка отправки через Expo: {response.status_code}, {response.text}")
                return {"success": False, "error": f"Expo API error: {response.status_code}"}
        except Exception as e:
            print(f"   ❌ Ошибка при отправке через Expo: {str(e)}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}

    # Проверяем, что это не JWT токен аутентификации
    elif is_jwt_token:
        print(f"   ❌ Ошибка: Получен JWT токен аутентификации вместо push-токена")
        return {"success": False, "error": "The token is a JWT authentication token, not a push token"}

    # Проверяем, доступен ли Firebase для FCM токенов
    elif not FIREBASE_AVAILABLE:
        print(f"   ❌ Firebase Admin SDK не доступен. Уведомление не отправлено.")
        return {"success": False, "message": "Firebase недоступен"}

    # Для токенов APNs нужна специальная обработка
    elif token_type == 'apns':
        print(f"   ⚠️ Получен нативный APNs токен, который не может быть использован Firebase напрямую")
        print(f"   ℹ️ Рекомендуется использовать Expo токены для iOS устройств")
        return {"success": False, "error": "APNs tokens not supported directly. Use Expo tokens for iOS"}

    # Для остальных типов используем Firebase FCM
    else:
        try:
            print(f"   📤 Отправка уведомления через Firebase Admin SDK")

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

            # Настройки для iOS (через FCM)
            apns_config = messaging.APNSConfig(
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(
                        content_available=True,
                        sound='default',
                        badge=1,
                        mutable_content=True,
                        alert=messaging.ApsAlert(
                            title=title,
                            body=message
                        )
                    )
                ),
                headers={
                    'apns-priority': '10',
                    'apns-push-type': 'alert'
                }
            )

            # Подготовка data
            if data is None:
                data = {}

            # FCM требует строковые значения
            fcm_data = {}
            for key, value in data.items():
                fcm_data[str(key)] = str(value) if value is not None else ""

            # Создаем объект Message
            message_obj = messaging.Message(
                token=token,
                notification=notification,
                android=android_config,
                apns=apns_config,
                data=fcm_data
            )

            print(f"   📝 Сформирован объект сообщения для FCM")

            # Отправляем сообщение
            response = messaging.send(message_obj)
            print(f"   ✅ FCM уведомление успешно отправлено: {response}")
            return {"success": True, "message_id": response}
        except Exception as e:
            print(f"   ❌ Ошибка при отправке push-уведомления: {str(e)}")
            print(f"   - Тип ошибки: {type(e).__name__}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}



def create_and_send_notification(recipient_id, title, body, notification_type, sender_id=None, data=None,
                                 related_type=None, related_id=None):
    """
    Создает запись уведомления в БД и отправляет push-уведомление на устройства пользователя

    Args:
        recipient_id (int): ID получателя уведомления
        title (str): Заголовок уведомления
        body (str): Текст уведомления
        notification_type (str): Тип уведомления ('ticket', 'chat', 'system', и т.д.)
        sender_id (int, optional): ID отправителя (None если системное уведомление)
        data (dict, optional): Дополнительные данные для уведомления
        related_type (str, optional): Тип связанной сущности ('ticket', 'schedule', и т.д.)
        related_id (int, optional): ID связанной сущности

    Returns:
        dict: Словарь с результатами {'db_success': bool, 'push_success': bool, 'notification_id': int}
    """
    result = {
        'db_success': False,
        'push_success': False,
        'notification_id': None,
        'push_receipts': []
    }

    try:
        # Создаем запись в БД
        notification = Notification.create_notification(
            user_id=recipient_id,
            title=title,
            body=body,
            notification_type=notification_type,
            sender_id=sender_id,
            data=data,
            related_type=related_type,
            related_id=related_id
        )

        db.session.add(notification)
        db.session.commit()

        result['db_success'] = True
        result['notification_id'] = notification.id

        # Получаем токены устройств получателя
        device_tokens = DeviceToken.query.filter_by(user_id=recipient_id).all()

        if device_tokens:
            # Подготавливаем данные для push-уведомления
            push_data = data.copy() if data else {}

            # Добавляем дополнительные поля для push-уведомления
            push_data.update({
                'notification_id': notification.id,
                'type': notification_type,
                'sender_id': sender_id,
                'timestamp': datetime.utcnow().isoformat()
            })

            # Добавляем информацию о связанной сущности, если есть
            if related_type and related_id:
                push_data.update({
                    'related_type': related_type,
                    'related_id': related_id
                })

            # Отправляем push-уведомление на каждое устройство пользователя
            successful_deliveries = 0

            for token_obj in device_tokens:
                push_result = send_push_message(
                    token_obj.token,
                    title,
                    body,
                    push_data
                )

                result['push_receipts'].append({
                    'device_id': token_obj.id,
                    'success': push_result.get('success', False),
                    'error': push_result.get('error')
                })

                if push_result.get('success'):
                    successful_deliveries += 1

            if successful_deliveries > 0:
                result['push_success'] = True

        return result

    except Exception as e:
        if 'notification_id' in result and result['notification_id']:
            # Если запись в БД была создана, но возникла ошибка при отправке push,
            # оставляем запись в БД и логируем ошибку
            db.session.commit()
            print(f"Error sending push notification, but DB record was created: {str(e)}")
        else:
            # Если ошибка возникла до создания записи в БД, откатываем транзакцию
            db.session.rollback()
            print(f"Error creating notification record: {str(e)}")

        result['error'] = str(e)
        return result


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





# Enhanced device registration endpoint for api.py
# Add or replace this function in your api.py file

@app.route('/api/device/register', methods=['POST'])
@token_required
def register_device(current_user):
    """Enhanced device token registration with better logging and error handling"""
    try:
        print(f"📱 Device registration attempt for user_id={current_user.id}")

        # Get request data with thorough validation
        data = request.json
        if not data:
            print(f"📱 Missing request data for user_id={current_user.id}")
            return jsonify({'message': 'No data provided', 'success': False}), 400

        # Log all incoming data (sensitive parts obscured)
        token_preview = data.get('token', '')[:15] + '...' if data.get('token') else 'None'
        print(f"📱 Received token data: token={token_preview}, "
              f"platform={data.get('platform', 'unknown')}, "
              f"device={data.get('device', 'unknown')}, "
              f"token_type={data.get('tokenType', 'unknown')}")

        # Validate token
        token = data.get('token')
        if not token:
            print(f"📱 Token not provided for user_id={current_user.id}")
            return jsonify({'message': 'Token not provided', 'success': False}), 400

        device = data.get('device', 'Unknown device')
        platform = data.get('platform', 'unknown')
        token_type = data.get('tokenType', 'unknown')

        # Check if token already exists
        existing_token = DeviceToken.query.filter_by(token=token).first()

        if existing_token:
            # Update existing token
            print(f"📱 Updating existing token for user_id={current_user.id}")
            existing_token.user_id = current_user.id
            existing_token.device_name = device
            existing_token.platform = platform
            existing_token.token_type = token_type
            existing_token.last_used_at = datetime.datetime.utcnow()
            action = 'updated'
        else:
            # Create new token record
            print(f"📱 Creating new token for user_id={current_user.id}")
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
            action = 'registered'

        # Commit changes with error handling
        try:
            db.session.commit()
            print(f"📱 Successfully {action} token for user_id={current_user.id}")
            return jsonify({
                'message': f'Device token {action}',
                'success': True,
                'action': action
            }), 200
        except Exception as db_error:
            db.session.rollback()
            print(f"📱 Database error during token {action}: {str(db_error)}")
            return jsonify({
                'message': f'Database error: {str(db_error)}',
                'success': False,
                'error': 'database_error'
            }), 500

    except Exception as e:
        print(f"📱 Unexpected error registering token for user_id={current_user.id}: {str(e)}")
        return jsonify({
            'message': f'Error: {str(e)}',
            'success': False,
            'error': 'unexpected_error'
        }), 500


@app.route('/api/device/unregister', methods=['POST'])
@token_required
def unregister_device(current_user):
    """Improved device token unregistration with better logging and error handling"""
    try:
        print(f"📱 Device unregistration attempt for user_id={current_user.id}")

        data = request.json

        if not data:
            print(f"📱 Missing request data for unregistration, user_id={current_user.id}")
            return jsonify({'message': 'No data provided', 'success': False}), 400

        token = data.get('token')
        if not token:
            print(f"📱 Token not provided for unregistration, user_id={current_user.id}")

            # Special case: unregister all tokens for this user
            if data.get('unregister_all'):
                print(f"📱 Unregistering ALL tokens for user_id={current_user.id}")
                deleted = DeviceToken.query.filter_by(user_id=current_user.id).delete()
                db.session.commit()
                return jsonify({
                    'message': f'Removed all device tokens ({deleted} tokens)',
                    'success': True,
                    'deleted_count': deleted
                }), 200

            return jsonify({'message': 'Token not provided', 'success': False}), 400

        # Find and delete the token
        token_preview = token[:15] + '...' if len(token) > 15 else token
        print(f"📱 Unregistering token: {token_preview} for user_id={current_user.id}")

        device_token = DeviceToken.query.filter_by(token=token).first()
        if device_token:
            # Extra security: Only allow deletion if token belongs to current user
            if device_token.user_id != current_user.id:
                print(f"📱 Token belongs to user_id={device_token.user_id}, not current user={current_user.id}")
                return jsonify({
                    'message': 'You are not authorized to unregister this token',
                    'success': False
                }), 403

            # Delete the token
            db.session.delete(device_token)
            db.session.commit()
            print(f"📱 Successfully unregistered token for user_id={current_user.id}")

            return jsonify({
                'message': 'Device token unregistered',
                'success': True,
                'deleted_count': 1
            }), 200
        else:
            print(f"📱 Token not found for unregistration, user_id={current_user.id}")
            return jsonify({
                'message': 'Token not found',
                'success': False
            }), 404

    except Exception as e:
        db.session.rollback()
        print(f"📱 Error unregistering device token for user_id={current_user.id}: {str(e)}")
        return jsonify({
            'message': f'Error: {str(e)}',
            'success': False
        }), 500


@app.route('/api/device/test-notification', methods=['POST'])
@token_required
def test_notification(current_user):
    """Improved test notification endpoint with better support for different token types"""
    try:
        print(f"🧪 Запрос на тестовое уведомление от user_id={current_user.id}")
        print(f"   - Данные запроса: {request.json}")

        data = request.json
        token = data.get('token')
        token_type = data.get('tokenType', 'unknown')
        device = data.get('device', 'Unknown device')
        platform = data.get('platform', 'unknown')

        if not token:
            print(f"   ❌ Отсутствует токен в запросе")
            return jsonify({
                'message': 'Token not provided',
                'success': False
            }), 400

        # Детальный вывод информации о токене
        token_preview = token[:15] + '...' if len(token) > 15 else token
        print(f"   📱 Тест уведомления для:")
        print(f"   - Токен: {token_preview}")
        print(f"   - Тип: {token_type}")
        print(f"   - Платформа: {platform}")
        print(f"   - Устройство: {device}")

        # Добавляем тип токена в данные для send_push_message
        test_data = {
            'type': 'test',
            'timestamp': str(datetime.datetime.now().timestamp()),
            'device': device,
            'platform': platform,
            'tokenType': token_type  # Важно передать тип токена!
        }

        # Для iOS добавляем специфичные данные
        if platform.lower() == 'ios':
            test_data.update({
                'sound': 'default',
                'badge': '1',
                'priority': 'high',
                'content_available': '1'
            })

        # Отправляем уведомление через обновленную функцию (без проверки через validate_fcm_token)
        result = send_push_message(
            token,
            'Тестовое уведомление',
            f'Это тестовое уведомление для {platform} устройства',
            test_data
        )

        print(f"   🔚 Результат отправки тестового уведомления: {result}")

        if result.get('success'):
            return jsonify({
                'message': 'Тестовое уведомление отправлено успешно',
                'success': True,
                'message_id': result.get('message_id')
            }), 200
        else:
            return jsonify({
                'message': f"Ошибка отправки уведомления: {result.get('error')}",
                'success': False,
                'error': result.get('error')
            }), 500

    except Exception as e:
        print(f"   ❌ Неожиданная ошибка при обработке тестового уведомления: {str(e)}")
        import traceback
        traceback.print_exc()
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

                # Add email column if it doesn't exist
                if 'email' not in column_names:
                    print("Adding missing email column to user table")
                    connection.execute(
                        db.text("ALTER TABLE user ADD COLUMN email VARCHAR(120) DEFAULT NULL UNIQUE"))

                connection.commit()

            print("База данных успешно обновлена")
        except Exception as e:
            print(f"Ошибка при обновлении базы данных: {str(e)}")
    app.run(debug=True, host='0.0.0.0', port=5001)