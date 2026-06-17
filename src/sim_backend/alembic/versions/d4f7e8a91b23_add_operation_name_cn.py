"""add md_operation.operation_name_cn

为工序加中文显示名列。原 operation_name 多为英文（seed CSV 里就是），
前端资产树要显示中文友好名，又不愿改动现有 operation_name 字段（破坏现有
import / 引用语义）。新列允许 NULL，旧数据无需回填，前端 fallback 用英文。

Revision ID: d4f7e8a91b23
Revises: c3f5a1d8e6b0
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa


revision = "d4f7e8a91b23"
down_revision = "c3f5a1d8e6b0"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "md_operation",
        sa.Column("operation_name_cn", sa.String(length=200), nullable=True),
    )


def downgrade():
    op.drop_column("md_operation", "operation_name_cn")
