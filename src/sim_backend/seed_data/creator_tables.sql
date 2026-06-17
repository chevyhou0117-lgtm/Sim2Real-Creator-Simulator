-- creator_tables.sql — Creator (aiFactory) 专有表 DDL
-- ----------------------------------------------------------------------------
-- 本地化迁移 Phase 2：这些是 aiFactory 自有的表（不并入 sim_backend 的 md_*）。
-- 由 sim_backend 统一拥有 DDL（load_seed.py 在导 CSV 前执行本文件），
-- aifactory_backend 关闭 create_all（AIFACTORY_CREATE_ALL=false）后纯消费这些表。
--
-- 约定：
--   * 全部主键 VARCHAR(36)（与 sim_backend md_* 的 UUID 主键一致；snowflake 已弃用）。
--     asset_type_dict / instance_asset_type_dict 用自然键 code VARCHAR(50)。
--   * 跨 md_*（已合并的主数据）的引用一律"逻辑外键"：纯 VARCHAR(36) 列，不加 REFERENCES，
--     避免与 sim_backend 拥有的 md_* 表产生建表顺序 / 所有权耦合。
--   * Creator 内部表之间的外键保留真实 REFERENCES（按依赖顺序声明）。
--   * 全部 CREATE TABLE IF NOT EXISTS，幂等，可对已有库重复执行。
-- ----------------------------------------------------------------------------

