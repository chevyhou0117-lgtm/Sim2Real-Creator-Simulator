from typing import Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class AssetTypeDictCreateDto(BaseModel):
    """创建资产类型字典请求 DTO"""

    code: str = Field(..., description="类型编码（主键，全局唯一），如: process", min_length=1, max_length=50)
    name: str = Field(..., description="类型名称，如: 工序", min_length=1, max_length=100)


class AssetTypeDictUpdateDto(BaseModel):
    """更新资产类型字典请求 DTO（code 必填）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    code: str = Field(..., description="类型编码（主键，必填）", min_length=1, max_length=50)
    name: str = Field(..., description="类型名称，如: 工序", min_length=1, max_length=100)


class AssetTypeDictDeleteDto(BaseModel):
    """删除资产类型字典请求 DTO"""

    code: str = Field(..., description="类型编码（主键）", min_length=1, max_length=50)
