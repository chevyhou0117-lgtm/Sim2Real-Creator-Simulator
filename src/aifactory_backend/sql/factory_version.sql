-- ============================================================
-- 项目版本管理表 v2
-- 核心变更：
--   1. 支持多版本并行：同一项目可同时存在多个版本，旧版本仍可使用
--   2. is_active → is_current：标记"当前编辑版本"（只有一个），旧版本不再编辑但仍可查看/使用
--   3. 新增 version_name / version_status / published_at 字段
--   4. 支持版本发布/归档/回滚等操作
-- ============================================================

CREATE TABLE factory_project_version (
    version_id BIGINT PRIMARY KEY,                          -- 版本主键（雪花ID）
    project_id BIGINT NOT NULL,                             -- 项目ID

    -- 版本标识
    version_number INTEGER NOT NULL,                        -- 版本号（1, 2, 3...）
    version_name VARCHAR(255),                              -- 版本名称，如 "V1.0 初版"、"V2.0 扩产方案"
    remark VARCHAR(255),                                    -- 备注描述

    -- 版本状态
    -- DRAFT: 草稿（可编辑）
    -- PUBLISHED: 已发布（只读，可查看/使用，不可编辑资产树）
    -- ARCHIVED: 已归档（只读，不常用但仍可访问）
    version_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
        CHECK (version_status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),

    -- 当前编辑版本标记（同一项目下最多只有一个 is_current=TRUE 的版本）
    is_current BOOLEAN NOT NULL DEFAULT FALSE,

    -- 发布时间
    published_at TIMESTAMP WITH TIME ZONE,                  -- 发布时间（DRAFT → PUBLISHED 时记录）
    published_by VARCHAR(100),                              -- 发布人

    -- 基线版本（从哪个版本复制/派生而来）
    base_version_id BIGINT,                                 -- 基线版本ID（可为空，V1 无基线）

    -- 创建人/时间
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- 约束
    CONSTRAINT uq_project_version UNIQUE (project_id, version_number),
    CONSTRAINT fk_version_project FOREIGN KEY (project_id)
        REFERENCES factory_projects(project_id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_version_project ON factory_project_version(project_id);
CREATE INDEX idx_version_current ON factory_project_version(project_id) WHERE is_current = TRUE;
CREATE INDEX idx_version_status ON factory_project_version(version_status);

-- ============================================================
-- 注释：
--
-- 版本生命周期：
--   DRAFT → PUBLISHED → ARCHIVED
--     ↑         |
--     └─────────┘ （回滚：从 PUBLISHED 复制为新的 DRAFT 版本）
--
-- 创建新版本场景：
--   1. 项目首次创建 → 自动创建 V1（DRAFT, is_current=TRUE）
--   2. 基于"当前版本"创建新版本 → 复制当前版本资产树为新 DRAFT 版本
--   3. 回滚/分支 → 从任意历史版本复制为新的 DRAFT 版本
--
-- 核心规则：
--   - is_current=TRUE 的版本才是"正在编辑"的版本
--   - 旧版本（PUBLISHED/ARCHIVED）仍可查看/使用，只是不能编辑
--   - 前端加载项目时默认进入 is_current=TRUE 的版本
--   - 切换版本 = 切换 factory_asset_node.version_id 过滤条件
-- ============================================================
