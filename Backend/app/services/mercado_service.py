"""Panel Comercio Justo: proyección de solo lectura (ADR-9, §9).

El mercado NO se escribe desde el cliente: se materializa aquí a partir de
`LOTE`, `PAGO` y `PROPINA`. La autorización por tenant se delega en
`PropinaService.autorizar_lectura_lote` (regla única, ADR-10).

Todo el dinero es simulado por `FakeGatewayPagos` — web3 en pausa (B7).
"""

from __future__ import annotations

import uuid

from app.models.dominio import LoteNoEncontrado
from app.schemas.auth import CurrentUser


class MercadoService:
    def __init__(self, repo_pago, repo_propina, repo_usuario, propina_service) -> None:
        self._repo_pago = repo_pago
        self._repo_propina = repo_propina
        self._repo_usuario = repo_usuario
        self._propinas = propina_service

    def panel_lote(self, usuario: CurrentUser, lote_id: uuid.UUID) -> dict:
        """Desglose 97/3 del lote + propinas, para los dueños del lote."""
        lote, finca = self._propinas.autorizar_lectura_lote(usuario, lote_id)

        pago = self._repo_pago.buscar_por_lote(lote_id)
        if pago is None:
            raise LoteNoEncontrado("El lote todavía no tiene una venta registrada.")

        propinas = self._repo_propina.buscar_por_lote(lote_id)
        productor = (
            self._repo_usuario.buscar_por_id(finca.productor_id) if finca else None
        )
        return {
            "lote_id": lote.id,
            "codigo_publico": lote.codigo_publico,
            "variedad": lote.variedad,
            "metodo_beneficiado": lote.metodo_beneficiado,
            "peso_actual_kg": lote.peso_actual_kg,
            "monto_total": pago.monto_total,
            "comision_pct": pago.comision_pct,
            "monto_productor": pago.monto_productor,
            "monto_plataforma": round(pago.monto_total - pago.monto_productor, 2),
            "estado_pago": pago.estado_pago,
            "total_propinas": round(sum(p.monto for p in propinas), 2),
            "propinas": propinas,
            "productor_nombre": productor.nombre if productor else None,
            "finca_nombre": finca.nombre if finca else None,
            "finca_municipio": finca.municipio if finca else None,
        }
