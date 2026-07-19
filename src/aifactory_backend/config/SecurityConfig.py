"""Creator API 的部署期安全配置。"""

from __future__ import annotations

import os
import secrets
from collections.abc import Iterable

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response


API_KEY_HEADER = "X-Creator-API-Key"
_WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
_DEFAULT_DEV_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
)


def get_creator_api_key() -> str:
    return os.getenv("CREATOR_API_KEY", "").strip()


def validate_security_config(environment: str, api_key: str) -> None:
    """生产环境必须显式提供密钥，避免误部署成无鉴权服务。"""
    if environment.strip().lower() == "production" and not api_key:
        raise RuntimeError(
            "production 环境必须设置 CREATOR_API_KEY；"
            "请使用 `openssl rand -hex 32` 生成并写入 docker/.env"
        )


def parse_cors_origins(raw_value: str | None, *, production: bool) -> list[str]:
    """解析逗号分隔的显式来源；生产环境拒绝通配符。"""
    if raw_value is None or not raw_value.strip():
        return [] if production else list(_DEFAULT_DEV_ORIGINS)

    origins = [item.strip().rstrip("/") for item in raw_value.split(",") if item.strip()]
    if production and "*" in origins:
        raise RuntimeError("production 环境的 AIFACTORY_CORS_ORIGINS 不允许使用通配符 '*'")
    return list(dict.fromkeys(origins))


def is_protected_request(method: str, path: str) -> bool:
    return method.upper() in _WRITE_METHODS and path.startswith("/api/")


def api_key_matches(configured_key: str, provided_key: str | None) -> bool:
    return bool(
        configured_key
        and provided_key
        and secrets.compare_digest(configured_key, provided_key)
    )


class CreatorApiKeyMiddleware(BaseHTTPMiddleware):
    """保护所有业务写请求；读取接口仍可用于页面加载和健康检查。"""

    def __init__(self, app: FastAPI, *, api_key: str) -> None:
        super().__init__(app)
        self.api_key = api_key

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        if not self.api_key or not is_protected_request(request.method, request.url.path):
            return await call_next(request)

        if api_key_matches(self.api_key, request.headers.get(API_KEY_HEADER)):
            return await call_next(request)

        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"code": 40001, "message": "认证失败", "data": None},
            headers={"WWW-Authenticate": f'ApiKey realm="Creator", header="{API_KEY_HEADER}"'},
        )


def add_openapi_api_key_security(app: FastAPI, protected_methods: Iterable[str] = _WRITE_METHODS) -> None:
    """让 Swagger/OpenAPI 正确声明写接口所需的 API key。"""
    original_openapi = app.openapi
    normalized_methods = {method.lower() for method in protected_methods}

    def custom_openapi():
        if app.openapi_schema:
            return app.openapi_schema
        schema = original_openapi()
        security_schemes = schema.setdefault("components", {}).setdefault("securitySchemes", {})
        security_schemes["CreatorApiKey"] = {
            "type": "apiKey",
            "in": "header",
            "name": API_KEY_HEADER,
        }
        for path, path_item in schema.get("paths", {}).items():
            if not path.startswith("/api/"):
                continue
            for method, operation in path_item.items():
                if method.lower() in normalized_methods and isinstance(operation, dict):
                    operation["security"] = [{"CreatorApiKey": []}]
                    operation.setdefault("responses", {}).setdefault(
                        "401", {"description": "Creator API key 缺失或无效"}
                    )
        app.openapi_schema = schema
        return schema

    app.openapi = custom_openapi
