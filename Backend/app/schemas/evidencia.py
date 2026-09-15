"""Schemas de evidencia fotográfica privada (ADR-14, §6).

El binario nunca cruza como JSON: entra por `multipart/form-data` y su metadata
sale tipada. `EvidenciaSubida` es un payload **interno** (servicio), no expuesto.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, HttpUrl

from app.schemas.auth import CurrentUser
from app.schemas.comunes import ORMModel

TipoImagen = Literal["image/jpeg", "image/png", "image/webp"]
EstadoEvidenciaLeible = Literal["PENDIENTE", "ADJUNTA"]


class EvidenciaRead(ORMModel):
    """Respuesta de `POST /v1/evidencias`.

    `evidencia_url` es el `storage_key` privado del objeto (no una URL pública ni
    una firmada): solo se lo devolvemos a su subidor, que es quien necesita
    reenviarlo luego en `POST /v1/lotes`/`/v1/sync`. La lectura se obtiene
    firmada y temporal vía `GET /v1/lotes/{lote_id}/evidencia`.
    """

    id: uuid.UUID
    lote_id: uuid.UUID
    finca_id: uuid.UUID
    evidencia_url: str
    evidencia_sha256: str
    content_type: TipoImagen
    size_bytes: int
    estado: EstadoEvidenciaLeible


class EvidenciaUrlRead(BaseModel):
    """URL firmada de corta vida para que el dueño vea la foto (ADR-14)."""

    url: HttpUrl
    expira_en: datetime
    evidencia_sha256: str


class EvidenciaSubida(BaseModel):
    """Payload interno ya validado por `EvidenciaService` (no se expone)."""

    finca_id: uuid.UUID
    lote_id: uuid.UUID
    idempotency_key: uuid.UUID
    contenido: bytes
    content_type: TipoImagen
    usuario: CurrentUser
