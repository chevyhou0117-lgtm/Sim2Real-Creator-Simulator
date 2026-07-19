from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from typing import Any
from common.ErrorCode import ErrorCode
from result.ResultUtils import ResultUtils
from exception.ExceptionClass import BusinessException
from commonutils.Logs import init_logging

logger = init_logging()


_ERROR_HTTP_STATUS = {
    ErrorCode.PARAMS_ERROR: status.HTTP_400_BAD_REQUEST,
    ErrorCode.PAYLOAD_TOO_LARGE: status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
    ErrorCode.DATA_NOT_FOUND: status.HTTP_404_NOT_FOUND,
    ErrorCode.NOT_FOUND_ERROR: status.HTTP_404_NOT_FOUND,
    ErrorCode.DATA_ALREADY_EXISTS: status.HTTP_409_CONFLICT,
    ErrorCode.OPERATION_ERROR: status.HTTP_422_UNPROCESSABLE_ENTITY,
    ErrorCode.AUTH_FAILED: status.HTTP_401_UNAUTHORIZED,
    ErrorCode.PERMISSION_DENIED: status.HTTP_403_FORBIDDEN,
    ErrorCode.DB_ERROR: status.HTTP_500_INTERNAL_SERVER_ERROR,
    ErrorCode.SYSTEM_ERROR: status.HTTP_500_INTERNAL_SERVER_ERROR,
}


def http_status_for_error(error_code: ErrorCode) -> int:
    return _ERROR_HTTP_STATUS.get(error_code, status.HTTP_500_INTERNAL_SERVER_ERROR)


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
        http_status = http_status_for_error(exc.error_code)
        is_server_error = http_status >= 500
        if is_server_error:
            logger.error(
                "Business error %s %s: code=%s detail=%s",
                request.method,
                request.url.path,
                exc.error_code.code,
                exc.extra_msg,
            )
        response_obj = ResultUtils.fail(
            error_code=exc.error_code,
            data=None if is_server_error else exc.data,
            # SQL/驱动/内部路径等细节只写服务端日志，不回传给客户端。
            extra_message=None if is_server_error else exc.extra_msg,
        )
        return JSONResponse(
            status_code=http_status,
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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=response_obj.model_dump()
        )

    # 3. 捕获所有未处理异常
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.exception("[Global Error] %s %s", request.method, request.url.path)
        response_obj = ResultUtils.fail(
            error_code=ErrorCode.SYSTEM_ERROR,
            data=None,
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=response_obj.model_dump()
        )
