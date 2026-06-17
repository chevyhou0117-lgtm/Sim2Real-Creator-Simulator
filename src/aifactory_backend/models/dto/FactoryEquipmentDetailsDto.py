from typing import Any, Dict, List, Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from commonutils.SnowflakeUtils import SnowflakeIdIn



#  子表嵌套 Upsert DTO（用于 FactoryEquipmentDetailsUpdateDto 内嵌）
class TechnicalSpecUpsertDto(BaseModel):
    """技术规格 Upsert DTO（1:1，有则更新，无则创建）→ base_equipment_technical_spec"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    main_parameters: Optional[Dict[str, Any]] = Field(default=None, description="主要技术参数（JSON）")
    power: Optional[str] = Field(default=None, description="设备功率")
    size: Optional[str] = Field(default=None, description="尺寸（长x宽x高）")
    weight: Optional[str] = Field(default=None, description="重量")


class ProcessParamUpsertDto(BaseModel):
    """过程参数 Upsert DTO（1:1，有则更新，无则创建）→ base_equipment_process_param"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    standard_ct: Optional[float] = Field(default=None, description="设备标准节拍（秒）")
    standard_yield_rate: Optional[float] = Field(default=None, description="设备标准良品率（0.0000~1.0000）")
    standard_work_efficiency: Optional[float] = Field(default=None, description="设备标准作业效率（0.0000~1.0000）")


class BomPartUpsertItemDto(BaseModel):
    """BOM备件 Upsert 单条 DTO（id 有值=更新，无值=新增）→ base_equipment_bom_part"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: Optional[SnowflakeIdIn] = Field(default=None, description="备件主键ID，不传则新增，传则更新")
    part_code: Optional[str] = Field(default=None, description="备件编码")
    part_name: Optional[str] = Field(default=None, description="备件名称")
    part_model: Optional[str] = Field(default=None, description="备件型号")
    part_manufacturer: Optional[str] = Field(default=None, description="备件厂商")
    part_qty: Optional[int] = Field(default=None, description="备件数量")
    unit: Optional[str] = Field(default=None, description="备件单位")
    parent_part_id: Optional[SnowflakeIdIn] = Field(default=None, description="父级备件ID（自引用BOM树）")
    part_position: Optional[str] = Field(default=None, description="备件位置")
    part_photo_url: Optional[str] = Field(default=None, description="备件照片URL")
    part_theoretical_life: Optional[float] = Field(default=None, description="理论寿命（天）")
    part_remaining_life: Optional[float] = Field(default=None, description="剩余寿命（天）")


class SopUpsertItemDto(BaseModel):
    """SOP 作业指导 Upsert 单条 DTO（id 有值=更新，无值=新增）→ base_equipment_sop"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: Optional[SnowflakeIdIn] = Field(default=None, description="SOP主键ID，不传则新增，传则更新")
    document_no: Optional[str] = Field(default=None, description="文档编号")
    document_title: Optional[str] = Field(default=None, description="文档标题")
    document_version: Optional[str] = Field(default=None, description="文档版本")
    document_url: Optional[str] = Field(default=None, description="文档文件URL（PDF/Word等）")
    created_by: Optional[str] = Field(default=None, description="创建人")


