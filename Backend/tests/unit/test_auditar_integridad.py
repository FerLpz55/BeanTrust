"""Auditoría/reparación histórica de la cadena (migración 008).

Lógica pura, sin base de datos: se construyen lotes con el dominio, se corrompe
un hash a mano y se comprueba la detección y el SQL generado. Los valores con
decimales no enteros (0.1, 1.25, 87.6) son el caso que rompía la reproducción
del hash cuando las columnas físicas eran `real` (float4).
"""

from __future__ import annotations

import uuid
from dataclasses import replace
from datetime import date

from app.models.dominio import Lote, TipoEvento
from app.services.qr_service import QrService
from scripts.auditar_integridad_historica import (
    auditar_integridad,
    calcular_cadena,
    generar_sql_reparacion,
)

ACTOR = uuid.UUID("11111111-1111-1111-1111-111111111111")
HASH_CORRUPTO = "0" * 64


def _lote_con_decimales() -> Lote:
    """Lote PERGAMINO con 0.1, 1.25 y 87.6 en campos que entran al hash."""
    lote = Lote(
        id=uuid.uuid4(),
        finca_id=uuid.uuid4(),
        codigo_publico="LT-DECIMAL",
        fecha_cosecha=date(2026, 8, 1),
    )
    lote.registrar_cosecha(ACTOR, 87.6)
    lote.avanzar(TipoEvento.DESPULPADO, ACTOR, peso_kg=80.0, merma_pct=1.25)
    lote.avanzar(TipoEvento.FERMENTACION, ACTOR, fermentacion_horas=0.1)
    lote.avanzar(TipoEvento.SECADO, ACTOR, humedad_inicial_pct=87.6, humedad_final_pct=11.5)
    return lote


def _lote_tostado() -> Lote:
    lote = Lote(
        id=uuid.uuid4(),
        finca_id=uuid.uuid4(),
        codigo_publico="LT-TOSTADO",
        fecha_cosecha=date(2026, 8, 1),
    )
    lote.registrar_cosecha(ACTOR, 100.0)
    lote.avanzar(TipoEvento.DESPULPADO, ACTOR, peso_kg=95.0)
    lote.avanzar(TipoEvento.DESCASCARADO, ACTOR, peso_kg=90.0)
    lote.avanzar(TipoEvento.TOSTADO, ACTOR, peso_kg=85.0)
    return lote


def test_cadena_sana_con_decimales_no_reporta_diferencias() -> None:
    lote = _lote_con_decimales()
    reporte = auditar_integridad([lote], {lote.id: list(lote.historial)}, {})
    assert reporte.total_eventos == 4
    assert reporte.eventos_invalidos == 0
    assert not reporte.hay_diferencias
    # El recalculo del dominio coincide con lo persistido (reproducibilidad).
    assert calcular_cadena(list(lote.historial)) == [e.hash_etapa for e in lote.historial]


def test_detecta_hash_corrupto_y_genera_reparacion() -> None:
    lote = _lote_con_decimales()
    eventos = list(lote.historial)
    corrupto = replace(eventos[1], hash_etapa=HASH_CORRUPTO)

    reporte = auditar_integridad(
        [lote], {lote.id: [eventos[0], corrupto, *eventos[2:]]}, {}
    )

    assert reporte.eventos_invalidos == 1
    assert reporte.lotes_invalidos == 1
    diferencia = reporte.eventos_a_reparar[0]
    assert diferencia.evento_id == eventos[1].id
    assert diferencia.hash_anterior == HASH_CORRUPTO
    assert diferencia.hash_nuevo == eventos[1].hash_etapa

    sql = generar_sql_reparacion(reporte, operador="tester", sufijo="test")
    assert "begin;" in sql
    assert "commit;" in sql
    assert (
        "lock table public.lotes, public.lote_eventos, public.qr_certificado "
        "in access exclusive mode;" in sql
    )
    assert "set local lock_timeout" in sql
    assert "set local statement_timeout" in sql
    assert "disable trigger lote_eventos_no_update" in sql
    assert "enable trigger lote_eventos_no_update" in sql
    assert (
        f"where id = '{eventos[1].id}' and hash_etapa = '{HASH_CORRUPTO}'" in sql
    )
    assert "insert into app_private.reparacion_cadena_evento" in sql
    assert "historical_desc_order_repair" in sql
    assert "008_integridad_evidencias" in sql
    assert reporte.checksum in sql
    # Guarda de fila: bloque `do` con `get diagnostics` y aborto si no es 1.
    assert "do $reparacion$" in sql
    assert "get diagnostics v_count = row_count" in sql
    assert "repair_row_count_expected_1_got_%" in sql
    # No hay backup dentro de la transacción (desaparecería en el rollback).
    assert "create table app_private.backup" not in sql
    # El lock se toma antes de cualquier corrección.
    assert sql.index("lock table public.lotes") < sql.index("do $reparacion$")


