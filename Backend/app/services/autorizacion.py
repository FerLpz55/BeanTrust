"""Reglas de autorización de tenant compartidas por los servicios (§10).

Vive aquí (y no en un servicio concreto) para que la regla de pertenencia de
finca sea **una sola**: el alta de lote (`LoteService`) y la subida de evidencia
(`EvidenciaService`) deben resolverla idénticamente. La autorización es
*fail-closed*: cualquier caso no reconocido niega el acceso.
"""

from __future__ import annotations

import uuid

from app.models.dominio import NoAutorizado, Rol
from app.schemas.auth import CurrentUser


def autorizar_finca(repo_finca, usuario: CurrentUser, finca_id: uuid.UUID) -> None:
    """Permite admin, productor dueño de la finca o cooperativa dueña; si no, 403."""
    if usuario.rol is Rol.ADMIN:
        return
    finca = repo_finca.buscar_por_id(finca_id)
    if finca is None:
        raise NoAutorizado("La finca no existe o no tiene acceso a ella.")
    if usuario.rol is Rol.PRODUCTOR and finca.productor_id == usuario.id:
        return
    if usuario.rol is Rol.COOPERATIVA and finca.cooperativa_id == usuario.id:
        return
    raise NoAutorizado("La finca no existe o no tiene acceso a ella.")
