# 附件 A：数据模型与数据字典

**文档版本**：v1.0  
**最后更新**：2026-04-10  
**所属模块**：AI Factory 运营模拟（Operations Simulation）  
**状态**：正式

---

## A1. 数据对象清单

系统数据层分为五个逻辑分组：

### A1.1 基础数据层（主数据平台只读同步）

| 对象名 | 中文名 | 说明                                
|---|---|-----------------------------------|
| Factory | 工厂 | 工厂主档，系统最顶层组织单元                    |
| Stage | 工段 | 工厂下的生产工段，如 SMT、后工段、组装             |
| ProductionLine | 产线 | 工段下的具体产线                          |
| Operation | 工序 | 产线上的具体工序节点(多设备完成一个工序或者一个设备完成一个工序) |
| Equipment | 设备 | 工序下绑定的设备 (后续还会有工站的概念，类似工序完成报工节点)  | 
| EquipmentFailureParam | 设备故障参数 | 设备 MTBF/MTTR 等可靠性参数               | 
| WIPBuffer | 线边缓冲区 | 工序间的 WIP 缓存区 (线边仓是半成品或者的中转仓库)     |
| StaffingConfig | 人力配置 | 产线的工人类型与人头配置                      |
| Warehouse | 仓库 | 工厂仓库主档（原料/半成品/成品）                 | 
| WorkCalendar | 工作日历 | 工厂排班日历                            | (上班和下班时间，班次定义)
| Shift | 班次 | 日历下的具体班次定义                        |
| Product | 产品 | 产品主档                              |
| BOPProcessParam | 工序工艺参数扩展 | 工序的可扩展参数键值对(产品生产路线)               |
| BOPProcessNGType | 工序不良类型 | 工序对应的不良类型及不良率                     |
| OperationTransition | 工序转移 | 工序之间的流转时间和强制等待时间                  |
| NGType | 不良类型 | 不良类型主档                            |
| Material | 物料 | 物料主档                              |
| WorkerType | 工人类型 | 工人岗位类型主档                          |

### A1.2 模拟方案层（运营模拟自建）
| 对象名 | 中文名 | 说明 |
|---|---|---|
| SimulationPlan | 模拟方案 | 模拟方案主档，是整个模拟的根对象 |
| SoftConstraintConfig | 软约束配置 | 方案级的软约束开关与参数 |
| ParameterOverride | 参数覆写 | 对基础参数的临时覆盖 |
| AnomalyInjection | 异常注入 | 模拟场景中注入的异常事件 |


模拟方案需要进行版本管理


### A1.3 业务数据快照层（外部系统同步）


模拟方案的数据可以进行更新调整

| 对象名 | 中文名 | 说明 |
|---|---|---|
| WorkOrder | 工单 | 来自 MES/ERP 的生产工单 |
| ProductionTask | 生产任务 | 派工层任务，可与工单关联 |
| MaterialSupply | 物料供应计划 | 来自 SCM 的物料到货计划 |
| InventorySnapshot | 库存快照 | 仓库当前库存快照 |
| WIPBufferSnapshot | 线边缓冲区快照 | 线边缓冲区当前库存快照 |
| DemandForecast | 需求预测 | 来自 APS/销售系统的需求预测 |

### A1.4 模拟结果层（引擎写入）

| 对象名 | 中文名 | 说明 |
|---|---|---|
| SimulationResult | 模拟结果主档 | 模拟运行的汇总结果 |
| LineBalanceResult | 线平衡结果 | 各产线的线平衡分析结果 |
| SMTCapacityResult | SMT产能分析结果 | SMT 产能规划分析汇总 |
| SMTCapacityPeriodResult | SMT产能周期结果 | 分周期的 SMT 产能详情 |
| SimulationStateSnapshot | 模拟状态快照 | 仿真过程中离散时间点的状态存档 |
| AIAnalysisResult | AI 分析结果 | AI 对模拟结果的分析摘要 |
| ImprovementSuggestion | 改进建议 | AI 生成的具体改进建议条目 |

### A1.5 模板层（配置复用）

| 对象名 | 中文名 | 说明 |
|---|---|---|
| PlanVersion | 方案版本 | 方案的历史版本快照 |
| ParameterTemplate | 参数模板 | 可复用的参数覆写模板 |
| InputDataTemplate | 输入数据模板 | 可复用的业务输入数据模板 |

---

## A2. ER 图（文字版）

以下为系统核心实体关系描述（文字 ERD）。

```
【基础数据层】
Factory (1) ──< Stage (N)
Stage   (1) ──< ProductionLine (N)
ProductionLine (1) ──< Operation (N)
ProductionLine (1) ──< WIPBuffer (N)
ProductionLine (1) ──< StaffingConfig (N)
Operation (1) ──< Equipment (N)
Equipment (1) ──1 EquipmentFailureParam
WIPBuffer (N) >── Operation (pre_operation_id)
WIPBuffer (N) >── Operation (post_operation_id)
Factory (1) ──< Warehouse (N)
Factory (1) ──< WorkCalendar (N)
WorkCalendar (1) ──< Shift (N)
Product (1) ──< BOP (N)
BOP (1) ──< BOPProcess (N)
BOP (1) ──< OperationTransition (N)
BOPProcess (N) >── Operation
BOPProcess (1) ──< BOPProcessParam (N)
BOPProcess (1) ──< BOPProcessNGType (N)
BOPProcessNGType (N) >── NGType
StaffingConfig (N) >── WorkerType

【模拟方案层】
SimulationPlan (1) ──< SoftConstraintConfig (N)
SimulationPlan (1) ──< ParameterOverride (N)
SimulationPlan (1) ──< AnomalyInjection (N)
SimulationPlan (1) ──< WorkOrder (N)
SimulationPlan (1) ──< ProductionTask (N)
SimulationPlan (1) ──< MaterialSupply (N)
SimulationPlan (1) ──< InventorySnapshot (N)
SimulationPlan (1) ──< WIPBufferSnapshot (N)
SimulationPlan (1) ──< DemandForecast (N)
SimulationPlan (1) ──< PlanVersion (N)

【结果层】
SimulationPlan (1) ──1 SimulationResult
SimulationResult (1) ──< LineBalanceResult (N)
SimulationResult (1) ──1 SMTCapacityResult
SMTCapacityResult (1) ──< SMTCapacityPeriodResult (N)
SimulationResult (1) ──< SimulationStateSnapshot (N)
SimulationResult (1) ──1 AIAnalysisResult
AIAnalysisResult (1) ──< ImprovementSuggestion (N)
LineBalanceResult (N) >── ProductionLine
```

