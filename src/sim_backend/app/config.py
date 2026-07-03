from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/aifactory_simulation"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
