"""Schemas del endpoint de sincronización offline (§7.5)."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.schemas.comunes import ORMModel
from app.schemas.lote import EventoCreate


class SyncRegistroCosechaOp(BaseModel):
    """Operación tipada: registrar una cosecha nueva (crea el lote).

    Equivale a `LoteCreate`: una cosecha encolada offline debe conservar la
    misma información (variedad, método y evidencia) que una creada online. La
    evidencia viaja como `evidencia_id` (subida antes por `POST /v1/evidencias`);
    la url/sha las resuelve el backend desde la fila, no el cuerpo.
    """

    id: uuid.UUID
    tipo: Literal["registrar_cosecha"]
    finca_id: uuid.UUID
    fecha_cosecha: date
    peso_kg: float = Field(gt=0)
    variedad: str | None = None
    metodo_beneficiado: str | None = None
    evidencia_id: uuid.UUID | None = None


class SyncAvanceOp(BaseModel):
    """Operación tipada: avanzar el estado de un lote existente."""

    id: uuid.UUID
    tipo: Literal["avanzar_estado"]
    lote_id: uuid.UUID
    evento: EventoCreate


SyncOperacion = Annotated[
    SyncRegistroCosechaOp | SyncAvanceOp,
    Field(discriminator="tipo"),
]


class SyncRequest(BaseModel):
    operaciones: list[SyncOperacion]


class SyncResultado(ORMModel):
    """Resultado por operación (207 multi-status, §7.5)."""

    id: uuid.UUID
    estado: Literal["ok", "conflicto", "error"]
    detalle: str | None = None


class SyncResponse(BaseModel):
    resultados: list[SyncResultado]
