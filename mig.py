# В файле migrations/add_device_token_fields.py или через Flask-Migrate

"""Add enhanced device token fields

Revision ID: abcdef123456
Revises: previous_revision_id
Create Date: 2023-06-10 12:34:56.789123

"""
from alembic import op
import sqlalchemy as sa


def upgrade():
    # DeviceToken updates
    op.add_column('device_token', sa.Column('device_id', sa.String(255), nullable=True))
    op.add_column('device_token', sa.Column('app_version', sa.String(50), nullable=True))
    op.add_column('device_token', sa.Column('is_expo_token', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('device_token', sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'))
    op.add_column('device_token', sa.Column('last_used', sa.DateTime(), nullable=True))

    # Create push notification log table
    op.create_table(
        'push_notification_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('device_token_id', sa.Integer(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('notification_type', sa.String(50), nullable=True),
        sa.Column('title', sa.String(255), nullable=True),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('data', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(50), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('sent_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['device_token_id'], ['device_token.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Добавляем индексы для ускорения запросов
    op.create_index('idx_device_token_user_id', 'device_token', ['user_id'])
    op.create_index('idx_device_token_token', 'device_token', ['token'])
    op.create_index('idx_push_log_user_id', 'push_notification_log', ['user_id'])


def downgrade():
    # Удаляем индексы
    op.drop_index('idx_push_log_user_id')
    op.drop_index('idx_device_token_token')
    op.drop_index('idx_device_token_user_id')

    # Удаляем таблицу логов
    op.drop_table('push_notification_log')

    # Удаляем колонки из device_token
    op.drop_column('device_token', 'last_used')
    op.drop_column('device_token', 'is_active')
    op.drop_column('device_token', 'is_expo_token')
    op.drop_column('device_token', 'app_version')
    op.drop_column('device_token', 'device_id')