class OperationRecordUpsertItemDto(BaseModel):
    """运行记录 Upsert 单条 DTO（id 有值=更新，无值=新增）→ base_equipment_operation_record"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: Optional[SnowflakeIdIn] = Field(default=None, description="记录主键ID，不传则新增，传则更新")
    record_code: Optional[str] = Field(default=None, description="记录编号")
    record_type: Optional[str] = Field(default=None, description="记录类型：EQUIPMENT_ADD / EQUIPMENT_REPAIR / EQUIPMENT_MOVE / EQUIPMENT_MAINTENANCE / EQUIPMENT_SCRAP")
    related_department: Optional[str] = Field(default=None, description="相关部门")
    stage_status: Optional[str] = Field(default=None, description="阶段状态（如：进行中/已完成）")
    record_description: Optional[str] = Field(default=None, description="记录详细描述")
    created_by: Optional[str] = Field(default=None, description="创建人")


#  主 DTO
class FactoryEquipmentDetailsCreateDto(BaseModel):
    """创建设备详情请求 DTO（重构版，冗余字段通过 base_equipment 获取，3D模型/空间定位独立管理）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    factory_asset_id: SnowflakeIdIn = Field(..., description="关联工厂资产节点ID（雪花算法）")
    ref_id: Optional[SnowflakeIdIn] = Field(default=None, description="关联 base_equipment.equipment_id，绑定设备基础信息")
    specifications: Optional[Dict[str, Any]] = Field(default=None, description="技术规格扩展（JSONB）")
    installation_date: Optional[datetime] = Field(default=None, description="安装日期（实例级）")
    position_data: Optional[Dict[str, Any]] = Field(default=None, description="空间坐标，例如: {\"x\": 0, \"y\": 0, \"z\": 0}")
    rotation_data: Optional[Dict[str, Any]] = Field(default=None, description="旋转角度，例如: {\"rx\": 0, \"ry\": 0, \"rz\": 0}")
    extra_metadata: Optional[Dict[str, Any]] = Field(default=None, description="扩展元数据（JSONB）")
    description: Optional[str] = Field(default=None, description="实例级补充描述")