---

## A3. 表清单（Table List）

| 表名 | 数据层 | 主键 | 关键索引 | 说明 |
|---|---|---|---|---|
| factory | 基础数据层 | factory_id | factory_code (UNIQUE) | 工厂主档 |
| stage | 基础数据层 | stage_id | factory_id, stage_code | 工段 |
| production_line | 基础数据层 | line_id | stage_id, line_code | 产线 |
| operation | 基础数据层 | operation_id | line_id, operation_code | 工序 |
| equipment | 基础数据层 | equipment_id | operation_id, equipment_code | 设备 |
| equipment_failure_param | 基础数据层 | equipment_id | — | 设备故障参数（1:1） |
| wip_buffer | 基础数据层 | buffer_id | line_id, pre_operation_id, post_operation_id | 线边缓冲区 |
| staffing_config | 基础数据层 | config_id | line_id, worker_type_id | 人力配置 |
| warehouse | 基础数据层 | warehouse_id | factory_id, warehouse_code | 仓库 |
| work_calendar | 基础数据层 | calendar_id | factory_id | 工作日历 |
| shift | 基础数据层 | shift_id | calendar_id | 班次 |
| product | 基础数据层 | product_id | product_code (UNIQUE) | 产品 |
| bop | 基础数据层 | bop_id | product_id, version, is_active | 工艺路线 |
| bop_process | 基础数据层 | process_id | bop_id, operation_id, seq_no | 工艺路线工序 |
| bop_process_param | 基础数据层 | param_id | process_id, param_name | 工序扩展参数 |
| bop_process_ng_type | 基础数据层 | (process_id, ng_type_id) | process_id | 工序不良类型 |
| operation_transition | 基础数据层 | trans_id | bop_id, from_operation_id, to_operation_id | 工序转移 |
| ng_type | 基础数据层 | ng_type_id | ng_code (UNIQUE) | 不良类型 |
| material | 基础数据层 | material_id | material_code (UNIQUE) | 物料 |
| worker_type | 基础数据层 | worker_type_id | type_code (UNIQUE) | 工人类型 |
| simulation_plan | 模拟方案层 | plan_id | plan_status, created_by, simulation_type | 模拟方案主档 |
| soft_constraint_config | 模拟方案层 | constraint_id | plan_id, constraint_type | 软约束配置 |
| parameter_override | 模拟方案层 | override_id | plan_id, target_type, target_id | 参数覆写 |
| anomaly_injection | 模拟方案层 | anomaly_id | plan_id, anomaly_type | 异常注入 |
| work_order | 业务快照层 | wo_id | plan_id, wo_code, product_id | 工单快照 |
| production_task | 业务快照层 | task_id | plan_id, wo_id, product_id | 生产任务 |
| material_supply | 业务快照层 | supply_id | plan_id, material_id, expected_arrival_time | 物料供应计划 |
| inventory_snapshot | 业务快照层 | inv_id | plan_id, warehouse_id, material_id | 库存快照 |
| wip_buffer_snapshot | 业务快照层 | wip_snap_id | plan_id, buffer_id, material_id | 线边缓冲区快照 |
| demand_forecast | 业务快照层 | forecast_id | plan_id, product_id, period_type, period_start | 需求预测 |
| simulation_result | 模拟结果层 | result_id | plan_id (UNIQUE) | 模拟结果主档 |
| line_balance_result | 模拟结果层 | lbr_result_id | result_id, line_id | 线平衡结果 |
| smt_capacity_result | 模拟结果层 | cap_result_id | result_id (UNIQUE) | SMT产能分析结果 |
| smt_capacity_period_result | 模拟结果层 | period_result_id | cap_result_id, period_type, period_start | SMT产能周期结果 |
| simulation_state_snapshot | 模拟结果层 | snap_id | result_id, sim_time | 模拟状态快照 |
| ai_analysis_result | 模拟结果层 | ai_result_id | result_id (UNIQUE) | AI分析结果 |
| improvement_suggestion | 模拟结果层 | suggestion_id | ai_result_id, category, priority | 改进建议 |
| plan_version | 模板层 | version_id | plan_id, version_no | 方案版本 |
| parameter_template | 模板层 | template_id | template_name, template_type | 参数模板 |
| input_data_template | 模板层 | template_id | template_name | 输入数据模板 |

---

## A4. 字段清单（字段字典）

> 本节重点列出模拟方案层及结果层的核心表字段。基础数据层字段以简表形式呈现。

---

### A4.1 SimulationPlan（模拟方案主档）

