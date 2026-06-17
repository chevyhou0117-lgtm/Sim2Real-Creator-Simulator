"""add computation_phase to res_simulation_result

记录仿真计算子阶段（SIMULATING / PERSISTING），供 GET /run/status 区分
①离散事件仿真 与 ②写库 两步。可空——历史行与非 COMPUTING 状态无值。

手写迁移（非 autogenerate）：autogenerate 会把 creator_tables.sql 拥有的
Creator 专有表误判为 removed 并生成 DROP，必须手写以只动这一列。

Revision ID: 9c4e1a7b2f08
Revises: 8e9003456829
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa

revision = "9c4e1a7b2f08"
down_revision = "8e9003456829"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "res_simulation_result",
        sa.Column("computation_phase", sa.String(length=20), nullable=True),
    )


def downgrade():
    op.drop_column("res_simulation_result", "computation_phase")
