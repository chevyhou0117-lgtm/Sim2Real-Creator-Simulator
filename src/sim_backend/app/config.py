from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/aifactory_simulation"

    # sim 只服务这一个 canonical 工厂。md_factory 与 Creator 共库共表，
    # Creator 侧可能写入其他工厂的主数据；GET /factories 按此 code 过滤，
    # 避免前端 factories[0] 选中非 canonical 工厂。留空 = 不过滤（回退旧行为）。
    CANONICAL_FACTORY_CODE: str = "FOXCONN-NME"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
