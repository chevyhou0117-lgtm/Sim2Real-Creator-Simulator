"""add md_production_line.line_name_cn + md_stage.stage_name_cn

产线/制程的中文显示名。英文原名保留在 line_name/stage_name 不动（对齐 md_operation
的 operation_name / operation_name_cn 双列模式），前端按界面语言（zh/en）选列显示。
允许 NULL，旧数据无需回填（前端回退英文名）。

Revision ID: a7c9e2d4b6f8
Revises: f1a2b3c4d5e6
Create Date: 2026-07-06
"""
from alembic import op
import sqlalchemy as sa


revision = "a7c9e2d4b6f8"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("md_production_line", sa.Column("line_name_cn", sa.String(length=200), nullable=True))
    op.add_column("md_stage", sa.Column("stage_name_cn", sa.String(length=200), nullable=True))


def downgrade():
    op.drop_column("md_stage", "stage_name_cn")
    op.drop_column("md_production_line", "line_name_cn")
