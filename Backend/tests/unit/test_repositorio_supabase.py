"""Repositorios Supabase: regresiones detectadas al conectar el proyecto real.

Estas rutas nunca se habían ejecutado (el backend corría siempre con el store
en memoria), y con PostgREST de verdad fallaban de tres formas distintas.
"""

from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import replace

import pytest
from postgrest import APIError

from app.models.dominio import (
    Estado,
    EstadoEvidencia,
    EvidenciaNoEncontrada,
    EvidenciaYaAdjunta,
    Lote,
    LoteEvento,
    NoAutorizado,
    RepoError,
    TipoEvento,
)
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
ACTOR_ID = uuid.UUID("cccccccc-0000-0000-0000-000000000003")
EVIDENCIA_ID = uuid.UUID("aaaaaaaa-0000-0000-0000-0000000000e1")
EVENTO_ID = uuid.UUID("dddddddd-0000-0000-0000-000000000004")


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
        self._registro["_operacion"] = "insert"
        return self

    def upsert(self, fila):
        self._registro.setdefault("upserts", []).append((self._tabla, fila))
        return self

    def update(self, valores):
        self._registro.setdefault("updates", []).append((self._tabla, valores))
        return self

    def execute(self):
        if self._registro.get("_operacion") == "insert":
            self._registro["_operacion"] = None
            if "error_insert" in self._registro:
                raise self._registro["error_insert"]
        filas = self._registro["datos"].get(self._tabla, [])
        if self._maybe_single:
            # Comportamiento real del SDK: devuelve None, no una respuesta vacía.
            return RespuestaFalsa(filas[0]) if filas else None
        return RespuestaFalsa(filas)


class RpcFalsa:
    """Simula `cliente.rpc(...).execute()`."""

    def __init__(self, registro: dict, nombre: str) -> None:
        self._registro = registro
        self._nombre = nombre

    def execute(self):
        self._registro.setdefault("rpc_llamadas", []).append(self._nombre)
        if "error_rpc" in self._registro:
            raise self._registro["error_rpc"]
        return RespuestaFalsa(self._registro.get("rpc_respuesta"))


class ClienteFalso:
    def __init__(self, datos: dict) -> None:
        self.registro: dict = {"datos": datos}

    def table(self, nombre: str) -> ConsultaFalsa:
        return ConsultaFalsa(nombre, self.registro)

    def rpc(self, nombre: str, parametros: dict) -> RpcFalsa:
        self.registro.setdefault("rpc_parametros", []).append((nombre, parametros))
        return RpcFalsa(self.registro, nombre)


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


def _error_pg(code: str) -> APIError:
    return APIError({"message": "conflicto", "code": code, "details": None, "hint": None})


def test_evidencia_crear_usa_insert_no_destructivo() -> None:
    """`insert` y no `upsert`: jamás se sobrescribe una evidencia existente."""
    cliente = ClienteFalso({})
    resultado = SupabaseEvidenciaRepo(cliente).crear(fila_a_evidencia(fila_evidencia()))
    tabla, fila = cliente.registro["insertados"][0]
    assert tabla == "evidencias"
    assert fila["id"] == str(EVIDENCIA_ID)
    assert fila["estado"] == "PENDIENTE"
    assert resultado.id == EVIDENCIA_ID
    assert "upserts" not in cliente.registro


def test_evidencia_crear_replay_identico_devuelve_la_fila() -> None:
    """Conflicto de PK con los mismos datos: es un replay, no un fallo."""
    fila = fila_evidencia()
    cliente = ClienteFalso({"evidencias": [fila]})
    cliente.registro["error_insert"] = _error_pg("23505")
    resultado = SupabaseEvidenciaRepo(cliente).crear(fila_a_evidencia(fila))
    assert resultado.id == EVIDENCIA_ID
    assert resultado.sha256 == fila["sha256"]


def test_evidencia_crear_conflicto_con_datos_distintos_es_409() -> None:
    """Misma PK, otro contenido: la fila existente manda y se responde 409."""
    fila = fila_evidencia()
    cliente = ClienteFalso({"evidencias": [fila]})
    cliente.registro["error_insert"] = _error_pg("23505")
    otra = replace(fila_a_evidencia(fila), sha256="b" * 64)
    with pytest.raises(EvidenciaYaAdjunta):
        SupabaseEvidenciaRepo(cliente).crear(otra)


def test_evidencia_crear_conflicto_sin_fila_existente_es_409() -> None:
    """Si la PK choca pero la fila no se puede leer, no se asume replay."""
    cliente = ClienteFalso({})
    cliente.registro["error_insert"] = _error_pg("23505")
    with pytest.raises(EvidenciaYaAdjunta):
        SupabaseEvidenciaRepo(cliente).crear(fila_a_evidencia(fila_evidencia()))


