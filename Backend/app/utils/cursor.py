"""Codificación/decodificación del cursor de paginación (base64url).

El cursor codifica `{"id": <uuid>, "ts": <iso8601>}` y las páginas se ordenan
por `(registrado_en, id)` descendente, evitando `OFFSET` (§6).
"""

from __future__ import annotations

import base64
import json
import uuid
from dataclasses import dataclass
from datetime import datetime

from app.models.dominio import ErrorDeDominio


@dataclass(frozen=True)
class Cursor:
    id: uuid.UUID
    ts: datetime


def codificar_cursor(identificador: uuid.UUID, ts: datetime) -> str:
    payload = json.dumps(
        {"id": str(identificador), "ts": ts.isoformat()},
        separators=(",", ":"),
    ).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii")


def decodificar_cursor(cursor: str) -> Cursor | None:
    """Decodifica un cursor; devuelve None si no viene. Cursor inválido → 400."""
    if cursor is None:
        return None
    try:
        datos = json.loads(base64.urlsafe_b64decode(cursor.encode("ascii")))
        ts = datetime.fromisoformat(datos["ts"])
        return Cursor(id=uuid.UUID(datos["id"]), ts=ts)
    except (ValueError, KeyError, TypeError) as exc:
        raise ErrorDeDominio("Cursor de paginación inválido.") from exc
