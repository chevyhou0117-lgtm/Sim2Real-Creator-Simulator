# AI Factory 模拟后端 (sim_backend)

## 项目概述

制造业运营模拟系统的后端服务。模拟引擎产出毫秒级事件数据，通过 Omniverse Kit 的 Data Bridge 驱动 3D 设备动画（WebRTC 串流到前端）。

**三个组件协作：**
- `sim_backend`（本项目）— FastAPI + SimPy，模拟计算 + 数据持久化 + API
- `../sim_frontend` — React 前端（图表展示 + 接收 Kit WebRTC 视频流）
- `../../../kit-app-template` — Omniverse Kit App（3D 渲染 + WebRTC 串流；与 Simulation 同级，路径相对 sim_backend）

## 技术栈

- Python 3.11+ / FastAPI / SQLAlchemy 2.0 / SimPy 4 / PostgreSQL
- 虚拟环境：`.venv/`，激活：`source .venv/bin/activate`
- 启动：`uvicorn app.main:app --reload --port 8000`
- Swagger UI：`http://localhost:8000/docs`
- DB：`postgresql://postgres:postgres@localhost:5432/aifactory_simulation`

## 项目结构

```
app/
├── main.py              # FastAPI 入口，CORS 配置
├── config.py            # pydantic-settings，读 .env
├── database.py          # SQLAlchemy engine + SessionLocal + Base
├── models/              # SQLAlchemy ORM（39张表，完全对齐「数据模型与业务对象.md」）
│   ├── md.py            # md_ 基础数据（26张）：Factory→Stage→ProductionLine→Operation→Equipment（line 绑定）→BOP→BOPProcess + StageTransition；Equipment 5 张子表：TechSpec/ProcessParameters(standard_ct 等)/BOMPart/SOP/OperationRecords...
│   ├── sim.py           # sim_ 模拟方案（4张）：SimulationPlan, SoftConstraintConfig, ParameterOverride, AnomalyInjection
│   ├── biz.py           # biz_ 业务快照（6张）：WorkOrder, ProductionTask, MaterialSupply, InventorySnapshot...
│   ├── res.py           # res_ 模拟结果（5张）：SimulationResult, LineBalanceResult, SMTCapacityResult, SimulationStateSnapshot...
│   ├── ai.py            # ai_ AI分析（2张）：AIAnalysisResult, ImprovementSuggestion
│   └── tpl.py           # tpl_ 模板（2张）：ParameterTemplate, PlanVersion
├── schemas/             # Pydantic 请求/响应模型
│   ├── md.py            # FactoryOut, StageOut, ProductionLineOut, OperationOut, BOPOut...
│   ├── sim.py           # PlanCreate/Update/Out, ConstraintSet/Out, OverrideCreate/Out, TaskCreate/Out...
│   └── res.py           # SimulationResultOut, LineBalanceResultOut, SimEventOut, SimulationEventsOut
├── api/v1/              # API 路由
│   ├── router.py        # 汇总所有子路由
│   ├── master_data.py   # GET /factories, /stages, /lines, /operations, /bop, /products
│   ├── plans.py         # CRUD /plans + /constraints, /overrides, /tasks, /anomalies
│   └── simulation.py    # POST /plans/{id}/run, GET /result, /line-balance, /snapshots, /events
├── api/deps.py          # get_db() 依赖注入
└── engine/              # 模拟引擎
    ├── common.py        # CT解析（覆盖优先级：EQUIPMENT>OPERATION>LINE>GLOBAL>BOP标准CT）、ResolvedProcess、SimEvent
    ├── line_balance.py  # 静态线平衡：LBR = ΣCT / (瓶颈CT × 工站数)，Takt = 可用秒 / 需求量
    └── des_engine.py    # SimPy DES：双模式 —— 有工单（WO 链路由 + S2S/E2S 接续）/ 无工单（每条线独立）。多产品 BoP、同线 task 串行 drain、毫秒级事件、设备故障/WIP/异常注入。
```

## DES 引擎双模式

**模式判别**：由 plan 级别的 `ignore_wo` 布尔字段显式控制（不再按 task 的 `wo_id` 推断）。WO 模式下引擎会强制校验 **所有 task 必须挂 wo_id**，缺一即抛 `ValueError`（数据完整性约束）。

| 模式 | 触发条件 | 行为 |
|------|---------|------|
| 有工单（WO-linked） | `plan.ignore_wo = False`（默认），且所有 task 有 `wo_id` | WO 把跨 stage 的 task 链起来，上游 task 产出**定向**给同 wo_id 的下游 task；跨 stage 接续由 `md_stage_transition.connection_type` 决定（S2S 流式 / E2S 批量）+ `connection_time` 接续时长 |
| 无工单（隔离） | `plan.ignore_wo = True`（用户显式选择） | 每条线独立按 task 清单串行跑；**无跨 stage 传递**；下游 stage 的 task 视为"自备来料"，emit `ISOLATED_MODE_SYNTHETIC_FEED` 事件；task 即便带 wo_id 也被忽略 |