def test_evidencia_crear_error_no_conflicto_es_repo_error() -> None:
    cliente = ClienteFalso({})
    cliente.registro["error_insert"] = _error_pg("42P01")
    with pytest.raises(RepoError):
        SupabaseEvidenciaRepo(cliente).crear(fila_a_evidencia(fila_evidencia()))


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


# ------------------------------------------------------- RPC atómica (008)


def _lote_dominio() -> Lote:
    return Lote(
        id=LOTE_ID,
        finca_id=FINCA_ID,
        codigo_publico="LT-0001",
        fecha_cosecha=dt.date(2026, 8, 1),
    )


def _evento_dominio() -> LoteEvento:
    return LoteEvento(
        id=EVENTO_ID,
        lote_id=LOTE_ID,
        tipo=TipoEvento.COSECHA,
        de_estado=None,
        a_estado=Estado.CEREZA,
        actor_id=ACTOR_ID,
        peso_kg=87.6,
        hash_etapa="h" * 64,
        registrado_en=AHORA,
    )


def _fila_evento() -> dict:
    return {
        "id": str(EVENTO_ID),
        "lote_id": str(LOTE_ID),
        "tipo": TipoEvento.COSECHA.value,
        "de_estado": None,
        "a_estado": Estado.CEREZA.value,
        "actor_id": str(ACTOR_ID),
        "peso_kg": 87.6,
        "hash_etapa": "h" * 64,
        "registrado_en": AHORA.isoformat(),
    }


def _cliente_con_lote() -> ClienteFalso:
    return ClienteFalso(
        {"lotes": [fila_lote()], "lote_eventos": [_fila_evento()], "qr_certificado": []}
    )


def test_registrar_cosecha_con_evidencia_llama_rpc_y_relee() -> None:
    cliente = _cliente_con_lote()
    cliente.registro["rpc_respuesta"] = [{"lote_id": str(LOTE_ID), "reintento": False}]

    resultado = SupabaseLoteRepo(cliente).registrar_cosecha_con_evidencia(
        _lote_dominio(), _evento_dominio(), EVIDENCIA_ID, AHORA
    )

    nombre, parametros = cliente.registro["rpc_parametros"][0]
    assert nombre == "registrar_cosecha_con_evidencia"
    assert parametros["p_lote_id"] == str(LOTE_ID)
    assert parametros["p_evento_id"] == str(EVENTO_ID)
    assert parametros["p_finca_id"] == str(FINCA_ID)
    assert parametros["p_evidencia_id"] == str(EVIDENCIA_ID)
    assert parametros["p_hash_etapa"] == "h" * 64
    assert parametros["p_peso_kg"] == 87.6
    # El timestamp canónico viaja explícito: es el mismo que entró al hash.
    assert parametros["p_registrado_en"] == AHORA.isoformat()
    # `adjuntada_en` es el reloj de la evidencia, no un parámetro del RPC.
    assert "adjuntada_en" not in parametros
    # Se relee de la BD (con historial y certificado), no se devuelve el objeto local.
    assert resultado.id == LOTE_ID
    assert len(resultado.historial) == 1


def test_registrar_cosecha_con_evidencia_reintento_relee_igual() -> None:
    """La carrera/reintento del RPC devuelve reintento=true: se relee el lote."""
    cliente = _cliente_con_lote()
    cliente.registro["rpc_respuesta"] = [{"lote_id": str(LOTE_ID), "reintento": True}]
    resultado = SupabaseLoteRepo(cliente).registrar_cosecha_con_evidencia(
        _lote_dominio(), _evento_dominio(), EVIDENCIA_ID, AHORA
    )
    assert resultado.id == LOTE_ID


@pytest.mark.parametrize(
    ("codigo", "esperado"),
    [
        ("28000", NoAutorizado),
        ("42501", NoAutorizado),
        ("P0002", EvidenciaNoEncontrada),
        ("23505", EvidenciaYaAdjunta),
    ],
)
def test_registrar_cosecha_con_evidencia_mapea_sqlstate(codigo, esperado) -> None:
    cliente = ClienteFalso({})
    cliente.registro["error_rpc"] = _error_pg(codigo)
    with pytest.raises(esperado):
        SupabaseLoteRepo(cliente).registrar_cosecha_con_evidencia(
            _lote_dominio(), _evento_dominio(), EVIDENCIA_ID, AHORA
        )


def test_registrar_cosecha_con_evidencia_error_desconocido_es_repo_error() -> None:
    cliente = ClienteFalso({})
    cliente.registro["error_rpc"] = _error_pg("XX000")
    with pytest.raises(RepoError):
        SupabaseLoteRepo(cliente).registrar_cosecha_con_evidencia(
            _lote_dominio(), _evento_dominio(), EVIDENCIA_ID, AHORA
        )