| 字段名 | 中文名 | 类型 | 是否必填 | 默认值 | 枚举/字典 | 约束 | 说明 |
|---|---|---|---|---|---|---|---|
| plan_id | 方案ID | BIGINT | 是 | 自增 | — | PK | 主键，系统自动生成 |
| plan_name | 方案名称 | VARCHAR(200) | 是 | — | — | NOT NULL | 用户填写，建议包含日期和场景描述 |
| plan_status | 方案状态 | VARCHAR(20) | 是 | DRAFT | plan_status 枚举 | NOT NULL | 生命周期状态，见 A5 枚举说明 |
| created_by | 创建人 | VARCHAR(100) | 是 | — | — | NOT NULL | 用户账号 ID |
| simulation_type | 模拟类型 | VARCHAR(30) | 是 | — | simulation_type 枚举 | NOT NULL | 决定启用哪些仿真引擎 |
| start_time | 模拟开始时间 | DATETIME | 是 | — | — | NOT NULL | 仿真时间轴起点，须早于 end_time |
| end_time | 模拟结束时间 | DATETIME | 是 | — | — | NOT NULL | 仿真时间轴终点 |
| selected_simulators | 已选仿真器列表 | JSON | 否 | [] | — | — | 字符串数组，如 ["PRODUCTION","LINE_BALANCE"] |
| base_data_version | 基础数据版本 | VARCHAR(50) | 否 | — | — | — | 记录从主数据平台同步时的数据快照版本标识 |
| created_at | 创建时间 | DATETIME | 是 | NOW() | — | NOT NULL | 系统自动填充 |
| updated_at | 最后更新时间 | DATETIME | 是 | NOW() | — | NOT NULL, ON UPDATE NOW() | 系统自动维护 |

**状态流转规则**：DRAFT → READY → RUNNING → COMPLETED；任意状态可 → ARCHIVED；RUNNING 状态不允许手动修改方案参数。

---

### A4.2 SoftConstraintConfig（软约束配置）

| 字段名 | 中文名 | 类型 | 是否必填 | 默认值 | 枚举/字典 | 约束 | 说明 |
|---|---|---|---|---|---|---|---|
| constraint_id | 约束ID | BIGINT | 是 | 自增 | — | PK | |
| plan_id | 所属方案ID | BIGINT | 是 | — | — | FK → simulation_plan | |
| constraint_type | 约束类型 | VARCHAR(30) | 是 | — | constraint_type 枚举 | NOT NULL | 见 A5 枚举 |
| is_enabled | 是否启用 | BOOLEAN | 是 | TRUE | — | NOT NULL | FALSE 表示该约束在本次模拟中忽略 |
| config_params | 约束参数 | JSON | 否 | {} | — | — | 与 constraint_type 对应的结构化参数，例如 EQUIPMENT_FAILURE 时包含 mtbf_override、mttr_override |

**典型 config_params 示例（LABOR 类型）**：
```json
{
  "max_overtime_hours_per_day": 2,
  "min_headcount_ratio": 0.8,
  "allow_cross_line_transfer": false
}
```

---

### A4.3 ParameterOverride（参数覆写）

| 字段名 | 中文名 | 类型 | 是否必填 | 默认值 | 枚举/字典 | 约束 | 说明 |
|---|---|---|---|---|---|---|---|
| override_id | 覆写ID | BIGINT | 是 | 自增 | — | PK | |
| plan_id | 所属方案ID | BIGINT | 是 | — | — | FK → simulation_plan | |
| target_type | 目标对象类型 | VARCHAR(20) | 是 | — | GLOBAL/LINE/STAGE/OPERATION/EQUIPMENT | NOT NULL | 决定 target_id 的含义；GLOBAL 时 target_id 为 NULL |
| target_id | 目标对象ID | BIGINT | 否 | NULL | — | — | target_type=GLOBAL 时为 NULL |
| param_name | 参数名 | VARCHAR(100) | 是 | — | — | NOT NULL | 如 standard_ct、yield_rate、mtbf_hours |
| override_value | 覆写值 | VARCHAR(500) | 是 | — | — | NOT NULL | 统一以字符串存储，使用方解析为对应类型 |
| time_range_start | 覆写生效开始时间 | DATETIME | 否 | NULL | — | — | NULL 表示从仿真开始即生效 |
| time_range_end | 覆写生效结束时间 | DATETIME | 否 | NULL | — | — | NULL 表示到仿真结束持续生效 |

**说明**：同一 (plan_id, target_type, target_id, param_name) 组合若存在时间段重叠的多条记录，引擎取最新 override_id 的记录生效。

---

### A4.4 AnomalyInjection（异常注入）

| 字段名 | 中文名 | 类型 | 是否必填 | 默认值 | 枚举/字典 | 约束 | 说明 |
|---|---|---|---|---|---|---|---|
| anomaly_id | 异常ID | BIGINT | 是 | 自增 | — | PK | |
| plan_id | 所属方案ID | BIGINT | 是 | — | — | FK → simulation_plan | |
| anomaly_type | 异常类型 | VARCHAR(30) | 是 | — | anomaly_type 枚举 | NOT NULL | |
| target_id | 目标对象ID | BIGINT | 是 | — | — | NOT NULL | EQUIPMENT_FAILURE 时为 equipment_id；MATERIAL_SHORTAGE 时为 material_id |
| start_time | 异常开始时间 | DATETIME | 是 | — | — | NOT NULL | 仿真时间轴上的绝对时间，须在 plan 的 start_time~end_time 范围内 |
| duration_seconds | 异常持续时长（秒） | INT | 是 | — | — | > 0 | |
| severity | 严重程度 | FLOAT | 是 | 1.0 | — | 0 < severity ≤ 1.0 | 1.0 表示完全故障/断供；0.5 表示产能/供应减半 |

