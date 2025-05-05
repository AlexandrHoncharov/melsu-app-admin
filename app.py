import csv
import os
import uuid
import datetime
from datetime import timedelta
from functools import wraps
from io import StringIO
import json
import re
import html
import unicodedata
import transliterate

import pymysql
import requests
import jwt # Added for token authentication in unregister_device

import firebase_admin
from firebase_admin import credentials, messaging, auth # Added auth for Firebase token creation if needed

from flask import Flask, render_template, flash, session, send_from_directory, \
    abort, make_response
from flask import jsonify, request, redirect, url_for
from sqlalchemy import or_
from werkzeug.security import generate_password_hash, check_password_hash # Ensure check_password_hash is imported
from werkzeug.utils import secure_filename

from db import db

# Import models after db initialization
from models import (
    User, Teacher, Schedule, ScheduleTeacher, VerificationLog,
    DeviceToken, Ticket, TicketAttachment, TicketMessage,
    Notification
)

# === Configuration & Initialization === #

app = Flask(__name__)
app.config.from_object('config')

app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

db.init_app(app)

# Firebase initialization block
FIREBASE_AVAILABLE = False
try:
    print("📱 Attempting to initialize Firebase Admin SDK...")
    firebase_cred_path = os.path.join(os.path.dirname(__file__), 'firebase-service-account.json')

    if os.path.exists(firebase_cred_path):
        cred = credentials.Certificate(firebase_cred_path)
        firebase_admin.initialize_app(cred)
        print("✅ Firebase Admin SDK successfully initialized using service account file.")
        FIREBASE_AVAILABLE = True
    else:
        # Fallback to standard firebase.json if service account file is not found
        print("⚠️ firebase-service-account.json not found. Attempting fallback to firebase.json...")
        fallback_cred_path = os.path.join(os.path.dirname(__file__), 'firebase.json')
        if os.path.exists(fallback_cred_path):
            try:
                cred = credentials.Certificate(fallback_cred_path)
                firebase_admin.initialize_app(cred)
                print("✅ Firebase Admin SDK successfully initialized using firebase.json.")
                FIREBASE_AVAILABLE = True
            except Exception as fallback_e:
                 print(f"❌ Failed to initialize with firebase.json: {fallback_e}")
                 print("Attempting initialization via environment variables...")
                 try:
                     firebase_admin.initialize_app()
                     print("✅ Firebase Admin SDK successfully initialized via environment variables.")
                     FIREBASE_AVAILABLE = True
                 except Exception as env_error:
                     print(f"❌ Failed to initialize via environment variables: {env_error}")
                     raise # Propagate the error if env init also fails
        else:
            print("❌ Neither firebase-service-account.json nor firebase.json found.")
            print("Attempting initialization via environment variables...")
            try:
                firebase_admin.initialize_app()
                print("✅ Firebase Admin SDK successfully initialized via environment variables.")
                FIREBASE_AVAILABLE = True
            except Exception as env_error:
                print(f"❌ Failed to initialize via environment variables: {env_error}")
                raise # Propagate the error if env init also fails

except Exception as e:
    print(f"❌ ERROR initializing Firebase Admin SDK: {e}")
    import traceback
    traceback.print_exc()
    FIREBASE_AVAILABLE = False
    print("⚠️ FCM notifications are disabled.")


# === Authentication & Authorization === #

def login_required(f):
    """Decorator to protect admin routes."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        # Optional: Add check here to ensure the user is an admin if needed
        # user = User.query.get(session['user_id'])
        # if user and user.is_admin:
        #     return f(*args, **kwargs)
        # else:
        #     flash('Access forbidden', 'error')
        #     return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Admin login route."""
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password): # Assumes User model has check_password method
            session['user_id'] = user.id
            flash('Logged in successfully', 'success')
            return redirect(url_for('index'))
        else:
            flash('Invalid username or password', 'error')
    return render_template('auth/login.html')

@app.route('/logout')
def logout():
    """Admin logout route."""
    session.pop('user_id', None)
    flash('Logged out successfully', 'success')
    return redirect(url_for('login'))

# === User Management === #

