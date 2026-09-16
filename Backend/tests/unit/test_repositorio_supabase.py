"""Repositorios Supabase: regresiones detectadas al conectar el proyecto real.

Estas rutas nunca se habían ejecutado (el backend corría siempre con el store
en memoria), y con PostgREST de verdad fallaban de tres formas distintas.
"""

from __future__ import annotations

import datetime as dt
import uuid

from app.models.dominio import Estado, EstadoEvidencia
from app.repositories.supabase import (
    SupabaseEvidenciaRepo,
    SupabaseLoteRepo,
    SupabasePagoRepo,
    SupabaseQRRepo,
    fila_a_evidencia,
)

AHORA = dt.datetime(2026, 8, 25, 12, 0, tzinfo=dt.UTC)
LOTE_ID = uuid.UUID("aaaaaaaa-0000-0000-0000-000000000001")
FINCA_ID = uuid.UUID("bbbbbbbb-0000-0000-0000-000000000002")
EVIDENCIA_ID = uuid.UUID("aaaaaaaa-0000-0000-0000-0000000000e1")


def fila_lote() -> dict:
    return {
        "id": str(LOTE_ID),
        "finca_id": str(FINCA_ID),
        "codigo_publico": "LT-0001",
        "estado": Estado.TOSTADO.value,
        "peso_actual_kg": 140.0,
        "fecha_cosecha": "2026-08-01",
        "creado_en": AHORA.isoformat(),
        "actualizado_en": AHORA.isoformat(),
    }


def fila_qr() -> dict:
    return {
        "id": str(uuid.uuid4()),
        "lote_id": str(LOTE_ID),
        "codigo": "BT-0001",
        "hash_sha256": "h" * 64,
        "emitido_en": AHORA.isoformat(),
    }


def fila_evidencia(estado: EstadoEvidencia = EstadoEvidencia.PENDIENTE) -> dict:
    return {
        "id": str(EVIDENCIA_ID),
        "lote_id": str(LOTE_ID),
        "finca_id": str(FINCA_ID),
        "uploader_id": str(uuid.uuid4()),
        "storage_key": "uploader/lote/foto.jpg",
        "sha256": "a" * 64,
        "content_type": "image/jpeg",
        "size_bytes": 10,
        "estado": estado.value,
        "creado_en": AHORA.isoformat(),
        "adjuntada_en": AHORA.isoformat() if estado is EstadoEvidencia.ADJUNTA else None,
    }


class RespuestaFalsa:
    def __init__(self, data) -> None:
        self.data = data


class ConsultaFalsa:
    """Encadenable como el query builder de postgrest, y registra lo que recibe."""

    def __init__(self, tabla: str, registro: dict) -> None:
        self._tabla = tabla
        self._registro = registro
        self._maybe_single = False

    def select(self, columnas="*"):
        self._registro.setdefault("select", {})[self._tabla] = columnas
        return self

    def eq(self, columna, valor):
        self._registro.setdefault("filtros", []).append((self._tabla, columna, valor))
        return self

    def in_(self, columna, valores):
        self._registro.setdefault("in_", []).append((self._tabla, columna, list(valores)))
        return self

    def order(self, columna, *, desc=False, **_kwargs):
        self._registro.setdefault("orden", []).append((self._tabla, columna, desc))
        return self

    def limit(self, *_args):
        return self

    def maybe_single(self):
        self._maybe_single = True
        return self

    def insert(self, fila):
        self._registro.setdefault("insertados", []).append((self._tabla, fila))
        return self

    def upsert(self, fila):
        self._registro.setdefault("upserts", []).append((self._tabla, fila))
        return self

    def update(self, valores):
        self._registro.setdefault("updates", []).append((self._tabla, valores))
        return self

    def execute(self):
        filas = self._registro["datos"].get(self._tabla, [])
        if self._maybe_single:
            # Comportamiento real del SDK: devuelve None, no una respuesta vacía.
            return RespuestaFalsa(filas[0]) if filas else None
        return RespuestaFalsa(filas)


class ClienteFalso:
    def __init__(self, datos: dict) -> None:
        self.registro: dict = {"datos": datos}

    def table(self, nombre: str) -> ConsultaFalsa:
        return ConsultaFalsa(nombre, self.registro)


def test_buscar_por_id_sin_fila_devuelve_none() -> None:
    """`maybe_single()` sin coincidencia devuelve None: `resp.data` reventaba."""
    repo = SupabaseLoteRepo(ClienteFalso({}))
    assert repo.buscar_por_id(LOTE_ID) is None


