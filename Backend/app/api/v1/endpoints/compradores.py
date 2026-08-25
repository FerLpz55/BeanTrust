"""Directorio de compradores (§6). Rol cooperativa/admin.

Lo necesita la cooperativa para elegir el `comprador_id` al registrar una
venta (`POST /v1/pagos`): sin este directorio no hay forma de conocer los
UUID de los compradores existentes desde el móvil.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import RepoUsuarioDep, require_rol
from app.models.dominio import Rol
from app.schemas.auth import UsuarioRead

router = APIRouter(
    prefix="/compradores",
    tags=["compradores"],
    dependencies=[Depends(require_rol(Rol.COOPERATIVA, Rol.ADMIN))],
)


@router.get("")
def listar_compradores(repo: RepoUsuarioDep) -> list[UsuarioRead]:
    return repo.listar_compradores()
