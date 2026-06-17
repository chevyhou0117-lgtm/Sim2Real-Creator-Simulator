-- ============================================================
-- 设备扩展表（基础数据层补充）
-- 源自「5. 数据模型与业务对象」文档中的设备相关定义
-- ============================================================
-- 包含：
--   1. base_equipment 表补充字段（ALTER 语句）
--   2. base_equipment_technical_spec  设备技术规格（1:1）
--   3. base_equipment_process_param   设备过程参数（1:1）
--   4. base_equipment_bom_part        设备BOM备件（1:N，自引用树）
--   5. base_equipment_sop             设备作业指导（1:N）
--   6. base_equipment_operation_record 设备运行记录（1:N）



-- 1. base_equipment 表补充字段
--    文档中 EquipmentBase 比 SQL 中多出的字段

ALTER TABLE base_equipment
    ADD COLUMN IF NOT EXISTS brand VARCHAR(200),                -- 设备品牌
    ADD COLUMN IF NOT EXISTS line_id BIGINT,                    -- 所属产线（冗余，方便直接查询）
    ADD COLUMN IF NOT EXISTS equipment_group_id VARCHAR(50),    -- 设备组
    ADD COLUMN IF NOT EXISTS manufacture_date TIMESTAMP WITH TIME ZONE,  -- 出厂日期
    ADD COLUMN IF NOT EXISTS manufacture_code VARCHAR(50),      -- 出厂编号
    ADD COLUMN IF NOT EXISTS made_in VARCHAR(50),               -- 产地
    ADD COLUMN IF NOT EXISTS supplier VARCHAR(50),              -- 供应商
    ADD COLUMN IF NOT EXISTS supplier_phone VARCHAR(50),        -- 供应商电话
    ADD COLUMN IF NOT EXISTS purchase_date TIMESTAMP WITH TIME ZONE,     -- 购置日期
    ADD COLUMN IF NOT EXISTS service_life INTEGER,              -- 使用寿命（年）
    ADD COLUMN IF NOT EXISTS unit VARCHAR(20),                  -- 设备单位
    ADD COLUMN IF NOT EXISTS location VARCHAR(50),              -- 设备位置
    ADD COLUMN IF NOT EXISTS equipment_photo VARCHAR(1024),     -- 设备图片路径
    ADD COLUMN IF NOT EXISTS responsible_person VARCHAR(50),    -- 责任人
    ADD COLUMN IF NOT EXISTS asset_code VARCHAR(50);            -- 资产编号（来源财务系统）

-- 补充外键：line_id 关联 base_production_line
ALTER TABLE base_equipment
    DROP CONSTRAINT IF EXISTS fk_equipment_line;

ALTER TABLE base_equipment
    ADD CONSTRAINT fk_equipment_line
        FOREIGN KEY (line_id)
        REFERENCES base_production_line(line_id)
        ON DELETE SET NULL;

-- 补充索引
CREATE INDEX IF NOT EXISTS idx_equipment_line_id ON base_equipment(line_id);
CREATE INDEX IF NOT EXISTS idx_equipment_brand ON base_equipment(brand);
CREATE INDEX IF NOT EXISTS idx_equipment_asset_code ON base_equipment(asset_code);


-- 2. 设备技术规格表（1:1）
--    存储：主要技术参数(JSON)、功率、尺寸、重量
CREATE TABLE base_equipment_technical_spec (
    id BIGINT PRIMARY KEY,                                    -- 雪花ID
    equipment_id BIGINT NOT NULL,                             -- 设备 ID（外键→base_equipment，1:1）
    main_parameters JSONB,                                    -- 主要技术参数 e.g. {"temperature": "200C", "pressure": "0.2MPa"}
    power VARCHAR(50),                                        -- 设备功率
    size VARCHAR(100),                                        -- 尺寸（长x宽x高）
    weight VARCHAR(50),                                       -- 重量
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 外键：关联设备（1:1，级联删除）
    CONSTRAINT fk_tech_spec_equipment
        FOREIGN KEY (equipment_id)
        REFERENCES base_equipment(equipment_id)
        ON DELETE CASCADE,

    -- 唯一约束：每台设备只有一条技术规格
    CONSTRAINT uq_tech_spec_equipment UNIQUE (equipment_id)
);

