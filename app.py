from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify
import os
import requests
import pymysql
from functools import wraps
from db import db
from datetime import datetime

# Создание экземпляра приложения
app = Flask(__name__)
app.config.from_object('config')

# Инициализация базы данных с приложением
db.init_app(app)

# Импорт моделей ПОСЛЕ инициализации db
from models import User, Teacher, Schedule


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
    with app.app_context():
        if User.query.count() == 0:
            admin = User(username='admin', password='admin')
            db.session.add(admin)
            db.session.commit()
            print("Создан начальный админ: admin / admin")


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
                port=3306
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

                # Если используются фильтры, удаляем только соответствующие записи
                if semester or group:
                    delete_query = "DELETE FROM schedule WHERE 1=1"
                    delete_params = []

                    if semester:
                        delete_query += " AND semester = :semester"
                        delete_params.append({"name": "semester", "value": int(semester)})

                    if group:
                        delete_query += " AND group_name = :group"
                        delete_params.append({"name": "group", "value": group})

                    # Выполняем удаление с параметрами
                    db.session.execute(delete_query, delete_params)
                else:
                    # Если фильтров нет, очищаем всю таблицу
                    Schedule.query.delete()

                db.session.commit()

                # Обрабатываем данные пакетами
                while True:
                    records = cursor.fetchmany(batch_size)
                    if not records:
                        break

                    for record in records:
                        new_schedule = Schedule(
                            semester=record[0],
                            week_number=record[1],
                            group_name=record[2],
                            course=record[3],
                            faculty=record[4],
                            subject=record[5],
                            lesson_type=record[6],
                            subgroup=record[7],
                            date=record[8],
                            time_start=record[9],
                            time_end=record[10],
                            weekday=record[11],
                            teacher_name=record[12],
                            auditory=record[13]
                        )
                        db.session.add(new_schedule)

                    # Сохраняем пакет и очищаем сессию
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


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        create_initial_admin()
    app.run(debug=True)