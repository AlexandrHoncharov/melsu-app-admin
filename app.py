from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify
import os
import requests
from functools import wraps
from db import db

# Создание экземпляра приложения
app = Flask(__name__)
app.config.from_object('config')

# Инициализация базы данных с приложением
db.init_app(app)

# Импорт моделей ПОСЛЕ инициализации db
from models import User, Teacher


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


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        create_initial_admin()
    app.run(debug=True)