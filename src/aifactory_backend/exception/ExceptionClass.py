from typing import Any, Optional
from enum import Enum
from common.ErrorCode import ErrorCode

class BusinessException(Exception):
    """
    自定义业务异常基类
    核心职责：携带错误码和附加数据，不负责格式化输出
    """
    def __init__(
        self,
        error_code: ErrorCode, # 定义的ErrorCode
        data: Any = None,
        extra_msg: Optional[str] = None
    ):
        # 兼容历史调用 `BusinessException(code, "错误说明")`。仓库中的这些调用都把
        # 第二个位置参数当消息使用，而不是响应 data；统一纠正，避免说明跑进 data。
        if isinstance(data, str) and extra_msg is None:
            extra_msg = data
            data = None
        self.error_code = error_code
        self.data = data
        self.extra_msg = extra_msg

    def __str__(self):
        return f"[BusinessException] code={self.error_code.code}, msg={self.error_code.message}"



class NotFoundError(BusinessException):
    """资源未找到异常"""
    def __init__(self, data: Any = None, extra_msg: str = None):
        super().__init__(error_code=ErrorCode.DATA_NOT_FOUND, data=data, extra_msg=extra_msg)

class AuthFailedError(BusinessException):
    """认证失败异常"""
    def __init__(self, data: Any = None, extra_msg: str = None):
        super().__init__(error_code=ErrorCode.AUTH_FAILED, data=data, extra_msg=extra_msg)

class SystemError(BusinessException):
    """系统内部异常"""
    def __init__(self, data: Any = None, extra_msg: str = None):
        super().__init__(error_code=ErrorCode.SYSTEM_ERROR, data=data, extra_msg=extra_msg)
