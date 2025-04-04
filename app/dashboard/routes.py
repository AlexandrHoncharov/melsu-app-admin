# app/dashboard/routes.py
from flask import Blueprint, render_template, url_for, flash, redirect, request, jsonify
from flask_login import login_required, current_user
from app import db, bcrypt
from app.models import User, Teacher, Department, ScheduleTeacher
from app.dashboard.forms import UpdateProfileForm, ChangePasswordForm

dashboard = Blueprint('dashboard', __name__)


@dashboard.route('/')
@dashboard.route('/index')
@login_required
def index():
    """Главная страница дашборда"""
    # Если пользователь - специалист УМР, перенаправляем на страницу преподавателей расписания
    if current_user.has_role('umr'):
        return redirect(url_for('schedule.teachers_list'))

    # Упрощенная статистика для дашборда
    stats = {
        'total_users': User.query.count(),
        'total_teachers': Teacher.query.count(),
        'total_departments': Department.query.count(),
        'total_schedule_teachers': ScheduleTeacher.query.count()
    }

    return render_template('dashboard/index.html', title='Дашборд', stats=stats)


@dashboard.route('/profile', methods=['GET', 'POST'])
@login_required
def profile():
    """Страница профиля пользователя"""
    # Форма для обновления профиля
    update_form = UpdateProfileForm(obj=current_user)
    password_form = ChangePasswordForm()

    # Обработка формы обновления профиля
    if update_form.validate_on_submit() and 'update_profile' in request.form:
        current_user.username = update_form.username.data
        current_user.first_name = update_form.first_name.data
        current_user.last_name = update_form.last_name.data
        current_user.email = update_form.email.data
        db.session.commit()
        flash('Ваш профиль успешно обновлен!', 'success')
        return redirect(url_for('dashboard.profile'))

    # Обработка формы смены пароля
    if password_form.validate_on_submit() and 'change_password' in request.form:
        if bcrypt.check_password_hash(current_user.password, password_form.current_password.data):
            hashed_password = bcrypt.generate_password_hash(password_form.new_password.data).decode('utf-8')
            current_user.password = hashed_password
            db.session.commit()
            flash('Ваш пароль успешно изменен!', 'success')
            return redirect(url_for('dashboard.profile'))
        else:
            flash('Неверный текущий пароль. Пожалуйста, попробуйте снова.', 'danger')

    return render_template('dashboard/profile.html', title='Профиль',
                           update_form=update_form, password_form=password_form)


@dashboard.route('/users')
@login_required
def users():
    """Страница управления пользователями (только для админов)"""
    if not current_user.has_role('admin'):
        flash('У вас нет прав для просмотра этой страницы', 'danger')
        return redirect(url_for('dashboard.index'))

    # Получаем параметры фильтрации
    search_query = request.args.get('q', '')
    role_filter = request.args.get('role', '')

    # Формируем запрос с фильтрами
    query = User.query

    if search_query:
        query = query.filter(
            (User.username.ilike(f'%{search_query}%')) |
            (User.email.ilike(f'%{search_query}%')) |
            (User.first_name.ilike(f'%{search_query}%')) |
            (User.last_name.ilike(f'%{search_query}%'))
        )

    if role_filter:
        query = query.filter(User.role == role_filter)

    # Получаем отсортированный список пользователей
    users = query.order_by(User.username).all()

    return render_template('dashboard/users.html', title='Пользователи', users=users)


# Основные API для пользователей
@dashboard.route('/api/users/<int:user_id>', methods=['GET'])
@login_required
def api_get_user(user_id):
    """API для получения данных пользователя"""
    if not current_user.has_role('admin'):
        return jsonify({'success': False, 'message': 'Недостаточно прав'}), 403

    user = User.query.get_or_404(user_id)

    return jsonify({
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'role': user.role,
        'is_active': user.is_active,
        'created_at': user.created_at.strftime('%d.%m.%Y %H:%M')
    })