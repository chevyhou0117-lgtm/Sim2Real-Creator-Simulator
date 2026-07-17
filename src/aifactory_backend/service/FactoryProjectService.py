import asyncio
import math
import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, List

from sqlalchemy import select, func, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.FactoryProjectDto import (
    FactoryProjectCreateDto,
    FactoryProjectUpdateDto,
    FactoryProjectQueryDto,
)
from models.entity.FactoryProjectEntity import FactoryProject
from models.entity.FactoryProjectVersionEntity import FactoryProjectVersion
from models.entity.FactoryAssetNodeEntity import FactoryAssetNode
from models.entity.FactoryAsset3dModelEntity import FactoryAsset3dModel
from models.entity.FactoryProcessDetailsEntity import FactoryProcessDetails
from models.entity.FactoryLineDetailsEntity import FactoryLineDetails
from models.entity.FactoryEquipmentDetailsEntity import FactoryEquipmentDetails
from models.entity.BaseFactoryEntity import BaseFactory
from models.entity.BaseStageEntity import BaseStage
from models.entity.BaseProductionLineEntity import BaseProductionLine
from models.entity.BaseEquipmentEntity import BaseEquipment
from models.vo.FactoryProjectVo import FactoryProjectVo, FactoryProjectDetailVo
from models.vo.ValidationReportVo import NodeIssueVo, ValidationSummaryVo, ValidationReportVo
from models.enums.ProjectStatusEnum import ProjectStatus
from models.enums.InstanceAssetTypeEnum import InstanceAssetType
from models.enums.BindStatusEnum import BindStatus
from service.MinioService import MinioManagerService
from config.MinioConfig import minioConfig

init_logging()
logger = logging.getLogger(__name__)

# 全新工厂项目根节点的空 root USD 模板（usda 文本写入 .usd 文件；USD/Kit 按内容识别格式，故扩展名用 .usd）。
_EMPTY_ROOT_USD = """#usda 1.0
(
    defaultPrim = "World"
    doc = "{doc}"
    metersPerUnit = 1
    upAxis = "Z"
)

def Xform "World"
{{
}}
"""


