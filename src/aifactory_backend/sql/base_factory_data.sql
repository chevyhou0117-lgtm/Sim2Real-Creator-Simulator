
-- 显示工厂基础信息表
CREATE TABLE base_factory (

    factory_id BIGINT PRIMARY KEY,
    factory_name VARCHAR(255) NOT NULL,  -- 现实名称：深圳一厂
    factory_code VARCHAR(50) UNIQUE,
    site_length DECIMAL(10, 2),          -- 现实物理长度
    site_width DECIMAL(10, 2),           -- 现实物理宽度
    location TEXT,
    timezone VARCHAR(50) NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_factory_name UNIQUE (factory_name),
    CONSTRAINT chk_factory_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE INDEX idx_factory_code ON base_factory(factory_code);
CREATE INDEX idx_factory_status ON base_factory(status);


-- 3. 制程表
CREATE TABLE base_stage (
    stage_id BIGINT PRIMARY KEY,
    factory_id BIGINT NOT NULL,
    stage_code VARCHAR(50) NOT NULL,
    stage_name VARCHAR(200) NOT NULL,
    sequence INTEGER NOT NULL,
    stage_type_id BIGINT NOT NULL,
    line_count INTEGER,
    status VARCHAR(20) NOT NULL,
    creator_binding_id VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- 外键1：关联工厂
    CONSTRAINT fk_stage_factory
        FOREIGN KEY (factory_id)
        REFERENCES base_factory(factory_id)
        ON DELETE RESTRICT,
    -- RESTRICT: 如果字典项正在被制程使用类型
    CONSTRAINT fk_stage_type_dict
        FOREIGN KEY (stage_type_id)
        REFERENCES dict_stage_type(stage_type_id)
        ON DELETE RESTRICT,
    CONSTRAINT uq_factory_stage_code UNIQUE (factory_id, stage_code),
    CONSTRAINT chk_stage_status CHECK (status IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT chk_stage_sequence CHECK (sequence > 0)
);


-- 索引
CREATE INDEX idx_stage_factory_id ON base_stage(factory_id);
CREATE INDEX idx_stage_status ON base_stage(status);
-- 新增索引：按类型过滤查询制程
CREATE INDEX idx_stage_type_dict_id ON base_stage(stage_type_id);




-- 基础线体表
CREATE TABLE base_production_line (
    line_id BIGINT PRIMARY KEY,  -- 主键(雪花ID)
    stage_id BIGINT NOT NULL,    -- 所属制程（外键→Stage）
    line_code VARCHAR(50) NOT NULL,  -- 线体编码（制程内唯一）
    line_name VARCHAR(200) NOT NULL, -- 线体名称（如 A面线、B面线）
    smt_pph DECIMAL(10,2),  -- 线体每小时置件点数（Points Per Hour）
    operation_count INTEGER,  -- 线体内工序总数（汇总）
    status VARCHAR(20) NOT NULL,  -- ACTIVE / INACTIVE / MAINTENANCE
    sort_order INTEGER,  -- 制程内显示排序
    creator_binding_id VARCHAR(100),  -- AI Factory Creator 中的绑定对象 ID
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 外键1：关联制程
    CONSTRAINT fk_line_stage
        FOREIGN KEY (stage_id)
        REFERENCES base_stage(stage_id)
        ON DELETE RESTRICT,

    -- 约束：线体编码在制程内唯一
    CONSTRAINT uq_stage_line_code UNIQUE (stage_id, line_code),

    -- 约束：状态检查
    CONSTRAINT chk_line_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE'))
);

-- 索引
CREATE INDEX idx_production_line_stage_id ON base_production_line(stage_id);
CREATE INDEX idx_production_line_status ON base_production_line(status);
CREATE INDEX idx_production_line_smt_pph ON base_production_line(smt_pph);
CREATE INDEX idx_production_line_sort_order ON base_production_line(sort_order);




-- 基础线体工序表
CREATE TABLE base_stage_operation (

    operation_id BIGINT PRIMARY KEY,  -- 主键(雪花ID)
    stage_id BIGINT NOT NULL,  -- 所属制程阶段（外键→BaseStage）
    operation_code VARCHAR(50) NOT NULL,  -- 工序编码（制程内唯一）
    operation_name VARCHAR(200) NOT NULL,  -- 工序名称（如锡膏印刷、贴片、回流焊、AOI检测）
    sequence INTEGER NOT NULL,  -- 在制程中的顺序（从1开始）
    operation_type VARCHAR(50),  -- 工序类型：SOLDER_PASTE / PLACEMENT / REFLOW / AOI / WAVE_SOLDER / MANUAL / OTHER
    is_key_operation BOOLEAN NOT NULL DEFAULT FALSE,  -- 是否关键工序
    status VARCHAR(20) NOT NULL,  -- ACTIVE / INACTIVE
    creator_binding_id VARCHAR(100),  -- AI Factory Creator 中的绑定对象 ID
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 外键1：关联制程阶段
    CONSTRAINT fk_operation_stage
        FOREIGN KEY (stage_id)
        REFERENCES base_stage(stage_id)
        ON DELETE RESTRICT,

    -- 约束：工序编码在制程内唯一
    CONSTRAINT uq_stage_operation_code UNIQUE (stage_id, operation_code),

    -- 约束：顺序必须为正整数
    CONSTRAINT chk_operation_sequence CHECK (sequence > 0),

    -- 约束：状态检查
    CONSTRAINT chk_operation_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

-- 索引
CREATE INDEX idx_operation_stage_id ON base_stage_operation(stage_id);
CREATE INDEX idx_operation_status ON base_stage_operation(status);
CREATE INDEX idx_operation_sequence ON base_stage_operation(sequence);
CREATE INDEX idx_operation_operation_type ON base_stage_operation(operation_type);


-- 基础设备表
CREATE TABLE base_equipment (

    equipment_id BIGINT PRIMARY KEY,  -- 主键(雪花ID)
    operation_id BIGINT NOT NULL,     -- 所属工序（外键→Operation）
    equipment_code VARCHAR(50) NOT NULL,  -- 设备编码（工厂内唯一）
    equipment_name VARCHAR(200) NOT NULL,  -- 设备名称
    equipment_type VARCHAR(50) NOT NULL,  -- 设备类型（见枚举 4.3）
    manufacturer VARCHAR(200),  -- 设备厂商
    model_no VARCHAR(100),  -- 设备型号
    standard_ct DECIMAL(10,3),  -- 设备标准节拍（秒）
    status VARCHAR(20) NOT NULL,  -- ACTIVE / INACTIVE / MAINTENANCE
    sort_order INTEGER,  -- 工序内设备显示排序
    creator_binding_id VARCHAR(100),  -- AI Factory Creator 中的绑定对象 ID
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 外键约束：关联工序
    CONSTRAINT fk_equipment_operation
        FOREIGN KEY (operation_id)
        REFERENCES base_line_operation(operation_id)
        ON DELETE RESTRICT,

    -- 约束：设备编码全局唯一
    CONSTRAINT uq_equipment_code UNIQUE (equipment_code),

    -- 约束：状态检查
    CONSTRAINT chk_equipment_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE'))
);

-- 索引
CREATE INDEX idx_equipment_operation_id ON base_equipment(operation_id);
CREATE INDEX idx_equipment_status ON base_equipment(status);
CREATE INDEX idx_equipment_equipment_type ON base_equipment(equipment_type);
CREATE INDEX idx_equipment_sort_order ON base_equipment(sort_order);




-- 设备故障参数表
CREATE TABLE base_equipment_failure_param (
    param_id BIGINT PRIMARY KEY,  -- 主键(雪花ID)
    equipment_id BIGINT NOT NULL,  -- 设备 ID（外键→Equipment，1:1）
    mtbf_hours DECIMAL(10,2) NOT NULL,  -- 平均无故障间隔（小时）
    mttr_minutes DECIMAL(10,2) NOT NULL,  -- 平均维修时间（分钟）
    failure_distribution VARCHAR(20) NOT NULL DEFAULT 'EXPONENTIAL',  -- 故障分布模型
    data_source VARCHAR(100),  -- 数据来源说明
    effective_date DATE,  -- 参数生效日期
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 外键约束：关联设备（1:1关系）
    CONSTRAINT fk_failure_param_equipment
        FOREIGN KEY (equipment_id)
        REFERENCES base_equipment(equipment_id)
        ON DELETE CASCADE,  -- 设备删除时级联删除故障参数

    -- 约束：故障分布模型检查
    CONSTRAINT chk_failure_distribution CHECK (failure_distribution IN ('EXPONENTIAL', 'NORMAL', 'WEIBULL'))
);

-- 索引
CREATE INDEX idx_failure_param_equipment_id ON base_equipment_failure_param(equipment_id);
CREATE INDEX idx_failure_param_effective_date ON base_equipment_failure_param(effective_date);
CREATE INDEX idx_failure_param_mtbf_mttr ON base_equipment_failure_param(mtbf_hours, mttr_minutes);






-- 线边仓表
CREATE TABLE base_wip_buffer (
    wip_id BIGINT PRIMARY KEY,  -- 主键(雪花ID)
    line_id BIGINT NOT NULL,    -- 所属产线（外键→ProductionLine）
    wip_code VARCHAR(50) NOT NULL,  -- 线边仓编码
    wip_name VARCHAR(200) NOT NULL, -- 线边仓名称
    capacity_volume DECIMAL(15,3) NOT NULL,  -- 总容量（体积单位，如 m³）
    capacity_qty INTEGER,  -- 最大存放件数（可选）
    pre_operation_id BIGINT,  -- 前置工序 ID
    post_operation_id BIGINT, -- 后置工序 ID
    location VARCHAR(200),  -- 物理位置描述
    creator_binding_id VARCHAR(100),  -- AI Factory Creator 绑定 ID
    status VARCHAR(20) NOT NULL,  -- ACTIVE / INACTIVE
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 外键约束
    CONSTRAINT fk_wip_line
        FOREIGN KEY (line_id)
        REFERENCES base_production_line(line_id)
        ON DELETE RESTRICT,

    -- 前置工序外键（可选）
    CONSTRAINT fk_wip_pre_operation
        FOREIGN KEY (pre_operation_id)
        REFERENCES base_line_operation(operation_id)
        ON DELETE SET NULL,

    -- 后置工序外键（可选）
    CONSTRAINT fk_wip_post_operation
        FOREIGN KEY (post_operation_id)
        REFERENCES base_line_operation(operation_id)
        ON DELETE SET NULL,

    -- 约束：线边仓编码在线体内唯一
    CONSTRAINT uq_line_wip_code UNIQUE (line_id, wip_code),

    -- 约束：状态检查
    CONSTRAINT chk_wip_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

-- 仓库表
CREATE TABLE base_warehouse (


    warehouse_id BIGINT PRIMARY KEY,  -- 主键(雪花ID)
    factory_id BIGINT NOT NULL,      -- 所属工厂（外键→Factory）
    warehouse_code VARCHAR(50) NOT NULL,  -- 仓库编码
    warehouse_name VARCHAR(200) NOT NULL, -- 仓库名称
    warehouse_type VARCHAR(30) NOT NULL,  -- 仓库类型（见枚举 4.4）
    location VARCHAR(200),  -- 仓库位置描述
    total_capacity DECIMAL(15,3),  -- 总容量
    creator_binding_id VARCHAR(100),  -- AI Factory Creator 绑定 ID
    status VARCHAR(20) NOT NULL,  -- ACTIVE / INACTIVE
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,



    -- 外键约束：关联工厂
    CONSTRAINT fk_warehouse_factory
        FOREIGN KEY (factory_id)
        REFERENCES base_factory(factory_id)
        ON DELETE RESTRICT,

    -- 约束：仓库编码在工厂内唯一
    CONSTRAINT uq_factory_warehouse_code UNIQUE (factory_id, warehouse_code),
    -- 约束：状态检查
    CONSTRAINT chk_warehouse_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
);
-- 索引
CREATE INDEX idx_wip_buffer_line_id ON base_wip_buffer(line_id);
CREATE INDEX idx_wip_buffer_status ON base_wip_buffer(status);
CREATE INDEX idx_warehouse_factory_id ON base_warehouse(factory_id);
CREATE INDEX idx_warehouse_status ON base_warehouse(status);
CREATE INDEX idx_warehouse_warehouse_type ON base_warehouse(warehouse_type);



-- 人员-CT关系配置表
CREATE TABLE base_staffing_config (
    staffing_id BIGINT PRIMARY KEY,  -- 主键(雪花ID)
    factory_id BIGINT NOT NULL,        -- 【新增】冗余工厂ID，用于数据隔离和约束
    operation_id BIGINT NOT NULL,    -- 工序（外键→Operation）
    worker_type_id BIGINT NOT NULL,  -- 工种（外键→WorkerType）
    worker_count INTEGER NOT NULL,   -- 该档位人数配置
    ct_with_this_count DECIMAL(10,3) NOT NULL,  -- 该人数下对应的 CT（秒）
    is_standard BOOLEAN NOT NULL,    -- 是否为 BOP 定义的标准配置
    effective_date DATE,             -- 生效日期
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 外键约束：关联工序
    CONSTRAINT fk_staffing_operation
        FOREIGN KEY (operation_id)
        REFERENCES base_line_operation(operation_id)
        ON DELETE RESTRICT,

    -- 外键约束：关联工种字典表
    CONSTRAINT fk_staffing_worker_type
        FOREIGN KEY (worker_type_id)
        REFERENCES dict_worker_type(worker_type_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_staffing_factory FOREIGN KEY (factory_id) REFERENCES base_factory(factory_id),
    -- 约束：同一工序下，同一种工种只能有一条标准配置
    CONSTRAINT uq_operation_worker_type_standard UNIQUE (operation_id, worker_type_id, is_standard),

    -- 约束：人数必须大于0
    CONSTRAINT chk_staffing_worker_count CHECK (worker_count > 0),

    -- 约束：CT必须大于0
    CONSTRAINT chk_staffing_ct CHECK (ct_with_this_count > 0)
);
-- 索引
CREATE INDEX idx_staffing_config_operation_id ON base_staffing_config(operation_id);
CREATE INDEX idx_staffing_config_worker_type_id ON base_staffing_config(worker_type_id);
CREATE INDEX idx_staffing_config_is_standard ON base_staffing_config(is_standard);
CREATE INDEX idx_staffing_config_effective_date ON base_staffing_config(effective_date);



-- 工厂-工种 关联表， 工厂和工种的关联关系
CREATE TABLE factory_worker_type_rel (
    factory_id BIGINT NOT NULL, -- 所属工厂 ID（外键→Factory）
    worker_type_id BIGINT NOT NULL, -- 全局工种 ID（外键→dict_worker_type）
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 创建时间

    -- 联合主键：确保同一个工种在同一个工厂下只能被关联一次
    PRIMARY KEY (factory_id, worker_type_id),

    -- 外键约束
    CONSTRAINT fk_rel_fw_factory
        FOREIGN KEY (factory_id)
        REFERENCES base_factory(factory_id)
        ON DELETE CASCADE, -- 工厂删除时，级联删除该工厂下的工种关联配置

    CONSTRAINT fk_rel_fw_worker_type
        FOREIGN KEY (worker_type_id)
        REFERENCES dict_worker_type(worker_type_id)
        ON DELETE RESTRICT -- 全局字典被引用时，禁止删除（保护基础数据）
);
-- 虽然联合主键已经包含了 factory_id 的索引，但为了按工种反查工厂，仍需单独为 worker_type_id 建索引
CREATE INDEX idx_rel_fw_worker_type_id ON factory_worker_type_rel(worker_type_id);



