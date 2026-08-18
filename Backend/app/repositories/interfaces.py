"""Interfaces de acceso a datos (inversión de dependencias, §4).

El dominio y los servicios hablan SOLO contra estas interfaces; Supabase y el
web3 son detalles de infraestructura. `lote_eventos` es append-only: el
repositorio no expone update/delete de eventos (§4, §6, §12).
"""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from typing import Protocol, runtime_checkable

from app.models.dominio import CertificadoQR, Cooperativa, Finca, Lote, LoteEvento, Pago, Usuario
from app.utils.cursor import Cursor


@runtime_checkable
class RepositorioLote(Protocol):
    def guardar(self, lote: Lote) -> Lote: ...

    def buscar_por_id(self, lote_id: uuid.UUID) -> Lote | None: ...

    def buscar_por_codigo(self, codigo: str) -> Lote | None: ...

    def listar(self, cursor: Cursor | None, limit: int) -> tuple[list[Lote], Cursor | None]: ...

    def adjuntar_evento(self, evento: LoteEvento) -> None: ...

    def listar_eventos(self, lote_id: uuid.UUID) -> list[LoteEvento]: ...


@runtime_checkable
class RepositorioQR(Protocol):
    def guardar_certificado(self, qr: CertificadoQR) -> CertificadoQR: ...

    def buscar_por_codigo(self, codigo: str) -> CertificadoQR | None: ...

    def registrar_verificacion(self, lote_id: uuid.UUID, dispositivo: str | None) -> None: ...


@runtime_checkable
class RepositorioPago(Protocol):
    def guardar_pago(self, pago: Pago) -> Pago: ...

    def buscar_por_lote(self, lote_id: uuid.UUID) -> Pago | None: ...

    def buscar_por_idempotencia(self, clave: uuid.UUID) -> Pago | None: ...


@runtime_checkable
class RepositorioFinca(Protocol):
    def buscar_por_id(self, finca_id: uuid.UUID) -> Finca | None: ...


@runtime_checkable
class RepositorioUsuario(Protocol):
    def buscar_por_id(self, usuario_id: uuid.UUID) -> Usuario | None: ...

    def buscar_por_email(self, email: str) -> Usuario | None: ...

    def listar_cooperativas(self) -> list[Cooperativa]: ...


class GatewayPagos(ABC):
    """Frontera con Polygon (§9). La implementación web3 real está en pausa."""

    @abstractmethod
    def emitir_pago(self, pago: Pago) -> str:
        """Dispara el pago on-chain y devuelve el tx_hash."""

    @abstractmethod
    def confirmar_pago(self, tx_hash: str) -> bool:
        """Revisa si el tx se confirmó (poller)."""