class FactoryEquipmentDetailsUpdateDto(BaseModel):
    """
    更新设备详情请求 DTO（id 必填）
    覆盖 FactoryEquipmentDetailsVo 全部可编辑字段，支持同时更新多层数据：
    - [实例层]   factory_equipment_details（实例规格、安装日期、空间定位等）
    - [3D模型层] factory_asset_3d_model（USD路径、Prim路径等）
    - [基础设备] base_equipment（设备名称、品牌、厂商、型号等基础信息）
    - [技术规格] base_equipment_technical_spec（1:1，Upsert）
    - [过程参数] base_equipment_process_param（1:1，Upsert）
    - [BOM备件]  base_equipment_bom_part（1:N，id有值=更新，无值=新增）
    - [SOP]     base_equipment_sop（1:N，id有值=更新，无值=新增）
    - [运行记录] base_equipment_operation_record（1:N，id有值=更新，无值=新增）
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: SnowflakeIdIn = Field(..., description="设备详情主键ID（雪花算法，18~19位整数）")

    # ===== [实例层] factory_equipment_details =====
    factory_asset_id: Optional[SnowflakeIdIn] = Field(default=None, description="[实例] 关联工厂资产节点ID")
    ref_id: Optional[SnowflakeIdIn] = Field(default=None, description="[实例] 关联 base_equipment.equipment_id，绑定设备基础信息")
    specifications: Optional[Dict[str, Any]] = Field(default=None, description="[实例] 技术规格扩展（JSONB）")
    installation_date: Optional[datetime] = Field(default=None, description="[实例] 安装日期")
    position_data: Optional[Dict[str, Any]] = Field(default=None, description="[实例] 空间坐标，例如: {\"x\": 0, \"y\": 0, \"z\": 0}")
    rotation_data: Optional[Dict[str, Any]] = Field(default=None, description="[实例] 旋转角度，例如: {\"rx\": 0, \"ry\": 0, \"rz\": 0}")
    extra_metadata: Optional[Dict[str, Any]] = Field(default=None, description="[实例] 扩展元数据（JSONB）")
    description: Optional[str] = Field(default=None, description="[实例] 补充描述")

    # ===== [3D模型层] factory_asset_3d_model =====
    usd_name: Optional[str] = Field(default=None, description="[3D] USD文件名称")
    usd_id: Optional[str] = Field(default=None, description="[3D] USD唯一标识")
    root_usd_path: Optional[str] = Field(default=None, description="[3D] 根USD文件路径")
    bucket_name: Optional[str] = Field(default=None, description="[3D] 存储桶名称")
    prim_path: Optional[str] = Field(default=None, description="[3D] Prim路径")
    location_path: Optional[str] = Field(default=None, description="[3D] 位置路径")
    thumbnail_path: Optional[str] = Field(default=None, description="[3D] 缩略图路径")

    # ===== [基础设备] base_equipment =====
    operation_id: Optional[SnowflakeIdIn] = Field(default=None, description="[基础] 所属工序ID")
    line_id: Optional[SnowflakeIdIn] = Field(default=None, description="[基础] 所属产线ID")
    equipment_code: Optional[str] = Field(default=None, description="[基础] 设备编码")
    equipment_name: Optional[str] = Field(default=None, description="[基础] 设备名称")
    equipment_type: Optional[str] = Field(default=None, description="[基础] 设备类型")
    equipment_group_id: Optional[str] = Field(default=None, description="[基础] 设备组ID")
    brand: Optional[str] = Field(default=None, description="[基础] 设备品牌")
    manufacturer: Optional[str] = Field(default=None, description="[基础] 设备厂商")
    model_no: Optional[str] = Field(default=None, description="[基础] 设备型号")
    manufacture_date: Optional[datetime] = Field(default=None, description="[基础] 出厂日期")
    manufacture_code: Optional[str] = Field(default=None, description="[基础] 出厂编号")
    made_in: Optional[str] = Field(default=None, description="[基础] 产地")
    supplier: Optional[str] = Field(default=None, description="[基础] 供应商")
    supplier_phone: Optional[str] = Field(default=None, description="[基础] 供应商电话")
    purchase_date: Optional[datetime] = Field(default=None, description="[基础] 购置日期")
    service_life: Optional[int] = Field(default=None, description="[基础] 使用寿命（年）")
    standard_ct: Optional[float] = Field(default=None, description="[基础] 标准节拍（秒）")
    unit: Optional[str] = Field(default=None, description="[基础] 设备单位")
    location: Optional[str] = Field(default=None, description="[基础] 设备位置")
    equipment_photo: Optional[str] = Field(default=None, description="[基础] 设备图片路径")
    responsible_person: Optional[str] = Field(default=None, description="[基础] 责任人")
    asset_code: Optional[str] = Field(default=None, description="[基础] 资产编号")
    status: Optional[str] = Field(default=None, description="[基础] 状态（ACTIVE / INACTIVE）")
    sort_order: Optional[int] = Field(default=None, description="[基础] 排序")

    # ===== [技术规格] base_equipment_technical_spec（1:1 Upsert）=====
    technical_spec: Optional[TechnicalSpecUpsertDto] = Field(default=None, description="[技术规格] 有则更新，无则创建（1:1）")

    # ===== [过程参数] base_equipment_process_param（1:1 Upsert）=====
    process_param: Optional[ProcessParamUpsertDto] = Field(default=None, description="[过程参数] 有则更新，无则创建（1:1）")

    # ===== [BOM备件] base_equipment_bom_part（1:N，id有值=更新，无值=新增）=====
    bom_parts: Optional[List[BomPartUpsertItemDto]] = Field(default=None, description="[BOM备件] id有值=更新该条，无值=新增（1:N）")

    # ===== [SOP] base_equipment_sop（1:N，id有值=更新，无值=新增）=====
    sop_list: Optional[List[SopUpsertItemDto]] = Field(default=None, description="[SOP作业指导] id有值=更新该条，无值=新增（1:N）")

    # ===== [运行记录] base_equipment_operation_record（1:N，id有值=更新，无值=新增）=====
    operation_records: Optional[List[OperationRecordUpsertItemDto]] = Field(default=None, description="[运行记录] id有值=更新该条，无值=新增（1:N）")


class FactoryEquipmentDetailsDeleteDto(BaseModel):
    """删除设备详情请求 DTO"""

    id: SnowflakeIdIn = Field(..., description="设备详情主键ID（雪花算法，18~19位整数）")

