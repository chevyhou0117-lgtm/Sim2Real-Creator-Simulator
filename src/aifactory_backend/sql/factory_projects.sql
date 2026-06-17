-- ============================================================
-- 工厂项目表 v2
-- 核心变更：
--   1. 增加 current_version_id 冗余字段，快速定位当前编辑版本
--   2. 增加 version_count 冗余字段，版本数量统计
-- ============================================================

CREATE TABLE factory_projects (

    project_id BIGINT PRIMARY KEY,
    factory_id BIGINT NOT NULL,          -- 核心：这个项目属于哪个物理工厂
    project_name VARCHAR(255) NOT NULL,  -- 项目名：深圳一厂扩产评估
    thumbnail_url VARCHAR(2048),         -- 这个项目专属的缩略图
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived', 'draft')),
    owner_id VARCHAR(100),               -- 项目负责人
    description TEXT,                     -- 项目描述

    -- 版本管理冗余字段（加速查询，数据真实来源为 factory_project_version 表）
    current_version_id BIGINT,           -- 当前编辑版本ID → factory_project_version.version_id
    version_count INTEGER DEFAULT 0,     -- 版本总数（冗余计数）

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT fk_project_factory FOREIGN KEY (factory_id) REFERENCES base_factory(factory_id)
);

-- 索引
CREATE INDEX idx_project_factory ON factory_projects(factory_id);
CREATE INDEX idx_project_status ON factory_projects(status);
CREATE INDEX idx_project_current_version ON factory_projects(current_version_id);
