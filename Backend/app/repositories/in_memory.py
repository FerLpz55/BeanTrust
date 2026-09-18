"""Repositorios en memoria para desarrollo y tests (sin infraestructura).

El almacén es un único objeto compartido (`Memoria`) para que el estado
persista entre requests en modo dev. Los tests lo reemplazan con instancias
frescas vía `dependency_overrides`.
"""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from app.models.dominio import (
    AnclaBlockchain,
    AnclaOnchain,
    CertificadoQR,
    Cooperativa,
    ErrorAnclajePermanente,
    ErrorAnclajeTransitorio,
    EstadoAncla,
    EstadoEvidencia,
    EstadoPago,
    EstadoPropina,
    EventoDuplicado,
    Evidencia,
    EvidenciaNoEncontrada,
    EvidenciaYaAdjunta,
    FencingPerdido,
    Finca,
    Lote,
    LoteEvento,
    NoAutorizado,
    Pago,
    Propina,
    ReciboAncla,
    TipoEvento,
    TransaccionPreparada,
    Usuario,
)
from app.repositories.sesiones import SesionRefresh
from app.utils.cursor import Cursor


def _paginar[T](
    registros: list[T], cursor: Cursor | None, limit: int
) -> tuple[list[T], Cursor | None]:
    """Pagina por cursor descendente sobre `(creado_en, id)` (§6).

    Compartido por los repos en memoria para no repetir el recorrido en cada
    listado (propinas por productor/comprador, pagos por cooperativa).
    """
    registros.sort(key=lambda r: (r.creado_en, r.id), reverse=True)
    pagina: list[T] = []
    for registro in registros:
        if cursor is not None and (registro.creado_en, registro.id) >= (cursor.ts, cursor.id):
            continue
        pagina.append(registro)
        if len(pagina) == limit:
            break
    siguiente: Cursor | None = None
    if len(pagina) == limit and len(registros) > limit:
        ultimo = pagina[-1]
        siguiente = Cursor(id=ultimo.id, ts=ultimo.creado_en)
    return pagina, siguiente


