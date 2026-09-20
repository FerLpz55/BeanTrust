"""Directorio de fincas del usuario autenticado y alta inicial (§6, §10).

El móvil consume `GET` para resolver el `finca_id` obligatorio de
`POST /v1/lotes` y `POST` para configurar la primera finca del productor nuevo.
El aislamiento por tenant y las reglas del alta viven en `FincaService`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import (
    CurrentUserDep,
    FincaServiceDep,
    bloquear_escrituras_mantenimiento,
    require_rol,
)
from app.models.dominio import Rol
from app.schemas.auth import FincaCreate, FincaRead

router = APIRouter(
    prefix="/fincas",
    tags=["fincas"],
    dependencies=[Depends(require_rol(Rol.PRODUCTOR, Rol.COOPERATIVA, Rol.ADMIN))],
)


@router.get("")
def listar_fincas(usuario: CurrentUserDep, servicio: FincaServiceDep) -> list[FincaRead]:
    """Fincas del usuario (productor: propias; cooperativa: de sus productores)."""
    return servicio.listar(usuario)


@router.post(
    "",
    status_code=201,
    dependencies=[
        Depends(require_rol(Rol.PRODUCTOR)),
        Depends(bloquear_escrituras_mantenimiento),
    ],
)
def crear_finca(
    body: FincaCreate, usuario: CurrentUserDep, servicio: FincaServiceDep
) -> FincaRead:
    """Alta inicial de la finca del productor (onboarding, idempotente por `id`)."""
    return servicio.crear(body, usuario)
