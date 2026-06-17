# 使用官方 Python 3.11 稳定版 slim 镜像
FROM python:3.11.9-slim

# 设置容器内工作目录
WORKDIR /app

# 核心环境变量配置
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app

# 安装系统级依赖（精简且满足项目需求）
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 先复制依赖文件
COPY requirements.txt .

# 安装Python依赖（使用国内源加速，适配国内网络）
RUN pip install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple \
    && pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 复制项目所有源码到容器
COPY . .

# 创建非root用户并授权（提高安全性，解决权限问题）
RUN useradd -m -u 1000 appuser \
    && chown -R appuser:appuser /app \
    && chmod +x /app/main.py  # 给主程序执行权限
USER appuser

# 暴露服务端口（和启动命令一致）
EXPOSE 8128

# 健康检查（兼容多路径，降低失败概率）
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8128/api/v1 || curl -f http://localhost:8128/health || exit 1

# 启动命令
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8128", "--workers", "2", "--log-level", "info"]