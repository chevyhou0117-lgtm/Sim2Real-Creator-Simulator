"""管理类端点：当 Kit 主线程卡死、自身 FastAPI 也不响应时，由 sim_backend
作为"外部看门人"做 kill + respawn。

设计要点：
- 不假设 Kit 是被 sim_backend 启动的：用 `pgrep -f KIT_PROCESS_MATCH` 定位即可。
- spawn 用 `setsid + DEVNULL`，让 Kit 脱离 uvicorn 进程组；uvicorn 重载/退出
  不会一起拉下新 Kit。
- 路径/匹配关键字走 `Settings.KIT_LAUNCH_SCRIPT` / `KIT_PROCESS_MATCH`，换 .kit
  改 env 即可。
"""

from __future__ import annotations

import os
import shlex
import signal
import subprocess
import time
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/admin/kit", tags=["Admin"])


class KitRestartResponse(BaseModel):
    ok: bool
    killed_pids: List[int]
    new_pid: Optional[int]
    launch_script: str
    spawn_log: str  # /tmp/kit_spawn.log，前端可让用户直接 cat 看
    message: str


class KitStatusResponse(BaseModel):
    """前端 polling 用：判断 Kit 进程当前是否还活着。"""
    running: bool
    pids: List[int]
    process_match: str


