from contextlib import asynccontextmanager
import nest_asyncio
import uvicorn
import logging
from fastapi.middleware.cors import CORSMiddleware
from config.PgSqlConfig import engine
from config.PgSqlConfig import Base
import models.entity  # noqa: F401  导入全部 entity，保证 create_all/FK 解析时 metadata 完整
from exception.ExceptionHandler import setup_exception_handlers
# from managers.RedisManager import redis_manager
from commonutils.Logs import init_logging
from dotenv import load_dotenv
import os
from fastapi import FastAPI
from routers.AssetCategoryController import asset_category_router
from routers.FactoryAssetNodeController import factory_asset_node_router
# from routers.FactoryAssetNodeController import factory_asset_node_router
from routers.LineModelDetailController import line_model_detail_router
from routers.EquipmentModelDetailController import equipment_model_detail_router
from routers.AssetModelStatusController import asset_model_status_router
from routers.AssetDownloadController import asset_download_router
from routers.AssetUploadController import asset_upload_router
from routers.AssetTypeDictController import asset_type_dict_router
from routers.FactoryProjectController import factory_project_router
from routers.LineLeaderController import line_leader_router
from routers.BaseFactoryController import base_factory_router
from routers.BaseStageController import base_stage_router
from routers.BaseProductionLineController import router as base_production_line_router
from routers.BaseLineOperationController import router as base_line_operation_router
from routers.BaseEquipmentController import router as base_equipment_router
from routers.BaseEquipmentFailureParamController import router as base_equipment_failure_param_router
from routers.BaseEquipmentBomPartController import router as base_equipment_bom_part_router
from routers.BaseEquipmentOperationRecordController import router as base_equipment_operation_record_router
from routers.BaseEquipmentProcessParamController import router as base_equipment_process_param_router
from routers.BaseEquipmentSopController import router as base_equipment_sop_router
from routers.BaseEquipmentTechnicalSpecController import router as base_equipment_technical_spec_router
from routers.BaseWipBufferController import router as base_wip_buffer_router
from routers.BaseWarehouseController import router as base_warehouse_router
from routers.BaseStaffingConfigController import router as base_staffing_config_router
from routers.DictStageTypeController import router as dict_stage_type_router
from routers.DictEquipmentTypeController import router as dict_equipment_type_router
from routers.DictWarehouseTypeController import router as dict_warehouse_type_router
from routers.DictWorkerTypeController import router as dict_worker_type_router
from routers.DictNgCategoryController import router as dict_ng_category_router
from routers.FactoryProjectVersionController import factory_project_version_router
from routers.FactoryProcessDetailsController import factory_process_details_router
from routers.FactoryLineDetailsController import factory_line_details_router
from routers.FactoryEquipmentDetailsController import factory_equipment_details_router

init_logging()

# # 在每个模块中单独获取自己的logger
logger = logging.getLogger(__name__)
logger.info("项目开始启动main.py....")

load_dotenv()
# 获取环境变量，默认值为 development
environment = os.getenv("ENVIRONMENT", "development")
logger.info(f"environment:{environment}")
is_production = environment == "production"
logger.info(f"is_production:{is_production}")


# 定义上下文生命周期
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Phase 1（先跑通）：用 Creator 原表（base_*/dict_*/factory_* 等）在本地库建表，
    #   与 sim_backend 的 md_*/sim_*/res_* 表名不冲突，可共存。create_all 由 env 控制，默认开。
    # Phase 2（再合并）：主数据并入 sim_backend 的 md_*，届时把 AIFACTORY_CREATE_ALL=false，
    #   schema 改由 sim_backend/seed_data/creator_tables.sql 统一拥有。
    _create_all = os.getenv("AIFACTORY_CREATE_ALL", "true").strip().lower() in ("1", "true", "yes", "on")
    if _create_all:
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            print(">>> Database tables created/verified successfully.")
        except Exception as e:
            print(f"!!! Error creating tables: {e}")
    else:
        print(">>> AIFACTORY_CREATE_ALL=false：跳过 create_all，依赖 sim_backend 已建好的表结构。")
    # 初始化 RabbitMQ 生产者
    # try:
    #     await init_producer()
    # except Exception as e:
    #     logger.warning(f"RabbitMQ 初始化失败，跳过: {e}")
    # 初始化 Kafka 生产者
    # try:
        # await init_kafka_producer()
    # except Exception as e:
    #     logger.warning(f"Kafka 生产者初始化失败，跳过: {e}")
    # 初始化 Kafka 消费者
    # try:
    #     await init_kafka_consumer()
    # except Exception as e:
    #     logger.warning(f"Kafka 消费者初始化失败，跳过: {e}")
    yield
    # 关闭 RabbitMQ 生产者
    # await close_producer()
    # 关闭 Kafka 生产者
    # await close_kafka_producer()
    # 关闭 Kafka 消费者
    # await close_kafka_consumer()
    # await engine.dispose()

    # await redis_manager.ensure_connection()  # 确保 Redis 连接
    # logger.info("redis is connected")
    # yield
    # # 关闭连接
    # await redis_manager.close()  # 关闭 Redis 连接
    # logger.info("redis is closed")