CREATE INDEX idx_tech_spec_equipment_id ON base_equipment_technical_spec(equipment_id);


-- ============================================================
-- 3. 设备过程参数表（1:1）
--    存储：标准CT、标准良品率、标准作业效率
--    说明：BOP 未覆盖时使用此表的默认值
-- ============================================================
CREATE TABLE base_equipment_process_param (
    id BIGINT PRIMARY KEY,                                    -- 雪花ID
    equipment_id BIGINT NOT NULL,                             -- 设备 ID（外键→base_equipment，1:1）
    standard_ct DECIMAL(10,3),                                -- 设备标准节拍（秒），BOP未覆盖时使用
    standard_yield_rate DECIMAL(5,4),                         -- 设备标准良品率（0.0000~1.0000），BOP未覆盖时使用
    standard_work_efficiency DECIMAL(5,4),                    -- 设备标准作业效率（0.0000~1.0000），BOP未覆盖时使用
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 外键：关联设备（1:1，级联删除）
    CONSTRAINT fk_process_param_equipment
        FOREIGN KEY (equipment_id)
        REFERENCES base_equipment(equipment_id)
        ON DELETE CASCADE,

    -- 唯一约束：每台设备只有一条过程参数
    CONSTRAINT uq_process_param_equipment UNIQUE (equipment_id),

    -- 约束：良品率范围
    CONSTRAINT chk_yield_rate_range CHECK (standard_yield_rate IS NULL OR (standard_yield_rate >= 0 AND standard_yield_rate <= 1)),
    -- 约束：作业效率范围
    CONSTRAINT chk_work_efficiency_range CHECK (standard_work_efficiency IS NULL OR (standard_work_efficiency >= 0 AND standard_work_efficiency <= 1))
);

CREATE INDEX idx_process_param_equipment_id ON base_equipment_process_param(equipment_id);


-- 4. 设备BOM备件表（1:N，支持自引用树结构）
--    存储：备件编码、名称、型号、厂商、数量、父级关系
CREATE TABLE base_equipment_bom_part (
    id BIGINT PRIMARY KEY,                                    -- 雪花ID
    equipment_id BIGINT NOT NULL,                             -- 设备 ID（外键→base_equipment）
    part_code VARCHAR(50) NOT NULL,                           -- 备件编码
    part_name VARCHAR(200) NOT NULL,                          -- 备件名称
    part_model VARCHAR(200),                                  -- 备件型号
    part_manufacturer VARCHAR(200),                           -- 备件厂商
    part_qty INTEGER NOT NULL,                                -- 备件数量
    unit VARCHAR(50) NOT NULL,                                -- 备件单位
    parent_part_id BIGINT,                                    -- 父级 part id（自引用，支持BOM树结构）
    part_position VARCHAR(200),                               -- 备件位置（父级part的什么位置）
    part_photo_url VARCHAR(500),                              -- 备件照片URL
    part_theoretical_life DECIMAL(10,3),                      -- 理论寿命（天）
    part_remaining_life DECIMAL(10,3),                        -- 剩余寿命（天）
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 外键：关联设备
    CONSTRAINT fk_bom_part_equipment
        FOREIGN KEY (equipment_id)
        REFERENCES base_equipment(equipment_id)
        ON DELETE CASCADE,

    -- 外键：自引用（父级备件）
    CONSTRAINT fk_bom_part_parent
        FOREIGN KEY (parent_part_id)
        REFERENCES base_equipment_bom_part(id)
        ON DELETE CASCADE,

    -- 约束：备件数量大于0
    CONSTRAINT chk_bom_part_qty CHECK (part_qty > 0),

    -- 约束：同一设备下备件编码唯一
    CONSTRAINT uq_equipment_part_code UNIQUE (equipment_id, part_code)
);

