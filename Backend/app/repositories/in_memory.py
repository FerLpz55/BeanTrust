"""Repositorios en memoria para desarrollo y tests (sin infraestructura).

El almacén es un único objeto compartido (`Memoria`) para que el estado
persista entre requests en modo dev. Los tests lo reemplazan con instancias
frescas vía `dependency_overrides`.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from app.models.dominio import (
    CertificadoQR,
    Cooperativa,
    EventoDuplicado,
    Finca,
    Lote,
    LoteEvento,
    Pago,
    Usuario,
)
from app.utils.cursor import Cursor


@dataclass
class Memoria:
    """Estado compartido de los repositorios en memoria."""

    lotes: dict[uuid.UUID, Lote] = field(default_factory=dict)
    eventos: dict[uuid.UUID, LoteEvento] = field(default_factory=dict)
    qr: dict[str, CertificadoQR] = field(default_factory=dict)
    pagos: dict[uuid.UUID, Pago] = field(default_factory=dict)
    pagos_idempotencia: dict[uuid.UUID, Pago] = field(default_factory=dict)
    fincas: dict[uuid.UUID, Finca] = field(default_factory=dict)
    usuarios: dict[uuid.UUID, Usuario] = field(default_factory=dict)
    verificaciones: list[tuple[uuid.UUID, str | None]] = field(default_factory=list)


class InMemoryLoteRepo:
    def __init__(self, memoria: Memoria) -> None:
        self._memoria = memoria

    def guardar(self, lote: Lote) -> Lote:
        self._memoria.lotes[lote.id] = lote
        return lote

    def buscar_por_id(self, lote_id: uuid.UUID) -> Lote | None:
        return self._memoria.lotes.get(lote_id)

    def buscar_por_codigo(self, codigo: str) -> Lote | None:
        for lote in self._memoria.lotes.values():
            if lote.codigo_publico == codigo:
                return lote
        return None

    def listar(self, cursor: Cursor | None, limit: int) -> tuple[list[Lote], Cursor | None]:
        ordenados = sorted(
            self._memoria.lotes.values(),
            key=lambda lote: (lote.creado_en, lote.id),
            reverse=True,
        )
        pagina: list[Lote] = []
        for lote in ordenados:
            if cursor is not None and (lote.creado_en, lote.id) >= (cursor.ts, cursor.id):
                continue
            pagina.append(lote)
            if len(pagina) == limit:
                break
        siguiente: Cursor | None = None
        if len(pagina) == limit and len(ordenados) > limit:
            ultimo = pagina[-1]
            siguiente = Cursor(id=ultimo.id, ts=ultimo.creado_en)
        return pagina, siguiente

    def adjuntar_evento(self, evento: LoteEvento) -> None:
        if evento.id in self._memoria.eventos:
            raise EventoDuplicado("El evento ya fue registrado (clave de idempotencia repetida).")
        self._memoria.eventos[evento.id] = evento
        lote = self._memoria.lotes.get(evento.lote_id)
        if lote is not None and evento not in lote.historial:
            lote.historial.append(evento)

    def listar_eventos(self, lote_id: uuid.UUID) -> list[LoteEvento]:
        lote = self._memoria.lotes.get(lote_id)
        return sorted(lote.historial, key=lambda e: e.registrado_en) if lote else []


class InMemoryQRRepo:
    def __init__(self, memoria: Memoria) -> None:
        self._memoria = memoria

    def guardar_certificado(self, qr: CertificadoQR) -> CertificadoQR:
        self._memoria.qr[qr.codigo] = qr
        return qr

    def buscar_por_codigo(self, codigo: str) -> CertificadoQR | None:
        return self._memoria.qr.get(codigo)

    def registrar_verificacion(self, lote_id: uuid.UUID, dispositivo: str | None) -> None:
        self._memoria.verificaciones.append((lote_id, dispositivo))


class InMemoryPagoRepo:
    def __init__(self, memoria: Memoria) -> None:
        self._memoria = memoria

    def guardar_pago(self, pago: Pago) -> Pago:
        self._memoria.pagos[pago.id] = pago
        if pago.idempotency_key is not None:
            self._memoria.pagos_idempotencia[pago.idempotency_key] = pago
        return pago

    def buscar_por_lote(self, lote_id: uuid.UUID) -> Pago | None:
        for pago in self._memoria.pagos.values():
            if pago.lote_id == lote_id:
                return pago
        return None

    def buscar_por_idempotencia(self, clave: uuid.UUID) -> Pago | None:
        return self._memoria.pagos_idempotencia.get(clave)


class InMemoryFincaRepo:
    def __init__(self, memoria: Memoria) -> None:
        self._memoria = memoria

    def buscar_por_id(self, finca_id: uuid.UUID) -> Finca | None:
        return self._memoria.fincas.get(finca_id)


class InMemoryUsuarioRepo:
    def __init__(self, memoria: Memoria) -> None:
        self._memoria = memoria

    def buscar_por_id(self, usuario_id: uuid.UUID) -> Usuario | None:
        return self._memoria.usuarios.get(usuario_id)

    def buscar_por_email(self, email: str) -> Usuario | None:
        for usuario in self._memoria.usuarios.values():
            if usuario.email == email:
                return usuario
        return None

    def listar_cooperativas(self) -> list[Cooperativa]:
        return [
            Cooperativa(id=usuario.id, nombre=usuario.nombre)
            for usuario in self._memoria.usuarios.values()
            if usuario.rol.value == "cooperativa"
        ]


class FakeGatewayPagos:
    """Gateway de desarrollo: tx determinista y confirmación simulada.

    La integración real con Polygon (web3.py) está documentada en
    `docs/06-contratos.md` y en pausa hasta retomar la sección de contratos.
    """

    def emitir_pago(self, pago: Pago) -> str:
        return "0x" + pago.id.hex

    def confirmar_pago(self, tx_hash: str) -> bool:
        return bool(tx_hash)
