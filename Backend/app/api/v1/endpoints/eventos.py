"""Endpoints de eventos de lote (idempotentes por `Idempotency-Key`, §6)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends

from app.dependencies import CurrentUserDep, IdempotenciaDep, LoteServiceDep, require_rol
from app.models.dominio import Rol
from app.schemas.lote import EventoCreate, LoteRead

router = APIRouter(
    prefix="/lotes/{lote_id}/eventos",
    tags=["lotes"],
    dependencies=[Depends(require_rol(Rol.PRODUCTOR, Rol.COOPERATIVA, Rol.ADMIN))],
)


@router.post("", status_code=201)
def registrar_evento(
    lote_id: uuid.UUID,
    body: EventoCreate,
    idempotencia: IdempotenciaDep,
    usuario: CurrentUserDep,
    servicio: LoteServiceDep,
) -> LoteRead:
    return servicio.avanzar_estado(usuario, lote_id, body, idempotencia)
