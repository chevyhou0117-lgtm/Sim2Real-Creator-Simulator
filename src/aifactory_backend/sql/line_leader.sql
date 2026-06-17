
CREATE TABLE line_leaders_info (
    id BIGINT PRIMARY KEY,  -- 使用雪花算法生成的ID
    -- 关联到线体资产节点
    factory_asset_id BIGINT NOT NULL,  -- 关联到 factory_asset_node.id
    line_leader_name VARCHAR(255),
    employee_id VARCHAR(50),
    contact_number VARCHAR(50),
    email VARCHAR(255),

    shift_schedule VARCHAR(100),  -- 如 "3-Shift Rotation"
    shift_a_leader VARCHAR(255),
    shift_b_leader VARCHAR(255),
    shift_c_leader VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,


    -- 外键约束：关联到线体资产节点的表
    FOREIGN KEY (factory_asset_id) REFERENCES factory_asset_node(id) ON DELETE CASCADE
);
