"""Add product image URLs.

Revision ID: 0003_add_product_images
Revises: 0002_add_payments
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0003_add_product_images"
down_revision: Union[str, None] = "0002_add_payments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("products", sa.Column("image_url", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("products", "image_url")
