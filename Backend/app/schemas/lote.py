"""Schemas de lotes, eventos y certificado (§6)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.dominio import Estado, TipoEvento
from app.schemas.comunes import ORMModel


class LoteCreate(BaseModel):
    """Entrada de `POST /v1/lotes` y operación de cosecha del sync.

    `id` es opcional: si lo envía el móvil (generado offline), se respeta;
    si no, el backend lo genera. Así se evitan colisiones offline (§7.5).
    """

    id: uuid.UUID | None = None
    finca_id: uuid.UUID
    fecha_cosecha: date
    peso_kg: float = Field(gt=0)


class EventoCreate(BaseModel):
    """Entrada de `POST /v1/lotes/{id}/eventos` y del sync."""

    tipo: TipoEvento
    peso_kg: float | None = Field(default=None, gt=0)
    merma_pct: float | None = Field(default=None, ge=0, le=100)
    comprador_id: uuid.UUID | None = None


class LoteEventoRead(ORMModel):
    id: uuid.UUID
    lote_id: uuid.UUID
    tipo: TipoEvento
    de_estado: Estado | None
    a_estado: Estado
    actor_id: uuid.UUID
    peso_kg: float | None = None
    merma_pct: float | None = None
    comprador_id: uuid.UUID | None = None
    registrado_en: datetime


class LoteEventoPublico(ORMModel):
    """Evento sin datos internos: para la verificación pública del QR (§8)."""

    id: uuid.UUID
    lote_id: uuid.UUID
    tipo: TipoEvento
    de_estado: Estado | None
    a_estado: Estado
    peso_kg: float | None = None
    merma_pct: float | None = None
    registrado_en: datetime


class CertificadoRead(ORMModel):
    codigo: str
    hash_sha256: str
    emitido_en: datetime


class LoteRead(ORMModel):
    id: uuid.UUID
    finca_id: uuid.UUID
    codigo_publico: str
    estado: Estado
    peso_actual_kg: float
    fecha_cosecha: date
    creado_en: datetime
    actualizado_en: datetime
    certificado: CertificadoRead | None = None


class LoteDetalleRead(LoteRead):
    historial: list[LoteEventoRead] = Field(default_factory=list)
