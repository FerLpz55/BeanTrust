"""Acceso a evidencia fotográfica privada: metadata (Postgres) y binario (Storage).

Dos fronteras independientes, para que el servicio orqueste ambas:

- `RepositorioEvidencia`: la fila de `public.evidencias` (migración 006). Solo la
  administra el backend con `service_role`; no tiene grants a `anon`/`authenticated`.
- `AlmacenEvidencia`: el objeto en el bucket privado. El backend es el único que
  sube, firma lectura y elimina; el móvil nunca habla con Storage (ADR-14).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Protocol, runtime_checkable

from storage3.exceptions import StorageException

from app.models.dominio import Evidencia, RepoError


@runtime_checkable
class RepositorioEvidencia(Protocol):
    def crear(self, evidencia: Evidencia) -> Evidencia: ...

    def buscar_por_id(self, evidencia_id: uuid.UUID) -> Evidencia | None: ...

    def buscar_adjunta_por_lote(self, lote_id: uuid.UUID) -> Evidencia | None: ...

    def marcar_adjunta(self, evidencia_id: uuid.UUID, cuando: datetime) -> None: ...


@runtime_checkable
class AlmacenEvidencia(Protocol):
    def subir(self, storage_key: str, datos: bytes, content_type: str) -> None: ...

    def url_firmada(self, storage_key: str, expira_s: int) -> str: ...

    def eliminar(self, storage_key: str) -> None: ...


class InMemoryAlmacenEvidencia:
    """Bucket en memoria para desarrollo/CI.

    `url_firmada` es determinista (misma clave → misma URL) para que los tests
    puedan afirmar el contrato sin depender del reloj.
    """

    def __init__(self, bucket: str = "evidencias-lotes") -> None:
        self._bucket = bucket
        self._objetos: dict[str, tuple[bytes, str]] = {}

    def subir(self, storage_key: str, datos: bytes, content_type: str) -> None:
        self._objetos[storage_key] = (datos, content_type)

    def url_firmada(self, storage_key: str, expira_s: int) -> str:
        return f"https://storage.local/{self._bucket}/{storage_key}?exp={expira_s}"

    def eliminar(self, storage_key: str) -> None:
        self._objetos.pop(storage_key, None)

    # Ayudas para tests (no forman parte del protocolo).
    def contenido(self, storage_key: str) -> bytes | None:
        objeto = self._objetos.get(storage_key)
        return objeto[0] if objeto else None


class SupabaseAlmacenEvidencia:
    """Bucket privado de Supabase Storage, operado con `service_role`."""

    def __init__(self, cliente, bucket: str) -> None:
        self._cliente = cliente
        self._bucket = bucket

    def subir(self, storage_key: str, datos: bytes, content_type: str) -> None:
        try:
            self._cliente.storage.from_(self._bucket).upload(
                storage_key,
                datos,
                {"content-type": content_type, "upsert": "true"},
            )
        except StorageException as exc:
            raise RepoError("No se pudo subir la evidencia.") from exc

    def url_firmada(self, storage_key: str, expira_s: int) -> str:
        try:
            respuesta = self._cliente.storage.from_(self._bucket).create_signed_url(
                storage_key, expira_s
            )
        except StorageException as exc:
            raise RepoError("No se pudo firmar la evidencia.") from exc
        # El SDK devuelve el dict con `signedURL` (y `signedUrl` según versión).
        url = respuesta.get("signedURL") or respuesta.get("signedUrl")
        if not url:
            raise RepoError("Storage no devolvió una URL firmada.")
        return url

    def eliminar(self, storage_key: str) -> None:
        try:
            self._cliente.storage.from_(self._bucket).remove([storage_key])
        except StorageException as exc:
            raise RepoError("No se pudo eliminar la evidencia.") from exc
