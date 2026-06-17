import math
import logging
from typing import Optional

from sqlalchemy import select, func, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.FactoryProjectVersionDto import (
    FactoryProjectVersionCreateDto,
    FactoryProjectVersionPublishDto,
    FactoryProjectVersionArchiveDto,
    FactoryProjectVersionSwitchDto,
    FactoryProjectVersionUpdateDto,
    FactoryProjectVersionDeleteDto,
    FactoryProjectVersionQueryDto,
    VersionStatusEnum,
)
from models.entity.FactoryProjectVersionEntity import FactoryProjectVersion
from models.entity.FactoryProjectEntity import FactoryProject
from models.entity.FactoryAssetNodeEntity import FactoryAssetNode
from models.vo.FactoryProjectVersionVo import FactoryProjectVersionVo

init_logging()
logger = logging.getLogger(__name__)


class FactoryProjectVersionService:
    """
    项目版本管理业务服务
    核心功能：创建版本、发布版本、归档版本、切换当前版本、版本查询
    版本生命周期：DRAFT → PUBLISHED → ARCHIVED
    """

    async def create_version(
        self,
        dto: FactoryProjectVersionCreateDto,
        db: AsyncSession,
    ) -> FactoryProjectVersionVo:
        """
        创建项目新版本。
        - 如果不传 base_version_id，则基于当前版本（is_current=TRUE）派生
        - 如果传 base_version_id，则从指定版本派生
        - 新版本状态为 DRAFT，并自动设为 is_current=TRUE（原当前版本取消标记）
        - 复制基线版本的资产树到新版本
        """
        try:
            project = await self._get_project_or_raise(dto.project_id, db)

            # 确定基线版本
            if dto.base_version_id:
                base_version = await self._get_version_or_raise(dto.base_version_id, db)
                if base_version.project_id != dto.project_id:
                    raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="基线版本不属于该项目")
            else:
                base_version = await self._get_current_version(dto.project_id, db)
                if base_version is None:
                    raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="该项目尚无版本，请先创建项目")

            # 计算新版本号
            max_ver_result = await db.execute(
                select(func.max(FactoryProjectVersion.version_number))
                .where(FactoryProjectVersion.project_id == dto.project_id)
            )
            max_ver = max_ver_result.scalar_one_or_none() or 0
            new_version_number = max_ver + 1

            # 取消原当前版本标记
            await db.execute(
                update(FactoryProjectVersion)
                .where(
                    and_(
                        FactoryProjectVersion.project_id == dto.project_id,
                        FactoryProjectVersion.is_current == True,
                    )
                )
                .values(is_current=False)
            )

            # 创建新版本
            new_version = FactoryProjectVersion(
                project_id=dto.project_id,
                version_number=new_version_number,
                version_name=dto.version_name or f"V{new_version_number}",
                remark=dto.remark,
                version_status=VersionStatusEnum.DRAFT,
                is_current=True,
                base_version_id=base_version.version_id if base_version else None,
                created_by=dto.created_by,
            )
            db.add(new_version)
            await db.flush()

            # 复制基线版本的资产树
            if base_version:
                await self._copy_asset_tree(
                    source_version_id=base_version.version_id,
                    target_version_id=new_version.version_id,
                    target_project_id=dto.project_id,
                    db=db,
                )

            # 更新项目冗余字段
            project.current_version_id = new_version.version_id
            project.version_count = (project.version_count or 0) + 1

            await db.commit()
            await db.refresh(new_version)

            logger.info(f"创建项目版本: project_id={dto.project_id}, version={new_version_number}")
            return FactoryProjectVersionVo.model_validate(new_version)

        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create_version]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建版本失败: {e}")

    async def publish_version(
        self,
        dto: FactoryProjectVersionPublishDto,
        db: AsyncSession,
    ) -> FactoryProjectVersionVo:
        """
        发布版本：DRAFT → PUBLISHED
        发布后自动创建新的 DRAFT 版本（基于发布版本），保持可编辑状态
        """
        try:
            version = await self._get_version_or_raise(dto.version_id, db)

            if version.version_status != VersionStatusEnum.DRAFT:
                raise BusinessException(
                    ErrorCode.PARAMS_ERROR,
                    extra_msg=f"只有 DRAFT 状态的版本才能发布，当前状态: {version.version_status}",
                )

            # 发布
            from datetime import datetime, timezone
            version.version_status = VersionStatusEnum.PUBLISHED
            version.published_by = dto.published_by
            version.published_at = datetime.now(timezone.utc)
            version.is_current = False

            # 自动创建新的 DRAFT 版本
            max_ver_result = await db.execute(
                select(func.max(FactoryProjectVersion.version_number))
                .where(FactoryProjectVersion.project_id == version.project_id)
            )
            max_ver = max_ver_result.scalar_one_or_none() or 0
            new_version_number = max_ver + 1

            new_version = FactoryProjectVersion(
                project_id=version.project_id,
                version_number=new_version_number,
                version_name=f"V{new_version_number}",
                remark=f"基于 V{version.version_number} 发布后自动创建",
                version_status=VersionStatusEnum.DRAFT,
                is_current=True,
                base_version_id=version.version_id,
                created_by=dto.published_by,
            )
            db.add(new_version)
            await db.flush()

            # 复制资产树到新版本
            await self._copy_asset_tree(
                source_version_id=version.version_id,
                target_version_id=new_version.version_id,
                target_project_id=version.project_id,
                db=db,
            )

            # 更新项目冗余字段
            project_result = await db.execute(
                select(FactoryProject).where(FactoryProject.project_id == version.project_id)
            )
            project = project_result.scalar_one_or_none()
            if project:
                project.current_version_id = new_version.version_id
                project.version_count = (project.version_count or 0) + 1

            await db.commit()
            await db.refresh(version)

            logger.info(f"发布版本: version_id={dto.version_id}, auto_created_v{new_version_number}")
            return FactoryProjectVersionVo.model_validate(version)

        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in publish_version]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"发布版本失败: {e}")

    async def archive_version(
        self,
        dto: FactoryProjectVersionArchiveDto,
        db: AsyncSession,
    ) -> FactoryProjectVersionVo:
        """归档版本：PUBLISHED → ARCHIVED"""
        try:
            version = await self._get_version_or_raise(dto.version_id, db)

            if version.version_status != VersionStatusEnum.PUBLISHED:
                raise BusinessException(
                    ErrorCode.PARAMS_ERROR,
                    extra_msg=f"只有 PUBLISHED 状态的版本才能归档，当前状态: {version.version_status}",
                )

            if version.is_current:
                raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="当前编辑版本不能归档")
            version.version_status = VersionStatusEnum.ARCHIVED
            await db.commit()
            await db.refresh(version)

            logger.info(f"归档版本: version_id={dto.version_id}")
            return FactoryProjectVersionVo.model_validate(version)

        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in archive_version]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"归档版本失败: {e}")

    async def switch_current_version(
        self,
        dto: FactoryProjectVersionSwitchDto,
        db: AsyncSession,
    ) -> FactoryProjectVersionVo:
        """
        切换当前编辑版本。
        - 目标版本必须为 DRAFT 状态
        - 取消原 is_current=TRUE，设置新 is_current=TRUE
        """
        try:
            target_version = await self._get_version_or_raise(dto.version_id, db)

            if target_version.project_id != dto.project_id:
                raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="版本不属于该项目")

            if target_version.version_status != VersionStatusEnum.DRAFT:
                raise BusinessException(
                    ErrorCode.PARAMS_ERROR,
                    extra_msg=f"只能切换到 DRAFT 状态的版本，当前状态: {target_version.version_status}",
                )

            # 取消原当前版本标记
            await db.execute(
                update(FactoryProjectVersion)
                .where(
                    and_(
                        FactoryProjectVersion.project_id == dto.project_id,
                        FactoryProjectVersion.is_current == True,
                    )
                )
                .values(is_current=False)
            )

            # 设置新当前版本
            target_version.is_current = True

            # 更新项目冗余字段
            project_result = await db.execute(
                select(FactoryProject).where(FactoryProject.project_id == dto.project_id)
            )
            project = project_result.scalar_one_or_none()
            if project:
                project.current_version_id = target_version.version_id

            await db.commit()
            await db.refresh(target_version)

            logger.info(f"切换当前版本: project_id={dto.project_id}, version_id={dto.version_id}")
            return FactoryProjectVersionVo.model_validate(target_version)

        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in switch_current_version]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"切换版本失败: {e}")

    async def update_version(
        self,
        dto: FactoryProjectVersionUpdateDto,
        db: AsyncSession,
    ) -> FactoryProjectVersionVo:
        """更新版本名称/备注"""
        version = await self._get_version_or_raise(dto.version_id, db)

        try:
            if dto.version_name is not None:
                version.version_name = dto.version_name
            if dto.remark is not None:
                version.remark = dto.remark

            await db.commit()
            await db.refresh(version)

            return FactoryProjectVersionVo.model_validate(version)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update_version]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新版本失败: {e}")

    async def delete_version(
        self,
        dto: FactoryProjectVersionDeleteDto,
        db: AsyncSession,
    ) -> str:
        """
        删除版本。
        - 不允许删除当前编辑版本
        - 不允许删除项目最后一个版本
        """
        version = await self._get_version_or_raise(dto.version_id, db)

        if version.is_current:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="当前编辑版本不能删除，请先切换到其他版本")

        # 检查是否为最后一个版本
        count_result = await db.execute(
            select(func.count())
            .select_from(FactoryProjectVersion)
            .where(FactoryProjectVersion.project_id == version.project_id)
        )
        version_count = count_result.scalar_one()
        if version_count <= 1:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="项目至少保留一个版本")

        try:
            await db.delete(version)

            # 更新项目版本计数
            project_result = await db.execute(
                select(FactoryProject).where(FactoryProject.project_id == version.project_id)
            )
            project = project_result.scalar_one_or_none()
            if project:
                project.version_count = max(0, (project.version_count or 1) - 1)

            await db.commit()
            logger.info(f"删除版本: version_id={dto.version_id}")
            return str(dto.version_id)

        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete_version]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除版本失败: {e}")

    async def get_version_by_id(
        self,
        version_id: int,
        db: AsyncSession,
    ) -> FactoryProjectVersionVo:
        version = await self._get_version_or_raise(version_id, db)
        return FactoryProjectVersionVo.model_validate(version)

    async def query_versions(
        self,
        query: FactoryProjectVersionQueryDto,
        db: AsyncSession,
    ) -> Page[FactoryProjectVersionVo]:
        try:
            stmt = select(FactoryProjectVersion)
            count_stmt = select(func.count()).select_from(FactoryProjectVersion)
            conditions = []

            if query.project_id is not None:
                conditions.append(FactoryProjectVersion.project_id == query.project_id)

            if query.version_status:
                conditions.append(FactoryProjectVersion.version_status == query.version_status)

            if conditions:
                stmt = stmt.where(and_(*conditions))
                count_stmt = count_stmt.where(and_(*conditions))

            stmt = stmt.order_by(FactoryProjectVersion.version_number.desc())
            total = (await db.execute(count_stmt)).scalar_one()

            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [FactoryProjectVersionVo.model_validate(r) for r in result.scalars().all()]
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
            logger.error(f"[Error in query_versions]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询版本列表失败: {e}")

    async def _copy_asset_tree(
        self,
        source_version_id: int,
        target_version_id: int,
        target_project_id: int,
        db: AsyncSession,
    ) -> None:
        """
        复制源版本的所有资产节点到目标版本。
        保持树形结构（parent_id 映射）。
        """
        # 查询源版本所有节点
        source_result = await db.execute(
            select(FactoryAssetNode)
            .where(FactoryAssetNode.version_id == source_version_id)
        )
        source_nodes = list(source_result.scalars().all())

        if not source_nodes:
            return

        # 建立 旧ID → 新ID 的映射
        id_mapping: dict[int, int] = {}

        # 第一遍：创建所有节点（parent_id 暂时为 None）
        for node in source_nodes:
            new_node = FactoryAssetNode(
                factory_projects_id=target_project_id,
                version_id=target_version_id,
                name=node.name,
                code=node.code,
                type=node.type,
                parent_id=None,  # 第二遍更新
                thumbnail_path=node.thumbnail_path,
                description=node.description,
            )
            db.add(new_node)
            await db.flush()
            id_mapping[node.id] = new_node.id

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

    async def _get_current_version(self, project_id: int, db: AsyncSession) -> Optional[FactoryProjectVersion]:
        result = await db.execute(
            select(FactoryProjectVersion)
            .where(
                and_(
                    FactoryProjectVersion.project_id == project_id,
                    FactoryProjectVersion.is_current == True,
                )
            )
        )
        return result.scalar_one_or_none()
