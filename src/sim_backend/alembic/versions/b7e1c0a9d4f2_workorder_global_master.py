"""WorkOrder 改为全局主数据：plan_id 可空 + canonical/scoped partial unique

把 biz_work_order 对齐 md_* 的快照模式：plan_id IS NULL 为全局工单（seed 提供），
建方案时随快照克隆为方案专属副本（plan_id=X）。

Revision ID: b7e1c0a9d4f2
Revises: 86ffb68c532b
Create Date: 2026-05-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b7e1c0a9d4f2"
down_revision: Union[str, None] = "86ffb68c532b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "biz_work_order", "plan_id",
        existing_type=sa.String(length=36), nullable=True,
    )
    op.drop_constraint(
        "biz_work_order_plan_id_wo_no_key", "biz_work_order", type_="unique"
    )
    op.drop_constraint(
        "biz_work_order_plan_id_fkey", "biz_work_order", type_="foreignkey"
    )
    op.create_index(
        op.f("ix_biz_work_order_plan_id"), "biz_work_order", ["plan_id"],
        unique=False,
    )
    op.create_index(
        "uq_wo_canonical", "biz_work_order", ["wo_no"], unique=True,
        postgresql_where=sa.text("plan_id IS NULL"),
    )
    op.create_index(
        "uq_wo_scoped", "biz_work_order", ["plan_id", "wo_no"], unique=True,
        postgresql_where=sa.text("plan_id IS NOT NULL"),
    )
    op.create_foreign_key(
        "biz_work_order_plan_id_fkey", "biz_work_order", "sim_simulation_plan",
        ["plan_id"], ["plan_id"], ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "biz_work_order_plan_id_fkey", "biz_work_order", type_="foreignkey"
    )
    op.drop_index("uq_wo_scoped", table_name="biz_work_order")
    op.drop_index("uq_wo_canonical", table_name="biz_work_order")
    op.drop_index(op.f("ix_biz_work_order_plan_id"), table_name="biz_work_order")
    # 回滚前需保证无 plan_id IS NULL 行，否则 NOT NULL / 唯一约束会失败
    op.create_foreign_key(
        "biz_work_order_plan_id_fkey", "biz_work_order", "sim_simulation_plan",
        ["plan_id"], ["plan_id"],
    )
    op.create_unique_constraint(
        "biz_work_order_plan_id_wo_no_key", "biz_work_order",
        ["plan_id", "wo_no"],
    )
    op.alter_column(
        "biz_work_order", "plan_id",
        existing_type=sa.String(length=36), nullable=False,
    )
