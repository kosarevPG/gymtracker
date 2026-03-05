"""Pydantic-схемы для валидации входящих запросов API."""

from typing import Optional, Any
from pydantic import BaseModel, Field


class SaveSetRequest(BaseModel):
    id: Optional[str] = None
    row_number: Optional[str] = None
    exercise_id: Optional[str] = ''
    exercise_name: Optional[str] = ''
    input_weight: Optional[float] = 0
    weight: Optional[float] = 0
    reps: Optional[int] = 0
    rest: Optional[float] = 0
    order: Optional[int] = 0
    set_group_id: Optional[str] = ''
    session_id: Optional[str] = ''
    note: Optional[str] = ''
    set_type: Optional[str] = None
    rpe: Optional[float] = None
    rir: Optional[int] = None
    is_low_confidence: Optional[bool] = None
    updated_at: Optional[str] = None  # ISO timestamp для LWW


class UpdateSetRequest(BaseModel):
    row_number: Optional[str] = None
    id: Optional[str] = None
    exercise_id: Optional[str] = None
    set_group_id: Optional[str] = None
    order: Optional[int] = None
    weight: Optional[float] = 0
    reps: Optional[int] = 0
    rest: Optional[float] = 0
    updated_at: Optional[str] = None  # ISO timestamp для LWW


class DeleteSetRequest(BaseModel):
    row_number: Optional[str] = None
    id: Optional[str] = None


class CreateExerciseRequest(BaseModel):
    name: str = Field(min_length=1)
    group: str = Field(min_length=1)
    equipment_type: Optional[str] = None
    exercise_type: Optional[str] = None


class UpdateExerciseRequest(BaseModel):
    id: str = Field(min_length=1)
    updates: Optional[dict[str, Any]] = None

    class Config:
        extra = 'allow'


class ConfirmBaselineRequest(BaseModel):
    proposalId: str = Field(min_length=1)
    action: str = Field(pattern='^(CONFIRM|SNOOZE|DECLINE)$')


class StartSessionRequest(BaseModel):
    body_weight: Optional[float] = 0


class FinishSessionRequest(BaseModel):
    session_id: str = Field(min_length=1)
    srpe: Optional[float] = 0
    body_weight: Optional[float] = 0