@app.route('/students')
@login_required
def students_list():
    """Lists all students with filtering options and export capability."""
    status = request.args.get('status', 'all')
    search_query = request.args.get('search', '')
    page = request.args.get('page', 1, type=int)
    per_page = 20
    export = request.args.get('export', '')
    query = User.query.filter_by(role='student')

    if status != 'all':
        query = query.filter_by(verification_status=status)

    if search_query:
        query = query.filter(
            db.or_(
                User.username.ilike(f'%{search_query}%'),
                User.full_name.ilike(f'%{search_query}%'),
                User.group.ilike(f'%{search_query}%'),
                User.email.ilike(f'%{search_query}%')
            )
        )

    verified_count = User.query.filter_by(role='student', verification_status='verified').count()
    pending_count = User.query.filter_by(role='student', verification_status='pending').count()
    rejected_count = User.query.filter_by(role='student', verification_status='rejected').count()
    unverified_count = User.query.filter_by(role='student', verification_status='unverified').count()

    if export == 'csv':
        csv_data = StringIO()
        csv_writer = csv.writer(csv_data)
        csv_writer.writerow([
            'ID', 'Логин', 'ФИО', 'Email', 'Группа', 'Факультет',
            'Код специальности', 'Специальность', 'Форма обучения', 'Статус верификации',
            'Дата регистрации'
        ])
        students = query.all()
        for student in students:
            status_map = {
                'verified': 'Подтвержден',
                'pending': 'На проверке',
                'rejected': 'Отклонен',
                'unverified': 'Не верифицирован',
                None: 'Не указан'
            }
            csv_writer.writerow([
                student.id,
                student.username,
                student.full_name or '',
                student.email or '',
                student.group or '',
                student.faculty or '',
                student.speciality_code or '',
                student.speciality_name or '',
                student.study_form_name or '',
                status_map.get(student.verification_status, 'Не указан'),
                student.created_at.strftime('%d.%m.%Y %H:%M') if student.created_at else ''
            ])
        response = make_response(csv_data.getvalue())
        response.headers["Content-Disposition"] = "attachment; filename=students_export.csv"
        response.headers["Content-type"] = "text/csv; charset=utf-8"
        return response

    pagination = query.order_by(User.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    students = pagination.items

    return render_template(
        'students/list.html',
        students=students,
        pagination=pagination,
        status=status,
        search_query=search_query,
        verified_count=verified_count,
        pending_count=pending_count,
        rejected_count=rejected_count,
        unverified_count=unverified_count
    )

@app.route('/students/edit/<int:student_id>', methods=['GET', 'POST'])
@login_required
def edit_student(student_id):
    """Edits student information."""
    student = User.query.filter_by(id=student_id, role='student').first_or_404()
    if request.method == 'POST':
        try:
            student.username = request.form.get('username')
            student.full_name = request.form.get('full_name')
            student.email = request.form.get('email')
            student.group = request.form.get('group')
            student.faculty = request.form.get('faculty')
            student.verification_status = request.form.get('verification_status')
            student.speciality_code = request.form.get('speciality_code')
            student.speciality_name = request.form.get('speciality_name')
            student.study_form = request.form.get('study_form')
            student.study_form_name = request.form.get('study_form_name')
            new_password = request.form.get('password')
            if new_password:
                student.password_plain = new_password
                student.password = generate_password_hash(new_password)
            db.session.commit()
            flash('Student information successfully updated', 'success')
            return redirect(url_for('students_list'))
        except Exception as e:
            db.session.rollback()
            flash(f'Error updating information: {e}', 'error')
    return render_template('students/edit.html', student=student)


@app.route('/students/<int:student_id>/delete', methods=['POST'])
@login_required
def delete_student(student_id):
    """Deletes a student user and all associated data."""
    try:
        student = User.query.filter_by(id=student_id, role='student').first_or_404()
        student_name = student.full_name or student.username

        # Delete all associated data first (tickets, verification logs, device tokens, etc.)
        # Notification cleanup
        Notification.query.filter_by(user_id=student_id).delete()

        # Ticket attachments cleanup
        ticket_messages = TicketMessage.query.filter_by(user_id=student_id).all()
        for message in ticket_messages:
            attachment = TicketAttachment.query.filter_by(message_id=message.id).first()
            if attachment:
                # Delete the actual file
                try:
                    attachment_path = os.path.join(TICKET_ATTACHMENTS_FOLDER, attachment.filename)
                    if os.path.exists(attachment_path):
                        os.remove(attachment_path)
                except Exception as e:
                    print(f"Error deleting attachment file: {e}")
                db.session.delete(attachment)

        # Delete ticket messages
        TicketMessage.query.filter_by(user_id=student_id).delete()

        # Delete tickets
        Ticket.query.filter_by(user_id=student_id).delete()

        # Delete verification logs
        VerificationLog.query.filter_by(student_id=student_id).delete()

        # Delete device tokens
        DeviceToken.query.filter_by(user_id=student_id).delete()

        # Delete student card image if it exists
        if student.student_card_image:
            try:
                card_path = os.path.join(STUDENT_CARDS_FOLDER, student.student_card_image)
                if os.path.exists(card_path):
                    os.remove(card_path)
            except Exception as e:
                print(f"Error deleting student card image: {e}")

        # Finally delete the student user
        db.session.delete(student)
        db.session.commit()
        flash(f'Студент "{student_name}" успешно удален', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Ошибка при удалении студента: {e}', 'error')
        print(f"Error deleting student: {e}")

    return redirect(url_for('students_list'))

# === Teacher Management === #

@app.route('/teachers')
@login_required
def teachers_list():
    """Lists all teachers with filtering and sorting."""
    search_query = request.args.get('search', '')
    sort = request.args.get('sort', 'name')
    if search_query:
        base_query = Teacher.query.filter(
            db.or_(
                Teacher.name.ilike(f'%{search_query}%'),
                Teacher.position.ilike(f'%{search_query}%'),
                Teacher.department.ilike(f'%{search_query}%')
            )
        )
    else:
        base_query = Teacher.query
    if sort == 'position':
        teachers = base_query.order_by(Teacher.position).all()
    elif sort == 'department':
        teachers = base_query.order_by(Teacher.department).all()
    else:
        teachers = base_query.order_by(Teacher.name).all()
    return render_template('teachers/list.html', teachers=teachers, search_query=search_query, sort=sort)

@app.route('/teachers/regenerate_credentials/<int:teacher_id>', methods=['POST'])
@login_required
def regenerate_teacher_credentials(teacher_id):
    """Regenerates credentials for a teacher's user account."""
    try:
        teacher = Teacher.query.get_or_404(teacher_id)
        if not teacher.has_account or not teacher.user_id:
            flash('This teacher does not have an account', 'error')
            return redirect(url_for('teachers_list'))
        user = User.query.get(teacher.user_id)
        if not user:
            flash('User account not found', 'error')
            return redirect(url_for('teachers_list'))

        # Assume Teacher model has generate_credentials method
        username, password = Teacher.generate_credentials(name=teacher.name)
        user.username = username
        user.password_plain = password
        user.password = generate_password_hash(password)
        db.session.commit()

        # Send notification about changed credentials
        admin_id = session.get('user_id')
        create_and_send_notification(
            recipient_id=user.id,
            title="Credentials updated",
            body=f"Your MelSU Go credentials have been updated. New Login: {username}, New Password: {password}",
            notification_type='system',
            sender_id=admin_id,
            data={'username': username,'credentials_updated': True}
        )

        flash(f'Credentials for {teacher.name} successfully updated. New Login: {username}, New Password: {password}','success')
    except Exception as e:
        db.session.rollback()
        flash(f'Error regenerating credentials: {e}', 'error')
        print(f"Error regenerating credentials: {e}")
    return redirect(url_for('view_teacher_credentials', teacher_id=teacher_id))

@app.route('/teachers/sync', methods=['GET', 'POST'])
@login_required
def sync_teachers():
    """Syncs teacher data from an external API."""
    if request.method == 'POST':
        api_url = request.form.get('api_url')
        try:
            response = requests.get(api_url)
            response.raise_for_status() # Raise HTTPError for bad responses
            teachers_data = response.json()

            Teacher.query.filter_by(has_account=False).delete()
            added_count = 0
            for teacher_info in teachers_data:
                if len(teacher_info) >= 3:
                    name = teacher_info[0]
                    position = teacher_info[1]
                    department = teacher_info[2]
                    existing = Teacher.query.filter_by(name=name,position=position,department=department).first()
                    if not existing:
                        new_teacher = Teacher(name=name,position=position,department=department)
                        db.session.add(new_teacher)
                        added_count += 1
            db.session.commit()
            flash(f'Teacher data successfully synced. Added {added_count} new teachers.', 'success')
        except requests.exceptions.RequestException as e:
            flash(f'Error fetching data from API: {e}', 'error')
        except Exception as e:
            db.session.rollback()
            flash(f'Synchronization error: {e}', 'error')
        return redirect(url_for('teachers_list'))
    return render_template('teachers/sync.html')

@app.route('/teachers/view_credentials/<int:teacher_id>')
@login_required
def view_teacher_credentials(teacher_id):
    """Views credentials for a teacher's user account."""
    teacher = Teacher.query.get_or_404(teacher_id)
    if not teacher.has_account or not teacher.user_id:
        flash('This teacher does not have an account', 'error')
        return redirect(url_for('teachers_list'))
    user = User.query.get(teacher.user_id)
    if not user:
        flash('User account not found', 'error')
        return redirect(url_for('teachers_list'))
    return render_template('teachers/credentials.html', teacher=teacher, user=user)

@app.route('/teachers/match/<int:teacher_id>')
@login_required
def match_teacher_form(teacher_id):
    """Displays the form to match an HR teacher with schedule teachers."""
    hr_teacher = Teacher.query.get_or_404(teacher_id)
    schedule_teachers = ScheduleTeacher.query.filter_by(active=True,mapped_teacher_id=None).order_by(ScheduleTeacher.name).all()
    matched_teachers = ScheduleTeacher.query.filter_by(mapped_teacher_id=teacher_id).all()
    suggested_matches = find_similar_teachers(hr_teacher.name, schedule_teachers)
    return render_template('teachers/match.html',
                           hr_teacher=hr_teacher,
                           schedule_teachers=schedule_teachers,
                           matched_teachers=matched_teachers,
                           suggested_matches=suggested_matches)

@app.route('/teachers/match', methods=['POST'])
@login_required
def match_teacher():
    """Processes the teacher matching action."""
    try:
        hr_teacher_id = request.form.get('hr_teacher_id', type=int)
        schedule_teacher_id = request.form.get('schedule_teacher_id', type=int)
        if not hr_teacher_id or not schedule_teacher_id:
            flash('Required parameters are missing', 'error')
            return redirect(url_for('teachers_list'))
        hr_teacher = Teacher.query.get_or_404(hr_teacher_id)
        schedule_teacher = ScheduleTeacher.query.get_or_404(schedule_teacher_id)
        schedule_teacher.mapped_teacher_id = hr_teacher_id
        db.session.commit()
        flash(f'Schedule teacher "{schedule_teacher.name}" successfully matched with "{hr_teacher.name}"', 'success')
        return redirect(url_for('match_teacher_form', teacher_id=hr_teacher_id))
    except Exception as e:
        db.session.rollback()
        flash(f'Error matching teachers: {e}', 'error')
        return redirect(url_for('teachers_list'))

@app.route('/teachers/unmatch', methods=['POST'])
@login_required
def unmatch_teacher():
    """Unmatches a schedule teacher from an HR teacher."""
    try:
        schedule_teacher_id = request.form.get('schedule_teacher_id', type=int)
        if not schedule_teacher_id:
            flash('Schedule teacher ID is missing', 'error')
            return redirect(url_for('teachers_list'))
        schedule_teacher = ScheduleTeacher.query.get_or_404(schedule_teacher_id)
        hr_teacher_id = schedule_teacher.mapped_teacher_id
        schedule_teacher.mapped_teacher_id = None
        db.session.commit()
        flash('Match removed', 'success')
        if hr_teacher_id:
            return redirect(url_for('match_teacher_form', teacher_id=hr_teacher_id))
        else:
            return redirect(url_for('teachers_list'))
    except Exception as e:
        db.session.rollback()
        flash(f'Error removing match: {e}', 'error')
        return redirect(url_for('teachers_list'))

@app.route('/teachers/create_account/<int:teacher_id>')
@login_required
def create_teacher_account(teacher_id):
    """Creates a user account for a teacher from HR data."""
    try:
        teacher = Teacher.query.get_or_404(teacher_id)
        if teacher.has_account:
            flash('This teacher already has an account', 'warning')
            return redirect(url_for('teachers_list'))
        username, password = Teacher.generate_credentials(name=teacher.name) # Assumes generate_credentials is a static/class method in Teacher model
        new_user = User(username=username,password=password,is_admin=False) # Assumes User model handles password hashing
        new_user.role = 'teacher'
        new_user.full_name = teacher.name
        new_user.verification_status = 'verified'
        if teacher.department:
            new_user.faculty = teacher.department # Using 'faculty' for teacher department for consistency? Revisit model if needed.

        db.session.add(new_user)
        db.session.flush()
        teacher.has_account = True
        teacher.user_id = new_user.id
        db.session.commit()

        admin_id = session.get('user_id')
        create_and_send_notification(
            recipient_id=new_user.id,
            title="Welcome to MelSU Go!",
            body=f"An account has been created for you in the MelSU Go app. Login: {username}, Password: {password}",
            notification_type='system',
            sender_id=admin_id,
            data={'username': username,'is_welcome_message': True}
        )

        flash(f'Account created for {teacher.name}. Login: {username}, Password: {password}', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Error creating account: {e}', 'error')
        print(f"Error creating account: {e}")
    return redirect(url_for('teachers_list'))

# === Schedule Management === #

@app.route('/schedule')
@login_required
def schedule_list():
    """Lists schedule entries with filtering."""
    search_query = request.args.get('search', '')
    group_filter = request.args.get('group', '')
    date_filter = request.args.get('date', '')
    subgroup_filter = request.args.get('subgroup', '')
    page = request.args.get('page', 1, type=int)
    per_page = 50
    query = Schedule.query

    if search_query:
        query = query.filter(
            db.or_(
                Schedule.subject.ilike(f'%{search_query}%'),
                Schedule.teacher_name.ilike(f'%{search_query}%'),
                Schedule.auditory.ilike(f'%{search_query}%')
            )
        )

    if group_filter:
        query = query.filter(Schedule.group_name == group_filter)

    if date_filter:
        try:
            filter_date = datetime.datetime.strptime(date_filter, '%Y-%m-%d').date()
            query = query.filter(Schedule.date == filter_date)
        except ValueError:
            flash('Invalid date format', 'error')

    if subgroup_filter:
        try:
            subgroup_val = int(subgroup_filter)
            query = query.filter(Schedule.subgroup == subgroup_val)
        except ValueError:
            pass

    groups = db.session.query(Schedule.group_name).distinct().all()
    group_names = [g[0] for g in groups if g[0] is not None]
    subgroups = db.session.query(Schedule.subgroup).distinct().order_by(Schedule.subgroup).all()
    subgroup_values = [s[0] for s in subgroups if s[0] is not None]

    pagination = query.order_by(Schedule.date, Schedule.time_start).paginate(
        page=page, per_page=per_page, error_out=False
    )
    schedules = pagination.items

    return render_template('schedule/list.html',
                           schedules=schedules,
                           pagination=pagination,
                           search_query=search_query,
                           group_filter=group_filter,
                           date_filter=date_filter,
                           subgroup_filter=subgroup_filter,
                           group_names=group_names,
                           subgroup_values=subgroup_values)


@app.route('/schedule/sync', methods=['GET', 'POST'])
@login_required
def sync_schedule():
    """Syncs schedule data from an external MySQL database."""
    sync_success = False
    changes_detected = False
    changes_by_group = {}

    # Helper functions (local to sync_schedule or defined globally)
    def get_semesters_from_db():
        semesters = db.session.query(db.distinct(Schedule.semester)).order_by(Schedule.semester).all()
        return [s[0] for s in semesters if s[0] is not None]

    def get_groups_from_db():
        groups = db.session.query(db.distinct(Schedule.group_name)).order_by(Schedule.group_name).all()
        return [g[0] for g in groups if g[0] is not None]

    if request.method == 'POST':
        try:
            semester = request.form.get('semester', '')
            group = request.form.get('group', '')

            current_schedules = {}
            if group:
                existing_schedules = Schedule.query.filter_by(group_name=group).all()
                for sch in existing_schedules:
                    key = f"{sch.date}_{sch.time_start}_{sch.subject}_{sch.group_name}"
                    current_schedules[key] = sch

            # --- Sensitive Data: External DB Credentials ---
            # These credentials should ideally be stored in environment variables or a secrets management system,
            # NOT hardcoded directly in the source file.
            # Replace with secure credential retrieval in production.
            connection = pymysql.connect(
                host='147.45.153.76',
                user='sanumxxx',
                password='Yandex200515_', # <-- SENSITIVE DATA
                database='timetable',
                port=3306,
                charset='utf8mb4',
                cursorclass=pymysql.cursors.DictCursor,
                connect_timeout=30
            )
            # --- End Sensitive Data ---

            with connection.cursor() as cursor:
                query = """
                    SELECT
                        semester, week_number, group_name, course, faculty,
                        subject, lesson_type, subgroup, date, time_start,
                        time_end, weekday, teacher_name, auditory
                    FROM schedule
                    WHERE 1=1
                """
                params = []

                if semester:
                    query += " AND semester = %s"
                    params.append(int(semester))
                if group:
                    query += " AND group_name = %s"
                    params.append(group)

                cursor.execute(query, params)
                batch_size = 1000
                total_records = 0

                if semester or group:
                    filters = {}
                    if semester: filters['semester'] = int(semester)
                    if group: filters['group_name'] = group
                    Schedule.query.filter_by(**filters).delete()
                else:
                    db.session.execute(db.text("TRUNCATE TABLE schedule"))

                db.session.commit()

                while True:
                    records = cursor.fetchmany(batch_size)
                    if not records: break
                    for record in records:
                        new_schedule = Schedule(
                            semester=record['semester'],
                            week_number=record['week_number'],
                            group_name=record['group_name'],
                            course=record['course'],
                            faculty=record['faculty'],
                            subject=record['subject'],
                            lesson_type=record['lesson_type'],
                            subgroup=record['subgroup'],
                            date=record['date'],
                            time_start=record['time_start'],
                            time_end=record['time_end'],
                            weekday=record['weekday'],
                            teacher_name=record['teacher_name'],
                            auditory=record['auditory']
                        )
                        db.session.add(new_schedule)

                        # Check for changes only if syncing a specific group
                        if group:
                            key = f"{record['date']}_{record['time_start']}_{record['subject']}_{record['group_name']}"
                            old_schedule = current_schedules.get(key)
                            if old_schedule:
                                changed = False
                                changes = {}
                                if old_schedule.teacher_name != record['teacher_name']:
                                    changed = True
                                    changes['teacher'] = {'old': old_schedule.teacher_name,'new': record['teacher_name']}
                                if old_schedule.auditory != record['auditory']:
                                    changed = True
                                    changes['auditory'] = {'old': old_schedule.auditory,'new': record['auditory']}
                                if old_schedule.time_start != record['time_start'] or old_schedule.time_end != record['time_end']:
                                    changed = True
                                    changes['time'] = {'old': f"{old_schedule.time_start}-{old_schedule.time_end}",'new': f"{record['time_start']}-{record['time_end']}"}

                                if changed:
                                    changes_detected = True
                                    group_name = record['group_name']
                                    if group_name not in changes_by_group:
                                        changes_by_group[group_name] = []
                                    changes_by_group[group_name].append({
                                        'date': record['date'].strftime('%d.%m.%Y') if hasattr(record['date'],'strftime') else str(record['date']),
                                        'subject': record['subject'],
                                        'changes': changes,
                                        'schedule_id': old_schedule.id
                                    })

                    db.session.commit()
                    db.session.expire_all()
                    total_records += len(records)

            flash(f'Schedule successfully synced. Processed {total_records} entries.', 'success')
            sync_success = True

            if changes_detected:
                session['schedule_changes'] = True
                session['changes_by_group'] = changes_by_group
                flash(f'Changes detected in schedule for {len(changes_by_group)} groups', 'warning')
            else:
                session['schedule_changes'] = False

        except pymysql.Error as e:
            db.session.rollback()
            flash(f'Database error during synchronization: {e}', 'error')
            print(f"Database error during synchronization: {e}")
        except Exception as e:
            db.session.rollback()
            flash(f'Synchronization error: {e}', 'error')
            print(f"Synchronization error: {e}")

        return render_template('schedule/sync.html',
                               semesters=get_semesters_from_db(),
                               groups=get_groups_from_db(),
                               sync_success=sync_success,
                               changes_detected=changes_detected,
                               changes_by_group=changes_by_group,
                               synced_semester=semester, # Pass back the synced semester/group for form
                               synced_group=group)

    return render_template('schedule/sync.html',
                           semesters=get_semesters_from_db(),
                           groups=get_groups_from_db(),
                           sync_success=sync_success)

@app.route('/schedule/teachers')
@login_required
def schedule_teachers_list():
    """Lists schedule teachers with filtering."""
    search_query = request.args.get('search', '')
    page = request.args.get('page', 1, type=int)
    per_page = 50
    query = ScheduleTeacher.query.filter_by(active=True)
    if search_query:
        query = query.filter(ScheduleTeacher.name.ilike(f'%{search_query}%'))
    pagination = query.order_by(ScheduleTeacher.name).paginate(
        page=page, per_page=per_page, error_out=False
    )
    teachers = pagination.items
    return render_template('schedule/teachers_list.html', teachers=teachers, pagination=pagination, search_query=search_query)

@app.route('/schedule/teachers/generate', methods=['POST'])
@login_required
def generate_schedule_teachers():
    """Generates initial schedule teacher list from current schedule data."""
    try:
        unique_teachers = db.session.query(Schedule.teacher_name).distinct().all()
        teacher_names = [t[0] for t in unique_teachers if t[0] and len(t[0].strip()) > 1]
        valid_teachers = []
        for name in teacher_names:
            name = name.strip()
            if name in ['-', '–', '—'] or len(name) < 2: continue
            valid_teachers.append(name)
        added_count = 0
        for name in valid_teachers:
            existing = ScheduleTeacher.query.filter_by(name=name).first()
            if not existing:
                teacher = ScheduleTeacher(name=name)
                db.session.add(teacher)
                added_count += 1
        db.session.commit()
        flash(f'Successfully added {added_count} teachers from schedule', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Error creating teacher list: {e}', 'error')
    return redirect(url_for('schedule_teachers_list'))

@app.route('/schedule/teachers/delete/<int:teacher_id>', methods=['POST'])
@login_required
def delete_schedule_teacher(teacher_id):
    """Marks a schedule teacher as inactive instead of deleting."""
    try:
        teacher = ScheduleTeacher.query.get_or_404(teacher_id)
        teacher.active = False
        db.session.commit()
        flash('Schedule teacher marked as inactive', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Error deleting schedule teacher: {e}', 'error')
    return redirect(url_for('schedule_teachers_list'))

@app.route('/schedule/send-notification', methods=['POST'])
@login_required
def send_schedule_notification():
    """Sends notifications about schedule changes."""
    try:
        week_number = request.form.get('week_number')
        recipient_type = request.form.get('recipient_type')
        notification_group = request.form.get('notification_group')
        title = request.form.get('title')
        message = request.form.get('message')
        sync_semester = request.form.get('sync_semester')
        sync_group = request.form.get('sync_group')

        deep_link = "app://schedule"
        if sync_semester:
            deep_link += f"?semester={sync_semester}"
            if week_number and week_number not in ['current', 'next', 'all']:
                deep_link += f"&week={week_number}"

        filter_data = {}
        if recipient_type == 'all_students':
            filter_data['recipient_type'] = 'students'
        elif recipient_type == 'specific_group' and notification_group:
            filter_data['recipient_type'] = 'students'
            filter_data['student_group'] = notification_group
        else:
             # Default to all students if recipient_type is something else or missing
             filter_data['recipient_type'] = 'students'

        recipients, devices = get_notification_recipients(filter_data)

        if not recipients:
            flash('No recipients found for notification', 'error')
            return redirect(url_for('sync_schedule'))

        admin_id = session.get('user_id')
        success_count = 0
        error_count = 0

        notification_data = {
            'deep_link': deep_link,
            'semester': sync_semester,
            'week': week_number,
            'group': sync_group or notification_group,
            'timestamp': datetime.datetime.utcnow().isoformat()
        }

        for user in recipients:
            result = create_and_send_notification(
                recipient_id=user.id,
                title=title,
                body=message,
                notification_type='schedule',
                sender_id=admin_id,
                data=notification_data,
                related_type='schedule_sync',
                related_id=None # No specific schedule entry ID for a general sync notification
            )
            if result.get('db_success'):
                success_count += 1
            else:
                error_count += 1

        flash(f'Schedule change notification sent to {success_count} users', 'success')
        if error_count > 0:
            flash(f'Failed to send notification to {error_count} users', 'warning')

        return redirect(url_for('schedule_list'))

    except Exception as e:
        flash(f'Error sending notification: {e}', 'error')
        print(f"Error sending notification: {e}")
        return redirect(url_for('sync_schedule'))


# === Verification Management === #

@app.route('/verification/students')
@login_required
def student_verification_list():
    """Lists students pending verification."""
    status = request.args.get('status', 'pending')
    search_query = request.args.get('search', '')
    page = request.args.get('page', 1, type=int)
    per_page = 20
    query = User.query.filter_by(role='student')

    if status != 'all':
        query = query.filter_by(verification_status=status)

    if search_query:
        query = query.filter(
            db.or_(
                User.username.ilike(f'%{search_query}%'),
                User.full_name.ilike(f'%{search_query}%'),
                User.group.ilike(f'%{search_query}%')
            )
        )

    pagination = query.order_by(User.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    students = pagination.items

    return render_template('verification/students.html', students=students, pagination=pagination, status=status)

@app.route('/verification/students/<int:student_id>')
@login_required
def view_student_details(student_id):
    """Views details of a student pending verification."""
    student = User.query.filter_by(id=student_id, role='student').first_or_404()
    return render_template('verification/student_details.html', student=student)

@app.route('/verification/students/verify', methods=['POST'])
@login_required
def verify_student():
    """Approves or rejects a student's verification."""
    student_id = request.form.get('student_id', type=int)
    action = request.form.get('action')
    comment = request.form.get('comment', '')

    if not student_id or action not in ['approve', 'reject']:
        flash('Invalid parameters', 'error')
        return redirect(url_for('student_verification_list'))

    student = User.query.filter_by(id=student_id, role='student').first()
    if not student:
        flash('Student not found', 'error')
        return redirect(url_for('student_verification_list'))

    admin_id = session.get('user_id')
    previous_status = student.verification_status

    if action == 'approve':
        student.verification_status = 'verified'
        flash(f'Verification for student {student.full_name} approved', 'success')
        action_name = 'approve'
        notification_title = 'Verification Approved'
        notification_body = 'Your student card verification has been approved!'
        if not comment: comment = 'Verification approved by administrator'
    else:
        student.verification_status = 'rejected'
        flash(f'Verification for student {student.full_name} rejected', 'error')
        action_name = 'reject'
        notification_title = 'Verification Rejected'
        notification_body = 'Your student card verification was rejected. Please upload a new photo.'
        if not comment: comment = 'Verification rejected by administrator'

    log_entry = VerificationLog(student_id=student_id,admin_id=admin_id,action=action_name,status_before=previous_status,status_after=student.verification_status,comment=comment)
    db.session.add(log_entry)
    db.session.commit()

    create_and_send_notification(
        recipient_id=student_id,
        title=notification_title,
        body=notification_body,
        notification_type='verification',
        sender_id=admin_id,
        data={'status': student.verification_status,'comment': comment},
        related_type='verification',
        related_id=log_entry.id
    )

    referrer = request.referrer
    if referrer and 'students/' + str(student_id) in referrer:
        return redirect(url_for('view_student_details', student_id=student_id))

    return redirect(url_for('student_verification_list'))

@app.route('/uploads/student_cards/admin/<filename>')
@login_required
def get_student_card_admin(filename):
    """Provides admin access to student card images."""
    try:
         return send_from_directory(STUDENT_CARDS_FOLDER, filename)
    except FileNotFoundError:
         abort(404)
    except Exception as e:
         print(f"Error serving student card image: {e}")
         abort(500)

# === Ticket Management === #

@app.route('/tickets')
@login_required
def tickets_list():
    """Displays the list of tickets for the admin."""
    status = request.args.get('status', 'all')
    category = request.args.get('category', 'all')
    search_query = request.args.get('search', '')
    page = request.args.get('page', 1, type=int)
    per_page = 20
    query = Ticket.query

    if status != 'all': query = query.filter_by(status=status)
    if category != 'all': query = query.filter_by(category=category)

    if search_query:
        query = query.join(User, Ticket.user_id == User.id).filter(
            db.or_(
                Ticket.title.ilike(f'%{search_query}%'),
                User.full_name.ilike(f'%{search_query}%'),
                User.username.ilike(f'%{search_query}%')
            )
        )

    query = query.order_by(Ticket.updated_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    tickets = pagination.items

    categories = [{'value': 'all', 'label': 'Все категории'},{'value': 'technical', 'label': 'Техническая проблема'},{'value': 'schedule', 'label': 'Проблема с расписанием'},{'value': 'verification', 'label': 'Вопрос по верификации'},{'value': 'other', 'label': 'Другое'}]
    statuses = [{'value': 'all', 'label': 'Все статусы'},{'value': 'new', 'label': 'Новый'},{'value': 'in_progress', 'label': 'В обработке'},{'value': 'waiting', 'label': 'Требует уточнения'},{'value': 'resolved', 'label': 'Решен'},{'value': 'closed', 'label': 'Закрыт'}]

    return render_template('tickets/list.html',tickets=tickets,pagination=pagination,categories=categories,statuses=statuses,current_status=status,current_category=category,search_query=search_query)

@app.route('/tickets/<int:ticket_id>')
@login_required
def view_ticket(ticket_id):
    """Views details and messages for a specific ticket."""
    ticket = db.session.get(Ticket, ticket_id)
    if not ticket: abort(404)
    user = User.query.get(ticket.user_id)
    messages = TicketMessage.query.filter_by(ticket_id=ticket.id).order_by(TicketMessage.created_at).all()

    if ticket.has_admin_unread:
        unread_messages = TicketMessage.query.filter_by(ticket_id=ticket.id,is_from_admin=False,is_read=False).all()
        for message in unread_messages: message.is_read = True
        ticket.has_admin_unread = False
        db.session.commit()

    for message in messages:
        if message.attachment:
            attachment = TicketAttachment.query.filter_by(message_id=message.id).first()
            if attachment: message.attachment_info = attachment

    categories = {'technical': 'Техническая проблема','schedule': 'Проблема с расписанием','verification': 'Вопрос по верификации','other': 'Другое'}
    statuses = {'new': {'label': 'Новый', 'color': 'blue'},'in_progress': {'label': 'В обработке', 'color': 'yellow'},'waiting': {'label': 'Требует уточнения', 'color': 'orange'},'resolved': {'label': 'Решен', 'color': 'green'},'closed': {'label': 'Закрыт', 'color': 'gray'}}

    return render_template('tickets/view.html',ticket=ticket,user=user,messages=messages,categories=categories,statuses=statuses)

@app.route('/tickets/<int:ticket_id>/reply', methods=['POST'])
@login_required
def reply_to_ticket(ticket_id):
    """Admin replies to a ticket, optionally adding an attachment and changing status."""
    ticket = Ticket.query.get_or_404(ticket_id)
    text = request.form.get('text', '').strip()
    new_status = request.form.get('status', ticket.status)
    has_attachment = 'attachment' in request.files and request.files['attachment'].filename
    if not text and not has_attachment:
        flash('Message text cannot be empty', 'error')
        return redirect(url_for('view_ticket', ticket_id=ticket_id))

    try:
        message = TicketMessage(
            ticket_id=ticket.id,
            user_id=session['user_id'],
            is_from_admin=True,
            text=text,
            is_read=False
        )

        if has_attachment:
            file = request.files['attachment']
            original_filename = secure_filename(file.filename)
            file_ext = os.path.splitext(original_filename)[1]
            filename = f"{uuid.uuid4()}{file_ext}"
            file_path = os.path.join(TICKET_ATTACHMENTS_FOLDER, filename)
            os.makedirs(TICKET_ATTACHMENTS_FOLDER, exist_ok=True)
            file.save(file_path)
            file_size = os.path.getsize(file_path)
            file_type = 'image' if file_ext.lower() in ['.jpg', '.jpeg', '.png', '.gif'] else 'document'
            message.attachment = filename
            attachment = TicketAttachment(message_id=0,filename=filename,original_filename=original_filename,file_type=file_type,file_size=file_size)
            db.session.add(message)
            db.session.flush()
            attachment.message_id = message.id
            db.session.add(attachment)
        else:
            db.session.add(message)

        status_changed = new_status != ticket.status
        old_status = ticket.status
        if status_changed: ticket.status = new_status

        ticket.has_user_unread = True
        ticket.updated_at = datetime.datetime.utcnow()
        db.session.commit()

        try:
            notification_title = "New reply in your ticket"
            notification_body = f"You received a reply to your ticket: {ticket.title}"
            if status_changed:
                status_names = {'new': 'New','in_progress': 'In Progress','waiting': 'Waiting for info','resolved': 'Resolved','closed': 'Closed'}
                new_status_name = status_names.get(new_status, new_status)
                notification_body += f". Status changed to: {new_status_name}"
            notification_data = {
                'ticket_id': ticket.id,
                'message_id': message.id,
                'status': ticket.status,
                'status_changed': status_changed,
                'old_status': old_status if status_changed else None
            }
            result = create_and_send_notification(
                recipient_id=ticket.user_id,
                title=notification_title,
                body=notification_body,
                notification_type='ticket',
                sender_id=session['user_id'],
                data=notification_data,
                related_type='ticket',
                related_id=ticket.id
            )
            if result.get('db_success'): print(f"Notification saved to DB: {result.get('notification_id')}")
            if result.get('push_success'): print("Push notification sent successfully")
            else: print(f"Failed to send push notification: {result.get('error', 'Unknown error')}")
        except Exception as notify_error:
            print(f"Overall error sending notification: {notify_error}")

        flash('Reply successfully sent', 'success')
    except Exception as e:
        db.session.rollback()
        print(f"Error in reply_to_ticket: {e}")
        flash(f'Error sending reply: {e}', 'error')

    return redirect(url_for('view_ticket', ticket_id=ticket_id))


@app.route('/tickets/dashboard')
@login_required
def tickets_dashboard():
    """Displays a dashboard with ticket statistics."""
    try:
        total_tickets = Ticket.query.count()
        open_tickets = Ticket.query.filter(Ticket.status.in_(['new', 'in_progress', 'waiting'])).count()
        resolved_tickets = Ticket.query.filter_by(status='resolved').count()
        closed_tickets = Ticket.query.filter_by(status='closed').count()
        categories = {'technical': 'Technical','schedule': 'Schedule','verification': 'Verification','other': 'Other'}
        category_stats = []
        for category_code, category_name in categories.items():
            count = Ticket.query.filter_by(category=category_code).count()
            category_stats.append({'code': category_code,'name': category_name,'count': count,'percentage': round((count / total_tickets * 100) if total_tickets > 0 else 0, 1)})
        admin_stats_query = db.session.query(
            User.id, User.username, User.full_name,
            db.func.count(db.distinct(TicketMessage.ticket_id)).label('tickets_count')
        ).join(
            TicketMessage, TicketMessage.user_id == User.id
        ).filter(
            User.is_admin == True,
            TicketMessage.is_from_admin == True
        ).group_by(User.id).order_by(db.desc('tickets_count')).all()
        admin_stats = [{'id': admin.id,'username': admin.username,'full_name': admin.full_name or admin.username,'tickets_count': admin.tickets_count} for admin in admin_stats_query]

        today = datetime.date.today()
        start_date = today - timedelta(days=29)
        tickets_by_day_query = db.session.query(
            db.func.date(Ticket.created_at).label('date'),
            db.func.count(Ticket.id).label('count')
        ).filter(
            db.func.date(Ticket.created_at) >= start_date
        ).group_by('date').order_by('date').all()
        tickets_by_day = {}
        for i in range(30):
            day = start_date + timedelta(days=i)
            tickets_by_day[day.strftime('%Y-%m-%d')] = 0
        for record in tickets_by_day_query:
            date_str = record.date.strftime('%Y-%m-%d')
            tickets_by_day[date_str] = record.count
        chart_data = [{'date': date,'count': count,'date_formatted': datetime.datetime.strptime(date, '%Y-%m-%d').strftime('%d.%m')} for date, count in tickets_by_day.items()]

        return render_template('tickets/dashboard.html',
            total_tickets=total_tickets,
            open_tickets=open_tickets,
            resolved_tickets=resolved_tickets,
            closed_tickets=closed_tickets,
            category_stats=category_stats,
            admin_stats=admin_stats,
            chart_data=chart_data
        )
    except Exception as e:
        flash(f'Error loading statistics: {e}', 'error')
        print(f"Error loading statistics: {e}")
        return redirect(url_for('tickets_list'))

@app.route('/uploads/ticket_attachments/<filename>')
@login_required
def get_ticket_attachment_admin(filename):
    """Provides admin access to ticket attachment files."""
    try:
        attachment = TicketAttachment.query.filter_by(filename=filename).first_or_404()
        return send_from_directory(TICKET_ATTACHMENTS_FOLDER, filename,as_attachment=request.args.get('download') == '1',download_name=attachment.original_filename if request.args.get('download') == '1' else None)
    except FileNotFoundError:
         abort(404)
    except Exception as e:
        flash(f'Error getting file: {e}', 'error')
        print(f"Error getting file: {e}")
        return redirect(url_for('tickets_list'))

# === Notification Management === #

@app.route('/notifications')
@login_required
def notifications_page():
    """Displays the notification sending form."""
    groups = db.session.query(User.group).filter(User.role == 'student', User.group.isnot(None)).distinct().order_by(User.group).all()
    groups = [g[0] for g in groups if g[0]]
    faculties = db.session.query(User.faculty).filter(User.faculty.isnot(None)).distinct().order_by(User.faculty).all()
    faculties = [f[0] for f in faculties if f[0]]
    departments = db.session.query(Teacher.department).distinct().order_by(Teacher.department).all()
    departments = [d[0] for d in departments if d[0]]
    positions = db.session.query(Teacher.position).distinct().order_by(Teacher.position).all()
    positions = [p[0] for p in positions if p[0]]
    return render_template('notifications/send.html',groups=groups,faculties=faculties,departments=departments,positions=positions)

@app.route('/notifications/view')
@login_required
def view_notifications():
    """Displays a list of sent notifications in the admin panel."""
    notification_type = request.args.get('type', '')
    user_id = request.args.get('user_id', type=int)
    sender_id = request.args.get('sender_id', type=int)
    is_read = request.args.get('is_read', '')
    search_query = request.args.get('search', '')
    page = request.args.get('page', 1, type=int)
    per_page = 30
    query = Notification.query

    if notification_type: query = query.filter_by(notification_type=notification_type)
    if user_id: query = query.filter_by(user_id=user_id)
    if sender_id: query = query.filter_by(sender_id=sender_id)
    if is_read == 'read': query = query.filter_by(is_read=True)
    elif is_read == 'unread': query = query.filter_by(is_read=False)

    if search_query:
        query = query.filter(
            db.or_(
                Notification.title.ilike(f'%{search_query}%'),
                Notification.body.ilike(f'%{search_query}%')
            )
        )

    users = User.query.order_by(User.username).all()
    notification_types = db.session.query(Notification.notification_type,db.func.count(Notification.id)).group_by(Notification.notification_type).all()
    pagination = query.order_by(Notification.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)
    notifications = pagination.items
    total_count = Notification.query.count()
    read_count = Notification.query.filter_by(is_read=True).count()
    unread_count = Notification.query.filter_by(is_read=False).count()

    return render_template('notifications/view.html',
                           notifications=notifications,
                           pagination=pagination,
                           users=users,
                           notification_types=notification_types,
                           total_count=total_count,
                           read_count=read_count,
                           unread_count=unread_count,
                           current_type=notification_type,
                           current_user_id=user_id,
                           current_sender_id=sender_id,
                           current_is_read=is_read,
                           search_query=search_query)

@app.route('/api/notifications/preview', methods=['POST'])
@login_required
def preview_notifications():
    """API to preview the number of recipients for a notification."""
    try:
        recipient_type = request.form.get('recipient_type')
        filter_data = {'recipient_type': recipient_type}

        if recipient_type == 'students':
            filter_data['student_group'] = request.form.get('student_group', '')
            filter_data['student_course'] = request.form.get('student_course', '')
            filter_data['student_faculty'] = request.form.get('student_faculty', '')
            filter_data['verification_status'] = request.form.get('verification_status', '')
        elif recipient_type == 'teachers':
            filter_data['teacher_department'] = request.form.get('teacher_department', '')
            filter_data['teacher_position'] = request.form.get('teacher_position', '')
        elif recipient_type == 'custom':
            selected_user_ids = request.form.get('selected_user_ids', '')
            filter_data['selected_user_ids'] = selected_user_ids

        recipients, devices = get_notification_recipients(filter_data)
        return jsonify({'users_count': len(recipients),'devices_count': len(devices)})
    except Exception as e:
        print(f"Error getting notification preview: {e}")
        return jsonify({'error': str(e),'users_count': 0,'devices_count': 0}), 500

@app.route('/api/users/search')
@login_required
def search_users():
    """API to search for users by name, username, or email."""
    search_term = request.args.get('term', '')
    if len(search_term) < 2: return jsonify([])
    try:
        users = User.query.filter(
            or_(
                User.full_name.ilike(f'%{search_term}%'),
                User.username.ilike(f'%{search_term}%'),
                User.email.ilike(f'%{search_term}%')
            )
        ).limit(10).all()
        results = []
        for user in users:
            results.append({'id': user.id,'username': user.username,'full_name': user.full_name,'email': user.email,'role': user.role,'group': user.group if user.role == 'student' else None})
        return jsonify(results)
    except Exception as e:
        print(f"Error searching users: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/notifications/<int:notification_id>/delete', methods=['POST'])
@login_required
def delete_notification_admin(notification_id):
    """Deletes a notification from the admin panel."""
    try:
        notification = Notification.query.get_or_404(notification_id)
        db.session.delete(notification)
        db.session.commit()
        flash('Notification successfully deleted', 'success')
        return redirect(url_for('view_notifications'))
    except Exception as e:
        db.session.rollback()
        flash(f'Error deleting notification: {e}', 'error')
        print(f"Error deleting notification: {e}")
        return redirect(url_for('view_notifications'))

@app.route('/api/notifications/send-personal', methods=['POST'])
@login_required
def send_personal_notification():
    """Sends a personal notification to a specific user."""
    try:
        data = request.json
        required_fields = ['user_id', 'title', 'message']
        for field in required_fields:
            if field not in data: return jsonify({'message': f'Missing required field: {field}','success': False}), 400
        user_id = data.get('user_id')
        title = data.get('title')
        message = data.get('message')
        user = User.query.get(user_id)
        if not user: return jsonify({'message': 'User not found','success': False}), 404

        admin_id = session.get('user_id')
        result = create_and_send_notification(
            recipient_id=user_id,
            title=title,
            body=message,
            notification_type='personal',
            sender_id=admin_id,
            data={'admin_id': admin_id,'custom_data': data.get('custom_data')}
        )
        if result.get('db_success'):
            return jsonify({'message': 'Notification sent successfully','notification_id': result.get('notification_id'),'push_success': result.get('push_success'),'success': True}), 200
        else:
            return jsonify({'message': 'Failed to send notification','error': result.get('error'),'success': False}), 500
    except Exception as e:
        print(f"Error sending personal notification: {e}")
        return jsonify({'message': f'Error: {e}','success': False}), 500

# === Utility Functions (Used across different sections) === #

def get_notification_recipients(filter_data):
    """Retrieves a list of users and their device tokens based on filters."""
    query = db.session.query(DeviceToken).join(User, DeviceToken.user_id == User.id)
    recipient_type = filter_data.get('recipient_type')

    if recipient_type == 'all': pass
    elif recipient_type == 'students':
        query = query.filter(User.role == 'student')
        student_group = filter_data.get('student_group')
        if student_group: query = query.filter(User.group == student_group)
        student_course = filter_data.get('student_course')
        if student_course: query = query.filter(User.group.like(f'{student_course}%'))
        student_faculty = filter_data.get('student_faculty')
        if student_faculty: query = query.filter(User.faculty == student_faculty)
        verification_status = filter_data.get('verification_status')
        if verification_status: query = query.filter(User.verification_status == verification_status)
    elif recipient_type == 'teachers':
        query = query.filter(User.role == 'teacher')
        teacher_department = filter_data.get('teacher_department')
        teacher_position = filter_data.get('teacher_position')
        if teacher_department or teacher_position:
            query = query.join(Teacher, Teacher.user_id == User.id)
            if teacher_department: query = query.filter(Teacher.department == teacher_department)
            if teacher_position: query = query.filter(Teacher.position == teacher_position)
    elif recipient_type == 'verified':
        query = query.filter(User.verification_status == 'verified')
    elif recipient_type == 'custom':
        selected_user_ids = filter_data.get('selected_user_ids')
        if selected_user_ids:
            user_ids = [int(id) for id in selected_user_ids.split(',') if id.strip()]
            query = query.filter(User.id.in_(user_ids))
        else: return [], []

    devices = query.all()
    user_ids = set(device.user_id for device in devices)
    users = User.query.filter(User.id.in_(user_ids)).all()
    return users, devices

def send_push_message(token, title, message, extra=None):
    """Sends a push notification via FCM or Expo Push Service."""
    try:
        if extra is None: extra = {}
        is_expo_token = token.startswith('ExponentPushToken') or token.startswith('expo/')
        print(f"Sending notification to token {token[:10]}... (Type: {'Expo' if is_expo_token else 'FCM'})")

        if is_expo_token:
            import requests
            import json
            expo_push_url = "https://exp.host/--/api/v2/push/send"
            push_message = {"to": token,"title": title,"body": message,"data": extra or {},"sound": "default","priority": "high"}
            headers = {"Accept": "application/json","Accept-encoding": "gzip, deflate","Content-Type": "application/json",}
            response = requests.post(expo_push_url,data=json.dumps(push_message),headers=headers)
            if response.status_code != 200:
                error_msg = f"Expo notification send error, status {response.status_code}: {response.text}"
                print(error_msg)
                return {"success": False, "error": error_msg}
            print("Expo push notification sent successfully")
            return {"success": True, "receipt": response.json()}
        else:
            if not FIREBASE_AVAILABLE:
                print("Firebase Admin SDK is not available. FCM notifications will not work.")
                return {"success": False, "error": "Firebase Admin SDK not available"}
            print("Sending FCM notification via Firebase Admin SDK")
            data_payload = {}
            for key, value in extra.items():
                data_payload[str(key)] = str(value)
            try:
                from firebase_admin import messaging
                notification = messaging.Notification(title=title,body=message)
                android_config = messaging.AndroidConfig(priority="high",notification=messaging.AndroidNotification(sound="default",priority="high",channel_id="default"))
                apns_config = messaging.APNSConfig(payload=messaging.APNSPayload(aps=messaging.Aps(content_available=True,sound="default")))
                fcm_message = messaging.Message(notification=notification,data=data_payload,token=token,android=android_config,apns=apns_config)
                response = messaging.send(fcm_message)
                print(f"FCM notification sent successfully: {response}")
                return {"success": True, "receipt": response}
            except Exception as fcm_error:
                error_msg = f"FCM notification send error: {fcm_error}"
                print(error_msg)
                return {"success": False, "error": error_msg}
    except Exception as exc:
        error_msg = f"Push notification send error: {exc}"
        print(error_msg)
        return {"success": False, "error": error_msg}

def create_and_send_notification(recipient_id, title, body, notification_type, sender_id=None, data=None,related_type=None, related_id=None):
    """Creates a DB notification record and sends a push notification."""
    result = {'db_success': False,'push_success': False,'notification_id': None,'push_receipts': []}
    try:
        notification = Notification.create_notification(
            user_id=recipient_id,
            title=title,
            body=body,
            notification_type=notification_type,
            sender_id=sender_id,
            data=data,
            related_type=related_type,
            related_id=related_id
        )
        db.session.add(notification)
        db.session.commit()
        result['db_success'] = True
        result['notification_id'] = notification.id
        device_tokens = DeviceToken.query.filter_by(user_id=recipient_id).all()
        if device_tokens:
            push_data = data.copy() if data else {}
            push_data.update({'notification_id': notification.id,'type': notification_type,'sender_id': sender_id,'timestamp': datetime.datetime.utcnow().isoformat()})
            if related_type and related_id:
                push_data.update({'related_type': related_type,'related_id': related_id})
            successful_deliveries = 0
            for token_obj in device_tokens:
                push_result = send_push_message(token_obj.token,title,body,push_data)
                result['push_receipts'].append({'device_id': token_obj.id,'success': push_result.get('success', False),'error': push_result.get('error')})
                if push_result.get('success'): successful_deliveries += 1
            if successful_deliveries > 0: result['push_success'] = True
        return result
    except Exception as e:
        if 'notification_id' in result and result['notification_id']: db.session.commit()
        else: db.session.rollback()
        print(f"Error creating notification record or sending push: {e}")
        result['error'] = str(e)
        return result

def get_attachment_info(message_id):
    """Retrieves attachment information for a ticket message."""
    try:
        attachment = TicketAttachment.query.filter_by(message_id=message_id).first()
        return attachment
    except Exception as e:
        print(f"Error retrieving attachment info: {e}")
        return None

@app.context_processor
def utility_processor():
    """Provides utility functions to Jinja2 templates."""
    return {'get_attachment_info': get_attachment_info, 'hasattr': hasattr}

def find_similar_teachers(hr_teacher_name, schedule_teachers):
    """Finds potential matches between an HR teacher's name and schedule teacher names."""
    name_parts = hr_teacher_name.split()
    if not name_parts: return []
    surname = name_parts[0]
    initials = ""
    if len(name_parts) > 1:
        for i in range(1, min(3, len(name_parts))):
            if name_parts[i]: initials += name_parts[i][0] + "."
    name_variants = [surname,f"{surname} {initials}",f"{surname} {initials.replace('.', '')}" if initials else "",f"{surname}{initials}",f"{surname}{initials.replace('.', '')}" if initials else ""]
    if len(name_parts) > 2:
        reversed_initials = ""
        if len(name_parts) >= 3:
            reversed_initials = name_parts[2][0] + "." + name_parts[1][0] + "."
            name_variants.extend([f"{surname} {reversed_initials}",f"{surname}{reversed_initials}",f"{surname} {reversed_initials.replace('.', '')}",f"{surname}{reversed_initials.replace('.', '')}"])
    matches = []
    for teacher in schedule_teachers:
        teacher_name = teacher.name.strip()
        if any(variant and teacher_name.lower().startswith(variant.lower()) for variant in name_variants if variant):
            matches.append((teacher, 100))
            continue
        if surname.lower() in teacher_name.lower():
            similarity = 70
            if initials:
                initials_without_dots = initials.replace(".", "")
                if initials in teacher_name: similarity += 20
                elif initials_without_dots in teacher_name: similarity += 15
                for i in range(len(initials_without_dots)):
                    if initials_without_dots[i].lower() in teacher_name.lower(): similarity += 5
            matches.append((teacher, similarity))
    matches.sort(key=lambda x: x[1], reverse=True)
    return [(teacher, score) for teacher, score in matches if score >= 70]


# === Initial Setup === #

def create_initial_admin():
    """Creates a default admin user if none exists."""
    try:
        with app.app_context():
            if User.query.filter_by(username='admin').first() is None:
                # Ensure password gets hashed correctly
                admin = User(username='admin', password='admin') # Assumes User model hashes on setattr(password)
                db.session.add(admin)
                db.session.commit()
                print("Initial admin created: admin / admin")
    except Exception as e:
        print(f"Error creating initial admin: {e}")

# === Main Routes === #

@app.route('/')
@login_required
def index():
    """Admin homepage."""
    return render_template('base.html')

# === Error Handlers === #

@app.errorhandler(404)
def not_found(error):
    """Handles 404 Not Found errors."""
    return render_template('errors/404.html'), 404

@app.errorhandler(500)
def internal_error(error):
    """Handles 500 Internal Server Errors."""
    db.session.rollback() # Rollback any pending transaction
    print(f"Internal Server Error: {error}")
    import traceback
    traceback.print_exc()
    return render_template('errors/500.html'), 500


# === Run Server === #

if __name__ == '__main__':
    try:
        with app.app_context():
            try:
                db.engine.connect()
                print("Database connection established")
                from sqlalchemy import inspect
                inspector = inspect(db.engine)
                if not inspector.has_table('user'):
                    print("Tables not found. Creating DB structure...")
                    db.create_all()
                    print("DB structure created")

                # Check and add missing columns if needed
                with db.engine.connect() as connection:
                    existing_cols = [col['name'] for col in inspector.get_columns('user')]
                    missing_cols = {
                        'role': 'VARCHAR(20)',
                        'verification_status': 'VARCHAR(20)',
                        'student_card_image': 'VARCHAR(255)',
                        'full_name': 'VARCHAR(255)',
                        '`group`': 'VARCHAR(50)', # Note: `group` might need backticks depending on DB
                        'faculty': 'VARCHAR(255)',
                        'email': 'VARCHAR(120) UNIQUE',
                        'password_plain': 'VARCHAR(255)',
                        'speciality_id': 'INT',
                        'speciality_code': 'VARCHAR(50)',
                        'speciality_name': 'VARCHAR(255)',
                        'study_form': 'VARCHAR(50)',
                        'study_form_name': 'VARCHAR(50)',
                        'created_at': 'DATETIME' # Add created_at if missing
                    }
                    for col_name, col_type in missing_cols.items():
                        # Use quotes for column name in check and ALTER statement if it's a reserved word like `group`
                        safe_col_name = f'`{col_name}`' if col_name == 'group' else col_name
                        if col_name not in existing_cols:
                            print(f"Adding missing column {safe_col_name} to user table")
                            # Use raw SQL for ALTER TABLE ADD COLUMN
                            alter_sql = f"ALTER TABLE user ADD COLUMN {safe_col_name} {col_type}"
                            try:
                                connection.execute(db.text(alter_sql))
                                connection.commit() # Commit each alter separately
                                print(f"Column {safe_col_name} added.")
                            except Exception as alter_e:
                                print(f"Error adding column {safe_col_name}: {alter_e}")
                                connection.rollback() # Rollback only the failed alter

                print("Database schema checks/updates complete.")

            except Exception as e:
                print(f"Error during database initialization or schema check: {e}")
                import traceback
                traceback.print_exc()

            create_initial_admin()

        app.run(debug=True, host='0.0.0.0', port=5000)
    except Exception as e:
        print(f"Error starting application: {e}")
        print("Please check database connection settings and server configuration.")