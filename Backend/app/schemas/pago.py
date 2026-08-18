"""Schemas de pagos (§9)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.dominio import EstadoPago
from app.schemas.comunes import ORMModel


class PagoCreate(BaseModel):
    """Entrada de `POST /v1/pagos` (rol cooperativa)."""

    lote_id: uuid.UUID
    comprador_id: uuid.UUID
    monto_total: float = Field(gt=0)


class PagoRead(ORMModel):
    id: uuid.UUID
    lote_id: uuid.UUID
    cooperativa_id: uuid.UUID
    comprador_id: uuid.UUID
    monto_total: float
    comision_pct: float
    monto_productor: float
    estado_pago: EstadoPago
    tx_hash: str | None = None
    creado_en: datetime
