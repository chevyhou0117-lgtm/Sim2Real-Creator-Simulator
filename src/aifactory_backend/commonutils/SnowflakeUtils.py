import time
import uuid
import threading
from typing import Annotated

from pydantic import PlainSerializer, BeforeValidator

# 自定义纪元：2021-01-01 00:00:00 UTC（毫秒）
_EPOCH = 1609459200000

# 位长度分配：1(符号) + 41(时间戳) + 10(机器ID) + 12(序列号) = 64 bit
_WORKER_ID_BITS = 10
_SEQUENCE_BITS = 12
_MAX_WORKER_ID = (1 << _WORKER_ID_BITS) - 1   # 1023
_MAX_SEQUENCE = (1 << _SEQUENCE_BITS) - 1      # 4095
_WORKER_ID_SHIFT = _SEQUENCE_BITS              # 12
_TIMESTAMP_SHIFT = _SEQUENCE_BITS + _WORKER_ID_BITS  # 22


class SnowflakeGenerator:
    """
    雪花算法 ID 生成器（线程安全）。

    注意：此类已废弃，仅作为无害的死代码保留以兼容历史导入。
    实际的 ID 生成已切换为 UUID 字符串，见 generate_snowflake_id()。
    """

    def __init__(self, worker_id: int = 1):
        if not (0 <= worker_id <= _MAX_WORKER_ID):
            raise ValueError(f"worker_id 必须在 0 ~ {_MAX_WORKER_ID} 之间")
        self._worker_id = worker_id
        self._sequence = 0
        self._last_timestamp = -1
        self._lock = threading.Lock()

    def generate(self) -> int:
        with self._lock:
            ts = self._current_ms()
            if ts < self._last_timestamp:
                raise RuntimeError("系统时钟回拨，拒绝生成 ID")
            if ts == self._last_timestamp:
                self._sequence = (self._sequence + 1) & _MAX_SEQUENCE
                if self._sequence == 0:
                    ts = self._wait_next_ms(self._last_timestamp)
            else:
                self._sequence = 0
            self._last_timestamp = ts
            return (
                ((ts - _EPOCH) << _TIMESTAMP_SHIFT)
                | (self._worker_id << _WORKER_ID_SHIFT)
                | self._sequence
            )

    @staticmethod
    def _current_ms() -> int:
        return int(time.time() * 1000)

    def _wait_next_ms(self, last_ts: int) -> int:
        ts = self._current_ms()
        while ts <= last_ts:
            ts = self._current_ms()
        return ts


def generate_snowflake_id() -> str:
    """生成一个 UUID 字符串作为主键 ID，可直接用作 SQLAlchemy Column default。

    返回 36 位带连字符的 UUID 字符串，格式与 sim_backend md.py 的 _uuid() 完全一致。
    """
    return str(uuid.uuid4())


# VO 用：序列化到 JSON 时输出为字符串（UUID 本身即为字符串）
SnowflakeIdOut = Annotated[
    str,
    PlainSerializer(lambda x: str(x), return_type=str, when_used="json"),
]

# DTO 用：接收 JSON 时允许 str/int/uuid，统一转为字符串（绝不 int() 转换，避免拒绝 UUID）
SnowflakeIdIn = Annotated[
    str,
    BeforeValidator(lambda v: str(v) if v is not None else v),
]
