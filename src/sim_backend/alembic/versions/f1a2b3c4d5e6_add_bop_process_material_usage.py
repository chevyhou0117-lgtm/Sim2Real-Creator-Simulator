"""add md_bop_process.material_usage (MATERIAL_SUPPLY 用料配方)

每道工序的投入物料 {material_code: qty/件}，可含原料 + 上游半成品。
MATERIAL_SUPPLY 约束按其中【原料】(非 SEMI_FINISHED) 从库存扣；半成品走线边仓缓冲。
允许 NULL（无投料的工序），旧数据无需回填。

Revision ID: f1a2b3c4d5e6
Revises: 9c4e1a7b2f08
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "f1a2b3c4d5e6"
down_revision = "9c4e1a7b2f08"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "md_bop_process",
        sa.Column("material_usage", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade():
    op.drop_column("md_bop_process", "material_usage")
