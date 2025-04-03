# app/teacher/routes.py
import json
import requests
from flask import Blueprint, render_template, url_for, flash, redirect, request, jsonify
from flask_login import login_required, current_user
from app import db, bcrypt
from app.models import Teacher, Department, User
from app.teacher.forms import TeacherForm, APISettingsForm
from app.config import Config

teacher = Blueprint('teacher', __name__)


@teacher.route('/teachers')
@login_required
def teachers_list():
    """Список преподавателей"""
    # Получаем параметры поиска
    search_query = request.args.get('q', '')
    department_id = request.args.get('department', type=int)

    # Базовый запрос
    query = Teacher.query

    # Применяем фильтры поиска, если они есть
    if search_query:
        query = query.filter(Teacher.full_name.ilike(f'%{search_query}%'))

    if department_id:
        query = query.filter_by(department_id=department_id)

    # Получаем список преподавателей
    teachers = query.all()
    departments = Department.query.all()

    return render_template('teacher/list.html', title='Преподаватели',
                           teachers=teachers, departments=departments,
                           search_query=search_query, department_id=department_id)


@teacher.route('/teachers/add', methods=['GET', 'POST'])
@login_required
def add_teacher():
    """Добавление преподавателя"""
    form = TeacherForm()
    form.department.choices = [(d.id, d.name) for d in Department.query.all()]

    if form.validate_on_submit():
        teacher = Teacher(
            full_name=form.full_name.data,
            position=form.position.data,
            department_id=form.department.data
        )
        db.session.add(teacher)
        db.session.commit()
        flash('Преподаватель успешно добавлен!', 'success')
        return redirect(url_for('teacher.teachers_list'))

    return render_template('teacher/add.html', title='Добавление преподавателя', form=form)


@teacher.route('/teachers/edit/<int:teacher_id>', methods=['GET', 'POST'])
@login_required
def edit_teacher(teacher_id):
    """Редактирование преподавателя"""
    teacher = Teacher.query.get_or_404(teacher_id)
    form = TeacherForm()
    form.department.choices = [(d.id, d.name) for d in Department.query.all()]

    if form.validate_on_submit():
        teacher.full_name = form.full_name.data
        teacher.position = form.position.data
        teacher.department_id = form.department.data
        db.session.commit()
        flash('Информация о преподавателе обновлена!', 'success')
        return redirect(url_for('teacher.teachers_list'))
    elif request.method == 'GET':
        form.full_name.data = teacher.full_name
        form.position.data = teacher.position
        if teacher.department_id:
            form.department.data = teacher.department_id

    return render_template('teacher/edit.html', title='Редактирование преподавателя',
                           form=form, teacher=teacher)


@teacher.route('/teachers/delete/<int:teacher_id>', methods=['POST'])
@login_required
def delete_teacher(teacher_id):
    """Удаление преподавателя"""
    teacher = Teacher.query.get_or_404(teacher_id)
    db.session.delete(teacher)
    db.session.commit()
    flash('Преподаватель удален!', 'success')
    return redirect(url_for('teacher.teachers_list'))


@teacher.route('/teachers/sync', methods=['GET', 'POST'])
@login_required
def sync_teachers():
    """Синхронизация преподавателей через API"""
    form = APISettingsForm()

    if form.validate_on_submit():
        api_url = form.api_url.data
        try:
            response = requests.get(api_url)
            if response.status_code == 200:
                data = response.json()
                teachers_added = 0
                departments_added = 0

                for teacher_data in data:
                    full_name = teacher_data[0]
                    position = teacher_data[1]
                    department_name = teacher_data[2]

                    # Проверяем/создаем кафедру
                    department = Department.query.filter_by(name=department_name).first()
                    if not department:
                        department = Department(name=department_name)
                        db.session.add(department)
                        db.session.commit()
                        departments_added += 1

                    # Проверяем существование преподавателя
                    existing_teacher = Teacher.query.filter_by(
                        full_name=full_name,
                        position=position,
                        department_id=department.id
                    ).first()

                    if not existing_teacher:
                        new_teacher = Teacher(
                            full_name=full_name,
                            position=position,
                            department_id=department.id
                        )
                        db.session.add(new_teacher)
                        teachers_added += 1

                db.session.commit()
                flash(
                    f'Синхронизация завершена! Добавлено {departments_added} кафедр и {teachers_added} преподавателей.',
                    'success')
                return redirect(url_for('teacher.teachers_list'))
            else:
                flash(f'Ошибка: API вернул код {response.status_code}', 'danger')
        except Exception as e:
            flash(f'Ошибка при синхронизации: {str(e)}', 'danger')

    return render_template('teacher/sync.html', title='Синхронизация преподавателей', form=form)


@teacher.route('/teachers/generate-credentials/<int:teacher_id>', methods=['POST'])
@login_required
def generate_credentials(teacher_id):
    """Генерация учетных данных для преподавателя"""
    teacher = Teacher.query.get_or_404(teacher_id)

    # Если у преподавателя уже есть пользователь, удаляем его
    if teacher.user_id:
        user = User.query.get(teacher.user_id)
        if user:
            db.session.delete(user)
            db.session.commit()

    # Генерируем новые учетные данные
    credentials = teacher.generate_credentials()

    flash(f'Учетные данные созданы! Логин: {credentials["username"]}, Пароль: {credentials["password"]}', 'success')
    return redirect(url_for('teacher.view_credentials', teacher_id=teacher.id))


@teacher.route('/teachers/credentials/<int:teacher_id>')
@login_required
def view_credentials(teacher_id):
    """Просмотр учетных данных преподавателя"""
    teacher = Teacher.query.get_or_404(teacher_id)
    credentials = teacher.get_credentials()

    if not credentials:
        flash('Учетные данные не найдены. Сначала создайте их.', 'warning')
        return redirect(url_for('teacher.teachers_list'))

    return render_template('teacher/credentials.html', title='Учетные данные',
                           teacher=teacher, credentials=credentials)


@teacher.route('/departments')
@login_required
def departments_list():
    """Список кафедр"""
    departments = Department.query.all()
    return render_template('teacher/departments.html', title='Кафедры', departments=departments)


@teacher.route('/departments/add', methods=['GET', 'POST'])
@login_required
def add_department():
    """Добавление кафедры"""
    if request.method == 'POST':
        name = request.form.get('name')
        description = request.form.get('description')

        if name:
            department = Department(name=name, description=description)
            db.session.add(department)
            db.session.commit()
            flash('Кафедра успешно добавлена!', 'success')
            return redirect(url_for('teacher.departments_list'))
        else:
            flash('Название кафедры обязательно!', 'danger')

    return render_template('teacher/add_department.html', title='Добавление кафедры')