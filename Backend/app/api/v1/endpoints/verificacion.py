"""Verificación pública del Pasaporte de Café (§8). Sin autenticación.

Respuestas: 200 lote válido (Pasaporte enriquecido), 404 código inexistente,
409 certificado manipulado (el hash no coincide con el historial del lote).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request

from app.dependencies import PublicLoteServiceDep, TrazabilidadServiceDep
from app.schemas.anclaje import AnclajeOnchainRead
from app.schemas.verificacion import VerificarRead

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/verificar", tags=["verificacion"])


@router.get("/{codigo}")
def verificar(
    codigo: str,
    request: Request,
    servicio: PublicLoteServiceDep,
    trazabilidad: TrazabilidadServiceDep,
) -> VerificarRead:
    dispositivo = request.client.host if request.client else None
    lote, qr, finca, productor = servicio.verificar(codigo, dispositivo=dispositivo)

    # El anclaje on-chain es informativo: si la BD/cadena falla, el Pasaporte
    # sigue verificando igual (la integridad se recalcula off-chain).
    anclaje: AnclajeOnchainRead | None = None
    try:
        ancla = trazabilidad.estado_publico(lote.id)
        if ancla is not None:
            anclaje = AnclajeOnchainRead(
                estado=ancla.estado,
                chain_id=ancla.chain_id,
                red_nombre=trazabilidad.red_nombre,
                contrato=ancla.contrato,
                tx_hash=ancla.tx_hash,
                bloque=ancla.bloque,
                hash_raiz=ancla.hash_raiz,
                explorer_url=(
                    trazabilidad.explorer_url(ancla.tx_hash) if ancla.tx_hash else None
                ),
                explorer_etiqueta=trazabilidad.explorer_label,
                confirmada_en=ancla.confirmada_en,
            )
    except Exception:
        logger.exception("No se pudo leer el anclaje on-chain del lote %s", lote.id)

    return VerificarRead(
        codigo=qr.codigo,
        lote_id=lote.id,
        estado=lote.estado,
        fecha_cosecha=lote.fecha_cosecha,
        finca_id=lote.finca_id,
        peso_actual_kg=lote.peso_actual_kg,
        hash_sha256=qr.hash_sha256,
        emitido_en=qr.emitido_en,
        historial=lote.historial,
        # Datos enriquecidos del Pasaporte de Café
        variedad=lote.variedad,
        metodo_beneficiado=lote.metodo_beneficiado,
        altitud_min=finca.altitud_min if finca else None,
        altitud_max=finca.altitud_max if finca else None,
        humedad_final_pct=next(
            (e.humedad_final_pct for e in reversed(lote.historial)
             if e.humedad_final_pct is not None), None
        ),
        puntaje_sca=next(
            (e.puntaje_sca for e in reversed(lote.historial)
             if e.puntaje_sca is not None), None
        ),
        productor_nombre=productor.nombre if productor else None,
        finca_nombre=finca.nombre if finca else None,
        municipio=finca.municipio if finca else None,
        organica=finca.organica if finca else None,
        anclaje_onchain=anclaje,
    )
