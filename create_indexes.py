from flask import Flask
from db import db
from sqlalchemy import text

app = Flask(__name__)
app.config.from_object('config')

db.init_app(app)


def create_indexes():
    """Create indexes for better performance on the Schedule table"""
    with app.app_context():
        # Create indexes for the most commonly used filter columns
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_schedule_group ON schedule (group_name)"
        ))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_schedule_date ON schedule (date)"
        ))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_schedule_teacher ON schedule (teacher_name)"
        ))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_schedule_semester ON schedule (semester)"
        ))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_schedule_subject ON schedule (subject(50))"
        ))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_schedule_subgroup ON schedule (subgroup)"
        ))

        # Create combined indexes for common query patterns
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_schedule_group_date ON schedule (group_name, date)"
        ))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_schedule_semester_group ON schedule (semester, group_name)"
        ))

        db.session.commit()
        print("Indexes created successfully.")


if __name__ == "__main__":
    create_indexes()