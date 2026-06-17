import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from loguru import logger

from app.api.v1.router import api_router
from app.logging_config import init_logging

init_logging()

app = FastAPI(
    title="AI Factory Simulation Backend",
    version="0.1.0",
    description="DES + Line Balance simulation engines for manufacturing",
)

# gzip 大响应（事件流端点 ~10MB→~2MB）
app.add_middleware(GZipMiddleware, minimum_size=1024)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def access_log(request: Request, call_next):
    rid = uuid.uuid4().hex[:8]
    request.state.request_id = rid
    start = time.perf_counter()
    with logger.contextualize(rid=rid):
        try:
            response = await call_next(request)
        except Exception:
            cost_ms = (time.perf_counter() - start) * 1000
            logger.exception(
                "[{rid}] {method} {path} -> 500 ({cost:.1f}ms)",
                rid=rid, method=request.method, path=request.url.path, cost=cost_ms,
            )
            raise
        cost_ms = (time.perf_counter() - start) * 1000
        # 高频轮询端点静默 access log，避免刷屏（仅 2xx 静默，错误仍打印）
        _SILENT_SUFFIXES = ("/run/status",)
        _silent = request.url.path.endswith(_SILENT_SUFFIXES) and response.status_code < 400
        if not _silent:
            level = "INFO" if response.status_code < 400 else "WARNING"
            logger.log(
                level,
                "[{rid}] {method} {path} -> {status} ({cost:.1f}ms)",
                rid=rid,
                method=request.method,
                path=request.url.path,
                status=response.status_code,
                cost=cost_ms,
            )
        response.headers["X-Request-ID"] = rid
        return response


app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
def health_check():
    return {"status": "ok"}
