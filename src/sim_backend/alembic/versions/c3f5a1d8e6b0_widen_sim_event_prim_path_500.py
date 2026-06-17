"""widen res_simulation_event.prim_path 200 -> 500

全厂 demo520 的 USD prim 完整路径（/World/ProdLine/.../ASSET_PROD/asset_*_PROD/
t_id_*) 常超 200 字符，导致仿真事件落库 StringDataRightTruncation → 整次仿真
FAILED。对齐 Equipment.creator_binding_id 的 String(500)（prim_path 即由它而来）。

Revision ID: c3f5a1d8e6b0
Revises: b7e1c0a9d4f2
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa

revision = "c3f5a1d8e6b0"
down_revision = "b7e1c0a9d4f2"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        "res_simulation_event", "prim_path",
        existing_type=sa.String(length=200),
        type_=sa.String(length=500),
        existing_nullable=True,
    )


def downgrade():
    op.alter_column(
        "res_simulation_event", "prim_path",
        existing_type=sa.String(length=500),
        type_=sa.String(length=200),
        existing_nullable=True,
    )
