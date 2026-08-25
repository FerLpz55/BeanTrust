"""Schemas de pagos (§9)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.dominio import EstadoPago
from app.schemas.comunes import ORMModel
from app.schemas.propina import PropinaListRead


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


class SaldoRead(BaseModel):
    """Saldo del productor (§9): ventas confirmadas al 97% + propinas al 100%."""

    saldo_total: float
    total_pagos: float
    total_propinas: float
    moneda: str


class MercadoLoteRead(ORMModel):
    """Panel Comercio Justo de un lote (proyección read-only, ADR-9)."""

    lote_id: uuid.UUID
    codigo_publico: str
    variedad: str | None = None
    metodo_beneficiado: str | None = None
    peso_actual_kg: float
    monto_total: float
    comision_pct: float
    monto_productor: float
    monto_plataforma: float
    estado_pago: EstadoPago
    total_propinas: float
    propinas: list[PropinaListRead]
    productor_nombre: str | None = None
    finca_nombre: str | None = None
    finca_municipio: str | None = None
