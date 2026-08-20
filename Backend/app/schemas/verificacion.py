"""Schema de respuesta pública del Pasaporte de Café (§8)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from app.models.dominio import Estado
from app.schemas.comunes import ORMModel
from app.schemas.lote import LoteEventoPublico


class VerificarRead(ORMModel):
    """Lo que ve el consumidor al escanear el QR (público, sin auth).

    Pasaporte de Café: verificación rica con variedad, método, humedad, SCA
    y timeline con hash por etapa (ADR-11).
    """

    codigo: str
    lote_id: uuid.UUID
    estado: Estado
    fecha_cosecha: date
    finca_id: uuid.UUID
    peso_actual_kg: float
    hash_sha256: str
    emitido_en: datetime
    historial: list[LoteEventoPublico]
    # Datos enriquecidos del Pasaporte de Café
    variedad: str | None = None
    metodo_beneficiado: str | None = None
    altitud_min: float | None = None
    altitud_max: float | None = None
    humedad_final_pct: float | None = None
    puntaje_sca: float | None = None
    productor_nombre: str | None = None
    finca_nombre: str | None = None
    municipio: str | None = None
    organica: bool | None = None