@dataclass
class Memoria:
    """Estado compartido de los repositorios en memoria."""

    lotes: dict[uuid.UUID, Lote] = field(default_factory=dict)
    eventos: dict[uuid.UUID, LoteEvento] = field(default_factory=dict)
    qr: dict[str, CertificadoQR] = field(default_factory=dict)
    pagos: dict[uuid.UUID, Pago] = field(default_factory=dict)
    pagos_idempotencia: dict[uuid.UUID, Pago] = field(default_factory=dict)
    propinas: dict[uuid.UUID, Propina] = field(default_factory=dict)
    propinas_idempotencia: dict[str, Propina] = field(default_factory=dict)
    fincas: dict[uuid.UUID, Finca] = field(default_factory=dict)
    usuarios: dict[uuid.UUID, Usuario] = field(default_factory=dict)
    evidencias: dict[uuid.UUID, Evidencia] = field(default_factory=dict)
    anclas: dict[uuid.UUID, AnclaBlockchain] = field(default_factory=dict)
    anclas_locks: dict[str, dict] = field(default_factory=dict)
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

    def registrar_cosecha_con_evidencia(
        self,
        lote: Lote,
        evento: LoteEvento,
        evidencia_id: uuid.UUID,
        adjuntada_en: datetime,
    ) -> Lote:
        """Alta atómica de lote + evidencia (espejo del RPC de la migración 008).

        Valida tenencia y estado de la evidencia, y en el reintento solo acepta
        un lote idéntico (mismo hash génesis). El `hash_etapa` ya lo trae
        `evento`: aquí no se recalcula nada.
        """
        evidencia = self._memoria.evidencias.get(evidencia_id)
        if evidencia is None:
            raise EvidenciaNoEncontrada("La evidencia no existe.")
        if (
            evidencia.uploader_id != evento.actor_id
            or evidencia.finca_id != lote.finca_id
            or evidencia.lote_id != lote.id
        ):
            raise NoAutorizado("La evidencia no corresponde a este lote.")

        existente = self._memoria.lotes.get(lote.id)
        if existente is not None:
            # Idempotencia por datos ESTABLES, no por hash: el `hash_etapa`
            # incluye `registrado_en`, que cambia en cada reintento. Espeja la
            # rama de replay de la RPC (migración 010).
            genesis = next(
                (e for e in existente.historial if e.tipo is TipoEvento.COSECHA),
                None,
            )
            adjunta = self._buscar_adjunta(existente.id)
            if (
                existente.finca_id == lote.finca_id
                and existente.fecha_cosecha == lote.fecha_cosecha
                and existente.variedad == lote.variedad
                and existente.metodo_beneficiado == lote.metodo_beneficiado
                and genesis is not None
                and genesis.peso_kg == evento.peso_kg
                and genesis.actor_id == evento.actor_id
                and (adjunta is None or adjunta.id == evidencia_id)
            ):
                if evidencia.estado is EstadoEvidencia.PENDIENTE:
                    evidencia.estado = EstadoEvidencia.ADJUNTA
                    evidencia.adjuntada_en = adjuntada_en
                return existente
            raise EvidenciaYaAdjunta("El lote ya existe con datos distintos.")

        if evidencia.estado is not EstadoEvidencia.PENDIENTE:
            raise EvidenciaYaAdjunta("La evidencia no está disponible para adjuntar.")

        lote.evidencia_url = evidencia.storage_key
        lote.evidencia_sha256 = evidencia.sha256
        self._memoria.lotes[lote.id] = lote
        self._memoria.eventos[evento.id] = evento
        if evento not in lote.historial:
            lote.historial.append(evento)
        evidencia.estado = EstadoEvidencia.ADJUNTA
        evidencia.adjuntada_en = adjuntada_en
        return lote

    def _buscar_adjunta(self, lote_id: uuid.UUID) -> Evidencia | None:
        for evidencia in self._memoria.evidencias.values():
            if evidencia.lote_id == lote_id and evidencia.estado is EstadoEvidencia.ADJUNTA:
                return evidencia
        return None


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

    def listar_por_cooperativa(
        self, cooperativa_id: uuid.UUID, cursor: Cursor | None, limit: int
    ) -> tuple[list[Pago], Cursor | None]:
        pagos = [p for p in self._memoria.pagos.values() if p.cooperativa_id == cooperativa_id]
        return _paginar(pagos, cursor, limit)

    def total_confirmado_por_productor(self, productor_id: uuid.UUID) -> float:
        """Suma el 97% de las ventas confirmadas de los lotes del productor.

        El vínculo pago → productor pasa por `lote.finca_id`; la agregación vive
        en el repositorio para que el servicio no recorra estructuras internas.
        """
        fincas = {
            f.id for f in self._memoria.fincas.values() if f.productor_id == productor_id
        }
        total = 0.0
        for pago in self._memoria.pagos.values():
            if pago.estado_pago is not EstadoPago.CONFIRMADO:
                continue
            lote = self._memoria.lotes.get(pago.lote_id)
            if lote is not None and lote.finca_id in fincas:
                total += pago.monto_productor
        return round(total, 2)


class InMemoryFincaRepo:
    def __init__(self, memoria: Memoria) -> None:
        self._memoria = memoria

    def buscar_por_id(self, finca_id: uuid.UUID) -> Finca | None:
        return self._memoria.fincas.get(finca_id)

    def listar_por_productor(self, productor_id: uuid.UUID) -> list[Finca]:
        return [f for f in self._memoria.fincas.values() if f.productor_id == productor_id]

    def listar_por_cooperativa(self, cooperativa_id: uuid.UUID) -> list[Finca]:
        return [f for f in self._memoria.fincas.values() if f.cooperativa_id == cooperativa_id]

    def listar_todas(self) -> list[Finca]:
        return list(self._memoria.fincas.values())


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

    def guardar(self, usuario: Usuario) -> Usuario:
        self._memoria.usuarios[usuario.id] = usuario
        return usuario

    def listar_cooperativas(self) -> list[Cooperativa]:
        return [
            Cooperativa(id=usuario.id, nombre=usuario.nombre)
            for usuario in self._memoria.usuarios.values()
            if usuario.rol.value == "cooperativa"
        ]

    def listar_compradores(self) -> list[Usuario]:
        return [
            usuario
            for usuario in self._memoria.usuarios.values()
            if usuario.rol.value == "comprador"
        ]


