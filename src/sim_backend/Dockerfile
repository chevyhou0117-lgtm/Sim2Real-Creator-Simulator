# sim_backend 开发镜像（FastAPI + SimPy + SQLAlchemy）
# 源码在 dev 模式下由 docker-compose 以 volume 挂进 /app，故镜像只负责装依赖。
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app

# 国内 apt 源加速：python:3.11-slim 已浮到 Debian trixie，源在 deb822 格式的 debian.sources；
# 老镜像则在 sources.list。两处都替换 deb.debian.org → 清华镜像，首次构建 apt 下载快很多。
RUN set -eux; \
    if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources; \
    fi; \
    if [ -f /etc/apt/sources.list ]; then \
        sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list; \
    fi

# 运行期系统库：curl(healthcheck) + libpq5(源码版 psycopg2 的运行依赖)
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl libpq5 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# 只装运行期依赖（与 pyproject.toml [project].dependencies 保持一致；改一处记得同步另一处）。
# 不 `pip install .` 是因为 dev 用 volume 挂源码覆盖 /app，装进 site-packages 的 app 包会被遮蔽，
# 单独列依赖可让这一层在源码改动时仍命中缓存。国内源加速。
# 注意：不要 `pip install --upgrade pip`——升级到的新版 pip 在此镜像里会段错误(exit 139)，
# 直接用 python:3.11-slim 自带的 pip 装这些包即可。
#
# psycopg2 从源码装（不是 psycopg2-binary）：binary 轮子自带打包的 libssl/libcrypto(OpenSSL3)，
# 而 uvicorn[standard] 通过 Python ssl 模块又加载了系统 OpenSSL3——同进程两份 OpenSSL 全局状态
# 冲突，仿真大批量 COPY 写库时内存损坏 → worker 原生段错误(无 traceback、非 OOM、PG 端无崩)。
# 源码版链接系统 libpq/libssl，全进程单一 OpenSSL，根治。gcc/libc6-dev/libpq-dev 仅编译期需要，装完即清。
# libc6-dev 必须显式装：新基础镜像浮到 Debian trixie 后，gcc 不再硬依赖 libc 头文件，
# 叠加 --no-install-recommends 会缺 stdlib.h → psycopg2 源码编译报 "fatal error: stdlib.h: No such file"。
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends gcc libc6-dev libpq-dev; \
    pip install -i https://pypi.tuna.tsinghua.edu.cn/simple \
        "fastapi>=0.115" \
        "uvicorn[standard]>=0.32" \
        "sqlalchemy>=2.0" \
        "psycopg2>=2.9" \
        "alembic>=1.14" \
        "pydantic>=2.0" \
        "pydantic-settings>=2.0" \
        "simpy>=4.1" \
        "python-multipart>=0.0.9" \
        "openpyxl>=3.1" \
        "loguru>=0.7"; \
    apt-get purge -y --auto-remove gcc libc6-dev libpq-dev; \
    apt-get clean; rm -rf /var/lib/apt/lists/*

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 兜底：dev 模式会被 volume 覆盖；非 dev 时镜像内自带一份源码
COPY . .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
