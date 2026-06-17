#!/usr/bin/env bash
# sim_backend 容器启动流程：等 DB → 迁移 → 首次空库才灌种子 → 交给 CMD 起 uvicorn。
set -euo pipefail
cd /app

echo "[entrypoint] DATABASE_URL=${DATABASE_URL:-<unset>}"

# ── 1. 等 PostgreSQL 可连（depends_on healthcheck 已基本保证，这里再兜底重试）──
python - <<'PY'
import os, sys, time
import psycopg2

url = os.environ["DATABASE_URL"]
for i in range(60):
    try:
        psycopg2.connect(url).close()
        print(f"[entrypoint] db ready (after {i*2}s)")
        sys.exit(0)
    except Exception as e:
        print(f"[entrypoint] waiting for db... {e}")
        time.sleep(2)
print("[entrypoint] db never became ready", file=sys.stderr)
sys.exit(1)
PY

# ── 2. 迁移到最新（幂等）──
echo "[entrypoint] alembic upgrade head"
alembic upgrade head

# ── 3. 仅当 md_factory 为空（全新库）时灌全局 md 种子 + creator 专有表 ──
#    load_seed.py 本身幂等，但跑全量较慢，故用 Factory 计数门控，避免每次重启都重灌。
if python -c "import sys; from app.database import SessionLocal; from app.models.md import Factory; db=SessionLocal(); n=db.query(Factory).count(); db.close(); sys.exit(0 if n==0 else 1)"; then
    echo "[entrypoint] empty db → seeding (load_seed.py)"
    python load_seed.py
else
    echo "[entrypoint] seed skipped (md_factory already populated)"
fi

# ── 4. 交棒给 CMD（uvicorn --reload）──
echo "[entrypoint] exec: $*"
exec "$@"
