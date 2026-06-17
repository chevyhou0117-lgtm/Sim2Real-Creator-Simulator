DROP TABLE IF EXISTS usd_asset_library;

CREATE TABLE usd_asset_library (
    -- 1. 标识信息
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,

    -- 2. 存储核心 (关键)
    storage_type    VARCHAR(20) DEFAULT 'folder',        -- 存储类型: 'file' 或 'folder'
    root_usd_path   VARCHAR(1024) NOT NULL,             -- 根USD文件路径 (例如 "Collected_a_L_HST_Dis_Assy_Sub/a_L_HST_Dis_Assy_Sub.usd")
    location_path   VARCHAR(1024) NOT NULL,             -- 存储位置路径 (例如 "Collected_a_L_HST_Dis_Assy_Sub/")
    thumbnail_path  VARCHAR(1024),                      -- 缩略图路径

    -- 3. 分类与检索
    category_l1     VARCHAR(50) NOT NULL,               -- 制程类
    category_l2     VARCHAR(50),                        -- 线体不同实例
    category_l3     VARCHAR(50),                        -- 设备类 (1)
    tags            VARCHAR(100)[],                     -- 标签

    -- 4. 扩展配置
    open_config     JSONB,                              -- 打开方式配置
    file_list       JSONB,                              -- 文件列表 (新增，记录文件夹内所有文件)

    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_asset_storage_type ON usd_asset_library(storage_type);
CREATE INDEX idx_asset_category ON usd_asset_library(category_l1);




-- 创建工厂项目表
CREATE TABLE factory_projects (
    -- 主键，自增
    id SERIAL PRIMARY KEY,
    -- 工厂名称，必填字段
    factory_name VARCHAR(255) NOT NULL,
    -- 工厂ID，建议作为唯一标识，非必填
    factory_id VARCHAR(100) UNIQUE,
    -- 工厂地址
    factory_address TEXT,
    -- 场地长度 (米)， 保留两位小数
    site_length_m NUMERIC(10, 2),
    -- 场地宽度 (米)
    site_width_m NUMERIC(10, 2),
    -- 描述
    description TEXT,
    -- 项目状态：0=草稿, 1=待发布, 2=已发布
    status SMALLINT NOT NULL DEFAULT 0,
    -- 创建时间
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- 更新时间
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 添加检查约束，确保 status 只能是 0, 1, 或 2
ALTER TABLE factory_projects
ADD CONSTRAINT chk_project_status
CHECK (status IN (0, 1, 2));

-- 创建索引，加速查询
CREATE INDEX idx_factory_projects_name ON factory_projects(factory_name);
CREATE INDEX idx_factory_projects_id ON factory_projects(factory_id);
CREATE INDEX idx_factory_projects_status ON factory_projects(status);
