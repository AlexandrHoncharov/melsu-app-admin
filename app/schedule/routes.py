# app/schedule/routes.py
import os
from flask import Blueprint, render_template, url_for, flash, redirect, request
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from app import db
from app.models import ScheduleTeacher, Teacher
from app.schedule.forms import ScheduleTeacherUploadForm, SelectScheduleTeacherForm
from app.utils.excel_helpers import process_excel_teachers
from datetime import datetime

schedule = Blueprint('schedule', __name__)


@schedule.route('/schedule/teachers')
@login_required
def teachers_list():
    """Список преподавателей расписания"""
    if not (current_user.has_role('admin') or current_user.has_role('umr')):
        flash('У вас нет прав для просмотра этой страницы', 'danger')
        return redirect(url_for('dashboard.index'))

    # Получаем параметры поиска
    search_query = request.args.get('q', '')

    # Базовый запрос
    query = ScheduleTeacher.query

    # Применяем фильтры поиска
    if search_query:
        query = query.filter(
            (ScheduleTeacher.full_name.ilike(f'%{search_query}%')) |
            (ScheduleTeacher.code.ilike(f'%{search_query}%'))
        )

    # Получаем преподавателей
    schedule_teachers = query.order_by(ScheduleTeacher.full_name).all()

    return render_template('schedule/teachers_list.html',
                           title='Преподаватели расписания',
                           schedule_teachers=schedule_teachers,
                           search_query=search_query)


@schedule.route('/schedule/teachers/upload', methods=['GET', 'POST'])
@login_required
def upload_teachers():
    """Загрузка преподавателей из файла Excel"""
    if not (current_user.has_role('admin') or current_user.has_role('umr')):
        flash('У вас нет прав для просмотра этой страницы', 'danger')
        return redirect(url_for('dashboard.index'))

    form = ScheduleTeacherUploadForm()

    if form.validate_on_submit():
        try:
            # Сохраняем файл
            file = form.file.data
            filename = secure_filename(file.filename)
            temp_path = os.path.join(os.getcwd(), 'temp', filename)

            # Создаем директорию, если она не существует
            os.makedirs(os.path.dirname(temp_path), exist_ok=True)

            file.save(temp_path)

            # Обрабатываем файл
            teachers_data, messages = process_excel_teachers(temp_path)

            for msg in messages:
                flash(msg, "info")

            if not teachers_data:
                flash('Не удалось извлечь данные преподавателей из файла', 'danger')
                return redirect(url_for('schedule.upload_teachers'))

            # Счетчики для статистики
            count_added = 0
            count_updated = 0

            # Добавляем или обновляем преподавателей
            for teacher_data in teachers_data:
                code = teacher_data['code']
                full_name = teacher_data['full_name']

                # Проверяем существование преподавателя
                existing_teacher = ScheduleTeacher.query.filter_by(code=code).first()

                if existing_teacher:
                    # Обновляем, если изменилось имя
                    if existing_teacher.full_name != full_name:
                        existing_teacher.full_name = full_name
                        existing_teacher.updated_at = datetime.utcnow()
                        count_updated += 1
                else:
                    # Создаем нового преподавателя
                    new_teacher = ScheduleTeacher(code=code, full_name=full_name)
                    db.session.add(new_teacher)
                    count_added += 1

            # Сохраняем изменения
            db.session.commit()

            # Удаляем временный файл
            os.remove(temp_path)

            flash(f'Файл успешно обработан! Добавлено: {count_added}, обновлено: {count_updated} преподавателей.',
                  'success')

            return redirect(url_for('schedule.teachers_list'))

        except Exception as e:
            flash(f'Ошибка при обработке файла: {str(e)}', 'danger')
            return redirect(url_for('schedule.upload_teachers'))

    return render_template('schedule/upload.html', title='Загрузка преподавателей', form=form)


@schedule.route('/schedule/teachers/link/<int:teacher_id>', methods=['GET', 'POST'])
@login_required
def link_teacher(teacher_id):
    """Привязка преподавателя к преподавателю из расписания"""
    if not (current_user.has_role('admin') or current_user.has_role('umr')):
        flash('У вас нет прав для просмотра этой страницы', 'danger')
        return redirect(url_for('dashboard.index'))

    teacher = Teacher.query.get_or_404(teacher_id)
    form = SelectScheduleTeacherForm()

    # Получаем список преподавателей из расписания
    form.schedule_teacher.choices = [
        (st.id, f"{st.code} - {st.full_name}")
        for st in ScheduleTeacher.query.order_by(ScheduleTeacher.full_name).all()
    ]

    # Если форма отправлена
    if form.validate_on_submit():
        teacher.schedule_teacher_id = form.schedule_teacher.data
        db.session.commit()
        flash('Преподаватель успешно привязан к преподавателю из расписания', 'success')
        return redirect(url_for('teacher.edit_teacher', teacher_id=teacher.id))

    # Выбираем текущую привязку по умолчанию
    if request.method == 'GET' and teacher.schedule_teacher_id:
        form.schedule_teacher.data = teacher.schedule_teacher_id

    return render_template('schedule/link_teacher.html', title='Привязка преподавателя',
                           form=form, teacher=teacher)