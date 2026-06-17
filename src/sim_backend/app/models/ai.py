"""AI analysis layer models (ai_ prefix)."""

import uuid

from sqlalchemy import (
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
# ai_analysis_result
# ---------------------------------------------------------------------------
class AIAnalysisResult(Base):
    __tablename__ = "ai_analysis_result"

    ai_result_id = Column(String(36), primary_key=True, default=_uuid)
    result_id = Column(String(36), ForeignKey("res_simulation_result.result_id"), nullable=False, unique=True)
    bottleneck_analysis = Column(JSONB, nullable=False)
    analysis_summary = Column(Text)
    knowledge_base_version = Column(String(20))
    model_version = Column(String(50))
    generation_status = Column(String(20), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    result = relationship("SimulationResult", back_populates="ai_analysis")
    suggestions = relationship("ImprovementSuggestion", back_populates="ai_result")


# ---------------------------------------------------------------------------
# ai_improvement_suggestion
# ---------------------------------------------------------------------------
class ImprovementSuggestion(Base):
    __tablename__ = "ai_improvement_suggestion"

    suggestion_id = Column(String(36), primary_key=True, default=_uuid)
    ai_result_id = Column(String(36), ForeignKey("ai_analysis_result.ai_result_id"), nullable=False)
    target_type = Column(String(30), nullable=False)
    target_id = Column(String(36))
    suggestion_category = Column(String(30), nullable=False)
    priority = Column(Integer, nullable=False)
    description = Column(Text, nullable=False)
    expected_impact = Column(JSONB)
    implementation_cost = Column(String(20))
    implementation_effort = Column(String(20))
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    ai_result = relationship("AIAnalysisResult", back_populates="suggestions")