class InMemoryPropinaRepo:
    def __init__(self, memoria: Memoria) -> None:
        self._memoria = memoria

    def guardar_propina(self, propina: Propina) -> Propina:
        self._memoria.propinas[propina.id] = propina
        if propina.clave_idempotencia is not None:
            self._memoria.propinas_idempotencia[propina.clave_idempotencia] = propina
        return propina

    def buscar_por_lote(self, lote_id: uuid.UUID) -> list[Propina]:
        return [p for p in self._memoria.propinas.values() if p.lote_id == lote_id]

    def buscar_por_idempotencia(self, clave: str) -> Propina | None:
        return self._memoria.propinas_idempotencia.get(clave)

    def buscar_por_productor(
        self, productor_id: uuid.UUID, cursor: Cursor | None, limit: int
    ) -> tuple[list[Propina], Cursor | None]:
        propinas = [p for p in self._memoria.propinas.values() if p.productor_id == productor_id]
        return _paginar(propinas, cursor, limit)

    def buscar_por_comprador(
        self, comprador_id: uuid.UUID, cursor: Cursor | None, limit: int
    ) -> tuple[list[Propina], Cursor | None]:
        propinas = [p for p in self._memoria.propinas.values() if p.comprador_id == comprador_id]
        return _paginar(propinas, cursor, limit)

    def total_confirmado_por_productor(self, productor_id: uuid.UUID) -> float:
        """Suma las propinas confirmadas del productor (100% directas, ADR-10)."""
        return round(
            sum(
                p.monto
                for p in self._memoria.propinas.values()
                if p.productor_id == productor_id
                and p.estado_propina is EstadoPropina.CONFIRMADA
            ),
            2,
        )


class InMemoryEvidenciaRepo:
    """Metadata de evidencias en memoria; el binario vive en el almacén."""

    def __init__(self, memoria: Memoria) -> None:
        self._memoria = memoria

    def crear(self, evidencia: Evidencia) -> Evidencia:
        self._memoria.evidencias[evidencia.id] = evidencia
        return evidencia

    def buscar_por_id(self, evidencia_id: uuid.UUID) -> Evidencia | None:
        return self._memoria.evidencias.get(evidencia_id)

    def buscar_adjunta_por_lote(self, lote_id: uuid.UUID) -> Evidencia | None:
        for evidencia in self._memoria.evidencias.values():
            if evidencia.lote_id == lote_id and evidencia.estado is EstadoEvidencia.ADJUNTA:
                return evidencia
        return None

    def marcar_adjunta(self, evidencia_id: uuid.UUID, cuando: datetime) -> None:
        evidencia = self._memoria.evidencias.get(evidencia_id)
        if evidencia is not None:
            evidencia.estado = EstadoEvidencia.ADJUNTA
            evidencia.adjuntada_en = cuando


class FakeGatewayPagos:
    """Gateway de desarrollo: tx determinista y confirmación simulada.

    La integración real con Polygon (web3.py) está documentada en
    `docs/06-contratos.md` y en pausa hasta retomar la sección de contratos.
    """

    def emitir_pago(self, pago: Pago) -> str:
        return "0x" + pago.id.hex

    def confirmar_pago(self, tx_hash: str) -> bool:
        return bool(tx_hash)


