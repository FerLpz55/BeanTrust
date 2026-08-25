"""Endpoints de pagos y propinas (§6, §9)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query

from app.dependencies import (
    CurrentUserDep,
    IdempotenciaDep,
    PagoServiceDep,
    PropinaServiceDep,
    require_rol,
)
from app.models.dominio import Rol
from app.schemas.comunes import Pagina
from app.schemas.pago import PagoCreate, PagoRead, SaldoRead
from app.schemas.propina import PropinaCreate, PropinaListRead, PropinaRead
from app.utils.cursor import codificar_cursor, decodificar_cursor

# Sin `require_rol` a nivel de router: la matriz §10 asigna un rol distinto a
# cada operación (la cooperativa escribe y lee sus pagos; el saldo es del
# productor). Un rol global aquí hacía inalcanzable `GET /pagos/saldo`.
router = APIRouter(prefix="/pagos", tags=["pagos"])


@router.post(
    "",
    status_code=202,
    dependencies=[Depends(require_rol(Rol.COOPERATIVA))],
)
def registrar_pago(
    body: PagoCreate,
    idempotencia: IdempotenciaDep,
    usuario: CurrentUserDep,
    servicio: PagoServiceDep,
    tareas: BackgroundTasks,
) -> PagoRead:
    """Registra una venta + dispara pago on-chain (3%/97%, idempotente).

    Responde 202 con el pago en `PENDIENTE`; la confirmación corre después
    en segundo plano simulando el poller de Polygon (web3 en pausa, B7).
    """
    pago = servicio.registrar_venta(
        usuario,
        lote_id=body.lote_id,
        comprador_id=body.comprador_id,
        monto_total=body.monto_total,
        idempotencia=idempotencia,
    )
    tareas.add_task(servicio.confirmar_venta, pago.lote_id)
    return pago


@router.get("", dependencies=[Depends(require_rol(Rol.COOPERATIVA))])
def listar_pagos(
    usuario: CurrentUserDep,
    servicio: PagoServiceDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
) -> Pagina[PagoRead]:
    """Historial de pagos de la cooperativa (paginado por cursor)."""
    c = decodificar_cursor(cursor) if cursor else None
    pagos, siguiente = servicio.listar(usuario, c, limit)
    next_cursor = codificar_cursor(siguiente.id, siguiente.ts) if siguiente else None
    return Pagina(items=pagos, next_cursor=next_cursor)


@router.get(
    "/saldo",
    dependencies=[Depends(require_rol(Rol.PRODUCTOR, Rol.ADMIN))],
)
def obtener_saldo(
    usuario: CurrentUserDep,
    servicio: PropinaServiceDep,
) -> SaldoRead:
    """Saldo del productor: 97% de ventas confirmadas + propinas confirmadas."""
    return SaldoRead(**servicio.obtener_saldo_productor(usuario))


router_propinas = APIRouter(
    prefix="/propinas",
    tags=["propinas"],
)


@router_propinas.post("", status_code=201, dependencies=[Depends(require_rol(Rol.COMPRADOR))])
def registrar_propina(
    body: PropinaCreate,
    idempotencia: IdempotenciaDep,
    usuario: CurrentUserDep,
    servicio: PropinaServiceDep,
    tareas: BackgroundTasks,
) -> PropinaRead:
    """Registra una propina del comprador al productor (100% directa, idempotente).

    Responde 201 con la propina en `REGISTRADA`; la confirmación corre después
    en segundo plano simulando el poller (bivalente off-chain/on-chain, ADR-10).
    """
    propina = servicio.registrar_propina(
        usuario,
        lote_id=body.lote_id,
        monto=body.monto,
        moneda=body.moneda,
        idempotencia=idempotencia,
    )
    tareas.add_task(servicio.confirmar_propina, propina.lote_id)
    return propina


@router_propinas.get("/lote/{lote_id}")
def listar_propinas_lote(
    lote_id: uuid.UUID,
    usuario: CurrentUserDep,
    servicio: PropinaServiceDep,
) -> list[PropinaListRead]:
    """Lista propinas de un lote (lectura por tenant, ADR-10)."""
    return servicio.listar_propinas_lote(usuario, lote_id)
