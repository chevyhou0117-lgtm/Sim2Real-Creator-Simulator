"""Plan-scoped query helpers for md_* tables.

PRD §2.1.x 基础数据快照机制：md_* 表行的可见性由 plan_id 决定。
  - plan_id IS NULL  → 主数据当前版本（所有方案可见）
  - plan_id = X      → 方案 X 专属（仅方案 X 可见，优先级高于主数据）

查询时按 "plan-scope" 过滤：方案 X 看 plan_id IN (X, NULL)；同业务键有多行时
优先 plan_id 非空那行（NULLS LAST）。本模块提供 helper 简化所有 md_* 查询。"""

from __future__ import annotations

from typing import TypeVar

from sqlalchemy import or_, select
from sqlalchemy.orm import Query, Session

from app.database import Base
from app.models.sim import SimulationPlan

T = TypeVar("T", bound=Base)


def _is_snapshotted(session: Session, plan_id: str) -> bool:
    """方案是否已建基础数据快照。

    建方案即快照后此值恒为 True；仅 seed 方案 / 本次改造前建的老方案可能为 False，
    那种情况退回旧的 "X OR NULL" 叠加视图兜底。
    判定依据：snapshot 服务在 clone 完成时写入 base_data_version="snapshot:<ts>"。
    """
    bdv = (
        session.query(SimulationPlan.base_data_version)
        .filter(SimulationPlan.plan_id == plan_id)
        .scalar()
    )
    return bool(bdv and bdv.startswith("snapshot:"))


def scoped(query: Query, model: type[T], plan_id: str | None) -> Query:
    """加 plan-scope 过滤。

    - plan_id=None              → 主数据视图：plan_id IS NULL
    - plan_id=X 且方案已快照     → 隔离视图：plan_id == X（方案有整套副本，不混全局，无重复）
    - plan_id=X 且方案未快照     → 兜底叠加：plan_id == X OR plan_id IS NULL

    Usage:
        scoped(db.query(ProductionLine), ProductionLine, plan_id).all()
    """
    if plan_id is None:
        return query.filter(model.plan_id.is_(None))
    if _is_snapshotted(query.session, plan_id):
        return query.filter(model.plan_id == plan_id)
    return query.filter(or_(model.plan_id == plan_id, model.plan_id.is_(None)))


def scoped_pick(
    db: Session,
    model: type[T],
    plan_id: str | None,
    *business_key_eq: tuple,
) -> T | None:
    """按业务键 + plan-scope 取**最具体**那一行（plan_id 非空优先于 NULL）。

    business_key_eq 是 SQLAlchemy 表达式 list（如 [Stage.factory_id == fid, Stage.stage_code == "SMT"]）。

    返回 None 表示既没主数据也没快照覆盖。
    """
    q = db.query(model)
    for cond in business_key_eq:
        q = q.filter(cond)
    q = scoped(q, model, plan_id)
    # plan_id 非空那行优先（plan_id DESC NULLS LAST 等价于"非空在前"）
    q = q.order_by(model.plan_id.desc().nullslast())
    return q.first()


def scoped_list_distinct(
    db: Session,
    model: type[T],
    plan_id: str | None,
    business_key_cols: list,
    *filters,
) -> list[T]:
    """按业务键去重列出 plan-scoped 行。每个业务键值返回 1 行（plan 覆盖优先）。

    business_key_cols 用于 DISTINCT ON（PostgreSQL 特性）。

    Usage:
        scoped_list_distinct(
            db, ProductionLine, plan_id,
            business_key_cols=[ProductionLine.line_code],
            ProductionLine.stage_id == stage_id, ProductionLine.status == "ACTIVE",
        )
    """
    stmt = select(model)
    for f in filters:
        stmt = stmt.where(f)
    if plan_id is None:
        stmt = stmt.where(model.plan_id.is_(None))
    elif _is_snapshotted(db, plan_id):
        stmt = stmt.where(model.plan_id == plan_id)
    else:
        stmt = stmt.where(or_(model.plan_id == plan_id, model.plan_id.is_(None)))
    # DISTINCT ON 需要 ORDER BY 业务键 + plan_id NULLS LAST
    stmt = stmt.distinct(*business_key_cols).order_by(
        *business_key_cols,
        model.plan_id.desc().nullslast(),
    )
    return list(db.execute(stmt).scalars().all())
