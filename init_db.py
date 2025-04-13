import pymysql
from flask import Flask
from db import db
import time


# Create database if it doesn't exist
def create_database():
    connection = pymysql.connect(
        host='localhost',
        user='root',
        password='',
        charset='utf8mb4'
    )

    try:
        with connection.cursor() as cursor:
            cursor.execute("CREATE DATABASE IF NOT EXISTS university CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        print("Database 'university' created or already exists.")
    except Exception as e:
        print(f"Error creating database: {e}")
    finally:
        connection.close()


# Initialize the app and create all tables
def create_tables():
    # Need to import models here to ensure they're registered with SQLAlchemy
    from models import User, Teacher, Schedule

    app = Flask(__name__)
    app.config.from_object('config')

    db.init_app(app)

    with app.app_context():
        try:
            db.create_all()
            print("All tables created.")

            # Check if the admin user exists, create if not
            if User.query.filter_by(username='admin').first() is None:
                admin = User(username='admin', password='admin')
                db.session.add(admin)
                db.session.commit()
                print("Created initial admin user: admin / admin")
            else:
                print("Admin user already exists")

        except Exception as e:
            print(f"Error creating tables or admin user: {e}")
            raise


if __name__ == "__main__":
    print("Initializing MySQL database...")
    create_database()

    # Allow time for the database to be ready
    time.sleep(1)

    create_tables()
    print("Database initialization complete.")