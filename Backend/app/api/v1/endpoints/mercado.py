"""Panel Comercio Justo (§9, ADR-9). Proyección de solo lectura.

No existe `POST /mercado`: la app nunca escribe el mercado (ADR-9). La
autorización por tenant vive en la capa de servicio.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.dependencies import CurrentUserDep, MercadoServiceDep
from app.schemas.pago import MercadoLoteRead

router = APIRouter(prefix="/mercado", tags=["mercado"])


@router.get("/{lote_id}")
def panel_comercio_justo(
    lote_id: uuid.UUID, usuario: CurrentUserDep, servicio: MercadoServiceDep
) -> MercadoLoteRead:
    """Desglose 97/3 del lote + propinas (dueños del lote: §10)."""
    return MercadoLoteRead(**servicio.panel_lote(usuario, lote_id))
