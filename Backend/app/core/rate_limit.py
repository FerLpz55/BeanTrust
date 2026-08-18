"""Rate limiting simple en memoria (defensa contra fuerza bruta, A07).

En desarrollo/CI es suficiente; en producción con múltiples instancias se debe
delegar a un límite compartido (gateway/Redis) — mejora documentada, no deuda.
"""

from __future__ import annotations

import threading
import time
from collections import deque


class RateLimiter:
    """Ventana deslizante por clave (IP/email). Thread-safe."""

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self._max = max_requests
        self._window = window_seconds
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def permite(self, clave: str) -> bool:
        ahora = time.monotonic()
        with self._lock:
            cola = self._hits.setdefault(clave, deque())
            while cola and ahora - cola[0] > self._window:
                cola.popleft()
            if len(cola) >= self._max:
                return False
            cola.append(ahora)
            return True