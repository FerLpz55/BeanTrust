"""Endpoints de pagos (§9). Rol cooperativa; idempotentes por `Idempotency-Key`."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import CurrentUserDep, IdempotenciaDep, PagoServiceDep, require_rol
from app.models.dominio import Rol
from app.schemas.pago import PagoCreate, PagoRead

router = APIRouter(
    prefix="/pagos",
    tags=["pagos"],
    dependencies=[Depends(require_rol(Rol.COOPERATIVA))],
)


@router.post("", status_code=202)
def registrar_pago(
    body: PagoCreate,
    idempotencia: IdempotenciaDep,
    usuario: CurrentUserDep,
    servicio: PagoServiceDep,
) -> PagoRead:
    return servicio.registrar_venta(
        usuario,
        lote_id=body.lote_id,
        comprador_id=body.comprador_id,
        monto_total=body.monto_total,
        idempotencia=idempotencia,
    )
