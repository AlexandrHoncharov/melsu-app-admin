from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify, send_from_directory, abort
import os
import requests
import pymysql
from functools import wraps
from db import db
from datetime import datetime, timedelta
from werkzeug.utils import secure_filename
import uuid
from sqlalchemy import text
import re


# Создание экземпляра приложения
app = Flask(__name__)
app.config.from_object('config')

# Инициализация базы данных с приложением
db.init_app(app)

# Импорт моделей ПОСЛЕ инициализации db
from models import User, Teacher, Schedule, ScheduleTeacher, VerificationLog, DeviceToken, Ticket, TicketAttachment, TicketMessage

# Папка для хранения загруженных изображений
UPLOAD_FOLDER = 'uploads'
STUDENT_CARDS_FOLDER = os.path.join(UPLOAD_FOLDER, 'student_cards')
TICKET_ATTACHMENTS_FOLDER = os.path.join(UPLOAD_FOLDER, 'ticket_attachments')

app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

# Remove this: from api import send_push_message

# Instead, add the function directly:
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

# Определяем login_required локально
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)

    return decorated_function


# Создание первого администратора
def create_initial_admin():
    try:
        with app.app_context():
            # Проверяем наличие администратора по имени пользователя
            if User.query.filter_by(username='admin').first() is None:
                admin = User(username='admin', password='admin')
                db.session.add(admin)
                db.session.commit()
                print("Создан начальный админ: admin / admin")
    except Exception as e:
        print(f"Ошибка при создании администратора: {str(e)}")
        # Не возбуждаем исключение дальше, чтобы не прерывать запуск приложения


@app.route('/')
@login_required
def index():
    return render_template('base.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')

        user = User.query.filter_by(username=username).first()

        if user and user.check_password(password):
            session['user_id'] = user.id
            return redirect(url_for('index'))
        else:
            flash('Неверный логин или пароль', 'error')

    return render_template('auth/login.html')


@app.route('/logout')
def logout():
    session.pop('user_id', None)
    return redirect(url_for('login'))


@app.route('/teachers')
@login_required
def teachers_list():
    search_query = request.args.get('search', '')

    if search_query:
        # Поиск по имени, должности или кафедре
        teachers = Teacher.query.filter(
            db.or_(
                Teacher.name.ilike(f'%{search_query}%'),
                Teacher.position.ilike(f'%{search_query}%'),
                Teacher.department.ilike(f'%{search_query}%')
            )
        ).all()
    else:
        teachers = Teacher.query.all()

    return render_template('teachers/list.html', teachers=teachers, search_query=search_query)


@app.route('/teachers/sync', methods=['GET', 'POST'])
@login_required
def sync_teachers():
    if request.method == 'POST':
        api_url = request.form.get('api_url')
        try:
            response = requests.get(api_url)
            teachers_data = response.json()

            # Очистим существующую информацию о преподавателях, у которых нет аккаунтов
            Teacher.query.filter_by(has_account=False).delete()

            # Добавим новых преподавателей
            for teacher_info in teachers_data:
                # Проверим, что данные в ожидаемом формате
                if len(teacher_info) >= 3:
                    name = teacher_info[0]
                    position = teacher_info[1]
                    department = teacher_info[2]

                    # Проверим, существует ли уже такой преподаватель
                    existing = Teacher.query.filter_by(
                        name=name,
                        position=position,
                        department=department
                    ).first()

                    if not existing:
                        new_teacher = Teacher(
                            name=name,
                            position=position,
                            department=department
                        )
                        db.session.add(new_teacher)

            db.session.commit()
            flash('Данные преподавателей успешно синхронизированы', 'success')
        except Exception as e:
            flash(f'Ошибка при синхронизации: {str(e)}', 'error')

        return redirect(url_for('teachers_list'))

    return render_template('teachers/sync.html')

def get_attachment_info(message_id):
    """
    Retrieve attachment information for a ticket message
    """
    try:
        # Query the TicketAttachment model
        attachment = TicketAttachment.query.filter_by(message_id=message_id).first()
        return attachment
    except Exception as e:
        print(f"Error retrieving attachment info: {str(e)}")
        return None

@app.context_processor
def utility_processor():
    return {
        'get_attachment_info': get_attachment_info
    }

@app.context_processor
def utility_processor():
    return {
        'hasattr': hasattr,  # Make hasattr available in templates
    }

