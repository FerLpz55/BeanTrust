"""Interfaces de acceso a datos (inversión de dependencias, §4).

El dominio y los servicios hablan SOLO contra estas interfaces; Supabase y el
web3 son detalles de infraestructura. `lote_eventos` es append-only: el
repositorio no expone update/delete de eventos (§4, §6, §12).
"""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Protocol, runtime_checkable

from app.models.dominio import (
    AnclaBlockchain,
    AnclaOnchain,
    CertificadoQR,
    Cooperativa,
    Finca,
    Lote,
    LoteEvento,
    Pago,
    Propina,
    ReciboAncla,
    TransaccionPreparada,
    Usuario,
)
from app.utils.cursor import Cursor


@runtime_checkable
class RepositorioLote(Protocol):
    def guardar(self, lote: Lote) -> Lote: ...

    def buscar_por_id(self, lote_id: uuid.UUID) -> Lote | None: ...

    def buscar_por_codigo(self, codigo: str) -> Lote | None: ...

    def listar(self, cursor: Cursor | None, limit: int) -> tuple[list[Lote], Cursor | None]: ...

    def adjuntar_evento(self, evento: LoteEvento) -> None: ...

    def listar_eventos(self, lote_id: uuid.UUID) -> list[LoteEvento]: ...

    def registrar_cosecha_con_evidencia(
        self,
        lote: Lote,
        evento: LoteEvento,
        evidencia_id: uuid.UUID,
        adjuntada_en: datetime,
    ) -> Lote:
        """Persiste lote + evento génesis y adjunta la evidencia en una sola transacción.

        El `hash_etapa` ya viene calculado por el dominio: el repositorio jamás lo
        recalcula ni acepta url/sha del cliente (ADR-14).
        """
        ...


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

    def listar_por_cooperativa(
        self, cooperativa_id: uuid.UUID, cursor: Cursor | None, limit: int
    ) -> tuple[list[Pago], Cursor | None]: ...

    def total_confirmado_por_productor(self, productor_id: uuid.UUID) -> float: ...


@runtime_checkable
class RepositorioPropina(Protocol):
    def guardar_propina(self, propina: Propina) -> Propina: ...

    def buscar_por_lote(self, lote_id: uuid.UUID) -> list[Propina]: ...

    def buscar_por_idempotencia(self, clave: str) -> Propina | None: ...

    def buscar_por_productor(
        self, productor_id: uuid.UUID, cursor: Cursor | None, limit: int
    ) -> tuple[list[Propina], Cursor | None]: ...

    def buscar_por_comprador(
        self, comprador_id: uuid.UUID, cursor: Cursor | None, limit: int
    ) -> tuple[list[Propina], Cursor | None]: ...

    def total_confirmado_por_productor(self, productor_id: uuid.UUID) -> float: ...


@runtime_checkable
class RepositorioFinca(Protocol):
    def buscar_por_id(self, finca_id: uuid.UUID) -> Finca | None: ...

    def listar_por_productor(self, productor_id: uuid.UUID) -> list[Finca]: ...

    def listar_por_cooperativa(self, cooperativa_id: uuid.UUID) -> list[Finca]: ...

    def listar_todas(self) -> list[Finca]: ...

    def guardar(self, finca: Finca) -> Finca: ...


@runtime_checkable
class RepositorioUsuario(Protocol):
    def buscar_por_id(self, usuario_id: uuid.UUID) -> Usuario | None: ...

    def buscar_por_email(self, email: str) -> Usuario | None: ...

    def guardar(self, usuario: Usuario) -> Usuario: ...

    def listar_cooperativas(self) -> list[Cooperativa]: ...

    def listar_compradores(self) -> list[Usuario]: ...


class GatewayPagos(ABC):
    """Frontera con Polygon (§9). La implementación web3 real está en pausa."""

    @abstractmethod
    def emitir_pago(self, pago: Pago) -> str:
        """Dispara el pago on-chain y devuelve el tx_hash."""

    @abstractmethod
    def confirmar_pago(self, tx_hash: str) -> bool:
        """Revisa si el tx se confirmó (poller)."""


