"""Subida de evidencia fotográfica privada (ADR-14, §6).

`multipart/form-data` con `finca_id` y `lote_id` como campos y el binario en
`archivo`. El `Idempotency-Key` es el `id` de la fila: reintentar no duplica ni
la fila ni el objeto en Storage.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.dependencies import (
    CurrentUserDep,
    EvidenciaServiceDep,
    IdempotenciaDep,
    bloquear_escrituras_mantenimiento,
    require_rol,
)
from app.models.dominio import Rol
from app.schemas.evidencia import EvidenciaRead

router = APIRouter(
    prefix="/evidencias",
    tags=["evidencias"],
    dependencies=[
        Depends(require_rol(Rol.PRODUCTOR, Rol.COOPERATIVA, Rol.ADMIN)),
        Depends(bloquear_escrituras_mantenimiento),
    ],
)


@router.post("", status_code=201)
def subir_evidencia(
    finca_id: Annotated[uuid.UUID, Form()],
    lote_id: Annotated[uuid.UUID, Form()],
    archivo: Annotated[UploadFile, File()],
    idempotencia: IdempotenciaDep,
    usuario: CurrentUserDep,
    servicio: EvidenciaServiceDep,
) -> EvidenciaRead:
    evidencia = servicio.subir(finca_id, lote_id, idempotencia, archivo, usuario)
    return EvidenciaRead(
        id=evidencia.id,
        lote_id=evidencia.lote_id,
        finca_id=evidencia.finca_id,
        evidencia_url=evidencia.storage_key,
        evidencia_sha256=evidencia.sha256,
        content_type=evidencia.content_type,
        size_bytes=evidencia.size_bytes,
        estado=evidencia.estado.value,
    )