**核心抽象**：
- `LineResources`：一条 line 的物理资源池（simpy.Resource / 设备轮询 / 失效注册），跨 task 共享
- `TaskExecutor`：一个 ProductionTask 一个实例，持有自己的 inbox / output_buffer / BoP；`run()` 按 S2S（即发）或 E2S（批发）决定 handoff 时机

## 数据库表命名规范

| 前缀 | 层级 | 说明 |
|------|------|------|
| md_ | 基础数据 | 来自主数据平台，模拟模块只读 |
| sim_ | 模拟方案 | 方案配置，本模块读写 |
| biz_ | 业务快照 | 来自 ERP/MES/WMS，导入后只读 |
| res_ | 模拟结果 | 引擎输出，只读 |
| ai_ | AI分析 | AI 分析结果 |
| tpl_ | 模板版本 | 参数模板 + 方案归档 |

## 关键业务逻辑

### 模拟方案状态机
```
DRAFT → READY → RUNNING → COMPLETED → ARCHIVED
```
- DRAFT/READY 可编辑；RUNNING 锁定输入；COMPLETED 可归档

### 两个模拟器
1. **LINE_BALANCE（静态线平衡）**：纯数学计算，无时间推进，前端即时展示
2. **PRODUCTION（DES 生产过程模拟）**：SimPy 离散事件仿真，产品流过 BOP 工序

### 软约束（全部默认关闭）
- EQUIPMENT_FAILURE：按 MTBF/MTTR 随机触发设备故障
- MATERIAL_SUPPLY：考虑物料库存
- WIP_CAPACITY：线边仓容量限制
- MANPOWER：人员-CT 关系
- AGV_TRANSPORT：AGV 运输约束

### events 端点（供 Omniverse Kit 消费）
`GET /api/v1/plans/{id}/result/events` 返回毫秒级事件流。
设备通过 `md_equipment.creator_binding_id` 字段存储 USD prim path，Kit 用它定位 3D 模型。

## 设计文档（权威参考）

- `../../docs/5. 数据模型与业务对象.md` — 全部 md_/biz_/sim_/res_/ai_/tpl_ 表定义（字段/类型/约束/枚举/一致性规则）
- `../../prds/PRD_Main.md` + `prds/Appendix_*.md` — PRD 主档与附件
- `../../docs/simulation-prd.md`（如存在）— 模拟器逻辑/LBR公式/CT解析规则/软约束行为

## 常用命令

```bash
# 启动开发服务器
uvicorn app.main:app --reload --port 8000

# 数据库迁移
alembic revision --autogenerate -m "描述"
alembic upgrade head

# 验证模型加载
python -c "from app.database import Base; import app.models; print(len(Base.metadata.tables))"  # 应输出 39
```

## TODO

- [ ] 前端 API 对接（web 项目）
- [ ] Kit 侧 SimulationPlaybackController service
- [ ] **Plan 校验**（WO 模式遗留）：启动仿真前校验 (1) 每 WO 每 stage 最多 1 task (2) 上下游 task `plan_quantity` 相等（"task 必须有 wo_id"已在引擎 raise；但前端最好前置校验避免跑到 500）
- [ ] **StageTransition CRUD 端点**：`GET/POST/PATCH /factories/{id}/stage-transitions`
- [ ] **PlanConfig UI**：展示 StageTransition 配置表 + WO 链路可视化
- [ ] **换线时间接入**：引擎读 `md_product.standard_changeover_time` 代替 `DEFAULT_CHANGEOVER_SEC=0`
- [ ] **`line_balance.py` 多产品**：按产品分别输出 LBR（或加权平均）；当前仍走单 BoP legacy 路径
- [ ] **`master_data.py::/lines/{id}/bop`**：加 `?product_code=` 过滤参数（多产品情况下前端区分）
- [x] **`/result/events` 端点**：✅ 已建 `res_simulation_event` 表，事件全量持久化；端点改为直接查表、支持过滤 + gzip。新增 `/result/equipment-timeline/{eq_id}`、`/result/product-trajectory/{product_id}` 预聚合端点供 Kit 用
- [ ] **Staffing path 2** — 打通 `md_worker_type` + `md_staffing_config` 建模人员与 CT 关系
  - 当前状态：两张表都存在但为空；前端"人员配置"面板走路径 1 兜底（仅显示 BOPProcess.standard_worker_count 的总人数）
  - 需要做：
    1. seed.py 补 `WorkerType`（印刷工/贴片工/检验员/包装工）+ `StaffingConfig`（每人工工位一档 worker_count + ct_with_this_count）
    2. `GET /factories/{id}/staffing` 聚合端点（工序 × 工种 × 人数档位）
    3. 前端切回 5 列展示（工序 / 产线 / 工种 / 配置人数 / 最少人数），去掉人员面板的 `warning` 提示
    4. DES 引擎 MANPOWER 软约束按 `ct_with_this_count` 做"换人数看 CT"的参数化
