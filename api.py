
import datetime
import os
import uuid
from functools import wraps
from urllib.parse import unquote, quote
import re
import html
import unicodedata
from flask import request
import firebase_admin
import jwt
import requests
from bs4 import BeautifulSoup
from firebase_admin import credentials, auth, messaging
from flask import Flask, Response, request, jsonify, send_from_directory, session
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

from db import db
from models import (
    Ticket, TicketMessage, TicketAttachment,
    User, Teacher, VerificationLog,
    Schedule, ScheduleTeacher, DeviceToken,
    Notification
)

# === Configuration & Initialization === #

app = Flask(__name__)
CORS(app)

app.config.from_object('config')

UPLOAD_FOLDER = 'uploads'
STUDENT_CARDS_FOLDER = os.path.join(UPLOAD_FOLDER, 'student_cards')
os.makedirs(STUDENT_CARDS_FOLDER, exist_ok=True)
TICKET_ATTACHMENTS_FOLDER = os.path.join(UPLOAD_FOLDER, 'ticket_attachments')
os.makedirs(TICKET_ATTACHMENTS_FOLDER, exist_ok=True)

app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

db.init_app(app)

# Firebase initialization block
FIREBASE_AVAILABLE = False
try:
    print("📱 Попытка инициализации Firebase Admin SDK")
    firebase_config_path = None

    def find_firebase_config():
        """Searches for the Firebase config file in various paths."""
        possible_paths = [
            'firebase.json',
            '../firebase.json',
            os.path.join(os.path.dirname(__file__), 'firebase.json'),
            '/app/firebase.json',
            os.path.expanduser('~/firebase.json')
        ]
        for path in possible_paths:
            if os.path.exists(path):
                print(f"   ✅ Found Firebase config file: {path}")
                return path
        return None

    firebase_config_path = find_firebase_config()

    if firebase_config_path:
        print(f"   - Using config file: {firebase_config_path}")
        cred = credentials.Certificate(firebase_config_path)
        firebase_admin.initialize_app(cred)
        print("   ✅ Firebase Admin SDK initialized successfully.")
        FIREBASE_AVAILABLE = True
    else:
        print("   ⚠️ firebase.json not found, attempting initialization via environment variables.")
        try:
            firebase_admin.initialize_app()
            print("   ✅ Firebase Admin SDK initialized successfully via environment variables.")
            FIREBASE_AVAILABLE = True
        except Exception as env_error:
            print(f"   ❌ Failed to initialize via environment variables: {str(env_error)}")
            raise # Propagate the error if env init also fails

except Exception as e:
    print(f"   ❌ ERROR initializing Firebase Admin SDK: {str(e)}")
    print(f"   - Error type: {type(e).__name__}")
    import traceback
    traceback.print_exc()
    FIREBASE_AVAILABLE = False
    print("   ⚠️ FCM notifications are disabled due to initialization error.")
    print("   ℹ️ Expo notifications will function independently.")


# === Authentication & Authorization Helpers === #