def test_buscar_por_id_hidrata_el_certificado() -> None:
    """Sin hidratar, la app no puede pintar el QR y el hash del certificado deja
    de verificar en cuanto el lote registra un evento posterior a la emisión."""
    cliente = ClienteFalso({"lotes": [fila_lote()], "qr_certificado": [fila_qr()]})
    lote = SupabaseLoteRepo(cliente).buscar_por_id(LOTE_ID)
    assert lote is not None
    assert lote.certificado is not None
    assert lote.certificado.codigo == "BT-0001"


def test_certificados_se_piden_en_una_sola_consulta() -> None:
    cliente = ClienteFalso({"lotes": [fila_lote()], "qr_certificado": [fila_qr()]})
    SupabaseLoteRepo(cliente).listar(cursor=None, limit=10)
    assert cliente.registro["in_"] == [("qr_certificado", "lote_id", [str(LOTE_ID)])]


def test_registrar_verificacion_genera_el_id() -> None:
    """`verificacion.id` es uuid PK sin default en la BD."""
    cliente = ClienteFalso({})
    SupabaseQRRepo(cliente).registrar_verificacion(LOTE_ID, "android")
    tabla, fila = cliente.registro["insertados"][0]
    assert tabla == "verificacion"
    assert uuid.UUID(fila["id"])


def test_saldo_usa_el_nombre_real_de_la_tabla_en_el_embed() -> None:
    """La tabla se llama `lotes`; con `lote` PostgREST responde PGRST200."""
    cliente = ClienteFalso({})
    SupabasePagoRepo(cliente).total_confirmado_por_productor(uuid.uuid4())
    assert "lotes!inner" in cliente.registro["select"]["pago"]
    columnas = [columna for _, columna, _ in cliente.registro["filtros"]]
    assert "lotes.finca.productor_id" in columnas


def test_evidencia_crear_usa_upsert_idempotente() -> None:
    """`upsert` y no `insert`: un reintento con la misma clave no puede reventar."""
    cliente = ClienteFalso({})
    SupabaseEvidenciaRepo(cliente).crear(fila_a_evidencia(fila_evidencia()))
    tabla, fila = cliente.registro["upserts"][0]
    assert tabla == "evidencias"
    assert fila["id"] == str(EVIDENCIA_ID)
    assert fila["estado"] == "PENDIENTE"


def test_evidencia_buscar_por_id_hidrata_la_fila() -> None:
    cliente = ClienteFalso({"evidencias": [fila_evidencia()]})
    evidencia = SupabaseEvidenciaRepo(cliente).buscar_por_id(EVIDENCIA_ID)
    assert evidencia is not None
    assert evidencia.storage_key == "uploader/lote/foto.jpg"
    assert evidencia.content_type == "image/jpeg"


def test_evidencia_buscar_adjunta_por_lote_filtra_por_estado() -> None:
    cliente = ClienteFalso({"evidencias": [fila_evidencia(EstadoEvidencia.ADJUNTA)]})
    evidencia = SupabaseEvidenciaRepo(cliente).buscar_adjunta_por_lote(LOTE_ID)
    assert evidencia is not None
    assert evidencia.estado is EstadoEvidencia.ADJUNTA
    filtros = cliente.registro["filtros"]
    assert ("evidencias", "lote_id", str(LOTE_ID)) in filtros
    assert ("evidencias", "estado", "ADJUNTA") in filtros


def test_evidencia_marcar_adjunta_actualiza_estado_y_fecha() -> None:
    cliente = ClienteFalso({})
    SupabaseEvidenciaRepo(cliente).marcar_adjunta(EVIDENCIA_ID, AHORA)
    tabla, valores = cliente.registro["updates"][0]
    assert tabla == "evidencias"
    assert valores == {"estado": "ADJUNTA", "adjuntada_en": AHORA.isoformat()}


def test_listar_eventos_ordena_ascendente() -> None:
    """El historial se consume en orden cronológico: el smoke, el pasaporte
    público (`reversed`) y el móvil (`campoMasReciente`) asumen ascendente."""
    cliente = ClienteFalso({"lote_eventos": []})
    SupabaseLoteRepo(cliente).listar_eventos(LOTE_ID)
    orden = [item for item in cliente.registro["orden"] if item[0] == "lote_eventos"]
    assert orden == [
        ("lote_eventos", "registrado_en", False),
        ("lote_eventos", "id", False),
    ]