---

### A4.5 WorkOrder（工单快照）

| 字段名 | 中文名 | 类型 | 是否必填 | 默认值 | 枚举/字典 | 约束 | 说明 |
|---|---|---|---|---|---|---|---|
| wo_id | 工单ID | BIGINT | 是 | 自增 | — | PK | |
| plan_id | 所属方案ID | BIGINT | 是 | — | — | FK → simulation_plan | |
| wo_code | 工单编号 | VARCHAR(100) | 是 | — | — | NOT NULL | 来源系统的工单号，同一 plan_id 下唯一 |
| product_id | 产品ID | BIGINT | 是 | — | — | FK → product | |
| planned_qty | 计划数量 | INT | 是 | — | — | > 0 | |
| planned_start | 计划开始时间 | DATETIME | 是 | — | — | NOT NULL | |
| planned_end | 计划结束时间 | DATETIME | 是 | — | — | NOT NULL, > planned_start | |
| source_system | 来源系统 | VARCHAR(50) | 否 | — | — | — | 如 MES、ERP |
| sync_time | 同步时间 | DATETIME | 是 | — | — | NOT NULL | 数据从来源系统同步到本系统的时间戳 |

---

### A4.6 ProductionTask（生产任务）

| 字段名 | 中文名 | 类型 | 是否必填 | 默认值 | 枚举/字典 | 约束 | 说明 |
|---|---|---|---|---|---|---|---|
| task_id | 任务ID | BIGINT | 是 | 自增 | — | PK | |
| plan_id | 所属方案ID | BIGINT | 是 | — | — | FK → simulation_plan | |
| wo_id | 关联工单ID | BIGINT | 否 | NULL | — | FK → work_order | 可选；手动创建的任务可不关联工单 |
| product_id | 产品ID | BIGINT | 是 | — | — | FK → product | |
| task_qty | 任务数量 | INT | 是 | — | — | > 0 | |
| target_line_id | 目标产线ID | BIGINT | 是 | — | — | FK → production_line | 指定本任务在哪条线上执行 |
| task_seq | 执行顺序 | INT | 是 | — | — | NOT NULL | 同一产线上任务的优先级/顺序，越小越优先 |
| sync_time | 同步时间 | DATETIME | 是 | — | — | NOT NULL | |

---

### A4.7 SimulationResult（模拟结果主档）

| 字段名 | 中文名 | 类型 | 是否必填 | 默认值 | 枚举/字典 | 约束 | 说明 |
|---|---|---|---|---|---|---|---|
| result_id | 结果ID | BIGINT | 是 | 自增 | — | PK | |
| plan_id | 所属方案ID | BIGINT | 是 | — | — | FK → simulation_plan, UNIQUE | 一个方案只有一个最终结果 |
| actual_throughput | 实际产出（件） | INT | 是 | — | — | ≥ 0 | 整个仿真时间段内完成的成品总数 |
| sim_duration_seconds | 模拟时长（秒） | INT | 是 | — | — | > 0 | 仿真时间轴长度，即 end_time - start_time |
| calc_time_seconds | 计算耗时（秒） | FLOAT | 是 | — | — | > 0 | 引擎实际运行计算消耗的挂钟时间 |
| bottleneck_operation_id | 瓶颈工序ID | BIGINT | 否 | NULL | — | FK → operation | 仿真识别出的主要瓶颈工序 |
| bottleneck_utilization_rate | 瓶颈工序利用率 | FLOAT | 否 | NULL | — | 0 ≤ x ≤ 1 | 瓶颈工序的设备/人力利用率，0~1 小数表示 |
| completed_at | 完成时间 | DATETIME | 是 | — | — | NOT NULL | 引擎计算完毕的时间戳 |

---

### A4.8 LineBalanceResult（线平衡结果）

| 字段名 | 中文名 | 类型 | 是否必填 | 默认值 | 枚举/字典 | 约束 | 说明 |
|---|---|---|---|---|---|---|---|
| lbr_result_id | 线平衡结果ID | BIGINT | 是 | 自增 | — | PK | |
| result_id | 所属模拟结果ID | BIGINT | 是 | — | — | FK → simulation_result | |
| line_id | 产线ID | BIGINT | 是 | — | — | FK → production_line | |
| lbr_rate | 线平衡率 | FLOAT | 是 | — | — | 0 ≤ x ≤ 1 | 见 A6 数据口径说明 |
| takt_time_seconds | 节拍时间（秒） | FLOAT | 是 | — | — | > 0 | 该产线的目标节拍 |
| max_ct_seconds | 最长工序 CT（秒） | FLOAT | 是 | — | — | > 0 | 产线上 CT 最长的工序，即瓶颈工序 CT |
| bottleneck_operation_id | 瓶颈工序ID | BIGINT | 否 | NULL | — | FK → operation | 该产线上的局部瓶颈工序 |

---

### A4.9 AIAnalysisResult（AI 分析结果）

| 字段名 | 中文名 | 类型 | 是否必填 | 默认值 | 枚举/字典 | 约束 | 说明 |
|---|---|---|---|---|---|---|---|
| ai_result_id | AI结果ID | BIGINT | 是 | 自增 | — | PK | |
| result_id | 所属模拟结果ID | BIGINT | 是 | — | — | FK → simulation_result, UNIQUE | |
| analysis_summary | 分析摘要 | TEXT | 是 | — | — | NOT NULL | AI 生成的自然语言分析文本 |
| generated_at | 生成时间 | DATETIME | 是 | — | — | NOT NULL | AI 模型返回结果的时间戳 |

