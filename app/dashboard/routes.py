# app/dashboard/routes.py
from flask import Blueprint, render_template, url_for, flash, redirect, request
from flask_login import login_required, current_user
from app import db
from app.models import User

dashboard = Blueprint('dashboard', __name__)


@dashboard.route('/')
@dashboard.route('/index')
@login_required
def index():
    """Главная страница дашборда"""
    stats = {
        'total_users': User.query.count(),
        # Здесь могут быть другие статистические данные
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

    users = User.query.all()
    return render_template('dashboard/users.html', title='Пользователи', users=users)

# Здесь можно добавить другие маршруты для админки:
# - Управление факультетами
# - Управление кафедрами
# - Управление курсами
# - и т.д.