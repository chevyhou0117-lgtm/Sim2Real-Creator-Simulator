import math
import logging
from typing import List, Optional
from models.vo.AssetCategoryVo import AssetCategoryTypeVo
from sqlalchemy import select, func
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from commonutils.SnowflakeUtils import generate_snowflake_id
from models.dto.AssetCategoryDto import (
    AssetCategoryCreateDto,
    AssetCategoryUpdateDto,
    AssetCategoryQueryDto,
    AssetCategoryFilterDto,
    AssetCopyModelDto,
)
from models.constant.ThumbnailConstant import DEFAULT_LINE_THUMBNAIL, DEFAULT_EQUIPMENT_THUMBNAIL
from config.MinioConfig import minioConfig
from models.entity.AssetCategoryEntity import AssetCategory
from models.entity.EquipmentModelDetailEntity import EquipmentModelDetail
from models.entity.LineModelDetailEntity import LineModelDetail
from models.entity.LineModelEquipmentRelEntity import LineModelEquipmentRel
from models.enums.CategoryEnum import AssetCategoryType, AssetUploadType
from models.enums.AssetModelStatusEnum import AssetModelStatus
from service.MinioService import MinioManagerService
from models.vo.AssetCategoryVo import AssetCategoryVo, AssetCategoryTreeVo, AssetCategoryFilterVo, \
    LineModelSpecialVo, EquipmentModelSpecialVo
from models.vo.EquipmentModelDetailVo import EquipmentModelDetailVo
from models.vo.LineModelDetailVo import LineModelDetailVo

init_logging()
logger = logging.getLogger(__name__)


