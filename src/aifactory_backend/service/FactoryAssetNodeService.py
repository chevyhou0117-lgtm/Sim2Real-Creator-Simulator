# service/FactoryAssetNodeService.py
import logging
from typing import Dict, List, Optional, Tuple, Union

from sqlalchemy import select, delete as sa_delete, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from common.ErrorCode import ErrorCode
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.FactoryAssetNodeDto import (
    FactoryAssetNodeCreateDto,
    FactoryAssetNodeUpdateDto,
    FactoryAssetNodeBindDto,
    FactoryAssetNodeUnbindDto,
    AddLineNodeDto,
)
from models.entity.FactoryAssetNodeEntity import FactoryAssetNode
from models.entity.FactoryEquipmentDetailsEntity import FactoryEquipmentDetails
from models.entity.FactoryAsset3dModelEntity import FactoryAsset3dModel
from models.entity.FactoryLineDetailsEntity import FactoryLineDetails
from models.entity.FactoryProcessDetailsEntity import FactoryProcessDetails
from models.entity.LineModelDetailEntity import LineModelDetail
from models.entity.LineModelEquipmentRelEntity import LineModelEquipmentRel
from models.entity.EquipmentModelDetailEntity import EquipmentModelDetail
from models.entity.AssetCategoryEntity import AssetCategory
from models.entity.BaseStageEntity import BaseStage
from models.entity.BaseProductionLineEntity import BaseProductionLine
from models.entity.BaseEquipmentEntity import BaseEquipment
from models.entity.BaseEquipmentTechnicalSpecEntity import BaseEquipmentTechnicalSpec
from models.entity.BaseEquipmentProcessParamEntity import BaseEquipmentProcessParam
from models.entity.BaseEquipmentBomPartEntity import BaseEquipmentBomPart
from models.entity.BaseEquipmentSopEntity import BaseEquipmentSop
from models.entity.BaseEquipmentOperationRecordEntity import BaseEquipmentOperationRecord
from models.entity.FactoryProjectEntity import FactoryProject
from models.enums.InstanceAssetTypeEnum import InstanceAssetType
from models.enums.BindStatusEnum import BindStatus
from models.vo.FactoryAssetNodeVo import (
    EquipmentDetailsSpecialVo,
    FactoryAssetNodeVo,
    FactoryAssetNodeTreeVo,
    LineDetailsSpecialVo,
    ProcessDetailsSpecialVo,
)
from models.vo.FactoryProjectVo import FactoryProjectVo
from models.vo.FactoryProcessDetailsVo import FactoryProcessDetailsVo
from models.vo.FactoryLineDetailsVo import FactoryLineDetailsVo
from models.vo.FactoryEquipmentDetailsVo import FactoryEquipmentDetailsVo
from models.vo.BaseStageVo import BaseStageVo
from models.vo.BaseProductionLineVo import BaseProductionLineVo
from models.vo.BaseEquipmentFullDetailVo import BaseEquipmentFullDetailVo
from models.vo.BaseEquipmentTechnicalSpecVo import BaseEquipmentTechnicalSpecVo
from models.vo.BaseEquipmentProcessParamVo import BaseEquipmentProcessParamVo
from models.vo.BaseEquipmentBomPartVo import BaseEquipmentBomPartVo
from models.vo.BaseEquipmentSopVo import BaseEquipmentSopVo
from models.vo.BaseEquipmentOperationRecordVo import BaseEquipmentOperationRecordVo

init_logging()
logger = logging.getLogger(__name__)

EQUIPMENT_TYPE_CODES = {InstanceAssetType.EQUIPMENT.value}


