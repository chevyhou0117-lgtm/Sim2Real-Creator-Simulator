from pydantic import BaseModel, ConfigDict, Field


class AssetTypeDictVo(BaseModel):
    """资产类型字典响应 VO"""

    model_config = ConfigDict(
        populate_by_name=True,
        from_attributes=True
    )

    code: str = Field(..., description="类型编码（主键），如: process")
    name: str = Field(..., description="类型名称，如: 工序")
