from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from typing import Any
from common.ErrorCode import ErrorCode
from result.ResultUtils import ResultUtils
from exception.ExceptionClass import BusinessException
from commonutils.Logs import init_logging

logger = init_logging()


def _make_json_safe(obj: Any) -> Any:
    """
    递归将对象转为 JSON 可序列化的安全类型。
    针对 Pydantic v2 校验错误中可能包含 ValueError 等非序列化对象的问题。
    """
    if isinstance(obj, (str, int, float, bool)) or obj is None:
        return obj
    elif isinstance(obj, dict):
        return {str(k): _make_json_safe(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [_make_json_safe(item) for item in obj]
    else:
        # ValueError / Exception 等不可序列化对象，转为字符串
        return str(obj)


def setup_exception_handlers(app):
    """
    设置全局异常处理
    :param app:
    :return:
    """
    @app.exception_handler(BusinessException)
    async def business_exception_handler(request: Request, exc: BusinessException):
        """
        核心逻辑：
        捕获异常 -> 调用工具类 -> 返回标准响应
        """
        response_obj = ResultUtils.fail(
            error_code=exc.error_code,
            data=exc.data,
            extra_message=exc.extra_msg
        )
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=response_obj.model_dump()
        )

    # 2. 捕获参数校验异常
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        errors = exc.errors()
        err_msg = errors[0]["msg"] if errors else "参数错误"
        # 将错误详情转为 JSON 安全格式
        safe_errors = _make_json_safe(errors)
        response_obj = ResultUtils.fail(
            error_code=ErrorCode.PARAMS_ERROR,
            data=safe_errors,
            extra_message=err_msg
        )
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=response_obj.model_dump()
        )

    # 3. 捕获所有未处理异常
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error(f"[Global Error]: {exc}")
        response_obj = ResultUtils.fail(
            error_code=ErrorCode.SYSTEM_ERROR,
            data=str(exc)
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=response_obj.model_dump()
        )
