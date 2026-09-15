"""Evidencias: mappers, repositorio Supabase y contrato del SDK de Storage.

Estas rutas solo corren con `BEAN_REPO_BACKEND=supabase`; sin estos tests
quedarían sin ejercitar (como pasó con el resto de repositorios Supabase).
"""

from __future__ import annotations

import datetime as dt
import uuid

from app.models.dominio import EstadoEvidencia, Evidencia
from app.repositories.evidencia import (
    InMemoryAlmacenEvidencia,
    SupabaseAlmacenEvidencia,
)
from app.repositories.supabase import (
    SupabaseEvidenciaRepo,
    evidencia_a_fila,
    fila_a_evidencia,
)

AHORA = dt.datetime(2026, 8, 25, 12, 0, tzinfo=dt.UTC)
EVIDENCIA_ID = uuid.UUID("aaaaaaaa-0000-0000-0000-0000000000e1")


def _evidencia(estado: EstadoEvidencia = EstadoEvidencia.PENDIENTE) -> Evidencia:
    return Evidencia(
        id=EVIDENCIA_ID,
        lote_id=uuid.uuid4(),
        finca_id=uuid.uuid4(),
        uploader_id=uuid.uuid4(),
        storage_key="uploader/lote/foto.jpg",
        sha256="a" * 64,
        content_type="image/jpeg",
        size_bytes=10,
        estado=estado,
        creado_en=AHORA,
    )


def test_mapper_evidencia_ida_y_vuelta() -> None:
    evidencia = _evidencia()
    fila = evidencia_a_fila(evidencia)
    assert fila["estado"] == "PENDIENTE"
    assert fila["adjuntada_en"] is None
    assert fila_a_evidencia(fila) == evidencia


class RespuestaFalsa:
    def __init__(self, data) -> None:
        self.data = data


class TablaFalsa:
    def __init__(self, registro: dict) -> None:
        self._registro = registro
        self._maybe_single = False

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def maybe_single(self):
        self._maybe_single = True
        return self

    def update(self, valores):
        self._registro["update"] = valores
        return self

    def execute(self):
        if "update" in self._registro:
            return RespuestaFalsa(None)
        filas = self._registro.get("filas", [])
        if self._maybe_single:
            return RespuestaFalsa(filas[0]) if filas else None
        return RespuestaFalsa(filas)


class ClienteFalso:
    def __init__(self, filas: list[dict] | None = None) -> None:
        self.registro: dict = {"filas": filas or []}

    def table(self, nombre: str) -> TablaFalsa:
        self.registro["tabla"] = nombre
        return TablaFalsa(self.registro)


def test_buscar_por_id_sin_fila_devuelve_none() -> None:
    assert SupabaseEvidenciaRepo(ClienteFalso()).buscar_por_id(EVIDENCIA_ID) is None


def test_marcar_adjunta_actualiza_estado_y_timestamp() -> None:
    cliente = ClienteFalso()
    SupabaseEvidenciaRepo(cliente).marcar_adjunta(EVIDENCIA_ID, AHORA)
    assert cliente.registro["tabla"] == "evidencias"
    assert cliente.registro["update"]["estado"] == "ADJUNTA"
    assert cliente.registro["update"]["adjuntada_en"] == AHORA.isoformat()


class BucketFalso:
    def __init__(self, respuesta: dict) -> None:
        self._respuesta = respuesta
        self.llamadas: list[tuple] = []

    def upload(self, path, file, options):
        self.llamadas.append(("upload", path, file, options))

    def create_signed_url(self, path, expira):
        self.llamadas.append(("sign", path, expira))
        return self._respuesta

    def remove(self, paths):
        self.llamadas.append(("remove", paths))


class ClienteStorageFalso:
    def __init__(self, respuesta: dict) -> None:
        self.bucket = BucketFalso(respuesta)

    @property
    def storage(self):
        return self

    def from_(self, _nombre: str) -> BucketFalso:
        return self.bucket


def test_almacen_supabase_sube_con_content_type_y_upsert() -> None:
    cliente = ClienteStorageFalso({"signedURL": "https://x/y"})
    SupabaseAlmacenEvidencia(cliente, "evidencias-lotes").subir(
        "uploader/lote/foto.jpg", b"datos", "image/jpeg"
    )
    metodo, path, file, options = cliente.bucket.llamadas[0]
    assert metodo == "upload"
    assert path == "uploader/lote/foto.jpg"
    assert file == b"datos"
    assert options == {"content-type": "image/jpeg", "upsert": "true"}


def test_almacen_supabase_lee_signed_url_en_cualquier_casing() -> None:
    for clave in ("signedURL", "signedUrl"):
        cliente = ClienteStorageFalso({clave: "https://x/y"})
        assert SupabaseAlmacenEvidencia(cliente, "b").url_firmada("k", 600) == "https://x/y"


def test_almacen_supabase_elimina_lista() -> None:
    cliente = ClienteStorageFalso({})
    SupabaseAlmacenEvidencia(cliente, "b").eliminar("k")
    assert cliente.bucket.llamadas[-1] == ("remove", ["k"])


def test_almacen_memoria_guarda_firma_y_elimina() -> None:
    almacen = InMemoryAlmacenEvidencia("evidencias-lotes")
    almacen.subir("uploader/lote/foto.jpg", b"datos", "image/jpeg")
    assert almacen.contenido("uploader/lote/foto.jpg") == b"datos"
    assert (
        almacen.url_firmada("uploader/lote/foto.jpg", 600)
        == "https://storage.local/evidencias-lotes/uploader/lote/foto.jpg?exp=600"
    )
    almacen.eliminar("uploader/lote/foto.jpg")
    assert almacen.contenido("uploader/lote/foto.jpg") is None
