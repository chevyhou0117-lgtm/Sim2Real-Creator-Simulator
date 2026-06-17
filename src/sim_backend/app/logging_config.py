"""全局 loguru 配置 + uvicorn/标准 logging 桥接。

入口在 app.main 启动时调一次 init_logging()，之后任意模块：

    from loguru import logger
    logger.info("foo {}", bar)

文件：logs/sim_backend.log，50MB 轮转，保留 10 份，旧文件 zip 压缩。
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

from loguru import logger

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"


class _InterceptHandler(logging.Handler):
    """把 stdlib logging（uvicorn / sqlalchemy 等）转发到 loguru。"""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno
        # 跳过 logging 内部帧，定位到真正的调用点
        frame, depth = logging.currentframe(), 2
        while frame and frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1
        logger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


def init_logging(level: str = "INFO") -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    logger.remove()
    logger.add(
        sys.stderr,
        level=level,
        format=(
            "<green>{time:HH:mm:ss.SSS}</green> "
            "<level>{level: <7}</level> "
            "<cyan>{name}:{line}</cyan> | <level>{message}</level>"
        ),
        backtrace=True,
        diagnose=True,
    )
    logger.add(
        LOG_DIR / "sim_backend.log",
        level=level,
        rotation="50 MB",
        retention=10,
        compression="zip",
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} {level: <7} {name}:{line} | {message}",
        enqueue=True,  # 多进程/多线程安全
        backtrace=True,
        diagnose=False,  # 文件里关掉变量诊断，避免泄密
    )

    # 把 stdlib logger 全部接管到 loguru
    logging.basicConfig(handlers=[_InterceptHandler()], level=0, force=True)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "fastapi", "sqlalchemy.engine"):
        lg = logging.getLogger(name)
        lg.handlers = [_InterceptHandler()]
        lg.propagate = False
