"""Rate limit compartido (defensa contra fuerza bruta, A07).

Dos implementaciones detrás del mismo protocolo:
- `InMemoryRateLimitRepo`: ventana deslizante en memoria (desarrollo/CI).
- `SupabaseRateLimitRepo`: delega en `public.bean_consume_rate_limit(...)`, que
  guarda el contador en `app_private.rate_limit_bucket`. Así el límite es
  compartido entre instancias y sobrevive a un reinicio del backend.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from typing import Protocol, runtime_checkable


@runtime_checkable
class RepositorioRateLimit(Protocol):
    """Consume una unidad del cubo `key_hash`. `True` si permite la petición."""

    def consumir(self, key_hash: str, limite: int, ventana_s: int) -> bool: ...


class InMemoryRateLimitRepo:
    """Ventana deslizante por clave. Thread-safe (un solo proceso)."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def consumir(self, key_hash: str, limite: int, ventana_s: int) -> bool:
        ahora = time.monotonic()
        with self._lock:
            cola = self._hits.setdefault(key_hash, deque())
            while cola and ahora - cola[0] > ventana_s:
                cola.popleft()
            if len(cola) >= limite:
                return False
            cola.append(ahora)
            return True


class SupabaseRateLimitRepo:
    """Rate limit atómico en Postgres vía RPC `bean_consume_rate_limit`."""

    def __init__(self, cliente) -> None:
        self._cliente = cliente

    def consumir(self, key_hash: str, limite: int, ventana_s: int) -> bool:
        respuesta = self._cliente.rpc(
            "bean_consume_rate_limit",
            {
                "p_key_hash": key_hash,
                "p_limit": limite,
                "p_window_seconds": ventana_s,
            },
        ).execute()
        return bool(respuesta.data)