def token_required(f):
    """Decorator to protect routes that require a valid JWT token."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]

        if not token:
            return jsonify({'message': 'Token is missing'}), 401

        try:
            payload = jwt.decode(token, app.config.get('SECRET_KEY'), algorithms=['HS256'])
            user_id = payload['sub']
            current_user = User.query.get(user_id)

            if not current_user:
                return jsonify({'message': 'User not found'}), 401

        except jwt.ExpiredSignatureError:
            return jsonify({'message': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'message': 'Invalid token'}), 401
        except Exception as e:
            print(f"Error during token decoding: {str(e)}")
            return jsonify({'message': 'Token processing error'}), 500

        return f(current_user, *args, **kwargs)

    return decorated


def create_token(user_id):
    """Creates a JWT authentication token."""
    payload = {
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=app.config.get('TOKEN_EXPIRATION_DAYS', 7)),
        'iat': datetime.datetime.utcnow(),
        'sub': str(user_id)
    }
    secret_key = app.config.get('SECRET_KEY')
    if not secret_key:
        print("[CRITICAL ERROR] SECRET_KEY is missing during token creation!")
        raise ValueError("Server configuration error: SECRET_KEY is missing.")

    return jwt.encode(
        payload,
        secret_key,
        algorithm='HS256'
    )


def username_exists(username):
    """Checks if a username already exists in the database."""
    try:
        return db.session.query(User).filter_by(username=username).first() is not None
    except Exception as e:
        print(f"Error checking username: {str(e)}")
        return False


def generate_username(full_name, group=None, role=None, department=None):
    """Generates a username based on full name and optional details."""
    if not full_name or full_name.strip() == '':
        return ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))

    if re.search('[а-яА-Я]', full_name):
        try:
            transliterated = transliterate.translit(full_name, 'ru', reversed=True)
            transliterated = ''.join(c for c in unicodedata.normalize('NFD', transliterated)
                                     if unicodedata.category(c) != 'Mn')
            clean_name = transliterated
        except:
            clean_name = ''.join(c for c in full_name if c.isalnum() or c.isspace())
    else:
        clean_name = ''.join(c for c in full_name if c.isalnum() or c.isspace())

    name_parts = clean_name.split()

    if not name_parts:
        return ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))

    if role == 'teacher':
        if len(name_parts) >= 2:
            lastname = name_parts[-1].lower()
            firstname = name_parts[0].lower()
            dept_code = ""
            if department:
                dept_words = department.split()
                if dept_words:
                    dept_code = ''.join(word[0].lower() for word in dept_words if word)
                    dept_code = dept_code[:3]
            username = f"{lastname}.{firstname[:3]}{dept_code}" if len(lastname) > 2 and len(firstname) > 2 else f"{lastname}.{firstname}{dept_code}"
        else:
            username = f"{name_parts[0].lower()}"
    else:
        if len(name_parts) >= 2:
            firstname = name_parts[0].lower()
            lastname = name_parts[-1].lower()
            first_part = firstname[:min(3, len(firstname))]
            last_part = lastname[:min(4, len(lastname))]
            group_code = ""
            if group:
                match = re.search(r'\d+', group)
                if match:
                    group_code = match.group()[:2]
                else:
                    clean_group = ''.join(c for c in group if c.isalnum())
                    group_code = clean_group[:3].lower()
            username = f"{first_part}_{last_part}"
            if group_code:
                username = f"{username}{group_code}"
        else:
            name = name_parts[0].lower()
            username = f"{name[:6]}"

    random_suffix = ''.join(random.choices(string.digits, k=2))
    username = f"{username}{random_suffix}"
    username = ''.join(c for c in username if c.isalnum() or c == '_' or c == '.')
    if len(username) > 20:
        username = username[:20]

    return username


# === News & Image Proxy === #

def clean_text(text):
    """Cleans text from invisible characters and excess whitespace."""
    if not text:
        return ""
    text = re.sub(r'[\u200B-\u200D\uFEFF]', '', text)
    text = html.unescape(text)
    text = text.replace('\u200b', '')
    return text.strip()


def process_text_with_formatting(html_text):
    """Processes HTML text, preserving basic formatting (bold, italic)."""
    if not html_text:
        return ""
    if not isinstance(html_text, str):
        html_text = str(html_text)
    html_text = re.sub(r'<span class="image-marker"[^>]*>.*?</span>', '', html_text)
    html_text = re.sub(r'<(strong|b)>(.*?)</(strong|b)>', r'**\2**', html_text, flags=re.DOTALL)
    html_text = re.sub(r'<(em|i)>(.*?)</(em|i)>', r'_\2_', html_text, flags=re.DOTALL)
    html_text = re.sub(r'<[^>]+>', '', html_text)
    html_text = html.unescape(html_text)
    html_text = re.sub(r'\s+', ' ', html_text).strip()
    return html_text


def parse_news_detail_for_mobile(html_content):
    """Parses news HTML content into structured blocks for mobile display."""
    if not html_content:
        return []
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        content_blocks = []
        all_images = soup.find_all('img')
        image_positions = {}

        for img in all_images:
            if img.get('src'):
                img_id = f"img_{len(image_positions)}"
                image_positions[img_id] = {
                    'src': img.get('src'),
                    'processed': False
                }
                marker = soup.new_tag('span')
                marker['class'] = 'image-marker'
                marker['data-image-id'] = img_id
                img.replace_with(marker)

        for element in soup.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table']):
            tag_name = element.name
            if tag_name == 'p':
                element_text = str(element)
                markers = element.find_all('span', class_='image-marker')
                if markers:
                    text_before = process_text_with_formatting(str(element))
                    if text_before.strip():
                        content_blocks.append({
                            "type": "text",
                            "content": text_before
                        })
                    for marker in markers:
                        img_id = marker.get('data-image-id')
                        if img_id and img_id in image_positions and not image_positions[img_id]['processed']:
                            content_blocks.append({
                                "type": "image",
                                "src": image_positions[img_id]['src']
                            })
                            image_positions[img_id]['processed'] = True
                else:
                    formatted_text = process_text_with_formatting(str(element))
                    if formatted_text.strip():
                        content_blocks.append({
                            "type": "text",
                            "content": formatted_text
                        })

            elif tag_name.startswith('h'):
                level = int(tag_name[1])
                content_blocks.append({
                    "type": "header",
                    "level": level,
                    "content": process_text_with_formatting(element.get_text())
                })

            elif tag_name == 'ul' or tag_name == 'ol':
                list_items = []
                for li in element.find_all('li', recursive=False):
                    list_items.append(process_text_with_formatting(li.get_text()))

                content_blocks.append({
                    "type": "list",
                    "list_type": "ordered" if tag_name == 'ol' else "unordered",
                    "items": list_items
                })

            elif tag_name == 'table':
                table_images = element.find_all('span', class_='image-marker')
                for marker in table_images:
                    img_id = marker.get('data-image-id')
                    if img_id and img_id in image_positions and not image_positions[img_id]['processed']:
                        content_blocks.append({
                            "type": "image",
                            "src": image_positions[img_id]['src']
                        })
                        image_positions[img_id]['processed'] = True
                table_text = element.get_text().strip()
                if table_text:
                    content_blocks.append({
                        "type": "text",
                        "content": "Таблица: " + table_text
                    })

        for img_id, img_info in image_positions.items():
            if not img_info['processed']:
                content_blocks.append({
                    "type": "image",
                    "src": img_info['src']
                })
                img_info['processed'] = True

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

        if current_text:
            merged_blocks.append({
                "type": "text",
                "content": current_text
            })

        return merged_blocks

    except Exception as e:
        print(f"Error parsing HTML content: {str(e)}")
        return [{
            "type": "text",
            "content": BeautifulSoup(html_content, 'html.parser').get_text()
        }]


def update_api_response_with_content_blocks(api_response, host_url):
    """Updates the API response with parsed content blocks and proxied image URLs."""
    if not api_response or not api_response.get('content_html'):
        return api_response
    try:
        content_blocks = parse_news_detail_for_mobile(api_response['content_html'])
        for block in content_blocks:
            if block['type'] == 'image' and block.get('src'):
                src = block['src']
                if src.startswith('https'):
                    original_url = src
                else:
                    original_url = f"https://melsu.ru/{src.lstrip('/')}"
                encoded_url = quote(original_url)
                proxy_url = f"{host_url}/api/image-proxy?url={encoded_url}"
                block['src'] = proxy_url
        api_response['content_blocks'] = content_blocks
        return api_response
    except Exception as e:
        print(f"Error creating content blocks: {str(e)}")
        return api_response


@app.route('/api/news', methods=['GET'])
def get_news():
    """Get news from the university website with image proxy."""
    try:
        page = request.args.get('page', 1, type=int)

        # 1) HTTPS‑хост вместо request.host_url
        host_url = get_host_url()

        url = f"https://melsu.ru/news?page={page}"
        response = requests.get(url, timeout=15)

        if response.status_code != 200:
            return jsonify({"message": "Failed to fetch news", "success": False}), 500

        soup = BeautifulSoup(response.text, 'html.parser')
        news_items = []
        news_boxes = soup.select('.news-box, .first-news-box')

        for news_box in news_boxes:
            try:
                link = news_box.select_one('a')
                if not link:
                    continue
                href = link.get('href')
                if not href:
                    continue

                match = re.search(r'/news/show/(\d+)', href)
                if not match:
                    continue
                news_id = match.group(1)

                # ── картинка ──────────────────────────────────────────────
                image_tag = news_box.select_one('img')
                image_url = None
                original_src = None
                if image_tag and image_tag.get('src'):
                    original_src = image_tag['src']
                    if original_src.startswith('https'):
                        original_url = original_src
                    else:
                        original_url = f"https://melsu.ru/{original_src.lstrip('/')}"
                    encoded_url = quote(original_url)
                    image_url = f"{host_url}/api/image-proxy?url={encoded_url}"

                # ── остальные поля ───────────────────────────────────────
                category_tag = news_box.select_one('.meta-category')
                category = clean_text(category_tag.text.strip()) if category_tag else None

                date_tag = news_box.select_one('.bi-calendar2-week')
                date = clean_text(date_tag.parent.text.strip()) if date_tag and date_tag.parent else None

                title_container = (
                    news_box.select_one('h2')
                    or news_box.select_one('h3')
                    or news_box.select_one('.title')
                )
                title = clean_text(title_container.text.strip()) if title_container else None

                description = None
                description_selectors = (
                    ['.line-clamp-10 p', '.line-clamp-10', 'p']
                    if "first-news-box" in news_box.get('class', [])
                    else ['.description-news p', '.description-news', '.line-clamp-3', 'p']
                )
                for selector in description_selectors:
                    for elem in news_box.select(selector):
                        text = elem.text.strip()
                        if text and text != title:
                            description = clean_text(text)
                            break
                    if description:
                        break

                news_url = href if href.startswith('https') else f"https://melsu.ru/{href.lstrip('/')}"

                news_items.append(
                    {
                        "id": news_id,
                        "title": title,
                        "category": category,
                        "date": date,
                        "description": description,
                        "image_url": image_url,
                        "url": news_url,
                        "_debug_original_src": original_src,
                    }
                )
            except Exception as item_error:
                print(f"Error processing news item: {str(item_error)}")
                continue

        # ── пагинация на сайте часто «сломана», поэтому просто всегда has_next_page=True
        has_next_page = True

        return (
            jsonify(
                {
                    "news": news_items,
                    "page": page,
                    "has_next_page": has_next_page,
                    "success": True,
                }
            ),
            200,
        )

    except Exception as e:
        print(f"Error getting news: {str(e)}")
        return jsonify({"message": f"Error: {str(e)}", "success": False}), 500


def get_host_url(force_https: bool = True) -> str:
    """
    Возвращает host‑URL без завершающего «/».
    Если force_https=True и схема оказалась http, подменяет её на https.
    """
    host_url = request.host_url.rstrip('/')
    if force_https and host_url.startswith('http://'):
        host_url = 'https://' + host_url[len('http://'):]
    return host_url

@app.route('/api/news/<int:news_id>', methods=['GET'])
def get_news_detail(news_id):
    """Get detailed news article by ID with image proxy and improved content structure."""
    try:
        # 1) HTTPS‑хост
        host_url = get_host_url()

        url = f"https://melsu.ru/news/show/{news_id}"
        response = requests.get(url, timeout=15)

        if response.status_code != 200:
            return jsonify({"message": "News article not found", "success": False}), 404

        soup = BeautifulSoup(response.text, "html.parser")

        title_tag = soup.select_one("h1.text-4xl") or soup.select_one("h1")
        title = clean_text(title_tag.text.strip()) if title_tag else None

        date_tag = soup.select_one(".bi-calendar2-week")
        date = clean_text(date_tag.parent.text.strip()) if date_tag and date_tag.parent else None

        content_div = soup.select_one(".content-news")

        result = {
            "id": str(news_id),
            "title": title,
            "date": date,
            "category": None,
            "content_html": None,
            "content_text": None,
            "images": [],
            "success": True,
        }

        category_tag = soup.select_one(".meta-category")
        if category_tag:
            result["category"] = clean_text(category_tag.text.strip())

        # ── контент и заголовочная картинка ────────────────────────────
        if content_div:
            result["content_html"] = str(content_div)
            result["content_text"] = BeautifulSoup(str(content_div), "html.parser").get_text().strip()

            header_img = soup.select_one(".img-news-box img") or soup.select_one(".header-image img")
            if header_img and header_img.get("src"):
                src = header_img["src"]
                original_url = src if src.startswith("https") else f"https://melsu.ru/{src.lstrip('/')}"
                encoded_url = quote(original_url)
                proxy_url = f"{host_url}/api/image-proxy?url={encoded_url}"
                result["images"].append(proxy_url)

            # 2) content_blocks со «заставкой» https‑прокси
            result = update_api_response_with_content_blocks(result, host_url)

        # ── навигация «пред./след.» ─────────────────────────────────────
        prev_article, next_article = None, None
        navigation_links = soup.select('a[href^="/news/show/"]')
        for link in navigation_links:
            link_text = link.text.strip().lower()
            href = link.get("href", "")
            match = re.search(r"/news/show/(\d+)", href)
            if not match:
                continue
            link_id = match.group(1)

            if any(x in link_text for x in ("предыдущ", "пред", "←")):
                title_span = link.select_one("span")
                prev_article = {"id": link_id, "title": (clean_text(title_span.text) if title_span else "Предыдущая новость")}
            elif any(x in link_text for x in ("следующ", "след", "→")):
                title_span = link.select_one("span")
                next_article = {"id": link_id, "title": (clean_text(title_span.text) if title_span else "Следующая новость")}

        result["prev_article"] = prev_article
        result["next_article"] = next_article

        return jsonify(result), 200

    except Exception as e:
        print(f"Error getting news detail: {str(e)}")
        return jsonify({"message": f"Error: {str(e)}", "success": False}), 500



@app.route('/api/image-proxy', methods=['GET'])
def image_proxy():
    """Proxy for images from the university website."""
    try:
        image_url = request.args.get('url')
        if not image_url:
            return jsonify({"message": "URL parameter is required"}), 400

        try:
            image_url = unquote(image_url)
        except:
            pass

        if not image_url.startswith(('https://', 'https://')):
            if not image_url.startswith('/'):
                image_url = f"/{image_url}"
            image_url = f"https://melsu.ru{image_url}"

        print(f"Proxying image from: {image_url}")

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://melsu.ru/',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
        }

        response = requests.get(image_url, stream=True, headers=headers, timeout=10)

        if response.status_code != 200:
            print(f"Failed to fetch image, status code: {response.status_code}")
            return jsonify({"message": "Failed to fetch image"}), response.status_code

        content_type = response.headers.get('Content-Type', 'image/jpeg')

        return Response(
            response.content,
            content_type=content_type,
            headers={
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=86400',
                'Content-Length': str(len(response.content))
            }
        )

    except Exception as e:
        print(f"Error in image proxy: {str(e)}")
        return jsonify({"message": f"Error: {str(e)}"}), 500


# === Authentication Endpoints === #

@app.route('/api/auth/firebase-token', methods=['POST'])
@token_required
def get_firebase_token(current_user):
    """Gets a custom Firebase authentication token."""
    try:
        if not FIREBASE_AVAILABLE:
             return jsonify({'message': 'Firebase Admin SDK is not initialized'}), 500

        firebase_token = auth.create_custom_token(str(current_user.id))

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


@app.route('/api/auth/register', methods=['POST'])
def register():
    """Registers a new user."""
    data = request.json
    required_fields = ['password', 'fullName', 'role']
    for field in required_fields:
        if field not in data:
            return jsonify({'message': f'Поле {field} обязательно'}), 400

    email = data.get('email', '')
    if email and '@' not in email:
        return jsonify({'message': 'Некорректный формат email'}), 400

    if 'username' not in data or not data['username']:
        username = generate_username(data['fullName'], data.get('group'), data.get('role'))
        attempt = 0
        base_username = username
        while username_exists(username):
            attempt += 1
            username = f"{base_username}{attempt}"
    else:
        username = data['username']

    if username_exists(username):
        return jsonify({'message': 'Пользователь с таким логином уже существует'}), 400

    try:
        new_user = User(
            username=username,
            password=data['password'],
            email=email,
            is_admin=False
        )
        new_user.role = data.get('role')
        new_user.full_name = data.get('fullName')
        new_user.group = data.get('group')
        new_user.faculty = data.get('faculty')

        if 'speciality' in data and data['speciality']:
            speciality_data = data['speciality']
            new_user.speciality_id = speciality_data.get('id')
            new_user.speciality_code = speciality_data.get('code')
            new_user.speciality_name = speciality_data.get('name')
            new_user.study_form = speciality_data.get('form')
            new_user.study_form_name = speciality_data.get('formName')
            if not new_user.faculty and speciality_data.get('faculty'):
                new_user.faculty = speciality_data.get('faculty')

        if data.get('role') == 'student':
            new_user.verification_status = 'unverified'
        elif data.get('role') == 'teacher':
            new_user.verification_status = 'verified'

        db.session.add(new_user)
        db.session.commit()
        token = create_token(new_user.id)

        return jsonify({
            'message': 'Пользователь успешно создан',
            'token': token,
            'user': {
                'id': new_user.id,
                'username': new_user.username,
                'email': email,
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
        if "field 'email' doesn't have a default value" in error_details:
            return jsonify({'message': 'Ошибка при сохранении email. Пожалуйста, попробуйте заполнить поле email или сообщите администратору.'}), 500
        return jsonify({'message': 'Ошибка при создании пользователя','error': error_details}), 500


@app.route('/api/auth/login', methods=['POST'])
def login():
    """Authenticates a user and returns a JWT token."""
    data = request.json
    if not data or not data.get('password'):
        return jsonify({'message': 'Необходимо указать пароль'}), 400
    if not data.get('username') and not data.get('email'):
        return jsonify({'message': 'Необходимо указать логин или email'}), 400

    user = None
    if data.get('email'):
        user = User.query.filter_by(email=data['email']).first()
    else:
        user = User.query.filter_by(username=data['username']).first()

    if not user or not user.check_password(data['password']):
        return jsonify({'message': 'Неверный логин/email или пароль'}), 401

    token = create_token(user.id)
    role = user.role or ('admin' if user.is_admin else 'unknown')
    teacher_info = None
    if role == 'teacher':
        teacher = Teacher.query.filter_by(user_id=user.id).first()
        if teacher:
            teacher_info = {
                'position': teacher.position,
                'department': teacher.department,
                'name': teacher.name
            }

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
        'email': user.email
    }

    return jsonify({
        'token': token,
        'user': user_data
    }), 200


# === User & Profile Endpoints === #

@app.route('/api/users', methods=['GET'])
@token_required
def get_users(current_user):
    """Gets users filtered by role and optionally by group and verification status."""
    role = request.args.get('role')
    group = request.args.get('group')
    verification_status = request.args.get('verification_status')

    query = User.query
    if role:
        query = query.filter_by(role=role)

    if group:
        query = query.filter_by(group=group)

    if verification_status:
        if verification_status == 'verified_only':
            query = query.filter_by(verification_status='verified')
        elif verification_status == 'unverified_only':
            query = query.filter(User.verification_status.in_(['unverified', 'pending', 'rejected']))

    users = query.all()
    result = []
    for user in users:
        if user.id != current_user.id:
            user_data = {
                'id': user.id,
                'username': user.username,
                'fullName': user.full_name,
                'role': user.role,
                'verificationStatus': user.verification_status or 'verified'
            }
            if user.role == 'student':
                user_data['group'] = user.group
                user_data['faculty'] = user.faculty
                user_data['speciality'] = {
                    'id': user.speciality_id,
                    'code': user.speciality_code,
                    'name': user.speciality_name,
                    'form': user.study_form,
                    'formName': user.study_form_name
                } if user.speciality_id else None
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
    """Gets a single user's basic information by ID."""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'Пользователь не найден'}), 404

    user_data = {
        'id': user.id,
        'username': user.username,
        'fullName': user.full_name,
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

    if user.role == 'teacher':
        teacher = Teacher.query.filter_by(user_id=user.id).first()
        if teacher:
            user_data['department'] = teacher.department
            user_data['position'] = teacher.position
            if teacher.name:
                user_data['fullName'] = teacher.name
                user_data['teacher_name'] = teacher.name
                if not user.full_name:
                    try:
                        user.full_name = teacher.name
                        db.session.commit()
                        print(f"Updated user {user.id} full_name with teacher name: {teacher.name}")
                    except Exception as e:
                        print(f"Error updating user full_name: {str(e)}")
                        db.session.rollback()

    if user.role == 'student' and user.group:
        try:
            schedule_item = Schedule.query.filter_by(group_name=user.group).first()
            if schedule_item:
                user_data['course'] = schedule_item.course
        except Exception as e:
            print(f"Error getting course from schedule: {str(e)}")

    return jsonify(user_data)


@app.route('/api/teachers/<int:user_id>', methods=['GET'])
@token_required
def get_teacher_info(current_user, user_id):
    """Gets detailed information about a teacher by user_id."""
    try:
        user = User.query.get(user_id)
        if not user:
            return jsonify({'message': 'Пользователь не найден'}), 404
        if user.role != 'teacher':
            return jsonify({'message': 'Указанный пользователь не является преподавателем'}), 400
        teacher = Teacher.query.filter_by(user_id=user.id).first()
        if not teacher:
            return jsonify({'message': 'Информация о преподавателе не найдена','user_data': {'id': user.id,'username': user.username,'fullName': user.full_name}}), 404

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


@app.route('/api/teachers/search', methods=['GET'])
@token_required
def search_teachers(current_user):
    """Searches for teachers by name."""
    try:
        name = request.args.get('name', '')
        if not name or len(name) < 3:
            return jsonify({'message': 'Для поиска требуется не менее 3 символов'}), 400
        teachers = Teacher.query.filter(Teacher.name.ilike(f'%{name}%')).all()
        results = []
        for teacher in teachers:
            user = User.query.get(teacher.user_id) if teacher.user_id else None
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


@app.route('/api/user/change-password', methods=['POST'])
@token_required
def change_password_api(current_user):
    """Changes the current user's password."""
    try:
        data = request.json
        if not data or not data.get('currentPassword') or not data.get('newPassword'):
            return jsonify({'message': 'Необходимо указать текущий и новый пароль', 'success': False}), 400
        current_password = data.get('currentPassword')
        new_password = data.get('newPassword')

        password_correct = False
        if current_user.password_plain and current_password == current_user.password_plain:
            password_correct = True
        else:
            password_correct = current_user.check_password(current_password)

        if not password_correct:
            return jsonify({'message': 'Текущий пароль указан неверно', 'success': False}), 401

        if len(new_password) < 6:
            return jsonify({'message': 'Новый пароль должен содержать минимум 6 символов', 'success': False}), 400

        current_user.password_plain = new_password
        current_user.password = generate_password_hash(new_password)
        db.session.commit()

        return jsonify({'message': 'Пароль успешно изменен','success': True}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error changing password: {str(e)}")
        return jsonify({'message': f'Ошибка при изменении пароля: {str(e)}','success': False}), 500


@app.route('/api/user/profile', methods=['GET'])
@token_required
def get_profile(current_user):
    """Gets the profile information for the current authenticated user."""
    role = current_user.role or ('admin' if current_user.is_admin else 'unknown')
    try:
        query = """
        SELECT
            id,
            username,
            full_name,
            email, role,
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
            result = connection.execute(db.text(query), {"user_id": current_user.id})
            user_data = result.fetchone()
            if not user_data:
                return jsonify({'message': 'Пользователь не найден'}), 404
            user_dict = dict(zip(result.keys(), user_data))
    except Exception as e:
        print(f"ERROR: Direct DB query failed: {str(e)}")
        user_dict = {
            'id': current_user.id,
            'username': current_user.username,
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

    teacher_info = None
    if role == 'teacher':
        teacher = Teacher.query.filter_by(user_id=current_user.id).first()
        if teacher:
            teacher_info = {
                'position': teacher.position,
                'department': teacher.department,
                'name': teacher.name
            }

    profile_data = {
        'id': user_dict['id'],
        'username': user_dict['username'],
        'email': user_dict.get('email'),
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

    if role == 'student' and user_dict['group']:
        try:
            schedule_query = "SELECT course FROM schedule WHERE group_name = :group_name LIMIT 1"
            with db.engine.connect() as connection:
                schedule_result = connection.execute(db.text(schedule_query), {"group_name": user_dict['group']})
                schedule_data = schedule_result.fetchone()
                if schedule_data:
                    profile_data['course'] = schedule_data[0]
        except Exception as e:
            print(f"DEBUG: Error fetching course from schedule: {str(e)}")

    return jsonify(profile_data), 200


# === Schedule Endpoints === #

@app.route('/api/schedule/groups', methods=['GET'])
@token_required
def get_schedule_groups(current_user):
    """Gets unique groups from the schedule."""
    try:
        groups = db.session.query(db.distinct(Schedule.group_name)) \
            .filter(Schedule.group_name.isnot(None)) \
            .order_by(Schedule.group_name).all()
        groups_list = [{"name": group[0]} for group in groups if group[0]]
        return jsonify(groups_list), 200
    except Exception as e:
        print(f"Error getting groups: {str(e)}")
        return jsonify({"message": f"Error getting groups: {str(e)}"}), 500


@app.route('/api/schedule', methods=['GET'])
@token_required
def get_schedule(current_user):
    """Gets the schedule for a group or teacher."""
    group = request.args.get('group')
    date = request.args.get('date')
    teacher_id = request.args.get('teacher_id')
    query = Schedule.query

    if current_user.role == 'student':
        if not group and current_user.group:
            group = current_user.group
        if group:
            query = query.filter_by(group_name=group)
    elif current_user.role == 'teacher':
        teacher = Teacher.query.filter_by(user_id=current_user.id).first()
        if teacher:
            mapped_schedule_teachers = ScheduleTeacher.query.filter_by(
                mapped_teacher_id=teacher.id,
                active=True
            ).all()
            teacher_names = [teacher.name]
            for schedule_teacher in mapped_schedule_teachers:
                if schedule_teacher.name and schedule_teacher.name not in teacher_names:
                    teacher_names.append(schedule_teacher.name)
            if teacher_names:
                query = query.filter(Schedule.teacher_name.in_(teacher_names))
                print(f"Filtering schedule for teacher by names: {teacher_names}")
            else:
                print(f"No teacher names found for user_id={current_user.id}, teacher_id={teacher.id}")

    if date:
        try:
            query_date = datetime.datetime.strptime(date, '%Y-%m-%d').date()
            query = query.filter_by(date=query_date)
        except ValueError:
            pass

    query = query.order_by(Schedule.date, Schedule.time_start)
    query = query.limit(100)
    schedules = query.all()

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


@app.route('/api/schedule/course', methods=['GET'])
@token_required
def get_course_from_schedule(current_user):
    """Gets course information from schedule based on group."""
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
        return jsonify({'message': f'Ошибка при получении информации о курсе: {str(e)}','success': False}), 500


# === Notification Helpers === #

def validate_fcm_token(token):
    """Validates the format and type of a notification token, supporting iOS tokens."""
    if not token:
        return False
    token = str(token)
    token_preview = token[:15] + "..." if len(token) > 15 else token
    is_jwt = token.count('.') == 2 and token.startswith('ey')
    is_expo = token.startswith('ExponentPushToken[')
    is_fcm_format = bool(re.match(r'^[a-zA-Z0-9:_-]+$', token))
    is_apns_format = len(token) > 64 and any([
        token.startswith('APNS_'),
        token.startswith('apns_'),
        re.match(r'^[a-f0-9]{64,}$', token)
    ])

    print(f"💫 TOKEN VALIDATION: {token_preview}")
    print(f"   - Token length: {len(token)} characters")
    print(f"   - Looks like JWT: {is_jwt}")
    print(f"   - Looks like Expo token: {is_expo}")
    print(f"   - Looks like APNs token: {is_apns_format}")
    print(f"   - Matches FCM format: {is_fcm_format}")

    if is_jwt:
        print("   ❌ ERROR: Received JWT authentication token instead of notification token")
        return False
    elif is_expo:
        print("   ✅ Expo token accepted as valid")
        return True
    elif is_apns_format:
        print("   ✅ APNs token accepted as valid (will be processed via Expo API)")
        return True
    elif not is_fcm_format:
        print("   ❌ ERROR: Token does not match any known format")
        return False
    return True


def send_push_message(token, title, message, data=None):
    """Sends a push notification via Firebase Cloud Messaging or Expo Push service with improved iOS support."""
    safe_data = {**data} if data else {}
    if 'token' in safe_data:
        safe_data['token'] = safe_data['token'][:10] + '...' if safe_data['token'] else None

    print(f"🔔 Push notification request:")
    print(f"   - Title: {title}")
    print(f"   - Message: {message}")
    print(f"   - Data: {safe_data}")

    token_type = safe_data.get('tokenType', 'unknown')
    platform = safe_data.get('platform', 'unknown')
    is_ios = platform.lower() == 'ios'

    print(f"   - Token Type: {token_type}")
    print(f"   - Platform: {platform}")

    is_expo_token_format = token.startswith('ExponentPushToken[')
    is_jwt_token_format = token.count('.') == 2 and token.startswith('ey')

    if is_expo_token_format or token_type == 'expo' or (is_ios and not is_jwt_token_format):
        print(f"   📱 {'Detected Expo token' if is_expo_token_format else 'iOS device'}, using Expo Push API")
        try:
            expo_message = {
                'to': token,
                'title': title,
                'body': message,
                'data': data or {},
                'sound': 'default'
            }
            if is_ios:
                print("   ℹ️ Adding iOS specific parameters")
                expo_message.update({
                    'subtitle': data.get('subtitle', ''),
                    'badge': 1,
                    'priority': 'high',
                    '_displayInForeground': True,
                    'mutableContent': True,
                    'categoryId': data.get('type', 'default'),
                    'channelId': data.get('type', 'default')
                })
                if "content_available" not in expo_message:
                    expo_message['contentAvailable'] = True

            print(f"   📤 Sending Expo notification: {json.dumps(expo_message)[:100]}...")

            response = requests.post(
                'https://exp.host/--/api/v2/push/send',
                json=expo_message,
                headers={
                    'Accept': 'application/json',
                    'Accept-encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                timeout=15
            )

            if response.status_code == 200:
                response_data = response.json()
                print(f"   ✅ Expo Push API response: {response_data}")
                success = False
                ticket_id = str(uuid.uuid4()) # Default UUID if no ID from Expo

                if 'data' in response_data:
                     # Handle both list and object format responses from Expo
                    if isinstance(response_data['data'], list) and len(response_data['data']) > 0:
                        success = response_data['data'][0].get('status') == 'ok'
                        ticket_id = response_data['data'][0].get('id', ticket_id)
                    elif isinstance(response_data['data'], dict) and response_data['data'].get('status') == 'ok':
                         success = True
                         ticket_id = response_data['data'].get('id', ticket_id)
                    else:
                        print(f"   ⚠️ Unexpected Expo response data format: {response_data}")
                else:
                     print(f"   ⚠️ Expo API status 200 but no 'data' field. Assuming success.")
                     success = True # Assume success if 200 OK but unexpected body

                if success:
                    print(f"   ✅ Expo Push notification sent successfully, ticket_id={ticket_id}")
                else:
                     print(f"   ⚠️ Expo Push API returned status 200, but message might not be delivered.")

                return {"success": success, "message_id": f"expo_{ticket_id}"}
            else:
                print(f"   ❌ Error sending via Expo: {response.status_code}, {response.text}")
                return {"success": False, "error": f"Expo API error: {response.status_code}, {response.text}"}
        except Exception as e:
            print(f"   ❌ Error sending via Expo: {str(e)}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}

    elif is_jwt_token_format:
        print("   ❌ Error: Received JWT authentication token instead of push token")
        return {"success": False, "error": "Token is a JWT authentication token, not a push token"}

    elif not FIREBASE_AVAILABLE:
        print("   ❌ Firebase Admin SDK is not available. Trying Expo API fallback.")
        try:
            import requests
            import json
            import uuid

            expo_fallback_message = {
                'to': token,
                'title': title,
                'body': message,
                'data': data or {},
                'sound': 'default'
            }
            response = requests.post(
                'https://exp.host/--/api/v2/push/send',
                json=expo_fallback_message,
                headers={
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                timeout=10
            )
            if response.status_code == 200:
                print("   ✅ Expo API fallback successful!")
                return {"success": True, "message_id": f"expo_fallback_{str(uuid.uuid4())}"}
            else:
                print(f"   ❌ Expo API fallback failed: {response.status_code}")
                return {"success": False, "message": "Firebase unavailable and fallback failed"}
        except Exception as fallback_error:
            print(f"   ❌ Error using fallback: {str(fallback_error)}")
            return {"success": False, "message": "Firebase unavailable"}

    elif token_type == 'apns' or (is_ios and not is_expo_token_format and not is_jwt_token_format): # Consider pure APNS tokens too
        print("   ⚠️ Received native APNs token, trying to send via Expo API")
        try:
            import requests
            import json
            response = requests.post(
                'https://exp.host/--/api/v2/push/send',
                json={
                    'to': token,
                    'title': title,
                    'body': message,
                    'data': data or {},
                     # Use the _apnsToken field if Expo supports direct APNS tokens this way
                     # Note: This might not be the official way or might be deprecated.
                     # The primary method should be using Expo's standard tokens.
                    '_apnsToken': token if not token.startswith('ExponentPushToken[') else None,
                    'sound': 'default',
                    'badge': 1, # APNS specific field
                    'priority': 'high'
                },
                headers={
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                timeout=10
            )
            if response.status_code == 200:
                print("   ✅ APNs token sent via Expo API successful!")
                return {"success": True, "message": "APNs token sent via Expo API"}
            else:
                print(f"   ❌ Error sending APNs token via Expo: {response.status_code}")
                return {"success": False, "error": "APNs tokens not supported directly. Use Expo tokens for iOS"}
        except Exception as apns_error:
            print(f"   ❌ Error sending APNs token: {str(apns_error)}")
            return {"success": False, "error": "Error sending APNs token: " + str(apns_error)}


    else: # Default to Firebase FCM
        try:
            print("   📤 Sending notification via Firebase Admin SDK")
            notification = messaging.Notification(
                title=title,
                body=message
            )

            android_config = messaging.AndroidConfig(
                priority='high',
                notification=messaging.AndroidNotification(
                    icon='notification_icon',
                    color='#770002'
                )
            )

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

            if data is None: data = {}
            fcm_data = {}
            for key, value in data.items():
                fcm_data[str(key)] = str(value) if value is not None else ""

            message_obj = messaging.Message(
                token=token,
                notification=notification,
                android=android_config,
                apns=apns_config,
                data=fcm_data
            )

            print("   📝 FCM message object created")
            response = messaging.send(message_obj)
            print(f"   ✅ FCM notification sent successfully: {response}")
            return {"success": True, "message_id": response}
        except Exception as e:
            print(f"   ❌ Error sending push notification via FCM: {str(e)}")
            print(f"   - Error type: {type(e).__name__}")
            import traceback
            traceback.print_exc()

            if is_ios:
                print("   🔄 Attempting to send iOS notification via Expo API as fallback")
                try:
                    import requests
                    import json
                    expo_backup_message = {
                        'to': token,
                        'title': title,
                        'body': message,
                        'data': data or {},
                        'sound': 'default',
                        'badge': 1,
                        '_displayInForeground': True,
                        'priority': 'high'
                    }
                    response = requests.post(
                        'https://exp.host/--/api/v2/push/send',
                        json=expo_backup_message,
                        headers={'Accept': 'application/json','Content-Type': 'application/json',},
                        timeout=10
                    )
                    if response.status_code == 200:
                        print("   ✅ Expo fallback successful!")
                        return {"success": True, "message_id": "expo_backup_" + str(uuid.uuid4())}
                    else:
                        return {"success": False, "error": str(e)}
                except Exception as backup_error:
                    print(f"   ❌ Error sending backup notification: {str(backup_error)}")
                    return {"success": False, "error": str(e)}

            return {"success": False, "error": str(e)}


def create_and_send_notification(recipient_id, title, body, notification_type, sender_id=None, data=None, related_type=None, related_id=None):
    """Creates a DB notification record and sends a push notification."""
    result = {
        'db_success': False,
        'push_success': False,
        'notification_id': None,
        'push_receipts': []
    }
    try:
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
        device_tokens = DeviceToken.query.filter_by(user_id=recipient_id).all()
        if device_tokens:
            push_data = data.copy() if data else {}
            push_data.update({
                'notification_id': notification.id,
                'type': notification_type,
                'sender_id': sender_id,
                'timestamp': datetime.datetime.utcnow().isoformat()
            })
            if related_type and related_id:
                push_data.update({
                    'related_type': related_type,
                    'related_id': related_id
                })
            successful_deliveries = 0
            for token_obj in device_tokens:
                # Pass device info to send_push_message for better handling
                push_data['tokenType'] = token_obj.token_type
                push_data['platform'] = token_obj.platform
                push_data['device'] = token_obj.device_name

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
            db.session.commit()
            print(f"Error sending push notification, but DB record was created: {str(e)}")
        else:
            db.session.rollback()
            print(f"Error creating notification record: {str(e)}")
        result['error'] = str(e)
        return result


# === Notification Endpoints === #

@app.route('/api/notifications', methods=['GET'])
@token_required
def get_user_notifications(current_user):
    """Gets the list of notifications for the current user."""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        unread_only = request.args.get('unread_only', 'false').lower() == 'true'
        notification_type = request.args.get('type')

        query = Notification.query.filter_by(user_id=current_user.id)

        if unread_only:
            query = query.filter_by(is_read=False)
        if notification_type:
            query = query.filter_by(notification_type=notification_type)

        query = query.order_by(Notification.created_at.desc())
        notifications = query.paginate(page=page, per_page=per_page)
        unread_count = Notification.query.filter_by(user_id=current_user.id, is_read=False).count()

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
        return jsonify({'message': f"Error: {str(e)}",'success': False}), 500


@app.route('/api/notifications/<int:notification_id>/read', methods=['POST'])
@token_required
def mark_notification_read(current_user, notification_id):
    """Marks a specific notification as read."""
    try:
        notification = Notification.query.get_or_404(notification_id)
        if notification.user_id != current_user.id:
            return jsonify({'message': 'Access denied','success': False}), 403

        was_updated = notification.mark_as_read()
        db.session.commit()

        return jsonify({'message': 'Notification marked as read','was_updated': was_updated,'success': True}), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error marking notification as read: {str(e)}")
        return jsonify({'message': f"Error: {str(e)}",'success': False}), 500


@app.route('/api/notifications/read-all', methods=['POST'])
@token_required
def mark_all_notifications_read(current_user):
    """Marks all notifications for the current user as read."""
    try:
        notifications = Notification.query.filter_by(user_id=current_user.id,is_read=False).all()
        now = datetime.datetime.utcnow()
        count = 0
        for notification in notifications:
            notification.is_read = True
            notification.read_at = now
            count += 1
        db.session.commit()
        return jsonify({'message': f'{count} notifications marked as read','count': count,'success': True}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error marking all notifications as read: {str(e)}")
        return jsonify({'message': f"Error: {str(e)}",'success': False}), 500


@app.route('/api/notifications/<int:notification_id>', methods=['DELETE'])
@token_required
def delete_notification(current_user, notification_id):
    """Deletes a specific notification for the current user."""
    try:
        notification = Notification.query.get_or_404(notification_id)
        if notification.user_id != current_user.id:
            return jsonify({'message': 'Access denied','success': False}), 403
        db.session.delete(notification)
        db.session.commit()
        return jsonify({'message': 'Notification deleted','success': True}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting notification: {str(e)}")
        return jsonify({'message': f"Error: {str(e)}",'success': False}), 500


@app.route('/api/notifications/unread-count', methods=['GET'])
@token_required
def get_unread_count(current_user):
    """Returns the count of unread notifications for the current user."""
    try:
        unread_count = Notification.query.filter_by(user_id=current_user.id,is_read=False).count()
        return jsonify({'unread_count': unread_count,'success': True}), 200
    except Exception as e:
        print(f"Error getting unread count: {str(e)}")
        return jsonify({'message': f"Error: {str(e)}",'success': False}), 500


@app.route('/api/device/send-notification', methods=['POST'])
@token_required
def send_push_notification(current_user):
    """Sends a push notification to a specific user's devices."""
    try:
        data = request.json
        if not data or not data.get('recipient_id'):
            return jsonify({'message': 'Не указан получатель уведомления','success': False}), 400

        recipient_id = data.get('recipient_id')
        title = data.get('title', 'Новое сообщение')
        body = data.get('body', 'У вас новое сообщение')
        notification_data = data.get('data', {})
        notification_type = notification_data.get('type', 'system')
        related_type = notification_data.get('related_type')
        related_id = notification_data.get('related_id')

        if str(recipient_id) == str(current_user.id):
            return jsonify({'message': 'Нельзя отправить уведомление самому себе','success': False,'status': 'self_notification'}), 400

        notification_result = create_and_send_notification(
            recipient_id=recipient_id,
            title=title,
            body=body,
            notification_type=notification_type,
            sender_id=current_user.id,
            data=notification_data,
            related_type=related_type,
            related_id=related_id
        )

        if notification_result['push_success']:
             return jsonify({
                 'message': f'Уведомление отправлено. DB Success: {notification_result["db_success"]}. Push Success: {notification_result["push_success"]}',
                 'success': True,
                 'receipts': notification_result['push_receipts'],
                 'notification_id': notification_result['notification_id']
             }), 200
        elif notification_result['db_success']:
             return jsonify({
                 'message': f'Уведомление сохранено в БД, но push не отправлен. DB Success: {notification_result["db_success"]}. Push Success: {notification_result["push_success"]}',
                 'success': False,
                 'receipts': notification_result['push_receipts'],
                 'notification_id': notification_result['notification_id'],
                 'error': notification_result.get('error', 'Push failed for all devices.')
             }), 200 # Return 200 even if push fails, if DB record is saved

        else:
             return jsonify({
                 'message': f'Ошибка при создании уведомления. DB Success: {notification_result["db_success"]}. Push Success: {notification_result["push_success"]}',
                 'success': False,
                 'error': notification_result.get('error', 'Failed to create DB record and send push.')
             }), 500


    except Exception as e:
        print(f"Overall error sending notification: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'message': f'Ошибка: {str(e)}','success': False}), 500


@app.route('/api/device/register', methods=['POST'])
@token_required
def register_device(current_user):
    """Registers or updates a device token for push notifications."""
    try:
        data = request.json
        if not data or not data.get('token'):
            return jsonify({'message': 'Не предоставлен токен','success': False}), 400

        token = data.get('token')
        device = data.get('device', 'Неизвестное устройство')
        platform = data.get('platform', 'unknown')
        token_type = data.get('tokenType', 'unknown')

        if token_type == 'unknown':
            if token.startswith('ExponentPushToken['):
                token_type = 'expo'
            elif platform.lower() == 'ios':
                token_type = 'expo'

        existing_token = DeviceToken.query.filter_by(token=token).first()

        if existing_token:
            if existing_token.user_id != current_user.id:
                 print(f"Reassigning token from user {existing_token.user_id} to {current_user.id}")
            existing_token.user_id = current_user.id
            existing_token.device_name = device
            existing_token.platform = platform
            existing_token.token_type = token_type
            existing_token.last_used_at = datetime.datetime.utcnow()
            action = 'updated'
        else:
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

        try:
            db.session.commit()
            return jsonify({'message': f'Токен устройства {action}','success': True,'action': action}), 200
        except Exception as db_error:
            db.session.rollback()
            print(f"Database error during token {action}: {str(db_error)}")
            return jsonify({'message': f'Ошибка базы данных: {str(db_error)}','success': False,'error': 'database_error'}), 500

    except Exception as e:
        print(f"Unexpected error registering token for user_id={current_user.id}: {str(e)}")
        return jsonify({'message': f'Ошибка: {str(e)}','success': False,'error': 'unexpected_error'}), 500


@app.route('/api/device/unregister', methods=['POST'])
def unregister_device():
    """Unregisters a specific device token or all tokens for the current user."""
    try:
        current_user = None
        user_id = None
        if 'Authorization' in request.headers:
            try:
                auth_header = request.headers['Authorization']
                if auth_header.startswith('Bearer '):
                    token_header = auth_header.split(' ')[1]
                    payload = jwt.decode(token_header, app.config.get('SECRET_KEY'), algorithms=['HS256'])
                    user_id = payload['sub']
                    current_user = User.query.get(user_id)
            except Exception as token_error:
                print(f"Token authentication failed: {str(token_error)}")

        token_body = request.json.get('token')
        all_user_tokens = request.json.get('all_user_tokens', False)
        force_token = request.json.get('force_token')

        if token_body == 'force_all_tokens_removal' or force_token == 'force_all_tokens_removal':
            all_user_tokens = True

        if all_user_tokens and user_id:
            deleted_count = DeviceToken.query.filter_by(user_id=user_id).delete()
            db.session.commit()
            return jsonify({'success': True,'message': f'Deleted {deleted_count} tokens for user {user_id}'})

        if not token_body:
            return jsonify({'success': False,'message': 'Token not provided'}), 400

        deleted = DeviceToken.query.filter_by(token=token_body).delete()
        db.session.commit()

        if deleted:
            return jsonify({'success': True,'message': 'Device token unregistered successfully'})
        else:
            return jsonify({'success': False,'message': 'Token not found'}), 404

    except Exception as e:
        db.session.rollback()
        print(f"Error unregistering token: {str(e)}")
        return jsonify({'success': False,'message': f'Error unregistering token: {str(e)}'}), 500


@app.route('/api/device/unregister/all', methods=['POST'])
@token_required
def unregister_all_user_tokens(current_user):
    """Unregisters ALL device tokens for the current authenticated user."""
    try:
        user_id = request.json.get('user_id', current_user.id)
        if str(user_id) != str(current_user.id) and not current_user.is_admin:
            return jsonify({'success': False,'message': 'Cannot delete tokens for another user'}), 403

        token_count = DeviceToken.query.filter_by(user_id=user_id).count()
        deleted = DeviceToken.query.filter_by(user_id=user_id).delete()
        db.session.commit()
        return jsonify({'success': True,'message': f'Successfully deleted {deleted} device tokens for user {user_id}','count': deleted,'tokens_found': token_count})
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting user tokens: {str(e)}")
        return jsonify({'success': False,'message': f'Error deleting tokens: {str(e)}'}), 500


@app.route('/api/user/<int:user_id>/tokens', methods=['DELETE'])
@token_required
def delete_user_tokens(current_user, user_id):
    """RESTful endpoint to delete all tokens for a specific user."""
    try:
        if str(user_id) != str(current_user.id) and not current_user.is_admin:
            return jsonify({'success': False,'message': 'Cannot delete tokens for another user'}), 403
        deleted = DeviceToken.query.filter_by(user_id=user_id).delete()
        db.session.commit()
        if deleted > 0:
            return jsonify({'success': True,'message': f'Successfully deleted {deleted} device tokens','count': deleted})
        else:
            return jsonify({'success': True,'message': 'No tokens found for this user','count': 0})
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting user tokens: {str(e)}")
        return jsonify({'success': False,'message': f'Error deleting tokens: {str(e)}'}), 500


@app.route('/api/device/test-notification', methods=['POST'])
@token_required
def test_notification(current_user):
    """Sends a test push notification to a specified device token."""
    try:
        data = request.json
        token = data.get('token')
        token_type = data.get('tokenType', 'unknown')
        device = data.get('device', 'Unknown device')
        platform = data.get('platform', 'unknown')
        is_ios = platform.lower() == 'ios'

        if not token:
            return jsonify({'message': 'Не предоставлен токен','success': False}), 400

        if token.startswith('ExponentPushToken['):
            actual_token_type = 'expo'
        elif token_type == 'expo':
            actual_token_type = 'expo'
        elif is_ios:
            actual_token_type = 'expo'
        else:
            actual_token_type = token_type

        test_data = {
            'type': 'test',
            'timestamp': str(datetime.datetime.now().timestamp()),
            'device': device,
            'platform': platform,
            'tokenType': actual_token_type,
            'sender_id': current_user.id,
            'test_mode': True
        }

        if is_ios:
            test_data.update({
                'sound': 'default',
                'badge': '1',
                'priority': 'high',
                'content_available': '1',
                '_displayInForeground': True,
                'subtitle': 'Тестовое iOS уведомление',
                'mutable_content': '1'
            })
            test_data['categoryId'] = 'test_notification'

        notification_title = f"Тестовое уведомление"
        notification_body = f"Это тестовое уведомление для платформы {platform}."

        result = send_push_message(
            token,
            notification_title,
            notification_body,
            test_data
        )

        if result.get('success'):
            ios_info = {}
            if is_ios:
                ios_info = {
                    'ios_notes': 'На iOS уведомления отображаются только когда приложение в фоновом режиме или экран заблокирован',
                    'delivery_time': 'На iOS доставка может занять до 30 секунд',
                    'token_type_used': actual_token_type
                }
            return jsonify({'message': 'Тестовое уведомление отправлено успешно','success': True,'message_id': result.get('message_id'),**ios_info}), 200
        else:
            error_info = {}
            if is_ios and 'error' in result:
                error_info = {
                    'ios_troubleshooting': 'Проблемы с iOS уведомлениями часто вызваны отсутствием разрешений или конфигурации APNS',
                    'suggestions': [
                        'Убедитесь, что приложение имеет разрешение на отправку уведомлений',
                        'Проверьте, что токен Expo действителен',
                        'Устройство должно быть подключено к интернету',
                        'Режим "Не беспокоить" должен быть отключен'
                    ]
                }
            return jsonify({'message': f"Ошибка отправки уведомления: {result.get('error')}","success": False,'error': result.get('error'),**error_info}), 500

    except Exception as e:
        print(f"Unexpected error processing test notification: {str(e)}")
        import traceback
        traceback.print_exc()
        error_info = {}
        if platform == 'ios':
            error_info = {
                'ios_troubleshooting': 'Возникла ошибка при обработке iOS-уведомления',
                'suggestions': [
                    'Убедитесь, что токен устройства корректен',
                    'Проверьте сетевое соединение',
                    'Попробуйте использовать тип токена "expo" для iOS'
                ]
            }
        return jsonify({'message': f'Ошибка: {str(e)}','success': False,**error_info}), 500


# === Verification Endpoints === #

@app.route('/api/student/verify', methods=['POST'])
@token_required
def upload_student_card(current_user):
    """Uploads a student card image for verification."""
    if current_user.role != 'student':
        return jsonify({'message': 'Только студенты могут загружать студенческий билет'}), 403
    if 'studentCard' not in request.files:
        return jsonify({'message': 'Файл не отправлен'}), 400
    file = request.files['studentCard']
    if file.filename == '':
        return jsonify({'message': 'Файл не выбран'}), 400

    filename = f"{uuid.uuid4()}{os.path.splitext(file.filename)[1]}"
    file_path = os.path.join(STUDENT_CARDS_FOLDER, filename)
    file.save(file_path)

    previous_status = current_user.verification_status
    current_user.student_card_image = filename
    current_user.verification_status = 'pending'

    log_entry = VerificationLog(
        student_id=current_user.id,
        action='upload',
        status_before=previous_status,
        status_after='pending',
        comment='Загрузка студенческого билета'
    )
    db.session.add(log_entry)
    db.session.commit()

    return jsonify({'message': 'Файл успешно загружен','status': 'pending'}), 200


@app.route('/api/student/verification-status', methods=['GET'])
@token_required
def get_verification_status(current_user):
    """Gets the verification status of the current student user."""
    if current_user.role != 'student':
        return jsonify({'message': 'Только студенты имеют статус верификации'}), 403

    status_message = ""
    if current_user.verification_status == 'pending':
        status_message = "Ваш студенческий билет находится на проверке. Обычно это занимает 1-2 рабочих дня."
    elif current_user.verification_status == 'verified':
        status_message = "Ваш студенческий билет успешно верифицирован."
    elif current_user.verification_status == 'rejected':
        status_message = "Верификация студенческого билета отклонена. Пожалуйста, загрузите его снова."
    else:
        status_message = "Для доступа ко всем функциям приложения необходимо верифицировать студенческий билет."

    return jsonify({'status': current_user.verification_status or 'unverified','message': status_message,'updatedAt': datetime.datetime.now().isoformat()}), 200


@app.route('/api/student/cancel-verification', methods=['POST'])
@token_required
def cancel_verification(current_user):
    """Cancels a pending or rejected verification."""
    if current_user.role != 'student':
        return jsonify({'message': 'Только студенты могут отменить верификацию'}), 403
    if current_user.verification_status not in ['pending', 'rejected']:
        return jsonify({'message': 'Невозможно отменить верификацию в текущем статусе'}), 400

    previous_status = current_user.verification_status
    if current_user.student_card_image:
        try:
            file_path = os.path.join(STUDENT_CARDS_FOLDER, current_user.student_card_image)
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            print(f"Error removing student card image: {str(e)}")

    current_user.student_card_image = None
    current_user.verification_status = 'unverified'

    log_entry = VerificationLog(
        student_id=current_user.id,
        action='cancel',
        status_before=previous_status,
        status_after='unverified',
        comment='Отмена верификации пользователем'
    )
    db.session.add(log_entry)
    db.session.commit()
    return jsonify({'message': 'Верификация отменена. Вы можете загрузить студенческий билет снова.','status': 'unverified'}), 200


@app.route('/api/student/reupload', methods=['POST'])
@token_required
def reupload_student_card(current_user):
    """Reuploads a student card after rejection or unverified status."""
    if current_user.role != 'student':
        return jsonify({'message': 'Только студенты могут загружать студенческий билет'}), 403
    if current_user.verification_status not in ['rejected', 'unverified']:
        return jsonify({'message': 'Загрузка невозможна в текущем статусе верификации'}), 400
    if 'studentCard' not in request.files:
        return jsonify({'message': 'Файл не отправлен'}), 400
    file = request.files['studentCard']
    if file.filename == '':
        return jsonify({'message': 'Файл не выбран'}), 400

    previous_status = current_user.verification_status
    if current_user.student_card_image:
        try:
            file_path = os.path.join(STUDENT_CARDS_FOLDER, current_user.student_card_image)
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            print(f"Error removing previous student card image: {str(e)}")

    filename = f"{uuid.uuid4()}{os.path.splitext(file.filename)[1]}"
    file_path = os.path.join(STUDENT_CARDS_FOLDER, filename)
    file.save(file_path)

    current_user.student_card_image = filename
    current_user.verification_status = 'pending'

    log_entry = VerificationLog(
        student_id=current_user.id,
        action='reupload',
        status_before=previous_status,
        status_after='pending',
        comment='Повторная загрузка студенческого билета'
    )
    db.session.add(log_entry)
    db.session.commit()
    return jsonify({'message': 'Файл успешно загружен','status': 'pending'}), 200


@app.route('/api/uploads/student_cards/<filename>', methods=['GET'])
@token_required
def get_student_card(current_user, filename):
    """Serves the student card image if the user is admin or the owner."""
    if not current_user.is_admin and current_user.student_card_image != filename:
        return jsonify({'message': 'Доступ запрещен'}), 403
    try:
         return send_from_directory(STUDENT_CARDS_FOLDER, filename)
    except FileNotFoundError:
         return jsonify({'message': 'Файл не найден'}), 404
    except Exception as e:
         print(f"Error serving student card image: {str(e)}")
         return jsonify({'message': f'Ошибка при загрузке файла: {str(e)}'}), 500


# === Ticket Endpoints === #

@app.route('/api/tickets', methods=['GET'])
@token_required
def get_user_tickets(current_user):
    """Gets a list of tickets for the current user."""
    try:
        status = request.args.get('status', None)
        category = request.args.get('category', None)
        query = Ticket.query.filter_by(user_id=current_user.id)

        if status and status != 'all':
            query = query.filter_by(status=status)
        if category:
            query = query.filter_by(category=category)

        tickets = query.order_by(Ticket.updated_at.desc()).all()
        return jsonify([ticket.to_dict() for ticket in tickets]), 200

    except Exception as e:
        print(f"Error getting tickets: {str(e)}")
        return jsonify({"message": f"Error: {str(e)}"}), 500


@app.route('/api/tickets', methods=['POST'])
@token_required
def create_ticket(current_user):
    """Creates a new ticket."""
    try:
        data = request.json
        required_fields = ['title', 'category', 'message']
        for field in required_fields:
            if field not in data:
                return jsonify({"message": f"Field {field} is required"}), 400

        new_ticket = Ticket(
            user_id=current_user.id,
            title=data['title'],
            category=data['category'],
            priority=data.get('priority', 'medium'),
            status='new',
            has_admin_unread=True,
            has_user_unread=False
        )
        if 'related_type' in data and 'related_id' in data:
            new_ticket.related_type = data['related_type']
            new_ticket.related_id = data['related_id']

        db.session.add(new_ticket)
        db.session.flush()

        message = TicketMessage(
            ticket_id=new_ticket.id,
            user_id=current_user.id,
            is_from_admin=False,
            text=data['message'],
            is_read=True
        )
        db.session.add(message)
        db.session.commit()
        return jsonify({"message": "Ticket created successfully","ticket": new_ticket.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        print(f"Error creating ticket: {str(e)}")
        return jsonify({"message": f"Error: {str(e)}"}), 500


@app.route('/api/tickets/<int:ticket_id>', methods=['GET'])
@token_required
def get_ticket_details(current_user, ticket_id):
    """Gets details of a specific ticket, including messages."""
    try:
        ticket = Ticket.query.get_or_404(ticket_id)
        if ticket.user_id != current_user.id and not current_user.is_admin:
            return jsonify({"message": "Access denied"}), 403

        messages = [message.to_dict() for message in ticket.messages]

        if not current_user.is_admin and ticket.has_user_unread:
            unread_messages = TicketMessage.query.filter_by(
                ticket_id=ticket.id,
                is_from_admin=True,
                is_read=False
            ).all()
            for message in unread_messages:
                message.is_read = True
            ticket.has_user_unread = False
            db.session.commit()

        return jsonify({"ticket": ticket.to_dict(),"messages": messages}), 200
    except Exception as e:
        print(f"Error getting ticket details: {str(e)}")
        return jsonify({"message": f"Error: {str(e)}"}), 500


@app.route('/api/tickets/<int:ticket_id>/messages', methods=['POST'])
@token_required
def add_ticket_message(current_user, ticket_id):
    """Adds a message to a ticket."""
    try:
        ticket = Ticket.query.get_or_404(ticket_id)
        if ticket.user_id != current_user.id and not current_user.is_admin:
            return jsonify({"message": "Access denied"}), 403

        data = request.json
        if 'text' not in data or not data['text'].strip():
            return jsonify({"message": "Message text is required"}), 400

        is_from_admin = current_user.is_admin
        new_message = TicketMessage(
            ticket_id=ticket.id,
            user_id=current_user.id,
            is_from_admin=is_from_admin,
            text=data['text'],
            is_read=False
        )
        db.session.add(new_message)

        if 'status' in data and data['status'] and current_user.is_admin:
            ticket.status = data['status']

        if ticket.status == 'closed' and not is_from_admin:
            ticket.status = 'waiting'

        if is_from_admin:
            ticket.has_user_unread = True
        else:
            ticket.has_admin_unread = True

        ticket.updated_at = datetime.datetime.utcnow()
        db.session.commit()
        return jsonify({"message": "Message added successfully","ticket_message": new_message.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        print(f"Error adding message: {str(e)}")
        return jsonify({"message": f"Error: {str(e)}"}), 500


@app.route('/api/tickets/<int:ticket_id>/attachment', methods=['POST'])
@token_required
def upload_ticket_attachment(current_user, ticket_id):
    """Uploads an attachment to a ticket message."""
    try:
        ticket = Ticket.query.get_or_404(ticket_id)
        if ticket.user_id != current_user.id and not current_user.is_admin:
            return jsonify({"message": "Access denied"}), 403
        if 'file' not in request.files:
            return jsonify({"message": "No file part"}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({"message": "No selected file"}), 400

        try:
            os.makedirs(UPLOAD_FOLDER, exist_ok=True)
            os.makedirs(TICKET_ATTACHMENTS_FOLDER, exist_ok=True)
        except Exception as dir_error:
            print(f"Error creating directories: {str(dir_error)}")
            return jsonify({"message": f"Server storage error: {str(dir_error)}"}), 500

        try:
            original_filename = secure_filename(file.filename)
            file_ext = os.path.splitext(original_filename)[1]
            filename = f"{uuid.uuid4()}{file_ext}"
            file_path = os.path.join(TICKET_ATTACHMENTS_FOLDER, filename)
        except Exception as filename_error:
            print(f"Error processing filename: {str(filename_error)}")
            return jsonify({"message": f"Filename error: {str(filename_error)}"}), 500

        try:
            file.save(file_path)
            file_size = os.path.getsize(file_path)
        except Exception as save_error:
            print(f"Error saving file: {str(save_error)}")
            return jsonify({"message": f"File save error: {str(save_error)}"}), 500

        try:
            file_ext = os.path.splitext(original_filename)[1].lower()
            file_type = 'image' if file_ext in ['.jpg', '.jpeg', '.png', '.gif'] else 'document'
        except Exception as type_error:
            print(f"Error determining file type: {str(type_error)}")
            file_type = 'document'

        try:
            is_from_admin = current_user.is_admin
            message_text = request.form.get('text', '')

            new_message = TicketMessage(
                ticket_id=ticket.id,
                user_id=current_user.id,
                is_from_admin=is_from_admin,
                text=message_text,
                attachment=filename,
                is_read=False
            )
            db.session.add(new_message)
            db.session.flush()

            attachment = TicketAttachment(
                message_id=new_message.id,
                filename=filename,
                original_filename=original_filename,
                file_type=file_type,
                file_size=file_size
            )
            db.session.add(attachment)

            if is_from_admin:
                ticket.has_user_unread = True
            else:
                ticket.has_admin_unread = True
            ticket.updated_at = datetime.datetime.utcnow()

            db.session.commit()
            return jsonify({"message": "File uploaded successfully","ticket_message": new_message.to_dict()}), 201

        except Exception as db_error:
            db.session.rollback()
            print(f"Database error: {str(db_error)}")
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
        import traceback
        traceback.print_exc()
        return jsonify({"message": f"Server error: {str(e)}"}), 500


@app.route('/api/uploads/ticket_attachments/<filename>', methods=['GET'])
@token_required
def get_ticket_attachment(current_user, filename):
    """Serves a ticket attachment file."""
    try:
        attachment = TicketAttachment.query.filter_by(filename=filename).first_or_404()
        message = TicketMessage.query.get_or_404(attachment.message_id)
        ticket = Ticket.query.get_or_404(message.ticket_id)

        if ticket.user_id != current_user.id and not current_user.is_admin:
            return jsonify({"message": "Access denied"}), 403

        return send_from_directory(TICKET_ATTACHMENTS_FOLDER, filename)

    except FileNotFoundError:
         return jsonify({'message': 'Файл не найден'}), 404
    except Exception as e:
        print(f"Error getting attachment: {str(e)}")
        return jsonify({"message": f"Error: {str(e)}"}), 500


@app.route('/api/tickets/<int:ticket_id>/status', methods=['PUT'])
@token_required
def update_ticket_status(current_user, ticket_id):
    """Updates the status of a ticket."""
    try:
        ticket = Ticket.query.get_or_404(ticket_id)
        is_owner = ticket.user_id == current_user.id
        if not is_owner and not current_user.is_admin:
            return jsonify({"message": "Access denied"}), 403

        data = request.json
        if 'status' not in data:
            return jsonify({"message": "Status is required"}), 400

        new_status = data['status']
        comment = data.get('comment', '')
        valid_statuses = ['new', 'in_progress', 'waiting', 'resolved', 'closed']
        if new_status not in valid_statuses:
            return jsonify({"message": "Invalid status"}), 400

        if is_owner and not current_user.is_admin:
            if new_status not in ['closed', 'waiting']:
                return jsonify({"message": "You can only close the ticket or reopen it"}), 403

        ticket.status = new_status
        ticket.updated_at = datetime.datetime.utcnow()

        if comment:
            status_message = TicketMessage(
                ticket_id=ticket.id,
                user_id=current_user.id,
                is_from_admin=current_user.is_admin,
                text=comment,
                is_read=False
            )
            db.session.add(status_message)
            if current_user.is_admin:
                ticket.has_user_unread = True
            else:
                ticket.has_admin_unread = True

        db.session.commit()
        return jsonify({"message": "Ticket status updated successfully","ticket": ticket.to_dict()}), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error updating ticket status: {str(e)}")
        return jsonify({"message": f"Error: {str(e)}"}), 500


@app.route('/api/tickets/unread-count', methods=['GET'])
@token_required
def get_unread_tickets_count(current_user):
    """Gets the count of tickets with unread messages for the current user."""
    try:
        unread_tickets = Ticket.query.filter_by(user_id=current_user.id,has_user_unread=True).count()
        return jsonify({"unread_tickets": unread_tickets}), 200
    except Exception as e:
        print(f"Error getting unread tickets count: {str(e)}")
        return jsonify({"message": f"Error: {str(e)}"}), 500


# === Error Handlers === #

@app.errorhandler(404)
def not_found(error):
    """Handles 404 Not Found errors."""
    return jsonify({'message': 'Ресурс не найден'}), 404


@app.errorhandler(500)
def internal_error(error):
    """Handles 500 Internal Server Errors."""
    return jsonify({'message': 'Внутренняя ошибка сервера'}), 500


# === Main Execution === #

if __name__ == '__main__':
    with app.app_context():
        try:
            inspect_columns = db.inspect(db.engine).get_columns('user')
            column_names = [column['name'] for column in inspect_columns]
            with db.engine.connect() as connection:
                if 'role' not in column_names:
                    connection.execute(db.text("ALTER TABLE user ADD COLUMN role VARCHAR(20) DEFAULT NULL"))
                if 'verification_status' not in column_names:
                    connection.execute(db.text("ALTER TABLE user ADD COLUMN verification_status VARCHAR(20) DEFAULT NULL"))
                if 'student_card_image' not in column_names:
                    connection.execute(db.text("ALTER TABLE user ADD COLUMN student_card_image VARCHAR(255) DEFAULT NULL"))
                if 'full_name' not in column_names:
                    connection.execute(db.text("ALTER TABLE user ADD COLUMN full_name VARCHAR(255) DEFAULT NULL"))
                if 'group' not in column_names:
                    connection.execute(db.text("ALTER TABLE user ADD COLUMN `group` VARCHAR(50) DEFAULT NULL"))
                if 'faculty' not in column_names:
                    connection.execute(db.text("ALTER TABLE user ADD COLUMN faculty VARCHAR(255) DEFAULT NULL"))
                if 'email' not in column_names:
                    print("Adding missing email column to user table")
                    connection.execute(db.text("ALTER TABLE user ADD COLUMN email VARCHAR(120) DEFAULT NULL UNIQUE"))
                connection.commit()
            print("База данных успешно обновлена")
        except Exception as e:
            print(f"Ошибка при обновлении базы данных: {str(e)}")

        # Check for password_plain column and add if missing (for admin compatibility)
        try:
            inspect_columns = db.inspect(db.engine).get_columns('user')
            column_names = [column['name'] for column in inspect_columns]
            if 'password_plain' not in column_names:
                 print("Adding missing password_plain column to user table")
                 with db.engine.connect() as connection:
                     connection.execute(db.text("ALTER TABLE user ADD COLUMN password_plain VARCHAR(255) DEFAULT NULL"))
                     connection.commit()
                 print("password_plain column added.")
        except Exception as e:
             print(f"Error checking/adding password_plain column: {str(e)}")

    app.run(debug=True, host='0.0.0.0', port=5001)
