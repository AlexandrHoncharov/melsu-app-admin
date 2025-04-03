# app/teacher/forms.py
from flask_wtf import FlaskForm
from wtforms import StringField, TextAreaField, SelectField, SubmitField
from wtforms.validators import DataRequired, Length, URL, Optional

class TeacherForm(FlaskForm):
    """Форма для добавления/редактирования преподавателя"""
    full_name = StringField('ФИО', validators=[DataRequired(), Length(min=2, max=100)])
    position = StringField('Должность', validators=[Length(max=50)])
    department = SelectField('Кафедра', coerce=int, validators=[DataRequired()])
    submit = SubmitField('Сохранить')

class APISettingsForm(FlaskForm):
    """Форма для настроек API синхронизации"""
    api_url = StringField('URL API', validators=[DataRequired(), URL()])
    submit = SubmitField('Синхронизировать')