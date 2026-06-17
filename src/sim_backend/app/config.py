from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/aifactory_simulation"

    # Kit App 进程管理 —— /api/v1/admin/kit/restart 用
    # Kit 卡死时 sim_backend 充当外部"看门人"：按 KIT_PROCESS_MATCH 匹配 cmdline
    # pkill 旧进程，再 Popen KIT_LAUNCH_SCRIPT 拉新进程（独立进程组，与 uvicorn 解耦）。
    # 默认值对应 fii.houyiming_streaming.kit（当前用户的 .kit）。换 .kit 时改 env 即可。
    KIT_LAUNCH_SCRIPT: str = (
        "/home/remond/Workspace/kit-app-template/_build/linux-x86_64/release/"
        "fii.houyiming_streaming.kit.sh"
    )
    KIT_PROCESS_MATCH: str = "fii.houyiming_streaming"
    # 透传给 .kit.sh 的额外参数（脚本末尾 "$@" 转发给 kit 二进制）。
    # streaming 版本必须 --no-window，否则 GLFW 试图建本地窗口失败 → 启动崩。
    # 多参数用空格分隔，shlex.split 解析（与 ./repo.sh launch -- 后面的参数等价）。
    KIT_LAUNCH_ARGS: str = "--no-window"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
