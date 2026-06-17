
from typing import List
from pydantic import BaseModel, Field

"""
分页请求类， 后面需要查询全部的话，直接继承就行；
"""
class DeleteRequest(BaseModel):

    id : int # 对应id


class BatchIdsRequest(BaseModel):
    """批量 ID 请求（UUID 字符串列表）"""
    ids: List[str] = Field(default_factory=list, description="ID 列表")
