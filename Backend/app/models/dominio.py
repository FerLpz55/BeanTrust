"""Modelo de dominio de BeanTrust.

Núcleo de las reglas de negocio del café: estados, eventos y la máquina de
transiciones. El dominio NO conoce FastAPI, Supabase ni web3; depende solo de
la biblioteca estándar de Python (arquitectura §4 y §12).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from enum import StrEnum
from typing import ClassVar


def ahora_utc() -> datetime:
    """Timestamp UTC con zona horaria (nunca naive)."""
    return datetime.now(UTC)


class Estado(StrEnum):
    """Estados físicos por los que transita el lote (§4)."""

    CEREZA = "CEREZA"
    PERGAMINO = "PERGAMINO"
    ORO = "ORO"
    TOSTADO = "TOSTADO"
    VENDIDO = "VENDIDO"
    RECHAZADO = "RECHAZADO"


class TipoEvento(StrEnum):
    """Eventos que disparan una transición de estado (§4)."""

    COSECHA = "COSECHA"
    DESPULPADO = "DESPULPADO"
    DESCASCARADO = "DESCASCARADO"
    TOSTADO = "TOSTADO"
    VENTA = "VENTA"
    RECHAZADO = "RECHAZADO"


class Rol(StrEnum):
    """Roles de negocio de `USUARIOS.rol` (§10). El consumidor no tiene cuenta."""

    PRODUCTOR = "productor"
    COOPERATIVA = "cooperativa"
    COMPRADOR = "comprador"
    ADMIN = "admin"


class EstadoPago(StrEnum):
    """Ciclo de vida de un pago on-chain (§9)."""

    PENDIENTE = "PENDIENTE"
    CONFIRMADO = "CONFIRMADO"
    FALLIDO = "FALLIDO"


class ErrorDeDominio(Exception):
    """Base de errores de negocio. Se traduce a HTTP en el handler global."""

    status_code = 400

    def __init__(self, mensaje: str) -> None:
        super().__init__(mensaje)
        self.mensaje = mensaje


class LoteNoEncontrado(ErrorDeDominio):
    status_code = 404


class TransicionInvalida(ErrorDeDominio):
    status_code = 409


class MermaNegativa(ErrorDeDominio):
    status_code = 400


class EventoDuplicado(ErrorDeDominio):
    status_code = 409


class CertificadoNoEncontrado(ErrorDeDominio):
    status_code = 404


class CertificadoInvalido(ErrorDeDominio):
    status_code = 409


class CredencialesInvalidas(ErrorDeDominio):
    status_code = 401


class NoAutorizado(ErrorDeDominio):
    status_code = 403


class RepoError(ErrorDeDominio):
    """Error de infraestructura (BD/red). Se traduce a 500 sin detalles internos."""

    status_code = 500


@dataclass(frozen=True)
class LoteEvento:
    """Value object inmutable: la historia del lote jamás se reescribe (§4)."""

    id: uuid.UUID
    lote_id: uuid.UUID
    tipo: TipoEvento
    de_estado: Estado | None
    a_estado: Estado
    actor_id: uuid.UUID
    peso_kg: float | None = None
    merma_pct: float | None = None
    comprador_id: uuid.UUID | None = None
    registrado_en: datetime = field(default_factory=ahora_utc)


@dataclass(frozen=True)
class CertificadoQR:
    """Certificado de origen: solo `codigo` + `hash_sha256` (§8)."""

    id: uuid.UUID
    lote_id: uuid.UUID
    codigo: str
    hash_sha256: str
    emitido_en: datetime = field(default_factory=ahora_utc)


@dataclass
class Pago:
    """Pago justo 97% productor / 3% comisión de la cooperativa (§9)."""

    id: uuid.UUID
    lote_id: uuid.UUID
    cooperativa_id: uuid.UUID
    comprador_id: uuid.UUID
    monto_total: float
    comision_pct: float
    monto_productor: float
    estado_pago: EstadoPago = EstadoPago.PENDIENTE
    tx_hash: str | None = None
    idempotency_key: uuid.UUID | None = None
    creado_en: datetime = field(default_factory=ahora_utc)
    confirmado_en: datetime | None = None


@dataclass
class Finca:
    """Contexto de origen del lote (ERD §5)."""

    id: uuid.UUID
    productor_id: uuid.UUID
    cooperativa_id: uuid.UUID
    nombre: str
    municipio: str
    organica: bool = True
    altitud_min: float | None = None
    altitud_max: float | None = None


@dataclass
class Usuario:
    """Identidad central: `auth.uid()` es `USUARIOS.id` (§10)."""

    id: uuid.UUID
    email: str
    rol: Rol
    nombre: str
    password_hash: str | None = None


@dataclass
class Cooperativa:
    """Entidad de negocio de la cooperativa (tabla COOPERATIVA)."""

    id: uuid.UUID
    nombre: str
    rfc: str | None = None
    contacto: str | None = None
    municipio: str | None = None


class MaquinaEstados:
    """Mapa declarativo de transiciones permitidas (patrón State, §4).

    Solo se permite avanzar a estados adyacentes: no se puede saltar de
    CEREZA a ORO, ni retroceder después de TOSTADO, ni vender un lote que
    no esté tostado.
    """

    _TRANSICIONES: ClassVar[dict[tuple[Estado, TipoEvento], Estado]] = {
        (Estado.CEREZA, TipoEvento.DESPULPADO): Estado.PERGAMINO,
        (Estado.PERGAMINO, TipoEvento.DESCASCARADO): Estado.ORO,
        (Estado.ORO, TipoEvento.TOSTADO): Estado.TOSTADO,
        (Estado.TOSTADO, TipoEvento.VENTA): Estado.VENDIDO,
        (Estado.CEREZA, TipoEvento.RECHAZADO): Estado.RECHAZADO,
        (Estado.PERGAMINO, TipoEvento.RECHAZADO): Estado.RECHAZADO,
        (Estado.ORO, TipoEvento.RECHAZADO): Estado.RECHAZADO,
    }

    @classmethod
    def permitida(cls, de: Estado, tipo: TipoEvento) -> Estado | None:
        """Devuelve el estado destino si `(de, tipo)` es una transición válida."""
        return cls._TRANSICIONES.get((de, tipo))

    @classmethod
    def alcanzable(cls, de: Estado) -> set[Estado]:
        """Estados alcanzables de forma directa desde `de`."""
        return {destino for (origen, _), destino in cls._TRANSICIONES.items() if origen == de}


@dataclass
class Lote:
    """Aggregate root: única entidad que garantiza la consistencia (§4).

    Todo cambio de estado pasa por sus métodos; nunca se modifica por acceso
    directo a atributos.
    """

    id: uuid.UUID
    finca_id: uuid.UUID
    codigo_publico: str
    fecha_cosecha: date
    estado: Estado = Estado.CEREZA
    peso_actual_kg: float = 0.0
    creado_en: datetime = field(default_factory=ahora_utc)
    actualizado_en: datetime = field(default_factory=ahora_utc)
    historial: list[LoteEvento] = field(default_factory=list)
    certificado: CertificadoQR | None = None
    pago: Pago | None = None

    def registrar_cosecha(self, actor_id: uuid.UUID, peso_kg: float) -> LoteEvento:
        """Registra la cosecha inicial y crea el lote en estado CEREZA."""
        if self.historial:
            raise TransicionInvalida("El lote ya tiene una cosecha registrada.")
        if peso_kg <= 0:
            raise ErrorDeDominio("El peso de cosecha debe ser mayor que cero.")
        self.estado = Estado.CEREZA
        self.peso_actual_kg = peso_kg
        evento = LoteEvento(
            id=uuid.uuid4(),
            lote_id=self.id,
            tipo=TipoEvento.COSECHA,
            de_estado=None,
            a_estado=Estado.CEREZA,
            actor_id=actor_id,
            peso_kg=peso_kg,
        )
        self.historial.append(evento)
        self.actualizado_en = ahora_utc()
        return evento

    def avanzar(
        self,
        tipo: TipoEvento,
        actor_id: uuid.UUID,
        *,
        evento_id: uuid.UUID | None = None,
        peso_kg: float | None = None,
        merma_pct: float | None = None,
        comprador_id: uuid.UUID | None = None,
    ) -> LoteEvento:
        """Aplica una transición validada por la máquina de estados."""
        de = self.estado
        a = MaquinaEstados.permitida(de, tipo)
        if a is None:
            raise TransicionInvalida(
                f"No se puede pasar de {de.value} con el evento {tipo.value}."
            )
        if merma_pct is not None and merma_pct < 0:
            raise MermaNegativa("La merma no puede ser negativa.")
        if peso_kg is not None and peso_kg <= 0:
            raise ErrorDeDominio("El peso debe ser mayor que cero.")
        if tipo is TipoEvento.VENTA and comprador_id is None:
            raise ErrorDeDominio("El evento VENTA requiere un comprador.")

        self.estado = a
        if peso_kg is not None:
            self.peso_actual_kg = peso_kg
        evento = LoteEvento(
            id=evento_id or uuid.uuid4(),
            lote_id=self.id,
            tipo=tipo,
            de_estado=de,
            a_estado=a,
            actor_id=actor_id,
            peso_kg=peso_kg,
            merma_pct=merma_pct,
            comprador_id=comprador_id,
        )
        self.historial.append(evento)
        self.actualizado_en = ahora_utc()
        return evento

    def es_transicion_valida(self, destino: Estado) -> bool:
        """¿`destino` es alcanzable directamente desde el estado actual?"""
        return destino in MaquinaEstados.alcanzable(self.estado)

    def generar_certificado(self, certificado: CertificadoQR) -> None:
        """Vincula el certificado al lote (solo a partir de TOSTADO, §8)."""
        if self.estado not in (Estado.TOSTADO, Estado.VENDIDO):
            raise TransicionInvalida(
                "El certificado de origen solo se emite cuando el lote está tostado."
            )
        self.certificado = certificado
        self.actualizado_en = ahora_utc()

    def asociar_pago(self, pago: Pago) -> None:
        """Vincula el pago al lote (§9)."""
        self.pago = pago
        self.actualizado_en = ahora_utc()
