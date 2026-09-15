"""Sesiones de refresh token con rotación y detección de reuso (A07).

Solo lo usa `LocalAuthProvider` (desarrollo/CI). En producción el *minting* y la
rotación los hace Supabase Auth, así que este repositorio no se activa.

Cada refresh token lleva un `jti` único y un `family` (la cadena de rotaciones).
Al usarlo se marca consumido y se emite uno nuevo de la misma familia. Si un
`jti` ya consumido vuelve a usarse (token robado), se revoca la familia entera.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol, runtime_checkable


@dataclass
class SesionRefresh:
    jti: uuid.UUID
    familia_id: uuid.UUID
    usuario_id: uuid.UUID
    expira_en: datetime
    consumida_en: datetime | None = None
    revocada_en: datetime | None = None


@runtime_checkable
class RepositorioSesionRefresh(Protocol):
    def crear(self, sesion: SesionRefresh) -> None: ...

    def buscar(self, jti: uuid.UUID) -> SesionRefresh | None: ...

    def consumir(self, jti: uuid.UUID) -> bool:
        """Marca el `jti` como consumido. `False` si no era consumible."""

    def revocar_familia(self, familia_id: uuid.UUID) -> None: ...

    def revocar_usuario(self, usuario_id: uuid.UUID) -> None: ...