---

### A4.10 ImprovementSuggestion（改进建议）

| 字段名 | 中文名 | 类型 | 是否必填 | 默认值 | 枚举/字典 | 约束 | 说明 |
|---|---|---|---|---|---|---|---|
| suggestion_id | 建议ID | BIGINT | 是 | 自增 | — | PK | |
| ai_result_id | 所属AI结果ID | BIGINT | 是 | — | — | FK → ai_analysis_result | |
| category | 建议分类 | VARCHAR(20) | 是 | — | suggestion_category 枚举 | NOT NULL | |
| description | 建议描述 | TEXT | 是 | — | — | NOT NULL | 具体的改进措施描述 |
| expected_improvement | 预期改善效果 | VARCHAR(500) | 否 | — | — | — | 如"预计提升产线效率约 8%"，由 AI 生成 |
| priority | 优先级 | INT | 是 | — | — | 1 ≤ x ≤ 5 | 1 最高，5 最低 |

---

### A4.11 SMTCapacityResult（SMT 产能分析结果）

| 字段名 | 中文名 | 类型 | 是否必填 | 默认值 | 枚举/字典 | 约束 | 说明 |
|---|---|---|---|---|---|---|---|
| cap_result_id | SMT产能结果ID | BIGINT | 是 | 自增 | — | PK | |
| result_id | 所属模拟结果ID | BIGINT | 是 | — | — | FK → simulation_result, UNIQUE | |
| total_demand_placement_points | 总需求贴片点数 | BIGINT | 是 | — | — | ≥ 0 | 分析周期内所有产品需求的贴片点总量 |
| available_pph | 可用产能（点/小时） | FLOAT | 是 | — | — | > 0 | 当前配置下的 SMT 总 PPH 产能 |
| capacity_gap_lines | 产能缺口折算线数 | FLOAT | 否 | NULL | — | — | 负数表示富余，正数表示缺口需新增的产线数（含小数） |

---

### A4.12 SMTCapacityPeriodResult（SMT 产能周期结果）

| 字段名 | 中文名 | 类型 | 是否必填 | 默认值 | 枚举/字典 | 约束 | 说明 |
|---|---|---|---|---|---|---|---|
| period_result_id | 周期结果ID | BIGINT | 是 | 自增 | — | PK | |
| cap_result_id | 所属SMT产能结果ID | BIGINT | 是 | — | — | FK → smt_capacity_result | |
| period_type | 周期类型 | VARCHAR(10) | 是 | — | WEEK/MONTH | NOT NULL | |
| period_start | 周期开始日期 | DATE | 是 | — | — | NOT NULL | 周：周一日期；月：1 日 |
| demand_points | 需求贴片点数 | BIGINT | 是 | — | — | ≥ 0 | 本周期内的需求贴片点总量 |
| available_capacity | 可用产能（点） | BIGINT | 是 | — | — | > 0 | 本周期内考虑日历工时的实际可用产能 |
| gap | 产能缺口（点） | BIGINT | 是 | — | — | — | gap = demand_points - available_capacity；正数为缺口，负数为富余 |
| required_lines | 需要线数 | FLOAT | 否 | NULL | — | — | 若存在缺口，换算为需要新增的产线数量 |

---

### A4.13 PlanVersion（方案版本）

| 字段名 | 中文名 | 类型 | 是否必填 | 默认值 | 枚举/字典 | 约束 | 说明 |
|---|---|---|---|---|---|---|---|
| version_id | 版本ID | BIGINT | 是 | 自增 | — | PK | |
| plan_id | 所属方案ID | BIGINT | 是 | — | — | FK → simulation_plan | |
| version_no | 版本号 | INT | 是 | — | — | NOT NULL | 自增整数，同一 plan_id 下唯一 |
| version_name | 版本名称 | VARCHAR(200) | 否 | — | — | — | 用户自定义版本描述，如"调整设备 CT 参数后" |
| snapshot_data | 版本快照数据 | JSON | 是 | — | — | NOT NULL | 包含方案全量参数配置的 JSON 快照，含 ParameterOverride、SoftConstraintConfig、AnomalyInjection 等 |
| created_at | 创建时间 | DATETIME | 是 | NOW() | — | NOT NULL | |
| created_by | 创建人 | VARCHAR(100) | 是 | — | — | NOT NULL | |

---

### A4.14 SimulationStateSnapshot（模拟状态快照）

| 字段名 | 中文名 | 类型 | 是否必填 | 默认值 | 枚举/字典 | 约束 | 说明 |
|---|---|---|---|---|---|---|---|
| snap_id | 快照ID | BIGINT | 是 | 自增 | — | PK | |
| result_id | 所属模拟结果ID | BIGINT | 是 | — | — | FK → simulation_result | |
| sim_time | 仿真时间点 | DATETIME | 是 | — | — | NOT NULL | 快照对应的仿真时间轴上的时间点 |
| state_data | 状态数据 | JSON BLOB | 是 | — | — | NOT NULL | 该时间点所有设备、缓冲区、WIP 的状态 JSON，结构见引擎接口规范 |
| snap_interval_seconds | 快照间隔（秒） | INT | 是 | — | — | > 0 | 生成此快照时使用的采样间隔，用于回放 |

---

### A4.15 基础数据层核心表字段简表

#### Factory

| 字段名 | 中文名 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| factory_id | 工厂ID | BIGINT | 是 | PK |
| factory_code | 工厂代码 | VARCHAR(50) | 是 | 唯一 |
| factory_name | 工厂名称 | VARCHAR(200) | 是 | |
| timezone | 时区 | VARCHAR(50) | 是 | 如 Asia/Shanghai |

