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
    def __init__(
        self,
        repo_propina,
        repo_lote,
        repo_finca,
        repo_usuario,
        repo_pago,
        gateway,
        repo_propina_sistema=None,
    ) -> None:
        self._repo_propina = repo_propina
        self._repo_lote = repo_lote
        self._repo_finca = repo_finca
        self._repo_usuario = repo_usuario
        self._repo_pago = repo_pago
        self._gateway = gateway
        # La confirmación simula el poller on-chain: es una tarea de sistema, no
        # del comprador (que no tiene UPDATE sobre `propina`), así que usa el
        # cliente de servicio. En memoria coincide con el repo normal.
        self._repo_propina_sistema = repo_propina_sistema or repo_propina

    def _autorizar_propina(self, usuario: CurrentUser, lote) -> None:
        """Solo el comprador (o admin) puede dar propina en un lote vendido."""
        if usuario.rol is Rol.ADMIN:
            return
        if usuario.rol is not Rol.COMPRADOR:
            raise NoAutorizado("Solo los compradores pueden dar propinas.")
        if lote.estado.value != "VENDIDO":
            raise TransicionInvalida("Solo se puede dar propina en lotes vendidos.")
        # El comprador no puede leer `lote_eventos` (RLS), así que la venta se
        # comprueba por el `pago` del lote, que sí puede leer (§10).
        pago = self._repo_pago.buscar_por_lote(lote.id)
        if pago is None:
            raise TransicionInvalida("El lote no tiene una venta registrada.")
        if pago.comprador_id != usuario.id:
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
            if usuario.rol is not Rol.ADMIN and existente.comprador_id != usuario.id:
                raise NoAutorizado("Esta clave de idempotencia pertenece a otro comprador.")
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
        # La propina vive en su propia tabla (fuente de verdad); `lote.propinas`
        # es una vista en memoria y el comprador no tiene escritura sobre `lotes`
        # (RLS), así que no se persiste el lote.
        lote.asociar_propina(propina)
        return propina

    def autorizar_lectura_lote(self, usuario: CurrentUser, lote_id: uuid.UUID):
        """Valida que el usuario sea dueño del lote y devuelve `(lote, finca)`.

        Regla única de tenant para las lecturas de comercio justo (matriz RLS,
        ADR-10): admin, productor de la finca, cooperativa de la finca o el
        comprador de la venta. La reusa el Panel Comercio Justo (ADR-9) para no
        duplicar la autorización.
        """
        lote = self._repo_lote.buscar_por_id(lote_id)
        if lote is None:
            raise LoteNoEncontrado("Lote no encontrado.")
        finca = self._repo_finca.buscar_por_id(lote.finca_id)

        if usuario.rol is Rol.ADMIN:
            return lote, finca
        if usuario.rol is Rol.PRODUCTOR and finca and finca.productor_id == usuario.id:
            return lote, finca
        if usuario.rol is Rol.COOPERATIVA and finca and finca.cooperativa_id == usuario.id:
            return lote, finca
        if usuario.rol is Rol.COMPRADOR:
            # El comprador no lee `lote_eventos`; la venta se resuelve por el
            # `pago` del lote (que sí puede leer, matriz §10).
            pago = self._repo_pago.buscar_por_lote(lote.id)
            if pago is not None and pago.comprador_id == usuario.id:
                return lote, finca
        raise NoAutorizado("No tiene acceso a la información de este lote.")

    def listar_propinas_lote(self, usuario: CurrentUser, lote_id: uuid.UUID) -> list[Propina]:
        """Lista propinas de un lote validando el tenant (matriz RLS de ADR-10)."""
        self.autorizar_lectura_lote(usuario, lote_id)
        return self._repo_propina.buscar_por_lote(lote_id)

    def confirmar_propina(self, lote_id: uuid.UUID) -> Propina:
        """Simula el poller de confirmación (REGISTRADA -> CONFIRMADA)."""
        propinas = self._repo_propina_sistema.buscar_por_lote(lote_id)
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
        self._repo_propina_sistema.guardar_propina(propina)
        return propina

    def obtener_saldo_productor(self, usuario: CurrentUser) -> dict:
        """Saldo del productor: 97% de ventas confirmadas + propinas confirmadas.

        La agregación vive en los repositorios (§12: el servicio no recorre
        estructuras internas del almacén).
        """
        if usuario.rol is not Rol.PRODUCTOR and usuario.rol is not Rol.ADMIN:
            raise NoAutorizado("Solo el productor o admin pueden ver el saldo.")

        total_pagos = self._repo_pago.total_confirmado_por_productor(usuario.id)
        total_propinas = self._repo_propina.total_confirmado_por_productor(usuario.id)

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
