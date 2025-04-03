# app/auth/routes.py
from flask import Blueprint, render_template, url_for, flash, redirect, request
from flask_login import login_user, current_user, logout_user, login_required
from app import db, bcrypt
from app.models import User
from app.auth.forms import RegistrationForm, LoginForm, RequestResetForm, ResetPasswordForm
from datetime import datetime

auth = Blueprint('auth', __name__)


@auth.route('/register', methods=['GET', 'POST'])
def register():
    """Страница регистрации"""
    if current_user.is_authenticated:
        return redirect(url_for('dashboard.index'))

    form = RegistrationForm()
    if form.validate_on_submit():
        # Хэшируем пароль перед сохранением
        hashed_password = bcrypt.generate_password_hash(form.password.data).decode('utf-8')

        # Создаем нового пользователя
        user = User(
            username=form.username.data,
            email=form.email.data,
            password=hashed_password,
            first_name=form.first_name.data,
            last_name=form.last_name.data,
            role='admin' if User.query.count() == 0 else 'user'  # Первый пользователь - админ
        )

        # Сохраняем в базу данных
        db.session.add(user)
        db.session.commit()

        flash(f'Аккаунт успешно создан! Теперь вы можете войти.', 'success')
        return redirect(url_for('auth.login'))

    return render_template('auth/register.html', title='Регистрация', form=form)


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


@auth.route('/reset_password', methods=['GET', 'POST'])
def reset_request():
    """Запрос сброса пароля"""
    if current_user.is_authenticated:
        return redirect(url_for('dashboard.index'))

    form = RequestResetForm()
    if form.validate_on_submit():
        user = User.query.filter_by(email=form.email.data).first()
        # Здесь должна быть отправка email со ссылкой для сброса пароля
        # В рамках этого примера просто показываем сообщение
        flash('На ваш email отправлено письмо с инструкциями по сбросу пароля.', 'info')
        return redirect(url_for('auth.login'))

    return render_template('auth/reset_request.html', title='Сброс пароля', form=form)


@auth.route('/reset_password/<token>', methods=['GET', 'POST'])
def reset_token(token):
    """Сброс пароля по токену"""
    if current_user.is_authenticated:
        return redirect(url_for('dashboard.index'))

    # Здесь должна быть проверка токена
    # В рамках этого примера просто показываем форму

    form = ResetPasswordForm()
    if form.validate_on_submit():
        # Обновляем пароль
        flash('Ваш пароль был обновлен! Теперь вы можете войти.', 'success')
        return redirect(url_for('auth.login'))

    return render_template('auth/reset_token.html', title='Сброс пароля', form=form)