"""统一响应构造工具 ResultUtils。

⚠️ 本文件为【按调用契约重建】的版本。原 `result/ResultUtils.py` 在本份 aifactory_backend
源码副本中缺失——代码里约 30 处 `from result.ResultUtils import ResultUtils`，但仓库内没有
`result/` 包（也未被 .gitignore 忽略），导致 `python main.py` / 容器启动即
`ModuleNotFoundError: No module named 'result'`。此处依据现有调用点重建：
  - ResultUtils.ok(data=..., message=...)              （控制器，178 处）
  - ResultUtils.fail(error_code=..., data=..., extra_message=...)  （exception/ExceptionHandler.py，3 处）
返回 common.BaseResponse（带 .model_dump()）。

如你本地保留了原始 result/ResultUtils.py，请用原始版覆盖本文件再核对行为。
"""
from typing import Any, Optional

from common.BaseResponse import BaseResponse
from common.ErrorCode import ErrorCode


class ResultUtils:
    """构造统一返回体 BaseResponse(code / message / data)。"""

    @staticmethod
    def ok(data: Any = None, message: str = "操作成功") -> BaseResponse:
        """成功响应：code = 200。"""
        return BaseResponse(code=ErrorCode.SUCCESS.code, message=message, data=data)

    @staticmethod
    def fail(
        error_code: ErrorCode = ErrorCode.SYSTEM_ERROR,
        data: Any = None,
        extra_message: Optional[str] = None,
    ) -> BaseResponse:
        """失败响应：code / message 取自 ErrorCode；extra_message 非空时追加到 message 后。"""
        message = error_code.message
        if extra_message:
            message = f"{message}: {extra_message}"
        return BaseResponse(code=error_code.code, message=message, data=data)
