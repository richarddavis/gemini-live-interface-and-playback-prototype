"""Add media columns to chat_message table

Revision ID: add_media_columns
Revises: 
Create Date: 2023-11-08

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_media_columns'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Make text column nullable
    op.alter_column('chat_message', 'text',
                   existing_type=sa.Text(),
                   nullable=True)
    
    # Add media_type and media_url columns
    op.add_column('chat_message', sa.Column('media_type', sa.String(length=50), nullable=True))
    op.add_column('chat_message', sa.Column('media_url', sa.String(length=500), nullable=True))


def downgrade():
    # Remove media columns
    op.drop_column('chat_message', 'media_url')
    op.drop_column('chat_message', 'media_type')
    
    # Make text column non-nullable again
    op.alter_column('chat_message', 'text',
                   existing_type=sa.Text(),
                   nullable=False) 