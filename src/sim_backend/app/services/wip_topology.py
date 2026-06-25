"""L1：按 active BoP 自动生成「半成品物料」与「虚拟线边仓」拓扑。

设计（见与用户的讨论）：
- 每条线的 BoP 是一串工序（BOPProcess by sequence）。相邻工序 op_i→op_{i+1} 之间，
  op_i 的产出是半成品，需要一个暂存货架 = 虚拟线边仓。
- 半成品：每个非末端工序的产出，登记为 md_material(material_type=SEMI_FINISHED)，
  编码用 common.semi_finished_code(product_code, op_code)（单一来源）。
- 虚拟线边仓：md_wip_buffer(line_id, pre_op=op_i, post_op=op_{i+1})，
  capacity_qty=NULL（=默认无限，引擎据此不建 Container/不背压；勾选约束后由"导入容量"置数）。
- 仅操作全局主数据（plan_id IS NULL）；建方案时随 snapshot._CLONE_PLAN 克隆并重映射到方案专属 id。
- 幂等：按确定性编码 upsert，可反复跑（load_seed 每次调用，或将来 BoP 写入路径调用）。
- 缓冲是"物理货架"（line + 相邻工序对）；多产品同相邻对共享一个货架，货架里具体是哪个
  半成品按"当前在跑的产品"在运行期/快照里标注（M:N，不在货架定义上挂死物料）。
- 产品 BoP 不一定用满所有工序：只在该产品 BoP 实际相邻的工序对之间生成（产品 B 只用 90 道 →
  只在那 90 道相邻间生成）。
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.engine.common import semi_finished_code
from app.models.md import BOP, BOPProcess, Material, Operation, ProductionLine, Product, WIPBuffer

# 虚拟线边仓默认"无限容量"：capacity_qty=NULL（引擎视为无限）。capacity_volume 列 NOT NULL，
# 但本期件数口径不读它；填一个很大的哨兵表示"体积不设限"，避免无谓 migration。
_VIRTUAL_VOLUME = 999999.999


def _wip_code(line_code: str, pre_seq: int, post_seq: int) -> str:
    # 用工序序号而非工序编码：工序编码可达 16 字符，WIP-{line}-{pre}-{post} 会超 wip_code(50)。
    # 序号紧凑且按线唯一（同 stage 多线共享工序时，line_code 仍区分各自货架）。
    return f"WIP-{line_code}-{pre_seq:03d}-{post_seq:03d}"


def regenerate_wip_topology(db: Session) -> dict:
    """从所有 active 全局 BoP 生成半成品 + 虚拟线边仓。幂等，返回计数。"""
    counts = {"bops": 0, "semi_finished_new": 0, "buffers_new": 0}

    op_code: dict[str, str] = dict(
        db.query(Operation.operation_id, Operation.operation_code)
        .filter(Operation.plan_id.is_(None))
        .all()
    )

    bops = (
        db.query(BOP)
        .filter(BOP.plan_id.is_(None), BOP.is_active == True)  # noqa: E712
        .all()
    )
    # run 内去重：session autoflush=False，未 flush 的 add 不被后续 .first() 看到。
    # 同 stage 多条线常共享同一批 operation（如 SMT01/SMT02）→ 同 (product, op) 半成品会重复生成；
    # 半成品"某工序后的产出"与线无关，去重到每 (product, op) 一条即可。缓冲含 line_code 不会撞。
    seen_mat: set[str] = set()
    seen_buf: set[str] = set()
    for bop in bops:
        product = db.query(Product).get(bop.product_id)
        line = db.query(ProductionLine).get(bop.line_id)
        if not product or not line:
            continue
        procs = (
            db.query(BOPProcess)
            .filter(BOPProcess.bop_id == bop.bop_id, BOPProcess.plan_id.is_(None))
            .order_by(BOPProcess.sequence)
            .all()
        )
        if len(procs) < 2:
            continue
        counts["bops"] += 1
        for i in range(len(procs) - 1):
            pre, post = procs[i], procs[i + 1]
            pre_code = op_code.get(pre.operation_id)
            post_code = op_code.get(post.operation_id)
            if not pre_code or not post_code:
                continue
            # 半成品（pre 工序产出）
            sf_code = semi_finished_code(product.product_code, pre_code)
            if sf_code not in seen_mat:
                seen_mat.add(sf_code)
                if _upsert_material(db, sf_code, f"半成品 {product.product_code}@{pre_code}"):
                    counts["semi_finished_new"] += 1
            # 虚拟线边仓（pre→post 之间，默认无限）
            wcode = _wip_code(line.line_code, pre.sequence, post.sequence)
            if wcode not in seen_buf:
                seen_buf.add(wcode)
                if _upsert_buffer(
                    db, wcode, line.line_id, pre.operation_id, post.operation_id,
                    f"{line.line_code} {pre_code}→{post_code} 线边仓",
                ):
                    counts["buffers_new"] += 1
    db.flush()
    return counts


def _upsert_material(db: Session, code: str, name: str) -> bool:
    row = (
        db.query(Material)
        .filter(Material.plan_id.is_(None), Material.material_code == code)
        .first()
    )
    if row is not None:
        return False
    db.add(Material(
        plan_id=None, material_code=code, material_name=name,
        material_type="SEMI_FINISHED", unit="PCS", status="ACTIVE",
    ))
    return True


def _upsert_buffer(db: Session, wcode: str, line_id: str, pre_op: str, post_op: str, name: str) -> bool:
    row = (
        db.query(WIPBuffer)
        .filter(WIPBuffer.plan_id.is_(None), WIPBuffer.wip_code == wcode)
        .first()
    )
    if row is not None:
        # 保持线/前后工序最新；**不**覆盖 capacity_qty（用户导入的容量不能被重生成抹掉）
        row.line_id = line_id
        row.pre_operation_id = pre_op
        row.post_operation_id = post_op
        return False
    db.add(WIPBuffer(
        plan_id=None, wip_code=wcode, wip_name=name, line_id=line_id,
        pre_operation_id=pre_op, post_operation_id=post_op,
        capacity_qty=None, capacity_volume=_VIRTUAL_VOLUME, status="ACTIVE",
    ))
    return True
