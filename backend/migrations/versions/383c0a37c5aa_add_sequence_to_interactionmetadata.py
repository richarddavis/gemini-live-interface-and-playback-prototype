"""Add sequence_number to InteractionMetadata for proper audio chunk ordering

Revision ID: 383c0a37c5aa
Revises: 
Create Date: 2025-01-02 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '383c0a37c5aa'
down_revision = '39bf419b40e0'  # update_foreign_key_constraints_for_
branch_labels = None
depends_on = None


def upgrade():
    """Add sequence_number column to interaction_metadata table"""
    # Add sequence_number column to interaction_metadata table
    op.add_column('interaction_metadata', 
                  sa.Column('sequence_number', sa.Integer(), nullable=True))
    
    # Add index on sequence_number for performance
    op.create_index('idx_interaction_metadata_sequence_number', 
                    'interaction_metadata', 
                    ['sequence_number'])


def downgrade():
    """Remove sequence_number column from interaction_metadata table"""
    # Drop index first
    op.drop_index('idx_interaction_metadata_sequence_number', 
                  table_name='interaction_metadata')
    
    # Drop the column
    op.drop_column('interaction_metadata', 'sequence_number') 