@app.route('/teachers/create_account/<int:teacher_id>')
@login_required
def create_teacher_account(teacher_id):
    try:
        teacher = Teacher.query.get_or_404(teacher_id)

        if teacher.has_account:
            flash('У этого преподавателя уже есть учетная запись', 'warning')
            return redirect(url_for('teachers_list'))

        # Генерируем логин и пароль
        username, password = Teacher.generate_credentials()

        # Создаем нового пользователя
        new_user = User(
            username=username,
            password=password,
            is_admin=False
        )

        # Устанавливаем роль 'teacher' и другие важные поля
        new_user.role = 'teacher'
        new_user.full_name = teacher.name
        new_user.verification_status = 'verified'  # Преподаватели не требуют верификации

        # Если у преподавателя есть отдел, добавляем его в department поле в метаданных
        if teacher.department:
            new_user.faculty = teacher.department

        db.session.add(new_user)
        db.session.flush()  # чтобы получить ID пользователя

        # Обновляем информацию о преподавателе
        teacher.has_account = True
        teacher.user_id = new_user.id

        db.session.commit()

        flash(f'Создана учетная запись для {teacher.name}. Логин: {username}, Пароль: {password}', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Ошибка при создании учетной записи: {str(e)}', 'error')
        print(f"Ошибка при создании учетной записи: {str(e)}")

    return redirect(url_for('teachers_list'))


# Добавьте следующие маршруты в файл app.py

# Маршрут для страницы со списком тикетов
@app.route('/tickets')
@login_required
def tickets_list():
    """Отображение списка тикетов для администратора"""
    # Получаем параметры фильтрации
    status = request.args.get('status', 'all')
    category = request.args.get('category', 'all')
    search_query = request.args.get('search', '')
    page = request.args.get('page', 1, type=int)
    per_page = 20  # Количество тикетов на странице

    # Базовый запрос
    query = Ticket.query

    # Применяем фильтры
    if status != 'all':
        query = query.filter_by(status=status)

    if category != 'all':
        query = query.filter_by(category=category)

    # Поиск по заголовку тикета или имени пользователя
    if search_query:
        query = query.join(User, Ticket.user_id == User.id).filter(
            db.or_(
                Ticket.title.ilike(f'%{search_query}%'),
                User.full_name.ilike(f'%{search_query}%'),
                User.username.ilike(f'%{search_query}%')
            )
        )

    # Сортировка по дате обновления (сначала новые)
    query = query.order_by(Ticket.updated_at.desc())

    # Пагинация
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    tickets = pagination.items

    # Получаем список категорий и статусов для фильтрации
    categories = [
        {'value': 'all', 'label': 'Все категории'},
        {'value': 'technical', 'label': 'Техническая проблема'},
        {'value': 'schedule', 'label': 'Проблема с расписанием'},
        {'value': 'verification', 'label': 'Вопрос по верификации'},
        {'value': 'other', 'label': 'Другое'}
    ]

    statuses = [
        {'value': 'all', 'label': 'Все статусы'},
        {'value': 'new', 'label': 'Новый'},
        {'value': 'in_progress', 'label': 'В обработке'},
        {'value': 'waiting', 'label': 'Требует уточнения'},
        {'value': 'resolved', 'label': 'Решен'},
        {'value': 'closed', 'label': 'Закрыт'}
    ]

    return render_template(
        'tickets/list.html',
        tickets=tickets,
        pagination=pagination,
        categories=categories,
        statuses=statuses,
        current_status=status,
        current_category=category,
        search_query=search_query
    )


@app.route('/tickets/<int:ticket_id>')
@login_required
def view_ticket(ticket_id):
    """Просмотр деталей тикета и его сообщений"""
    # Получаем тикет
    ticket = db.session.get(Ticket, ticket_id)
    if not ticket:
        abort(404)

    # Получаем пользователя, создавшего тикет
    user = User.query.get(ticket.user_id)

    # Получаем все сообщения тикета и сортируем их по дате
    messages = TicketMessage.query.filter_by(ticket_id=ticket.id).order_by(TicketMessage.created_at).all()

    # Отмечаем сообщения как прочитанные администратором
    if ticket.has_admin_unread:
        unread_messages = TicketMessage.query.filter_by(
            ticket_id=ticket.id,
            is_from_admin=False,
            is_read=False
        ).all()

        for message in unread_messages:
            message.is_read = True

        ticket.has_admin_unread = False
        db.session.commit()

    # Получаем данные о прикрепленных файлах
    for message in messages:
        if message.attachment:
            attachment = TicketAttachment.query.filter_by(message_id=message.id).first()
            if attachment:
                message.attachment_info = attachment

    # Категории и статусы для отображения
    categories = {
        'technical': 'Техническая проблема',
        'schedule': 'Проблема с расписанием',
        'verification': 'Вопрос по верификации',
        'other': 'Другое'
    }

    statuses = {
        'new': {'label': 'Новый', 'color': 'blue'},
        'in_progress': {'label': 'В обработке', 'color': 'yellow'},
        'waiting': {'label': 'Требует уточнения', 'color': 'orange'},
        'resolved': {'label': 'Решен', 'color': 'green'},
        'closed': {'label': 'Закрыт', 'color': 'gray'}
    }

    return render_template(
        'tickets/view.html',
        ticket=ticket,
        user=user,
        messages=messages,
        categories=categories,
        statuses=statuses
    )


@app.route('/tickets/<int:ticket_id>/reply', methods=['POST'])
@login_required
def reply_to_ticket(ticket_id):
    """Ответ администратора на тикет"""
    # Получаем тикет
    ticket = Ticket.query.get_or_404(ticket_id)

    # Получаем данные из формы
    text = request.form.get('text', '').strip()
    new_status = request.form.get('status', ticket.status)

    # Проверяем, что сообщение не пустое или есть прикрепленный файл
    has_attachment = 'attachment' in request.files and request.files['attachment'].filename
    if not text and not has_attachment:
        flash('Текст сообщения не может быть пустым', 'error')
        return redirect(url_for('view_ticket', ticket_id=ticket_id))

    try:
        # Создаем новое сообщение
        message = TicketMessage(
            ticket_id=ticket.id,
            user_id=session['user_id'],  # ID текущего админа
            is_from_admin=True,
            text=text,
            is_read=False
        )

        # Обрабатываем прикрепленный файл, если он есть
        if has_attachment:
            file = request.files['attachment']

            # Генерируем уникальное имя файла
            original_filename = secure_filename(file.filename)
            file_ext = os.path.splitext(original_filename)[1]
            filename = f"{uuid.uuid4()}{file_ext}"
            file_path = os.path.join(TICKET_ATTACHMENTS_FOLDER, filename)

            # Убедитесь, что директория существует
            os.makedirs(TICKET_ATTACHMENTS_FOLDER, exist_ok=True)

            # Сохраняем файл
            file.save(file_path)
            file_size = os.path.getsize(file_path)

            # Определяем тип файла
            if file_ext.lower() in ['.jpg', '.jpeg', '.png', '.gif']:
                file_type = 'image'
            else:
                file_type = 'document'

            # Добавляем информацию о вложении в сообщение
            message.attachment = filename

            # Создаем запись о вложении
            attachment = TicketAttachment(
                message_id=0,  # Временное значение, обновим после flush
                filename=filename,
                original_filename=original_filename,
                file_type=file_type,
                file_size=file_size
            )

            db.session.add(message)
            db.session.flush()  # Получаем ID сообщения

            # Обновляем ID сообщения в записи о вложении
            attachment.message_id = message.id
            db.session.add(attachment)
        else:
            db.session.add(message)

        # Обновляем статус тикета, если он изменился
        if new_status != ticket.status:
            ticket.status = new_status

        # Обновляем флаги чтения и время обновления
        ticket.has_user_unread = True
        ticket.updated_at = datetime.utcnow()

        db.session.commit()

        # Отправляем уведомление пользователю
        try:
            # Получаем токены устройств пользователя
            device_tokens = DeviceToken.query.filter_by(user_id=ticket.user_id).all()

            if device_tokens:
                # Формируем данные уведомления
                notification_title = "Новый ответ в обращении"
                notification_body = f"Получен ответ на ваше обращение: {ticket.title}"

                # Отправляем уведомление на каждое устройство
                for token_obj in device_tokens:
                    send_push_message(
                        token_obj.token,
                        notification_title,
                        notification_body,
                        {
                            'type': 'ticket_message',
                            'ticket_id': int(ticket.id) if ticket.id is not None else None,
                            'timestamp': datetime.utcnow().isoformat()
                        }
                    )
        except Exception as notify_error:
            # Логируем ошибку, но не прерываем основной процесс
            print(f"Error sending notification: {str(notify_error)}")

        flash('Ответ успешно отправлен', 'success')
    except Exception as e:
        db.session.rollback()
        print(f"Error in reply_to_ticket: {str(e)}")
        flash(f'Ошибка при отправке ответа: {str(e)}', 'error')

    return redirect(url_for('view_ticket', ticket_id=ticket_id))


@app.route('/tickets/dashboard')
@login_required
def tickets_dashboard():
    """Панель статистики по тикетам"""
    try:
        # Общая статистика
        total_tickets = Ticket.query.count()
        open_tickets = Ticket.query.filter(Ticket.status.in_(['new', 'in_progress', 'waiting'])).count()
        resolved_tickets = Ticket.query.filter_by(status='resolved').count()
        closed_tickets = Ticket.query.filter_by(status='closed').count()

        # Статистика по категориям
        categories = {
            'technical': 'Техническая проблема',
            'schedule': 'Проблема с расписанием',
            'verification': 'Вопрос по верификации',
            'other': 'Другое'
        }

        category_stats = []
        for category_code, category_name in categories.items():
            count = Ticket.query.filter_by(category=category_code).count()
            category_stats.append({
                'code': category_code,
                'name': category_name,
                'count': count,
                'percentage': round((count / total_tickets * 100) if total_tickets > 0 else 0, 1)
            })

        # Статистика по времени ответа (средняя и максимальная)
        # Это более сложная статистика, которую можно реализовать с помощью SQL-запросов

        # Список администраторов с количеством обработанных тикетов
        admin_stats_query = db.session.query(
            User.id, User.username, User.full_name,
            db.func.count(db.distinct(TicketMessage.ticket_id)).label('tickets_count')
        ).join(
            TicketMessage, TicketMessage.user_id == User.id
        ).filter(
            User.is_admin == True,
            TicketMessage.is_from_admin == True
        ).group_by(
            User.id
        ).order_by(
            db.desc('tickets_count')
        ).all()

        admin_stats = [
            {
                'id': admin.id,
                'username': admin.username,
                'full_name': admin.full_name or admin.username,
                'tickets_count': admin.tickets_count
            }
            for admin in admin_stats_query
        ]

        # Получение данных для графика количества тикетов по дням
        # Для простоты ограничимся последними 30 днями
        today = datetime.today().date()
        start_date = today - timedelta(days=29)

        tickets_by_day_query = db.session.query(
            db.func.date(Ticket.created_at).label('date'),
            db.func.count(Ticket.id).label('count')
        ).filter(
            db.func.date(Ticket.created_at) >= start_date
        ).group_by(
            'date'
        ).order_by(
            'date'
        ).all()

        # Создаем полный словарь дат для всех 30 дней, заполняя нулями отсутствующие дни
        tickets_by_day = {}
        for i in range(30):
            day = start_date + timedelta(days=i)
            tickets_by_day[day.strftime('%Y-%m-%d')] = 0

        # Заполняем реальными данными
        for record in tickets_by_day_query:
            date_str = record.date.strftime('%Y-%m-%d')
            tickets_by_day[date_str] = record.count

        # Преобразуем в формат для графика
        chart_data = [
            {
                'date': date,
                'count': count,
                'date_formatted': datetime.strptime(date, '%Y-%m-%d').strftime('%d.%m')
            }
            for date, count in tickets_by_day.items()
        ]

        return render_template(
            'tickets/dashboard.html',
            total_tickets=total_tickets,
            open_tickets=open_tickets,
            resolved_tickets=resolved_tickets,
            closed_tickets=closed_tickets,
            category_stats=category_stats,
            admin_stats=admin_stats,

            chart_data=chart_data
        )

    except Exception as e:
        flash(f'Ошибка при загрузке статистики: {str(e)}', 'error')
        return redirect(url_for('tickets_list'))


@app.route('/uploads/ticket_attachments/<filename>')
@login_required
def get_ticket_attachment_admin(filename):
    """Получение прикрепленного файла для администратора"""
    try:
        # Находим запись о прикрепленном файле
        attachment = TicketAttachment.query.filter_by(filename=filename).first_or_404()

        return send_from_directory(TICKET_ATTACHMENTS_FOLDER, filename,
                                   as_attachment=request.args.get('download') == '1',
                                   download_name=attachment.original_filename if request.args.get(
                                       'download') == '1' else None)

    except Exception as e:
        flash(f'Ошибка при получении файла: {str(e)}', 'error')
        return redirect(url_for('tickets_list'))

@app.route('/teachers/view_credentials/<int:teacher_id>')
@login_required
def view_teacher_credentials(teacher_id):
    teacher = Teacher.query.get_or_404(teacher_id)

    if not teacher.has_account or not teacher.user_id:
        flash('У этого преподавателя нет учетной записи', 'error')
        return redirect(url_for('teachers_list'))

    user = User.query.get(teacher.user_id)
    if not user:
        flash('Учетная запись не найдена', 'error')
        return redirect(url_for('teachers_list'))

    return render_template('teachers/credentials.html', teacher=teacher, user=user)


@app.route('/schedule')
@login_required
def schedule_list():
    search_query = request.args.get('search', '')
    group_filter = request.args.get('group', '')
    date_filter = request.args.get('date', '')
    subgroup_filter = request.args.get('subgroup', '')
    page = request.args.get('page', 1, type=int)
    per_page = 50  # Количество записей на странице

    query = Schedule.query

    if search_query:
        query = query.filter(
            db.or_(
                Schedule.subject.ilike(f'%{search_query}%'),
                Schedule.teacher_name.ilike(f'%{search_query}%'),
                Schedule.auditory.ilike(f'%{search_query}%')
            )
        )

    if group_filter:
        query = query.filter(Schedule.group_name == group_filter)

    if date_filter:
        try:
            filter_date = datetime.strptime(date_filter, '%Y-%m-%d').date()
            query = query.filter(Schedule.date == filter_date)
        except ValueError:
            flash('Неверный формат даты', 'error')

    if subgroup_filter:
        try:
            subgroup_val = int(subgroup_filter)
            query = query.filter(Schedule.subgroup == subgroup_val)
        except ValueError:
            pass

    # Получаем уникальные группы для фильтра
    groups = db.session.query(Schedule.group_name).distinct().all()
    group_names = [g[0] for g in groups]

    # Получаем уникальные подгруппы для фильтра
    subgroups = db.session.query(Schedule.subgroup).distinct().order_by(Schedule.subgroup).all()
    subgroup_values = [s[0] for s in subgroups]

    # Применяем сортировку и пагинацию
    pagination = query.order_by(Schedule.date, Schedule.time_start).paginate(
        page=page, per_page=per_page, error_out=False
    )
    schedules = pagination.items

    return render_template('schedule/list.html',
                           schedules=schedules,
                           pagination=pagination,
                           search_query=search_query,
                           group_filter=group_filter,
                           date_filter=date_filter,
                           subgroup_filter=subgroup_filter,
                           group_names=group_names,
                           subgroup_values=subgroup_values)


@app.route('/schedule/sync', methods=['GET', 'POST'])
@login_required
def sync_schedule():
    if request.method == 'POST':
        try:
            # Получаем выбранные фильтры из формы
            semester = request.form.get('semester', '')
            group = request.form.get('group', '')

            # Подключение к внешней MySQL базе данных
            connection = pymysql.connect(
                host='147.45.153.76',
                user='sanumxxx',
                password='Yandex200515_',
                database='timetable',
                port=3306,
                charset='utf8mb4',
                cursorclass=pymysql.cursors.DictCursor,  # Получаем результаты в виде словарей
                connect_timeout=30
            )

            with connection.cursor() as cursor:
                # Базовый запрос
                query = """
                    SELECT 
                        semester, week_number, group_name, course, faculty,
                        subject, lesson_type, subgroup, date, time_start,
                        time_end, weekday, teacher_name, auditory
                    FROM schedule
                    WHERE 1=1
                """
                params = []

                # Добавляем фильтры, если они указаны
                if semester:
                    query += " AND semester = %s"
                    params.append(int(semester))

                if group:
                    query += " AND group_name = %s"
                    params.append(group)

                # Выполняем запрос
                cursor.execute(query, params)

                # Обрабатываем результаты пакетами для эффективной работы с памятью
                batch_size = 1000
                total_records = 0

                # Удаляем записи в соответствии с фильтрами
                if semester or group:
                    filters = {}

                    if semester:
                        filters['semester'] = int(semester)

                    if group:
                        filters['group_name'] = group

                    # Используем фильтры для удаления
                    Schedule.query.filter_by(**filters).delete()
                else:
                    # Если фильтров нет, очищаем всю таблицу (используем SQL для оптимизации)
                    db.session.execute(db.text("TRUNCATE TABLE schedule"))

                db.session.commit()

                # Обрабатываем данные пакетами
                while True:
                    records = cursor.fetchmany(batch_size)
                    if not records:
                        break

                    for record in records:
                        new_schedule = Schedule(
                            semester=record['semester'],
                            week_number=record['week_number'],
                            group_name=record['group_name'],
                            course=record['course'],
                            faculty=record['faculty'],
                            subject=record['subject'],
                            lesson_type=record['lesson_type'],
                            subgroup=record['subgroup'],
                            date=record['date'],
                            time_start=record['time_start'],
                            time_end=record['time_end'],
                            weekday=record['weekday'],
                            teacher_name=record['teacher_name'],
                            auditory=record['auditory']
                        )
                        db.session.add(new_schedule)

                    # Сохраняем пакет и очищаем сессию для освобождения памяти
                    db.session.commit()
                    db.session.expire_all()
                    total_records += len(records)

            flash(f'Расписание успешно синхронизировано. Обработано {total_records} записей.', 'success')

        except Exception as e:
            db.session.rollback()
            flash(f'Ошибка при синхронизации расписания: {str(e)}', 'error')
            print(f"Ошибка при синхронизации расписания: {str(e)}")

        return redirect(url_for('schedule_list'))

    # Получение списка семестров и групп для формы
    semesters = db.session.query(db.distinct(Schedule.semester)).order_by(Schedule.semester).all()
    groups = db.session.query(db.distinct(Schedule.group_name)).order_by(Schedule.group_name).all()

    return render_template('schedule/sync.html',
                           semesters=[s[0] for s in semesters if s[0] is not None],
                           groups=[g[0] for g in groups if g[0] is not None])


@app.route('/schedule/teachers')
@login_required
def schedule_teachers_list():
    search_query = request.args.get('search', '')
    page = request.args.get('page', 1, type=int)
    per_page = 50

    query = ScheduleTeacher.query.filter_by(active=True)

    if search_query:
        query = query.filter(ScheduleTeacher.name.ilike(f'%{search_query}%'))

    # Применяем сортировку и пагинацию
    pagination = query.order_by(ScheduleTeacher.name).paginate(
        page=page, per_page=per_page, error_out=False
    )
    teachers = pagination.items

    return render_template('schedule/teachers_list.html',
                           teachers=teachers,
                           pagination=pagination,
                           search_query=search_query)


@app.route('/schedule/teachers/generate', methods=['POST'])
@login_required
def generate_schedule_teachers():
    try:
        # Получаем уникальный список преподавателей из расписания
        unique_teachers = db.session.query(Schedule.teacher_name).distinct().all()
        teacher_names = [t[0] for t in unique_teachers if t[0] and len(t[0].strip()) > 1]

        # Отфильтруем некорректные записи (дефисы, одиночные символы и т.д.)
        valid_teachers = []
        for name in teacher_names:
            name = name.strip()
            # Пропускаем дефисы, прочерки и очень короткие имена
            if name == '-' or name == '–' or name == '—' or len(name) < 2:
                continue
            valid_teachers.append(name)

        # Добавляем записи в базу данных
        added_count = 0
        for name in valid_teachers:
            # Проверяем, существует ли уже такой преподаватель
            existing = ScheduleTeacher.query.filter_by(name=name).first()
            if not existing:
                teacher = ScheduleTeacher(name=name)
                db.session.add(teacher)
                added_count += 1

        db.session.commit()
        flash(f'Успешно добавлено {added_count} преподавателей из расписания', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Ошибка при создании списка преподавателей: {str(e)}', 'error')

    return redirect(url_for('schedule_teachers_list'))


@app.route('/schedule/teachers/delete/<int:teacher_id>', methods=['POST'])
@login_required
def delete_schedule_teacher(teacher_id):
    try:
        teacher = ScheduleTeacher.query.get_or_404(teacher_id)

        # Вместо удаления, просто помечаем как неактивный
        teacher.active = False
        db.session.commit()

        flash('Преподаватель удален из списка', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Ошибка при удалении преподавателя: {str(e)}', 'error')

    return redirect(url_for('schedule_teachers_list'))


@app.route('/teachers/match/<int:teacher_id>')
@login_required
def match_teacher_form(teacher_id):
    hr_teacher = Teacher.query.get_or_404(teacher_id)

    # Получаем все активные преподаватели из расписания, которые еще не сопоставлены
    schedule_teachers = ScheduleTeacher.query.filter_by(
        active=True,
        mapped_teacher_id=None
    ).order_by(ScheduleTeacher.name).all()

    # Для уже сопоставленных с данным преподавателем
    matched_teachers = ScheduleTeacher.query.filter_by(
        mapped_teacher_id=teacher_id
    ).all()

    # Попытаемся найти потенциальные совпадения
    suggested_matches = find_similar_teachers(hr_teacher.name, schedule_teachers)

    return render_template('teachers/match.html',
                           hr_teacher=hr_teacher,
                           schedule_teachers=schedule_teachers,
                           matched_teachers=matched_teachers,
                           suggested_matches=suggested_matches)


@app.route('/teachers/match', methods=['POST'])
@login_required
def match_teacher():
    try:
        hr_teacher_id = request.form.get('hr_teacher_id', type=int)
        schedule_teacher_id = request.form.get('schedule_teacher_id', type=int)

        if not hr_teacher_id or not schedule_teacher_id:
            flash('Не указаны обязательные параметры', 'error')
            return redirect(url_for('teachers_list'))

        # Получаем объекты из базы
        hr_teacher = Teacher.query.get_or_404(hr_teacher_id)
        schedule_teacher = ScheduleTeacher.query.get_or_404(schedule_teacher_id)

        # Устанавливаем связь
        schedule_teacher.mapped_teacher_id = hr_teacher_id
        db.session.commit()

        flash(f'Преподаватель "{schedule_teacher.name}" успешно сопоставлен с "{hr_teacher.name}"', 'success')

        # Возвращаемся к форме сопоставления
        return redirect(url_for('match_teacher_form', teacher_id=hr_teacher_id))

    except Exception as e:
        db.session.rollback()
        flash(f'Ошибка при сопоставлении преподавателей: {str(e)}', 'error')
        return redirect(url_for('teachers_list'))


@app.route('/teachers/unmatch', methods=['POST'])
@login_required
def unmatch_teacher():
    try:
        schedule_teacher_id = request.form.get('schedule_teacher_id', type=int)

        if not schedule_teacher_id:
            flash('Не указан ID преподавателя расписания', 'error')
            return redirect(url_for('teachers_list'))

        schedule_teacher = ScheduleTeacher.query.get_or_404(schedule_teacher_id)
        hr_teacher_id = schedule_teacher.mapped_teacher_id

        # Удаляем связь
        schedule_teacher.mapped_teacher_id = None
        db.session.commit()

        flash('Сопоставление удалено', 'success')

        # Возвращаемся к форме сопоставления, если есть hr_teacher_id
        if hr_teacher_id:
            return redirect(url_for('match_teacher_form', teacher_id=hr_teacher_id))
        else:
            return redirect(url_for('teachers_list'))

    except Exception as e:
        db.session.rollback()
        flash(f'Ошибка при удалении сопоставления: {str(e)}', 'error')
        return redirect(url_for('teachers_list'))


def find_similar_teachers(hr_teacher_name, schedule_teachers):
    """
    Находит потенциальные совпадения между именем преподавателя из отдела кадров
    и именами преподавателей из расписания.
    """
    # Разбиваем полное имя на части
    name_parts = hr_teacher_name.split()
    if not name_parts:
        return []

    # Получаем фамилию и инициалы
    surname = name_parts[0]

    # Создаем инициалы
    initials = ""
    if len(name_parts) > 1:
        for i in range(1, min(3, len(name_parts))):
            if name_parts[i]:
                initials += name_parts[i][0] + "."

    # Варианты написания имени
    name_variants = [
        surname,  # Только фамилия
        f"{surname} {initials}",  # Фамилия и инициалы с пробелом
        f"{surname} {initials.replace('.', '')}" if initials else "",  # Фамилия и инициалы без точек
        f"{surname}{initials}",  # Фамилия и инициалы без пробела
        f"{surname}{initials.replace('.', '')}" if initials else ""  # Фамилия и инициалы без пробела и точек
    ]

    # Дополнительные варианты с перестановкой инициалов
    if len(name_parts) > 2:
        reversed_initials = ""
        if len(name_parts) >= 3:
            reversed_initials = name_parts[2][0] + "." + name_parts[1][0] + "."
            name_variants.append(f"{surname} {reversed_initials}")
            name_variants.append(f"{surname}{reversed_initials}")
            name_variants.append(f"{surname} {reversed_initials.replace('.', '')}")
            name_variants.append(f"{surname}{reversed_initials.replace('.', '')}")

    # Находим потенциальные совпадения
    matches = []
    for teacher in schedule_teachers:
        teacher_name = teacher.name.strip()

        # Прямое совпадение с одним из вариантов
        if any(variant and teacher_name.lower().startswith(variant.lower()) for variant in name_variants if variant):
            matches.append((teacher, 100))  # 100% совпадение
            continue

        # Проверка на фамилию
        if surname.lower() in teacher_name.lower():
            # Если содержит фамилию, оцениваем схожесть
            similarity = 70  # Базовая схожесть, если найдена фамилия

            # Проверка на инициалы
            if initials:
                initials_without_dots = initials.replace(".", "")
                if initials in teacher_name:
                    similarity += 20
                elif initials_without_dots in teacher_name:
                    similarity += 15

                # Проверка на отдельные инициалы
                for i in range(len(initials_without_dots)):
                    if initials_without_dots[i] in teacher_name:
                        similarity += 5

            matches.append((teacher, similarity))

    # Сортируем по убыванию схожести
    matches.sort(key=lambda x: x[1], reverse=True)

    # Возвращаем только совпадения с схожестью выше 70%
    return [(teacher, score) for teacher, score in matches if score >= 70]


# NEW ROUTES FOR STUDENT VERIFICATION

@app.route('/verification/students')
@login_required
def student_verification_list():
    """List students pending verification"""
    # Get the status filter from the query parameters
    status = request.args.get('status', 'pending')
    search_query = request.args.get('search', '')
    page = request.args.get('page', 1, type=int)
    per_page = 20  # Number of records per page

    # Build query
    query = User.query.filter_by(role='student')

    # Apply status filter if not 'all'
    if status != 'all':
        query = query.filter_by(verification_status=status)

    # Apply search filter if provided
    if search_query:
        query = query.filter(
            db.or_(
                User.username.ilike(f'%{search_query}%'),
                User.full_name.ilike(f'%{search_query}%'),
                User.group.ilike(f'%{search_query}%')
            )
        )

    # Execute query with pagination
    pagination = query.order_by(User.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    students = pagination.items

    return render_template(
        'verification/students.html',
        students=students,
        pagination=pagination,
        status=status
    )


@app.route('/verification/students/<int:student_id>')
@login_required
def view_student_details(student_id):
    """View student verification details"""
    student = User.query.filter_by(id=student_id, role='student').first_or_404()
    return render_template('verification/student_details.html', student=student)


# Обновите функцию verify_student в app.py

@app.route('/verification/students/verify', methods=['POST'])
@login_required
def verify_student():
    """Approve or reject student verification"""
    student_id = request.form.get('student_id', type=int)
    action = request.form.get('action')
    comment = request.form.get('comment', '')

    if not student_id or action not in ['approve', 'reject']:
        flash('Неверные параметры', 'error')
        return redirect(url_for('student_verification_list'))

    student = User.query.filter_by(id=student_id, role='student').first()

    if not student:
        flash('Студент не найден', 'error')
        return redirect(url_for('student_verification_list'))

    # Get current admin user
    admin_id = session.get('user_id')

    # Save previous status for logging
    previous_status = student.verification_status

    # Update verification status
    if action == 'approve':
        student.verification_status = 'verified'
        flash(f'Верификация студента {student.full_name} подтверждена', 'success')
        action_name = 'approve'
        notification_title = 'Верификация подтверждена'
        notification_body = 'Ваш студенческий билет успешно прошел проверку!'
        if not comment:
            comment = 'Верификация одобрена администратором'
    else:  # reject
        student.verification_status = 'rejected'
        flash(f'Верификация студента {student.full_name} отклонена', 'error')
        action_name = 'reject'
        notification_title = 'Верификация отклонена'
        notification_body = 'Ваш студенческий билет не прошел проверку. Пожалуйста, загрузите новую фотографию.'
        if not comment:
            comment = 'Верификация отклонена администратором'

    # Create verification log entry
    log_entry = VerificationLog(
        student_id=student_id,
        admin_id=admin_id,
        action=action_name,
        status_before=previous_status,
        status_after=student.verification_status,
        comment=comment
    )

    db.session.add(log_entry)
    db.session.commit()

    # Отправляем push-уведомление на все устройства студента
    try:
        # Получаем все токены устройств студента
        tokens = DeviceToken.query.filter_by(user_id=student_id).all()

        # Доп. данные для push-уведомления
        extra_data = {
            'type': 'verification',
            'status': student.verification_status,
            'timestamp': datetime.now().isoformat()  # Correct if imported as: from datetime import datetime
        }

        # Отправляем уведомления на все устройства
        for token_obj in tokens:
            send_push_message(
                token_obj.token,
                notification_title,
                notification_body,
                extra_data
            )

        print(f"Отправлено уведомление на {len(tokens)} устройств пользователя {student_id}")
    except Exception as e:
        print(f"Ошибка при отправке push-уведомления: {str(e)}")

    # Redirect back to the detail page if coming from there
    referrer = request.referrer
    if referrer and 'students/' + str(student_id) in referrer:
        return redirect(url_for('view_student_details', student_id=student_id))

    return redirect(url_for('student_verification_list'))
# Add this route to your app.py file

@app.route('/students')
@login_required
def students_list():
    """List all students with filtering options"""
    # Get the filter parameters
    status = request.args.get('status', 'all')
    search_query = request.args.get('search', '')
    page = request.args.get('page', 1, type=int)
    per_page = 20  # Number of records per page

    # Build query
    query = User.query.filter_by(role='student')

    # Apply status filter if not 'all'
    if status != 'all':
        query = query.filter_by(verification_status=status)

    # Apply search filter if provided
    if search_query:
        query = query.filter(
            db.or_(
                User.username.ilike(f'%{search_query}%'),
                User.full_name.ilike(f'%{search_query}%'),
                User.group.ilike(f'%{search_query}%')
            )
        )

    # Execute query with pagination
    pagination = query.order_by(User.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    students = pagination.items

    return render_template(
        'students/list.html',
        students=students,
        pagination=pagination,
        status=status,
        search_query=search_query
    )

@app.route('/uploads/student_cards/admin/<filename>')
@login_required
def get_student_card_admin(filename):
    """Admin access to student card images"""
    # Only allow admin users to view these images
    return send_from_directory(STUDENT_CARDS_FOLDER, filename)


if __name__ == '__main__':
    try:
        with app.app_context():
            # Проверяем соединение с БД
            db.engine.connect()
            print("Соединение с базой данных установлено")

            # Проверяем существование таблиц, если нет - создаем
            from sqlalchemy import inspect

            inspector = inspect(db.engine)

            if not inspector.has_table('user'):
                print("Таблицы не найдены. Создаем структуру БД...")
                db.create_all()
                print("Структура БД создана")

            create_initial_admin()

        app.run(debug=True)
    except Exception as e:
        print(f"Ошибка при запуске приложения: {str(e)}")
        print("Проверьте настройки подключения к базе данных")