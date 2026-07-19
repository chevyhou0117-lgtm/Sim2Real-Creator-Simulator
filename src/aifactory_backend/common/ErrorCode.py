from enum import Enum


class ErrorCode(Enum):
    """
    自定义业务错误码枚举
    命名规范：模块_错误类型
    """
    SUCCESS = (200, "操作成功")
    SYSTEM_ERROR = (50001, "系统繁忙，请稍后再试")
    PARAMS_ERROR = (10001, "参数校验失败")
    PAYLOAD_TOO_LARGE = (10002, "上传文件过大")

    DB_ERROR = (20001, "数据库操作异常")
    DATA_NOT_FOUND = (20002, "数据不存在")
    DATA_ALREADY_EXISTS = (20003, "数据已存在")

    NOT_FOUND_ERROR = (40400, "请求数据不存在")
    OPERATION_ERROR = (40500, "操作失败")

    AUTH_FAILED = (40001, "认证失败")
    PERMISSION_DENIED = (40003, "无操作权限")

    @property
    def code(self) -> int:
        """获取错误码"""
        return self.value[0]

    @property
    def message(self) -> str:
        """获取错误描述"""
        return self.value[1]

    def to_dict(self):
        return {"code": self.code, "msg": self.message}