class FactoryProjectService:

    async def create_factory_project(
        self,
        dto: FactoryProjectCreateDto,
        db: AsyncSession,
    ) -> dict:
        """
        创建工厂项目，返回 { project_id, version_id }。

        逻辑分支：
        │ 场景A：传入 factory_id（绑定已有工厂）                            │
        │   1. 校验工厂存在                                                │
        │   2. 查询该工厂下已有项目 → 获取最新版本的 version_id              │
        │   3. 创建新项目，版本号递增                                       │
        │   4. 复制最新版本资产树到新版本                                    │
        │ 场景B：不传 factory_id，传 factory_name + factory_code（新建工厂）  │
        │   1. 校验工厂名称/编号唯一性（主数据 plan_id IS NULL 范围）          │
        │   2. 创建 md_factory 主数据行，factory_id 雪花自动生成              │
        │   3. 创建项目，V1 版本（新工厂无制程，资产树只有根节点+default_stage）│
        """
        try:
            if dto is None:
                raise BusinessException(ErrorCode.PARAMS_ERROR, "请求参数不能为空")

            factory_id = dto.factory_id
            factory_entity = None
            base_version_id = None  # 基线版本ID（用于复制资产树）
            base_version_number = 0

            # 1：传入了 factory_id → 选择已有工厂
            if factory_id is not None:
                # 校验工厂存在（master 主数据，plan_id IS NULL）
                result = await db.execute(
                    select(BaseFactory).where(
                        and_(BaseFactory.factory_id == factory_id,
                             BaseFactory.plan_id.is_(None))
                    )
                )
                factory_entity = result.scalar_one_or_none()
                if factory_entity is None:
                    raise BusinessException(
                        ErrorCode.NOT_FOUND_ERROR,
                        extra_msg=f"关联工厂不存在: factory_id={factory_id}",
                    )
                # 查询该工厂下已有项目，获取最新版本
                if dto.copy_from_version_id:
                    # 前端指定了复制源版本
                    base_version = await self._get_version_or_raise(dto.copy_from_version_id, db)
                    # 确保该版本属于同一工厂下的项目
                    base_project = await self._get_project_or_raise(base_version.project_id, db)
                    if base_project.factory_id != factory_id:
                        raise BusinessException(
                            ErrorCode.PARAMS_ERROR,
                            extra_msg="copy_from_version_id 对应的版本不属于该工厂",
                        )
                    base_version_id = base_version.version_id
                    base_version_number = base_version.version_number
                else:
                    # 自动找该工厂最新项目的当前版本
                    latest_version = await self._get_latest_version_for_factory(factory_id, db)
                    if latest_version:
                        base_version_id = latest_version.version_id
                        base_version_number = latest_version.version_number

            # 2：未传 factory_id → 新建工厂（factory_name + factory_code 必填，factory_id 自动生成）。
            # 注意：sim 侧 GET /factories 已按 CANONICAL_FACTORY_CODE 过滤，
            # Creator 新建的工厂不会进入 sim 的工厂列表/仿真链路。
            else:
                if dto.copy_from_version_id:
                    raise BusinessException(
                        ErrorCode.PARAMS_ERROR,
                        extra_msg="新建工厂时不支持 copyFromVersionId",
                    )
                factory_name = (dto.factory_name or "").strip()
                factory_code = (dto.factory_code or "").strip()
                if not factory_name:
                    raise BusinessException(
                        ErrorCode.PARAMS_ERROR,
                        extra_msg="未选择已有工厂时，工厂名称必填",
                    )
                if not factory_code:
                    raise BusinessException(
                        ErrorCode.PARAMS_ERROR,
                        extra_msg="未选择已有工厂时，工厂编号必填",
                    )
                # 名称/编号唯一性校验（仅主数据范围 plan_id IS NULL，与 BaseFactoryService 一致）
                dup_name = (await db.execute(
                    select(BaseFactory).where(
                        BaseFactory.factory_name == factory_name,
                        BaseFactory.plan_id.is_(None),
                    )
                )).scalar_one_or_none()
                if dup_name is not None:
                    raise BusinessException(
                        ErrorCode.PARAMS_ERROR, extra_msg=f"工厂名称已存在: {factory_name}"
                    )
                dup_code = (await db.execute(
                    select(BaseFactory).where(
                        BaseFactory.factory_code == factory_code,
                        BaseFactory.plan_id.is_(None),
                    )
                )).scalar_one_or_none()
                if dup_code is not None:
                    raise BusinessException(
                        ErrorCode.PARAMS_ERROR, extra_msg=f"工厂编号已存在: {factory_code}"
                    )
                factory_entity = BaseFactory(
                    factory_name=factory_name,
                    factory_code=factory_code,
                    location=dto.location,
                    site_length=dto.site_length,
                    site_width=dto.site_width,
                    timezone="Asia/Shanghai",
                    status="ACTIVE",
                    plan_id=None,
                )
                db.add(factory_entity)
                await db.flush()  # factory_id 雪花默认值在 flush 时生成
                factory_id = factory_entity.factory_id
                logger.info(
                    f"[CreateProject] 新建工厂: factory_id={factory_id}, "
                    f"name={factory_name}, code={factory_code}"
                )

            # 创建工厂项目
            project_entity = FactoryProject(
                factory_id=factory_id,
                project_name=dto.project_name,
                status=dto.status.value if dto.status else ProjectStatus.ACTIVE.value,
                owner_id=dto.owner_id,
                description=dto.description,
                version_count=1,
            )
            db.add(project_entity)
            await db.flush()

            # 创建项目版本
            #   - 有基线版本：版本号 = 基线版本号 + 1，复制资产树
            #   - 无基线版本：版本号 = 1，空资产树
            new_version_number = base_version_number + 1 if base_version_number > 0 else 1
            v1 = FactoryProjectVersion(
                project_id=project_entity.project_id,
                version_number=new_version_number,
                version_name=f"V{new_version_number}",
                remark=f"基于 V{base_version_number} 创建" if base_version_number > 0 else "项目创建时自动生成",
                version_status="DRAFT",
                is_current=True,
                base_version_id=base_version_id,
                created_by=dto.owner_id,
            )
            db.add(v1)
            await db.flush()
            # 回写项目冗余字段
            project_entity.current_version_id = v1.version_id
            # 复制基线版本的资产树
            if base_version_id:
                await self._copy_asset_tree(
                    source_version_id=base_version_id,
                    target_version_id=v1.version_id,
                    target_project_id=project_entity.project_id,
                    db=db,
                )
                logger.info(
                    f"创建项目(有基线): project_id={project_entity.project_id}, "
                    f"base_v={base_version_number}, new_v={new_version_number}"
                )
            else:
                # 全新项目（无基线版本）：初始化资产树骨架（FACTORY 根节点 + default_stage 默认制程节点）。
                # 否则后续「上传工厂模型」会因找不到 default_stage 节点而失败（请先创建项目）。
                await self._init_factory_asset_tree(
                    factory_id=factory_id,
                    factory_name=factory_entity.factory_name,
                    project_id=project_entity.project_id,
                    version_id=v1.version_id,
                    db=db,
                )
                logger.info(
                    f"创建项目(全新): project_id={project_entity.project_id}, v={new_version_number}"
                )

            await db.commit()
            await db.refresh(project_entity)
            return {
                "project_id": str(project_entity.project_id),
                "version_id": str(v1.version_id),
            }

        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create_factory_project]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建工厂项目失败: {e}")

    async def _create_root_usd(
        self,
        root_node: FactoryAssetNode,
        project_id,
        factory_name: str,
        db: AsyncSession,
    ) -> None:
        """为工厂项目根节点创建空 root USD 文件 + FactoryAsset3dModel 记录。

        - 写文件用【相对路径】rel_path：落到 STORAGE_ROOT/FactoryProjects/<project_id>/<project_id>.usd。
        - 存库用【绝对路径】abs_path = USD_HOST_ROOT + rel_path：Kit 的 _build_full_url 对绝对 Windows
          路径原样打开，绕开 Kit 的 USD_ROOT，从而后端文件即便落在与 Kit USD_ROOT 不同的盘也能打开。
        新建即落一个最小空舞台，使项目在 Creator 中可直接打开；保存（save_as_stage_async）覆盖写回同一文件。
        """
        rel_path = f"FactoryProjects/{project_id}/{project_id}.usd"
        abs_path = f"{minioConfig.usd_host_root}/{rel_path}"  # 绝对路径（宿主可达），存入 DB
        usd_bytes = _EMPTY_ROOT_USD.format(
            doc=f"{factory_name} - 空场景（项目 {project_id}）"
        ).encode("utf-8")
        minio = MinioManagerService()
        # 写本地存储（线程池，避免阻塞事件循环）；upload_bytes_to_path 内部会建父目录
        await asyncio.to_thread(minio.upload_bytes_to_path, usd_bytes, rel_path)
        db.add(FactoryAsset3dModel(
            factory_asset_id=root_node.id,
            usd_name=f"{project_id}.usd",
            root_usd_path=abs_path,
            bucket_name=minio.bucket_name,
            prim_path="/World",
            location_path="/World",
        ))
        await db.flush()
        logger.info(f"[CreateProject] 根节点 root USD 已创建: file={rel_path}, root_usd_path={abs_path}")

    async def _init_factory_asset_tree(
        self,
        factory_id,
        factory_name: str,
        project_id: int,
        version_id: int,
        db: AsyncSession,
    ) -> None:
        """初始化全新项目的资产树骨架：
        1. FACTORY 根节点
        2. default_stage 默认制程节点（ref_id=None）—— upload_factory_model/add_line_node 把
           LINE/EQUIPMENT 挂在它下面
        3. 为该工厂每个 md_stage（master, plan_id IS NULL）创建**绑定的** STAGE 制程节点
           （bind_status=BOUND，factory_process_details.ref_id=stage.stage_id）。
           线体绑定 _bind_line_node 依赖这些制程节点：按 line.stage_id 在本项目内定位归属制程，
           缺了它绑定线体会报「未找到线体所属制程对应的制程节点」。
           新建的空工厂在 md_stage 里没有制程，第 3 步自然为空，只有根节点 + default_stage。
        """
        root_node = FactoryAssetNode(
            factory_projects_id=project_id,
            version_id=version_id,
            name=factory_name,
            type=InstanceAssetType.FACTORY.value,
            parent_id=None,
            bind_status=BindStatus.UNBOUND.value,
        )
        db.add(root_node)
        await db.flush()

        # 新建项目即为根节点创建一个空 root USD（写入本地存储）+ 3D 模型记录，
        # 使项目在 Creator 中可打开/保存（root_usd_path 由流程统一登记，不手改 DB）。
        await self._create_root_usd(root_node, project_id, factory_name, db)

        default_node = FactoryAssetNode(
            factory_projects_id=project_id,
            version_id=version_id,
            name="default_stage",
            code="default_stage",
            type=InstanceAssetType.STAGE.value,
            parent_id=root_node.id,
            bind_status=BindStatus.UNBOUND.value,
        )
        db.add(default_node)
        await db.flush()
        db.add(FactoryProcessDetails(factory_asset_id=default_node.id, ref_id=None))
        await db.flush()

        # 为该工厂每个制程（master）创建绑定的 STAGE 节点
        stages = (await db.execute(
            select(BaseStage)
            .where(BaseStage.factory_id == factory_id, BaseStage.plan_id.is_(None))
            .order_by(BaseStage.sequence.asc())
        )).scalars().all()
        for stage in stages:
            stage_node = FactoryAssetNode(
                factory_projects_id=project_id,
                version_id=version_id,
                name=stage.stage_name,
                code=stage.stage_code,
                type=InstanceAssetType.STAGE.value,
                parent_id=root_node.id,
                bind_status=BindStatus.BOUND.value,
            )
            db.add(stage_node)
            await db.flush()
            db.add(FactoryProcessDetails(factory_asset_id=stage_node.id, ref_id=stage.stage_id))
            await db.flush()

        logger.info(
            f"[InitAssetTree] 初始化项目资产树: project={project_id}, "
            f"factory_root={root_node.id}, default_stage={default_node.id}, 绑定制程节点={len(stages)}"
        )

    async def update_factory_project(
        self,
        project_id: int,
        dto: FactoryProjectUpdateDto,
        db: AsyncSession,
    ) -> str:
        entity = await self._get_or_raise(project_id, db)
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("project_id", None)
        if not update_data:
            return str(project_id)

        allowed_fields = {
            "project_name",
            "thumbnail_url",
            "status",
            "owner_id",
            "description",
        }

        try:
            for field, value in update_data.items():
                if field in allowed_fields:
                    if field == "status" and isinstance(value, ProjectStatus):
                        value = value.value
                    setattr(entity, field, value)
            await db.commit()
            return str(project_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update_factory_project {project_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新工厂项目失败: {e}")

    async def update_project_thumbnail(
        self,
        project_id: str,
        file,
        db: AsyncSession,
    ) -> dict:
        """
        更新工厂项目缩略图（原子操作）：
        1. 查询项目实体
        2. 上传新图片到本地存储 thumbnails/ → 拼接完整 /static URL
        3. 若旧 thumbnail_url 非空，则解析 object_name 后删除旧文件（失败忽略）
        4. 更新 DB thumbnail_url = 完整 URL
        5. 返回 { project_id, thumbnail_url }
        """
        entity = await self._get_or_raise(project_id, db)
        try:
            minio = MinioManagerService()
            # 上传新缩略图，得到本地相对路径（thumbnails/xxx）
            object_name = await minio.upload_thumbnail_file(file)
            new_thumbnail_url = minio.build_full_url(object_name=object_name)

            # 删除旧缩略图（从完整 /static URL 中解析 object_name）
            old_url = entity.thumbnail_url
            if old_url:
                try:
                    prefix = f"{minio.static_base}/"
                    if prefix and prefix in old_url:
                        old_object_name = old_url.split(prefix, 1)[-1]
                    else:
                        old_object_name = old_url.lstrip("/")
                    if old_object_name and old_object_name != object_name:
                        await minio.delete_file(old_object_name)
                except Exception as ex:
                    logger.warning(f"删除旧项目缩略图失败（忽略）: url={old_url}, err={ex}")

            # 更新 DB
            entity.thumbnail_url = new_thumbnail_url
            await db.commit()
            await db.refresh(entity)
            logger.info(f"更新工厂项目缩略图成功: project_id={project_id}, url={new_thumbnail_url}")
            return {"project_id": str(project_id), "thumbnail_url": new_thumbnail_url}

        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update_project_thumbnail {project_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新工厂项目缩略图失败: {e}")

    async def delete_factory_project(
        self,
        project_id: int,
        db: AsyncSession,
    ) -> str:
        entity = await self._get_or_raise(project_id, db)
        try:
            entity.is_deleted = True  # 软删除（与全仓 Creator 表 is_deleted 约定一致）
            await db.commit()
            return str(project_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete_factory_project]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除工厂项目失败: {e}")

    async def get_factory_project_by_id(
        self,
        project_id: int,
        db: AsyncSession,
    ) -> FactoryProjectDetailVo:
        entity = await self._get_or_raise(project_id, db)
        vo = FactoryProjectDetailVo.model_validate(entity)

        # FACTORY 根节点入口 USD：前端工厂编辑器据此自动打开 OV 场景（/open_factory_stage）
        root_node_row = (await db.execute(
            select(FactoryAssetNode.id).where(
                FactoryAssetNode.factory_projects_id == project_id,
                FactoryAssetNode.parent_id.is_(None),
                FactoryAssetNode.type == InstanceAssetType.FACTORY.value,
                FactoryAssetNode.is_deleted == False,
            )
        )).first()
        if root_node_row:
            model_row = (await db.execute(
                select(FactoryAsset3dModel.root_usd_path).where(
                    FactoryAsset3dModel.factory_asset_id == root_node_row.id,
                    FactoryAsset3dModel.is_deleted == False,
                )
            )).first()
            if model_row:
                vo.root_usd_path = model_row.root_usd_path

        # 完整资产树（根节点列表，含 children），供前端左侧结构树渲染
        # 局部导入避免与 FactoryAssetNodeService 的潜在循环依赖
        from service.FactoryAssetNodeService import FactoryAssetNodeService
        vo.factory_asset_node_vo = await FactoryAssetNodeService().get_factory_tree_with_detail(project_id, db)

        return vo

    async def query_factory_projects(
            self,
            query: FactoryProjectQueryDto,
            db: AsyncSession,
    ) -> Page[FactoryProjectVo]:
        try:
            stmt = select(FactoryProject)
            count_stmt = select(func.count()).select_from(FactoryProject)
            # 软删除：列表默认排除已删除行
            conditions = [FactoryProject.is_deleted == False]

            if query.factory_id is not None:
                conditions.append(FactoryProject.factory_id == query.factory_id)

            if query.project_name:
                conditions.append(FactoryProject.project_name.ilike(f"%{query.project_name}%"))

            if query.status is not None:
                conditions.append(FactoryProject.status == query.status.value)

            if query.owner_id:
                conditions.append(FactoryProject.owner_id == query.owner_id)

            if conditions:
                stmt = stmt.where(and_(*conditions))
                count_stmt = count_stmt.where(and_(*conditions))

            stmt = stmt.order_by(FactoryProject.created_at.desc())
            total = (await db.execute(count_stmt)).scalar_one()

            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [FactoryProjectVo.model_validate(r) for r in result.scalars().all()]
            total_pages = math.ceil(total / query.pageSize) if query.pageSize > 0 else 0
            return Page(
                items=items,
                total=total,
                current=query.current,
                pageSize=query.pageSize,
                totalPages=total_pages,
            )
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in query_factory_projects]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询工厂项目失败: {e}")

    async def list_factories_with_version(self, db: AsyncSession) -> list[dict]:
        """列出所有 master 工厂（md_factory, plan_id IS NULL）+ 其最新项目/当前版本信息，
        供前端"新建工厂项目"下拉选择已有工厂（选中后为该工厂创建新项目，走场景A）。"""
        try:
            result = await db.execute(
                select(BaseFactory)
                .where(BaseFactory.plan_id.is_(None))
                .order_by(BaseFactory.created_at.desc())
            )
            factories = result.scalars().all()
            items: list[dict] = []
            for f in factories:
                latest_proj = (await db.execute(
                    select(FactoryProject)
                    .where(FactoryProject.factory_id == f.factory_id)
                    .order_by(FactoryProject.created_at.desc())
                    .limit(1)
                )).scalar_one_or_none()
                project_name = ""
                version_number = 1
                if latest_proj is not None:
                    project_name = latest_proj.project_name or ""
                    cur_ver = (await db.execute(
                        select(FactoryProjectVersion).where(
                            and_(
                                FactoryProjectVersion.project_id == latest_proj.project_id,
                                FactoryProjectVersion.is_current == True,
                            )
                        )
                    )).scalar_one_or_none()
                    if cur_ver is not None:
                        version_number = cur_ver.version_number
                items.append({
                    "factoryId": str(f.factory_id),
                    "factoryName": f.factory_name or "",
                    "projectName": project_name,
                    "projectCode": "",
                    "versionNumber": version_number,
                    "location": f.location or "",
                    "siteLength": float(f.site_length) if f.site_length is not None else 0,
                    "siteWidth": float(f.site_width) if f.site_width is not None else 0,
                    "description": "",
                })
            return items
        except Exception as e:
            logger.error(f"[Error in list_factories_with_version]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询已有工厂失败: {e}")

    async def copy_factory_project(
        self,
        source_project_id: str,
        db: AsyncSession,
    ) -> dict:
        """
        复制工厂项目（完整深拷贝，生成新版本）：
          1. 加载源项目 + 其当前版本（version_number=N），新版本号 = N+1
          2. 新建项目记录（状态重置 DRAFT）+ 新建项目版本记录（is_current=True）
          3. BFS 递归复制资产树：每个节点的 FactoryAssetNode + 详情记录(STAGE/LINE/EQUIPMENT)
             + factory_asset_3d_model 全部重新插入，新节点带新 version_id（NOT NULL）
          4. 3D 模型 root_usd_path 原样复制（本地存储共用同一份 USD 文件，不做物理复制/重命名）
          仅复制未软删除（is_deleted == False）的节点与详情。
        """
        # 1. 加载源项目
        src = await self._get_or_raise(source_project_id, db)

        # 找源项目当前版本，确定版本号基线
        old_version_number = 0
        src_version = None
        if src.current_version_id:
            src_version = (await db.execute(
                select(FactoryProjectVersion).where(
                    FactoryProjectVersion.version_id == src.current_version_id
                )
            )).scalar_one_or_none()
        if src_version is None:
            src_version = (await db.execute(
                select(FactoryProjectVersion)
                .where(FactoryProjectVersion.project_id == source_project_id)
                .order_by(FactoryProjectVersion.version_number.desc())
                .limit(1)
            )).scalar_one_or_none()
        if src_version is not None and src_version.version_number:
            old_version_number = src_version.version_number
        new_version_number = old_version_number + 1 if old_version_number > 0 else 1

        try:
            # 2. 创建新项目记录（状态重置 DRAFT，缩略图不复制）
            new_project = FactoryProject(
                factory_id=src.factory_id,
                project_name=f"{src.project_name}_V{new_version_number}",
                status=ProjectStatus.DRAFT.value,
                owner_id=src.owner_id,
                description=src.description,
                version_count=1,
            )
            db.add(new_project)
            await db.flush()
            new_project_id = new_project.project_id

            # 新建项目版本（is_current=True），供 factory_asset_node.version_id 引用
            new_version = FactoryProjectVersion(
                project_id=new_project_id,
                version_number=new_version_number,
                version_name=f"V{new_version_number}",
                remark=f"复制自项目 {source_project_id}（V{old_version_number}）",
                version_status="DRAFT",
                is_current=True,
                base_version_id=src_version.version_id if src_version else None,
                created_by=src.owner_id,
            )
            db.add(new_version)
            await db.flush()
            new_version_id = new_version.version_id
            new_project.current_version_id = new_version_id
            logger.info(
                f"[CopyProject] 新项目已创建: id={new_project_id}, version_id={new_version_id}, "
                f"version_number={new_version_number}"
            )

            # 3. 加载源项目所有未删除节点
            nodes_result = await db.execute(
                select(FactoryAssetNode).where(
                    FactoryAssetNode.factory_projects_id == source_project_id,
                    FactoryAssetNode.is_deleted == False,
                ).order_by(FactoryAssetNode.created_at.asc())
            )
            all_nodes: List[FactoryAssetNode] = list(nodes_result.scalars().all())

            # 4. 批量预加载源节点的所有 3D 模型记录（排除已软删除）
            src_node_ids = [n.id for n in all_nodes]
            models_3d_map: Dict[str, List[FactoryAsset3dModel]] = {}
            if src_node_ids:
                models_result = await db.execute(
                    select(FactoryAsset3dModel).where(
                        FactoryAsset3dModel.factory_asset_id.in_(src_node_ids),
                        FactoryAsset3dModel.is_deleted == False,
                    )
                )
                for m in models_result.scalars().all():
                    models_3d_map.setdefault(m.factory_asset_id, []).append(m)
            has_3d_models = bool(models_3d_map)

            # 5. BFS 复制节点，维护 old_id → new_id 映射（保证父先于子）
            old_to_new: Dict[str, str] = {}
            queue = [n for n in all_nodes if n.parent_id is None]
            # 若存在 parent_id 指向不在集合内（如已被删父）的节点，也作为根处理
            node_id_set = set(src_node_ids)
            queue.extend([n for n in all_nodes if n.parent_id is not None and n.parent_id not in node_id_set])

            while queue:
                src_node = queue.pop(0)
                new_parent_id = old_to_new.get(src_node.parent_id) if src_node.parent_id else None

                new_node = FactoryAssetNode(
                    factory_projects_id=new_project_id,
                    version_id=new_version_id,
                    name=src_node.name,
                    code=src_node.code,
                    type=src_node.type,
                    parent_id=new_parent_id,
                    description=src_node.description,
                    bind_status=src_node.bind_status,
                )
                db.add(new_node)
                await db.flush()
                old_to_new[src_node.id] = new_node.id

                # 复制节点类型详情记录（STAGE/LINE/EQUIPMENT）
                await self._copy_node_details(src_node, new_node.id, db)

                # 复制 3D 模型记录（root_usd_path 原样保留）
                if has_3d_models:
                    await self._copy_3d_models(models_3d_map.get(src_node.id, []), new_node.id, db)

                # 将直接子节点入队
                children = [n for n in all_nodes if n.parent_id == src_node.id]
                queue.extend(children)

            logger.info(
                f"[CopyProject] 节点复制完成: 源项目={source_project_id}, "
                f"新项目={new_project_id}, 共 {len(all_nodes)} 个节点"
            )
            await db.commit()
            return {
                "newProjectId": str(new_project_id),
                "newVersionId": str(new_version_id),
                "newVersionNumber": new_version_number,
                "copiedNodes": len(all_nodes),
                "has3dModels": has_3d_models,
            }

        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[CopyProject] 异常: {e}", exc_info=True)
            raise BusinessException(ErrorCode.SYSTEM_ERROR, extra_msg=f"复制工厂项目失败: {e}")

    async def _copy_node_details(
        self,
        src_node: FactoryAssetNode,
        new_node_id: str,
        db: AsyncSession,
    ) -> None:
        """按节点类型复制对应详情记录（STAGE/LINE/EQUIPMENT），仅复制未删除记录。"""
        if src_node.type == InstanceAssetType.STAGE.value:
            result = await db.execute(
                select(FactoryProcessDetails).where(
                    FactoryProcessDetails.factory_asset_id == src_node.id,
                    FactoryProcessDetails.is_deleted == False,
                )
            )
            for pd in result.scalars().all():
                db.add(FactoryProcessDetails(
                    factory_asset_id=new_node_id,
                    ref_id=pd.ref_id,
                    total_capacity=pd.total_capacity,
                    extra_metadata=pd.extra_metadata,
                    description=pd.description,
                ))
            await db.flush()

        elif src_node.type == InstanceAssetType.LINE.value:
            result = await db.execute(
                select(FactoryLineDetails).where(
                    FactoryLineDetails.factory_asset_id == src_node.id,
                    FactoryLineDetails.is_deleted == False,
                )
            )
            for ld in result.scalars().all():
                db.add(FactoryLineDetails(
                    factory_asset_id=new_node_id,
                    ref_id=ld.ref_id,
                    capacity_per_day=ld.capacity_per_day,
                    extra_metadata=ld.extra_metadata,
                ))
            await db.flush()

        elif src_node.type == InstanceAssetType.EQUIPMENT.value:
            result = await db.execute(
                select(FactoryEquipmentDetails).where(
                    FactoryEquipmentDetails.factory_asset_id == src_node.id,
                    FactoryEquipmentDetails.is_deleted == False,
                )
            )
            for ed in result.scalars().all():
                db.add(FactoryEquipmentDetails(
                    factory_asset_id=new_node_id,
                    ref_id=ed.ref_id,
                    specifications=ed.specifications,
                    installation_date=ed.installation_date,
                    position_data=ed.position_data,
                    rotation_data=ed.rotation_data,
                    extra_metadata=ed.extra_metadata,
                    description=ed.description,
                ))
            await db.flush()

    async def _copy_3d_models(
        self,
        src_models: List[FactoryAsset3dModel],
        new_node_id: str,
        db: AsyncSession,
    ) -> None:
        """复制节点的 3D 模型记录到新节点。root_usd_path/usd_name 原样复制（共用同一存储文件）。"""
        for m in src_models:
            db.add(FactoryAsset3dModel(
                factory_asset_id=new_node_id,
                usd_name=m.usd_name,
                usd_id=m.usd_id,
                root_usd_path=m.root_usd_path,
                bucket_name=m.bucket_name,
                prim_path=m.prim_path,
                location_path=m.location_path,
                thumbnail_path=m.thumbnail_path,
            ))
        if src_models:
            await db.flush()

    async def validate_factory_project(
        self, project_id: str, db: AsyncSession
    ) -> ValidationReportVo:
        """
        对工厂项目执行全量校验，生成校验报告：
        校验维度：
          1. 绑定状态：所有 STAGE / LINE / EQUIPMENT 节点必须处于 BOUND 状态
          2. 必填项：绑定实体（BaseStage / BaseProductionLine / BaseEquipment）的必填字段不可为空
          3. 字段格式：sequence > 0
        校验通过 → 项目状态升级为 active；否则保持当前状态（通常 draft）不变。

        适配说明（迁自 SOURCE）：
          - 源端 valid → PUBLISHED/COMPLETED；CURRENT ProjectStatus 仅 active/inactive/archived/draft，
            故 valid → ACTIVE，invalid → 维持当前状态（与 ValidationReportVo.final_status 描述一致）。
          - 源端设备含 standard_ct 格式校验；CURRENT standard_ct 已迁出 md_equipment（位于
            md_equipment_process_parameters），不在 BaseEquipment 实体上，故此格式校验已移除。
        """
        try:
            project = await self._get_or_raise(project_id, db)

            # 获取所有未删除节点
            nodes_query = select(FactoryAssetNode).where(
                FactoryAssetNode.factory_projects_id == project_id,
                FactoryAssetNode.is_deleted == False,
            )
            nodes: List[FactoryAssetNode] = list(
                (await db.execute(nodes_query)).scalars().all()
            )

            # 过滤掉 FACTORY 根节点（不参与直接绑定校验）
            non_root_nodes = [n for n in nodes if n.type != InstanceAssetType.FACTORY.value]
            node_ids = [n.id for n in non_root_nodes]

            # 批量加载详情表（排除已软删除）
            if node_ids:
                process_details_map = {
                    r.factory_asset_id: r
                    for r in (await db.execute(
                        select(FactoryProcessDetails)
                        .where(FactoryProcessDetails.factory_asset_id.in_(node_ids),
                               FactoryProcessDetails.is_deleted == False)
                    )).scalars().all()
                }
                line_details_map = {
                    r.factory_asset_id: r
                    for r in (await db.execute(
                        select(FactoryLineDetails)
                        .where(FactoryLineDetails.factory_asset_id.in_(node_ids),
                               FactoryLineDetails.is_deleted == False)
                    )).scalars().all()
                }
                equipment_details_map = {
                    r.factory_asset_id: r
                    for r in (await db.execute(
                        select(FactoryEquipmentDetails)
                        .where(FactoryEquipmentDetails.factory_asset_id.in_(node_ids),
                               FactoryEquipmentDetails.is_deleted == False)
                    )).scalars().all()
                }
            else:
                process_details_map = {}
                line_details_map = {}
                equipment_details_map = {}

            # 批量加载业务实体
            stage_ref_ids = [
                pd.ref_id for pd in process_details_map.values() if pd.ref_id
            ]
            line_ref_ids = [
                ld.ref_id for ld in line_details_map.values() if ld.ref_id
            ]
            equip_ref_ids = [
                ed.ref_id for ed in equipment_details_map.values() if ed.ref_id
            ]

            stage_entity_map = {}
            if stage_ref_ids:
                for s in (await db.execute(
                    select(BaseStage).where(BaseStage.stage_id.in_(stage_ref_ids))
                )).scalars().all():
                    stage_entity_map[s.stage_id] = s

            line_entity_map = {}
            if line_ref_ids:
                for ln in (await db.execute(
                    select(BaseProductionLine).where(BaseProductionLine.line_id.in_(line_ref_ids))
                )).scalars().all():
                    line_entity_map[ln.line_id] = ln

            equip_entity_map = {}
            if equip_ref_ids:
                for eq in (await db.execute(
                    select(BaseEquipment).where(BaseEquipment.equipment_id.in_(equip_ref_ids))
                )).scalars().all():
                    equip_entity_map[eq.equipment_id] = eq

            # 逐节点校验
            issues: List[NodeIssueVo] = []
            stats = {
                BindStatus.BOUND.value: 0,
                BindStatus.UNBOUND.value: 0,
                BindStatus.BIND_FAILED.value: 0,
                BindStatus.PARTIALLY_BOUND.value: 0,
            }
            field_error_node_ids: set = set()

            for node in non_root_nodes:
                node_issues: List[NodeIssueVo] = []
                bs = node.bind_status

                # ①  绑定状态校验
                stats[bs] = stats.get(bs, 0) + 1

                if bs == BindStatus.UNBOUND.value:
                    node_issues.append(NodeIssueVo(
                        node_id=str(node.id),
                        node_name=node.name,
                        node_type=node.type,
                        bind_status=bs,
                        issue_type="UNBOUND",
                        message="节点尚未绑定，请先完成绑定操作",
                    ))
                elif bs == BindStatus.BIND_FAILED.value:
                    node_issues.append(NodeIssueVo(
                        node_id=str(node.id),
                        node_name=node.name,
                        node_type=node.type,
                        bind_status=bs,
                        issue_type="BIND_FAILED",
                        message="节点绑定失败：name/code 与业务实体不匹配，请重新绑定",
                    ))
                elif bs == BindStatus.PARTIALLY_BOUND.value:
                    node_issues.append(NodeIssueVo(
                        node_id=str(node.id),
                        node_name=node.name,
                        node_type=node.type,
                        bind_status=bs,
                        issue_type="PARTIALLY_BOUND",
                        message="该节点下存在未绑定完成的子节点，请完成所有子节点绑定",
                    ))

                # 已绑定节点：校验必填项 & 字段格式
                if bs == BindStatus.BOUND.value:
                    if node.type == InstanceAssetType.STAGE.value:
                        pd = process_details_map.get(node.id)
                        if not pd or not pd.ref_id:
                            node_issues.append(NodeIssueVo(
                                node_id=str(node.id), node_name=node.name,
                                node_type=node.type, bind_status=bs,
                                issue_type="MISSING_REQUIRED_FIELD", field="ref_id",
                                message="STAGE 节点 bind_status=BOUND 但 process_details.ref_id 为空",
                            ))
                        else:
                            stage = stage_entity_map.get(pd.ref_id)
                            if not stage:
                                node_issues.append(NodeIssueVo(
                                    node_id=str(node.id), node_name=node.name,
                                    node_type=node.type, bind_status=bs,
                                    issue_type="MISSING_REQUIRED_FIELD", field="ref_id",
                                    message=f"关联制程记录已删除或不存在：ref_id={pd.ref_id}",
                                ))
                            else:
                                node_issues.extend(
                                    self._validate_stage_fields(node, stage)
                                )

                    elif node.type == InstanceAssetType.LINE.value:
                        ld = line_details_map.get(node.id)
                        if not ld or not ld.ref_id:
                            node_issues.append(NodeIssueVo(
                                node_id=str(node.id), node_name=node.name,
                                node_type=node.type, bind_status=bs,
                                issue_type="MISSING_REQUIRED_FIELD", field="ref_id",
                                message="LINE 节点 bind_status=BOUND 但 line_details.ref_id 为空",
                            ))
                        else:
                            line = line_entity_map.get(ld.ref_id)
                            if not line:
                                node_issues.append(NodeIssueVo(
                                    node_id=str(node.id), node_name=node.name,
                                    node_type=node.type, bind_status=bs,
                                    issue_type="MISSING_REQUIRED_FIELD", field="ref_id",
                                    message=f"关联线体记录已删除或不存在：ref_id={ld.ref_id}",
                                ))
                            else:
                                node_issues.extend(
                                    self._validate_line_fields(node, line)
                                )

                    elif node.type == InstanceAssetType.EQUIPMENT.value:
                        ed = equipment_details_map.get(node.id)
                        if not ed or not ed.ref_id:
                            node_issues.append(NodeIssueVo(
                                node_id=str(node.id), node_name=node.name,
                                node_type=node.type, bind_status=bs,
                                issue_type="MISSING_REQUIRED_FIELD", field="ref_id",
                                message="EQUIPMENT 节点 bind_status=BOUND 但 equipment_details.ref_id 为空",
                            ))
                        else:
                            equip = equip_entity_map.get(ed.ref_id)
                            if not equip:
                                node_issues.append(NodeIssueVo(
                                    node_id=str(node.id), node_name=node.name,
                                    node_type=node.type, bind_status=bs,
                                    issue_type="MISSING_REQUIRED_FIELD", field="ref_id",
                                    message=f"关联设备记录已删除或不存在：ref_id={ed.ref_id}",
                                ))
                            else:
                                node_issues.extend(
                                    self._validate_equipment_fields(node, equip)
                                )

                # 记录字段级问题的节点 ID
                for issue in node_issues:
                    if issue.issue_type in ("MISSING_REQUIRED_FIELD", "INVALID_FORMAT"):
                        field_error_node_ids.add(node.id)
                issues.extend(node_issues)

            # 汇总
            summary = ValidationSummaryVo(
                total_nodes=len(non_root_nodes),
                bound_count=stats.get(BindStatus.BOUND.value, 0),
                unbound_count=stats.get(BindStatus.UNBOUND.value, 0),
                bind_failed_count=stats.get(BindStatus.BIND_FAILED.value, 0),
                partially_bound_count=stats.get(BindStatus.PARTIALLY_BOUND.value, 0),
                field_error_count=len(field_error_node_ids),
            )

            is_valid = len(issues) == 0

            # 解析当前版本信息（CURRENT 启用版本管理，填充 version_id/version_number）
            version_id = None
            version_number = None
            if project.current_version_id:
                cur_ver = (await db.execute(
                    select(FactoryProjectVersion).where(
                        FactoryProjectVersion.version_id == project.current_version_id
                    )
                )).scalar_one_or_none()
                if cur_ver is not None:
                    version_id = str(cur_ver.version_id)
                    version_number = cur_ver.version_number

            # 状态流转（适配 CURRENT 状态机）：
            #   valid → ACTIVE（源端为 PUBLISHED/COMPLETED，CURRENT 无此状态，落到 active）
            #   invalid → 维持当前状态不变
            if is_valid:
                project.status = ProjectStatus.ACTIVE.value
                await db.commit()
                final_status = ProjectStatus.ACTIVE.value
                logger.info(
                    f"项目校验通过: project_id={project_id}, "
                    f"节点总数={len(non_root_nodes)}, 已提升为 active"
                )
            else:
                final_status = project.status or ProjectStatus.DRAFT.value
                logger.info(
                    f"项目校验未通过: project_id={project_id}, "
                    f"问题数={len(issues)}, 维持 {final_status} 状态"
                )

            return ValidationReportVo(
                project_id=str(project_id),
                project_name=project.project_name,
                version_id=version_id,
                version_number=version_number,
                validated_at=datetime.now(timezone.utc),
                is_valid=is_valid,
                final_status=final_status,
                summary=summary,
                issues=issues,
            )

        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in validate_factory_project {project_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"校验工厂项目失败: {e}")

    # 字段级校验私有方法
    @staticmethod
    def _validate_stage_fields(node: FactoryAssetNode, stage: BaseStage) -> List[NodeIssueVo]:
        """校验 BaseStage 必填项与格式"""
        issues = []
        nid, nname, ntype, bs = str(node.id), node.name, node.type, node.bind_status

        if not stage.stage_code or not stage.stage_code.strip():
            issues.append(NodeIssueVo(
                node_id=nid, node_name=nname, node_type=ntype, bind_status=bs,
                issue_type="MISSING_REQUIRED_FIELD", field="stage_code",
                message="制程编码（stage_code）不能为空",
            ))
        if not stage.stage_name or not stage.stage_name.strip():
            issues.append(NodeIssueVo(
                node_id=nid, node_name=nname, node_type=ntype, bind_status=bs,
                issue_type="MISSING_REQUIRED_FIELD", field="stage_name",
                message="制程名称（stage_name）不能为空",
            ))
        if stage.sequence is None:
            issues.append(NodeIssueVo(
                node_id=nid, node_name=nname, node_type=ntype, bind_status=bs,
                issue_type="MISSING_REQUIRED_FIELD", field="sequence",
                message="制程顺序（sequence）不能为空",
            ))
        elif stage.sequence <= 0:
            issues.append(NodeIssueVo(
                node_id=nid, node_name=nname, node_type=ntype, bind_status=bs,
                issue_type="INVALID_FORMAT", field="sequence",
                message=f"制程顺序（sequence）必须大于 0，当前值: {stage.sequence}",
            ))
        return issues

    @staticmethod
    def _validate_line_fields(node: FactoryAssetNode, line: BaseProductionLine) -> List[NodeIssueVo]:
        """校验 BaseProductionLine 必填项与格式"""
        issues = []
        nid, nname, ntype, bs = str(node.id), node.name, node.type, node.bind_status

        if not line.line_code or not line.line_code.strip():
            issues.append(NodeIssueVo(
                node_id=nid, node_name=nname, node_type=ntype, bind_status=bs,
                issue_type="MISSING_REQUIRED_FIELD", field="line_code",
                message="线体编码（line_code）不能为空",
            ))
        if not line.line_name or not line.line_name.strip():
            issues.append(NodeIssueVo(
                node_id=nid, node_name=nname, node_type=ntype, bind_status=bs,
                issue_type="MISSING_REQUIRED_FIELD", field="line_name",
                message="线体名称（line_name）不能为空",
            ))
        if not line.stage_id:
            issues.append(NodeIssueVo(
                node_id=nid, node_name=nname, node_type=ntype, bind_status=bs,
                issue_type="MISSING_REQUIRED_FIELD", field="stage_id",
                message="线体所属制程 ID（stage_id）不能为空",
            ))
        return issues

    @staticmethod
    def _validate_equipment_fields(node: FactoryAssetNode, equip: BaseEquipment) -> List[NodeIssueVo]:
        """校验 BaseEquipment 必填项与格式。

        注：源端含 standard_ct 格式校验；CURRENT standard_ct 已迁出 md_equipment
        （位于 md_equipment_process_parameters 1:1 扩展表），不在本实体上，故移除该校验。
        """
        issues = []
        nid, nname, ntype, bs = str(node.id), node.name, node.type, node.bind_status

        if not equip.equipment_code or not equip.equipment_code.strip():
            issues.append(NodeIssueVo(
                node_id=nid, node_name=nname, node_type=ntype, bind_status=bs,
                issue_type="MISSING_REQUIRED_FIELD", field="equipment_code",
                message="设备编码（equipment_code）不能为空",
            ))
        if not equip.equipment_name or not equip.equipment_name.strip():
            issues.append(NodeIssueVo(
                node_id=nid, node_name=nname, node_type=ntype, bind_status=bs,
                issue_type="MISSING_REQUIRED_FIELD", field="equipment_name",
                message="设备名称（equipment_name）不能为空",
            ))
        if not equip.equipment_type or not equip.equipment_type.strip():
            issues.append(NodeIssueVo(
                node_id=nid, node_name=nname, node_type=ntype, bind_status=bs,
                issue_type="MISSING_REQUIRED_FIELD", field="equipment_type",
                message="设备类型（equipment_type）不能为空",
            ))
        if not equip.operation_id:
            issues.append(NodeIssueVo(
                node_id=nid, node_name=nname, node_type=ntype, bind_status=bs,
                issue_type="MISSING_REQUIRED_FIELD", field="operation_id",
                message="所属工序 ID（operation_id）不能为空",
            ))
        return issues

    async def get_factory_project_with_asset_tree(
        self,
        project_id: str,
        asset_tree: List,
        db: AsyncSession,
    ):
        """返回工厂项目基础信息 + 资产树形结构（asset_tree 由调用方从
        FactoryAssetNodeService.get_factory_tree 传入，避免重复树构建逻辑）。"""
        from models.vo.FactoryProjectVo import FactoryProjectAndAssetVo
        entity = await self._get_or_raise(project_id, db)
        vo = FactoryProjectAndAssetVo.model_validate(entity)
        vo.asset_tree = asset_tree
        return vo

    # ──────────────── 私有辅助方法 ────────────────

    async def _get_latest_version_for_factory(
        self,
        factory_id: int,
        db: AsyncSession,
    ) -> FactoryProjectVersion | None:
        """
        查询某工厂下最新项目的当前版本。
        逻辑：factory_projects.factory_id → 找最新项目 → 找该项目 is_current=TRUE 的版本
        """
        # 找该工厂下最新的项目（排除软删除，避免基于已删项目复制）
        latest_project_result = await db.execute(
            select(FactoryProject)
            .where(FactoryProject.factory_id == factory_id,
                   FactoryProject.is_deleted == False)
            .order_by(FactoryProject.created_at.desc())
            .limit(1)
        )
        latest_project = latest_project_result.scalar_one_or_none()
        if latest_project is None:
            return None

        # 找该项目的当前版本
        current_version_result = await db.execute(
            select(FactoryProjectVersion)
            .where(
                and_(
                    FactoryProjectVersion.project_id == latest_project.project_id,
                    FactoryProjectVersion.is_current == True,
                )
            )
        )
        return current_version_result.scalar_one_or_none()

    async def _copy_asset_tree(
        self,
        source_version_id: int,
        target_version_id: int,
        target_project_id: int,
        db: AsyncSession,
    ) -> None:
        """复制源版本的所有资产节点到目标版本，保持树形结构（parent_id 映射）。"""
        source_result = await db.execute(
            select(FactoryAssetNode)
            .where(FactoryAssetNode.version_id == source_version_id,
                   FactoryAssetNode.is_deleted == False)
        )
        source_nodes = list(source_result.scalars().all())

        if not source_nodes:
            return

        id_mapping: dict[int, int] = {}

        # 第一遍：创建所有节点（parent_id 暂时为 None）+ 复制各自的详情/3D 模型
        for node in source_nodes:
            new_node = FactoryAssetNode(
                factory_projects_id=target_project_id,
                version_id=target_version_id,
                name=node.name,
                code=node.code,
                type=node.type,
                parent_id=None,
                bind_status=node.bind_status,
                description=node.description,
            )
            db.add(new_node)
            await db.flush()
            id_mapping[node.id] = new_node.id
            # 复制详情（含 STAGE 的 process_details.ref_id，否则复制出的项目制程会丢绑定）
            await self._copy_node_details(node, new_node.id, db)
            models = (await db.execute(
                select(FactoryAsset3dModel).where(
                    FactoryAsset3dModel.factory_asset_id == node.id,
                    FactoryAsset3dModel.is_deleted == False,
                )
            )).scalars().all()
            if models:
                await self._copy_3d_models(list(models), new_node.id, db)

        # 第二遍：更新 parent_id 映射
        for node in source_nodes:
            if node.parent_id is not None and node.parent_id in id_mapping:
                new_id = id_mapping[node.id]
                new_parent_id = id_mapping[node.parent_id]
                await db.execute(
                    update(FactoryAssetNode)
                    .where(FactoryAssetNode.id == new_id)
                    .values(parent_id=new_parent_id)
                )

        logger.info(f"复制资产树: source_v={source_version_id} → target_v={target_version_id}, nodes={len(source_nodes)}")

    async def _get_project_or_raise(self, project_id: int, db: AsyncSession) -> FactoryProject:
        result = await db.execute(
            select(FactoryProject).where(FactoryProject.project_id == project_id)
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"项目不存在: project_id={project_id}")
        return entity

    async def _get_version_or_raise(self, version_id: int, db: AsyncSession) -> FactoryProjectVersion:
        result = await db.execute(
            select(FactoryProjectVersion).where(FactoryProjectVersion.version_id == version_id)
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"版本不存在: version_id={version_id}")
        return entity

    async def _get_or_raise(self, project_id: int, db: AsyncSession) -> FactoryProject:
        result = await db.execute(
            select(FactoryProject).where(
                FactoryProject.project_id == project_id,
                FactoryProject.is_deleted == False,
            )
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg=f"工厂项目不存在: project_id={project_id}",
            )
        return entity