#### Stage

| 字段名 | 中文名 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| stage_id | 工段ID | BIGINT | 是 | PK |
| factory_id | 工厂ID | BIGINT | 是 | FK |
| stage_code | 工段代码 | VARCHAR(50) | 是 | |
| stage_name | 工段名称 | VARCHAR(200) | 是 | |
| stage_type | 工段类型 | VARCHAR(20) | 是 | 枚举：SMT/BACKEND/ASSEMBLY |

#### ProductionLine

| 字段名 | 中文名 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| line_id | 产线ID | BIGINT | 是 | PK |
| stage_id | 工段ID | BIGINT | 是 | FK |
| line_code | 产线代码 | VARCHAR(50) | 是 | |
| line_name | 产线名称 | VARCHAR(200) | 是 | |
| smt_pph | SMT理论PPH | FLOAT | 否 | SMT产线专用，每小时贴片点数 |

#### Equipment

| 字段名 | 中文名 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| equipment_id | 设备ID | BIGINT | 是 | PK |
| operation_id | 工序ID | BIGINT | 是 | FK |
| equipment_code | 设备编号 | VARCHAR(100) | 是 | |
| equipment_type | 设备类型 | VARCHAR(50) | 是 | |
| standard_ct | 标准节拍时间（秒） | FLOAT | 是 | 设备处理单件的标准工时 |

#### EquipmentFailureParam

| 字段名 | 中文名 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| equipment_id | 设备ID | BIGINT | 是 | PK & FK |
| mtbf_hours | 平均故障间隔（小时） | FLOAT | 是 | Mean Time Between Failures |
| mttr_hours | 平均修复时间（小时） | FLOAT | 是 | Mean Time To Repair |
| failure_distribution | 故障分布类型 | VARCHAR(30) | 是 | 如 EXPONENTIAL、WEIBULL |

#### BOPProcess

| 字段名 | 中文名 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| process_id | 工艺工序ID | BIGINT | 是 | PK |
| bop_id | BOP ID | BIGINT | 是 | FK |
| operation_id | 工序ID | BIGINT | 是 | FK |
| seq_no | 工序顺序号 | INT | 是 | BOP 内工序执行顺序 |
| std_ct_seconds | 标准CT（秒） | FLOAT | 是 | 工艺层面的标准工时；SMT工序中若存在拼板则通过 ct_per_panel ÷ panel_qty 计算 |
| yield_rate | 良品率 | FLOAT | 是 | 0~1，如 0.98 表示 98% 良品 |
| takt_time | 节拍时间（秒） | FLOAT | 否 | 由产能规划计算得出，不可直接编辑 |
| required_headcount | 所需人数 | INT | 否 | 标准作业所需的工人人数 |
| min_worker_count | 最少操作人数 | INT | 否 | 完成该工序所需的最少人数，低于此值时工序无法启动 |
| primary_material_type | 主要物料类型 | VARCHAR(50) | 否 | 该工序消耗的主要物料类型标识，用于物料需求计算 |
| panel_qty | 拼板数量 | INT | 否 | SMT工序专用；一次过炉的拼板数量，standard_ct = ct_per_panel ÷ panel_qty |
| ct_per_panel | 拼板节拍时间（秒） | DECIMAL(10,3) | 否 | SMT工序专用；加工单拼板所需时间（秒），panel_qty 不为 NULL 时必填 |
| sop_ref | SOP文件链接 | VARCHAR(500) | 否 | 该工序标准作业规程（SOP）文件的外部链接 |
| sop_content | SOP正文 | TEXT | 否 | SOP 内嵌文本内容，支持 Markdown 格式 |

#### BOPProcessParam

| 字段名 | 中文名 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| param_id | 参数ID | BIGINT | 是 | PK |
| process_id | 所属工艺工序ID | BIGINT | 是 | FK → BOPProcess |
| param_key | 参数键 | VARCHAR(100) | 是 | 如 temperature、pressure、speed |
| param_value | 参数值 | VARCHAR(500) | 是 | 统一以字符串存储 |
| param_unit | 参数单位 | VARCHAR(50) | 否 | 如 ℃、Pa、m/s |
| upper_limit | 参数上限 | VARCHAR(100) | 否 | 工艺控制上限，越界时在方案配置中显示警告 |
| lower_limit | 参数下限 | VARCHAR(100) | 否 | 工艺控制下限，越界时在方案配置中显示警告 |
| description | 参数说明 | VARCHAR(500) | 否 | 参数含义及注意事项 |

#### BOPProcessNGType

| 字段名 | 中文名 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| bop_ng_id | 记录ID | BIGINT | 是 | PK |
| process_id | 所属工艺工序ID | BIGINT | 是 | FK → BOPProcess |
| ng_type_id | 不良类型ID | BIGINT | 是 | FK → NGType |
| ng_rate | 该工序的不良率 | FLOAT | 是 | 0~1，该不良类型在此工序的发生概率 |
| occurrence_rate | 历史发生占比 | DECIMAL(5,4) | 否 | 该不良在此工序所有不良中的历史占比（0~1.0），用于不良分析占比图 |

#### Material

