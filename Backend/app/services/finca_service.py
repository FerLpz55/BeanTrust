"""Servicio de fincas (§6, capa 2).

Lectura del directorio de fincas del usuario autenticado y alta inicial de la
finca del productor (onboarding). El `finca_id` es obligatorio al registrar una
cosecha (`POST /v1/lotes`), así que el móvil necesita descubrir las fincas a las
que tiene acceso antes del alta.

El aislamiento por tenant replica la matriz RLS de `docs/ARCHITECTURE.md` §10:
el productor ve sus fincas, la cooperativa las de sus productores, el
comprador ninguna (solo verifica por QR público) y el admin todas.

El alta es **fail-closed**: solo un productor puede crear su finca, el
`productor_id` sale del usuario autenticado y la `cooperativa_id` del servidor
(`BEAN_PILOT_COOPERATIVA_ID`), nunca del cuerpo de la petición. El `id` lo
genera el móvil y funciona como clave de idempotencia.
"""

from __future__ import annotations

import uuid

from app.models.dominio import Finca, FincaDuplicada, NoAutorizado, RepoError, Rol
from app.schemas.auth import CurrentUser, FincaCreate


class FincaService:
    def __init__(
        self, repo_finca, pilot_cooperativa_id: uuid.UUID | None = None
    ) -> None:
        self._repo_finca = repo_finca
        self._pilot_cooperativa_id = pilot_cooperativa_id

    def listar(self, usuario: CurrentUser) -> list[Finca]:
        """Fincas visibles para el usuario (fail-closed: rol desconocido → 403)."""
        if usuario.rol is Rol.ADMIN:
            return self._repo_finca.listar_todas()
        if usuario.rol is Rol.PRODUCTOR:
            return self._repo_finca.listar_por_productor(usuario.id)
        if usuario.rol is Rol.COOPERATIVA:
            return self._repo_finca.listar_por_cooperativa(usuario.id)
        raise NoAutorizado("Los compradores no tienen fincas asociadas.")

    def crear(self, datos: FincaCreate, usuario: CurrentUser) -> Finca:
        """Alta inicial de la finca del productor (idempotente por `id`)."""
        if usuario.rol is not Rol.PRODUCTOR:
            raise NoAutorizado("Solo un productor puede registrar su finca.")
        if self._pilot_cooperativa_id is None:
            raise RepoError("La cooperativa del piloto no está configurada.")

        existente = self._repo_finca.buscar_por_id(datos.id)
        if existente is not None:
            return self._replay(existente, datos, usuario)

        finca = Finca(
            id=datos.id,
            productor_id=usuario.id,
            cooperativa_id=self._pilot_cooperativa_id,
            nombre=datos.nombre,
            municipio=datos.municipio,
            organica=False,
            altitud_min=datos.altitud_min,
            altitud_max=datos.altitud_max,
        )
        try:
            return self._repo_finca.guardar(finca)
        except FincaDuplicada:
            # Carrera entre dos solicitudes simultáneas: la otra ganó; se
            # resuelve como reintento idéntico en vez de fallar.
            existente = self._repo_finca.buscar_por_id(datos.id)
            if existente is None:
                raise
            return self._replay(existente, datos, usuario)

    def _replay(self, existente: Finca, datos: FincaCreate, usuario: CurrentUser) -> Finca:
        """Repetición con el mismo `id`: idéntica devuelve la finca; distinta, 409."""
        if existente.productor_id != usuario.id:
            raise NoAutorizado("Esa finca ya existe y pertenece a otro productor.")
        if (
            existente.nombre != datos.nombre
            or existente.municipio != datos.municipio
            or existente.altitud_min != datos.altitud_min
            or existente.altitud_max != datos.altitud_max
        ):
            raise FincaDuplicada("El identificador de finca ya existe con otros datos.")
        return existente