def test_certificado_corrupto_se_detecta_y_se_repara() -> None:
    servicio = QrService()
    lote = _lote_tostado()
    qr = servicio.crear_certificado(lote)
    lote.generar_certificado(qr)

    sano = auditar_integridad(
        [lote], {lote.id: list(lote.historial)}, {lote.id: [qr]}, servicio
    )
    assert not sano.hay_diferencias

    corrupto = replace(qr, hash_sha256="f" * 64)
    reporte = auditar_integridad(
        [lote], {lote.id: list(lote.historial)}, {lote.id: [corrupto]}, servicio
    )
    assert reporte.certificados_invalidos == 1
    diferencia = reporte.certificados_a_reparar[0]
    assert diferencia.raiz_anterior == "f" * 64
    assert diferencia.raiz_nueva == qr.hash_sha256

    sql = generar_sql_reparacion(reporte, operador="tester", sufijo="test")
    assert "update public.qr_certificado" in sql
    assert (
        f"where id = '{qr.id}' and hash_sha256 = '{'f' * 64}'" in sql
    )
    assert f"'{qr.id}'" in sql


def test_certificado_emitido_antes_de_eventos_posteriores_usa_el_corte() -> None:
    """La bitácora enlaza el último evento con `registrado_en <= emitido_en`."""
    servicio = QrService()
    lote = _lote_tostado()
    eventos = list(lote.historial)
    # Certificado emitido al segundo evento: los posteriores no entran al corte.
    qr = replace(
        servicio.crear_certificado(lote),
        emitido_en=eventos[1].registrado_en,
        hash_sha256="f" * 64,
    )
    lote.generar_certificado(qr)

    reporte = auditar_integridad([lote], {lote.id: eventos}, {lote.id: [qr]}, servicio)

    assert reporte.certificados_invalidos == 1
    diferencia = reporte.certificados_a_reparar[0]
    assert diferencia.evento_id == eventos[1].id
    assert diferencia.emitido_en == eventos[1].registrado_en
    assert diferencia.hash_evento_anterior == eventos[1].hash_etapa


def test_reporte_sano_genera_sql_sin_operaciones() -> None:
    lote = _lote_con_decimales()
    reporte = auditar_integridad([lote], {lote.id: list(lote.historial)}, {})
    sql = generar_sql_reparacion(reporte, operador="tester", sufijo="test")
    assert "Nada que reparar" in sql
    assert "update public.lote_eventos" not in sql


def test_repara_hash_nulo_de_fila_legacy_con_condicion_is_null() -> None:
    """Los eventos anteriores a ADR-11 tienen `hash_etapa` NULL, no ''."""
    lote = _lote_con_decimales()
    eventos = list(lote.historial)
    legacy = replace(eventos[0], hash_etapa=None)

    reporte = auditar_integridad([lote], {lote.id: [legacy, *eventos[1:]]}, {})

    assert reporte.eventos_invalidos == 1
    assert reporte.eventos_a_reparar[0].hash_anterior is None
    sql = generar_sql_reparacion(reporte, operador="tester", sufijo="test")
    assert f"where id = '{eventos[0].id}' and hash_etapa is null" in sql
    # La bitácora guarda NULL, no la cadena vacía.
    assert "null, '" in sql
