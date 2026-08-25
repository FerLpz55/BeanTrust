"""Directorio de fincas del usuario autenticado (§6, §10).

El móvil lo consume para resolver el `finca_id` obligatorio de
`POST /v1/lotes`. El aislamiento por tenant vive en `FincaService`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import CurrentUserDep, FincaServiceDep, require_rol
from app.models.dominio import Rol
from app.schemas.auth import FincaRead

router = APIRouter(
    prefix="/fincas",
    tags=["fincas"],
    dependencies=[Depends(require_rol(Rol.PRODUCTOR, Rol.COOPERATIVA, Rol.ADMIN))],
)


@router.get("")
def listar_fincas(usuario: CurrentUserDep, servicio: FincaServiceDep) -> list[FincaRead]:
    """Fincas del usuario (productor: propias; cooperativa: de sus productores)."""
    return servicio.listar(usuario)
