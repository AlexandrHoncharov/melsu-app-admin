from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify
import os
import requests
import pymysql
from functools import wraps
from db import db
from datetime import datetime
from sqlalchemy import text
import re

# Создание экземпляра приложения
app = Flask(__name__)
app.config.from_object('config')

# Инициализация базы данных с приложением
db.init_app(app)

# Импорт моделей ПОСЛЕ инициализации db
from models import User, Teacher, Schedule, ScheduleTeacher


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