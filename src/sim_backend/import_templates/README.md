# 数据导入模板

对应 `POST /api/v1/imports/{section_id}:validate` / `:commit` 两步式导入。
每个文件 = 一个 section 的最小模板（表头 + 2 行示例）。

| 文件 | section_id | 必填列 |
|---|---|---|
| production-tasks.csv | `production-tasks` | 工单号 / 产线 / 产品型号 / 计划产量 |
| material-supply.csv | `material-supply` | 物料编码 / 物料名称 / 供应数量 / 到货时间 / 仓库 |
| inventory.csv | `inventory` | 仓库 / 物料编码 / 库存总量 / 可用量 / 快照时间 |
| wip.csv | `wip` | 线边仓 / 物料编码 / 当前数量 / 占用体积 / 快照时间 |

## 规则要点

- 文件 ≤ 10MB，`.csv` / `.xlsx` / `.xls`；第 1 行必须是表头，列名需与上表完全一致。
- **产线 / 仓库 / 线边仓**：填编码或名称均可；方案已建快照时，须与该方案快照内的编码一致
  （快照不改编码，通常等于主数据编码）。
- **产品型号**：填 `product_code`（如 PG548 / PG549）。
- **工单号**：必须是**本方案已存在的工单**（工单当主数据看，由 seed/ERP 提供、
  建方案时随快照克隆，**不支持手工导入**）。seed 提供 WO-001(PG548)/WO-002(PG549)，
  填库里没有的工单号会校验报错。
- **到货时间**（material-supply）：填相对方案起点的小时数（如 `2.5`）或日期时间二选一；
  填日期时间时落库按 0 小时处理。
- 日期时间格式：`YYYY-MM-DD[ HH:MM[:SS]]` 或 `YYYY/MM/DD[ HH:MM[:SS]]`。
- 数字可带千分位逗号；error 整批拒绝，warning 默认放行。

> 注意：示例里的仓库 `WH_RAW_01` / 线边仓 `WIP_MM01_*` / 物料编码均为占位，
> 当前 seed 数据未建仓库与线边仓主数据，material-supply / inventory / wip
> 导入需先有对应主数据；production-tasks 的产线编码 `L_HST_MM_01` 等已存在于 seed。
