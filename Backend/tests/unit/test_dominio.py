"""Tests unitarios del dominio (B1): máquina de estados y aggregate Lote.

El dominio es puro (sin I/O), así que estos tests corren sin infraestructura.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest

from app.models.dominio import (
    ErrorDeDominio,
    Estado,
    EstadoPago,
    Lote,
    LoteEvento,
    LoteNoEncontrado,
    MaquinaEstados,
    MermaNegativa,
    TipoEvento,
    TransicionInvalida,
    ahora_utc,
)
from app.services.qr_service import QrService

ACTOR = uuid.uuid4()
FINCA = uuid.uuid4()


def crear_lote() -> Lote:
    return Lote(
        id=uuid.uuid4(),
        finca_id=FINCA,
        codigo_publico="LT-ABC123",
        fecha_cosecha=date(2026, 8, 1),
    )


# ------------------------------------------------------------------ ahora_utc


def test_ahora_utc_es_aware() -> None:
    ts = ahora_utc()
    assert ts.tzinfo is not None
    assert ts.utcoffset().total_seconds() == 0


# ------------------------------------------------------------------ máquina de estados


def MaquinaEstados_permitida(de: Estado, tipo: TipoEvento) -> Estado | None:
    return MaquinaEstados.permitida(de, tipo)


def test_transiciones_validas() -> None:
    assert MaquinaEstados_permitida(Estado.CEREZA, TipoEvento.DESPULPADO) == Estado.PERGAMINO
    assert MaquinaEstados_permitida(Estado.PERGAMINO, TipoEvento.DESCASCARADO) == Estado.ORO
    assert MaquinaEstados_permitida(Estado.ORO, TipoEvento.TOSTADO) == Estado.TOSTADO
    assert MaquinaEstados_permitida(Estado.TOSTADO, TipoEvento.VENTA) == Estado.VENDIDO


def test_no_se_puede_saltar_estados() -> None:
    assert MaquinaEstados_permitida(Estado.CEREZA, TipoEvento.TOSTADO) is None
    assert MaquinaEstados_permitida(Estado.CEREZA, TipoEvento.VENTA) is None
    assert MaquinaEstados_permitida(Estado.ORO, TipoEvento.VENTA) is None


def test_rechazo_permitido_desde_estados_intermedios() -> None:
    for origen in (Estado.CEREZA, Estado.PERGAMINO, Estado.ORO):
        assert MaquinaEstados_permitida(origen, TipoEvento.RECHAZADO) == Estado.RECHAZADO


def test_rec_rechazado_no_sale() -> None:
    assert MaquinaEstados_permitida(Estado.RECHAZADO, TipoEvento.DESPULPADO) is None
    assert MaquinaEstados_permitida(Estado.VENDIDO, TipoEvento.VENTA) is None


# ------------------------------------------------------------------ registro de cosecha


def test_registrar_cosecha_crea_lote_en_cereza() -> None:
    lote = crear_lote()
    evento = lote.registrar_cosecha(ACTOR, 500.0)
    assert lote.estado is Estado.CEREZA
    assert lote.peso_actual_kg == 500.0
    assert evento.tipo is TipoEvento.COSECHA
    assert evento.de_estado is None
    assert evento.a_estado is Estado.CEREZA
    assert len(lote.historial) == 1


def test_no_doble_cosecha() -> None:
    lote = crear_lote()
    lote.registrar_cosecha(ACTOR, 500.0)
    with pytest.raises(TransicionInvalida):
        lote.registrar_cosecha(ACTOR, 500.0)


def test_cosecha_peso_cero_invalida() -> None:
    lote = crear_lote()
    with pytest.raises(ErrorDeDominio):
        lote.registrar_cosecha(ACTOR, 0.0)


# ------------------------------------------------------------------ avance de estado


def test_cadena_completa_hasta_vendido() -> None:
    lote = crear_lote()
    lote.registrar_cosecha(ACTOR, 500.0)
    pasos = [
        (TipoEvento.DESPULPADO, 480.0, Estado.PERGAMINO),
        (TipoEvento.DESCASCARADO, 450.0, Estado.ORO),
        (TipoEvento.TOSTADO, 420.0, Estado.TOSTADO),
    ]
    for tipo, peso, esperado in pasos:
        evento = lote.avanzar(tipo, ACTOR, peso_kg=peso)
        assert lote.estado is esperado
        assert evento.de_estado is not None
        assert evento.peso_kg == peso
    evento = lote.avanzar(TipoEvento.VENTA, ACTOR, comprador_id=uuid.uuid4())
    assert lote.estado is Estado.VENDIDO
    assert evento.comprador_id is not None
    assert len(lote.historial) == 5


def test_transicion_invalida_lanza() -> None:
    lote = crear_lote()
    lote.registrar_cosecha(ACTOR, 500.0)
    with pytest.raises(TransicionInvalida):
        lote.avanzar(TipoEvento.TOSTADO, ACTOR, peso_kg=420.0)


def test_merma_negativa_lanza() -> None:
    lote = crear_lote()
    lote.registrar_cosecha(ACTOR, 500.0)
    with pytest.raises(MermaNegativa):
        lote.avanzar(TipoEvento.DESPULPADO, ACTOR, merma_pct=-1.0)


def test_peso_no_positivo_lanza() -> None:
    lote = crear_lote()
    lote.registrar_cosecha(ACTOR, 500.0)
    with pytest.raises(ErrorDeDominio):
        lote.avanzar(TipoEvento.DESPULPADO, ACTOR, peso_kg=0.0)


def test_venta_sin_comprador_lanza() -> None:
    lote = crear_lote()
    lote.registrar_cosecha(ACTOR, 500.0)
    for tipo, peso in [
        (TipoEvento.DESPULPADO, 480.0),
        (TipoEvento.DESCASCARADO, 450.0),
        (TipoEvento.TOSTADO, 420.0),
    ]:
        lote.avanzar(tipo, ACTOR, peso_kg=peso)
    with pytest.raises(ErrorDeDominio):
        lote.avanzar(TipoEvento.VENTA, ACTOR)


def test_es_transicion_valida() -> None:
    lote = crear_lote()
    lote.registrar_cosecha(ACTOR, 500.0)
    assert lote.es_transicion_valida(Estado.PERGAMINO)
    assert not lote.es_transicion_valida(Estado.VENDIDO)


def test_evento_id_respetado() -> None:
    lote = crear_lote()
    lote.registrar_cosecha(ACTOR, 500.0)
    evento_id = uuid.uuid4()
    evento = lote.avanzar(TipoEvento.DESPULPADO, ACTOR, evento_id=evento_id, peso_kg=480.0)
    assert evento.id == evento_id


# ------------------------------------------------------------------ certificado QR


def test_certificado_solo_a_partir_de_tostado() -> None:
    lote = crear_lote()
    lote.registrar_cosecha(ACTOR, 500.0)
    qr = QrService().crear_certificado(lote)
    with pytest.raises(TransicionInvalida):
        lote.generar_certificado(qr)
    lote.avanzar(TipoEvento.DESPULPADO, ACTOR, peso_kg=480.0)
    with pytest.raises(TransicionInvalida):
        lote.generar_certificado(qr)
    lote.avanzar(TipoEvento.DESCASCARADO, ACTOR, peso_kg=450.0)
    lote.avanzar(TipoEvento.TOSTADO, ACTOR, peso_kg=420.0)
    lote.generar_certificado(qr)
    assert lote.certificado is qr


def test_hash_determinista_y_sensible_al_historial() -> None:
    qr = QrService()
    mismo_id = uuid.uuid4()
    fijo = ahora_utc()
    evento = LoteEvento(
        id=uuid.uuid4(),
        lote_id=mismo_id,
        tipo=TipoEvento.COSECHA,
        de_estado=None,
        a_estado=Estado.CEREZA,
        actor_id=ACTOR,
        peso_kg=500.0,
        registrado_en=fijo,
    )

    def construir() -> Lote:
        return Lote(
            id=mismo_id,
            finca_id=FINCA,
            codigo_publico="LT-X",
            fecha_cosecha=date(2026, 8, 1),
            estado=Estado.CEREZA,
            peso_actual_kg=500.0,
            historial=[evento],
        )

    a = construir()
    b = construir()
    assert qr.hash_lote(a) == qr.hash_lote(b)
    b.avanzar(TipoEvento.DESPULPADO, ACTOR, peso_kg=480.0)
    assert qr.hash_lote(a) != qr.hash_lote(b)


def test_hash_etapa_reproducible_desde_el_evento_persistido() -> None:
    """Regresión ADR-11: el hash almacenado debe recalcularse con los datos guardados.

    Antes se calculaba sobre un `LoteEvento` temporal cuyo `registrado_en` se
    autogeneraba de nuevo al crear el evento final, así que el `hash_etapa`
    persistido no coincidía con el que producía el propio evento guardado.
    """
    lote = crear_lote()
    lote.registrar_cosecha(ACTOR, 500.0)
    lote.avanzar(TipoEvento.DESPULPADO, ACTOR, peso_kg=480.0)
    lote.avanzar(TipoEvento.DESCASCARADO, ACTOR, peso_kg=450.0)
    lote.avanzar(TipoEvento.TOSTADO, ACTOR, peso_kg=420.0)

    for indice, evento in enumerate(lote.historial):
        espejo = Lote(
            id=lote.id,
            finca_id=lote.finca_id,
            codigo_publico=lote.codigo_publico,
            fecha_cosecha=lote.fecha_cosecha,
            historial=list(lote.historial[:indice]),
        )
        assert espejo._calcular_hash_etapa(evento) == evento.hash_etapa


# ------------------------------------------------------------------ estados de error


def test_status_codes_de_error() -> None:
    assert ErrorDeDominio("x").status_code == 400
    assert LoteNoEncontrado("x").status_code == 404
    assert TransicionInvalida("x").status_code == 409
    assert EstadoPago.PENDIENTE.value == "PENDIENTE"