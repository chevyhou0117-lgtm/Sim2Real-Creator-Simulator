"""add md_factory site dims + relax bom_part nullable

Revision ID: 8e9003456829
Revises: d4f7e8a91b23
Create Date: 2026-06-01 20:04:46.899394

Phase 2 (Creator→Sim merge) 引入的两处 md.py 改动补迁移：
  1. md_factory += site_length / site_width（Numeric(10,2)，Creator base_factory 厂房尺寸）
  2. md_equipment_bom_part 的 part_model / part_manufacturer / parent_part_id 放宽为 nullable

注意：autogenerate 会把 creator_tables.sql 建的 Creator 专有表（factory_*/dict_*/
asset_*/users 等）误判为 "removed table" 并生成 DROP——这些表不在 sim_backend ORM
里、由 raw SQL 拥有，故已从本迁移中剔除，切勿加回。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '8e9003456829'
down_revision: Union[str, None] = 'd4f7e8a91b23'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('md_equipment_bom_part', 'part_model',
                    existing_type=sa.VARCHAR(length=200), nullable=True)
    op.alter_column('md_equipment_bom_part', 'part_manufacturer',
                    existing_type=sa.VARCHAR(length=200), nullable=True)
    op.alter_column('md_equipment_bom_part', 'parent_part_id',
                    existing_type=sa.VARCHAR(length=36), nullable=True)
    op.add_column('md_factory', sa.Column('site_length', sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column('md_factory', sa.Column('site_width', sa.Numeric(precision=10, scale=2), nullable=True))


def downgrade() -> None:
    op.drop_column('md_factory', 'site_width')
    op.drop_column('md_factory', 'site_length')
    op.alter_column('md_equipment_bom_part', 'parent_part_id',
                    existing_type=sa.VARCHAR(length=36), nullable=False)
    op.alter_column('md_equipment_bom_part', 'part_manufacturer',
                    existing_type=sa.VARCHAR(length=200), nullable=False)
    op.alter_column('md_equipment_bom_part', 'part_model',
                    existing_type=sa.VARCHAR(length=200), nullable=False)
