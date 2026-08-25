"""Servicio de fincas (§6, capa 2).

Lectura del directorio de fincas del usuario autenticado. El `finca_id` es
obligatorio al registrar una cosecha (`POST /v1/lotes`), así que el móvil
necesita descubrir las fincas a las que tiene acceso antes del alta.

El aislamiento por tenant replica la matriz RLS de `docs/ARCHITECTURE.md` §10:
el productor ve sus fincas, la cooperativa las de sus productores, el
comprador ninguna (solo verifica por QR público) y el admin todas.
"""

from __future__ import annotations

from app.models.dominio import Finca, NoAutorizado, Rol
from app.schemas.auth import CurrentUser


class FincaService:
    def __init__(self, repo_finca) -> None:
        self._repo_finca = repo_finca

    def listar(self, usuario: CurrentUser) -> list[Finca]:
        """Fincas visibles para el usuario (fail-closed: rol desconocido → 403)."""
        if usuario.rol is Rol.ADMIN:
            return self._repo_finca.listar_todas()
        if usuario.rol is Rol.PRODUCTOR:
            return self._repo_finca.listar_por_productor(usuario.id)
        if usuario.rol is Rol.COOPERATIVA:
            return self._repo_finca.listar_por_cooperativa(usuario.id)
        raise NoAutorizado("Los compradores no tienen fincas asociadas.")
