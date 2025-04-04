# app/auth/routes.py
from flask import Blueprint, render_template, url_for, flash, redirect, request
from flask_login import login_user, current_user, logout_user
from app import db, bcrypt
from app.models import User
from app.auth.forms import LoginForm
from datetime import datetime

auth = Blueprint('auth', __name__)

@auth.route('/login', methods=['GET', 'POST'])
def login():
    """Страница входа"""
    if current_user.is_authenticated:
        return redirect(url_for('dashboard.index'))

    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(email=form.email.data).first()

        # Проверяем пользователя и пароль
        if user and bcrypt.check_password_hash(user.password, form.password.data):
            login_user(user, remember=form.remember.data)

            # Обновляем дату последнего входа
            user.last_login = datetime.utcnow()
            db.session.commit()

            next_page = request.args.get('next')
            return redirect(next_page) if next_page else redirect(url_for('dashboard.index'))
        else:
            flash('Ошибка входа. Пожалуйста, проверьте email и пароль', 'danger')

    return render_template('auth/login.html', title='Вход', form=form)

@auth.route('/logout')
def logout():
    """Выход из системы"""
    logout_user()
    return redirect(url_for('auth.login'))