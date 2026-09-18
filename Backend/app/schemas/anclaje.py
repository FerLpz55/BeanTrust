"""Schemas del anclaje on-chain del Pasaporte (ADR-11)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.models.dominio import EstadoAncla
from app.schemas.comunes import ORMModel


class AnclajeOnchainRead(ORMModel):
    """Bloque `anclaje_onchain` del Pasaporte público (§8, ADR-11).

    `None` cuando el anclaje está desactivado, no hay fila o la lectura de la
    cola falla. Nunca expone nonce, errores, lock ni contador de intentos.
    """

    estado: EstadoAncla
    chain_id: int
    red_nombre: str
    contrato: str | None = None
    tx_hash: str | None = None
    bloque: int | None = None
    hash_raiz: str | None = None
    explorer_url: str | None = None
    explorer_etiqueta: str
    confirmada_en: datetime | None = None


class ReconciliarRead(BaseModel):
    """Resumen del pase del worker (endpoint operativo de Vercel Cron)."""

    habilitado: bool
    worker_adquirido: bool
    procesadas: int
    enviadas: int
    confirmadas: int
    reconciliadas: int
    reprogramadas: int
    fallidas: int