class FactoryAssetNodeService:
    """工厂资产节点业务服务（v2 - ref_id 在详情表，spatial 在设备详情表）"""


    async def get_node_by_id(self, node_id: int, db: AsyncSession) -> FactoryAssetNodeVo:
        """根据主键 ID 查询单个工厂资产节点（含 detail）"""
        entity = await self._get_node_or_raise(node_id, db)
        detail_map = await self._load_details_for_nodes([node_id], db)
        return self._to_vo(entity, detail_map.get(node_id))

    async def get_factory_tree(self, factory_projects_id: int, db: AsyncSession) -> List[FactoryAssetNodeTreeVo]:
        """根据工厂项目 ID 获取完整工厂结构树（仅节点层级关系 + 基础字段，不含 detail）"""
        try:
            all_result = await db.execute(
                select(FactoryAssetNode)
                .where(FactoryAssetNode.factory_projects_id == factory_projects_id)
                .order_by(FactoryAssetNode.created_at.asc())
            )
            all_nodes: List[FactoryAssetNode] = list(all_result.scalars().all())
            if not all_nodes:
                return []

            node_id_set = {n.id for n in all_nodes}

            vo_map: Dict[int, FactoryAssetNodeTreeVo] = {}
            for node in all_nodes:
                vo_map[node.id] = self._to_tree_vo(node)

            tree_roots: List[FactoryAssetNodeTreeVo] = []
            for node in all_nodes:
                vo = vo_map[node.id]
                if node.parent_id is None or node.parent_id not in node_id_set:
                    tree_roots.append(vo)
                else:
                    parent_vo = vo_map.get(node.parent_id)
                    if parent_vo is not None:
                        parent_vo.children.append(vo)

            logger.info(f"获取工厂结构树: project={factory_projects_id}, 节点={len(all_nodes)}")
            return tree_roots
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in get_factory_tree]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"获取工厂结构树失败: {e}")

    async def get_factory_tree_with_detail(self, factory_projects_id: int, db: AsyncSession) -> List[FactoryAssetNodeVo]:
        """根据工厂项目 ID 获取完整工厂结构树（含每个节点的 detail）。

        与 get_factory_tree 的区别：节点为富 VO（FactoryAssetNodeVo），批量加载 detail，
        LINE/EQUIPMENT 节点的 detail 携带 primPath，供前端工厂编辑器渲染结构树 + 双击节点高亮。
        """
        try:
            all_result = await db.execute(
                select(FactoryAssetNode)
                .where(FactoryAssetNode.factory_projects_id == factory_projects_id)
                .order_by(FactoryAssetNode.created_at.asc())
            )
            all_nodes: List[FactoryAssetNode] = list(all_result.scalars().all())
            if not all_nodes:
                return []

            node_id_set = {n.id for n in all_nodes}
            detail_map = await self._load_details_for_nodes([n.id for n in all_nodes], db)

            vo_map: Dict[int, FactoryAssetNodeVo] = {}
            for node in all_nodes:
                vo_map[node.id] = self._to_vo(node, detail_map.get(node.id))

            tree_roots: List[FactoryAssetNodeVo] = []
            for node in all_nodes:
                vo = vo_map[node.id]
                if node.parent_id is None or node.parent_id not in node_id_set:
                    tree_roots.append(vo)
                else:
                    parent_vo = vo_map.get(node.parent_id)
                    if parent_vo is not None:
                        parent_vo.children.append(vo)

            logger.info(f"获取工厂结构树(含detail): project={factory_projects_id}, 节点={len(all_nodes)}")
            return tree_roots
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in get_factory_tree_with_detail]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"获取工厂结构树失败: {e}")

    async def get_stage_list_by_project(self, factory_projects_id: str, db: AsyncSession) -> List[FactoryAssetNodeVo]:
        """根据工厂项目 ID 获取该项目下所有制程（STAGE）节点的平铺列表（不含树形嵌套、不含 detail）。"""
        try:
            result = await db.execute(
                select(FactoryAssetNode)
                .where(
                    FactoryAssetNode.factory_projects_id == factory_projects_id,
                    FactoryAssetNode.type == InstanceAssetType.STAGE.value,
                    FactoryAssetNode.is_deleted == False,
                )
                .order_by(FactoryAssetNode.created_at.asc())
            )
            nodes: List[FactoryAssetNode] = list(result.scalars().all())
            vos = [self._to_vo(node) for node in nodes]
            logger.info(f"获取制程列表: project={factory_projects_id}, 数量={len(nodes)}")
            return vos
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in get_stage_list_by_project]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"获取制程列表失败: {e}")


    async def bind_node(self, dto: FactoryAssetNodeBindDto, db: AsyncSession):
        """统一绑定接口：根据节点类型自动路由。LINE→line_id；EQUIPMENT→equipment_id。"""
        node = (await db.execute(
            select(FactoryAssetNode).where(
                FactoryAssetNode.id == dto.factory_asset_id,
                FactoryAssetNode.is_deleted == False,
            )
        )).scalar_one_or_none()
        if node is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"资产节点不存在: id={dto.factory_asset_id}")
        if node.type == InstanceAssetType.LINE.value:
            return await self._bind_line_node(node, dto.ref_id, db)
        elif node.type == InstanceAssetType.EQUIPMENT.value:
            return await self._bind_equipment_node(node, dto.ref_id, db)
        else:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg=f"不支持绑定 {node.type} 类型，仅 LINE/EQUIPMENT")

    async def unbind_node(self, dto: FactoryAssetNodeUnbindDto, db: AsyncSession) -> dict:
        """统一解绑接口：清除 detail.ref_id，节点 bind_status → UNBOUND，并级联更新父节点。"""
        node = (await db.execute(
            select(FactoryAssetNode).where(
                FactoryAssetNode.id == dto.factory_asset_id,
                FactoryAssetNode.is_deleted == False,
            )
        )).scalar_one_or_none()
        if node is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"资产节点不存在: id={dto.factory_asset_id}")
        if node.type == InstanceAssetType.LINE.value:
            detail = (await db.execute(
                select(FactoryLineDetails).where(
                    FactoryLineDetails.factory_asset_id == dto.factory_asset_id,
                    FactoryLineDetails.is_deleted == False,
                )
            )).scalar_one_or_none()
        elif node.type == InstanceAssetType.EQUIPMENT.value:
            detail = (await db.execute(
                select(FactoryEquipmentDetails).where(
                    FactoryEquipmentDetails.factory_asset_id == dto.factory_asset_id,
                    FactoryEquipmentDetails.is_deleted == False,
                )
            )).scalar_one_or_none()
        else:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg=f"不支持解绑 {node.type} 类型，仅 LINE/EQUIPMENT")
        try:
            node.bind_status = BindStatus.UNBOUND.value
            if detail is not None:
                detail.ref_id = None
            await db.flush()
            await self._cascade_parent_bind_status(node, db)
            await db.commit()
            logger.info(f"解绑节点: id={dto.factory_asset_id}, type={node.type}")
            return {"factory_asset_id": dto.factory_asset_id, "bind_status": BindStatus.UNBOUND.value}
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in unbind_node {dto.factory_asset_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"解绑节点失败: {e}")

    async def _bind_line_node(self, node: FactoryAssetNode, line_id: str, db: AsyncSession):
        """LINE 节点绑定：定位目标制程节点（按 base_production_line.stage_id），按需迁移父节点后绑定。"""
        line = (await db.execute(
            select(BaseProductionLine).where(BaseProductionLine.line_id == line_id)
        )).scalar_one_or_none()
        if line is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"线体不存在: line_id={line_id}")
        if node.parent_id is None:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg=f"线体节点 id={node.id} 未关联制程节点")
        current_stage = (await db.execute(
            select(FactoryAssetNode).where(
                FactoryAssetNode.id == node.parent_id,
                FactoryAssetNode.type == InstanceAssetType.STAGE.value,
                FactoryAssetNode.is_deleted == False,
            )
        )).scalar_one_or_none()
        if current_stage is None:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg=f"线体节点 id={node.id} 父节点不是有效制程节点")
        target_process_detail = (await db.execute(
            select(FactoryProcessDetails)
            .join(FactoryAssetNode, FactoryProcessDetails.factory_asset_id == FactoryAssetNode.id)
            .where(
                FactoryProcessDetails.ref_id == line.stage_id,
                FactoryProcessDetails.is_deleted == False,
                FactoryAssetNode.factory_projects_id == node.factory_projects_id,
                FactoryAssetNode.is_deleted == False,
            )
        )).scalar_one_or_none()
        if target_process_detail is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=(
                f"当前项目中未找到线体所属制程（stage_id={line.stage_id}）对应的制程节点，"
                f"请先在项目资产树中创建对应的制程（STAGE）节点后再进行绑定"))
        target_stage_id = target_process_detail.factory_asset_id
        target_stage = (await db.execute(
            select(FactoryAssetNode).where(
                FactoryAssetNode.id == target_stage_id,
                FactoryAssetNode.is_deleted == False,
            )
        )).scalar_one_or_none()
        if target_stage is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"目标制程节点不存在: id={target_stage_id}")
        try:
            if node.parent_id != target_stage_id:
                old_stage_id = node.parent_id
                node.parent_id = target_stage_id
                await db.flush()
                logger.info(f"LINE 节点制程归属变更: node_id={node.id}, old_stage={old_stage_id} → new_stage={target_stage_id}")
                old_stage = (await db.execute(
                    select(FactoryAssetNode).where(
                        FactoryAssetNode.id == old_stage_id,
                        FactoryAssetNode.is_deleted == False,
                    )
                )).scalar_one_or_none()
                if old_stage is not None:
                    old_stage.bind_status = await self._calc_parent_bind_status(old_stage_id, db)
                    await db.flush()
            detail = (await db.execute(
                select(FactoryLineDetails).where(
                    FactoryLineDetails.factory_asset_id == node.id,
                    FactoryLineDetails.is_deleted == False,
                )
            )).scalar_one_or_none()
            if detail is None:
                detail = FactoryLineDetails(factory_asset_id=node.id, ref_id=line_id)
                db.add(detail)
            else:
                detail.ref_id = line_id
            node.bind_status = BindStatus.BOUND.value
            await db.flush()
            await db.refresh(detail)
            await self._cascade_parent_bind_status(node, db)
            await db.commit()
            logger.info(f"LINE 节点绑定结果: id={node.id}, status={node.bind_status}")
            return {"factory_asset_id": str(node.id), "bind_status": node.bind_status, "message": "绑定成功"}
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in _bind_line_node {node.id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"绑定线体失败: {e}")

    async def _bind_equipment_node(self, node: FactoryAssetNode, equipment_id: str, db: AsyncSession):
        """EQUIPMENT 节点绑定：更新 detail.ref_id，bind_status=BOUND，级联更新父节点。"""
        equipment = (await db.execute(
            select(BaseEquipment).where(BaseEquipment.equipment_id == equipment_id)
        )).scalar_one_or_none()
        if equipment is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"设备不存在: equipment_id={equipment_id}")
        try:
            detail = (await db.execute(
                select(FactoryEquipmentDetails).where(
                    FactoryEquipmentDetails.factory_asset_id == node.id,
                    FactoryEquipmentDetails.is_deleted == False,
                )
            )).scalar_one_or_none()
            if detail is None:
                detail = FactoryEquipmentDetails(factory_asset_id=node.id, ref_id=equipment_id)
                db.add(detail)
            else:
                detail.ref_id = equipment_id
            node.bind_status = BindStatus.BOUND.value
            await db.flush()
            await db.refresh(detail)
            await self._cascade_parent_bind_status(node, db)
            await db.commit()
            logger.info(f"EQUIPMENT 节点绑定结果: id={node.id}, status={node.bind_status}")
            return {"factory_asset_id": str(node.id), "bind_status": node.bind_status, "message": "绑定成功"}
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in _bind_equipment_node {node.id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"绑定设备失败: {e}")

    async def _calc_parent_bind_status(self, parent_id: str, db: AsyncSession) -> str:
        """根据直接子节点的 bind_status 计算父节点应有状态。BIND_FAILED>全BOUND>部分BOUND>UNBOUND。"""
        rows = (await db.execute(
            select(FactoryAssetNode.bind_status).where(
                FactoryAssetNode.parent_id == parent_id,
                FactoryAssetNode.is_deleted == False,
            )
        )).all()
        if not rows:
            return BindStatus.UNBOUND.value
        statuses = [r[0] for r in rows]
        if BindStatus.BIND_FAILED.value in statuses:
            return BindStatus.BIND_FAILED.value
        if all(s == BindStatus.BOUND.value for s in statuses):
            return BindStatus.BOUND.value
        if any(s == BindStatus.BOUND.value for s in statuses):
            return BindStatus.PARTIALLY_BOUND.value
        return BindStatus.UNBOUND.value

    async def _cascade_parent_bind_status(self, node: FactoryAssetNode, db: AsyncSession) -> None:
        """从父节点起逐层向上更新 bind_status 直到根节点（parent_id=None）。"""
        current_parent_id = node.parent_id
        while current_parent_id is not None:
            parent = (await db.execute(
                select(FactoryAssetNode).where(
                    FactoryAssetNode.id == current_parent_id,
                    FactoryAssetNode.is_deleted == False,
                )
            )).scalar_one_or_none()
            if parent is None:
                break
            parent.bind_status = await self._calc_parent_bind_status(parent.id, db)
            await db.flush()
            current_parent_id = parent.parent_id

    @staticmethod
    def _parse_line_prim_path(prim_path: str) -> Tuple[Optional[str], Optional[str]]:
        """从 prim_path 解析线体名和 code。格式 /World/ProdLine/a_{line_name}_{line_code}，失败返回 (None, None)。"""
        if not prim_path:
            return None, None
        try:
            segment = prim_path.rstrip("/").split("/")[-1]
            if segment.startswith("a_"):
                segment = segment[2:]
            last_underscore = segment.rfind("_")
            if last_underscore <= 0:
                return None, None
            line_name = segment[:last_underscore]
            line_code = segment[last_underscore + 1:]
            if not line_name or not line_code:
                return None, None
            return line_name, line_code
        except Exception:
            return None, None

    async def add_line_node(self, dto: AddLineNodeDto, db: AsyncSession) -> FactoryAssetNodeVo:
        """在项目 default 制程下新增线体节点（拖拽资产库线体），并批量创建其挂载的设备子节点。"""
        # Step 1: 查找 default_stage 节点
        default_stage = (await db.execute(
            select(FactoryAssetNode).where(
                FactoryAssetNode.factory_projects_id == dto.factory_project_id,
                FactoryAssetNode.type == InstanceAssetType.STAGE.value,
                FactoryAssetNode.code == "default_stage",
                FactoryAssetNode.is_deleted == False,
            ).limit(1)
        )).scalar_one_or_none()
        if default_stage is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"未找到 default_stage 节点 (project_id={dto.factory_project_id})，请先创建项目")

        # Step 2: 获取资产库线体模型信息
        line_model = (await db.execute(
            select(LineModelDetail).where(
                LineModelDetail.id == dto.line_id,
                LineModelDetail.is_deleted == False,
            )
        )).scalar_one_or_none()
        if line_model is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"资产库线体模型不存在: line_model_id={dto.line_id}")

        # Step 3: 解析 prim_path
        parsed_name, parsed_code = self._parse_line_prim_path(dto.prim_path)
        if not parsed_name or not parsed_code:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg=(
                f"prim_path 解析失败，无法提取线体名和 code: prim_path={dto.prim_path}，"
                f"期望格式 /World/ProdLine/a_{{line_name}}_{{line_code}}"))
        node_name, node_code = parsed_name, parsed_code

        try:
            # Step 4: 创建 LINE 节点（version_id 继承 default_stage，满足 NOT NULL）
            line_node = FactoryAssetNode(
                factory_projects_id=dto.factory_project_id,
                version_id=default_stage.version_id,
                name=node_name,
                code=node_code,
                type=InstanceAssetType.LINE.value,
                parent_id=default_stage.id,
                bind_status=BindStatus.UNBOUND.value,
            )
            db.add(line_node)
            await db.flush()

            # Step 5: FactoryLineDetails，ref_id=None（待绑定 base_production_line）
            db.add(FactoryLineDetails(factory_asset_id=line_node.id, ref_id=None))
            await db.flush()

            # Step 6: FactoryAsset3dModel，从 line_model 拷贝 USD 信息
            db.add(FactoryAsset3dModel(
                factory_asset_id=line_node.id,
                usd_name=line_model.model or None,
                prim_path=dto.prim_path,
                root_usd_path=line_model.root_usd_path or "",
                location_path=line_model.location_path or "",
                bucket_name=line_model.bucket_name or "ov-usd-bucket",
                thumbnail_path=line_model.thumbnail_path,
            ))
            await db.flush()

            # Step 6.5: 查询线体挂载设备，批量创建 EQUIPMENT 子节点
            equipment_rels = (await db.execute(
                select(LineModelEquipmentRel).where(
                    LineModelEquipmentRel.line_model_id == dto.line_id,
                    LineModelEquipmentRel.is_deleted == False,
                )
            )).scalars().all()

            equipment_count = 0
            if equipment_rels:
                em_ids = [rel.equipment_model_id for rel in equipment_rels]
                em_map = {em.id: em for em in (await db.execute(
                    select(EquipmentModelDetail).where(
                        EquipmentModelDetail.id.in_(em_ids),
                        EquipmentModelDetail.is_deleted == False,
                    )
                )).scalars().all()}
                cat_ids = list({em.category_id for em in em_map.values()})
                cat_map = {}
                if cat_ids:
                    cat_map = {cat.id: cat for cat in (await db.execute(
                        select(AssetCategory).where(
                            AssetCategory.id.in_(cat_ids),
                            AssetCategory.is_deleted == False,
                        )
                    )).scalars().all()}

                for rel in equipment_rels:
                    em = em_map.get(rel.equipment_model_id)
                    if em is None:
                        logger.warning(f"[add_line_node] 设备模型不存在，跳过: equipment_model_id={rel.equipment_model_id}")
                        continue
                    cat = cat_map.get(em.category_id)
                    eq_name = cat.name if cat else (em.model or em.category or "UnknownEquipment")
                    eq_code = cat.code if cat else ""
                    # 设备 prim_path 拼接规则（与资产库 USD 层级一致）
                    eq_prim_path = (
                        f"{dto.prim_path}"
                        f"/t_id_{node_name}_instance_001"
                        f"/id_{node_name}_instance_001"
                        f"/{node_name}/{node_name}"
                        f"/ASSET_PROD/asset_{node_name}_PROD"
                        f"/t_{rel.instance_name or eq_name}"
                    )
                    eq_node = FactoryAssetNode(
                        factory_projects_id=dto.factory_project_id,
                        version_id=default_stage.version_id,
                        name=eq_name,
                        code=eq_code,
                        type=InstanceAssetType.EQUIPMENT.value,
                        parent_id=line_node.id,
                        bind_status=BindStatus.UNBOUND.value,
                    )
                    db.add(eq_node)
                    await db.flush()
                    db.add(FactoryEquipmentDetails(
                        factory_asset_id=eq_node.id,
                        ref_id=None,
                        position_data=rel.position_data,
                        rotation_data=rel.rotation_data,
                        extra_metadata={"device_status": rel.device_status, "device_area": rel.device_area},
                    ))
                    await db.flush()
                    db.add(FactoryAsset3dModel(
                        factory_asset_id=eq_node.id,
                        usd_name=em.model or eq_name,
                        prim_path=eq_prim_path,
                        root_usd_path=em.root_usd_path or "",
                        location_path=em.location_path or "",
                        bucket_name=em.bucket_name or "ov-usd-bucket",
                        thumbnail_path=em.thumbnail_path,
                    ))
                    await db.flush()
                    equipment_count += 1

            # Step 7: 级联更新父节点 bind_status
            await self._cascade_parent_bind_status(line_node, db)
            await db.commit()
            await db.refresh(line_node)
            logger.info(
                f"新增线体节点(资产库拖拽): node_id={line_node.id}, name={node_name}, "
                f"line_model_id={dto.line_id}, 挂载设备数={equipment_count}"
            )
            return self._to_vo(line_node)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in add_line_node]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"新增线体节点失败: {e}")

    async def create_node(self, dto: FactoryAssetNodeCreateDto, db: AsyncSession) -> FactoryAssetNodeVo:
        """新增树形结构节点"""
        if dto.parent_id is not None:
            await self._get_node_or_raise(dto.parent_id, db)

        try:
            entity = FactoryAssetNode(
                factory_projects_id=dto.factory_projects_id,
                version_id=dto.version_id,
                name=dto.name,
                code=dto.code,
                type=dto.type.value,
                parent_id=dto.parent_id,
                description=dto.description,
            )
            db.add(entity)
            await db.commit()
            await db.refresh(entity)

            return self._to_vo(entity)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create_node]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建节点失败: {e}")

    async def update_node(self, node_id: int, dto: FactoryAssetNodeUpdateDto, db: AsyncSession) -> FactoryAssetNodeVo:
        """仅更新节点基础信息"""
        entity = await self._get_node_or_raise(node_id, db)

        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("id", None)

        if not update_data:
            return self._to_vo(entity)

        allowed_fields = {
            "factory_projects_id", "version_id", "name", "code", "type",
            "parent_id", "description",
        }

        try:
            if "parent_id" in update_data and update_data["parent_id"] is not None:
                if update_data["parent_id"] == node_id:
                    raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="父级节点不能指向自身")
                await self._get_node_or_raise(update_data["parent_id"], db)

            for field, value in update_data.items():
                if field in allowed_fields:
                    setattr(entity, field, value)

            await db.commit()
            await db.refresh(entity)

            return self._to_vo(entity)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update_node {node_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新节点失败: {e}")

    async def delete_node(self, node_id: int, db: AsyncSession) -> int:
        """软删除节点及其所有子孙节点，并同步软删除各详情子表/3D模型（is_deleted=True）。
        软删除而非物理删除：与全仓 Creator 表 is_deleted 约定一致。
        （原实现走 FK ON DELETE CASCADE 物理删除，软删除下 CASCADE 不触发，故需显式软删除子表。）"""
        entity = await self._get_node_or_raise(node_id, db)

        try:
            if entity.type in EQUIPMENT_TYPE_CODES:
                ids_to_delete = {node_id}
            else:
                all_result = await db.execute(
                    select(FactoryAssetNode)
                    .where(
                        FactoryAssetNode.factory_projects_id == entity.factory_projects_id,
                        FactoryAssetNode.version_id == entity.version_id,
                        FactoryAssetNode.is_deleted == False,
                    )
                )
                all_nodes: List[FactoryAssetNode] = list(all_result.scalars().all())

                def collect_subtree_ids(nid: int) -> set:
                    ids = {nid}
                    for node in all_nodes:
                        if node.parent_id == nid:
                            ids |= collect_subtree_ids(node.id)
                    return ids

                ids_to_delete = collect_subtree_ids(node_id)

            # 1) 软删除节点本身及所有子孙节点
            await db.execute(
                sa_update(FactoryAssetNode)
                .where(FactoryAssetNode.id.in_(ids_to_delete))
                .values(is_deleted=True)
            )
            # 2) 软删除详情子表（原依赖 FK CASCADE，软删除需显式处理）
            if entity.type in EQUIPMENT_TYPE_CODES:
                await db.execute(
                    sa_update(FactoryEquipmentDetails)
                    .where(FactoryEquipmentDetails.factory_asset_id == node_id)
                    .values(is_deleted=True)
                )
            else:
                await db.execute(
                    sa_update(FactoryLineDetails)
                    .where(FactoryLineDetails.factory_asset_id == node_id)
                    .values(is_deleted=True)
                )
                child_ids = ids_to_delete - {node_id}
                if child_ids:
                    await db.execute(
                        sa_update(FactoryEquipmentDetails)
                        .where(FactoryEquipmentDetails.factory_asset_id.in_(child_ids))
                        .values(is_deleted=True)
                    )
            # 3) 受影响节点的 3D 模型记录统一软删除
            await db.execute(
                sa_update(FactoryAsset3dModel)
                .where(FactoryAsset3dModel.factory_asset_id.in_(ids_to_delete))
                .values(is_deleted=True)
            )

            await db.commit()
            logger.info(f"软删除节点及详情: node_id={node_id}, 共 {len(ids_to_delete)} 个节点")
            return node_id
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete_node]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除节点失败: {e}")

    async def get_node_detail_by_prim_path(
            self, prim_path: str, db: AsyncSession,
    ) -> Union[FactoryProjectVo, FactoryProcessDetailsVo, FactoryLineDetailsVo, FactoryEquipmentDetailsVo]:
        """
        根据 prim_path 查询资产节点详情。
        逻辑：先在 factory_asset_3d_model 表中按 prim_path 找到对应的 factory_asset_id
        （过滤软删除记录），再复用 get_node_detail 返回对应类型详情 VO。
        """
        try:
            model_result = await db.execute(
                select(FactoryAsset3dModel.factory_asset_id)
                .where(
                    FactoryAsset3dModel.prim_path == prim_path,
                    FactoryAsset3dModel.is_deleted == False,
                )
            )
            factory_asset_id = model_result.scalars().first()
            if factory_asset_id is None:
                raise BusinessException(
                    ErrorCode.NOT_FOUND_ERROR,
                    extra_msg=f"未找到 prim_path 对应的资产节点: prim_path={prim_path}",
                )
            return await self.get_node_detail(factory_asset_id, db)
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in get_node_detail_by_prim_path]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"根据 prim_path 查询详情失败: {e}")

    async def get_node_detail(
            self, node_id: int, db: AsyncSession,
    ) -> Union[FactoryProjectVo, FactoryProcessDetailsVo, FactoryLineDetailsVo, FactoryEquipmentDetailsVo]:
        """
        根据节点ID自动识别节点类型，返回对应详情 VO：
        - 若 factory_asset_node 不存在则尝试查 factory_projects（工厂项目级别）
        - STAGE     → FactoryProcessDetailsVo（含 base_stage 聚合）
        - LINE      → FactoryLineDetailsVo（含 base_production_line + 3D模型）
        - EQUIPMENT → FactoryEquipmentDetailsVo（含 BaseEquipmentFullDetailVo + 3D模型）
        """
        try:
            node_result = await db.execute(
                select(FactoryAssetNode).where(FactoryAssetNode.id == node_id)
            )
            node = node_result.scalar_one_or_none()

            if node is None:
                return await self._get_factory_project_detail(node_id, db)
            if node.type == InstanceAssetType.STAGE.value:
                return await self._get_process_detail(node_id, db)
            elif node.type == InstanceAssetType.LINE.value:
                return await self._get_line_detail(node_id, db)
            elif node.type == InstanceAssetType.EQUIPMENT.value:
                return await self._get_equipment_detail(node_id, db)
            else:
                raise BusinessException(
                    ErrorCode.PARAMS_ERROR,
                    extra_msg=f"未知节点类型: {node.type}，无法查询详情",
                )
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in get_node_detail]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询节点详情失败: {e}")

    async def _load_details_for_nodes(
            self, node_ids: List[int], db: AsyncSession,
    ) -> Dict[int, Union[ProcessDetailsSpecialVo, LineDetailsSpecialVo, EquipmentDetailsSpecialVo]]:
        """
        批量查询详情子表 + 3D模型表，返回 node_id -> Special VO 的映射。
        v2: ref_id 在详情表中，spatial 已合并到设备详情表。
        TODO: [基础] 字段后续通过详情表 ref_id JOIN base_* 表获取
        """
        detail_map: Dict[int, Union[
            ProcessDetailsSpecialVo, LineDetailsSpecialVo, EquipmentDetailsSpecialVo
        ]] = {}
        if not node_ids:
            return detail_map

        # 批量预加载 3D 模型信息
        model_3d_result = await db.execute(
            select(FactoryAsset3dModel).where(FactoryAsset3dModel.factory_asset_id.in_(node_ids))
        )
        model_3d_map: Dict[int, FactoryAsset3dModel] = {
            r.factory_asset_id: r for r in model_3d_result.scalars().all()
        }

        # 制程详情（ref_id 已在此表中）
        process_result = await db.execute(
            select(FactoryProcessDetails).where(FactoryProcessDetails.factory_asset_id.in_(node_ids))
        )
        for r in process_result.scalars().all():
            detail_map[r.factory_asset_id] = ProcessDetailsSpecialVo(
                id=str(r.id),
                ref_id=str(r.ref_id) if r.ref_id else None,
                total_capacity=r.total_capacity,
            )

        # 线体详情（ref_id 已在此表中）
        line_result = await db.execute(
            select(FactoryLineDetails).where(FactoryLineDetails.factory_asset_id.in_(node_ids))
        )
        for r in line_result.scalars().all():
            model_3d = model_3d_map.get(r.factory_asset_id)
            detail_map[r.factory_asset_id] = LineDetailsSpecialVo(
                id=str(r.id),
                ref_id=str(r.ref_id) if r.ref_id else None,
                capacity_per_day=r.capacity_per_day,
                root_usd_path=model_3d.root_usd_path if model_3d else None,
                prim_path=model_3d.prim_path if model_3d else None,
            )
        # 设备详情（ref_id + spatial 已合并）
        equip_result = await db.execute(
            select(FactoryEquipmentDetails).where(FactoryEquipmentDetails.factory_asset_id.in_(node_ids))
        )
        for r in equip_result.scalars().all():
            model_3d = model_3d_map.get(r.factory_asset_id)
            detail_map[r.factory_asset_id] = EquipmentDetailsSpecialVo(
                id=str(r.id),
                ref_id=str(r.ref_id) if r.ref_id else None,
                root_usd_path=model_3d.root_usd_path if model_3d else None,
                prim_path=model_3d.prim_path if model_3d else None,
                location_path=model_3d.location_path if model_3d else None,
                position_data=r.position_data,
                rotation_data=r.rotation_data,
            )
        return detail_map


    def _to_vo(
            self, node: FactoryAssetNode,
            detail: Optional[Union[
                ProcessDetailsSpecialVo, LineDetailsSpecialVo, EquipmentDetailsSpecialVo,
            ]] = None,
    ) -> FactoryAssetNodeVo:
        """将实体转为 VO"""
        return FactoryAssetNodeVo(
            id=str(node.id),
            factory_projects_id=str(node.factory_projects_id),
            version_id=str(node.version_id),
            name=node.name,
            code=node.code,
            type=node.type,
            parent_id=str(node.parent_id) if node.parent_id is not None else None,
            description=node.description,
            bind_status=node.bind_status,
            created_at=node.created_at,
            updated_at=node.updated_at,
            detail=detail,
            children=[],
        )

    def _to_tree_vo(self, node: FactoryAssetNode) -> FactoryAssetNodeTreeVo:
        """将实体转为树形结构 VO（仅基础字段，不含 detail）"""
        return FactoryAssetNodeTreeVo(
            id=str(node.id),
            factory_projects_id=str(node.factory_projects_id),
            version_id=str(node.version_id),
            name=node.name,
            code=node.code,
            type=node.type,
            parent_id=str(node.parent_id) if node.parent_id is not None else None,
            description=node.description,
            created_at=node.created_at,
            updated_at=node.updated_at,
            children=[],
        )

    async def _get_node_or_raise(self, node_id: int, db: AsyncSession) -> FactoryAssetNode:
        result = await db.execute(
            select(FactoryAssetNode).where(
                FactoryAssetNode.id == node_id,
                FactoryAssetNode.is_deleted == False,
            )
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"节点不存在: id={node_id}")
        return entity

    async def _get_factory_project_detail(self, project_id: int, db: AsyncSession) -> FactoryProjectVo:
        """node_id 不在 factory_asset_node 时，尝试按工厂项目ID查询"""
        result = await db.execute(
            select(FactoryProject).where(FactoryProject.project_id == project_id)
        )
        project = result.scalar_one_or_none()
        if project is None:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg=f"节点或工厂项目均不存在: id={project_id}",
            )
        return FactoryProjectVo.model_validate(project)

    async def _get_process_detail(self, node_id: int, db: AsyncSession) -> FactoryProcessDetailsVo:
        """STAGE 节点 → 查询制程详情 + base_stage"""
        result = await db.execute(
            select(FactoryProcessDetails).where(FactoryProcessDetails.factory_asset_id == node_id)
        )
        detail = result.scalar_one_or_none()
        if detail is None:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg=f"制程详情不存在: factory_asset_id={node_id}",
            )

        base_stage_vo = None
        if detail.ref_id:
            stage_result = await db.execute(
                select(BaseStage).where(BaseStage.stage_id == detail.ref_id)
            )
            stage_entity = stage_result.scalar_one_or_none()
            if stage_entity:
                base_stage_vo = BaseStageVo.model_validate(stage_entity)

        return FactoryProcessDetailsVo(
            id=str(detail.id),
            factory_asset_id=str(detail.factory_asset_id),
            total_capacity=detail.total_capacity,
            metadata=detail.extra_metadata,
            description=detail.description,
            created_at=detail.created_at,
            updated_at=detail.updated_at,
            base_process=base_stage_vo,
        )

    async def _get_line_detail(self, node_id: int, db: AsyncSession) -> FactoryLineDetailsVo:
        """LINE 节点 → 查询线体详情 + 3D模型 + base_production_line"""
        result = await db.execute(
            select(FactoryLineDetails).where(FactoryLineDetails.factory_asset_id == node_id)
        )
        detail = result.scalar_one_or_none()
        if detail is None:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg=f"线体详情不存在: factory_asset_id={node_id}",
            )

        model_result = await db.execute(
            select(FactoryAsset3dModel).where(FactoryAsset3dModel.factory_asset_id == node_id)
        )
        model_3d = model_result.scalar_one_or_none()

        base_line_vo = None
        if detail.ref_id:
            line_result = await db.execute(
                select(BaseProductionLine).where(BaseProductionLine.line_id == detail.ref_id)
            )
            line_entity = line_result.scalar_one_or_none()
            if line_entity:
                base_line_vo = BaseProductionLineVo.model_validate(line_entity)

        return FactoryLineDetailsVo(
            id=str(detail.id),
            factory_asset_id=str(detail.factory_asset_id),
            capacity_per_day=detail.capacity_per_day,
            metadata=detail.extra_metadata,
            usd_name=model_3d.usd_name if model_3d else None,
            usd_id=model_3d.usd_id if model_3d else None,
            root_usd_path=model_3d.root_usd_path if model_3d else None,
            prim_path=model_3d.prim_path if model_3d else None,
            bucket_name=model_3d.bucket_name if model_3d else None,
            location_path=model_3d.location_path if model_3d else None,
            thumbnail_path=model_3d.thumbnail_path if model_3d else None,
            created_at=detail.created_at,
            updated_at=detail.updated_at,
            base_line=base_line_vo,
        )

    async def _get_equipment_detail(self, node_id: int, db: AsyncSession) -> FactoryEquipmentDetailsVo:
        """EQUIPMENT 节点 → 查询设备详情 + 3D模型 + BaseEquipmentFullDetailVo（含5张扩展子表）"""
        result = await db.execute(
            select(FactoryEquipmentDetails).where(FactoryEquipmentDetails.factory_asset_id == node_id)
        )
        detail = result.scalar_one_or_none()
        if detail is None:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg=f"设备详情不存在: factory_asset_id={node_id}",
            )

        model_result = await db.execute(
            select(FactoryAsset3dModel).where(FactoryAsset3dModel.factory_asset_id == node_id)
        )
        model_3d = model_result.scalar_one_or_none()

        base_equipment_vo = None
        if detail.ref_id:
            equip_result = await db.execute(
                select(BaseEquipment).where(BaseEquipment.equipment_id == detail.ref_id)
            )
            equip_entity = equip_result.scalar_one_or_none()
            if equip_entity:
                eid = equip_entity.equipment_id

                tech_spec_r = await db.execute(
                    select(BaseEquipmentTechnicalSpec).where(BaseEquipmentTechnicalSpec.equipment_id == eid)
                )
                tech_spec = tech_spec_r.scalar_one_or_none()

                proc_param_r = await db.execute(
                    select(BaseEquipmentProcessParam).where(BaseEquipmentProcessParam.equipment_id == eid)
                )
                proc_param = proc_param_r.scalar_one_or_none()

                bom_r = await db.execute(
                    select(BaseEquipmentBomPart).where(BaseEquipmentBomPart.equipment_id == eid)
                )
                bom_parts = list(bom_r.scalars().all())

                sop_r = await db.execute(
                    select(BaseEquipmentSop).where(BaseEquipmentSop.equipment_id == eid)
                )
                sop_list = list(sop_r.scalars().all())

                op_r = await db.execute(
                    select(BaseEquipmentOperationRecord).where(BaseEquipmentOperationRecord.equipment_id == eid)
                )
                operation_records = list(op_r.scalars().all())

                base_equipment_vo = BaseEquipmentFullDetailVo(
                    equipment_id=str(equip_entity.equipment_id),
                    operation_id=equip_entity.operation_id,
                    line_id=equip_entity.line_id,
                    equipment_code=equip_entity.equipment_code,
                    equipment_name=equip_entity.equipment_name,
                    equipment_type=equip_entity.equipment_type,
                    equipment_group_id=equip_entity.equipment_group_id,
                    brand=equip_entity.brand,
                    manufacturer=equip_entity.manufacturer,
                    model_no=equip_entity.model_no,
                    manufacture_date=equip_entity.manufacture_date,
                    manufacture_code=equip_entity.manufacture_code,
                    made_in=equip_entity.made_in,
                    supplier=equip_entity.supplier,
                    supplier_phone=equip_entity.supplier_phone,
                    purchase_date=equip_entity.purchase_date,
                    service_life=equip_entity.service_life,
                    standard_ct=float(proc_param.standard_ct) if proc_param and proc_param.standard_ct is not None else None,
                    unit=equip_entity.unit,
                    location=equip_entity.location,
                    equipment_photo=equip_entity.equipment_photo,
                    responsible_person=equip_entity.responsible_person,
                    asset_code=equip_entity.asset_code,
                    status=equip_entity.status,
                    sort_order=equip_entity.sort_order,
                    created_at=equip_entity.created_at,
                    updated_at=equip_entity.updated_at,
                    technical_spec=BaseEquipmentTechnicalSpecVo.model_validate(tech_spec) if tech_spec else None,
                    process_param=BaseEquipmentProcessParamVo.model_validate(proc_param) if proc_param else None,
                    bom_parts=[BaseEquipmentBomPartVo.model_validate(b) for b in bom_parts],
                    sop_list=[BaseEquipmentSopVo.model_validate(s) for s in sop_list],
                    operation_records=[BaseEquipmentOperationRecordVo.model_validate(r) for r in operation_records],
                )

        return FactoryEquipmentDetailsVo(
            id=str(detail.id),
            factory_asset_id=str(detail.factory_asset_id),
            specifications=detail.specifications,
            installation_date=detail.installation_date,
            extra_metadata=detail.extra_metadata,
            instance_description=detail.description,
            position_data=detail.position_data,
            rotation_data=detail.rotation_data,
            usd_name=model_3d.usd_name if model_3d else None,
            usd_id=model_3d.usd_id if model_3d else None,
            root_usd_path=model_3d.root_usd_path if model_3d else None,
            bucket_name=model_3d.bucket_name if model_3d else None,
            prim_path=model_3d.prim_path if model_3d else None,
            location_path=model_3d.location_path if model_3d else None,
            thumbnail_path=model_3d.thumbnail_path if model_3d else None,
            created_at=detail.created_at,
            updated_at=detail.updated_at,
            base_equipment=base_equipment_vo,
        )
