# Path: backend/migrations/script.py.mako
# This is the Mako template for migration scripts.
# It is used by Alembic to generate new migration files.
"""Update foreign key constraints for cascade delete

Revision ID: 39bf419b40e0
Revises: '2ed84548277c'
Create Date: 2025-06-02 13:46:17.102851

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '39bf419b40e0'
down_revision = '2ed84548277c'
branch_labels = None
depends_on = None


def upgrade():
    # Update foreign key constraint for interaction_session_summary.chat_session_id
    # First drop the existing constraint
    op.drop_constraint('interaction_session_summary_chat_session_id_fkey', 'interaction_session_summary', type_='foreignkey')
    
    # Then recreate it with CASCADE DELETE
    op.create_foreign_key(
        'interaction_session_summary_chat_session_id_fkey', 
        'interaction_session_summary', 
        'chat_session', 
        ['chat_session_id'], 
        ['id'], 
        ondelete='CASCADE'
    )


def downgrade():
    # Restore the original foreign key constraint without cascade
    op.drop_constraint('interaction_session_summary_chat_session_id_fkey', 'interaction_session_summary', type_='foreignkey')
    
    op.create_foreign_key(
        'interaction_session_summary_chat_session_id_fkey', 
        'interaction_session_summary', 
        'chat_session', 
        ['chat_session_id'], 
        ['id']
    ) 