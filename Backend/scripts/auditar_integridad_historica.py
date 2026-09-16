#!/usr/bin/env python3
"""Auditoría y reparación de la cadena de hashes histórica (migración 008).

Por defecto es **solo lectura**: lee `lotes`, `lote_eventos` (orden
`registrado_en, id`) y `qr_certificado`, recalcula cada `hash_etapa` con el
mismo código del dominio (`Lote._calcular_hash_etapa`) y cada raíz de
certificado con `QrService.hash_lote(..., hasta_emitido_en=True)`. Nunca imprime
tokens: solo conteos y hashes recortados.

Con `--generar-reparacion RUTA` escribe (no ejecuta) un SQL transaccional que
hace backup lógico, bloquea las tablas, desactiva los triggers append-only,
corrige los hashes con condición optimista y deja bitácora en
`app_private.reparacion_cadena_evento`.

    BEAN_SUPABASE_URL / BEAN_SUPABASE_SERVICE_KEY (o --url / --service-key)
    python -m scripts.auditar_integridad_historica [--generar-reparacion plan.sql]

Las funciones puras (calcular cadena, detectar diferencias, generar SQL) no
tocan la base de datos y son las que cubre `tests/unit/test_auditar_integridad.py`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

_RAIZ_BACKEND = Path(__file__).resolve().parent.parent
if str(_RAIZ_BACKEND) not in sys.path:
    sys.path.insert(0, str(_RAIZ_BACKEND))

from app.models.dominio import CertificadoQR, Lote, LoteEvento  # noqa: E402
from app.repositories.supabase import (  # noqa: E402
    fila_a_evento,
    fila_a_lote,
    fila_a_qr,
)
from app.services.qr_service import QrService  # noqa: E402

MOTIVO = "historical_desc_order_repair"
VERSION_MIGRACION = "008_integridad_evidencias"
PAGINA = 1000


# ------------------------------------------------------------------ estructuras


@dataclass(frozen=True)
class EventoAReparar:
    """Un `hash_etapa` almacenado que no coincide con el recalculado."""

    lote_id: uuid.UUID
    evento_id: uuid.UUID
    hash_anterior: str | None
    hash_nuevo: str


@dataclass(frozen=True)
class CertificadoAReparar:
    """Una raíz de certificado que no coincide con la cadena corregida."""

    lote_id: uuid.UUID
    certificado_id: uuid.UUID
    evento_id: uuid.UUID
    hash_evento_anterior: str | None
    hash_evento_nuevo: str
    raiz_anterior: str
    raiz_nueva: str


@dataclass(frozen=True)
class ReporteIntegridad:
    """Resultado de la auditoría. Solo hashes y conteos, nunca tokens."""

    total_lotes: int
    total_eventos: int
    total_certificados: int
    eventos_a_reparar: tuple[EventoAReparar, ...]
    certificados_a_reparar: tuple[CertificadoAReparar, ...]
    checksum: str

    @property
    def eventos_invalidos(self) -> int:
        return len(self.eventos_a_reparar)

    @property
    def certificados_invalidos(self) -> int:
        return len(self.certificados_a_reparar)

    @property
    def lotes_invalidos(self) -> int:
        return len(
            {e.lote_id for e in self.eventos_a_reparar}
            | {c.lote_id for c in self.certificados_a_reparar}
        )

    @property
    def hay_diferencias(self) -> bool:
        return bool(self.eventos_a_reparar or self.certificados_a_reparar)


# ------------------------------------------------------------------ lógica pura


def calcular_cadena(eventos: Sequence[LoteEvento]) -> list[str]:
    """Recalcula `hash_etapa` eslabón a eslabón reutilizando el dominio.

    Se apoya en `Lote._calcular_hash_etapa` (no duplica la serialización
    canónica) manteniendo un `Lote` ficticio cuyo historial acumula los hashes
    recalculados; así el eslabón anterior que entra al hash es el correcto.
    """
    if not eventos:
        return []
    contenedor = Lote(
        id=eventos[0].lote_id,
        finca_id=uuid.UUID(int=0),
        codigo_publico="",
        fecha_cosecha=eventos[0].registrado_en.date(),
    )
    esperados: list[str] = []
    for evento in eventos:
        esperado = contenedor._calcular_hash_etapa(evento)
        esperados.append(esperado)
        contenedor.historial.append(replace(evento, hash_etapa=esperado))
    return esperados


def calcular_checksum(
    eventos: Sequence[EventoAReparar], certificados: Sequence[CertificadoAReparar]
) -> str:
    """SHA-256 determinista del plan de reparación (queda en la bitácora)."""
    payload = {
        "eventos": sorted(
            (
                {
                    "lote_id": str(e.lote_id),
                    "evento_id": str(e.evento_id),
                    "hash_anterior": e.hash_anterior,
                    "hash_nuevo": e.hash_nuevo,
                }
                for e in eventos
            ),
            key=lambda fila: (fila["lote_id"], fila["evento_id"]),
        ),
        "certificados": sorted(
            (
                {
                    "lote_id": str(c.lote_id),
                    "certificado_id": str(c.certificado_id),
                    "raiz_anterior": c.raiz_anterior,
                    "raiz_nueva": c.raiz_nueva,
                }
                for c in certificados
            ),
            key=lambda fila: (fila["lote_id"], fila["certificado_id"]),
        ),
    }
    serializado = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(serializado.encode("utf-8")).hexdigest()


def auditar_integridad(
    lotes: Sequence[Lote],
    eventos_por_lote: dict[uuid.UUID, Sequence[LoteEvento]],
    certificados_por_lote: dict[uuid.UUID, Sequence[CertificadoQR]],
    qr_service: QrService | None = None,
) -> ReporteIntegridad:
    """Compara los hashes persistidos con los recalculados, lote a lote.

    La raíz de cada certificado se recalcula sobre la cadena **corregida**, de
    modo que la reparación de un eslabón arrastra la raíz dependiente.
    """
    servicio = qr_service or QrService()
    eventos_a_reparar: list[EventoAReparar] = []
    certificados_a_reparar: list[CertificadoAReparar] = []
    total_eventos = 0
    total_certificados = 0

    for lote in lotes:
        eventos = list(eventos_por_lote.get(lote.id, []))
        total_eventos += len(eventos)
        esperados = calcular_cadena(eventos)
        corregidos = [
            replace(evento, hash_etapa=esperado)
            for evento, esperado in zip(eventos, esperados, strict=True)
        ]
        for evento, esperado in zip(eventos, esperados, strict=True):
            if (evento.hash_etapa or "") != esperado:
                eventos_a_reparar.append(
                    EventoAReparar(lote.id, evento.id, evento.hash_etapa, esperado)
                )

        for qr in certificados_por_lote.get(lote.id, []):
            total_certificados += 1
            verificado = replace(lote)
            verificado.historial = corregidos
            verificado.certificado = qr
            raiz = servicio.hash_lote(verificado, hasta_emitido_en=True)
            if raiz == qr.hash_sha256:
                continue
            if corregidos:
                evento_id = corregidos[-1].id
                hash_anterior = eventos[-1].hash_etapa
                hash_nuevo = esperados[-1]
            else:
                # Un certificado sin eventos es imposible por la máquina de
                # estados; se deja una fila de bitácora con hashes vacíos.
                evento_id = uuid.UUID(int=0)
                hash_anterior = None
                hash_nuevo = ""
            certificados_a_reparar.append(
                CertificadoAReparar(
                    lote_id=lote.id,
                    certificado_id=qr.id,
                    evento_id=evento_id,
                    hash_evento_anterior=hash_anterior,
                    hash_evento_nuevo=hash_nuevo,
                    raiz_anterior=qr.hash_sha256,
                    raiz_nueva=raiz,
                )
            )

    return ReporteIntegridad(
        total_lotes=len(lotes),
        total_eventos=total_eventos,
        total_certificados=total_certificados,
        eventos_a_reparar=tuple(eventos_a_reparar),
        certificados_a_reparar=tuple(certificados_a_reparar),
        checksum=calcular_checksum(eventos_a_reparar, certificados_a_reparar),
    )


# ------------------------------------------------------------------ SQL


def _literal(valor: str) -> str:
    """Literal de texto SQL con comilla simple escapada."""
    return "'" + valor.replace("'", "''") + "'"


def _literal_o_null(valor: str | None) -> str:
    return "null" if valor is None else _literal(valor)


def _condicion_optimista(columna: str, anterior: str | None) -> str:
    """Condición que solo casa con el valor corrupto original (null incluido)."""
    if anterior is None:
        return f"{columna} is null"
    return f"{columna} = {_literal(anterior)}"


def _sufijo_seguro(sufijo: str) -> str:
    return re.sub(r"[^A-Za-z0-9_]", "_", sufijo)


def generar_sql_reparacion(
    reporte: ReporteIntegridad,
    *,
    operador: str,
    sufijo: str,
    lock_timeout: str = "5s",
    statement_timeout: str = "5min",
) -> str:
    """Genera el SQL transaccional de reparación. No lo ejecuta."""
    if not reporte.hay_diferencias:
        return "-- Nada que reparar: la cadena de eventos es íntegra.\n"

    etiqueta = _sufijo_seguro(sufijo)
    lineas: list[str] = [
        "-- =============================================================================",
        "-- BeanTrust · Reparación histórica de la cadena de eventos (migración 008)",
        "-- Generado por scripts/auditar_integridad_historica.py. NO se ejecuta solo:",
        "-- revísalo y córrelo en una ventana de mantenimiento.",
        f"-- operador: {operador}",
        f"-- checksum_reporte: {reporte.checksum}",
        f"-- eventos a reparar: {reporte.eventos_invalidos}",
        f"-- certificados a reparar: {reporte.certificados_invalidos}",
        "-- =============================================================================",
        "",
        "begin;",
        "",
        "-- (1) Guardas de tiempo ANTES del lock, para que lo limiten de verdad.",
        f"set local lock_timeout = {_literal(lock_timeout)};",
        f"set local statement_timeout = {_literal(statement_timeout)};",
        "",
        "-- (2) Backup lógico de las tres tablas.",
        f"create table app_private.backup_{etiqueta}_lotes as select * from public.lotes;",
        f"create table app_private.backup_{etiqueta}_lote_eventos as "
        "select * from public.lote_eventos;",
        f"create table app_private.backup_{etiqueta}_qr_certificado as "
        "select * from public.qr_certificado;",
        "",
        "-- (3) Bloqueo exclusivo durante la reparación.",
        "lock table public.lotes, public.lote_eventos, public.qr_certificado "
        "in access exclusive mode;",
        "",
        "-- (4) Desactivar los triggers append-only para poder corregir hashes.",
        "alter table public.lote_eventos disable trigger lote_eventos_no_update;",
        "alter table public.lote_eventos disable trigger lote_eventos_no_delete;",
        "",
        "-- (5) Corregir hash_etapa con condición optimista (solo si sigue corrupto).",
    ]

    for evento in reporte.eventos_a_reparar:
        lineas.extend(
            [
                "update public.lote_eventos",
                f"   set hash_etapa = {_literal(evento.hash_nuevo)}",
                f" where id = {_literal(str(evento.evento_id))} "
                f"and {_condicion_optimista('hash_etapa', evento.hash_anterior)};",
            ]
        )

    if reporte.certificados_a_reparar:
        lineas.append("")
        lineas.append(
            "-- (5b) Corregir la raíz de los certificados con condición optimista."
        )
        for certificado in reporte.certificados_a_reparar:
            lineas.extend(
                [
                    "update public.qr_certificado",
                    f"   set hash_sha256 = {_literal(certificado.raiz_nueva)}",
                    f" where id = {_literal(str(certificado.certificado_id))} "
                    f"and {_condicion_optimista('hash_sha256', certificado.raiz_anterior)};",
                ]
            )

    lineas.append("")
    lineas.append("-- (6) Bitácora de la reparación (hash/raíz anterior y nueva).")
    for evento in reporte.eventos_a_reparar:
        lineas.extend(
            [
                "insert into app_private.reparacion_cadena_evento",
                "  (lote_id, evento_id, hash_anterior, hash_nuevo, motivo, "
                "version_migracion, operador, checksum_reporte)",
                f"values ({_literal(str(evento.lote_id))}, {_literal(str(evento.evento_id))}, "
                f"{_literal_o_null(evento.hash_anterior)}, {_literal(evento.hash_nuevo)}, "
                f"{_literal(MOTIVO)}, {_literal(VERSION_MIGRACION)}, "
                f"{_literal(operador)}, {_literal(reporte.checksum)});",
            ]
        )
    for certificado in reporte.certificados_a_reparar:
        lineas.extend(
            [
                "insert into app_private.reparacion_cadena_evento",
                "  (lote_id, evento_id, hash_anterior, hash_nuevo, raiz_anterior, "
                "raiz_nueva, certificado_id, motivo, version_migracion, operador, "
                "checksum_reporte)",
                f"values ({_literal(str(certificado.lote_id))}, "
                f"{_literal(str(certificado.evento_id))}, "
                f"{_literal_o_null(certificado.hash_evento_anterior)}, "
                f"{_literal(certificado.hash_evento_nuevo)}, "
                f"{_literal(certificado.raiz_anterior)}, "
                f"{_literal(certificado.raiz_nueva)}, "
                f"{_literal(str(certificado.certificado_id))}, {_literal(MOTIVO)}, "
                f"{_literal(VERSION_MIGRACION)}, {_literal(operador)}, "
                f"{_literal(reporte.checksum)});",
            ]
        )

    lineas.extend(
        [
            "",
            "-- (7) Reactivar los triggers append-only.",
            "alter table public.lote_eventos enable trigger lote_eventos_no_update;",
            "alter table public.lote_eventos enable trigger lote_eventos_no_delete;",
            "",
            "commit;",
            "",
        ]
    )
    return "\n".join(lineas)


# ------------------------------------------------------------------ lectura BD


def _leer_todas(cliente: Any, tabla: str, orden: Sequence[str]) -> list[dict[str, Any]]:
    """Lee toda una tabla paginando (PostgREST corta en 1000 filas)."""
    filas: list[dict[str, Any]] = []
    offset = 0
    while True:
        consulta = cliente.table(tabla).select("*")
        for columna in orden:
            consulta = consulta.order(columna)
        respuesta = consulta.range(offset, offset + PAGINA - 1).execute()
        pagina = respuesta.data or []
        filas.extend(pagina)
        if len(pagina) < PAGINA:
            return filas
        offset += PAGINA


def cargar_y_auditar(cliente: Any, qr_service: QrService | None = None) -> ReporteIntegridad:
    """Lee las tres tablas y devuelve el reporte de integridad."""
    lotes = [fila_a_lote(fila) for fila in _leer_todas(cliente, "lotes", ("creado_en", "id"))]
    eventos_por_lote: dict[uuid.UUID, list[LoteEvento]] = {}
    for fila in _leer_todas(cliente, "lote_eventos", ("registrado_en", "id")):
        evento = fila_a_evento(fila)
        eventos_por_lote.setdefault(evento.lote_id, []).append(evento)
    certificados_por_lote: dict[uuid.UUID, list[CertificadoQR]] = {}
    for fila in _leer_todas(cliente, "qr_certificado", ("emitido_en", "id")):
        qr = fila_a_qr(fila)
        certificados_por_lote.setdefault(qr.lote_id, []).append(qr)
    return auditar_integridad(lotes, eventos_por_lote, certificados_por_lote, qr_service)


# ------------------------------------------------------------------ CLI


def _corto(hash_: str) -> str:
    return (hash_ or "")[:12] + "…" if hash_ else "(vacío)"


def _imprimir_reporte(reporte: ReporteIntegridad) -> None:
    print("BeanTrust · auditoría de integridad histórica")
    print(f"  lotes leídos:        {reporte.total_lotes} ({reporte.lotes_invalidos} inválidos)")
    print(
        f"  eventos leídos:      {reporte.total_eventos} "
        f"({reporte.eventos_invalidos} inválidos)"
    )
    print(
        f"  certificados leídos: {reporte.total_certificados} "
        f"({reporte.certificados_invalidos} inválidos)"
    )
    print(f"  checksum del reporte: {_corto(reporte.checksum)}")
    for evento in reporte.eventos_a_reparar[:10]:
        print(
            f"  - evento {evento.evento_id} lote {evento.lote_id}: "
            f"{_corto(evento.hash_anterior)} -> {_corto(evento.hash_nuevo)}"
        )
    for certificado in reporte.certificados_a_reparar[:10]:
        print(
            f"  - certificado {certificado.certificado_id} lote {certificado.lote_id}: "
            f"{_corto(certificado.raiz_anterior)} -> {_corto(certificado.raiz_nueva)}"
        )
    if not reporte.hay_diferencias:
        print("  OK: la cadena de eventos y las raíces de certificado son íntegras.")


def _construir_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Audita (solo lectura) la cadena de hashes histórica de BeanTrust y, "
            "opcionalmente, genera el SQL de reparación sin ejecutarlo."
        )
    )
    parser.add_argument("--url", default=os.environ.get("BEAN_SUPABASE_URL", ""))
    parser.add_argument("--service-key", default=os.environ.get("BEAN_SUPABASE_SERVICE_KEY", ""))
    parser.add_argument(
        "--generar-reparacion",
        metavar="RUTA",
        help="Escribe (sin ejecutar) el SQL de reparación en esa ruta.",
    )
    parser.add_argument("--operador", default=os.environ.get("USER", "beantrust"))
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _construir_parser().parse_args(argv)
    if not args.url or not args.service_key:
        raise SystemExit(
            "Faltan BEAN_SUPABASE_URL / BEAN_SUPABASE_SERVICE_KEY (o --url / --service-key)."
        )

    from supabase import create_client

    cliente = create_client(args.url, args.service_key)
    reporte = cargar_y_auditar(cliente)
    _imprimir_reporte(reporte)

    if args.generar_reparacion:
        sufijo = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        sql = generar_sql_reparacion(reporte, operador=args.operador, sufijo=sufijo)
        ruta = Path(args.generar_reparacion)
        ruta.write_text(sql, encoding="utf-8")
        print(f"  plan de reparación escrito en {ruta} (NO ejecutado).")

    return 1 if reporte.hay_diferencias else 0


if __name__ == "__main__":
    raise SystemExit(main())