class InMemoryAnclaRepo:
    """Anclaje en memoria con lease global y fencing (espejo de la migración 012)."""

    def __init__(self, memoria: Memoria) -> None:
        self._memoria = memoria
        self._lock = threading.Lock()

    def encolar(self, ancla: AnclaBlockchain) -> AnclaBlockchain:
        with self._lock:
            existente = self.buscar_por_certificado(ancla.qr_certificado_id)
            if existente is not None:
                return existente
            self._memoria.anclas[ancla.id] = ancla
            return ancla

    def buscar_por_certificado(self, qr_id: uuid.UUID) -> AnclaBlockchain | None:
        return next(
            (a for a in self._memoria.anclas.values() if a.qr_certificado_id == qr_id),
            None,
        )

    def buscar_por_lote(self, lote_id: uuid.UUID) -> AnclaBlockchain | None:
        return next((a for a in self._memoria.anclas.values() if a.lote_id == lote_id), None)

    # ------------------------------------------------------------ lock global

    def adquirir_lock(self, nombre: str, lease_segundos: int) -> uuid.UUID | None:
        with self._lock:
            ahora = datetime.now(UTC)
            actual = self._memoria.anclas_locks.get(nombre)
            if actual is not None and actual["hasta"] > ahora:
                return None
            token = uuid.uuid4()
            self._memoria.anclas_locks[nombre] = {
                "token": token,
                "hasta": ahora + timedelta(seconds=lease_segundos),
            }
            return token

    def renovar_lock(self, nombre: str, token: uuid.UUID, lease_segundos: int) -> bool:
        with self._lock:
            actual = self._memoria.anclas_locks.get(nombre)
            if actual is None or actual["token"] != token:
                return False
            actual["hasta"] = datetime.now(UTC) + timedelta(seconds=lease_segundos)
            return True

    def liberar_lock(self, nombre: str, token: uuid.UUID) -> bool:
        with self._lock:
            actual = self._memoria.anclas_locks.get(nombre)
            if actual is None or actual["token"] != token:
                return False
            del self._memoria.anclas_locks[nombre]
            return True

    # ------------------------------------------------------------- trabajos

    def reclamar_siguiente(
        self, nombre: str, lock_token: uuid.UUID, lease_segundos: int
    ) -> AnclaBlockchain | None:
        with self._lock:
            ahora = datetime.now(UTC)
            actual = self._memoria.anclas_locks.get(nombre)
            if (
                actual is None
                or actual["token"] != lock_token
                or actual["hasta"] <= ahora
            ):
                # Fencing: un worker vencido o con token ajeno no reclama nada.
                return None
            candidatas = sorted(
                (
                    a
                    for a in self._memoria.anclas.values()
                    if a.estado
                    in (EstadoAncla.PENDIENTE, EstadoAncla.ENVIANDO, EstadoAncla.ENVIADA)
                    and a.proximo_intento <= ahora
                    and (a.lock_hasta is None or a.lock_hasta <= ahora)
                ),
                key=lambda a: (a.creado_en, a.id),
            )
            if not candidatas:
                return None
            ancla = candidatas[0]
            ancla.lock_token = lock_token
            ancla.lock_hasta = ahora + timedelta(seconds=lease_segundos)
            return ancla

    def marcar_enviando(
        self, ancla_id: uuid.UUID, lock_token: uuid.UUID, nonce: int, tx_hash: str
    ) -> None:
        ancla = self._exigir_fencing(ancla_id, lock_token)
        ancla.estado = EstadoAncla.ENVIANDO
        ancla.nonce = nonce
        ancla.tx_hash = tx_hash
        ancla.actualizado_en = datetime.now(UTC)

    def marcar_enviada(
        self,
        ancla_id: uuid.UUID,
        lock_token: uuid.UUID,
        tx_hash: str,
        enviada_en: datetime,
    ) -> None:
        ancla = self._exigir_fencing(ancla_id, lock_token)
        ancla.estado = EstadoAncla.ENVIADA
        ancla.tx_hash = tx_hash
        ancla.enviada_en = enviada_en
        ancla.ultimo_chequeo_en = enviada_en
        ancla.actualizado_en = datetime.now(UTC)

    def marcar_confirmada(
        self,
        ancla_id: uuid.UUID,
        lock_token: uuid.UUID,
        bloque: int,
        tx_hash: str,
        confirmada_en: datetime,
    ) -> None:
        ancla = self._exigir_fencing(ancla_id, lock_token)
        ancla.estado = EstadoAncla.CONFIRMADA
        ancla.bloque = bloque
        ancla.tx_hash = tx_hash
        ancla.confirmada_en = confirmada_en
        ancla.ultimo_chequeo_en = confirmada_en
        ancla.codigo_error = None
        ancla.error = None
        self._liberar(ancla)

    def marcar_fallida(
        self,
        ancla_id: uuid.UUID,
        lock_token: uuid.UUID,
        codigo: str,
        error: str,
        proximo_intento: datetime,
    ) -> None:
        ancla = self._exigir_fencing(ancla_id, lock_token)
        ancla.estado = EstadoAncla.FALLIDA
        ancla.codigo_error = codigo
        ancla.error = error
        ancla.proximo_intento = proximo_intento
        self._liberar(ancla)

    def reprogramar(
        self,
        ancla_id: uuid.UUID,
        lock_token: uuid.UUID,
        proximo_intento: datetime,
        codigo: str,
        error: str,
        contar_intento: bool = True,
    ) -> None:
        ancla = self._exigir_fencing(ancla_id, lock_token)
        if contar_intento:
            ancla.intentos += 1
        ancla.proximo_intento = proximo_intento
        ancla.codigo_error = codigo
        ancla.error = error
        ancla.ultimo_chequeo_en = datetime.now(UTC)
        # Se conserva el token y el lock_hasta: el mismo worker puede seguir
        # operando la fila; otro worker la reclamará al vencer el lease.
        ancla.actualizado_en = datetime.now(UTC)

    def marcar_reintento_manual(self, ancla_id: uuid.UUID, proximo_intento: datetime) -> None:
        ancla = self._memoria.anclas.get(ancla_id)
        if ancla is None:
            return
        ancla.estado = EstadoAncla.PENDIENTE
        ancla.tx_hash = None
        ancla.nonce = None
        ancla.bloque = None
        ancla.enviada_en = None
        ancla.confirmada_en = None
        ancla.codigo_error = None
        ancla.error = None
        ancla.proximo_intento = proximo_intento
        self._liberar(ancla)

    def _exigir_fencing(
        self, ancla_id: uuid.UUID, lock_token: uuid.UUID
    ) -> AnclaBlockchain:
        ancla = self._memoria.anclas.get(ancla_id)
        if ancla is None:
            raise FencingPerdido("El ancla ya no existe.")
        if ancla.lock_token != lock_token:
            raise FencingPerdido("El lease venció: otro worker tomó el trabajo.")
        return ancla

    @staticmethod
    def _liberar(ancla: AnclaBlockchain) -> None:
        ancla.lock_token = None
        ancla.lock_hasta = None
        ancla.actualizado_en = datetime.now(UTC)


