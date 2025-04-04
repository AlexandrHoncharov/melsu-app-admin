import os

SECRET_KEY = os.environ.get('SECRET_KEY', 'dev_key_replace_in_production')
SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', 'sqlite:///university.db')
SQLALCHEMY_TRACK_MODIFICATIONS = False