import os
from dotenv import load_dotenv
import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

# 1. 加载 .env 文件
# 默认会加载当前目录下的 .env 文件
load_dotenv()

logger = logging.getLogger(__name__)

# 2. 从环境变量读取配置
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "aifactory_simulation")

if not DB_PASSWORD:
    logger.error("错误：未在 .env 文件中找到 DB_PASSWORD，请检查配置！")
    raise ValueError("Database password is missing in environment variables.")

from urllib.parse import quote_plus
encoded_password = quote_plus(DB_PASSWORD)
DATABASE_URL = f"postgresql+asyncpg://{DB_USER}:{encoded_password}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

logger.info(f"数据库连接配置已加载: {DB_HOST}:{DB_PORT}/{DB_NAME}")
# 3. 创建异步引擎
engine = create_async_engine(
    DATABASE_URL,
    echo=False,            # 与 sim_backend 共用本地库，关掉 SQL 回显减少噪音
    pool_pre_ping=True,    # 自动检测并移除失效连接
    pool_size=5,           # 连接池调小：与 sim_backend 共用同一 PG，避免连接数叠加打满 PG 默认 100
    max_overflow=10
)

# 4. 创建异步会话工厂
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

class Base(DeclarativeBase):
    pass

# 5. 依赖注入
async def get_db() -> AsyncSession:
    async with async_session_maker() as session:
        yield session