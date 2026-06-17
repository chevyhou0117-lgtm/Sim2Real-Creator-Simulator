"""Template and version layer models (tpl_ prefix)."""

import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# tpl_parameter_template
# ---------------------------------------------------------------------------
class ParameterTemplate(Base):
    __tablename__ = "tpl_parameter_template"

    template_id = Column(String(36), primary_key=True, default=_uuid)
    template_name = Column(String(200), nullable=False)
    template_type = Column(String(30), nullable=False)
    template_description = Column(Text)
    factory_id = Column(String(36), ForeignKey("md_factory.factory_id"))
    is_public = Column(Boolean, nullable=False, default=True)
    template_content = Column(JSONB, nullable=False)
    created_by = Column(String(50), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    factory = relationship("Factory")


# ---------------------------------------------------------------------------
# tpl_plan_version
# ---------------------------------------------------------------------------
class PlanVersion(Base):
    __tablename__ = "tpl_plan_version"

    version_id = Column(String(36), primary_key=True, default=_uuid)
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id"), nullable=False)
    version_name = Column(String(100), nullable=False)
    version_no = Column(Integer, nullable=False)
    is_baseline = Column(Boolean, nullable=False, default=False)
    key_metrics = Column(JSONB)
    notes = Column(Text)
    archived_at = Column(DateTime, nullable=False)
    archived_by = Column(String(50))
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    plan = relationship("SimulationPlan", back_populates="versions")
