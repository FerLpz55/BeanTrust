"""EvidenciaService: validación del binario, idempotencia y URL firmada (ADR-14)."""

from __future__ import annotations

import hashlib
import io
import logging
import uuid
from datetime import UTC, datetime

import pytest
from starlette.datastructures import UploadFile

from app.models.dominio import (
    ArchivoInvalido,
    EstadoEvidencia,
    EvidenciaNoEncontrada,
    EvidenciaYaAdjunta,
    Finca,
    NoAutorizado,
    RepoError,
    Rol,
)
from app.repositories.evidencia import InMemoryAlmacenEvidencia
from app.repositories.in_memory import InMemoryEvidenciaRepo, InMemoryFincaRepo, Memoria
from app.schemas.auth import CurrentUser
from app.services.evidencia_service import EvidenciaService

FINCA_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
JPEG = b"\xff\xd8\xff" + b"0" * 16
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 16
WEBP = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"0" * 8


def _contexto(max_bytes: int = 1024, *, repo_factory=None, almacen=None):
    usuario = CurrentUser(id=uuid.uuid4(), rol=Rol.PRODUCTOR, email="prod@test.dev")
    memoria = Memoria()
    memoria.fincas[FINCA_ID] = Finca(
        id=FINCA_ID,
        productor_id=usuario.id,
        cooperativa_id=uuid.uuid4(),
        nombre="Finca La Esperanza",
        municipio="Coatepec",
    )
    almacen = almacen or InMemoryAlmacenEvidencia()
    repo = repo_factory(memoria) if repo_factory else InMemoryEvidenciaRepo(memoria)
    servicio = EvidenciaService(
        repo_evidencia=repo,
        almacen=almacen,
        repo_finca=InMemoryFincaRepo(memoria),
        bucket="evidencias-lotes",
        max_bytes=max_bytes,
        ttl_hours=24,
    )
    return servicio, almacen, memoria, usuario


def _upload(datos: bytes, content_type: str, nombre: str = "foto.png") -> UploadFile:
    return UploadFile(
        file=io.BytesIO(datos),
        filename=nombre,
        headers={"content-type": content_type},
    )


def test_rechaza_mime_no_permitido() -> None:
    servicio, _, _, usuario = _contexto()
    with pytest.raises(ArchivoInvalido):
        servicio.subir(
            FINCA_ID, uuid.uuid4(), uuid.uuid4(), _upload(b"GIF89a", "image/gif"), usuario
        )


def test_rechaza_firma_que_no_corresponde() -> None:
    servicio, _, _, usuario = _contexto()
    with pytest.raises(ArchivoInvalido):
        servicio.subir(
            FINCA_ID, uuid.uuid4(), uuid.uuid4(), _upload(b"no-es-png", "image/png"), usuario
        )


def test_rechaza_archivo_mas_grande_que_el_maximo() -> None:
    servicio, _, _, usuario = _contexto(max_bytes=8)
    with pytest.raises(ArchivoInvalido):
        servicio.subir(FINCA_ID, uuid.uuid4(), uuid.uuid4(), _upload(PNG, "image/png"), usuario)


@pytest.mark.parametrize(
    ("datos", "content_type"),
    [(JPEG, "image/jpeg"), (PNG, "image/png"), (WEBP, "image/webp")],
)
def test_acepta_imagenes_validas(datos: bytes, content_type: str) -> None:
    servicio, almacen, _, usuario = _contexto()
    lote_id = uuid.uuid4()
    clave = uuid.uuid4()
    evidencia = servicio.subir(
        FINCA_ID, lote_id, clave, _upload(datos, content_type), usuario
    )
    assert evidencia.id == clave
    assert evidencia.estado is EstadoEvidencia.PENDIENTE
    assert evidencia.size_bytes == len(datos)
    assert evidencia.sha256 == hashlib.sha256(datos).hexdigest()
    assert almacen.contenido(evidencia.storage_key) == datos


def test_idempotente_no_duplica_fila_ni_objeto() -> None:
    servicio, almacen, memoria, usuario = _contexto()
    lote_id = uuid.uuid4()
    clave = uuid.uuid4()
    primera = servicio.subir(FINCA_ID, lote_id, clave, _upload(PNG, "image/png"), usuario)
    segunda = servicio.subir(FINCA_ID, lote_id, clave, _upload(PNG, "image/png"), usuario)
    assert primera is segunda
    assert len(memoria.evidencias) == 1
    assert almacen.claves() == [primera.storage_key]