| 字段名 | 中文名 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| material_id | 物料ID | BIGINT | 是 | PK |
| material_code | 物料编码 | VARCHAR(100) | 是 | 唯一，来自主数据平台 |
| material_name | 物料名称 | VARCHAR(200) | 是 | |
| material_type | 物料类型 | VARCHAR(30) | 是 | 枚举：RAW（原料）/SEMI_FINISHED（半成品）/CONSUMABLE（辅材） |
| unit | 计量单位 | VARCHAR(20) | 是 | 如 PCS、KG、REEL |
| smt_placement_points | SMT半成品置件点数 | INT | 否 | 仅 material_type=SEMI_FINISHED 且属于 SMT 工段的半成品使用；每片半成品包含的贴片点数，用于 SMT 产能规划分析中 BOM 拆解和产能需求计算 |

---

## A5. 枚举与字典清单

### A5.1 plan_status（方案状态）

| 枚举值 | 中文名 | 说明 |
|---|---|---|
| DRAFT | 草稿 | 方案创建后的初始状态，可自由修改所有参数 |
| READY | 就绪 | 参数校验通过，可提交运行；此状态下仍可修改但会重置为 DRAFT |
| RUNNING | 运行中 | 仿真引擎正在计算，禁止修改方案参数 |
| COMPLETED | 已完成 | 仿真计算完毕，结果可查看；可创建新版本再运行 |
| ARCHIVED | 已归档 | 方案已归档，只读，不可再运行 |

### A5.2 simulation_type（模拟类型）

| 枚举值 | 中文名 | 说明 |
|---|---|---|
| PRODUCTION | 生产过程模拟 | 全流程生产仿真，关注产出、在制品、设备利用率 |
| LINE_BALANCE | 线平衡模拟 | 专项分析各工序 CT 分布，计算线平衡率 |
| SMT_CAPACITY | SMT产能规划分析 | 面向 SMT 产线，按周/月分析贴片点需求与产能缺口 |
| COMBINED | 组合模拟 | 同时启用多个仿真器，结果汇总呈现 |

### A5.3 anomaly_type（异常类型）

| 枚举值 | 中文名 | 说明 |
|---|---|---|
| EQUIPMENT_FAILURE | 设备停机 | 指定设备在指定时间段内按 severity 比例降低或停止运作 |
| MATERIAL_SHORTAGE | 物料供应延迟 | 指定物料的供应计划按 severity 比例延迟到货 |

### A5.4 constraint_type（软约束类型）

| 枚举值 | 中文名 | 说明 |
|---|---|---|
| EQUIPMENT_FAILURE | 设备故障约束 | 是否将设备故障参数（MTBF/MTTR）纳入仿真 |
| MATERIAL_SUPPLY | 原材料供应约束 | 是否考虑物料到货时间对生产的影响 |
| AGV_TRANSPORT | AGV运输约束 | 是否考虑 AGV 运输时间对工序转移的影响 |
| WIP_BUFFER_CAPACITY | 线边仓容量约束 | 是否考虑线边缓冲区容量限制导致的阻塞 |
| LABOR | 人力约束 | 是否考虑人力配置限制和加班规则 |

### A5.5 warehouse_type（仓库类型）

| 枚举值 | 中文名 | 说明 |
|---|---|---|
| RAW | 原料仓 | 存放生产所需原材料和辅材 |
| WIP | 半成品仓 | 存放工序间流转的半成品 |
| FG | 成品仓 | 存放已完成生产的成品 |

### A5.6 suggestion_category（改进建议分类）

| 枚举值 | 中文名 | 说明 |
|---|---|---|
| EQUIPMENT | 设备 | 设备配置、维护策略、CT 参数相关建议 |
| LABOR | 人力 | 人员配置、排班、技能提升相关建议 |
| LOGISTICS | 物流 | 物料配送、AGV 调度、仓储布局相关建议 |
| PROCESS | 工艺 | 工艺参数优化、工序合并/拆分相关建议 |

### A5.7 stage_type（工段类型）

| 枚举值 | 中文名 | 说明 |
|---|---|---|
| SMT | SMT制程 | 表面贴装工段，含印刷、贴片、回流焊等工序 |
| BACKEND | 后工段 | SMT 之后的工序，如波峰焊、检测等 |
| ASSEMBLY | 组装 | 最终组装工段 |

### A5.8 operation_type（工序类型）

| 枚举值 | 中文名 | 说明 |
|---|---|---|
| PRINT | 锡膏印刷 | SMT 工段的锡膏印刷工序 |
| PLACEMENT | 贴片 | SMT 工段的元件贴装工序 |
| REFLOW | 回流焊 | SMT 工段的回流焊接工序 |
| INSPECTION | 检测 | 包括 AOI、AXI、ICT 等检测工序 |
| WAVE_SOLDER | 波峰焊 | 后工段的波峰焊接工序 |
| MANUAL | 手工 | 需要人工操作的工序 |

### A5.9 period_type（周期类型，SMT产能分析用）

| 枚举值 | 中文名 | 说明 |
|---|---|---|
| WEEK | 周 | 以自然周为分析颗粒度，period_start 为周一 |
| MONTH | 月 | 以自然月为分析颗粒度，period_start 为月初第一天 |

---

## A6. 数据口径与对账规范

### A6.1 线平衡率（LBR）计算口径

**适用范围**：产线级（串联工位），用于产线改善、节拍改善、人员配置优化。

**公式**：

```
LBR = Σ(Ti) / (CT_bottleneck × N_total) × 100%
```

| 符号 | 含义 |
|------|------|
| Ti | 第 i 个工位/设备标准工时（秒） |
| CT_bottleneck | 瓶颈工时 = 产线最慢工位时间（即 `max_ct_seconds`） |
| N_total | 产线总作业人数（注意：是**人数**，不是工位数） |

