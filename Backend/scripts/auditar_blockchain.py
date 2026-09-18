#!/usr/bin/env python3
"""Auditoría READ-ONLY de la cola de anclaje (ADR-11).

No muta nada: solo lee `blockchain_anclas`, `qr_certificado` y los locks del
worker, y reporta lo que el operador necesita antes/después de activar la
wallet caliente.

    - conteo por estado;
    - lote canario más antiguo (candidato a la primera transmisión);
    - filas con formato inválido (tx_hash, lote_id_bytes32, hash_raiz);
    - locks vencidos;
    - duplicados (tx_hash y qr_certificado_id);
    - total de filas.

Uso:  cd Backend && .venv/bin/python scripts/auditar_blockchain.py
Sale con 0 si la cola es consistente y != 0 si encuentra anomalías.
"""

from __future__ import annotations

import re
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings

_RE_BYTES32 = re.compile(r"^0x[0-9a-f]{64}$")
_ESTADOS = ("PENDIENTE", "ENVIANDO", "ENVIADA", "CONFIRMADA", "FALLIDA")


def _cliente(settings: Settings):
    if not settings.supabase_url or not settings.supabase_service_key:
        print("[FALLA] Faltan BEAN_SUPABASE_URL y BEAN_SUPABASE_SERVICE_KEY.")
        raise SystemExit(2)
    from supabase import create_client

    return create_client(settings.supabase_url, settings.supabase_service_key)


def _filas(cliente, tabla: str, columnas: str = "*", schema: str = "public") -> list[dict]:
    return cliente.schema(schema).table(tabla).select(columnas).execute().data or []


def main() -> int:
    settings = Settings()
    cliente = _cliente(settings)

    filas = _filas(
        cliente,
        "blockchain_anclas",
        "id,lote_id,qr_certificado_id,estado,tx_hash,lote_id_bytes32,hash_raiz,creado_en,lock_token,lock_hasta",
    )
    print(f"total anclas: {len(filas)}")

    conteo = Counter(fila["estado"] for fila in filas)
    for estado in _ESTADOS:
        print(f"  {estado}: {conteo.get(estado, 0)}")

    pendientes = sorted(
        (f for f in filas if f["estado"] == "PENDIENTE"),
        key=lambda f: f["creado_en"],
    )
    if pendientes:
        canario = pendientes[0]
        print(f"canario más antiguo: {canario['lote_id']} (creado {canario['creado_en']})")
    else:
        print("canario más antiguo: (no hay PENDIENTE)")

    invalidos = []
    for fila in filas:
        tx = fila.get("tx_hash")
        if tx is not None and not _RE_BYTES32.match(tx):
            invalidos.append((fila["id"], "tx_hash", tx))
        for campo in ("lote_id_bytes32", "hash_raiz"):
            valor = fila.get(campo) or ""
            if not _RE_BYTES32.match(valor):
                invalidos.append((fila["id"], campo, valor))
    print(f"filas con formato inválido: {len(invalidos)}")
    for ancla_id, campo, valor in invalidos:
        print(f"  {ancla_id}: {campo}={valor!r}")

    ahora = datetime.now(UTC)
    vencidos = [
        fila["id"]
        for fila in filas
        if fila.get("lock_token")
        and fila.get("lock_hasta")
        and _parsear(fila["lock_hasta"]) < ahora
    ]
    print(f"locks vencidos en anclas: {len(vencidos)}")

    duplicados = []
    for campo in ("tx_hash", "qr_certificado_id"):
        vistos = Counter(f.get(campo) for f in filas if f.get(campo))
        duplicados.extend(
            (campo, valor, n) for valor, n in vistos.items() if n > 1
        )
    print(f"duplicados: {len(duplicados)}")
    for campo, valor, n in duplicados:
        print(f"  {campo}={valor} x{n}")

    try:
        locks = _filas(
            cliente, "blockchain_worker_locks", "*", schema="app_private"
        )
    except Exception as exc:
        print(f"locks del worker: no consultables ({type(exc).__name__})")
        locks = []
    locks_vencidos = [
        lock["nombre"]
        for lock in locks
        if lock.get("lock_token")
        and lock.get("lock_hasta")
        and _parsear(lock["lock_hasta"]) < ahora
    ]
    print(f"locks del worker vencidos: {len(locks_vencidos)} {locks_vencidos}")

    anomalias = bool(invalidos or duplicados)
    print("resultado: " + ("ANOMALÍAS" if anomalias else "OK"))
    return 1 if anomalias else 0


def _parsear(valor: str) -> datetime:
    texto = valor.replace("Z", "+00:00")
    fecha = datetime.fromisoformat(texto)
    return fecha if fecha.tzinfo else fecha.replace(tzinfo=UTC)


if __name__ == "__main__":
    raise SystemExit(main())
