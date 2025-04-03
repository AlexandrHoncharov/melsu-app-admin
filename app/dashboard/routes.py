# app/dashboard/routes.py
from flask import Blueprint, render_template, url_for, flash, redirect, request, jsonify
from flask_login import login_required, current_user
from app import db, bcrypt
from app.models import User, Teacher, Department, ScheduleTeacher
from datetime import datetime

dashboard = Blueprint('dashboard', __name__)


@dashboard.route('/')
@dashboard.route('/index')
@login_required
def index():
    """Главная страница дашборда"""
    # Собираем статистику для дашборда
    stats = {
        'total_users': User.query.count(),
        'total_teachers': Teacher.query.count(),
        'total_departments': Department.query.count(),
        'total_schedule_teachers': ScheduleTeacher.query.count(),
        'recent_users': User.query.order_by(User.created_at.desc()).limit(5).all()
    }

    return render_template('dashboard/index.html', title='Дашборд', stats=stats)


@dashboard.route('/profile')
@login_required
def profile():
    """Страница профиля пользователя"""
    return render_template('dashboard/profile.html', title='Профиль')


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


# API для получения данных пользователя
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


# API для создания нового пользователя
@dashboard.route('/api/users', methods=['POST'])
@login_required
def api_create_user():
    """API для создания нового пользователя"""
    if not current_user.has_role('admin'):
        return jsonify({'success': False, 'message': 'Недостаточно прав'}), 403

    data = request.json

    # Проверяем уникальность имени пользователя и email
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'success': False, 'message': 'Пользователь с таким именем уже существует'})

    if User.query.filter_by(email=data['email']).first():
        return jsonify({'success': False, 'message': 'Email уже используется другим пользователем'})

    # Создаем нового пользователя
    try:
        user = User(
            username=data['username'],
            email=data['email'],
            password=bcrypt.generate_password_hash(data['password']).decode('utf-8'),
            first_name=data['first_name'],
            last_name=data['last_name'],
            role=data['role'],
            is_active=data['is_active']
        )

        db.session.add(user)
        db.session.commit()

        return jsonify({'success': True, 'message': 'Пользователь успешно создан', 'user_id': user.id})

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Ошибка при создании пользователя: {str(e)}'})


# API для обновления данных пользователя
@dashboard.route('/api/users/<int:user_id>', methods=['PUT'])
@login_required
def api_update_user(user_id):
    """API для обновления данных пользователя"""
    if not current_user.has_role('admin'):
        return jsonify({'success': False, 'message': 'Недостаточно прав'}), 403

    user = User.query.get_or_404(user_id)
    data = request.json

    # Проверяем уникальность имени пользователя и email
    username_exists = User.query.filter(User.username == data['username'], User.id != user_id).first()
    if username_exists:
        return jsonify({'success': False, 'message': 'Пользователь с таким именем уже существует'})

    email_exists = User.query.filter(User.email == data['email'], User.id != user_id).first()
    if email_exists:
        return jsonify({'success': False, 'message': 'Email уже используется другим пользователем'})

    # Обновляем данные пользователя
    try:
        user.username = data['username']
        user.email = data['email']
        user.first_name = data['first_name']
        user.last_name = data['last_name']
        user.role = data['role']
        user.is_active = data['is_active']

        db.session.commit()

        return jsonify({'success': True, 'message': 'Данные пользователя успешно обновлены'})

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Ошибка при обновлении данных: {str(e)}'})


# API для удаления пользователя
@dashboard.route('/api/users/<int:user_id>', methods=['DELETE'])
@login_required
def api_delete_user(user_id):
    """API для удаления пользователя"""
    if not current_user.has_role('admin'):
        return jsonify({'success': False, 'message': 'Недостаточно прав'}), 403

    # Проверяем, не пытается ли пользователь удалить сам себя
    if user_id == current_user.id:
        return jsonify({'success': False, 'message': 'Нельзя удалить свою учетную запись'})

    user = User.query.get_or_404(user_id)

    try:
        db.session.delete(user)
        db.session.commit()

        return jsonify({'success': True, 'message': 'Пользователь успешно удален'})

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Ошибка при удалении пользователя: {str(e)}'})


# API для сброса пароля пользователя
@dashboard.route('/api/users/<int:user_id>/reset-password', methods=['POST'])
@login_required
def api_reset_password(user_id):
    """API для сброса пароля пользователя"""
    if not current_user.has_role('admin'):
        return jsonify({'success': False, 'message': 'Недостаточно прав'}), 403

    user = User.query.get_or_404(user_id)
    data = request.json

    try:
        # Хешируем новый пароль
        hashed_password = bcrypt.generate_password_hash(data['password']).decode('utf-8')
        user.password = hashed_password
        db.session.commit()

        return jsonify({'success': True, 'message': 'Пароль успешно сброшен'})

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Ошибка при сбросе пароля: {str(e)}'})


# API для изменения статуса пользователя (блокировка/разблокировка)
@dashboard.route('/api/users/<int:user_id>/toggle-status', methods=['POST'])
@login_required
def api_toggle_status(user_id):
    """API для изменения статуса пользователя"""
    if not current_user.has_role('admin'):
        return jsonify({'success': False, 'message': 'Недостаточно прав'}), 403

    # Проверяем, не пытается ли пользователь заблокировать сам себя
    if user_id == current_user.id:
        return jsonify({'success': False, 'message': 'Нельзя изменить статус своей учетной записи'})

    user = User.query.get_or_404(user_id)
    data = request.json

    try:
        user.is_active = data['is_active']
        db.session.commit()

        status_message = 'разблокирован' if user.is_active else 'заблокирован'
        return jsonify({'success': True, 'message': f'Пользователь {status_message}'})

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Ошибка при изменении статуса: {str(e)}'})