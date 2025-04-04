# app/teacher/routes.py
from flask import Blueprint, render_template, url_for, flash, redirect, request
from flask_login import login_required, current_user
from app import db
from app.models import Teacher, Department, User, ScheduleTeacher
from app.teacher.forms import TeacherForm

teacher = Blueprint('teacher', __name__)

@teacher.route('/teachers')
@login_required
def teachers_list():
    """Список преподавателей"""
    if not current_user.has_role('admin'):
        flash('У вас нет прав для просмотра этой страницы', 'danger')
        return redirect(url_for('dashboard.index'))

    # Получаем параметры поиска
    search_query = request.args.get('q', '')
    department_id = request.args.get('department', type=int)

    # Базовый запрос
    query = Teacher.query

    # Применяем фильтры
    if search_query:
        query = query.filter(Teacher.full_name.ilike(f'%{search_query}%'))
    if department_id:
        query = query.filter_by(department_id=department_id)

    # Получаем данные
    teachers = query.all()
    departments = Department.query.all()

    return render_template('teacher/list.html', title='Преподаватели',
                           teachers=teachers, departments=departments,
                           search_query=search_query, department_id=department_id)

@teacher.route('/teachers/add', methods=['GET', 'POST'])
@login_required
def add_teacher():
    """Добавление преподавателя"""
    if not current_user.has_role('admin'):
        flash('У вас нет прав для выполнения этого действия', 'danger')
        return redirect(url_for('dashboard.index'))

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
    if not current_user.has_role('admin'):
        flash('У вас нет прав для выполнения этого действия', 'danger')
        return redirect(url_for('dashboard.index'))

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
    if not current_user.has_role('admin'):
        flash('У вас нет прав для выполнения этого действия', 'danger')
        return redirect(url_for('dashboard.index'))

    teacher = Teacher.query.get_or_404(teacher_id)
    db.session.delete(teacher)
    db.session.commit()
    flash('Преподаватель удален!', 'success')
    return redirect(url_for('teacher.teachers_list'))

@teacher.route('/teachers/generate-credentials/<int:teacher_id>', methods=['POST'])
@login_required
def generate_credentials(teacher_id):
    """Генерация учетных данных для преподавателя"""
    if not current_user.has_role('admin'):
        flash('У вас нет прав для выполнения этого действия', 'danger')
        return redirect(url_for('dashboard.index'))

    teacher = Teacher.query.get_or_404(teacher_id)
    credentials = teacher.generate_credentials()

    flash(f'Учетные данные созданы! Логин: {credentials["username"]}, Пароль: {credentials["password"]}', 'success')
    return redirect(url_for('teacher.view_credentials', teacher_id=teacher.id))

@teacher.route('/teachers/credentials/<int:teacher_id>')
@login_required
def view_credentials(teacher_id):
    """Просмотр учетных данных преподавателя"""
    if not current_user.has_role('admin'):
        flash('У вас нет прав для просмотра этой страницы', 'danger')
        return redirect(url_for('dashboard.index'))

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
    if not current_user.has_role('admin'):
        flash('У вас нет прав для просмотра этой страницы', 'danger')
        return redirect(url_for('dashboard.index'))

    departments = Department.query.all()
    return render_template('teacher/departments.html', title='Кафедры', departments=departments)