CREATE INDEX idx_bom_part_equipment_id ON base_equipment_bom_part(equipment_id);
CREATE INDEX idx_bom_part_parent_id ON base_equipment_bom_part(parent_part_id);
CREATE INDEX idx_bom_part_code ON base_equipment_bom_part(part_code);


-- 5. 设备作业指导表（1:N）
--    存储：SOP文档编号、标题、版本、创建人
CREATE TABLE base_equipment_sop (
    id BIGINT PRIMARY KEY,                                    -- 雪花ID
    equipment_id BIGINT NOT NULL,                             -- 设备 ID（外键→base_equipment）
    document_no VARCHAR(50) NOT NULL,                         -- 文档编号
    document_title VARCHAR(200) NOT NULL,                     -- 文档标题
    document_version VARCHAR(36) NOT NULL,                    -- 文档版本
    document_url VARCHAR(1024),                               -- 文档文件URL（PDF/Word等）
    created_by VARCHAR(50) NOT NULL,                          -- 创建人
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 外键：关联设备
    CONSTRAINT fk_sop_equipment
        FOREIGN KEY (equipment_id)
        REFERENCES base_equipment(equipment_id)
        ON DELETE CASCADE,

    -- 约束：同一设备下文档编号+版本唯一
    CONSTRAINT uq_equipment_sop_doc UNIQUE (equipment_id, document_no, document_version)
);

CREATE INDEX idx_sop_equipment_id ON base_equipment_sop(equipment_id);
CREATE INDEX idx_sop_document_no ON base_equipment_sop(document_no);


-- ============================================================
-- 6. 设备运行记录表（1:N）
--    存储：设备新增、维修、搬迁等操作记录
CREATE TABLE base_equipment_operation_record (
    id BIGINT PRIMARY KEY,                                    -- 雪花ID
    equipment_id BIGINT NOT NULL,                             -- 设备 ID（外键→base_equipment）
    record_code VARCHAR(36) NOT NULL,                         -- 记录编号
    record_type VARCHAR(50) NOT NULL,                         -- 记录类型：EQUIPMENT_ADD / EQUIPMENT_REPAIR / EQUIPMENT_MOVE / EQUIPMENT_MAINTENANCE / EQUIPMENT_SCRAP
    related_department VARCHAR(100),                           -- 相关部门
    stage_status VARCHAR(50),                                 -- 阶段状态（如：进行中/已完成）
    record_description TEXT,                                  -- 记录详细描述
    created_by VARCHAR(50) NOT NULL,                          -- 创建人
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 外键：关联设备
    CONSTRAINT fk_operation_record_equipment
        FOREIGN KEY (equipment_id)
        REFERENCES base_equipment(equipment_id)
        ON DELETE CASCADE,

    -- 约束：同一设备下记录编号唯一
    CONSTRAINT uq_equipment_record_code UNIQUE (equipment_id, record_code)
);

CREATE INDEX idx_operation_record_equipment_id ON base_equipment_operation_record(equipment_id);
CREATE INDEX idx_operation_record_type ON base_equipment_operation_record(record_type);
CREATE INDEX idx_operation_record_created_at ON base_equipment_operation_record(created_at);


-- ============================================================
-- 设备相关表 ER 关系汇总
-- ============================================================
-- base_equipment（设备基础表）
--   ├── base_equipment_technical_spec    1:1  技术规格
--   ├── base_equipment_process_param     1:1  过程参数
--   ├── base_equipment_failure_param     1:1  故障参数（已有）
--   ├── base_equipment_bom_part          1:N  BOM备件（自引用树）
--   ├── base_equipment_sop               1:N  作业指导
--   └── base_equipment_operation_record  1:N  运行记录
--
-- 资产实例层：
--   factory_equipment_details    1:1  实例增量数据（规格/安装日期等）
--   factory_asset_3d_model       1:1  3D模型信息
--   factory_equipment_spatial    1:1  空间定位
