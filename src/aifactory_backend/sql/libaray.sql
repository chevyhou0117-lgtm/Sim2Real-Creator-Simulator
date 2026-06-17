-- ==========================================
-- 1. 创建资产分类主表
-- ==========================================
CREATE TABLE IF NOT EXISTS asset_categories (
    id BIGSERIAL PRIMARY KEY,          -- 自增主键
    name VARCHAR(255) NOT NULL,
    code VARCHAR(100) NOT NULL UNIQUE,

    -- 【优化点】移除了 CHECK 约束，完全依赖下面的外键约束
    type VARCHAR(50) NOT NULL,
    parent_id BIGINT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- 添加外键约束 (防止重复创建报错，视数据库版本而定，通常直接添加即可)
ALTER TABLE asset_categories
DROP CONSTRAINT IF EXISTS fk_parent;

ALTER TABLE asset_categories
ADD CONSTRAINT fk_parent
FOREIGN KEY (parent_id) REFERENCES asset_categories(id)
ON DELETE SET NULL;

-- ==========================================
-- 2. 创建线体模型详情表
-- ==========================================
CREATE TABLE IF NOT EXISTS line_model_details (
    id BIGINT PRIMARY KEY,
    category_id BIGINT NOT NULL, -- 关联 asset_categories.id
    bucket_name VARCHAR(100) DEFAULT 'ov-usd-bucket', -- 存储桶名称
    root_usd_path VARCHAR(1024) NOT NULL, -- 根USD文件路径
    location_path VARCHAR(1024) NOT NULL, -- 位置路径
    thumbnail_path VARCHAR(1024), -- 缩略图路径
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE line_model_details
DROP CONSTRAINT IF EXISTS fk_line_category;

ALTER TABLE line_model_details
ADD CONSTRAINT fk_line_category
FOREIGN KEY (category_id) REFERENCES asset_categories(id)
ON DELETE CASCADE;

-- ==========================================
-- 3. 创建设备模型详情表
-- ==========================================
CREATE TABLE IF NOT EXISTS equipment_model_details (
    id BIGINT PRIMARY KEY,
    category_id BIGINT NOT NULL, -- 关联 asset_categories.id
    bucket_name VARCHAR(100) DEFAULT 'ov-usd-bucket', -- 存储桶名称
    manufacturer VARCHAR(100), -- 制造商
    asset_type VARCHAR(255), -- 资产类型
    brand VARCHAR(50), -- 品牌
    root_usd_path VARCHAR(1024) NOT NULL, -- 根USD文件路径
    location_path VARCHAR(1024) NOT NULL, -- 位置路径
    thumbnail_path VARCHAR(1024), -- 缩略图路径
    specifications JSONB, -- 规格参数
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE equipment_model_details
DROP CONSTRAINT IF EXISTS fk_equipment_category;

ALTER TABLE equipment_model_details
ADD CONSTRAINT fk_equipment_category
FOREIGN KEY (category_id) REFERENCES asset_categories(id)
ON DELETE CASCADE;



-- ==========================================
-- 1. 创建简洁的类型字典表
-- ==========================================
CREATE TABLE IF NOT EXISTS asset_type_dict (
    type VARCHAR(50) PRIMARY KEY,      -- 类型编码 (如: process)
    name VARCHAR(100) NOT NULL         -- 类型名称 (如: 工序)
);

-- 插入初始数据
-- ==========================================
-- 1. 创建字典表（将 'type' 改为 'code'）
-- ==========================================
CREATE TABLE IF NOT EXISTS asset_type_dict (
    code VARCHAR(50) PRIMARY KEY,      -- 改为 code，避开保留字，且含义更准确
    name VARCHAR(100) NOT NULL
);

-- 插入初始数据
INSERT INTO asset_type_dict (code, name) VALUES
('process', '工序'),
('line_type', '线体类型'),
('equipment_type', '设备类型'),
('line_model', '线体模型'),
('equipment_model', '设备型号');


-- ==========================================
-- 2. 修改主表结构
-- ==========================================

-- 删除原有的 CHECK 约束
ALTER TABLE asset_categories DROP CONSTRAINT IF EXISTS asset_categories_type_check;

-- 添加外键约束
-- 主表的 type 字段 -> 关联字典表的 code 字段
ALTER TABLE asset_categories
ADD CONSTRAINT fk_asset_type
FOREIGN KEY (type) REFERENCES asset_type_dict(code)
ON UPDATE CASCADE;




-- -- ==========================================
-- -- 4. 插入示例数据
-- -- ==========================================
--
-- -- 4.1 插入制程 (process)
-- INSERT INTO asset_categories (id, name, code, type, description) VALUES
-- (1001, 'SMT', 'SMT_001', 'process', '表面贴装技术制程'),
-- (1002, 'Assembly', 'Assembly_001', 'process', '组装制程')
-- ON CONFLICT (id) DO NOTHING;
--
-- -- 4.2 插入 SMT 制程下的线体类型 (line_type)
-- INSERT INTO asset_categories (id, name, code, type, parent_id, description) VALUES
-- (1003, 'SMT Lines', 'SMT_Lines_001', 'line_type', 1001, 'SMT 产线类型')
-- ON CONFLICT (id) DO NOTHING;
--
-- -- 4.3 插入 SMT 制程下的设备类型 (equipment_type)
-- INSERT INTO asset_categories (id, name, code, type, parent_id, description) VALUES
-- (1004, 'Stencil Printers', 'SMT_Stencil_001', 'equipment_type', 1001, '钢网印刷机设备类型'),
-- (1005, 'Chip Mounters', 'SMT_ChipMounter_001', 'equipment_type', 1001, '贴片机设备类型')
-- ON CONFLICT (id) DO NOTHING;
--
-- -- 4.4 插入 Assembly 制程下的设备类型 (equipment_type)
-- INSERT INTO asset_categories (id, name, code, type, parent_id, description) VALUES
-- (1006, 'Robotic', 'Robotic_001', 'equipment_type', 1002, '机器人设备类型')
-- ON CONFLICT (id) DO NOTHING;
--
-- -- 4.5 插入线体模型 (line_model)
-- INSERT INTO asset_categories (id, name, code, type, parent_id, description) VALUES
-- (1007, 'SMT Complete Line', 'SMT_Complete_001', 'line_model', 1003, 'SMT 完整线体模型'),
-- (1008, 'Mini SMT Line', 'SMT_Mini_001', 'line_model', 1003, 'SMT 迷你线体模型')
-- ON CONFLICT (id) DO NOTHING;
--
-- -- 4.6 插入设备模型 (equipment_model)
-- INSERT INTO asset_categories (id, name, code, type, parent_id, description) VALUES
-- (1009, 'DEK NeoHorizon 03iX', 'DEK_03iX_001', 'equipment_model', 1004, 'DEK NeoHorizon 03iX 钢网印刷机'),
-- (1010, 'MPM Momentum', 'MPM_Momentum_001', 'equipment_model', 1004, 'MPM Momentum 钢网印刷机'),
-- (1011, 'SM471 Plus', 'SM471_Plus_001', 'equipment_model', 1005, 'SM471 Plus 贴片机'),
-- (1012, 'KUKA KR 6 R700', 'KUKA_KR6_001', 'equipment_model', 1006, 'KUKA KR 6 R700 机器人')
-- ON CONFLICT (id) DO NOTHING;
--
-- -- ==========================================
-- -- 5. 插入详情数据
-- -- ==========================================
--
-- -- 5.1 线体模型详情
-- INSERT INTO line_model_details (id, category_id, root_usd_path, location_path, thumbnail_path) VALUES
-- (2001, 1007, '/assets/smt/SMT_Complete_Line/SMT_Complete_Line.usd', '/smt/line1', '/thumbnails/SMT_Complete_Line.jpg'),
-- (2002, 1008, '/assets/smt/Mini_SMT_Line/Mini_SMT_Line.usd', '/smt/line2', '/thumbnails/Mini_SMT_Line.jpg')
-- ON CONFLICT (id) DO NOTHING;
--
-- -- 5.2 设备模型详情
-- INSERT INTO equipment_model_details (id, category_id, manufacturer, asset_type, brand, root_usd_path, location_path, thumbnail_path, specifications) VALUES
-- (3001, 1009, 'DEK', 'Stencil Printer', 'DEK', '/assets/smt/DEK_03iX/DEK_03iX.usd', '/smt/line1/printer1', '/thumbnails/DEK_03iX.jpg', '{"print_area": "330x460mm", "print_speed": "up to 150mm/s"}'),
-- (3002, 1010, 'MPM', 'Stencil Printer', 'MPM', '/assets/smt/MPM_Momentum/MPM_Momentum.usd', '/smt/line1/printer2', '/thumbnails/MPM_Momentum.jpg', '{"print_area": "457x457mm", "print_speed": "up to 100mm/s"}'),
-- (3003, 1011, 'SMI', 'Chip Mounter', 'SMI', '/assets/smt/SM471_Plus/SM471_Plus.usd', '/smt/line1/mounter1', '/thumbnails/SM471_Plus.jpg', '{"placement_speed": "up to 50,000 cph", "component_range": "0201 to 25mm x 30mm"}'),
-- (3004, 1012, 'KUKA', 'Industrial Robot', 'KUKA', '/assets/assembly/KUKA_KR6/KUKA_KR6.usd', '/assembly/line1/robot1', '/thumbnails/KUKA_KR6.jpg', '{"payload": "6 kg", "reach": "700 mm"}')
-- ON CONFLICT (id) DO NOTHING;
--
-- -- ==========================================
-- -- 6. 插入默认数据 (Default Data)
-- -- ==========================================
--
-- -- 6.1 默认制程
-- INSERT INTO asset_categories (id, name, code, type, description) VALUES
-- (2000, 'default_process', 'default_process_001', 'process', '默认制程')
-- ON CONFLICT (id) DO NOTHING;
--
-- -- 6.2 默认线体类型
-- INSERT INTO asset_categories (id, name, code, type, parent_id, description) VALUES
-- (2001, 'default_line', 'default_line_001', 'line_type', 2000, '默认线体类型')
-- ON CONFLICT (id) DO NOTHING;
--
-- -- 6.3 默认设备类型
-- INSERT INTO asset_categories (id, name, code, type, parent_id, description) VALUES
-- (2002, 'default_equipment', 'default_equipment_001', 'equipment_type', 2000, '默认设备类型')
-- ON CONFLICT (id) DO NOTHING;