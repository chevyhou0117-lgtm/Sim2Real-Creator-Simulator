from datetime import datetime, date
from json import JSONEncoder
from typing import TypeVar, Generic, Optional, Any, List, Dict
from pydantic import BaseModel, Field

# 定义泛型
T = TypeVar('T')

"""
自定义基础返回类
"""
class BaseResponse(BaseModel, Generic[T]):
    """
    统一返回模型
    """
    code: int = 200
    message: str = "ok"
    data: Optional[T] = None

    class Config:
        json_schema_extra = {
            "example": {
                "code": 200,
                "message": "操作成功",
                "data": None
            }
        }
