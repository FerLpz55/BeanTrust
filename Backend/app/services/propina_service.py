"""Servicio de propinas al productor (ADR-10).

Orquesta la propina del comprador al productor: 100% directa, idempotente,
bivalente off-chain/on-chain. El poller real que escucha `TipSent` en
Polygon está en pausa; el gateway fake permite confirmar en desarrollo.
"""

from __future__ import annotations

import uuid

from app.models.dominio import (
    EstadoPropina,
    LoteNoEncontrado,
    NoAutorizado,
    Propina,
    Rol,
    TransicionInvalida,
)
from app.schemas.auth import CurrentUser


class PropinaService:
    def __init__(self, repo_propina, repo_lote, repo_finca, repo_usuario, gateway) -> None:
        self._repo_propina = repo_propina
        self._repo_lote = repo_lote
        self._repo_finca = repo_finca
        self._repo_usuario = repo_usuario
        self._gateway = gateway

    def _autorizar_propina(self, usuario: CurrentUser, lote) -> None:
        """Solo el comprador (o admin) puede dar propina en un lote vendido."""
        if usuario.rol is Rol.ADMIN:
            return
        if usuario.rol is not Rol.COMPRADOR:
            raise NoAutorizado("Solo los compradores pueden dar propinas.")
        if lote.estado.value != "VENDIDO":
            raise TransicionInvalida("Solo se puede dar propina en lotes vendidos.")
        # Verificar que el comprador sea el que compró el lote
        evento_venta = next(
            (e for e in lote.historial if e.tipo.value == "VENTA"), None
        )
        if evento_venta and evento_venta.comprador_id != usuario.id:
            raise NoAutorizado("No es el comprador de este lote.")

    def registrar_propina(
        self,
        usuario: CurrentUser,
        *,
        lote_id: uuid.UUID,
        monto: float,
        moneda: str,
        idempotencia: uuid.UUID,
    ) -> Propina:
        # Verificar idempotencia
        clave = str(idempotencia)
        existente = self._repo_propina.buscar_por_idempotencia(clave)
        if existente is not None:
            return existente

        lote = self._repo_lote.buscar_por_id(lote_id)
        if lote is None:
            raise LoteNoEncontrado("Lote no encontrado.")
        self._autorizar_propina(usuario, lote)

        # Obtener el productor del lote
        finca = self._repo_finca.buscar_por_id(lote.finca_id)
        if finca is None:
            raise LoteNoEncontrado("Finca del lote no encontrada.")
        productor_id = finca.productor_id

        propina = Propina(
            id=uuid.uuid4(),
            lote_id=lote.id,
            comprador_id=usuario.id,
            productor_id=productor_id,
            monto=round(monto, 2),
            moneda=moneda,
            estado_propina=EstadoPropina.REGISTRADA,
            clave_idempotencia=clave,
        )
        # Emitir on-chain (gateway fake en desarrollo)
        propina.tx_hash = self._gateway.emitir_pago(propina)
        self._repo_propina.guardar_propina(propina)
        lote.asociar_propina(propina)
        self._repo_lote.guardar(lote)
        return propina

    def confirmar_propina(self, lote_id: uuid.UUID) -> Propina:
        """Simula el poller de confirmación (REGISTRADA -> CONFIRMADA)."""
        propinas = self._repo_propina.buscar_por_lote(lote_id)
        if not propinas:
            raise LoteNoEncontrado("No existe una propina para este lote.")
        propina = propinas[0]  # Tomar la primera (más reciente)
        if propina.estado_propina is EstadoPropina.CONFIRMADA:
            return propina
        if not propina.tx_hash:
            raise TransicionInvalida("La propina no tiene hash de transacción.")
        propina.estado_propina = (
            EstadoPropina.CONFIRMADA
            if self._gateway.confirmar_pago(propina.tx_hash)
            else EstadoPropina.REGISTRADA
        )
        if propina.estado_propina is EstadoPropina.CONFIRMADA:
            propina.confirmar()
        self._repo_propina.guardar_propina(propina)
        return propina

    def obtener_saldo_productor(self, usuario: CurrentUser) -> dict:
        """Obtiene el saldo total del productor (pagos + propinas confirmadas)."""
        if usuario.rol is not Rol.PRODUCTOR and usuario.rol is not Rol.ADMIN:
            raise NoAutorizado("Solo el productor o admin pueden ver el saldo.")

        # En implementación real, usar consultas optimizadas
        # Aquí implementación simplificada para memoria
        total_pagos = 0.0
        total_propinas = 0.0

        if hasattr(self._repo_pago, "_memoria"):
            for pago in self._repo_pago._memoria.pagos.values():
                lote = self._repo_lote.buscar_por_id(pago.lote_id)
                if lote:
                    finca = self._repo_finca.buscar_por_id(lote.finca_id)
                    es_su_finca = finca and finca.productor_id == usuario.id
                    esta_confirmado = pago.estado_pago.value == "CONFIRMADO"
                    if es_su_finca and esta_confirmado:
                        total_pagos += pago.monto_productor

        if hasattr(self._repo_propina, "_memoria"):
            for propina in self._repo_propina._memoria.propinas.values():
                es_propia = propina.productor_id == usuario.id
                es_confirmada = propina.estado_propina.value == "CONFIRMADA"
                if es_propia and es_confirmada:
                    total_propinas += propina.monto

        return {
            "saldo_total": round(total_pagos + total_propinas, 2),
            "total_pagos": round(total_pagos, 2),
            "total_propinas": round(total_propinas, 2),
            "moneda": "MXN",
        }

    def listar_propinas_productor(self, usuario: CurrentUser, cursor=None, limit: int = 20):
        """Lista propinas recibidas por el productor."""
        if usuario.rol is not Rol.PRODUCTOR and usuario.rol is not Rol.ADMIN:
            raise NoAutorizado("Solo el productor o admin pueden ver sus propinas.")
        return self._repo_propina.buscar_por_productor(usuario.id, cursor, limit)

    def listar_propinas_comprador(self, usuario: CurrentUser, cursor=None, limit: int = 20):
        """Lista propinas dadas por el comprador."""
        if usuario.rol is not Rol.COMPRADOR and usuario.rol is not Rol.ADMIN:
            raise NoAutorizado("Solo el comprador o admin pueden ver sus propinas.")
        return self._repo_propina.buscar_por_comprador(usuario.id, cursor, limit)