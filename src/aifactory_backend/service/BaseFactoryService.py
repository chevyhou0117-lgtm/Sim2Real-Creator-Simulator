import math
import logging

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_
from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.BaseFactoryDto import (
    BaseFactoryCreateDto,
    BaseFactoryUpdateDto,
    BaseFactoryQueryDto,
)
from models.entity.BaseFactoryEntity import BaseFactory
from models.vo.BaseFactoryVo import BaseFactoryVo
from models.enums.BaseStatusEnum import BaseStatus

init_logging()
logger = logging.getLogger(__name__)


class BaseFactoryService:

    async def create_factory(
        self,
        dto: BaseFactoryCreateDto,
        db: AsyncSession,
    ) -> str:
        try:
            if dto is None:
                raise BusinessException(ErrorCode.PARAMS_ERROR, "请求参数不能为空")
            # 工厂编码必填校验（md_factory.factory_code NOT NULL）
            if not dto.factory_code:
                raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="工厂编码不能为空")
            # 工厂名称唯一性校验（仅校验主数据 plan_id IS NULL）
            stmt = select(BaseFactory).where(
                BaseFactory.factory_name == dto.factory_name,
                BaseFactory.plan_id.is_(None),
            )
            result = await db.execute(stmt)
            if result.scalar_one_or_none():
                raise BusinessException(ErrorCode.DB_ERROR, extra_msg="工厂名称已存在")
            # 工厂编码唯一性校验（仅校验主数据 plan_id IS NULL）
            stmt = select(BaseFactory).where(
                BaseFactory.factory_code == dto.factory_code,
                BaseFactory.plan_id.is_(None),
            )
            result = await db.execute(stmt)
            if result.scalar_one_or_none():
                raise BusinessException(ErrorCode.DB_ERROR, extra_msg="工厂编码已存在")
            create_data = dto.model_dump(exclude_unset=True)
            # 时区必填校验（md_factory.timezone NOT NULL），缺省为 Asia/Shanghai
            if not create_data.get("timezone"):
                create_data["timezone"] = "Asia/Shanghai"
            # 主数据：plan_id 显式置空
            create_data["plan_id"] = None
            entity = BaseFactory(**create_data)
            db.add(entity)
            await db.commit()
            await db.refresh(entity)
            return str(entity.factory_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create_factory]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建工厂失败: {e}")

    async def update_factory(
        self,
        factory_id: int,
        dto: BaseFactoryUpdateDto,
        db: AsyncSession,
    ) -> str:
        entity = await self._get_or_raise(factory_id, db)
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("factory_id", None)
        if not update_data:
            return str(factory_id)

        # factory_name 非空校验 + 唯一性校验（仅主数据 plan_id IS NULL，排除自身）
        if "factory_name" in update_data:
            name_val = (update_data["factory_name"] or "").strip()
            if not name_val:
                raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="工厂名称不能为空")
            conflict = await db.execute(
                select(BaseFactory).where(
                    BaseFactory.factory_name == name_val,
                    BaseFactory.factory_id != factory_id,
                    BaseFactory.plan_id.is_(None),
                )
            )
            if conflict.scalar_one_or_none() is not None:
                raise BusinessException(ErrorCode.DB_ERROR, extra_msg="工厂名称已存在")
            update_data["factory_name"] = name_val  # 写回去除空格版本

        # factory_code 非空校验 + 唯一性校验（仅主数据 plan_id IS NULL，排除自身）
        if "factory_code" in update_data:
            code_val = (update_data["factory_code"] or "").strip()
            if not code_val:
                raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="工厂编码不能为空")
            conflict = await db.execute(
                select(BaseFactory).where(
                    BaseFactory.factory_code == code_val,
                    BaseFactory.factory_id != factory_id,
                    BaseFactory.plan_id.is_(None),
                )
            )
            if conflict.scalar_one_or_none() is not None:
                raise BusinessException(ErrorCode.DB_ERROR, extra_msg="工厂编码已存在")
            update_data["factory_code"] = code_val  # 写回去除空格版本

        allowed_fields = {
            "factory_name",
            "factory_code",
            "site_length",
            "site_width",
            "location",
            "timezone",
            "status",
        }
        try:
            for field, value in update_data.items():
                if field in allowed_fields:
                    if field == "status" and isinstance(value, BaseStatus):
                        value = value.value
                    setattr(entity, field, value)
            await db.commit()
            return str(factory_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update_factory {factory_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新工厂失败: {e}")

    async def delete_factory(
        self,
        factory_id: int,
        db: AsyncSession,
    ) -> str:
        entity = await self._get_or_raise(factory_id, db)
        try:
            await db.delete(entity)
            await db.commit()
            return str(factory_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete_factory]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除工厂失败: {e}")

    async def get_factory_by_id(
        self,
        factory_id: int,
        db: AsyncSession,
    ) -> BaseFactoryVo:
        entity = await self._get_or_raise(factory_id, db)
        return BaseFactoryVo.model_validate(entity)

    async def query_factories(
            self,
            query: BaseFactoryQueryDto,
            db: AsyncSession,
    ) -> Page[BaseFactoryVo]:

        try:
            stmt = select(BaseFactory).where(BaseFactory.plan_id.is_(None))
            count_stmt = (
                select(func.count())
                .select_from(BaseFactory)
                .where(BaseFactory.plan_id.is_(None))
            )

            conditions = []

            if query.factory_name:
                conditions.append(BaseFactory.factory_name.ilike(f"%{query.factory_name}%"))

            if query.factory_code:
                conditions.append(BaseFactory.factory_code == query.factory_code)

            if query.status is not None:
                conditions.append(BaseFactory.status == query.status.value)


            if conditions:
                stmt = stmt.where(and_(*conditions))
                count_stmt = count_stmt.where(and_(*conditions))

            stmt = stmt.order_by(BaseFactory.created_at.desc())
            total = (await db.execute(count_stmt)).scalar_one()

            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [BaseFactoryVo.model_validate(r) for r in result.scalars().all()]
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
            logger.error(f"[Error in query_factories]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询工厂失败: {e}")

    async def _get_or_raise(
        self,
        factory_id: int,
        db: AsyncSession,
    ) -> BaseFactory:
        result = await db.execute(
            select(BaseFactory).where(
                BaseFactory.factory_id == factory_id,
                BaseFactory.plan_id.is_(None),
            )
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"工厂不存在: factory_id={factory_id}")
        return entity
