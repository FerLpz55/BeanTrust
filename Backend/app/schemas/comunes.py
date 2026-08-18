"""Schemas Pydantic (fronteras de entrada/salida de la API, §6).

El dominio nunca recibe `dict` desnudos: todo lo que cruza la frontera pasa
por estos modelos. Las lecturas (`*Read`) usan `from_attributes=True` para
serializar los dataclasses de dominio y filtrar campos internos.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Pagina[T](BaseModel):
    """Respuesta paginada por cursor (§6)."""

    items: list[T]
    next_cursor: str | None = None
