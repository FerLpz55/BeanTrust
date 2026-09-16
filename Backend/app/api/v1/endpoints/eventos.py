"""Endpoints de eventos de lote (idempotentes por `Idempotency-Key`, §6)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends

from app.dependencies import (
    CurrentUserDep,
    IdempotenciaDep,
    LoteServiceDep,
    bloquear_escrituras_mantenimiento,
    require_rol,
)
from app.models.dominio import Rol
from app.schemas.lote import EventoCreate, LoteDetalleRead

router = APIRouter(
    prefix="/lotes/{lote_id}/eventos",
    tags=["lotes"],
    dependencies=[
        Depends(require_rol(Rol.PRODUCTOR, Rol.COOPERATIVA, Rol.ADMIN)),
        Depends(bloquear_escrituras_mantenimiento),
    ],
)


@router.post("", status_code=201)
def registrar_evento(
    lote_id: uuid.UUID,
    body: EventoCreate,
    idempotencia: IdempotenciaDep,
    usuario: CurrentUserDep,
    servicio: LoteServiceDep,
) -> LoteDetalleRead:
    return servicio.avanzar_estado(usuario, lote_id, body, idempotencia)
