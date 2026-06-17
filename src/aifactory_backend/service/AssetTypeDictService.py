import logging
from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common.ErrorCode import ErrorCode
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.AssetTypeDictDto import AssetTypeDictCreateDto, AssetTypeDictUpdateDto
from models.entity.AssetTypeDictEntity import AssetTypeDict
from models.vo.AssetTypeDictVo import AssetTypeDictVo

init_logging()
logger = logging.getLogger(__name__)


class AssetTypeDictService:
    """
    资产类型字典业务服务
    负责 asset_type_dict 表的 CRUD 操作
    """

    async def create_type_dict(
            self,
            dto: AssetTypeDictCreateDto,
            db: AsyncSession,
    ) -> AssetTypeDictVo:
        """
        创建资产类型字典条目。
        - code 为主键，重复则报错
        """
        await self._check_code_not_exists(dto.code, db)
        try:
            entity = AssetTypeDict(code=dto.code, name=dto.name)
            db.add(entity)
            await db.commit()
            await db.refresh(entity)
            logger.info(f"创建资产类型字典成功: code={entity.code}, name={entity.name}")
            # 转换为 VO 对象返回
            return AssetTypeDictVo.model_validate(entity)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create_type_dict]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建资产类型字典失败: {e}")

    async def list_type_dicts(
            self,
            db: AsyncSession,
    ) -> List[AssetTypeDictVo]:
        """查询全部资产类型字典条目"""
        try:
            result = await db.execute(
                select(AssetTypeDict).order_by(AssetTypeDict.code.asc())
            )
            items = list(result.scalars().all())
            logger.info(f"查询全部资产类型字典: total={len(items)}")
            return [AssetTypeDictVo.model_validate(item) for item in items]
        except Exception as e:
            logger.error(f"[Error in list_type_dicts]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询资产类型字典列表失败: {e}")

    async def get_type_dict_by_code(
            self,
            code: str,
            db: AsyncSession,
    ) -> AssetTypeDictVo:
        """根据 code 查询单个资产类型字典条目"""
        entity = await self._get_or_raise(code, db)
        return AssetTypeDictVo.model_validate(entity)

    async def update_type_dict(
            self,
            dto: AssetTypeDictUpdateDto,
            db: AsyncSession,
    ) -> AssetTypeDictVo:
        """
        更新资产类型字典条目的 name 字段（code 不可修改）。
        """
        entity = await self._get_or_raise(dto.code, db)
        try:
            entity.name = dto.name
            await db.commit()
            await db.refresh(entity)
            logger.info(f"更新资产类型字典成功: code={entity.code}, name={entity.name}")
            return AssetTypeDictVo.model_validate(entity)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update_type_dict {dto.code}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新资产类型字典失败: {e}")

    async def delete_type_dict(
            self,
            code: str,
            db: AsyncSession,
    ) -> str:
        """
        删除资产类型字典条目。
        注意：若 asset_categories 表中有关联数据（外键约束），删除会失败。
        :return: 被删除的 code 值
        """
        entity = await self._get_or_raise(code, db)
        try:
            entity.is_deleted = True
            await db.commit()
            logger.info(f"删除资产类型字典成功: code={code}")
            return code
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete_type_dict {code}]: {e}")
            raise BusinessException(
                ErrorCode.DB_ERROR,
                extra_msg=f"删除资产类型字典失败（可能存在关联数据）: {e}"
            )

    # 辅助方法
    async def _get_or_raise(self, code: str, db: AsyncSession) -> AssetTypeDict:
        """根据 code 查询实体，不存在则抛出 NOT_FOUND_ERROR"""
        result = await db.execute(
            select(AssetTypeDict).where(AssetTypeDict.code == code, AssetTypeDict.is_deleted == False)
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg=f"资产类型字典不存在: code={code}",
            )
        return entity

    async def _check_code_not_exists(self, code: str, db: AsyncSession) -> None:
        """校验 code 唯一性（不允许重复创建）"""
        result = await db.execute(
            select(AssetTypeDict.code).where(AssetTypeDict.code == code, AssetTypeDict.is_deleted == False).limit(1)
        )
        if result.scalar_one_or_none() is not None:
            raise BusinessException(
                ErrorCode.DATA_ALREADY_EXISTS,
                extra_msg=f"类型编码 '{code}' 已存在，请勿重复创建", )
