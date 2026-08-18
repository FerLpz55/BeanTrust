"""Directorio público de cooperativas (§10). Rol admin."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import RepoUsuarioDep, require_rol
from app.models.dominio import Rol
from app.schemas.auth import CooperativaRead

router = APIRouter(
    prefix="/cooperativas",
    tags=["cooperativas"],
    dependencies=[Depends(require_rol(Rol.ADMIN))],
)


@router.get("")
def listar_cooperativas(repo: RepoUsuarioDep) -> list[CooperativaRead]:
    return repo.listar_cooperativas()