class FakeGatewayTrazabilidad:
    """Gateway de anclaje simulado para dev y tests (sin cadena).

    `confirmar_al_enviar=True` mina en el acto (camino feliz). Con `False`, la tx
    queda pendiente hasta `minar_pendientes()`, lo que permite probar `ENVIADA`,
    el backoff y la recuperación por evento.
    """

    _ACTOR = "0x" + "11" * 20

    def __init__(
        self,
        *,
        confirmar_al_enviar: bool = True,
        chain_id: int = 84532,
        contrato: str = "0x" + "ab" * 20,
        code_hash: str = "0x" + "cd" * 32,
        confirmaciones_requeridas: int = 2,
    ) -> None:
        self._chain_id = chain_id
        self._contrato = contrato
        self._code_hash = code_hash
        self.confirmaciones_requeridas = confirmaciones_requeridas
        self.confirmaciones = 0
        self._anclas: dict[str, AnclaOnchain] = {}
        self._txs: dict[str, list] = {}
        self._bloque = 1000
        self._nonce = 0
        self.confirmar_al_enviar = confirmar_al_enviar
        # Simula una RPC caída: `preparar_ancla`/`transmitir_ancla` lanzan error.
        self.fallar_transitorio = False
        # Simula una RPC caída antes de reservar nonce (fallo contabilizable).
        self.fallar_nonce = False
        # Simula el techo de tarifa insuficiente (antes de firmar).
        self.fallar_fee_cap = False
        # Simula saldo insuficiente para gas + reserva (antes de firmar).
        self.fallar_saldo = False
        # Simula un crash tras transmitir: mina la tx pero no devuelve el hash.
        self.perder_respuesta = False
        # Fuerza un fallo de preflight con ese código (p.ej. "CADENA_INCORRECTA").
        self.fallar_preflight: str | None = None

    @property
    def chain_id(self) -> int:
        return self._chain_id

    @property
    def contrato(self) -> str:
        return self._contrato

    @property
    def code_hash(self) -> str:
        return self._code_hash

    def preflight(self) -> None:
        if self.fallar_preflight is not None:
            raise ErrorAnclajePermanente(
                "Preflight falló (fake).", codigo=self.fallar_preflight
            )

    def leer_ancla(self, lote_id_bytes32: str) -> AnclaOnchain | None:
        return self._anclas.get(lote_id_bytes32.lower())

    def buscar_ancla_por_evento(
        self, lote_id_bytes32: str, hash_raiz_bytes32: str, desde_bloque: int
    ) -> ReciboAncla | None:
        for tx_hash, registro in self._txs.items():
            lote, hash_raiz, _nonce, bloque = registro
            if (
                lote.lower() == lote_id_bytes32.lower()
                and hash_raiz.lower() == hash_raiz_bytes32.lower()
                and bloque is not None
                and bloque >= desde_bloque
            ):
                return ReciboAncla(
                    tx_hash=tx_hash,
                    bloque=bloque,
                    lote_id_bytes32=lote_id_bytes32,
                    hash_raiz=hash_raiz_bytes32,
                    actor=self._ACTOR,
                )
        return None

    def reservar_nonce(self) -> int:
        if self.fallar_nonce:
            raise ErrorAnclajeTransitorio("RPC caído al reservar nonce (fake).")
        nonce = self._nonce
        self._nonce += 1
        return nonce

    def preparar_ancla(
        self, lote_id_bytes32: str, hash_raiz_bytes32: str, nonce: int
    ) -> TransaccionPreparada:
        if self.fallar_transitorio:
            raise ErrorAnclajeTransitorio("RPC caído (fake).")
        if self.fallar_fee_cap:
            raise ErrorAnclajeTransitorio(
                "Techo de tarifa insuficiente (fake).", codigo="FEE_CAP_TOO_LOW"
            )
        if self.fallar_saldo:
            raise ErrorAnclajeTransitorio(
                "Saldo insuficiente (fake).", codigo="SALDO_INSUFICIENTE"
            )
        tx_hash = "0x" + uuid.uuid4().hex + uuid.uuid4().hex
        self._txs[tx_hash] = [lote_id_bytes32, hash_raiz_bytes32, nonce, None]
        return TransaccionPreparada(tx_hash=tx_hash, raw_transaction=b"fake-raw-tx")

    def transmitir_ancla(self, transaccion: TransaccionPreparada) -> str:
        if self.fallar_transitorio:
            raise ErrorAnclajeTransitorio("RPC caído (fake).")
        tx_hash = transaccion.tx_hash
        if tx_hash not in self._txs:
            raise ErrorAnclajeTransitorio(
                "Transacción desconocida para el gateway fake.", codigo="TX_DESCONOCIDA"
            )
        if self.confirmar_al_enviar:
            self._minar(tx_hash)
        if self.perder_respuesta:
            raise ErrorAnclajeTransitorio(
                "Respuesta perdida tras transmitir (fake).", codigo="BROADCAST_INCIERTO"
            )
        return tx_hash

    def confirmar_ancla(
        self, tx_hash: str, lote_id_bytes32: str, hash_raiz_bytes32: str
    ) -> ReciboAncla | None:
        registro = self._txs.get(tx_hash)
        if registro is None:
            raise ErrorAnclajeTransitorio(
                "Transacción desconocida para el gateway fake.", codigo="TX_DESCONOCIDA"
            )
        if registro[3] is None or self.confirmaciones < self.confirmaciones_requeridas:
            return None
        onchain = self._anclas.get(lote_id_bytes32.lower())
        if onchain is None or onchain.hash_raiz.lower() != hash_raiz_bytes32.lower():
            raise ErrorAnclajePermanente(
                "El hash on-chain no coincide con el anclaje.", codigo="EVENTO_INVALIDO"
            )
        return ReciboAncla(
            tx_hash=tx_hash,
            bloque=registro[3],
            lote_id_bytes32=lote_id_bytes32,
            hash_raiz=hash_raiz_bytes32,
            actor=self._ACTOR,
        )

    def minar_pendientes(self) -> None:
        """Mina todas las tx pendientes (simula confirmaciones de bloque)."""
        for tx_hash, registro in self._txs.items():
            if registro[3] is None:
                self._minar(tx_hash)
        self.confirmaciones = self.confirmaciones_requeridas

    def simular_ancla_ajena(self, lote_id_bytes32: str, hash_raiz_bytes32: str) -> None:
        """Inyecta un anclaje preexistente (para probar reconciliación/colisión)."""
        self._anclas[lote_id_bytes32.lower()] = AnclaOnchain(
            hash_raiz=hash_raiz_bytes32, actor=self._ACTOR, anchored_at=0
        )

    def _minar(self, tx_hash: str) -> None:
        registro = self._txs[tx_hash]
        registro[3] = self._bloque
        self._anclas[registro[0].lower()] = AnclaOnchain(
            hash_raiz=registro[1], actor=self._ACTOR, anchored_at=self._bloque
        )
        self._bloque += 1
        self.confirmaciones = self.confirmaciones_requeridas