def test_replay_de_otra_finca_no_autorizado() -> None:
    servicio, _, memoria, usuario = _contexto()
    ajena = uuid.uuid4()
    memoria.fincas[ajena] = Finca(
        id=ajena,
        productor_id=uuid.uuid4(),
        cooperativa_id=uuid.uuid4(),
        nombre="Finca Ajena",
        municipio="Xico",
    )
    with pytest.raises(NoAutorizado):
        servicio.subir(ajena, uuid.uuid4(), uuid.uuid4(), _upload(PNG, "image/png"), usuario)


def test_url_de_lote_sin_evidencia_da_404() -> None:
    servicio, _, _, _ = _contexto()
    with pytest.raises(EvidenciaNoEncontrada):
        servicio.url_de_lote(uuid.uuid4())


def test_url_de_lote_firmada_tras_adjuntar() -> None:
    servicio, _, _, usuario = _contexto()
    lote_id = uuid.uuid4()
    evidencia = servicio.subir(
        FINCA_ID, lote_id, uuid.uuid4(), _upload(PNG, "image/png"), usuario
    )
    servicio.finalizar(evidencia.id, lote_id, usuario)
    url, expira_en, sha256 = servicio.url_de_lote(lote_id)
    assert url.startswith("https://storage.local/")
    assert expira_en > datetime.now(UTC)
    assert sha256 == evidencia.sha256


# ------------------------------------------------- idempotencia y extensión


@pytest.mark.parametrize(
    ("datos", "content_type", "extension"),
    [(JPEG, "image/jpeg", ".jpg"), (PNG, "image/png", ".png"), (WEBP, "image/webp", ".webp")],
)
def test_extension_del_storage_key_coincide_con_el_mime(
    datos: bytes, content_type: str, extension: str
) -> None:
    servicio, almacen, _, usuario = _contexto()
    evidencia = servicio.subir(
        FINCA_ID, uuid.uuid4(), uuid.uuid4(), _upload(datos, content_type), usuario
    )
    assert evidencia.storage_key.endswith(extension)
    assert almacen.contenido(evidencia.storage_key) == datos


def test_replay_con_otro_contenido_es_409_y_no_sube() -> None:
    """Misma Idempotency-Key con otra foto: no se sobrescribe ni se sube."""
    servicio, almacen, memoria, usuario = _contexto()
    lote_id = uuid.uuid4()
    clave = uuid.uuid4()
    primera = servicio.subir(FINCA_ID, lote_id, clave, _upload(PNG, "image/png"), usuario)
    with pytest.raises(EvidenciaYaAdjunta):
        servicio.subir(FINCA_ID, lote_id, clave, _upload(JPEG, "image/jpeg"), usuario)
    assert almacen.claves() == [primera.storage_key]
    assert len(memoria.evidencias) == 1


# ------------------------------------------------- compensación (rollback)


class _RepoQueFalla(InMemoryEvidenciaRepo):
    def __init__(self, memoria: Memoria, error: Exception) -> None:
        super().__init__(memoria)
        self._error = error

    def crear(self, evidencia):
        raise self._error


class _AlmacenQueNoBorra(InMemoryAlmacenEvidencia):
    def __init__(self, error: Exception) -> None:
        super().__init__()
        self._error = error

    def eliminar(self, storage_key: str) -> None:
        raise self._error


def test_fallo_al_crear_compensa_el_objeto_huerfano() -> None:
    """Si la fila no se crea, el binario subido se borra del bucket."""
    error = RepoError("la BD no respondió")
    servicio, almacen, _, usuario = _contexto(
        repo_factory=lambda memoria: _RepoQueFalla(memoria, error)
    )
    with pytest.raises(RepoError):
        servicio.subir(FINCA_ID, uuid.uuid4(), uuid.uuid4(), _upload(PNG, "image/png"), usuario)
    assert almacen.claves() == []


def test_compensacion_fallida_registra_y_propaga_repo_error(caplog) -> None:
    """Si además falla el borrado, no se oculta: se loguea y se propaga 500."""
    almacen = _AlmacenQueNoBorra(RepoError("Storage caído"))
    servicio, _, _, usuario = _contexto(
        repo_factory=lambda memoria: _RepoQueFalla(memoria, RepoError("la BD no respondió")),
        almacen=almacen,
    )
    with (
        caplog.at_level(logging.ERROR, logger="app.services.evidencia_service"),
        pytest.raises(RepoError),
    ):
        servicio.subir(
            FINCA_ID, uuid.uuid4(), uuid.uuid4(), _upload(PNG, "image/png"), usuario
        )
    assert "No se pudo eliminar el objeto huérfano" in caplog.text
    assert almacen.claves() != []