# todo docs_url/redoc_url/openapi_url  这部分.env 环境需要设置prodution
# openapi_url="/openapi.json" if not is_production else None
# app = FastAPI(
#     swagger_ui_parameters={"syntaxHighlight": True},
#     description="ov 3d资产上传开发swagger文档",
#     docs_url="/docs" if not is_production else None,
#     redoc_url="/redoc" if not is_production else None,
#     lifespan=lifespan  # 自动创建表结构
# )

app = FastAPI(
    swagger_ui_parameters={"syntaxHighlight": True},
    description="ov 3d资产上传开发swagger文档",
    docs_url="/docs",           # 直接指定路径，不再判断环境
    redoc_url="/redoc",         # 直接指定路径
    openapi_url="/openapi.json", # 确保这个也是开启的
    lifespan=lifespan
)

# 允许所有来源的跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境需指定具体域名，
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "Authorization"],
)

# 本地文件存储：把 AIFACTORY_STORAGE_ROOT 挂到 /static（替代 MinIO 直链/缩略图）
from fastapi.staticfiles import StaticFiles
from config.MinioConfig import STORAGE_ROOT as _STORAGE_ROOT
try:
    os.makedirs(_STORAGE_ROOT, exist_ok=True)
except Exception as _e:
    print(f"!!! 创建存储目录失败({_STORAGE_ROOT}): {_e}；/static 将不可用，但服务继续启动。")
if os.path.isdir(_STORAGE_ROOT):
    app.mount("/static", StaticFiles(directory=_STORAGE_ROOT), name="static")


# 设置全局异常把捕获中间件
setup_exception_handlers(app)
prefix="/api/v1"


app.include_router(asset_category_router, prefix=prefix, tags=["资产分类管理接口"])
app.include_router(line_model_detail_router, prefix=prefix, tags=["线体模型详情管理接口"])
app.include_router(equipment_model_detail_router, prefix=prefix, tags=["设备模型详情管理接口"])
app.include_router(asset_model_status_router, prefix=prefix, tags=["资产模型状态管理接口"])
app.include_router(asset_download_router, prefix=prefix, tags=["资产模型下载接口"])
app.include_router(asset_upload_router, prefix=prefix, tags=["资产模型文件上传接口"])
app.include_router(asset_type_dict_router, prefix=prefix, tags=["资产类型字典管理接口"])
app.include_router(factory_project_router, prefix=prefix, tags=["工厂项目管理接口"])
app.include_router(factory_asset_node_router, prefix=prefix, tags=["工厂实例树形结构的开发接口"])
app.include_router(factory_process_details_router, prefix=prefix, tags=["制程实例详情管理接口"])
app.include_router(factory_line_details_router, prefix=prefix, tags=["线体实例详情管理接口"])
app.include_router(factory_equipment_details_router, prefix=prefix, tags=["设备实例详情管理接口"])
app.include_router(line_leader_router, prefix=prefix, tags=["线体负责人信息管理接口"])
app.include_router(base_factory_router, prefix=prefix, tags=["工厂基础信息管理接口"])
app.include_router(base_stage_router, prefix=prefix, tags=["制程基础数据管理接口"])
app.include_router(base_production_line_router, prefix=prefix, tags=["线体基础数据管理接口"])
app.include_router(base_line_operation_router, prefix=prefix, tags=["工序基础数据管理接口"])
app.include_router(base_equipment_router, prefix=prefix, tags=["设备基础数据管理接口"])
app.include_router(base_equipment_failure_param_router, prefix=prefix, tags=["设备故障参数管理接口"])
app.include_router(base_equipment_bom_part_router, prefix=prefix, tags=["设备BOM备件管理接口"])
app.include_router(base_equipment_operation_record_router, prefix=prefix, tags=["设备运行记录管理接口"])
app.include_router(base_equipment_process_param_router, prefix=prefix, tags=["设备过程参数管理接口"])
app.include_router(base_equipment_sop_router, prefix=prefix, tags=["设备SOP作业指导管理接口"])
app.include_router(base_equipment_technical_spec_router, prefix=prefix, tags=["设备技术规格管理接口"])
app.include_router(base_wip_buffer_router, prefix=prefix, tags=["线边仓基础数据管理接口"])
app.include_router(base_warehouse_router, prefix=prefix, tags=["仓库基础数据管理接口"])
app.include_router(base_staffing_config_router, prefix=prefix, tags=["人员配置管理接口"])
app.include_router(dict_stage_type_router, prefix=prefix, tags=["制程类型字典管理接口"])
app.include_router(dict_equipment_type_router, prefix=prefix, tags=["设备类型字典管理接口"])
app.include_router(dict_warehouse_type_router, prefix=prefix, tags=["仓库类型字典管理接口"])
app.include_router(dict_worker_type_router, prefix=prefix, tags=["工种字典管理接口"])
app.include_router(dict_ng_category_router, prefix=prefix, tags=["不良类型字典管理接口"])
app.include_router(factory_project_version_router, prefix=prefix, tags=["项目版本管理接口"])


if __name__ == "__main__":

    nest_asyncio.apply()
    uvicorn.run("main:app", host="127.0.0.1", port=8129,reload=True)
