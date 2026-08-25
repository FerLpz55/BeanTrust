"""Servicio de pagos on-chain (§9).

Orquesta la venta del lote (VENDIDO) con el disparo del pago: retiene 3% de
comisión, envía 97% al productor y registra `PENDIENTE`. El poller real que
escucha `PaymentPaid` en Polygon está en pausa (docs/06-contratos.md); el
gateway fake permite confirmar en desarrollo y en los tests E2E.
"""

from __future__ import annotations

import uuid

from app.models.dominio import (
    EstadoPago,
    LoteNoEncontrado,
    NoAutorizado,
    Pago,
    Rol,
    TipoEvento,
    TransicionInvalida,
    ahora_utc,
)
from app.schemas.auth import CurrentUser
from app.utils.cursor import Cursor


class PagoService:
    COMISION_PCT = 3.0

    def __init__(self, repo_pago, repo_lote, repo_finca, gateway) -> None:
        self._repo_pago = repo_pago
        self._repo_lote = repo_lote
        self._repo_finca = repo_finca
        self._gateway = gateway

    def _autorizar_venta(self, usuario: CurrentUser, lote) -> None:
        """Solo la cooperativa dueña de la finca (o admin) puede vender el lote."""
        if usuario.rol is Rol.ADMIN:
            return
        finca = self._repo_finca.buscar_por_id(lote.finca_id)
        if finca is None or finca.cooperativa_id != usuario.id:
            raise NoAutorizado("No tiene acceso a este lote.")

    def registrar_venta(
        self,
        usuario: CurrentUser,
        *,
        lote_id: uuid.UUID,
        comprador_id: uuid.UUID,
        monto_total: float,
        idempotencia: uuid.UUID,
    ) -> Pago:
        existente = self._repo_pago.buscar_por_idempotencia(idempotencia)
        if existente is not None:
            if usuario.rol is not Rol.ADMIN and existente.cooperativa_id != usuario.id:
                raise NoAutorizado("Esta clave de idempotencia pertenece a otra cooperativa.")
            return existente

        lote = self._repo_lote.buscar_por_id(lote_id)
        if lote is None:
            raise LoteNoEncontrado("Lote no encontrado.")
        self._autorizar_venta(usuario, lote)

        evento = lote.avanzar(
            tipo=TipoEvento.VENTA,
            actor_id=usuario.id,
            evento_id=idempotencia,
            comprador_id=comprador_id,
        )
        monto_productor = round(monto_total * (1 - self.COMISION_PCT / 100), 2)
        pago = Pago(
            id=uuid.uuid4(),
            lote_id=lote.id,
            cooperativa_id=usuario.id,
            comprador_id=comprador_id,
            monto_total=round(monto_total, 2),
            comision_pct=self.COMISION_PCT,
            monto_productor=monto_productor,
            estado_pago=EstadoPago.PENDIENTE,
            idempotency_key=idempotencia,
        )
        pago.tx_hash = self._gateway.emitir_pago(pago)
        # Orden importante (trigger 003 de Supabase): el pago debe existir
        # ANTES de insertar el evento VENTA, o la venta fallaría.
        self._repo_pago.guardar_pago(pago)
        self._repo_lote.adjuntar_evento(evento)
        lote.asociar_pago(pago)
        self._repo_lote.guardar(lote)
        return pago

    def listar(
        self, usuario: CurrentUser, cursor: Cursor | None, limit: int
    ) -> tuple[list[Pago], Cursor | None]:
        """Historial de pagos de la cooperativa autenticada (§10).

        El tenant sale del usuario autenticado, nunca de un id del cliente.
        """
        if usuario.rol is Rol.COOPERATIVA:
            return self._repo_pago.listar_por_cooperativa(usuario.id, cursor, limit)
        raise NoAutorizado("Solo la cooperativa puede consultar su historial de pagos.")

    def confirmar_venta(self, lote_id: uuid.UUID) -> Pago:
        """Simula el poller de confirmación (PENDIENTE -> CONFIRMADO/FALLIDO)."""
        pago = self._repo_pago.buscar_por_lote(lote_id)
        if pago is None:
            raise LoteNoEncontrado("No existe un pago para este lote.")
        if pago.estado_pago is EstadoPago.CONFIRMADO:
            return pago
        if not pago.tx_hash:
            raise TransicionInvalida("El pago no tiene hash de transacción.")
        pago.estado_pago = (
            EstadoPago.CONFIRMADO
            if self._gateway.confirmar_pago(pago.tx_hash)
            else EstadoPago.FALLIDO
        )
        if pago.estado_pago is EstadoPago.CONFIRMADO:
            pago.confirmado_en = ahora_utc()
        self._repo_pago.guardar_pago(pago)
        return pago
