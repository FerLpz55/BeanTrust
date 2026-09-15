"""Verificación pública del Pasaporte de Café (§8). Sin autenticación.

Respuestas: 200 lote válido (Pasaporte enriquecido), 404 código inexistente,
409 certificado manipulado (el hash no coincide con el historial del lote).
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.dependencies import PublicLoteServiceDep
from app.schemas.verificacion import VerificarRead

router = APIRouter(prefix="/verificar", tags=["verificacion"])


@router.get("/{codigo}")
def verificar(codigo: str, request: Request, servicio: PublicLoteServiceDep) -> VerificarRead:
    dispositivo = request.client.host if request.client else None
    lote, qr, finca, productor = servicio.verificar(codigo, dispositivo=dispositivo)
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
    )