class InMemorySesionRefreshRepo:
    """Sesiones de refresh en memoria, con lock para consumo atómico."""

    def __init__(self) -> None:
        self._por_jti: dict[uuid.UUID, SesionRefresh] = {}
        self._lock = threading.Lock()

    def crear(self, sesion: SesionRefresh) -> None:
        with self._lock:
            self._por_jti[sesion.jti] = sesion

    def buscar(self, jti: uuid.UUID) -> SesionRefresh | None:
        with self._lock:
            return self._por_jti.get(jti)

    def consumir(self, jti: uuid.UUID) -> bool:
        with self._lock:
            sesion = self._por_jti.get(jti)
            if (
                sesion is None
                or sesion.consumida_en is not None
                or sesion.revocada_en is not None
                or sesion.expira_en <= datetime.now(UTC)
            ):
                return False
            sesion.consumida_en = datetime.now(UTC)
            return True

    def revocar_familia(self, familia_id: uuid.UUID) -> None:
        with self._lock:
            ahora = datetime.now(UTC)
            for sesion in self._por_jti.values():
                if sesion.familia_id == familia_id and sesion.revocada_en is None:
                    sesion.revocada_en = ahora

    def revocar_usuario(self, usuario_id: uuid.UUID) -> None:
        with self._lock:
            ahora = datetime.now(UTC)
            for sesion in self._por_jti.values():
                if sesion.usuario_id == usuario_id and sesion.revocada_en is None:
                    sesion.revocada_en = ahora
