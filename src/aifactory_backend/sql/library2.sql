-- 0. Schema（推荐）
CREATE SCHEMA IF NOT EXISTS asset;

SET search_path TO asset;

-- 1. 类型字典表
CREATE TABLE IF NOT EXISTS asset_type_dict (
    code VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

INSERT INTO asset_type_dict (code, name) VALUES
('process', '工序'),
('line_type', '线体类型'),
('equipment_type', '设备类型'),
('line_model', '线体模型'),
('equipment_model', '设备型号')
ON CONFLICT (code) DO NOTHING;


-- 2. 资产分类（核心树结构）
CREATE TABLE IF NOT EXISTS asset_categories (

    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(100) NOT NULL UNIQUE,
    type VARCHAR(50) NOT NULL,
    parent_id BIGINT,
    description TEXT,
    thumbnail_path VARCHAR(1024),
    asset_total_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 外键：类型
ALTER TABLE asset_categories
ADD CONSTRAINT fk_asset_categories_type
FOREIGN KEY (type)
REFERENCES asset_type_dict(code)
ON UPDATE CASCADE;

-- 外键：父子关系
ALTER TABLE asset_categories
ADD CONSTRAINT fk_asset_categories_parent
FOREIGN KEY (parent_id)
REFERENCES asset_categories(id)
ON DELETE SET NULL;

-- 索引
CREATE INDEX IF NOT EXISTS idx_asset_categories_type
ON asset_categories(type);

CREATE INDEX IF NOT EXISTS idx_asset_categories_parent_id
ON asset_categories(parent_id);



-- 3. 线体模型详情
CREATE TABLE IF NOT EXISTS line_model_details (
    id BIGSERIAL PRIMARY KEY,

    category_id BIGINT NOT NULL,

    bucket_name VARCHAR(100) DEFAULT 'ov-usd-bucket',
    root_usd_path VARCHAR(1024) NOT NULL,
    location_path VARCHAR(1024) NOT NULL,
    thumbnail_path VARCHAR(1024),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE line_model_details
ADD CONSTRAINT fk_line_model_category
FOREIGN KEY (category_id)
REFERENCES asset_categories(id)
ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_line_model_category
ON line_model_details(category_id);


-- 4. 设备模型详情
CREATE TABLE IF NOT EXISTS equipment_model_details (
    id BIGSERIAL PRIMARY KEY,

    category_id BIGINT NOT NULL,
    bucket_name VARCHAR(100) DEFAULT 'ov-usd-bucket',
    manufacturer VARCHAR(100),
    asset_type VARCHAR(255),
    brand VARCHAR(50),

    root_usd_path VARCHAR(1024) NOT NULL,
    location_path VARCHAR(1024) NOT NULL,
    thumbnail_path VARCHAR(1024),

    specifications JSONB,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);



ALTER TABLE equipment_model_details
ADD CONSTRAINT fk_equipment_model_category
FOREIGN KEY (category_id)
REFERENCES asset_categories(id)
ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_equipment_model_category
ON equipment_model_details(category_id);


-- 5. 线体模型挂载设备（核心关系表）
CREATE TABLE IF NOT EXISTS line_model_equipment_rel (
    id BIGSERIAL PRIMARY KEY,

    line_model_id BIGINT NOT NULL,
    equipment_model_id BIGINT NOT NULL,

    instance_name VARCHAR(255),

    position_data JSONB DEFAULT '{"pos_x":0,"pos_y":0,"pos_z":0}',
    rotation_data JSONB DEFAULT '{"rot_pitch":0,"rot_yaw":0,"rot_roll":0}',

    device_status VARCHAR(50) DEFAULT 'active',
    device_area VARCHAR(100),

    root_usd_path VARCHAR(1024) DEFAULT '',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 外键约束
ALTER TABLE line_model_equipment_rel
ADD CONSTRAINT fk_rel_line_model
FOREIGN KEY (line_model_id)
REFERENCES line_model_details(id)
ON DELETE CASCADE;

ALTER TABLE line_model_equipment_rel
ADD CONSTRAINT fk_rel_equipment_model
FOREIGN KEY (equipment_model_id)
REFERENCES equipment_model_details(id)
ON DELETE CASCADE;

-- 索引
CREATE INDEX IF NOT EXISTS idx_rel_line_model_id
ON line_model_equipment_rel(line_model_id);

CREATE INDEX IF NOT EXISTS idx_rel_equipment_model_id
ON line_model_equipment_rel(equipment_model_id);

CREATE INDEX IF NOT EXISTS idx_rel_instance_name
ON line_model_equipment_rel(instance_name);