class AssetCategoryService:
    """
    资产分类业务服务
    负责 asset_categories 表的 CRUD 操作
    """

    async def list_processes(
            self,
            db: AsyncSession,
    ) -> List[AssetCategoryVo]:
        """查询全部制程节点（type=process），以列表返回，thumbnail_path 拼接为完整 URL"""
        try:
            result = await db.execute(
                select(AssetCategory)
                .where(AssetCategory.type == AssetCategoryType.PROCESS)
                .order_by(AssetCategory.created_at.asc())
            )
            processes = list(result.scalars().all())
            minio = MinioManagerService()
            vos: List[AssetCategoryVo] = []
            for p in processes:
                vo = AssetCategoryVo.model_validate(p)
                if p.thumbnail_path:
                    vo = vo.model_copy(update={
                        "thumbnail_path": minio.build_full_url(
                            object_name=p.thumbnail_path,
                            bucket_name=minioConfig.bucket_name,
                        )
                    })
                vos.append(vo)
            logger.info(f"查询全部制程: total={len(vos)}")
            return vos
        except Exception as e:
            logger.error(f"[Error in list_processes]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询制程列表失败: {e}")

    async def list_category_details_by_process(
            self,
            process_id: int,
            db: AsyncSession,
    ) -> List[AssetCategoryVo]:
        """
        根据制程 ID 查询该制程下所有 line_type / equipment_type 分类节点的完整信息，
        thumbnail_path 拼接为完整 URL。
        """
        await self._get_category_or_raise(process_id, db)
        try:
            from sqlalchemy import and_, or_
            result = await db.execute(
                select(AssetCategory)
                .where(
                    and_(
                        AssetCategory.parent_id == process_id,
                        or_(
                            AssetCategory.type == AssetCategoryType.LINE_TYPE,
                            AssetCategory.type == AssetCategoryType.EQUIPMENT_TYPE,
                        )
                    )
                )
                .order_by(AssetCategory.created_at.asc())
            )
            categories = list(result.scalars().all())
            minio = MinioManagerService()
            vos: List[AssetCategoryVo] = []
            for c in categories:
                vo = AssetCategoryVo.model_validate(c)
                if c.thumbnail_path:
                    vo = vo.model_copy(update={
                        "thumbnail_path": minio.build_full_url(
                            object_name=c.thumbnail_path,
                            bucket_name=minioConfig.bucket_name,
                        )
                    })
                vos.append(vo)
            logger.info(f"查询制程 {process_id} 下资产分类详情列表: total={len(vos)}")
            return vos
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in list_category_details_by_process]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询资产分类详情列表失败: {e}")

    async def list_categories_by_process(
            self,
            process_id: int,
            db: AsyncSession,
    ) -> List["AssetCategoryTypeVo"]:
        """
        根据制程 ID 查询该制程下所有去重后的资产分类类型（line_type / equipment_type），
        以 AssetCategoryTypeVo 列表返回。
        """
        await self._get_category_or_raise(process_id, db)
        try:
            from sqlalchemy import and_, or_, distinct
            result = await db.execute(
                select(distinct(AssetCategory.type))
                .where(
                    and_(
                        AssetCategory.parent_id == process_id,
                        or_(
                            AssetCategory.type == AssetCategoryType.LINE_TYPE,
                            AssetCategory.type == AssetCategoryType.EQUIPMENT_TYPE,
                        )
                    )
                )
                .order_by(AssetCategory.type.asc())
            )
            types = result.scalars().all()
            vos = [AssetCategoryTypeVo(type=t) for t in types]
            logger.info(f"查询制程 {process_id} 下资产分类类型: {types}")
            return vos
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in list_categories_by_process]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询资产分类类型失败: {e}")

    async def create_category(
            self,
            dto: AssetCategoryCreateDto,
            db: AsyncSession,
    ) -> AssetCategoryVo:
        """
        创建资产分类。
        - 仅允许创建 process / line_type / equipment_type 节点，禁止通过此接口创建模型节点
        - code 全局唯一，重复则报错
        - parent_id 不为空时校验父节点是否存在
        """
        _allowed_create_types = {
            AssetCategoryType.PROCESS,
            AssetCategoryType.LINE_TYPE,
            AssetCategoryType.EQUIPMENT_TYPE,
        }
        if dto.type not in _allowed_create_types:
            raise BusinessException(
                ErrorCode.PARAMS_ERROR,
                extra_msg=f"不允许通过此接口创建 '{dto.type}' 类型节点，"
                          f"仅支持：process / line_type / equipment_type"
            )

        await self._check_code_unique(dto.code, exclude_id=None, db=db)

        if dto.parent_id is not None:
            await self._get_category_or_raise(dto.parent_id, db)

        try:
            entity = AssetCategory(
                name=dto.name,
                code=dto.code,
                type=dto.type,
                parent_id=dto.parent_id,
                description=dto.description,
                thumbnail_path=dto.thumbnail_path,
            )
            db.add(entity)
            await db.flush()  # 使节点在本事务内可见，获取 entity.id
            await self._refresh_ancestor_counts(entity.id, db)
            await db.commit()
            await db.refresh(entity)
            logger.info(f"创建资产分类成功: id={entity.id}, name={entity.name}, code={entity.code}")
            return AssetCategoryVo.model_validate(entity)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create_category]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建资产分类失败: {e}")

    async def get_category_by_id(
            self,
            category_id: int,
            db: AsyncSession,
    ) -> AssetCategoryVo:
        """根据主键 ID 查询单个资产分类"""
        entity = await self._get_category_or_raise(category_id, db)
        return AssetCategoryVo.model_validate(entity)

    async def get_category_tree_by_id(
            self,
            category_id: int,
            db: AsyncSession,
    ) -> Optional[AssetCategoryTreeVo]:
        """
        根据主键 ID 获取该节点及其所有后代节点组成的子树（含 detail）。
        一次加载全部节点，BFS 构建，避免 N+1。
        """
        # 1. 加载全部节点
        all_result = await db.execute(
            select(AssetCategory).order_by(AssetCategory.created_at.asc())
        )
        all_nodes: List[AssetCategory] = list(all_result.scalars().all())
        entity_map = {n.id: n for n in all_nodes}

        if category_id not in entity_map:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR,
                                    extra_msg=f"资产分类不存在: id={category_id}")

        # 2. 收集该节点及其所有后代 id
        def collect_subtree_ids(nid: int) -> set:
            ids = {nid}
            for node in all_nodes:
                if node.parent_id == nid:
                    ids |= collect_subtree_ids(node.id)
            return ids

        included_ids = collect_subtree_ids(category_id)

        # 3. 批量加载 detail
        model_ids = [nid for nid in included_ids
                     if entity_map[nid].type in (AssetCategoryType.LINE_MODEL,
                                                 AssetCategoryType.EQUIPMENT_MODEL)]
        detail_map = await self._load_detail_map(db, model_ids)

        minio = MinioManagerService()

        # 4. 构建 VO map 并填充 detail，thumbnail_path 拼接为完整 URL
        vo_map: dict = {}
        for nid in included_ids:
            node = entity_map[nid]
            vo = self._to_tree_vo(node, minio)
            vo.detail = detail_map.get(nid)
            vo_map[nid] = vo

        # 5. 建立树形层级
        root_vo: Optional[AssetCategoryTreeVo] = None
        for nid in included_ids:
            node = entity_map[nid]
            vo = vo_map[nid]
            if node.parent_id in included_ids:
                vo_map[node.parent_id].children.append(vo)
            elif nid == category_id:
                root_vo = vo

        return root_vo

    async def list_categories(
            self,
            query: AssetCategoryQueryDto,
            db: AsyncSession,
    ) -> List[AssetCategoryTreeVo]:
        """
        统一以树形结构返回资产分类，支持三种模式（三者互斥）：

        1. 全量查询（无任何条件）：BFS 构建完整树，返回所有顶级节点
        2. keyword 模糊搜索：在 line_model/equipment_model 中按名称模糊匹配，
           只返回匹配叶子节点及其祖先路径（不含未匹配兄弟节点），组成精简树
        3. process_name + type 过滤：按制程名模糊匹配制程节点，再找该制程下
           指定 type 的子节点，返回该子树（含制程节点本身）
        """
        try:
            # 始终全量加载，保证层级关系完整
            all_result = await db.execute(
                select(AssetCategory).order_by(AssetCategory.created_at.asc())
            )
            all_nodes: List[AssetCategory] = list(all_result.scalars().all())
            entity_map = {n.id: n for n in all_nodes}

            minio = MinioManagerService()
            # 构建 父->子ID 映射，加速子树收集
            children_map: dict = {}
            for node in all_nodes:
                if node.parent_id:
                    children_map.setdefault(node.parent_id, []).append(node.id)
            def collect_subtree_ids(nid: int) -> set:
                ids = {nid}
                for cid in children_map.get(nid, []):
                    ids |= collect_subtree_ids(cid)
                return ids
            # 模式 1：全量查询
            has_keyword = bool(query.keyword and query.keyword.strip())
            has_process_filter = bool(query.process_name and query.process_name.strip())

            if not has_keyword and not has_process_filter:
                model_ids = [
                    n.id for n in all_nodes
                    if n.type in (AssetCategoryType.LINE_MODEL, AssetCategoryType.EQUIPMENT_MODEL)
                ]
                detail_map = await self._load_detail_map(db, model_ids)

                node_map: dict = {}
                for n in all_nodes:
                    vo = self._to_tree_vo(n, minio)
                    vo.detail = detail_map.get(n.id)
                    node_map[n.id] = vo

                roots: List[AssetCategoryTreeVo] = []
                for node in all_nodes:
                    vo = node_map[node.id]
                    if node.parent_id and node.parent_id in node_map:
                        node_map[node.parent_id].children.append(vo)
                    else:
                        roots.append(vo)

                logger.info(f"全量查询资产分类树：节点总数={len(all_nodes)}, 顶级节点={len(roots)}")
                return roots

            # 模式 2：keyword 模糊搜索叶子节点
            if has_keyword:
                kw = query.keyword.lower()
                matched_leaf_ids: set = {
                    n.id for n in all_nodes
                    if n.type in (AssetCategoryType.LINE_MODEL, AssetCategoryType.EQUIPMENT_MODEL)
                    and kw in n.name.lower()
                }

                if not matched_leaf_ids:
                    logger.info(f"keyword 搜索无匹配结果: keyword='{query.keyword}'")
                    return []

                # 从每个匹配叶子向上收集祖先路径（只包含路径节点，不含旁支）
                included_ids: set = set()
                for leaf_id in matched_leaf_ids:
                    cur = leaf_id
                    while cur is not None and cur in entity_map:
                        included_ids.add(cur)
                        cur = entity_map[cur].parent_id

                detail_map = await self._load_detail_map(db, list(matched_leaf_ids))

                vo_map: dict = {}
                for nid in included_ids:
                    vo = self._to_tree_vo(entity_map[nid], minio)
                    vo.detail = detail_map.get(nid)
                    vo_map[nid] = vo

                tree_roots: List[AssetCategoryTreeVo] = []
                for nid in included_ids:
                    node = entity_map[nid]
                    vo = vo_map[nid]
                    if node.parent_id in included_ids:
                        vo_map[node.parent_id].children.append(vo)
                    else:
                        tree_roots.append(vo)

                logger.info(
                    f"keyword 搜索资产分类树：keyword='{query.keyword}', "
                    f"匹配叶子={len(matched_leaf_ids)}, 制程根={len(tree_roots)}"
                )
                return tree_roots
            # 模式 3：process_name + type 过滤
            process_kw = query.process_name.lower()
            process_nodes = [
                n for n in all_nodes
                if n.type == AssetCategoryType.PROCESS and process_kw in n.name.lower()
            ]
            if not process_nodes:
                logger.info(f"process_name 搜索无匹配制程: process_name='{query.process_name}'")
                return []

            included_ids: set = set()

            if query.type:
                # 找到匹配制程下对应 type 的子节点，返回该子树（含制程节点本身）
                for proc in process_nodes:
                    matched_type_nodes = [
                        cid for cid in children_map.get(proc.id, [])
                        if cid in entity_map and entity_map[cid].type == query.type
                    ]
                    if matched_type_nodes:
                        included_ids.add(proc.id)
                        for tid in matched_type_nodes:
                            included_ids |= collect_subtree_ids(tid)
            else:
                # 只有 process_name，返回制程完整子树
                for proc in process_nodes:
                    included_ids |= collect_subtree_ids(proc.id)

            if not included_ids:
                logger.info(
                    f"process_name+type 搜索无匹配: "
                    f"process_name='{query.process_name}', type='{query.type}'"
                )
                return []

            model_ids = [
                nid for nid in included_ids
                if entity_map[nid].type in (
                    AssetCategoryType.LINE_MODEL, AssetCategoryType.EQUIPMENT_MODEL
                )
            ]
            detail_map = await self._load_detail_map(db, model_ids)

            vo_map: dict = {}
            for nid in included_ids:
                vo = self._to_tree_vo(entity_map[nid], minio)
                vo.detail = detail_map.get(nid)
                vo_map[nid] = vo

            tree_roots: List[AssetCategoryTreeVo] = []
            for nid in included_ids:
                node = entity_map[nid]
                vo = vo_map[nid]
                if node.parent_id in included_ids:
                    vo_map[node.parent_id].children.append(vo)
                else:
                    tree_roots.append(vo)

            logger.info(
                f"process_name+type 搜索资产分类树："
                f"process_name='{query.process_name}', type='{query.type}', 制程根={len(tree_roots)}"
            )
            return tree_roots

        except Exception as e:
            logger.error(f"[Error in list_categories]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询资产分类列表失败: {e}")

    async def filter_categories(
            self,
            query: AssetCategoryFilterDto,
            db: AsyncSession,
    ) -> List[AssetCategoryTreeVo]:
        """
        按条件过滤资产模型节点，以树形返回。三种模式按优先级匹配：

        1. **全量查询**：process_name 和 status 均不传 → 返回完整资产分类树
        2. **status 全局过滤**：不传 process_name 但传了 status → 按状态全局过滤全部叶子
        3. **制程范围过滤**：传了 process_name → 按制程名+类型+状态过滤

        仅返回匹配叶子及其祖先路径，组成精简树。
        """
        try:
            # 1. 加载全量未删除节点
            all_result = await db.execute(
                select(AssetCategory).where(AssetCategory.is_deleted == False).order_by(AssetCategory.created_at.asc())
            )
            all_nodes: List[AssetCategory] = list(all_result.scalars().all())
            entity_map = {n.id: n for n in all_nodes}

            # 2. 构建 children_map
            children_map: dict = {}
            for node in all_nodes:
                if node.parent_id:
                    children_map.setdefault(node.parent_id, []).append(node.id)

            def collect_subtree_ids(nid: str) -> set:
                ids = {nid}
                for cid in children_map.get(nid, []):
                    ids |= collect_subtree_ids(cid)
                return ids

            has_process = bool(query.process_name and query.process_name.strip())
            has_type = bool(query.type and query.type.strip())
            has_status = bool(query.status and query.status.strip())

            minio = MinioManagerService()

            # ── 分支 1：什么参数都不传 → 全查完整树 ──
            if not has_process and not has_status:
                model_ids = [
                    n.id for n in all_nodes
                    if n.type in (AssetCategoryType.LINE_MODEL, AssetCategoryType.EQUIPMENT_MODEL)
                ]
                detail_map = await self._load_detail_map(db, model_ids)

                node_map: dict = {}
                for n in all_nodes:
                    vo = self._to_tree_vo(n, minio)
                    vo.detail = detail_map.get(n.id)
                    node_map[n.id] = vo

                roots: List[AssetCategoryTreeVo] = []
                for node in all_nodes:
                    vo = node_map[node.id]
                    if node.parent_id and node.parent_id in node_map:
                        node_map[node.parent_id].children.append(vo)
                    else:
                        roots.append(vo)

                logger.info(f"filter_categories: 全量查询, roots={len(roots)}")
                return roots

            # ── 分支 2：无制程名，有 status → 只按状态全局过滤（忽略 type）──
            if not has_process and has_status:
                all_model_ids = [
                    n.id for n in all_nodes
                    if n.type in (AssetCategoryType.LINE_MODEL, AssetCategoryType.EQUIPMENT_MODEL)
                ]
                if not all_model_ids:
                    return []

                detail_map = await self._load_detail_map(db, all_model_ids)

                status_upper = query.status.strip().upper()
                valid_model_ids = {
                    nid for nid in all_model_ids
                    if detail_map.get(nid) and (detail_map[nid].status or "").upper() == status_upper
                }
                if not valid_model_ids:
                    logger.info(f"filter_categories: status 全局过滤无结果, status='{query.status}'")
                    return []

                # 收集匹配叶子的祖先路径
                included_ids: set = set()
                for leaf_id in valid_model_ids:
                    cur = leaf_id
                    while cur is not None and cur in entity_map:
                        included_ids.add(cur)
                        cur = entity_map[cur].parent_id

                vo_map: dict = {}
                for nid in included_ids:
                    vo = self._to_tree_vo(entity_map[nid], minio)
                    vo.detail = detail_map.get(nid)
                    vo_map[nid] = vo

                tree_roots: List[AssetCategoryTreeVo] = []
                for nid in included_ids:
                    node = entity_map[nid]
                    vo = vo_map[nid]
                    if node.parent_id in included_ids:
                        vo_map[node.parent_id].children.append(vo)
                    else:
                        tree_roots.append(vo)

                logger.info(
                    f"filter_categories: status 全局过滤 status='{query.status}', roots={len(tree_roots)}"
                )
                return tree_roots

            # ── 分支 3：有制程名 → 按 process_name + type + status 过滤 ──
            # 3.1 process_name 模糊匹配制程节点
            process_kw = query.process_name.lower()
            process_nodes = [
                n for n in all_nodes
                if n.type == AssetCategoryType.PROCESS and process_kw in n.name.lower()
            ]
            if not process_nodes:
                logger.info(f"filter_categories: 无匹配制程 process_name='{query.process_name}'")
                return []

            # 3.2 收集制程下的叶子节点
            included_ids: set = set()
            if has_type:
                for proc in process_nodes:
                    # 遍历整棵子树，找到所有 type 匹配的节点（可能是 line_model / equipment_model）
                    subtree_ids = collect_subtree_ids(proc.id)
                    matched = [
                        nid for nid in subtree_ids
                        if entity_map[nid].type == query.type
                    ]
                    if matched:
                        # 对每个匹配节点，向上收集祖先路径直到制程根节点
                        for mid in matched:
                            cur = mid
                            while cur is not None and cur in entity_map:
                                included_ids.add(cur)
                                if cur == proc.id:
                                    break
                                cur = entity_map[cur].parent_id
            else:
                for proc in process_nodes:
                    included_ids |= collect_subtree_ids(proc.id)

            if not included_ids:
                logger.info(
                    f"filter_categories: 无匹配节点 "
                    f"process_name='{query.process_name}', type='{query.type}'"
                )
                return []

            # 3.3 加载叶子详情
            model_ids = [
                nid for nid in included_ids
                if entity_map[nid].type in (
                    AssetCategoryType.LINE_MODEL, AssetCategoryType.EQUIPMENT_MODEL
                )
            ]
            detail_map = await self._load_detail_map(db, model_ids)

            # 3.4 status 过滤
            if has_status:
                status_upper = query.status.strip().upper()
                valid_model_ids = {
                    nid for nid in model_ids
                    if detail_map.get(nid) and (detail_map[nid].status or "").upper() == status_upper
                }
                if not valid_model_ids:
                    logger.info(
                        f"filter_categories: status 过滤后无结果 "
                        f"process_name='{query.process_name}', type='{query.type}', status='{query.status}'"
                    )
                    return []
                # 重新收集祖先路径
                included_ids = set()
                for leaf_id in valid_model_ids:
                    cur = leaf_id
                    while cur is not None and cur in entity_map:
                        included_ids.add(cur)
                        cur = entity_map[cur].parent_id

            # 3.5 构建树
            vo_map: dict = {}
            for nid in included_ids:
                vo = self._to_tree_vo(entity_map[nid], minio)
                vo.detail = detail_map.get(nid)
                vo_map[nid] = vo

            tree_roots: List[AssetCategoryTreeVo] = []
            for nid in included_ids:
                node = entity_map[nid]
                vo = vo_map[nid]
                if node.parent_id in included_ids:
                    vo_map[node.parent_id].children.append(vo)
                else:
                    tree_roots.append(vo)

            logger.info(
                f"filter_categories: process_name='{query.process_name}', "
                f"type='{query.type}', status='{query.status}', roots={len(tree_roots)}"
            )
            return tree_roots

        except Exception as e:
            logger.error(f"[Error in filter_categories]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"过滤查询失败: {e}")

    async def get_category_tree(
            self,
            db: AsyncSession,
            type_filter: Optional[AssetCategoryType] = None,
    ) -> List[AssetCategoryTreeVo]:
        """
        查询资产分类完整树形结构。
        - type_filter 不为空时，仅返回该 type 下的树
        - 返回顶级节点列表，每个节点含递归 children
        """
        try:
            stmt = select(AssetCategory).order_by(AssetCategory.created_at.asc())
            if type_filter:
                stmt = stmt.where(AssetCategory.type == type_filter)
            result = await db.execute(stmt)
            all_nodes: List[AssetCategory] = list(result.scalars().all())

            # 批量加载 detail
            model_ids = [n.id for n in all_nodes
                         if n.type in (AssetCategoryType.LINE_MODEL,
                                       AssetCategoryType.EQUIPMENT_MODEL)]
            detail_map = await self._load_detail_map(db, model_ids)

            node_map: dict = {}
            minio = MinioManagerService()
            for n in all_nodes:
                vo = self._to_tree_vo(n, minio)
                vo.detail = detail_map.get(n.id)
                node_map[n.id] = vo

            roots: List[AssetCategoryTreeVo] = []

            for node in all_nodes:
                vo = node_map[node.id]
                if node.parent_id and node.parent_id in node_map:
                    node_map[node.parent_id].children.append(vo)
                else:
                    roots.append(vo)

            logger.info(f"查询资产分类树: 节点总数={len(all_nodes)}, 顶级节点={len(roots)}")
            return roots
        except Exception as e:
            logger.error(f"[Error in get_category_tree]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询资产分类树失败: {e}")

    async def update_category(
            self,
            category_id: int,
            dto: AssetCategoryUpdateDto,
            db: AsyncSession,
    ) -> AssetCategoryVo:
        """部分更新资产分类信息，仅更新请求体中非空的字段"""
        entity = await self._get_category_or_raise(category_id, db)
        old_parent_id: Optional[int] = entity.parent_id  # 记录变更前的父节点

        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("id", None)
        update_data.pop("asset_total_count", None)  # 计数由系统自动维护，忽略手动传值

        if not update_data:
            logger.warning(f"更新资产分类 {category_id}: 未提供任何有效更新数据")
            return AssetCategoryVo.model_validate(entity)

        allowed_fields = {"name", "code", "parent_id", "description", "thumbnail_path"}

        try:
            if "code" in update_data and update_data["code"] != entity.code:
                await self._check_code_unique(update_data["code"], exclude_id=category_id, db=db)

            if "parent_id" in update_data and update_data["parent_id"] is not None:
                if update_data["parent_id"] == category_id:
                    raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="父级分类不能指向自身")
                await self._get_category_or_raise(update_data["parent_id"], db)

            for field, value in update_data.items():
                if field in allowed_fields:
                    setattr(entity, field, value)

            # 刷新祖先链的 asset_total_count
            await db.flush()
            await self._refresh_ancestor_counts(category_id, db)
            # 若父节点变更，还需更新旧父节点的祖先链
            new_parent_id = update_data.get("parent_id", old_parent_id)
            if "parent_id" in update_data and new_parent_id != old_parent_id and old_parent_id:
                await self._refresh_ancestor_counts(old_parent_id, db)

            await db.commit()
            await db.refresh(entity)
            logger.info(f"更新资产分类成功: id={category_id}, fields={list(update_data.keys())}")
            return AssetCategoryVo.model_validate(entity)

        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update_category {category_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新资产分类失败: {e}")

    async def delete_category(
            self,
            category_id: int,
            db: AsyncSession,
    ) -> int:
        """
        删除资产分类节点，分两种情况：
        - line_model / equipment_model：仅删除该节点本身 + 对应详情表记录
        - process / line_type / equipment_type：递归删除该节点及所有子孙节点，
          并显式删除子树中所有 line_model / equipment_model 节点对应的详情表记录
        :return: 被删除的分类主键 ID（根节点）
        """
        from sqlalchemy import delete as sa_delete

        minio = MinioManagerService()
        default_thumbnails = {DEFAULT_LINE_THUMBNAIL, DEFAULT_EQUIPMENT_THUMBNAIL}

        async def _delete_thumbnail(thumbnail_path: Optional[str]) -> None:
            """非空且非默认缩略图则从 MinIO 删除"""
            if thumbnail_path and thumbnail_path not in default_thumbnails:
                try:
                    await minio.delete_file(thumbnail_path)
                except Exception as ex:
                    logger.warning(f"MinIO 删除缩略图失败（忽略）: path={thumbnail_path}, err={ex}")

        entity = await self._get_category_or_raise(category_id, db)
        try:
            parent_id_before_delete: Optional[int] = entity.parent_id  # 删除前记录父节点
            model_only_types = {AssetCategoryType.LINE_MODEL, AssetCategoryType.EQUIPMENT_MODEL}
            if entity.type in model_only_types:
                # 查询详情，取缩略图后删除
                if entity.type == AssetCategoryType.LINE_MODEL:
                    detail_result = await db.execute(
                        select(LineModelDetail).where(LineModelDetail.category_id == category_id)
                    )
                    detail = detail_result.scalar_one_or_none()
                    await _delete_thumbnail(detail.thumbnail_path if detail else None)
                    await db.execute(
                        sa_delete(LineModelDetail).where(LineModelDetail.category_id == category_id)
                    )
                else:
                    detail_result = await db.execute(
                        select(EquipmentModelDetail).where(EquipmentModelDetail.category_id == category_id)
                    )
                    detail = detail_result.scalar_one_or_none()
                    await _delete_thumbnail(detail.thumbnail_path if detail else None)
                    await db.execute(
                        sa_delete(EquipmentModelDetail).where(EquipmentModelDetail.category_id == category_id)
                    )
                await db.execute(
                    sa_delete(AssetCategory).where(AssetCategory.id == category_id)
                )
                await db.flush()
                if parent_id_before_delete:
                    await self._refresh_ancestor_counts(parent_id_before_delete, db)
                await db.commit()
                logger.info(f"删除资产模型节点成功: id={category_id}, type={entity.type}")
            else:
                # 加载全部节点，递归收集子树
                all_result = await db.execute(
                    select(AssetCategory).order_by(AssetCategory.created_at.asc())
                )
                all_nodes: List[AssetCategory] = list(all_result.scalars().all())
                entity_map = {n.id: n for n in all_nodes}

                def collect_subtree_ids(nid: int) -> set:
                    ids = {nid}
                    for node in all_nodes:
                        if node.parent_id == nid:
                            ids |= collect_subtree_ids(node.id)
                    return ids

                subtree_ids = collect_subtree_ids(category_id)

                line_model_ids = [
                    nid for nid in subtree_ids
                    if entity_map.get(nid) and entity_map[nid].type == AssetCategoryType.LINE_MODEL
                ]
                equipment_model_ids = [
                    nid for nid in subtree_ids
                    if entity_map.get(nid) and entity_map[nid].type == AssetCategoryType.EQUIPMENT_MODEL
                ]

                # 查询详情，逐一删除非默认缩略图，再批量删详情记录
                if line_model_ids:
                    line_details = (await db.execute(
                        select(LineModelDetail).where(LineModelDetail.category_id.in_(line_model_ids))
                    )).scalars().all()
                    for d in line_details:
                        await _delete_thumbnail(d.thumbnail_path)
                    await db.execute(
                        sa_delete(LineModelDetail).where(LineModelDetail.category_id.in_(line_model_ids))
                    )
                if equipment_model_ids:
                    equip_details = (await db.execute(
                        select(EquipmentModelDetail).where(EquipmentModelDetail.category_id.in_(equipment_model_ids))
                    )).scalars().all()
                    for d in equip_details:
                        await _delete_thumbnail(d.thumbnail_path)
                    await db.execute(
                        sa_delete(EquipmentModelDetail).where(EquipmentModelDetail.category_id.in_(equipment_model_ids))
                    )
                # 删除子树所有分类节点
                await db.execute(
                    sa_delete(AssetCategory).where(AssetCategory.id.in_(subtree_ids))
                )
                await db.flush()
                if parent_id_before_delete:
                    await self._refresh_ancestor_counts(parent_id_before_delete, db)
                await db.commit()
                logger.info(
                    f"递归删除资产分类成功: root_id={category_id}, 共删除={len(subtree_ids)} 个节点, "
                    f"line_details={len(line_model_ids)}, equip_details={len(equipment_model_ids)}"
                )
            return category_id
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete_category]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除资产分类失败: {e}")

    @staticmethod
    def _to_tree_vo(node: "AssetCategory", minio: MinioManagerService) -> AssetCategoryTreeVo:
        """将 AssetCategory 实体转为 AssetCategoryTreeVo，并将 thumbnail_path 拼接为完整 URL"""
        thumbnail_url = minio.build_full_url(
            object_name=node.thumbnail_path,
            bucket_name=minioConfig.bucket_name,
        ) if node.thumbnail_path else None
        node_type = node.type.value if hasattr(node.type, 'value') else node.type
        return AssetCategoryTreeVo(
            id=str(node.id),
            name=node.name,
            code=node.code,
            type=str(node_type),
            parent_id=str(node.parent_id) if node.parent_id is not None else None,
            description=node.description,
            thumbnail_path=thumbnail_url,
            asset_total_count=node.asset_total_count or 0,
        )

    async def _load_detail_map(
            self,
            db: AsyncSession,
            category_ids: List[int],
    ) -> dict:
        """
        批量加载 line_model / equipment_model 类型节点的详情数据。
        返回 {category_id: LineModelSpecialVo | EquipmentModelSpecialVo} 字典。
        缩略图路径自动拼接为完整 URL（域名+桶名+路径）。
        """
        detail_map: dict = {}
        if not category_ids:
            return detail_map

        minio = MinioManagerService()

        line_result = await db.execute(
            select(LineModelDetail).where(
                LineModelDetail.category_id.in_(category_ids),
                LineModelDetail.is_current == True,
                LineModelDetail.is_deleted == False,
            )
        )
        for r in line_result.scalars().all():
            thumbnail_url = minio.build_full_url(
                object_name=r.thumbnail_path,
                bucket_name=r.bucket_name,
            ) if r.thumbnail_path else None
            vo = LineModelSpecialVo(
                id=str(r.id),
                root_usd_path=r.root_usd_path,
                location_path=r.location_path,
                prim_path=r.prim_path,
                instance_path=r.instance_path,
                thumbnail_path=thumbnail_url,
                status=r.status,
                version_tag=r.version_tag,
            )
            detail_map[r.category_id] = vo

        equip_result = await db.execute(
            select(EquipmentModelDetail).where(
                EquipmentModelDetail.category_id.in_(category_ids),
                EquipmentModelDetail.is_current == True,
                EquipmentModelDetail.is_deleted == False,
            )
        )
        for r in equip_result.scalars().all():

            thumbnail_url = minio.build_full_url(
                object_name=r.thumbnail_path,
                bucket_name=r.bucket_name,
            ) if r.thumbnail_path else None
            vo = EquipmentModelSpecialVo(
                id=str(r.id),
                manufacturer=r.manufacturer,
                asset_type=r.asset_type,
                brand=r.brand,
                root_usd_path=r.root_usd_path,
                location_path=r.location_path,
                prim_path=r.prim_path,
                instance_path=r.instance_path,
                thumbnail_path=thumbnail_url,
                specifications=r.specifications,
                status=r.status,
                version_tag=r.version_tag,
            )
            detail_map[r.category_id] = vo

        return detail_map

    async def _refresh_ancestor_counts(self, anchor_id: int, db: AsyncSession) -> None:
        """
        从 anchor_id 节点向上遍历祖先链（含自身），仅对 process / line_type / equipment_type
        节点重新统计其子树内 line_model / equipment_model 叶子总数，写入 asset_total_count。
        - line_type  统计其下所有 line_model 数量
        - equipment_type 统计其下所有 equipment_model 数量
        - process = 所有 line_type + equipment_type 子节点计数之和
        - line_model / equipment_model 节点本身不参与统计，asset_total_count 保持 0
        调用时机：节点增删改执行后、db.commit() 之前（flush 状态下最新数据已可见）。
        """
        all_result = await db.execute(select(AssetCategory))
        all_nodes: List[AssetCategory] = list(all_result.scalars().all())
        entity_map = {n.id: n for n in all_nodes}

        if anchor_id not in entity_map:
            return

        model_leaf_types = {AssetCategoryType.LINE_MODEL, AssetCategoryType.EQUIPMENT_MODEL}
        statistic_types = {AssetCategoryType.PROCESS, AssetCategoryType.LINE_TYPE, AssetCategoryType.EQUIPMENT_TYPE}

        def count_model_leaves(nid: int) -> int:
            """递归统计 nid 子树内所有 line_model / equipment_model 节点总数"""
            node = entity_map.get(nid)
            if not node:
                return 0
            if node.type in model_leaf_types:
                return 1
            return sum(count_model_leaves(c.id) for c in all_nodes if c.parent_id == nid)

        # 沿祖先链（含 anchor 自身）收集节点 id，由近到远
        chain: List[int] = []
        cur_id: Optional[int] = anchor_id
        while cur_id is not None and cur_id in entity_map:
            chain.append(cur_id)
            cur_id = entity_map[cur_id].parent_id

        # 仅更新 process / line_type / equipment_type 节点；model 节点保持 0
        for nid in chain:
            node = entity_map[nid]
            if node.type in statistic_types:
                node.asset_total_count = count_model_leaves(nid)

        await db.flush()

    async def copy_asset_model(
            self,
            dto: AssetCopyModelDto,
            db: AsyncSession,
    ) -> dict:
        """
        复制资产模型节点为新版本：
        1. 定位源节点（line_model / equipment_model）并校验类型与 asset_type 一致
        2. 查找源节点最新版本详情（is_current=True 且未软删）
        3. 校验 new_version_tag 在同一逻辑资产（asset_version_id）下不重复
        4. 创建新资产分类节点（挂到相同父节点下）
        5. 旧详情 is_current 置为 False，创建新版本详情（is_current=True，沿用同一 asset_version_id）
        6. 线体模型：复制源详情下未软删的设备实例关联（line_model_equipment_rel）到新详情
        说明：本环境不做 MinIO 文件复制，新详情沿用源详情的 root_usd_path / location_path。
        """
        # ① 定位并校验源节点
        source_category = await self._get_category_or_raise(dto.category_id, db)
        is_line = dto.asset_type == AssetUploadType.LINE
        expected_type = (
            AssetCategoryType.LINE_MODEL if is_line else AssetCategoryType.EQUIPMENT_MODEL
        )
        if source_category.type != expected_type.value:
            raise BusinessException(
                ErrorCode.PARAMS_ERROR,
                extra_msg=(
                    f"节点类型与 asset_type 不匹配："
                    f"节点实际类型={source_category.type}，"
                    f"传入 asset_type={dto.asset_type.value}"
                ),
            )

        # ② 查找源最新版本详情
        DetailModel = LineModelDetail if is_line else EquipmentModelDetail
        detail_res = await db.execute(
            select(DetailModel).where(
                DetailModel.category_id == dto.category_id,
                DetailModel.is_current == True,
                DetailModel.is_deleted == False,
            ).limit(1)
        )
        current_detail = detail_res.scalar_one_or_none()
        if current_detail is None:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg=f"未找到节点 [{source_category.name}] 的最新版本详情记录",
            )

        # ③ 校验 new_version_tag 在同一逻辑资产下是否已存在
        asset_version_id = current_detail.asset_version_id
        if asset_version_id is not None:
            tag_check = await db.execute(
                select(DetailModel.id).where(
                    DetailModel.asset_version_id == asset_version_id,
                    DetailModel.version_tag == dto.new_version_tag,
                    DetailModel.is_deleted == False,
                ).limit(1)
            )
            if tag_check.scalar_one_or_none() is not None:
                raise BusinessException(
                    ErrorCode.DATA_ALREADY_EXISTS,
                    extra_msg=f"版本标签 '{dto.new_version_tag}' 在同一逻辑资产下已存在",
                )

        try:
            # ④ 创建新资产分类节点（挂到相同父节点下）
            new_category = AssetCategory(
                name=dto.new_asset_name,
                code=str(generate_snowflake_id()),
                type=source_category.type,
                parent_id=source_category.parent_id,
                description=source_category.description,
                thumbnail_path=source_category.thumbnail_path,
            )
            db.add(new_category)
            await db.flush()
            logger.info(
                f"新资产节点创建: id={new_category.id}, name={new_category.name}"
            )

            # ⑤ 旧详情 is_current 置为 False
            current_detail.is_current = False

            # ⑥ 创建新版本详情（沿用同一 asset_version_id 形成版本血缘）
            remark = f"从 [{source_category.name}] 复制生成，版本 {dto.new_version_tag}"
            if is_line:
                new_detail = LineModelDetail(
                    category_id=new_category.id,
                    bucket_name=current_detail.bucket_name,
                    root_usd_path=current_detail.root_usd_path,
                    location_path=current_detail.location_path,
                    thumbnail_path=current_detail.thumbnail_path,
                    category=current_detail.category,
                    manufacturer=current_detail.manufacturer,
                    model=current_detail.model,
                    format=current_detail.format,
                    poly_count=current_detail.poly_count,
                    prim_path=current_detail.prim_path,
                    instance_path=current_detail.instance_path,
                    width=current_detail.width,
                    depth=current_detail.depth,
                    height=current_detail.height,
                    status=current_detail.status,
                    asset_version_id=asset_version_id,
                    version_tag=dto.new_version_tag,
                    is_current=True,
                    remark=remark,
                    created_by=current_detail.created_by,
                )
            else:
                new_detail = EquipmentModelDetail(
                    category_id=new_category.id,
                    bucket_name=current_detail.bucket_name,
                    manufacturer=current_detail.manufacturer,
                    asset_type=current_detail.asset_type,
                    brand=current_detail.brand,
                    root_usd_path=current_detail.root_usd_path,
                    location_path=current_detail.location_path,
                    thumbnail_path=current_detail.thumbnail_path,
                    specifications=current_detail.specifications,
                    category=current_detail.category,
                    model=current_detail.model,
                    format=current_detail.format,
                    poly_count=current_detail.poly_count,
                    prim_path=current_detail.prim_path,
                    instance_path=current_detail.instance_path,
                    width=current_detail.width,
                    depth=current_detail.depth,
                    height=current_detail.height,
                    status=current_detail.status,
                    asset_version_id=asset_version_id,
                    version_tag=dto.new_version_tag,
                    is_current=True,
                    remark=remark,
                    created_by=current_detail.created_by,
                )
            db.add(new_detail)
            await db.flush()

            # ⑦ 线体：复制源详情下未软删的设备实例关联到新详情
            copied_rel_count = 0
            if is_line:
                rel_res = await db.execute(
                    select(LineModelEquipmentRel).where(
                        LineModelEquipmentRel.line_model_id == current_detail.id,
                        LineModelEquipmentRel.is_deleted == False,
                    )
                )
                source_rels = list(rel_res.scalars().all())
                for rel in source_rels:
                    db.add(LineModelEquipmentRel(
                        line_model_id=new_detail.id,
                        equipment_model_id=rel.equipment_model_id,
                        instance_name=rel.instance_name,
                        position_data=rel.position_data,
                        rotation_data=rel.rotation_data,
                        device_status=rel.device_status,
                        device_area=rel.device_area,
                        root_usd_path=rel.root_usd_path,
                        is_deleted=False,
                    ))
                copied_rel_count = len(source_rels)
                if copied_rel_count:
                    await db.flush()

            # 新增叶子节点后刷新祖先链 asset_total_count（与 create_category 一致）
            await self._refresh_ancestor_counts(new_category.id, db)

            await db.commit()
            await db.refresh(new_category)
            await db.refresh(new_detail)

            logger.info(
                f"资产节点复制完成: "
                f"source={source_category.name}({dto.category_id}) → "
                f"new={new_category.name}({new_category.id}), "
                f"version_tag={dto.new_version_tag}, copied_rel_count={copied_rel_count}"
            )
            return {
                "source_category_id": str(dto.category_id),
                "source_category_name": source_category.name,
                "new_category_id": str(new_category.id),
                "new_category_name": new_category.name,
                "new_detail_id": str(new_detail.id),
                "asset_version_id": str(asset_version_id) if asset_version_id is not None else None,
                "new_version_tag": dto.new_version_tag,
                "asset_type": dto.asset_type.value,
                "copied_rel_count": copied_rel_count,
            }

        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in copy_asset_model]: {e}")
            raise BusinessException(
                ErrorCode.SYSTEM_ERROR,
                extra_msg=f"资产模型复制失败: {e}",
            )

    async def _get_category_or_raise(
            self,
            category_id: int,
            db: AsyncSession,
    ) -> AssetCategory:
        """根据主键 ID 查询资产分类实体，不存在则抛出 NOT_FOUND_ERROR"""
        result = await db.execute(
            select(AssetCategory).where(
                AssetCategory.id == category_id,
                AssetCategory.is_deleted == False,
            )
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg=f"资产分类不存在: id={category_id}",
            )
        return entity

    @staticmethod
    def _get_detail_table(asset_type: str):
        """根据 category type 返回对应的详情表"""
        return LineModelDetail if asset_type == AssetCategoryType.LINE_MODEL else EquipmentModelDetail

    async def _check_deletable_status(
            self,
            category_id: str,
            entity: AssetCategory,
            db: AsyncSession,
    ) -> None:
        """
        校验当前版本状态是否为 INACTIVE，只有 INACTIVE 状态允许删除。
        非叶子节点在前序 type 校验中已拒绝，此处不做二次校验。
        """
        table = self._get_detail_table(entity.type)
        result = await db.execute(
            select(table.status)
            .where(table.category_id == category_id, table.is_current == True, table.is_deleted == False)
        )
        status = result.scalar_one_or_none()
        if status is None:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg=f"category_id={category_id} 不存在当前版本详情记录",
            )
        if status != AssetModelStatus.INACTIVE.value:
            raise BusinessException(
                ErrorCode.OPERATION_ERROR,
                extra_msg=(
                    f"category_id={category_id} 当前资产状态为「{status}」，"
                    f"仅「{AssetModelStatus.INACTIVE.value}」状态的模型允许删除，请先将模型设为非激活状态"
                ),
            )

    async def batch_delete_model_nodes(
            self,
            category_ids: List[str],
            db: AsyncSession,
    ) -> List[str]:
        """
        批量删除资产模型叶子节点（仅限 line_model / equipment_model）。
        - 逐一校验节点类型，非叶子节点直接报错（整体回滚）
        - 逐一校验状态，仅 INACTIVE 可删除
        - 软删除每个节点的详情表记录、关联表记录及分类节点本身，并清理 MinIO 缩略图
        :return: 实际被删除的分类主键 ID 列表
        """
        if not category_ids:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID 列表不能为空")

        _model_types = {AssetCategoryType.LINE_MODEL, AssetCategoryType.EQUIPMENT_MODEL}

        # 预加载所有节点，批量校验类型
        result = await db.execute(
            select(AssetCategory).where(AssetCategory.id.in_(category_ids), AssetCategory.is_deleted == False)
        )
        entities = {e.id: e for e in result.scalars().all()}

        for cid in category_ids:
            if cid not in entities:
                raise BusinessException(
                    ErrorCode.NOT_FOUND_ERROR,
                    extra_msg=f"资产分类不存在: id={cid}"
                )
            if entities[cid].type not in _model_types:
                raise BusinessException(
                    ErrorCode.PARAMS_ERROR,
                    extra_msg=(
                        f"此接口只能删除资产模型节点（line_model / equipment_model），"
                        f"id={cid} 的节点类型为 '{entities[cid].type}'，不允许删除"
                    ),
                )

        # 逐一校验状态：仅 INACTIVE 可删除
        for cid in category_ids:
            await self._check_deletable_status(cid, entities[cid], db)

        try:
            minio = MinioManagerService()
            deleted_ids: List[str] = []
            for cid in category_ids:
                await self._delete_single_model_node(cid, entities[cid], db, minio)
                deleted_ids.append(cid)

            await db.flush()
            await db.commit()
            logger.info(f"批量删除资产模型节点成功: ids={deleted_ids}")
            return deleted_ids
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in batch_delete_model_nodes]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"批量删除资产模型节点失败: {e}")

    async def _delete_single_model_node(
            self,
            category_id: str,
            entity: AssetCategory,
            db: AsyncSession,
            minio: MinioManagerService,
    ) -> None:
        """
        内部方法：软删除单个 line_model / equipment_model 节点（不提交事务）。
        执行顺序：① 删 MinIO 缩略图 → ② 软删关联表(line_model_equipment_rel) → ③ 软删详情表 → ④ 软删分类节点
        """
        default_thumbnails = {DEFAULT_LINE_THUMBNAIL, DEFAULT_EQUIPMENT_THUMBNAIL}

        async def _try_delete_thumbnail(thumbnail_path: Optional[str]) -> None:
            if thumbnail_path and thumbnail_path not in default_thumbnails:
                try:
                    await minio.delete_file(thumbnail_path)
                except Exception as ex:
                    logger.warning(f"MinIO 删除缩略图失败（忽略）: path={thumbnail_path}, err={ex}")

        if entity.type == AssetCategoryType.LINE_MODEL:
            # 查询该分类下所有版本的详情记录（不区分是否已删除，确保关联数据完整清理）
            detail_result = await db.execute(
                select(LineModelDetail).where(LineModelDetail.category_id == category_id)
            )
            details = detail_result.scalars().all()
            detail_ids = [d.id for d in details]

            # 软删除当前有效缩略图
            current_detail = next((d for d in details if not d.is_deleted), None)
            await _try_delete_thumbnail(current_detail.thumbnail_path if current_detail else None)

            # 软删除 line_model_equipment_rel 中所有关联该线体详情的记录
            if detail_ids:
                await db.execute(
                    sa_update(LineModelEquipmentRel)
                    .where(LineModelEquipmentRel.line_model_id.in_(detail_ids))
                    .values(is_deleted=True)
                )
                logger.info(f"软删除线体关联设备记录: line_model_ids={detail_ids}")

            # 软删除线体详情表（所有版本）
            await db.execute(
                sa_update(LineModelDetail).where(LineModelDetail.category_id == category_id).values(is_deleted=True)
            )
        else:  # EQUIPMENT_MODEL
            # 查询该分类下所有版本的详情记录（不区分是否已删除，确保关联数据完整清理）
            detail_result = await db.execute(
                select(EquipmentModelDetail).where(EquipmentModelDetail.category_id == category_id)
            )
            details = detail_result.scalars().all()
            detail_ids = [d.id for d in details]

            # 软删除当前有效缩略图
            current_detail = next((d for d in details if not d.is_deleted), None)
            await _try_delete_thumbnail(current_detail.thumbnail_path if current_detail else None)

            # 软删除 line_model_equipment_rel 中所有关联该设备详情的记录
            if detail_ids:
                await db.execute(
                    sa_update(LineModelEquipmentRel)
                    .where(LineModelEquipmentRel.equipment_model_id.in_(detail_ids))
                    .values(is_deleted=True)
                )
                logger.info(f"软删除设备关联线体记录: equipment_model_ids={detail_ids}")

            # 软删除设备详情表（所有版本）
            await db.execute(
                sa_update(EquipmentModelDetail).where(EquipmentModelDetail.category_id == category_id).values(is_deleted=True)
            )

        # 软删除资产分类节点
        await db.execute(
            sa_update(AssetCategory).where(AssetCategory.id == category_id).values(is_deleted=True)
        )

    async def move_leaf_node(
            self,
            node_id: str,
            new_parent_id: str,
            db: AsyncSession,
    ) -> "AssetCategoryVo":
        """
        拖拽移动叶子节点到新的父节点下。
        - 仅允许移动 line_model / equipment_model 类型的叶子节点
        - line_model 只能移动到 line_type 下，equipment_model 只能移动到 equipment_type 下
        - 不允许移动到自身或同一父节点
        """
        _leaf_types = {AssetCategoryType.LINE_MODEL, AssetCategoryType.EQUIPMENT_MODEL}
        _valid_parent_map = {
            AssetCategoryType.LINE_MODEL: AssetCategoryType.LINE_TYPE,
            AssetCategoryType.EQUIPMENT_MODEL: AssetCategoryType.EQUIPMENT_TYPE,
        }

        entity = await self._get_category_or_raise(node_id, db)

        if entity.type not in _leaf_types:
            raise BusinessException(
                ErrorCode.PARAMS_ERROR,
                extra_msg=(
                    f"仅支持移动叶子节点（line_model / equipment_model），"
                    f"当前节点类型为 '{entity.type}'"
                ),
            )

        if entity.parent_id == new_parent_id:
            raise BusinessException(
                ErrorCode.PARAMS_ERROR,
                extra_msg="目标父节点与当前父节点相同，无需移动",
            )

        parent_entity = await self._get_category_or_raise(new_parent_id, db)

        expected_parent_type = _valid_parent_map[AssetCategoryType(entity.type)]
        if parent_entity.type != expected_parent_type.value:
            raise BusinessException(
                ErrorCode.PARAMS_ERROR,
                extra_msg=(
                    f"目标父节点类型不匹配：{entity.type} 类型的节点只能移动到 "
                    f"{expected_parent_type.value} 类型节点下，"
                    f"当前目标节点类型为 '{parent_entity.type}'"
                ),
            )

        try:
            entity.parent_id = new_parent_id
            await db.flush()
            await db.commit()
            await db.refresh(entity)
            logger.info(f"移动叶子节点成功: id={node_id}, new_parent_id={new_parent_id}")
            return AssetCategoryVo.model_validate(entity)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in move_leaf_node]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"移动叶子节点失败: {e}")

    async def _check_code_unique(
            self,
            code: str,
            exclude_id: Optional[int],
            db: AsyncSession,
    ) -> None:
        """校验 code 全局唯一性"""
        stmt = select(AssetCategory.id).where(AssetCategory.code == code)
        if exclude_id is not None:
            stmt = stmt.where(AssetCategory.id != exclude_id)
        stmt = stmt.limit(1)
        exists = (await db.execute(stmt)).scalar_one_or_none()
        if exists:
            raise BusinessException(
                ErrorCode.DATA_ALREADY_EXISTS,
                extra_msg=f"分类编码 '{code}' 已存在，请更换其他编码",
            )
