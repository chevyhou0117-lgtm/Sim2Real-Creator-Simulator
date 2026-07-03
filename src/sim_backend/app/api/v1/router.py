from fastapi import APIRouter

from app.api.v1.bop import router as bop_router
from app.api.v1.imports import router as imports_router
from app.api.v1.master_data import (
    creator_projects_router,
    products_router,
    router as master_data_router,
)
from app.api.v1.plan_md import router as plan_md_router
from app.api.v1.plans import router as plans_router
from app.api.v1.simulation import router as simulation_router
from app.api.v1.versions import router as versions_router
from app.api.v1.templates import apply_router, router as templates_router
from app.api.v1.exports import router as exports_router

api_router = APIRouter()

api_router.include_router(master_data_router)
api_router.include_router(products_router)
api_router.include_router(creator_projects_router)
api_router.include_router(bop_router)
api_router.include_router(plans_router)
api_router.include_router(plan_md_router)
api_router.include_router(simulation_router)
api_router.include_router(versions_router)
api_router.include_router(templates_router)
api_router.include_router(apply_router)
api_router.include_router(exports_router)
api_router.include_router(imports_router)
