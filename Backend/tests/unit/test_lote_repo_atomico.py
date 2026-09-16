"""Alta atómica lote + evidencia en el repositorio en memoria (migración 008).

Cubre las validaciones que el RPC hace en Postgres y que el repo en memoria debe
replicar: tenencia, estado PENDIENTE y reintento idempotente.
"""

from __future__ import annotations

import uuid
from dataclasses import replace
from datetime import UTC, date, datetime

import pytest

from app.models.dominio import (
    EstadoEvidencia,
    Evidencia,
    EvidenciaNoEncontrada,
    EvidenciaYaAdjunta,
    Lote,
    NoAutorizado,
)
from app.repositories.in_memory import InMemoryLoteRepo, Memoria

AHORA = datetime(2026, 8, 25, 12, 0, tzinfo=UTC)
OTRO = datetime(2026, 8, 25, 13, 30, tzinfo=UTC)
ACTOR = uuid.UUID("11111111-1111-1111-1111-111111111111")


def _lote_nuevo(finca_id: uuid.UUID | None = None) -> Lote:
    return Lote(
        id=uuid.uuid4(),
        finca_id=finca_id or uuid.uuid4(),
        codigo_publico="LT-ATOMICO",
        fecha_cosecha=date(2026, 8, 1),
    )


def _contexto():
    memoria = Memoria()
    lote = _lote_nuevo()
    evento = lote.registrar_cosecha(ACTOR, 87.6)
    evidencia = Evidencia(
        id=uuid.uuid4(),
        lote_id=lote.id,
        finca_id=lote.finca_id,
        uploader_id=ACTOR,
        storage_key=f"{ACTOR}/{lote.id}/{uuid.uuid4()}.jpg",
        sha256="a" * 64,
        content_type="image/jpeg",
        size_bytes=10,
    )
    memoria.evidencias[evidencia.id] = evidencia
    return InMemoryLoteRepo(memoria), memoria, lote, evento, evidencia


def test_alta_atomica_guarda_lote_evento_y_adjunta_evidencia() -> None:
    repo, memoria, lote, evento, evidencia = _contexto()
    resultado = repo.registrar_cosecha_con_evidencia(lote, evento, evidencia.id, AHORA)

    assert resultado is lote
    assert memoria.lotes[lote.id] is lote
    assert memoria.eventos[evento.id] is evento
    assert evento in lote.historial
    assert lote.evidencia_url == evidencia.storage_key
    assert lote.evidencia_sha256 == evidencia.sha256
    assert evidencia.estado is EstadoEvidencia.ADJUNTA
    assert evidencia.adjuntada_en == AHORA


def test_evidencia_inexistente_da_404() -> None:
    repo, _, lote, evento, _ = _contexto()
    with pytest.raises(EvidenciaNoEncontrada):
        repo.registrar_cosecha_con_evidencia(lote, evento, uuid.uuid4(), AHORA)


def test_evidencia_de_otro_lote_no_autorizada() -> None:
    repo, _, _, _, evidencia = _contexto()
    otro = _lote_nuevo()
    evento = otro.registrar_cosecha(ACTOR, 10.0)
    with pytest.raises(NoAutorizado):
        repo.registrar_cosecha_con_evidencia(otro, evento, evidencia.id, AHORA)


def test_evidencia_no_pendiente_conflicto() -> None:
    repo, _, lote, evento, evidencia = _contexto()
    evidencia.estado = EstadoEvidencia.ADJUNTA
    with pytest.raises(EvidenciaYaAdjunta):
        repo.registrar_cosecha_con_evidencia(lote, evento, evidencia.id, AHORA)


def test_reintento_identico_devuelve_el_lote_existente() -> None:
    repo, memoria, lote, evento, evidencia = _contexto()
    primera = repo.registrar_cosecha_con_evidencia(lote, evento, evidencia.id, AHORA)
    # El reintento llega con el mismo hash génesis: no se duplica ni se toca.
    segunda = repo.registrar_cosecha_con_evidencia(lote, evento, evidencia.id, AHORA)
    assert segunda is primera
    assert len(memoria.lotes) == 1
    assert len(memoria.eventos) == 1


def test_alta_conserva_el_timestamp_del_evento() -> None:
    """El evento persistido usa exactamente el `registrado_en` que entró al hash."""
    repo, memoria, lote, evento, evidencia = _contexto()
    repo.registrar_cosecha_con_evidencia(lote, evento, evidencia.id, AHORA)
    assert memoria.eventos[evento.id].registrado_en == evento.registrado_en
    assert lote.historial[0].registrado_en == evento.registrado_en


def test_reintento_con_timestamp_distinto_no_duplica() -> None:
    """El replay (sync offline) trae otro `registrado_en`: es idempotente igual."""
    repo, memoria, lote, evento, evidencia = _contexto()
    repo.registrar_cosecha_con_evidencia(lote, evento, evidencia.id, AHORA)

    replay = replace(evento, registrado_en=OTRO)
    assert replay.registrado_en != evento.registrado_en
    resultado = repo.registrar_cosecha_con_evidencia(lote, replay, evidencia.id, AHORA)

    assert resultado is lote
    assert len(memoria.eventos) == 1
    assert len(lote.historial) == 1


def test_reintento_con_datos_distintos_conflicto() -> None:
    repo, _, lote, evento, evidencia = _contexto()
    repo.registrar_cosecha_con_evidencia(lote, evento, evidencia.id, AHORA)
    otro = Lote(
        id=lote.id,
        finca_id=lote.finca_id,
        codigo_publico="LT-ATOMICO",
        fecha_cosecha=lote.fecha_cosecha,
    )
    evento_distinto = otro.registrar_cosecha(ACTOR, 99.9)
    with pytest.raises(EvidenciaYaAdjunta):
        repo.registrar_cosecha_con_evidencia(otro, evento_distinto, evidencia.id, AHORA)