- **存储字段**：`line_balance_result.lbr_rate`（0~1 小数）
- **显示**：前端展示时换算为百分比，保留一位小数
- **判定标准**：LBR ≥ 85% 为高效产线；平衡损失率 b = 1 - LBR

> **重要说明**：LBR 只适用于产线（串联关系）；车间、工厂等并联结构使用"负荷平衡率"，不能套用 LBR 公式。

### A6.1.1 工序/车间/工厂 负荷平衡率计算口径

**工序级负荷率**（一个工序 → 多条并联产线）：

```
负荷率_工序 = 工序总需求工时 / 工序总可用工时 × 100%
工序总需求工时 = 计划产量 × 单品标准工时
工序总可用工时 = 该工序所有产线可用工时之和
```

**车间级负荷率**（多个工序汇总）：

```
负荷率_车间 = Σ各工序需求工时 / Σ各工序可用工时 × 100%
```

**工厂级负荷率**（多个车间汇总）：

```
负荷率_工厂 = Σ所有车间需求工时 / Σ所有车间可用工时 × 100%
```

- **负荷率 > 100%**：产能过载，需加班/加线/外协
- **负荷率 50%~80%**：产能合理利用
- **负荷率 < 50%**：产能大量闲置，可考虑减线或混线生产

### A6.2 设备利用率计算口径

**公式**：

```
设备利用率 = 设备有效加工时间 / (仿真总时长 - 非工作时间) × 100%
```

- **有效加工时间**：设备实际处于加工状态的时间（不含等待、故障、保养时间）
- **仿真总时长**：`simulation_result.sim_duration_seconds`
- **非工作时间**：根据 `WorkCalendar` 和 `Shift` 计算的非班次时间
- **瓶颈判定**：利用率最高的工序即为瓶颈，存入 `bottleneck_utilization_rate`

### A6.3 SMT 产能缺口计算口径

**公式**：

```
需求贴片点数(期间) = Σ(产品需求量 × 产品BOM贴片点数)
可用产能(期间) = Σ产线PPH × 有效工作小时数
产能缺口(点) = 需求贴片点数 - 可用产能
产能缺口折算线数 = MAX(0, 产能缺口 / 单线可用产能)
```

- **有效工作小时数**：基于 `WorkCalendar` + `Shift` 计算的排班工时
- **存储字段**：`smt_capacity_period_result.gap`（正数为缺口，负数为富余）

### A6.4 实际产出（Throughput）计算口径

- **定义**：仿真时间段内通过最终工序（BOP 中 seq_no 最大且 is_key_operation=true 的工序）并判定为合格品的数量
- **不含**：在制品（WIP）、不良品（NG 件）、尚未完成的工单数量
- **存储字段**：`simulation_result.actual_throughput`

### A6.5 数据版本对账

- 每次模拟方案运行前，系统记录 `simulation_plan.base_data_version`，标识本次仿真使用的主数据快照版本
- 若基础数据在方案运行后发生变更，系统在方案详情页展示版本差异警告
- 基础数据层字段以**只读同步**方式引入，运营模拟不直接修改主数据平台数据

---

## A7. 数据迁移与初始化

### A7.1 基础数据同步机制

基础数据层所有对象均从**主数据平台（MDM Platform）**同步，运营模拟系统对其**只读**。

| 同步对象 | 同步方式 | 同步频率 | 说明 |
|---|---|---|---|
| Factory / Stage / ProductionLine | 全量同步 | 按需（人工触发或每日凌晨） | 组织架构变更频率低 |
| Operation / Equipment / EquipmentFailureParam | 全量同步 | 每日凌晨 | 设备新增/退役后次日生效 |
| BOP / BOPProcess | 版本快照同步 | 按需触发 | 仅同步 is_active=true 的版本 |
| Product / Material / NGType / WorkerType | 全量同步 | 每日凌晨 | |
| WorkCalendar / Shift | 增量同步 | 每日凌晨 | 仅同步 effective_date ≥ 今日的记录 |
| WIPBuffer / StaffingConfig | 全量同步 | 每日凌晨 | |

### A7.2 业务数据快照同步机制

业务数据快照层数据在创建或刷新模拟方案时，从对应业务系统拉取并存入方案隔离的快照表。

| 快照对象 | 来源系统 | 拉取时机 | 说明 |
|---|---|---|---|
| WorkOrder | MES / ERP | 方案创建时 / 手动刷新 | 拉取方案时间范围内的工单 |
| ProductionTask | MES 派工系统 | 方案创建时 / 手动刷新 | |
| MaterialSupply | SCM / 采购系统 | 方案创建时 / 手动刷新 | |
| InventorySnapshot | WMS | 方案创建时 | 取快照时刻的库存数量 |
| WIPBufferSnapshot | MES | 方案创建时 | 取快照时刻的线边在制品数量 |
| DemandForecast | APS / 销售预测系统 | 方案创建时 / 手动刷新 | |

### A7.3 初始化检查清单

新环境部署后，数据初始化需按以下顺序执行：

1. 从主数据平台同步 Factory、Stage、ProductionLine
2. 同步 Operation、Equipment、EquipmentFailureParam
3. 同步 WIPBuffer、StaffingConfig、Warehouse
4. 同步 WorkCalendar、Shift
5. 同步 Product、Material、NGType、WorkerType
6. 同步 BOP（仅当前激活版本）、BOPProcess、BOPProcessParam、BOPProcessNGType
7. 同步 OperationTransition
8. 验证各表数据完整性（外键约束、枚举值合法性）
9. 创建系统管理员账号和默认角色
10. 执行一次端到端冒烟测试（创建测试方案 → 运行 → 查看结果）
