"""Parameter template CRUD API endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.sim import ParameterOverride, SoftConstraintConfig, SimulationPlan
from app.models.tpl import ParameterTemplate
from app.schemas.sim import TemplateCreate, TemplateOut

router = APIRouter(prefix="/templates", tags=["Templates"])


@router.get("", response_model=list[TemplateOut])
def list_templates(db: Session = Depends(get_db)):
    return db.query(ParameterTemplate).order_by(ParameterTemplate.updated_at.desc()).all()


@router.post("", response_model=TemplateOut, status_code=201)
def create_template(body: TemplateCreate, db: Session = Depends(get_db)):
    t = ParameterTemplate(
        template_id=str(uuid.uuid4()),
        template_name=body.template_name,
        template_type="PARAMETER",
        template_description=body.template_description,
        factory_id=body.factory_id,
        is_public=body.is_public,
        template_content=body.template_content,
        created_by=body.created_by,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: str, db: Session = Depends(get_db)):
    t = db.query(ParameterTemplate).get(template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    db.delete(t)
    db.commit()


@router.post("/{template_id}/copy", response_model=TemplateOut, status_code=201)
def copy_template(template_id: str, db: Session = Depends(get_db)):
    src = db.query(ParameterTemplate).get(template_id)
    if not src:
        raise HTTPException(404, "Template not found")
    copy = ParameterTemplate(
        template_id=str(uuid.uuid4()),
        template_name=f"{src.template_name} (Copy)",
        template_type=src.template_type,
        template_description=src.template_description,
        factory_id=src.factory_id,
        is_public=src.is_public,
        template_content=src.template_content,
        created_by=src.created_by,
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return copy


# Apply template to a plan
apply_router = APIRouter(prefix="/plans", tags=["Templates"])


@apply_router.post("/{plan_id}/apply-template/{template_id}")
def apply_template(plan_id: str, template_id: str, db: Session = Depends(get_db)):
    plan = db.query(SimulationPlan).get(plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    tmpl = db.query(ParameterTemplate).get(template_id)
    if not tmpl:
        raise HTTPException(404, "Template not found")

    content = tmpl.template_content or {}

    # Apply overrides from template
    if "overrides" in content:
        # Clear existing overrides
        db.query(ParameterOverride).filter(ParameterOverride.plan_id == plan_id).delete()
        for ov in content["overrides"]:
            db.add(ParameterOverride(
                override_id=str(uuid.uuid4()),
                plan_id=plan_id,
                **ov,
            ))

    # Apply constraints from template
    if "constraints" in content:
        for c in content["constraints"]:
            existing = (
                db.query(SoftConstraintConfig)
                .filter(SoftConstraintConfig.plan_id == plan_id,
                        SoftConstraintConfig.constraint_type == c["constraint_type"])
                .first()
            )
            if existing:
                existing.is_enabled = c["is_enabled"]
            else:
                db.add(SoftConstraintConfig(
                    constraint_id=str(uuid.uuid4()),
                    plan_id=plan_id,
                    constraint_type=c["constraint_type"],
                    is_enabled=c["is_enabled"],
                ))

    db.commit()
    return {"status": "applied", "template_id": template_id}