def _find_kit_pids(match: str) -> List[int]:
    """按 cmdline 子串匹配 Kit 进程 PID 列表。

    用 pgrep -f 而非 psutil，避免引入新依赖；-f 匹配整条 cmdline（脚本 exec 进
    kit 二进制后，cmdline 仍包含 .kit 文件名）。无匹配时 pgrep 返回 1，正常。
    """
    try:
        out = subprocess.run(
            ["pgrep", "-f", match],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except FileNotFoundError:
        raise HTTPException(500, "服务器缺少 pgrep（procps），无法定位 Kit 进程")
    except subprocess.TimeoutExpired:
        raise HTTPException(500, "pgrep 超时")
    if out.returncode not in (0, 1):
        raise HTTPException(500, f"pgrep 失败: {out.stderr.strip()}")
    return [int(line) for line in out.stdout.split() if line.strip().isdigit()]


def _kill_pids(pids: List[int], grace_sec: float = 3.0) -> None:
    """先 SIGTERM 给 grace 秒钟优雅退出，仍存活的 SIGKILL。"""
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            continue
        except PermissionError:
            raise HTTPException(500, f"无权 kill PID {pid}")
    if not pids:
        return
    deadline = time.time() + grace_sec
    while time.time() < deadline:
        alive = []
        for pid in pids:
            try:
                os.kill(pid, 0)
                alive.append(pid)
            except ProcessLookupError:
                continue
        if not alive:
            return
        time.sleep(0.2)
    # 仍存活的强杀
    for pid in pids:
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            continue


_KIT_SPAWN_LOG = "/tmp/kit_spawn.log"


def _spawn_kit(script: str, extra_args: List[str]) -> tuple[int, str]:
    """以独立进程组 spawn Kit；返回 (PID, 日志路径)。

    - start_new_session=True (setsid)：脱离 uvicorn 的进程组，uvicorn 退出不带它走
    - stdout/stderr → /tmp/kit_spawn.log（追加模式）：之前用 DEVNULL 把 set -e
      的非零退出 / 缺 .so / 端口被占等错误全吞了 → 前端永远看到"重启成功"但 Kit
      已死。现在把输出落盘，spawn 后 sleep 1s 检测瞬死，把日志尾巴回吐给前端。
    - cwd 设到脚本所在目录：脚本内部用 $SCRIPT_DIR 相对路径定位 kit/ apps/ 等
    - env=os.environ.copy()：显式继承 uvicorn 进程的 env（DISPLAY / XAUTHORITY /
      NVIDIA_* 等 Kit 必需变量随之带过去）
    """
    if not os.path.isfile(script):
        raise HTTPException(500, f"Kit 启动脚本不存在: {script}")
    if not os.access(script, os.X_OK):
        raise HTTPException(500, f"Kit 启动脚本无可执行权限: {script}")
    cwd = os.path.dirname(script) or "."

    # 每次重启之前清空旧日志，避免越来越大；写时序日志头方便定位
    try:
        with open(_KIT_SPAWN_LOG, "w") as f:
            f.write(f"=== kit spawn @ {time.strftime('%F %T')} ({script}) ===\n")
    except OSError as e:
        raise HTTPException(500, f"无法写入 spawn 日志 {_KIT_SPAWN_LOG}: {e}")

    log_fd = open(_KIT_SPAWN_LOG, "a", buffering=1)  # 行缓冲
    argv = [script, *extra_args]
    try:
        log_fd.write(f"argv: {argv}\n\n")
        log_fd.flush()
        proc = subprocess.Popen(
            argv,
            cwd=cwd,
            stdin=subprocess.DEVNULL,
            stdout=log_fd,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            close_fds=True,
            env=os.environ.copy(),
        )
    except OSError as e:
        log_fd.close()
        raise HTTPException(500, f"Kit spawn 失败 (OSError): {e}")
    # 短暂等待，捕捉"set -e 失败立刻退出"或"缺 .so 立刻 SIGSEGV"这类秒挂场景
    time.sleep(1.0)
    rc = proc.poll()
    if rc is not None:
        log_fd.close()
        tail = _tail_file(_KIT_SPAWN_LOG, 2000)
        raise HTTPException(
            500,
            f"Kit 启动后立即退出 (rc={rc})。spawn 日志尾巴（{_KIT_SPAWN_LOG}）:\n{tail}",
        )
    return proc.pid, _KIT_SPAWN_LOG


def _tail_file(path: str, max_bytes: int) -> str:
    """读文件尾部 max_bytes 字节（fail-soft：读不到返回空串）。"""
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as f:
            if size > max_bytes:
                f.seek(size - max_bytes)
            return f.read().decode("utf-8", errors="replace")
    except OSError:
        return ""


@router.post("/restart", response_model=KitRestartResponse)
def restart_kit() -> KitRestartResponse:
    """杀掉所有匹配 KIT_PROCESS_MATCH 的进程，然后 spawn KIT_LAUNCH_SCRIPT。

    前端调用约定：收到 ok=true 后再去 polling Kit /ov/current_stage 直到非 null
    （Kit 完全起来 + USD 加载完成），然后重新 ingest playback。
    """
    match = settings.KIT_PROCESS_MATCH
    script = settings.KIT_LAUNCH_SCRIPT

    pids = _find_kit_pids(match)
    _kill_pids(pids)
    # 杀完再短暂 sleep 一下，确保端口 (sim 的 Kit /ov 8233 / streaming) 释放，否则新进程 bind 失败
    if pids:
        time.sleep(0.5)
    extra_args = shlex.split(settings.KIT_LAUNCH_ARGS or "")
    new_pid, log_path = _spawn_kit(script, extra_args)
    return KitRestartResponse(
        ok=True,
        killed_pids=pids,
        new_pid=new_pid,
        launch_script=script,
        spawn_log=log_path,
        message=(
            f"已杀掉 {len(pids)} 个旧 Kit 进程（match={shlex.quote(match)}），"
            f"新进程 PID={new_pid}。spawn 日志见 {log_path}；前端继续 polling "
            f"Kit /ov/current_stage 等启动完成。"
        ),
    )


@router.get("/status", response_model=KitStatusResponse)
def kit_status() -> KitStatusResponse:
    """查 KIT_PROCESS_MATCH 匹配的进程 PID 列表。

    前端 polling 用：spawn 后通过这个端点确认 Kit 进程确实活着（PID 列表非空
    并且过几秒还在）。Kit FastAPI /ov/current_stage 早期返回 null 仅说明 stage
    未加载，不代表进程没起来；status 才是判断"活着"的权威。
    """
    pids = _find_kit_pids(settings.KIT_PROCESS_MATCH)
    return KitStatusResponse(
        running=bool(pids),
        pids=pids,
        process_match=settings.KIT_PROCESS_MATCH,
    )
