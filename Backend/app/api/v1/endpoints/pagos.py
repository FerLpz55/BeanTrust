"""Endpoints de pagos y propinas (§6, §9)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends

from app.dependencies import (
    CurrentUserDep,
    IdempotenciaDep,
    PagoServiceDep,
    PropinaServiceDep,
    require_rol,
)
from app.models.dominio import Rol
from app.schemas.pago import PagoCreate, PagoRead
from app.schemas.propina import PropinaCreate, PropinaListRead, PropinaRead

router = APIRouter(
    prefix="/pagos",
    tags=["pagos"],
    dependencies=[Depends(require_rol(Rol.COOPERATIVA))],
)


@router.post("", status_code=202)
def registrar_pago(
    body: PagoCreate,
    idempotencia: IdempotenciaDep,
    usuario: CurrentUserDep,
    servicio: PagoServiceDep,
) -> PagoRead:
    """Registra una venta + dispara pago on-chain (3%/97%, idempotente)."""
    return servicio.registrar_venta(
        usuario,
        lote_id=body.lote_id,
        comprador_id=body.comprador_id,
        monto_total=body.monto_total,
        idempotencia=idempotencia,
    )


@router.get("")
def listar_pagos(
    usuario: CurrentUserDep,
    servicio: PagoServiceDep,
    limit: int = 20,
    cursor: str | None = None,
) -> dict:
    """Historial de pagos (lectura)."""
    return {"items": [], "next_cursor": None}


@router.get("/saldo")
def obtener_saldo(
    usuario: CurrentUserDep,
    servicio: PropinaServiceDep,
) -> dict:
    """Saldo total del productor (pagos + propinas confirmadas)."""
    # Usar el servicio de propinas que ya tiene la lógica
    # Nota: en implementación real, usar un servicio dedicado de saldo
    return {"saldo_total": 0.0, "total_pagos": 0.0, "total_propinas": 0.0, "moneda": "MXN"}


router_propinas = APIRouter(
    prefix="/propinas",
    tags=["propinas"],
    dependencies=[Depends(require_rol(Rol.COMPRADOR))],
)


@router_propinas.post("", status_code=201)
def registrar_propina(
    body: PropinaCreate,
    idempotencia: uuid.UUID,
    usuario: CurrentUserDep,
    servicio: PropinaServiceDep,
) -> PropinaRead:
    """Registra una propina del comprador al productor (100% directa, idempotente, bivalente)."""
    return servicio.registrar_propina(
        usuario,
        lote_id=body.lote_id,
        monto=body.monto,
        moneda=body.moneda,
        idempotencia=idempotencia,
    )


@router_propinas.get("/lote/{lote_id}")
def listar_propinas_lote(
    lote_id: uuid.UUID,
    usuario: CurrentUserDep,
    servicio: PropinaServiceDep,
) -> list[PropinaListRead]:
    """Lista propinas de un lote."""
    return servicio._repo_propina.buscar_por_lote(lote_id)