@runtime_checkable
class RepositorioAnclas(Protocol):
    """Persistencia del anclaje con lease global y token de fencing (012).

    La tabla no tiene grants para `anon`/`authenticated`: solo el backend
    (`service_role`) la administra. Toda transición exige el `lock_token` activo.
    """

    def encolar(self, ancla: AnclaBlockchain) -> AnclaBlockchain: ...

    def buscar_por_certificado(self, qr_id: uuid.UUID) -> AnclaBlockchain | None: ...

    def buscar_por_lote(self, lote_id: uuid.UUID) -> AnclaBlockchain | None: ...

    def adquirir_lock(self, nombre: str, lease_segundos: int) -> uuid.UUID | None:
        """Toma el lease global del worker; `None` si otro lo tiene vigente."""

    def renovar_lock(self, nombre: str, token: uuid.UUID, lease_segundos: int) -> bool: ...

    def liberar_lock(self, nombre: str, token: uuid.UUID) -> bool: ...

    def reclamar_siguiente(
        self, nombre: str, lock_token: uuid.UUID, lease_segundos: int
    ) -> AnclaBlockchain | None:
        """Toma atómicamente el siguiente trabajo listo y lo marca con el token.

        Solo reclama si el lease global sigue vivo con el mismo nombre y token
        (fencing): un worker vencido no puede reclamar trabajo.
        """

    def marcar_enviando(
        self, ancla_id: uuid.UUID, lock_token: uuid.UUID, nonce: int, tx_hash: str
    ) -> None:
        """Persiste `ENVIANDO + nonce + tx_hash` ANTES del broadcast."""

    def marcar_enviada(
        self,
        ancla_id: uuid.UUID,
        lock_token: uuid.UUID,
        tx_hash: str,
        enviada_en: datetime,
    ) -> None: ...

    def marcar_confirmada(
        self,
        ancla_id: uuid.UUID,
        lock_token: uuid.UUID,
        bloque: int,
        tx_hash: str,
        confirmada_en: datetime,
    ) -> None: ...

    def marcar_fallida(
        self,
        ancla_id: uuid.UUID,
        lock_token: uuid.UUID,
        codigo: str,
        error: str,
        proximo_intento: datetime,
    ) -> None: ...

    def reprogramar(
        self,
        ancla_id: uuid.UUID,
        lock_token: uuid.UUID,
        proximo_intento: datetime,
        codigo: str,
        error: str,
        contar_intento: bool = True,
    ) -> None: ...

    def marcar_reintento_manual(self, ancla_id: uuid.UUID, proximo_intento: datetime) -> None: ...


class GatewayTrazabilidad(ABC):
    """Frontera con el contrato de anclaje (Base Sepolia, ADR-11).

    Separa el anclaje del Pasaporte de `GatewayPagos` (que sigue simulado). La
    implementación real usa `web3.py`; la fake permite dev/tests sin cadena.
    """

    @property
    @abstractmethod
    def chain_id(self) -> int: ...

    @property
    @abstractmethod
    def contrato(self) -> str: ...

    @property
    @abstractmethod
    def code_hash(self) -> str: ...

    @abstractmethod
    def preflight(self) -> None:
        """Valida cadena, bytecode, huella del runtime y `ANCHOR_ROLE`.

        Errores de configuración se clasifican como permanentes: no se firma ni
        se gasta gas. No se ejecuta en `GET /v1/verificar`.
        """

    @abstractmethod
    def leer_ancla(self, lote_id_bytes32: str) -> AnclaOnchain | None:
        """`getAnchor(loteId)`; `None` si el lote aún no está anclado.

        Solo detecta un anclaje previo: nunca basta para marcar CONFIRMADA.
        """

    @abstractmethod
    def buscar_ancla_por_evento(
        self, lote_id_bytes32: str, hash_raiz_bytes32: str, desde_bloque: int
    ) -> ReciboAncla | None:
        """Busca `HashAnchored(loteId, hashRaiz)` en logs desde `desde_bloque`.

        Permite recuperar una tx transmitida cuyo `tx_hash` no se persistió.
        """

    @abstractmethod
    def reservar_nonce(self) -> int:
        """`eth_getTransactionCount(account, "pending")` de la wallet caliente."""

    @abstractmethod
    def preparar_ancla(
        self, lote_id_bytes32: str, hash_raiz_bytes32: str, nonce: int
    ) -> TransaccionPreparada:
        """Estima gas, aplica la política de tarifas y firma en memoria.

        No transmite: un fallo aquí (saldo, tarifa, estimación) deja la fila en
        su estado previo, nunca en `ENVIANDO` con transmisión incierta.
        """

    @abstractmethod
    def transmitir_ancla(self, transaccion: TransaccionPreparada) -> str:
        """Difunde la transacción firmada; devuelve el `tx_hash` normalizado."""

    @abstractmethod
    def confirmar_ancla(
        self, tx_hash: str, lote_id_bytes32: str, hash_raiz_bytes32: str
    ) -> ReciboAncla | None:
        """Valida remitente, contrato, recibo, evento y confirmaciones.

        Devuelve `None` mientras falten confirmaciones; lanza un error permanente
        si el contenido no coincide.
        """
