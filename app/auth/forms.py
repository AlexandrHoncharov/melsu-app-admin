# app/auth/forms.py
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField, BooleanField
from wtforms.validators import DataRequired, Length, Email, EqualTo, ValidationError
from app.models import User

class RegistrationForm(FlaskForm):
    """Форма регистрации"""
    username = StringField('Имя пользователя',
                           validators=[DataRequired(), Length(min=2, max=20)])
    email = StringField('Email',
                        validators=[DataRequired(), Email()])
    password = PasswordField('Пароль', validators=[DataRequired()])
    confirm_password = PasswordField('Подтвердите пароль',
                                     validators=[DataRequired(), EqualTo('password')])
    first_name = StringField('Имя', validators=[Length(max=30)])
    last_name = StringField('Фамилия', validators=[Length(max=30)])
    submit = SubmitField('Зарегистрироваться')

    def validate_username(self, username):
        """Проверка уникальности имени пользователя"""
        user = User.query.filter_by(username=username.data).first()
        if user:
            raise ValidationError('Пользователь с таким именем уже существует. Пожалуйста, выберите другое имя.')

    def validate_email(self, email):
        """Проверка уникальности email"""
        user = User.query.filter_by(email=email.data).first()
        if user:
            raise ValidationError('Пользователь с таким email уже существует. Пожалуйста, выберите другой email.')


class LoginForm(FlaskForm):
    """Форма входа"""
    email = StringField('Email',
                        validators=[DataRequired(), Email()])
    password = PasswordField('Пароль', validators=[DataRequired()])
    remember = BooleanField('Запомнить меня')
    submit = SubmitField('Войти')


class RequestResetForm(FlaskForm):
    """Форма запроса сброса пароля"""
    email = StringField('Email',
                        validators=[DataRequired(), Email()])
    submit = SubmitField('Запросить сброс пароля')

    def validate_email(self, email):
        """Проверка существования пользователя с данным email"""
        user = User.query.filter_by(email=email.data).first()
        if user is None:
            raise ValidationError('Нет учетной записи с таким email. Сначала необходимо зарегистрироваться.')


class ResetPasswordForm(FlaskForm):
    """Форма сброса пароля"""
    password = PasswordField('Новый пароль', validators=[DataRequired()])
    confirm_password = PasswordField('Подтвердите новый пароль',
                                     validators=[DataRequired(), EqualTo('password')])
    submit = SubmitField('Сбросить пароль')