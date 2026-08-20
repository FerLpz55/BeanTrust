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
    """Eventos que disparan una transición de estado (§4).

    Cadena completa con autotransiciones para sub-etapas.
    """

    COSECHA = "COSECHA"
    LIMPIEZA = "LIMPIEZA"
    DESPULPADO = "DESPULPADO"
    FERMENTACION = "FERMENTACION"
    LAVADO = "LAVADO"
    SECADO = "SECADO"
    REPOSO = "REPOSO"
    DESCASCARADO = "DESCASCARADO"
    CLASIFICACION = "CLASIFICACION"
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


class EstadoPropina(StrEnum):
    """Ciclo de vida de una propina al productor (ADR-10). Bivalente off-chain/on-chain."""

    REGISTRADA = "REGISTRADA"
    PENDIENTE = "PENDIENTE"
    CONFIRMADA = "CONFIRMADA"


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
    """Value object inmutable: la historia del lote jamás se reescribe (§4).

    Incluye campos por etapa (ADR-12) y `hash_etapa` para la cadena lineal (ADR-11).
    """

    id: uuid.UUID
    lote_id: uuid.UUID
    tipo: TipoEvento
    de_estado: Estado | None
    a_estado: Estado
    actor_id: uuid.UUID
    peso_kg: float | None = None
    merma_pct: float | None = None
    comprador_id: uuid.UUID | None = None
    # Campos por sub-etapa (ADR-12)
    metodo_beneficiado: str | None = None  # DESPULPADO: lavado/semilavado/honey/natural
    metodo_fermentacion: str | None = None  # DESPULPADO/FERMENTACION
    fermentacion_horas: float | None = None  # FERMENTACION
    humedad_inicial_pct: float | None = None  # SECADO
    humedad_final_pct: float | None = None  # SECADO
    metodo_secado: str | None = None  # SECADO
    dias_reposo: float | None = None  # REPOSO
    puntaje_sca: float | None = None  # CLASIFICACION
    defectos: str | None = None  # CLASIFICACION
    densidad: float | None = None  # CLASIFICACION
    tamiz: str | None = None  # CLASIFICACION
    # Hash por etapa (ADR-11): cadena lineal hash_etapa[i] = HASH(hash_etapa[i-1] || datos)
    hash_etapa: str | None = None
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
class Propina:
    """Propina del comprador al productor (ADR-10): 100% directa, idempotente, bivalente."""

    id: uuid.UUID
    lote_id: uuid.UUID
    comprador_id: uuid.UUID
    productor_id: uuid.UUID
    monto: float
    moneda: str = "MXN"
    estado_propina: EstadoPropina = EstadoPropina.REGISTRADA
    clave_idempotencia: str | None = None
    tx_hash: str | None = None
    creado_en: datetime = field(default_factory=ahora_utc)
    actualizado_en: datetime = field(default_factory=ahora_utc)

    def confirmar(self) -> None:
        self.estado_propina = EstadoPropina.CONFIRMADA
        self.actualizado_en = ahora_utc()


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

    Estados (hitos): CEREZA → PERGAMINO → ORO → TOSTADO → VENDIDO (+ RECHAZADO).
    Sub-etapas registradas como AUTOTRANSICIONES (de_estado == a_estado):
    - LIMPIEZA (CEREZA→CEREZA)
    - FERMENTACION, LAVADO, SECADO, REPOSO (PERGAMINO→PERGAMINO)
    - CLASIFICACION (ORO→ORO)
    
    No se puede saltar hitos. No hay retroceso tras TOSTADO. RECHAZADO es absorbente.
    """

    _TRANSICIONES: ClassVar[dict[tuple[Estado, TipoEvento], Estado]] = {
        # Hito CEREZA
        (Estado.CEREZA, TipoEvento.LIMPIEZA): Estado.CEREZA,           # autotransición
        (Estado.CEREZA, TipoEvento.DESPULPADO): Estado.PERGAMINO,
        # Hito PERGAMINO
        (Estado.PERGAMINO, TipoEvento.FERMENTACION): Estado.PERGAMINO,  # autotransición
        (Estado.PERGAMINO, TipoEvento.LAVADO): Estado.PERGAMINO,        # autotransición
        (Estado.PERGAMINO, TipoEvento.SECADO): Estado.PERGAMINO,        # autotransición
        (Estado.PERGAMINO, TipoEvento.REPOSO): Estado.PERGAMINO,        # autotransición
        (Estado.PERGAMINO, TipoEvento.DESCASCARADO): Estado.ORO,
        # Hito ORO
        (Estado.ORO, TipoEvento.CLASIFICACION): Estado.ORO,             # autotransición
        (Estado.ORO, TipoEvento.TOSTADO): Estado.TOSTADO,
        # Hito TOSTADO
        (Estado.TOSTADO, TipoEvento.VENTA): Estado.VENDIDO,
        # Rechazo (absorbente desde cualquier estado no terminal)
        (Estado.CEREZA, TipoEvento.RECHAZADO): Estado.RECHAZADO,
        (Estado.PERGAMINO, TipoEvento.RECHAZADO): Estado.RECHAZADO,
        (Estado.ORO, TipoEvento.RECHAZADO): Estado.RECHAZADO,
        (Estado.TOSTADO, TipoEvento.RECHAZADO): Estado.RECHAZADO,
        (Estado.VENDIDO, TipoEvento.RECHAZADO): Estado.RECHAZADO,
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
    # Nuevos campos enriquecidos (ADR-12, ADR-14)
    variedad: str | None = None
    metodo_beneficiado: str | None = None  # lavado/semilavado/honey/natural
    evidencia_url: str | None = None
    evidencia_sha256: str | None = None
    creado_en: datetime = field(default_factory=ahora_utc)
    actualizado_en: datetime = field(default_factory=ahora_utc)
    historial: list[LoteEvento] = field(default_factory=list)
    certificado: CertificadoQR | None = None
    pago: Pago | None = None
    propinas: list[Propina] = field(default_factory=list)

    def registrar_cosecha(
        self,
        actor_id: uuid.UUID,
        peso_kg: float,
        *,
        variedad: str | None = None,
        metodo_beneficiado: str | None = None,
        evidencia_url: str | None = None,
        evidencia_sha256: str | None = None,
    ) -> LoteEvento:
        """Registra la cosecha inicial y crea el lote en estado CEREZA."""
        if self.historial:
            raise TransicionInvalida("El lote ya tiene una cosecha registrada.")
        if peso_kg <= 0:
            raise ErrorDeDominio("El peso de cosecha debe ser mayor que cero.")
        self.estado = Estado.CEREZA
        self.peso_actual_kg = peso_kg
        self.variedad = variedad
        self.metodo_beneficiado = metodo_beneficiado
        self.evidencia_url = evidencia_url
        self.evidencia_sha256 = evidencia_sha256
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

    def _calcular_hash_etapa(self, evento: LoteEvento) -> str:
        """Calcula el hash de la etapa en la cadena lineal (ADR-11).

        hash_i = SHA256(hash_{i-1} || datos_evento)
        El orden es por registrado_en, id. Si no hay etapa anterior, usa hash vacío.
        """
        import hashlib
        import json

        # Obtener el hash anterior (última etapa registrada)
        hash_anterior = ""
        if self.historial:
            # La historia ya está ordenada por registrado_en
            ultima_etapa = self.historial[-1]
            hash_anterior = ultima_etapa.hash_etapa or ""

        # Serializar los datos del evento de forma determinista
        payload = {
            "tipo": evento.tipo.value,
            "de_estado": evento.de_estado.value if evento.de_estado else None,
            "a_estado": evento.a_estado.value,
            "actor_id": str(evento.actor_id),
            "peso_kg": evento.peso_kg,
            "merma_pct": evento.merma_pct,
            "metodo_beneficiado": evento.metodo_beneficiado,
            "metodo_fermentacion": evento.metodo_fermentacion,
            "fermentacion_horas": evento.fermentacion_horas,
            "humedad_inicial_pct": evento.humedad_inicial_pct,
            "humedad_final_pct": evento.humedad_final_pct,
            "metodo_secado": evento.metodo_secado,
            "dias_reposo": evento.dias_reposo,
            "puntaje_sca": evento.puntaje_sca,
            "defectos": evento.defectos,
            "densidad": evento.densidad,
            "tamiz": evento.tamiz,
            "comprador_id": str(evento.comprador_id) if evento.comprador_id else None,
            "registrado_en": evento.registrado_en.isoformat(),
        }
        datos = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
        return hashlib.sha256((hash_anterior + datos).encode("utf-8")).hexdigest()

    def avanzar(
        self,
        tipo: TipoEvento,
        actor_id: uuid.UUID,
        *,
        evento_id: uuid.UUID | None = None,
        peso_kg: float | None = None,
        merma_pct: float | None = None,
        comprador_id: uuid.UUID | None = None,
        # Campos por sub-etapa (ADR-12)
        metodo_beneficiado: str | None = None,
        metodo_fermentacion: str | None = None,
        fermentacion_horas: float | None = None,
        humedad_inicial_pct: float | None = None,
        humedad_final_pct: float | None = None,
        metodo_secado: str | None = None,
        dias_reposo: float | None = None,
        puntaje_sca: float | None = None,
        defectos: str | None = None,
        densidad: float | None = None,
        tamiz: str | None = None,
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
        # Crear evento temporal para calcular hash
        evento_temp = LoteEvento(
            id=evento_id or uuid.uuid4(),
            lote_id=self.id,
            tipo=tipo,
            de_estado=de,
            a_estado=a,
            actor_id=actor_id,
            peso_kg=peso_kg,
            merma_pct=merma_pct,
            comprador_id=comprador_id,
            metodo_beneficiado=metodo_beneficiado,
            metodo_fermentacion=metodo_fermentacion,
            fermentacion_horas=fermentacion_horas,
            humedad_inicial_pct=humedad_inicial_pct,
            humedad_final_pct=humedad_final_pct,
            metodo_secado=metodo_secado,
            dias_reposo=dias_reposo,
            puntaje_sca=puntaje_sca,
            defectos=defectos,
            densidad=densidad,
            tamiz=tamiz,
        )
        # Calcular hash_etapa (cadena lineal, ADR-11) ANTES de crear el objeto final
        hash_etapa = self._calcular_hash_etapa(evento_temp)
        # Crear el evento final con el hash ya calculado
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
            metodo_beneficiado=metodo_beneficiado,
            metodo_fermentacion=metodo_fermentacion,
            fermentacion_horas=fermentacion_horas,
            humedad_inicial_pct=humedad_inicial_pct,
            humedad_final_pct=humedad_final_pct,
            metodo_secado=metodo_secado,
            dias_reposo=dias_reposo,
            puntaje_sca=puntaje_sca,
            defectos=defectos,
            densidad=densidad,
            tamiz=tamiz,
            hash_etapa=hash_etapa,
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

    def asociar_propina(self, propina: Propina) -> None:
        """Vincula la propina al lote (ADR-10)."""
        self.propinas.append(propina)
        self.actualizado_en = ahora_utc()
