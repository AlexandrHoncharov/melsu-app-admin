# app/schedule/forms.py
from flask_wtf import FlaskForm
from flask_wtf.file import FileField, FileRequired, FileAllowed
from wtforms import SubmitField, SelectField
from wtforms.validators import DataRequired


class ScheduleTeacherUploadForm(FlaskForm):
    """Форма для загрузки файла с преподавателями из расписания"""
    file = FileField('Файл Excel', validators=[
        FileRequired(),
        FileAllowed(['xlsx', 'xls'], 'Только файлы Excel (.xlsx или .xls)')
    ])
    submit = SubmitField('Загрузить')


class SelectScheduleTeacherForm(FlaskForm):
    """Форма для выбора преподавателя из расписания"""
    schedule_teacher = SelectField('Преподаватель из расписания', coerce=int, validators=[DataRequired()])
    submit = SubmitField('Сохранить')