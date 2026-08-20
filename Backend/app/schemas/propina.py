"""Schemas de propinas (ADR-10)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.dominio import EstadoPropina
from app.schemas.comunes import ORMModel


class PropinaCreate(BaseModel):
    """Entrada de `POST /v1/propinas` (rol comprador)."""

    lote_id: uuid.UUID
    monto: float = Field(gt=0)
    moneda: str = "MXN"


class PropinaRead(ORMModel):
    id: uuid.UUID
    lote_id: uuid.UUID
    comprador_id: uuid.UUID
    productor_id: uuid.UUID
    monto: float
    moneda: str
    estado_propina: EstadoPropina
    clave_idempotencia: str | None = None
    tx_hash: str | None = None
    creado_en: datetime
    actualizado_en: datetime


class PropinaListRead(ORMModel):
    """Para listar propinas de un lote o productor."""

    id: uuid.UUID
    lote_id: uuid.UUID
    monto: float
    moneda: str
    estado_propina: EstadoPropina
    creado_en: datetime