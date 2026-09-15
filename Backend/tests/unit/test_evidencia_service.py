"""EvidenciaService: validación del binario, idempotencia y URL firmada (ADR-14)."""

from __future__ import annotations

import hashlib
import io
import uuid
from datetime import UTC, datetime

import pytest
from starlette.datastructures import UploadFile

from app.models.dominio import (
    ArchivoInvalido,
    EstadoEvidencia,
    EvidenciaNoEncontrada,
    Finca,
    NoAutorizado,
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


def _contexto(max_bytes: int = 1024):
    usuario = CurrentUser(id=uuid.uuid4(), rol=Rol.PRODUCTOR, email="prod@test.dev")
    memoria = Memoria()
    memoria.fincas[FINCA_ID] = Finca(
        id=FINCA_ID,
        productor_id=usuario.id,
        cooperativa_id=uuid.uuid4(),
        nombre="Finca La Esperanza",
        municipio="Coatepec",
    )
    almacen = InMemoryAlmacenEvidencia()
    servicio = EvidenciaService(
        repo_evidencia=InMemoryEvidenciaRepo(memoria),
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
