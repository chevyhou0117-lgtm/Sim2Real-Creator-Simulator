from pydantic import BaseModel
from typing import Generic, TypeVar, List, Optional

T = TypeVar('T')


class Page(BaseModel, Generic[T]):
    """通用分页响应模型"""
    items: List[T]  # 当前页的数据列表
    total: int      # 总记录数
    current: int       # 当前页码
    pageSize: int       # 每页大小
    totalPages: int  # 总页数

    class Config:
        arbitrary_types_allowed = True