-- 类型字典维护
-- 1. 制程类型字典维护
CREATE TABLE dict_stage_type (
    stage_type_id BIGINT PRIMARY KEY,        -- 主键(雪花ID) - 字段名更具体
    stage_type_code VARCHAR(50) NOT NULL,          -- 类型编码 (如: SMT, WAVE_SOLDER) - 去掉了 dict_ 前缀
    stage_type_name VARCHAR(200) NOT NULL,         -- 类型名称 (如: SMT制程, 波峰焊制程) - label 改为更直观的 name
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_stage_type_code UNIQUE (stage_type_code)
);
-- 索引
CREATE INDEX idx_dict_stage_type_status ON dict_stage_type(status);


-- 设备类型字典表
CREATE TABLE dict_equipment_type (
    equipment_type_id BIGINT PRIMARY KEY,    -- 主键(雪花ID)
    equipment_type_code VARCHAR(50) NOT NULL,          -- 类型编码 (如: SMT_MACHINE, AGV)
    equipment_type_name VARCHAR(200) NOT NULL,         -- 类型名称 (如: 贴片机, AGV小车)
    description VARCHAR(500),                -- 补充说明 (对应你表格里的"说明"列，字典表通常带个备注字段比较好)
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 约束：类型编码全局唯一
    CONSTRAINT uq_equipment_type_code UNIQUE (equipment_type_code)
);
-- 索引
CREATE INDEX idx_dict_equipment_type_status ON dict_equipment_type(status);


INSERT INTO dict_equipment_type (equipment_type_id, equipment_type_code, equipment_type_name, description, status) VALUES
(1, 'SMT_MACHINE', '贴片机', '表面贴装设备', 'ACTIVE'),
(2, 'SOLDER_PASTE_PRINTER', '锡膏印刷机', '含 SPI 检测环节', 'ACTIVE'),
(3, 'REFLOW_OVEN', '回流炉', '回流焊设备', 'ACTIVE'),
(4, 'WAVE_SOLDER', '波峰焊机', '选择性波峰焊', 'ACTIVE'),
(5, 'AOI', 'AOI检测设备', '自动光学检测仪', 'ACTIVE'),
(6, 'ROBOT', '机器人/机械臂', '点胶机、锁螺丝机等自动化设备', 'ACTIVE'),
(7, 'AGV', 'AGV小车', '自动导引运输车', 'ACTIVE'),
(8, 'WORKSTATION', '人工工位', '手工作业工位', 'ACTIVE'),
(9, 'OTHER', '其他', '未分类设备', 'ACTIVE');




-- 仓库类型字典表
CREATE TABLE dict_warehouse_type (
    warehouse_type_id BIGINT PRIMARY KEY,    -- 主键(雪花ID)
    warehouse_type_code VARCHAR(50) NOT NULL,          -- 类型编码 (如: RAW_MATERIAL, FINISHED_GOODS)
    warehouse_type_name VARCHAR(200) NOT NULL,         -- 类型名称 (如: 原材料仓, 成品仓)
    description VARCHAR(500),                -- 补充说明 (如: 存放生产原材料)
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- 约束：类型编码全局唯一
    CONSTRAINT uq_warehouse_type_code UNIQUE (warehouse_type_code)
);

-- 索引
CREATE INDEX idx_dict_warehouse_type_status ON dict_warehouse_type(status);


INSERT INTO dict_warehouse_type (warehouse_type_id, warehouse_type_code, warehouse_type_name, description, status) VALUES
(1, 'RAW_MATERIAL', '原材料仓', '存放生产原材料', 'ACTIVE'),
(2, 'SEMI_FINISHED', '半成品仓', '存放在制半成品', 'ACTIVE'),
(3, 'FINISHED_GOODS', '成品仓', '存放完工成品', 'ACTIVE'),
(4, 'CONSUMABLE', '耗材仓', '存放生产耗材（锡膏、焊料等）', 'ACTIVE');




-- 工种字典表,
CREATE TABLE dict_worker_type (
    worker_type_id BIGINT PRIMARY KEY,       -- 主键(雪花ID)
    worker_type_code VARCHAR(50) NOT NULL,          -- 工种编码 (如: AOI_OPERATOR, SMT_OPERATOR)
    worker_type_name VARCHAR(200) NOT NULL,         -- 工种名称 (如: AOI检验员, 贴片操作员)
    description VARCHAR(500),                -- 补充说明 (如: 负责AOI设备操作及不良判定)
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 约束：编码全局唯一即可 (因为不再按工厂隔离了)
    CONSTRAINT uq_worker_type_code UNIQUE (worker_type_code)
);

-- 索引
CREATE INDEX idx_dict_worker_type_status ON dict_worker_type(status);




CREATE TABLE dict_ng_category (
    ng_category_id BIGINT PRIMARY KEY,
    ng_code VARCHAR(20) NOT NULL,       -- 如: D01 (少锡)
    ng_name VARCHAR(100) NOT NULL,      -- 如: 少锡
    impact_level VARCHAR(10) NOT NULL,  -- LOW/MEDIUM/HIGH (现象本身的严重度是通用的)
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT uq_ng_category_code UNIQUE (ng_code)
);
