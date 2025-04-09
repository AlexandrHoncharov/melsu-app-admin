import os

SECRET_KEY = os.environ.get('SECRET_KEY', 'dev_key_replace_in_production')
SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', 'mysql://university_user:@localhost/university')
SQLALCHEMY_TRACK_MODIFICATIONS = False
SQLALCHEMY_ENGINE_OPTIONS = {
    'pool_recycle': 3600,
    'pool_pre_ping': True
}