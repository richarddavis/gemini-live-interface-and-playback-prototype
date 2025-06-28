"""Drop task table and related index

Revision ID: 7d1bb90d3c8d
Revises: 383c0a37c5aa
Create Date: 2025-06-28 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '7d1bb90d3c8d'
down_revision = '383c0a37c5aa'
branch_labels = None
depends_on = None

def upgrade():
    """Drop the now-unused 'task' table and its user_id index."""
    # Drop index first if it exists
    with op.batch_alter_table('task', schema=None) as batch_op:
        try:
            batch_op.drop_index('ix_task_user_id')
        except Exception:
            # Index might not exist in some dev DBs – ignore error
            pass
    # Then drop the table
    op.drop_table('task')

def downgrade():
    """Re-create the 'task' table (necessary for Alembic downgrade)."""
    op.create_table(
        'task',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('title', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('completed', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
    )
    op.create_index('ix_task_user_id', 'task', ['user_id'])