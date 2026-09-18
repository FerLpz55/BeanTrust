"""Operación del anclaje on-chain (ADR-11).

- `GET /v1/blockchain/reconciliar`: lo dispara Vercel Cron con
  `Authorization: Bearer <CRON_SECRET>`; responde `Cache-Control: no-store`.
- `POST /v1/blockchain/anclas/{lote_id}/reintentar`: reintento manual de un
  ancla FALLIDA, solo para administradores.

El worker nunca bloquea el QR: si el RPC falla, el trabajo se reprograma con
backoff exponencial y el Pasaporte sigue verificando off-chain.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response

from app.dependencies import TrazabilidadServiceDep, require_rol
from app.models.dominio import Rol
from app.schemas.anclaje import AnclajeOnchainRead, ReconciliarRead

router = APIRouter(prefix="/blockchain", tags=["blockchain"])


def _token_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    esquema, _, valor = authorization.partition(" ")
    if esquema.lower() != "bearer" or not valor:
        return None
    return valor


def _a_read(servicio, ancla) -> AnclajeOnchainRead:
    return AnclajeOnchainRead(
        estado=ancla.estado,
        chain_id=ancla.chain_id,
        red_nombre=servicio.red_nombre,
        contrato=ancla.contrato,
        tx_hash=ancla.tx_hash,
        bloque=ancla.bloque,
        hash_raiz=ancla.hash_raiz,
        explorer_url=servicio.explorer_url(ancla.tx_hash) if ancla.tx_hash else None,
        explorer_etiqueta=servicio.explorer_label,
        confirmada_en=ancla.confirmada_en,
    )


@router.get("/reconciliar", response_model=ReconciliarRead)
def reconciliar(
    servicio: TrazabilidadServiceDep,
    response: Response,
    authorization: Annotated[str | None, Header()] = None,
) -> ReconciliarRead:
    # El resultado de un pase es efímero: no se cachea en el borde de Vercel.
    response.headers["Cache-Control"] = "no-store"
    if servicio.habilitado and not servicio.validar_cron_secret(_token_bearer(authorization)):
        raise HTTPException(status_code=401, detail="cron_secret_invalido")
    resumen = servicio.reconciliar()
    return ReconciliarRead(
        habilitado=resumen.habilitado,
        worker_adquirido=resumen.worker_adquirido,
        procesadas=resumen.procesadas,
        enviadas=resumen.enviadas,
        confirmadas=resumen.confirmadas,
        reconciliadas=resumen.reconciliadas,
        reprogramadas=resumen.reprogramadas,
        fallidas=resumen.fallidas,
    )


@router.post("/anclas/{lote_id}/reintentar", response_model=AnclajeOnchainRead)
def reintentar(
    lote_id: uuid.UUID,
    servicio: TrazabilidadServiceDep,
    _admin: Annotated[object, Depends(require_rol(Rol.ADMIN))],
) -> AnclajeOnchainRead:
    if not servicio.habilitado:
        raise HTTPException(status_code=409, detail="web3_disabled")
    ancla = servicio.reintentar(lote_id)
    return _a_read(servicio, ancla)
