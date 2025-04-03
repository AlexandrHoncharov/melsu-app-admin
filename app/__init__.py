# app/__init__.py
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_bcrypt import Bcrypt
from app.config import Config

# Инициализация расширений
db = SQLAlchemy()
login_manager = LoginManager()
login_manager.login_view = 'auth.login'
login_manager.login_message_category = 'info'
bcrypt = Bcrypt()


def create_app(config_class=Config):
    """Функция фабрики приложения"""
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Инициализация расширений с приложением
    db.init_app(app)
    login_manager.init_app(app)
    bcrypt.init_app(app)

    # Регистрация модулей (blueprints)
    from app.auth.routes import auth
    from app.dashboard.routes import dashboard
    from app.teacher.routes import teacher
    from app.schedule.routes import schedule

    app.register_blueprint(auth)
    app.register_blueprint(dashboard)
    app.register_blueprint(teacher)
    app.register_blueprint(schedule)

    # Обработчик ошибки 404
    @app.errorhandler(404)
    def page_not_found(e):
        return render_template('404.html'), 404

    # Обработчик ошибки 500
    @app.errorhandler(500)
    def internal_server_error(e):
        return render_template('500.html'), 500

    return app


# Создание таблиц при первом запуске
from app import models