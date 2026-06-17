-- ============================================================
-- 资产实例层（重构 v2）
-- 核心变更：
--   1. ref_id 从 factory_asset_node 移到各详情表（详情表负责关联基础数据）
--   2. factory_equipment_spatial 合并到 factory_equipment_details（空间定位为设备专属）
--   3. 节点表只保留树形结构 + 版本关联，不做业务信息引用
-- ============================================================


-- ============================================================
-- 0. 资产类型字典（节点类型约束）
-- ============================================================
CREATE TABLE instance_asset_type_dict (
    code VARCHAR(50) PRIMARY KEY,           -- 类型编码: STAGE / LINE / EQUIPMENT
    name VARCHAR(200) NOT NULL,             -- 类型名称: 制程 / 线体 / 设备
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO instance_asset_type_dict (code, name, description, status) VALUES
('STAGE',     '制程',   '工段/制程节点，对应 base_stage',      'ACTIVE'),
('LINE',      '线体',   '产线节点，对应 base_production_line',  'ACTIVE'),
('EQUIPMENT', '设备',   '设备节点，对应 base_equipment',        'ACTIVE');



-- 1. 资产节点树（核心表）
--    纯树形结构 + 版本关联，不引用基础数据（ref_id 已移至详情表）
CREATE TABLE factory_asset_node (
    id BIGINT PRIMARY KEY,                   -- 雪花ID
    factory_projects_id BIGINT NOT NULL,     -- 关联项目 → factory_projects.project_id
    version_id BIGINT NOT NULL,              -- 关联版本 → factory_project_version.version_id
    name VARCHAR(255) NOT NULL,              -- 节点显示名称
    code VARCHAR(100),                       -- 节点编码
    -- 类型（走字典表）
    type VARCHAR(50) NOT NULL,               -- STAGE / LINE / EQUIPMENT
    -- 树结构
    parent_id BIGINT,
    -- 描述
    description TEXT,
    -- 时间
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_asset_node_project
        FOREIGN KEY (factory_projects_id)
        REFERENCES factory_projects(project_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_asset_node_version
        FOREIGN KEY (version_id)
        REFERENCES factory_project_version(version_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_asset_node_type
        FOREIGN KEY (type)
        REFERENCES asset_type_dict(code)
        ON UPDATE NO ACTION,

    CONSTRAINT fk_asset_node_parent
        FOREIGN KEY (parent_id)
        REFERENCES factory_asset_node(id)
        ON DELETE SET NULL
);

CREATE INDEX idx_asset_node_projects_id ON factory_asset_node(factory_projects_id);
CREATE INDEX idx_asset_node_version_id   ON factory_asset_node(version_id);
CREATE INDEX idx_asset_node_parent_id    ON factory_asset_node(parent_id);
CREATE INDEX idx_asset_node_type         ON factory_asset_node(type);


-- ============================================================
-- 2. 制程详情表
--    通过 ref_id 关联基础数据层 base_stage，获取制程业务信息
--    实例层只存增量数据（产能、元数据等）
CREATE TABLE factory_process_details (
    id BIGINT PRIMARY KEY,                   -- 雪花ID
    factory_asset_id BIGINT NOT NULL,        -- → factory_asset_node.id
    ref_id BIGINT,                           -- 【从节点表迁移】关联 base_stage.stage_id，获取制程基础信息
    -- ===== 实例层增量字段（基础数据层不包含的） =====
    total_capacity INT,                      -- 制程总产能（pcs/day），实例层计算值
    metadata JSONB,                          -- 扩展元数据
    description TEXT,                        -- 实例级补充描述
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_process_asset
        FOREIGN KEY (factory_asset_id)
        REFERENCES factory_asset_node(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_process_detail_ref_id ON factory_process_details(ref_id);


-- 3. 线体详情表
--    通过 ref_id 关联基础数据层 base_production_line，获取线体业务信息
--    实例层只存增量数据（日产能、元数据等）
CREATE TABLE factory_line_details (
    id BIGINT PRIMARY KEY,                   -- 雪花ID
    factory_asset_id BIGINT NOT NULL,        -- → factory_asset_node.id
    ref_id BIGINT,                           -- 【从节点表迁移】关联 base_production_line.line_id，获取线体基础信息

    -- ===== 实例层增量字段 =====
    capacity_per_day INT,                    -- 实例层日产能（pcs），考虑排班后的实际值
    metadata JSONB,                          -- 扩展元数据

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_line_detail_asset
        FOREIGN KEY (factory_asset_id)
        REFERENCES factory_asset_node(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_line_detail_ref_id ON factory_line_details(ref_id);


-- 4. 设备详情表（合并版）
--    通过 ref_id 关联基础数据层 base_equipment，获取设备业务信息
--    空间定位（position_data / rotation_data）已从 factory_equipment_spatial 合并到此表
CREATE TABLE factory_equipment_details (
    id BIGINT PRIMARY KEY,                   -- 雪花ID
    factory_asset_id BIGINT NOT NULL,        -- → factory_asset_node.id
    ref_id BIGINT,                           -- 【从节点表迁移】关联 base_equipment.equipment_id，获取设备基础信息

    -- ===== 实例层增量字段 =====
    specifications JSONB,                    -- 技术规格扩展 {"power": "220V", "temperature_range": "0-300°C"}
    installation_date TIMESTAMP WITH TIME ZONE,  -- 安装日期（实例级，基础数据层不含）

    -- ===== 空间定位（从 factory_equipment_spatial 合并） =====
    position_data JSONB,                     -- {"x": 0, "y": 0, "z": 0}
    rotation_data JSONB,                     -- {"rx": 0, "ry": 0, "rz": 0}

    metadata JSONB,                          -- 扩展元数据
    description TEXT,                        -- 实例级补充描述

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_equipment_detail_asset
        FOREIGN KEY (factory_asset_id)
        REFERENCES factory_asset_node(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_equipment_detail_ref_id ON factory_equipment_details(ref_id);


-- ============================================================
-- 5. 3D 模型信息表（通用，制程/线体/设备都可能拥有）
--    不变

CREATE TABLE factory_asset_3d_model (
    id BIGINT PRIMARY KEY,                   -- 雪花ID
    factory_asset_id BIGINT NOT NULL,        -- → factory_asset_node.id

    -- USD/Omniverse 模型信息
    usd_name VARCHAR(255),                   -- 例如: "SMT01# Line.USDA"
    usd_id VARCHAR(255),                     -- USD 唯一标识
    root_usd_path VARCHAR(1024) NOT NULL,    -- USD 文件在存储桶中的路径
    bucket_name VARCHAR(100) DEFAULT 'ov-usd-bucket',  -- 对象存储桶名
    prim_path VARCHAR(1024),                 -- USD 中的主要 Prim 路径
    location_path VARCHAR(1024),             -- 模型在场景中的相对路径
    thumbnail_path VARCHAR(1024),            -- 缩略图路径
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_3d_model_asset
        FOREIGN KEY (factory_asset_id)
        REFERENCES factory_asset_node(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_3d_model_asset_id ON factory_asset_3d_model(factory_asset_id);



-- ============================================================
-- 字段映射对照表（v2 重构参考）
-- ============================================================
-- | 变更项                              | 说明                                               |
-- |-------------------------------------|---------------------------------------------------|
-- | factory_asset_node.ref_id           | 已移除，迁移至各详情表的 ref_id 字段                   |
-- | factory_process_details.ref_id      | 【新增】关联 base_stage.stage_id                     |
-- | factory_line_details.ref_id         | 【新增】关联 base_production_line.line_id             |
-- | factory_equipment_details.ref_id    | 【新增】关联 base_equipment.equipment_id              |
-- | factory_equipment_spatial           | 已删除，position_data/rotation_data 合并到设备详情表   |
-- | factory_equipment_details.position_data | 【新增】原 factory_equipment_spatial.position_data |
-- | factory_equipment_details.rotation_data | 【新增】原 factory_equipment_spatial.rotation_data |
