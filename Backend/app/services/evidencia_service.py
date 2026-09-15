"""Caso de uso de evidencia fotográfica privada (ADR-14, §6).

El backend es el único que habla con Storage: valida tipo, tamaño y firma real
del binario, calcula su SHA-256, lo sube a un bucket privado y guarda la
metadata. El móvil solo recibe el `storage_key` para referenciarlo al crear el
lote; nunca ve credenciales de Storage ni Postgres.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta

from fastapi import UploadFile

from app.models.dominio import (
    ArchivoInvalido,
    EstadoEvidencia,
    Evidencia,
    EvidenciaNoEncontrada,
    EvidenciaYaAdjunta,
    NoAutorizado,
    ahora_utc,
)
from app.schemas.auth import CurrentUser
from app.schemas.evidencia import EvidenciaSubida
from app.services.autorizacion import autorizar_finca

TIPOS_PERMITIDOS = ("image/jpeg", "image/png", "image/webp")
# Las URLs firmadas son de vida corta: el móvil las pide al abrir la foto y no
# las cachea. La expiración de PENDIENTES huérfanas la barre el cron (006).
TTL_FIRMA_S = 600


def _firma_valida(contenido: bytes, content_type: str) -> bool:
    """Comprueba los *magic bytes* reales contra el MIME declarado.

    El `Content-Type` de un multipart lo elige el cliente y es trivialmente
    falsificable; sin esto se podría subir cualquier binario con solo mentir en
    la cabecera.
    """
    if content_type == "image/jpeg":
        return contenido.startswith(b"\xff\xd8\xff")
    if content_type == "image/png":
        return contenido.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/webp":
        # WebP = "RIFF" + tamaño (4 bytes) + "WEBP".
        return (
            len(contenido) >= 12
            and contenido[:4] == b"RIFF"
            and contenido[8:12] == b"WEBP"
        )
    return False


class EvidenciaService:
    def __init__(
        self,
        repo_evidencia,
        almacen,
        repo_finca,
        bucket: str,
        max_bytes: int,
        ttl_hours: int,
    ) -> None:
        self._repo_evidencia = repo_evidencia
        self._almacen = almacen
        self._repo_finca = repo_finca
        self._bucket = bucket
        self._max_bytes = max_bytes
        self._ttl_hours = ttl_hours

    # ------------------------------------------------------------------ subida

    def subir(
        self,
        finca_id: uuid.UUID,
        lote_id: uuid.UUID,
        idempotency_key: uuid.UUID,
        archivo: UploadFile,
        usuario: CurrentUser,
    ) -> Evidencia:
        """Valida, sube a Storage y crea la fila PENDIENTE. Idempotente por clave.

        El endpoint es `def` (síncrono), así que corre en el threadpool de
        Starlette y la lectura bloqueante del `SpooledTemporaryFile` no toca el
        event loop (ADR-13).
        """
        autorizar_finca(self._repo_finca, usuario, finca_id)

        existente = self._repo_evidencia.buscar_por_id(idempotency_key)
        if existente is not None:
            # Un replay con la misma clave solo puede devolver su propia
            # evidencia: nunca la de otro usuario/finca/lote.
            if (
                existente.uploader_id != usuario.id
                or existente.finca_id != finca_id
                or existente.lote_id != lote_id
            ):
                raise NoAutorizado("La evidencia no pertenece a este usuario.")
            return existente

        content_type = (archivo.content_type or "").lower()
        if content_type not in TIPOS_PERMITIDOS:
            raise ArchivoInvalido("Solo se admiten imágenes JPEG, PNG o WebP.")

        # Leer uno de más permite distinguir "justo el máximo" de "se pasó" sin
        # cargar un archivo arbitrariamente grande en memoria.
        contenido = archivo.file.read(self._max_bytes + 1)
        if len(contenido) > self._max_bytes:
            raise ArchivoInvalido("La imagen supera el tamaño máximo permitido.")
        if not _firma_valida(contenido, content_type):
            raise ArchivoInvalido("El contenido no coincide con el tipo declarado.")

        datos = EvidenciaSubida(
            finca_id=finca_id,
            lote_id=lote_id,
            idempotency_key=idempotency_key,
            contenido=contenido,
            content_type=content_type,
            usuario=usuario,
        )
        return self._persistir(datos)

    def _persistir(self, datos: EvidenciaSubida) -> Evidencia:
        sha256 = hashlib.sha256(datos.contenido).hexdigest()
        storage_key = f"{datos.usuario.id}/{datos.lote_id}/{datos.idempotency_key}.jpg"
        evidencia = Evidencia(
            id=datos.idempotency_key,
            lote_id=datos.lote_id,
            finca_id=datos.finca_id,
            uploader_id=datos.usuario.id,
            storage_key=storage_key,
            sha256=sha256,
            content_type=datos.content_type,
            size_bytes=len(datos.contenido),
        )
        self._almacen.subir(storage_key, datos.contenido, datos.content_type)
        return self._repo_evidencia.crear(evidencia)

    # ------------------------------------------------------------------ lectura

    def url_de_lote(self, lote_id: uuid.UUID) -> tuple[str, datetime, str]:
        """URL firmada temporal de la evidencia ADJUNTA del lote (404 si no hay)."""
        evidencia = self._repo_evidencia.buscar_adjunta_por_lote(lote_id)
        if evidencia is None:
            raise EvidenciaNoEncontrada("El lote no tiene evidencia adjunta.")
        url = self._almacen.url_firmada(evidencia.storage_key, TTL_FIRMA_S)
        expira_en = ahora_utc() + timedelta(seconds=TTL_FIRMA_S)
        return url, expira_en, evidencia.sha256

    # ------------------------------------------------------------------ cierre

    def finalizar(
        self, evidencia_id: uuid.UUID, lote_id: uuid.UUID, usuario: CurrentUser
    ) -> Evidencia | None:
        """Marca ADJUNTA una evidencia PENDIENTE del propio usuario y lote.

        `LoteService` valida y marca directamente en su transacción (evita otra
        lectura); este método queda como la puerta de servicio reutilizable para
        cualquier otro orquestador que adjunte evidencia.
        """
        evidencia = self._repo_evidencia.buscar_por_id(evidencia_id)
        if evidencia is None:
            raise EvidenciaNoEncontrada("La evidencia no existe.")
        if evidencia.uploader_id != usuario.id or evidencia.lote_id != lote_id:
            raise NoAutorizado("La evidencia no corresponde a este lote.")
        if evidencia.estado is not EstadoEvidencia.PENDIENTE:
            raise EvidenciaYaAdjunta("La evidencia ya está adjunta a un lote.")
        cuando = ahora_utc()
        self._repo_evidencia.marcar_adjunta(evidencia.id, cuando)
        evidencia.estado = EstadoEvidencia.ADJUNTA
        evidencia.adjuntada_en = cuando
        return evidencia