-- ===== 1. 自然键字典（无依赖） ============================================
CREATE TABLE IF NOT EXISTS asset_type_dict (
    code VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS instance_asset_type_dict (
    code        VARCHAR(50) PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    description TEXT,
    status      VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ===== 2. 业务字典（snowflake -> UUID，无外键） ===========================
CREATE TABLE IF NOT EXISTS dict_ng_category (
    ng_category_id VARCHAR(36) PRIMARY KEY,
    ng_code        VARCHAR(20) NOT NULL UNIQUE,
    ng_name        VARCHAR(100) NOT NULL,
    impact_level   VARCHAR(10) NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dict_worker_type (
    worker_type_id   VARCHAR(36) PRIMARY KEY,
    worker_type_code VARCHAR(50) NOT NULL UNIQUE,
    worker_type_name VARCHAR(200) NOT NULL,
    description      VARCHAR(500),
    status           VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dict_equipment_type (
    equipment_type_id   VARCHAR(36) PRIMARY KEY,
    equipment_type_code VARCHAR(50) NOT NULL UNIQUE,
    equipment_type_name VARCHAR(200) NOT NULL,
    description         VARCHAR(500),
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dict_stage_type (
    stage_type_id   VARCHAR(36) PRIMARY KEY,
    stage_type_code VARCHAR(50) NOT NULL UNIQUE,
    stage_type_name VARCHAR(200) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dict_warehouse_type (
    warehouse_type_id   VARCHAR(36) PRIMARY KEY,
    warehouse_type_code VARCHAR(50) NOT NULL UNIQUE,
    warehouse_type_name VARCHAR(200) NOT NULL,
    description         VARCHAR(500),
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ===== 3. 资产分类 / 模型库 ===============================================
CREATE TABLE IF NOT EXISTS asset_categories (
    id                VARCHAR(36) PRIMARY KEY,
    name              VARCHAR(255) NOT NULL,
    code              VARCHAR(100) NOT NULL,   -- 不加 UNIQUE：Creator 实际数据存在重复 code
    type              VARCHAR(50) NOT NULL REFERENCES asset_type_dict(code) ON UPDATE CASCADE,
    parent_id         VARCHAR(36),                 -- self-ref（逻辑）
    description       TEXT,
    thumbnail_path    VARCHAR(1024),
    asset_total_count BIGINT DEFAULT 0,            -- 计数列，保持 BIGINT
    is_deleted        BOOLEAN NOT NULL DEFAULT false,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_model_details (
    id             VARCHAR(36) PRIMARY KEY,
    category_id    VARCHAR(36) NOT NULL,           -- 逻辑 -> asset_categories.id
    manufacturer   VARCHAR(100),
    asset_type     VARCHAR(255),
    brand          VARCHAR(50),
    bucket_name    VARCHAR(100) DEFAULT 'ov-usd-bucket',
    root_usd_path  VARCHAR(1024) NOT NULL,
    location_path  VARCHAR(1024) NOT NULL,
    thumbnail_path VARCHAR(1024),
    specifications JSONB,
    status         VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS line_model_details (
    id             VARCHAR(36) PRIMARY KEY,
    category_id    VARCHAR(36) NOT NULL,           -- 逻辑 -> asset_categories.id
    bucket_name    VARCHAR(100) DEFAULT 'ov-usd-bucket',
    root_usd_path  VARCHAR(1024) NOT NULL,
    location_path  VARCHAR(1024) NOT NULL,
    thumbnail_path VARCHAR(1024),
    status         VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS line_model_equipment_rel (
    id                 VARCHAR(36) PRIMARY KEY,
    line_model_id      VARCHAR(36) NOT NULL REFERENCES line_model_details(id) ON DELETE CASCADE,
    equipment_model_id VARCHAR(36) NOT NULL REFERENCES equipment_model_details(id) ON DELETE CASCADE,
    instance_name      VARCHAR(255),
    position_data      JSONB DEFAULT '{"pos_x": 0, "pos_y": 0, "pos_z": 0}',
    rotation_data      JSONB DEFAULT '{"rot_pitch": 0, "rot_yaw": 0, "rot_roll": 0}',
    device_status      VARCHAR(50) DEFAULT 'active',
    device_area        VARCHAR(100),
    root_usd_path      VARCHAR(1024) DEFAULT '',
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usd_asset_library (
    id             VARCHAR(36) PRIMARY KEY,
    name           VARCHAR(255) NOT NULL,
    storage_type   VARCHAR(20) DEFAULT 'folder',
    root_usd_path  VARCHAR(1024) NOT NULL,
    location_path  VARCHAR(1024) NOT NULL,
    thumbnail_path VARCHAR(1024),
    category_l1    VARCHAR(50) NOT NULL,
    category_l2    VARCHAR(50),
    category_l3    VARCHAR(50),
    tags           VARCHAR(100)[],
    open_config    JSONB,
    file_list      JSONB,
    created_at     TIMESTAMP DEFAULT now(),
    updated_at     TIMESTAMP DEFAULT now()
);

-- ===== 4. 工厂项目 / 实例树 ===============================================
CREATE TABLE IF NOT EXISTS factory_projects (
    project_id         VARCHAR(36) PRIMARY KEY,
    factory_id         VARCHAR(36) NOT NULL,       -- 逻辑 -> md_factory.factory_id（跨 md_*，不加约束）
    project_name       VARCHAR(255) NOT NULL,
    thumbnail_url      VARCHAR(2048),
    status             VARCHAR(50) DEFAULT 'active',
    owner_id           VARCHAR(100),
    description        TEXT,
    current_version_id VARCHAR(36),                -- 逻辑 -> factory_project_version.version_id
    version_count      INTEGER DEFAULT 0,
    last_accessed_at   TIMESTAMPTZ,                 -- 最后访问时间
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS factory_project_version (
    version_id      VARCHAR(36) PRIMARY KEY,
    project_id      VARCHAR(36) NOT NULL REFERENCES factory_projects(project_id) ON DELETE CASCADE,
    version_number  INTEGER NOT NULL,
    version_name    VARCHAR(255),
    remark          VARCHAR(255),
    version_status  VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    is_current      BOOLEAN NOT NULL DEFAULT false,
    published_at    TIMESTAMPTZ,
    published_by    VARCHAR(100),
    base_version_id VARCHAR(36),                   -- self-ref（逻辑）
    created_by      VARCHAR(100),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS factory_asset_node (
    id                  VARCHAR(36) PRIMARY KEY,
    factory_projects_id VARCHAR(36) NOT NULL REFERENCES factory_projects(project_id) ON DELETE CASCADE,
    version_id          VARCHAR(36) NOT NULL REFERENCES factory_project_version(version_id) ON DELETE CASCADE,
    name                VARCHAR(255) NOT NULL,
    code                VARCHAR(100),
    type                VARCHAR(50) NOT NULL REFERENCES instance_asset_type_dict(code),
    parent_id           VARCHAR(36) REFERENCES factory_asset_node(id) ON DELETE SET NULL,
    description         TEXT,
    bind_status         VARCHAR(30) NOT NULL DEFAULT 'UNBOUND',
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS line_leaders_info (
    id               VARCHAR(36) PRIMARY KEY,
    factory_asset_id VARCHAR(36) NOT NULL REFERENCES factory_asset_node(id) ON DELETE CASCADE,
    line_leader_name VARCHAR(255),
    employee_id      VARCHAR(50),
    contact_number   VARCHAR(50),
    email            VARCHAR(255),
    shift_schedule   VARCHAR(100),
    shift_a_leader   VARCHAR(255),
    shift_b_leader   VARCHAR(255),
    shift_c_leader   VARCHAR(255),
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS factory_asset_3d_model (
    id               VARCHAR(36) PRIMARY KEY,
    factory_asset_id VARCHAR(36) NOT NULL REFERENCES factory_asset_node(id) ON DELETE CASCADE,
    usd_name         VARCHAR(255),
    usd_id           VARCHAR(255),
    root_usd_path    VARCHAR(1024) NOT NULL,
    bucket_name      VARCHAR(100) DEFAULT 'ov-usd-bucket',
    prim_path        VARCHAR(1024),
    location_path    VARCHAR(1024),
    thumbnail_path   VARCHAR(1024),
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS factory_equipment_details (
    id                VARCHAR(36) PRIMARY KEY,
    factory_asset_id  VARCHAR(36) NOT NULL REFERENCES factory_asset_node(id) ON DELETE CASCADE,
    ref_id            VARCHAR(36),                 -- 逻辑 -> md_equipment.equipment_id
    specifications    JSONB,
    installation_date TIMESTAMPTZ,
    position_data     JSONB,
    rotation_data     JSONB,
    extra_metadata    JSONB,
    description       TEXT,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS factory_equipment_model_details (
    id                VARCHAR(36) PRIMARY KEY,
    factory_asset_id  VARCHAR(36) NOT NULL REFERENCES factory_asset_node(id) ON DELETE CASCADE,
    factory_layer     VARCHAR(100),
    equipment_name    VARCHAR(255) NOT NULL,
    equipment_id      VARCHAR(255),
    equipment_type    VARCHAR(100),
    manufacturer      VARCHAR(100),
    brand             VARCHAR(100),
    usd_name          VARCHAR(255),
    usd_id            VARCHAR(255),
    root_usd_path     VARCHAR(1024) NOT NULL,
    bucket_name       VARCHAR(100) DEFAULT 'ov-usd-bucket',
    location_path     VARCHAR(1024),
    thumbnail_path    VARCHAR(1024),
    prim_path         VARCHAR(1024),
    position_data     JSONB,
    rotation_data     JSONB,
    specifications    JSONB,
    extra_metadata    JSONB,
    description       TEXT,
    installation_date TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS factory_equipment_spatial (
    id               VARCHAR(36) PRIMARY KEY,
    factory_asset_id VARCHAR(36) NOT NULL REFERENCES factory_asset_node(id) ON DELETE CASCADE,
    position_data    JSONB,
    rotation_data    JSONB,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS factory_line_details (
    id               VARCHAR(36) PRIMARY KEY,
    factory_asset_id VARCHAR(36) NOT NULL REFERENCES factory_asset_node(id) ON DELETE CASCADE,
    ref_id           VARCHAR(36),                  -- 逻辑 -> md_production_line.line_id
    capacity_per_day INTEGER,
    extra_metadata   JSONB,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS factory_line_model_details (
    id               VARCHAR(36) PRIMARY KEY,
    factory_asset_id VARCHAR(36) NOT NULL REFERENCES factory_asset_node(id) ON DELETE CASCADE,
    factory_layer    VARCHAR(100),
    line_name        VARCHAR(255),
    line_code        VARCHAR(100),
    standard_ct      INTEGER,
    capacity_per_day INTEGER,
    shift_count      INTEGER DEFAULT 0,
    usd_name         VARCHAR(255),
    usd_id           VARCHAR(255),
    root_usd_path    VARCHAR(1024),
    prim_path        VARCHAR(1024),
    bucket_name      VARCHAR(100) DEFAULT 'ov-usd-bucket',
    location_path    VARCHAR(1024),
    thumbnail_path   VARCHAR(1024),
    extra_metadata   JSONB,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS factory_process_details (
    id               VARCHAR(36) PRIMARY KEY,
    factory_asset_id VARCHAR(36) NOT NULL REFERENCES factory_asset_node(id) ON DELETE CASCADE,
    ref_id           VARCHAR(36),                  -- 逻辑 -> md_stage.stage_id
    total_capacity   INTEGER,
    extra_metadata   JSONB,
    description      TEXT,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ===== 5. 留在 Creator 侧的设备子表 / 人员配置（跨 md_* 逻辑引用） ========
CREATE TABLE IF NOT EXISTS base_equipment_sop (
    id               VARCHAR(36) PRIMARY KEY,
    equipment_id     VARCHAR(36) NOT NULL,          -- 逻辑 -> md_equipment.equipment_id
    document_no      VARCHAR(50) NOT NULL,
    document_title   VARCHAR(200) NOT NULL,
    document_version VARCHAR(36) NOT NULL,
    document_url     VARCHAR(1024),
    created_by       VARCHAR(50) NOT NULL,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS base_equipment_operation_record (
    id                 VARCHAR(36) PRIMARY KEY,
    equipment_id       VARCHAR(36) NOT NULL,        -- 逻辑 -> md_equipment.equipment_id
    record_code        VARCHAR(36) NOT NULL,
    record_type        VARCHAR(50) NOT NULL,
    related_department VARCHAR(100),
    stage_status       VARCHAR(50),
    record_description  TEXT,
    created_by         VARCHAR(50) NOT NULL,
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS base_staffing_config (
    staffing_id        VARCHAR(36) PRIMARY KEY,
    factory_id         VARCHAR(36) NOT NULL,        -- 逻辑 -> md_factory.factory_id
    operation_id       VARCHAR(36) NOT NULL,        -- 逻辑 -> md_operation.operation_id
    worker_type_id     VARCHAR(36) NOT NULL,        -- 逻辑 -> dict_worker_type.worker_type_id
    worker_count       INTEGER NOT NULL,
    ct_with_this_count NUMERIC(10,3) NOT NULL,
    is_standard        BOOLEAN NOT NULL DEFAULT false,
    effective_date     DATE,
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS factory_worker_type_rel (
    factory_id     VARCHAR(36) NOT NULL,            -- 逻辑 -> md_factory.factory_id
    worker_type_id VARCHAR(36) NOT NULL,            -- 逻辑 -> dict_worker_type.worker_type_id
    created_at     TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (factory_id, worker_type_id)
);

-- ===== 6. Kit 扩展专属表（aifactory.service.setup 用；自增主键，自包含无外键） =====
-- 这些表只被 Kit 扩展（DeviceMapping/FactoryData/User 控制器）使用，与 md_* 无关。
CREATE TABLE IF NOT EXISTS device_mappings (
    id          SERIAL PRIMARY KEY,
    device_id   VARCHAR(64) NOT NULL,
    prim_path   VARCHAR(512) NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_device_mappings_device_id ON device_mappings(device_id);
CREATE INDEX IF NOT EXISTS ix_device_mappings_prim_path ON device_mappings(prim_path);

CREATE TABLE IF NOT EXISTS factory_data (
    id              SERIAL PRIMARY KEY,
    factory_name    VARCHAR(100) NOT NULL,
    factory_layer   VARCHAR(50) NOT NULL,
    factory_id      VARCHAR(64) NOT NULL UNIQUE,     -- Kit 自有工厂标识（非 md_factory）
    usd_name        VARCHAR(200) NOT NULL,
    usd_id          VARCHAR(64) NOT NULL,
    site_size       VARCHAR(50) NOT NULL,
    factory_address VARCHAR(255) NOT NULL,
    capacity        VARCHAR(50) NOT NULL,
    uph             VARCHAR(50) NOT NULL,
    ct              INTEGER NOT NULL,
    prim_path       VARCHAR(2048),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_factory_data_prim_path ON factory_data(prim_path);

CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(50) NOT NULL UNIQUE,
    email           VARCHAR(100) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ
);


-- ============================================================
-- 软删除 + 资产版本/扩展列（对齐 SimulationService 设计，UUID 适配）
-- 仅 Creator-only 表加 is_deleted；md_* 合并表由 sim_backend 拥有，不动。
-- 幂等：ADD COLUMN IF NOT EXISTS，可重复执行。
-- 同步逻辑见 aifactory_backend/migrate_softdelete_versioning.py
-- ============================================================
ALTER TABLE asset_type_dict           ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE asset_categories          ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE line_model_details        ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE equipment_model_details   ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE line_model_equipment_rel  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE instance_asset_type_dict  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE factory_projects          ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE factory_asset_node        ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE factory_process_details   ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE factory_line_details      ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE factory_equipment_details ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE factory_asset_3d_model    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

-- 软删除模型下的唯一性保证：同一线体的同一设备实例，活跃行(is_deleted=false)至多一条。
-- 软删除采用「标记旧 + 追加新」，无此 partial unique index 则重传/并发/未来写入口可能
-- 静默累积重复活跃行（历史上 line_model_equipment_rel 曾因此堆出 17 倍重复）。
-- 已删除行不入索引，故历史 tombstone 可任意多份、互不冲突。
CREATE UNIQUE INDEX IF NOT EXISTS uq_line_model_equipment_rel_live
    ON line_model_equipment_rel (line_model_id, equipment_model_id, instance_name)
    WHERE is_deleted = false;

-- line/equipment_model_details 版本管理 + 扩展字段（asset_version_id 用 VARCHAR(36)）
ALTER TABLE line_model_details
    ADD COLUMN IF NOT EXISTS category VARCHAR(100),
    ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(100),
    ADD COLUMN IF NOT EXISTS model VARCHAR(100),
    ADD COLUMN IF NOT EXISTS format VARCHAR(50),
    ADD COLUMN IF NOT EXISTS poly_count INTEGER,
    ADD COLUMN IF NOT EXISTS prim_path VARCHAR(255),
    ADD COLUMN IF NOT EXISTS instance_path VARCHAR(255),
    ADD COLUMN IF NOT EXISTS width NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS depth NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS height NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS asset_version_id VARCHAR(36),
    ADD COLUMN IF NOT EXISTS version_tag VARCHAR(50) NOT NULL DEFAULT 'v1.0',
    ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS remark TEXT,
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
UPDATE line_model_details SET asset_version_id = id WHERE asset_version_id IS NULL;
ALTER TABLE line_model_details ALTER COLUMN status SET DEFAULT 'DRAFT';

ALTER TABLE equipment_model_details
    ADD COLUMN IF NOT EXISTS category VARCHAR(100),
    ADD COLUMN IF NOT EXISTS model VARCHAR(100),
    ADD COLUMN IF NOT EXISTS format VARCHAR(50),
    ADD COLUMN IF NOT EXISTS poly_count INTEGER,
    ADD COLUMN IF NOT EXISTS prim_path VARCHAR(255),
    ADD COLUMN IF NOT EXISTS instance_path VARCHAR(255),
    ADD COLUMN IF NOT EXISTS width NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS depth NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS height NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS asset_version_id VARCHAR(36),
    ADD COLUMN IF NOT EXISTS version_tag VARCHAR(50) NOT NULL DEFAULT 'v1.0',
    ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS remark TEXT,
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
UPDATE equipment_model_details SET asset_version_id = id WHERE asset_version_id IS NULL;
ALTER TABLE equipment_model_details ALTER COLUMN status SET DEFAULT 'DRAFT';
