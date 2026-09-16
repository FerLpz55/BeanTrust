"""Endpoints de lotes (§6). Autenticados; roles productor/cooperativa/admin."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.dependencies import (
    CurrentUserDep,
    EvidenciaServiceDep,
    LoteServiceDep,
    bloquear_escrituras_mantenimiento,
    require_rol,
)
from app.models.dominio import Rol
from app.schemas.comunes import Pagina
from app.schemas.evidencia import EvidenciaUrlRead
from app.schemas.lote import LoteCreate, LoteDetalleRead, LoteRead
from app.utils.cursor import codificar_cursor, decodificar_cursor

router = APIRouter(
    prefix="/lotes",
    tags=["lotes"],
    dependencies=[Depends(require_rol(Rol.PRODUCTOR, Rol.COOPERATIVA, Rol.ADMIN))],
)


@router.post(
    "",
    status_code=201,
    dependencies=[Depends(bloquear_escrituras_mantenimiento)],
)
def crear_lote(body: LoteCreate, usuario: CurrentUserDep, servicio: LoteServiceDep) -> LoteRead:
    return servicio.registrar_cosecha(body, usuario)


@router.get("")
def listar_lotes(
    usuario: CurrentUserDep,
    servicio: LoteServiceDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
) -> Pagina[LoteRead]:
    c = decodificar_cursor(cursor) if cursor else None
    lotes, siguiente = servicio.listar(usuario, c, limit)
    next_cursor = codificar_cursor(siguiente.id, siguiente.ts) if siguiente else None
    return Pagina(items=lotes, next_cursor=next_cursor)


@router.get("/{lote_id}")
def obtener_lote(
    lote_id: uuid.UUID, usuario: CurrentUserDep, servicio: LoteServiceDep
) -> LoteDetalleRead:
    return servicio.obtener(usuario, lote_id)


@router.get("/{lote_id}/evidencia")
def obtener_evidencia(
    lote_id: uuid.UUID,
    usuario: CurrentUserDep,
    lotes: LoteServiceDep,
    evidencias: EvidenciaServiceDep,
) -> EvidenciaUrlRead:
    """URL firmada temporal de la foto del lote. Autoriza el tenant primero."""
    lotes.obtener(usuario, lote_id)
    url, expira_en, sha256 = evidencias.url_de_lote(lote_id)
    return EvidenciaUrlRead(url=url, expira_en=expira_en, evidencia_sha256=sha256)
