from typing import TypeVar, Generic, Optional, Any, List, Dict
from pydantic import BaseModel, Field
from enum import Enum


# 定义泛型
T = TypeVar('T')
DATETIME_FORMAT = '%Y-%m-%d %H:%M:%S'  # 本地时间格式



class SortOrder(Enum):

    SORT_ORDER_ASC = "ascend"
    SORT_ORDER_DESC = " descend"

class PageRequest(BaseModel):


    """
    分页请求类， 后面需要查询全部的话，直接继承就行；
    """
    current: Optional[int] = Field(default=1, description="当前页")
    pageSize:  Optional[int] = Field(default=10, description="页面大小")
    # 排序：
    sortField :  Optional[str]= Field(default=SortOrder.SORT_ORDER_DESC, description="页面排序规则")