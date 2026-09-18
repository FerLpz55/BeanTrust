"""Servicio de anclaje del Pasaporte en la cadena (ADR-11, Base Sepolia).

Única capa que conoce la conversión canónica a `bytes32`, la máquina de estados
del ancla y la política de reintentos. El QR y la verificación off-chain NUNCA
dependen de la cadena: si el RPC falla, el certificado se emite igual y el
trabajo queda encolado.

Endurecimiento (012):
- lease global del worker con token de fencing;
- `ENVIANDO` (nonce reservado, transmisión incierta) nunca se reenvía a ciegas;
- recuperación por logs `HashAnchored` si el `tx_hash` no se persistió;
- `CONFIRMADA` exige siempre `tx_hash` y bloque reales;
- reintento admin solo para causas reintentables y si no hay ancla on-chain.

Conversión canónica (probada en ambos lados contra `contracts/`):
- UUID de `lotes.id` -> 16 bytes hexadecimales rellenados a la derecha hasta `bytes32`.
- `qr_certificado.hash_sha256` -> sus 64 caracteres hexadecimales como `bytes32`.
- No se aplica `keccak256`: el hash ya es el SHA-256 canónico del Pasaporte.
"""

from __future__ import annotations

import hmac
import logging
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.models.dominio import (
    AnclaBlockchain,
    AnclaNoEncontrada,
    AnclaNoReintentable,
    CertificadoQR,
    ErrorAnclaje,
    ErrorAnclajePermanente,
    ErrorAnclajeTransitorio,
    EstadoAncla,
    FencingPerdido,
    Lote,
    ahora_utc,
)

logger = logging.getLogger(__name__)

_HEX = set("0123456789abcdef")
_URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)
_SECRET_RE = re.compile(r"0x[0-9a-fA-F]{64}")

# Causas que NO se pueden reencolar: un anclaje distinto es definitivo.
CODIGOS_NO_REINTENTABLES = frozenset({"HASH_ONCHAIN_DISTINTO", "ANCLA_PREVIA"})


def lote_id_a_bytes32(lote_id: uuid.UUID) -> str:
    """UUID -> `bytes32` con los 16 bytes a la izquierda y ceros a la derecha."""
    return "0x" + lote_id.hex + "0" * 32


def bytes32_a_lote_id(valor: str) -> uuid.UUID:
    """Inverso de `lote_id_a_bytes32` (solo para verificación/diagnóstico)."""
    limpio = _limpiar_hex(valor)
    return uuid.UUID(hex=limpio[:32])


def hash_a_bytes32(hash_sha256: str) -> str:
    """SHA-256 hexadecimal (64 chars) -> `bytes32` sin recomputar el hash."""
    limpio = _limpiar_hex(hash_sha256)
    return "0x" + limpio


def bytes32_a_hash(valor: str) -> str:
    """`bytes32` -> hexadecimal de 64 caracteres (formato de `qr_certificado`)."""
    return _limpiar_hex(valor)


def _limpiar_hex(valor: str) -> str:
    limpio = valor.strip().lower()
    if limpio.startswith("0x"):
        limpio = limpio[2:]
    if len(limpio) != 64 or any(c not in _HEX for c in limpio):
        raise ValueError("Se esperaba un hexadecimal de 64 caracteres (bytes32).")
    return limpio


def error_sanitizado(exc: BaseException) -> str:
    """Mensaje seguro para persistir: sin URLs ni claves privadas."""
    mensaje = f"{type(exc).__name__}: {exc}"
    mensaje = _URL_RE.sub("<url>", mensaje)
    mensaje = _SECRET_RE.sub("<clave>", mensaje)
    return mensaje[:200]


@dataclass
class ResumenReconciliacion:
    """Contadores del pase del worker (respuesta del endpoint de cron)."""

    habilitado: bool
    worker_adquirido: bool = False
    procesadas: int = 0
    enviadas: int = 0
    confirmadas: int = 0
    reconciliadas: int = 0
    reprogramadas: int = 0
    fallidas: int = 0


class TrazabilidadService:
    def __init__(
        self,
        *,
        repo_anclas,
        gateway,
        habilitado: bool,
        contrato: str,
        code_hash: str,
        chain_id: int,
        confirmaciones: int,
        explorer_base_url: str,
        explorer_label: str,
        red_nombre: str,
        max_intentos: int,
        lease_segundos: int,
        max_batch_size: int,
        pending_ttl_segundos: int,
        deployment_block: int,
        lock_nombre: str,
        cron_secret: str,
    ) -> None:
        self._repo = repo_anclas
        self._gateway = gateway
        self._habilitado = habilitado
        self._contrato = contrato
        self._code_hash = code_hash
        self._chain_id = chain_id
        self._confirmaciones = confirmaciones
        self._explorer_base_url = explorer_base_url.rstrip("/")
        self._explorer_label = explorer_label
        self._red_nombre = red_nombre
        self._max_intentos = max_intentos
        self._lease = lease_segundos
        self._max_batch = max_batch_size
        self._pending_ttl = pending_ttl_segundos
        self._deployment_block = deployment_block
        self._lock_nombre = lock_nombre
        self._cron_secret = cron_secret

    @property
    def habilitado(self) -> bool:
        return self._habilitado

    @property
    def chain_id(self) -> int:
        return self._chain_id

    @property
    def contrato(self) -> str:
        return self._contrato

    @property
    def explorer_base_url(self) -> str:
        return self._explorer_base_url

    @property
    def explorer_label(self) -> str:
        return self._explorer_label

    @property
    def red_nombre(self) -> str:
        return self._red_nombre

    def validar_cron_secret(self, valor: str | None) -> bool:
        if not self._cron_secret or valor is None:
            return False
        return hmac.compare_digest(valor, self._cron_secret)

    # ------------------------------------------------------------------ encolado

    def encolar_certificado(self, qr: CertificadoQR, lote: Lote) -> AnclaBlockchain | None:
        """Encola el anclaje al emitir el Pasaporte. No-op si web3 está apagado.

        Idempotente por `qr_certificado_id` (el trigger de la migración 011 ya
        pudo crearlo en la misma transacción del INSERT del certificado).
        """
        if not self._habilitado:
            return None
        ancla = AnclaBlockchain(
            id=uuid.uuid4(),
            qr_certificado_id=qr.id,
            lote_id=lote.id,
            lote_id_bytes32=lote_id_a_bytes32(lote.id),
            hash_raiz=hash_a_bytes32(qr.hash_sha256),
            chain_id=self._chain_id,
            contrato=self._contrato or None,
            runtime_code_hash=self._code_hash or None,
        )
        return self._repo.encolar(ancla)

    def estado_publico(self, lote_id: uuid.UUID) -> AnclaBlockchain | None:
        """Ancla visible en el Pasaporte. `None` si web3 está apagado o no hay ancla."""
        if not self._habilitado:
            return None
        return self._repo.buscar_por_lote(lote_id)

    def explorer_url(self, tx_hash: str) -> str:
        return f"{self._explorer_base_url}/tx/{tx_hash}"

    # ------------------------------------------------------------------ worker

    def reconciliar(self) -> ResumenReconciliacion:
        resumen = ResumenReconciliacion(habilitado=self._habilitado)
        if not self._habilitado:
            return resumen
        token = self._repo.adquirir_lock(self._lock_nombre, self._lease)
        if token is None:
            return resumen
        resumen.worker_adquirido = True
        try:
            try:
                self._gateway.preflight()
            except ErrorAnclaje as exc:
                # Configuración/cadena mal: no se firma nada y se devuelve resumen.
                logger.warning("Preflight de anclaje falló: %s", error_sanitizado(exc))
                return resumen
            try:
                for _ in range(self._max_batch):
                    if not self._repo.renovar_lock(
                        self._lock_nombre, token, self._lease
                    ):
                        # El lease se perdió: otro worker tomó el trabajo. No se
                        # continúa el lote ni se oculta la pérdida como éxito.
                        raise FencingPerdido("El lease global venció durante el lote.")
                    ancla = self._repo.reclamar_siguiente(
                        self._lock_nombre, token, self._lease
                    )
                    if ancla is None:
                        break
                    resumen.procesadas += 1
                    try:
                        resultado = self._procesar(ancla, token)
                    except FencingPerdido:
                        # Otro dueño tomó el trabajo: se abandona el lote.
                        raise
                    except ErrorAnclajePermanente as exc:
                        self._repo.marcar_fallida(
                            ancla.id,
                            token,
                            exc.codigo,
                            error_sanitizado(exc),
                            self._siguiente_intento(ancla),
                        )
                        resumen.fallidas += 1
                    except ErrorAnclajeTransitorio as exc:
                        self._reprogramar_o_fallar(ancla, token, exc, resumen)
                    except Exception as exc:
                        self._reprogramar_o_fallar(ancla, token, exc, resumen)
                    else:
                        self._contabilizar(resultado, resumen)
            except FencingPerdido as exc:
                logger.warning("Fencing perdido en el worker: %s", exc)
        finally:
            self._repo.liberar_lock(self._lock_nombre, token)
        return resumen

    @staticmethod
    def _contabilizar(resultado: str, resumen: ResumenReconciliacion) -> None:
        if resultado == "confirmada":
            resumen.confirmadas += 1
        elif resultado == "reconciliada":
            resumen.reconciliadas += 1
        elif resultado == "enviada":
            resumen.enviadas += 1
        elif resultado == "reprogramada":
            resumen.reprogramadas += 1
        elif resultado == "fallida":
            resumen.fallidas += 1

    def _procesar(self, ancla: AnclaBlockchain, token: uuid.UUID) -> str:
        if ancla.estado is EstadoAncla.ENVIANDO:
            return self._recuperar_enviando(ancla, token)
        if ancla.estado is EstadoAncla.ENVIADA:
            return self._confirmar_enviada(ancla, token)
        return self._transmitir(ancla, token)

    def _recuperar_enviando(self, ancla: AnclaBlockchain, token: uuid.UUID) -> str:
        """`ENVIANDO`: nonce reservado y transmisión incierta. Nunca se reenvía.

        Se recupera primero por el `tx_hash` ya persistido (paso previo al
        broadcast); los logs son solo el respaldo si el hash no quedó guardado.
        """
        recibo = None
        if ancla.tx_hash:
            recibo = self._gateway.confirmar_ancla(
                ancla.tx_hash, ancla.lote_id_bytes32, ancla.hash_raiz
            )
        if recibo is None:
            recibo = self._gateway.buscar_ancla_por_evento(
                ancla.lote_id_bytes32, ancla.hash_raiz, self._deployment_block
            )
        if recibo is not None:
            self._repo.marcar_confirmada(
                ancla.id, token, recibo.bloque, recibo.tx_hash, ahora_utc()
            )
            return "reconciliada"
        inicio = ancla.enviada_en or ancla.creado_en
        if (datetime.now(UTC) - inicio).total_seconds() > self._pending_ttl:
            self._repo.marcar_fallida(
                ancla.id,
                token,
                "TTL_EXCEDIDO",
                "Transmisión incierta sin evento tras el TTL.",
                self._siguiente_intento(ancla),
            )
            return "fallida"
        self._repo.reprogramar(
            ancla.id,
            token,
            self._siguiente_intento(ancla),
            "BROADCAST_INCIERTO",
            "Esperando la aparición del evento.",
            contar_intento=False,
        )
        return "reprogramada"

    def _confirmar_enviada(self, ancla: AnclaBlockchain, token: uuid.UUID) -> str:
        if not ancla.tx_hash:
            self._repo.marcar_fallida(
                ancla.id,
                token,
                "SIN_TX_HASH",
                "ENVIADA sin tx_hash persistido.",
                self._siguiente_intento(ancla),
            )
            return "fallida"
        recibo = self._gateway.confirmar_ancla(
            ancla.tx_hash, ancla.lote_id_bytes32, ancla.hash_raiz
        )
        if recibo is None:
            self._repo.reprogramar(
                ancla.id,
                token,
                self._siguiente_intento(ancla),
                "SIN_CONFIRMAR",
                "Recibo aún sin las confirmaciones exigidas.",
                contar_intento=False,
            )
            return "reprogramada"
        self._repo.marcar_confirmada(
            ancla.id, token, recibo.bloque, recibo.tx_hash, ahora_utc()
        )
        return "confirmada"

    def _transmitir(self, ancla: AnclaBlockchain, token: uuid.UUID) -> str:
        # 1. Recuperación/reconciliación: ¿ya existe el evento exacto?
        recibo = self._gateway.buscar_ancla_por_evento(
            ancla.lote_id_bytes32, ancla.hash_raiz, self._deployment_block
        )
        if recibo is not None:
            self._repo.marcar_confirmada(
                ancla.id, token, recibo.bloque, recibo.tx_hash, ahora_utc()
            )
            return "reconciliada"

        # 2. `isAnchored` solo detecta un anclaje previo; nunca confirma solo.
        onchain = self._gateway.leer_ancla(ancla.lote_id_bytes32)
        if onchain is not None:
            if onchain.hash_raiz.lower() != ancla.hash_raiz.lower():
                self._repo.marcar_fallida(
                    ancla.id,
                    token,
                    "HASH_ONCHAIN_DISTINTO",
                    "El hash on-chain difiere del Pasaporte.",
                    self._siguiente_intento(ancla),
                )
            else:
                self._repo.marcar_fallida(
                    ancla.id,
                    token,
                    "ANCLA_PREVIA",
                    "Existe un anclaje previo sin evento recuperable.",
                    self._siguiente_intento(ancla),
                )
            return "fallida"

        # 3. Preparar (estimar gas, aplicar tarifas, firmar) sin transmitir.
        nonce = self._gateway.reservar_nonce()
        transaccion = self._gateway.preparar_ancla(
            ancla.lote_id_bytes32, ancla.hash_raiz, nonce
        )
        # 4-5. Persistir `ENVIANDO + nonce + tx_hash` ANTES del broadcast: si la
        # transmisión es incierta, el hash ya permite recuperar sin reenviar.
        self._repo.marcar_enviando(ancla.id, token, nonce, transaccion.tx_hash)
        try:
            tx_hash = self._gateway.transmitir_ancla(transaccion)
        except ErrorAnclajeTransitorio as exc:
            # No se sabe si la tx salió: queda ENVIANDO (con tx_hash) para recuperación.
            self._repo.reprogramar(
                ancla.id,
                token,
                self._siguiente_intento(ancla),
                getattr(exc, "codigo", "BROADCAST_INCIERTO"),
                error_sanitizado(exc),
                contar_intento=False,
            )
            return "reprogramada"
        # 6-7. Broadcast aceptado: se registra ENVIADA y se confirma.
        self._repo.marcar_enviada(ancla.id, token, tx_hash, ahora_utc())
        recibo = self._gateway.confirmar_ancla(
            tx_hash, ancla.lote_id_bytes32, ancla.hash_raiz
        )
        if recibo is None:
            self._repo.reprogramar(
                ancla.id,
                token,
                self._siguiente_intento(ancla),
                "SIN_CONFIRMAR",
                "Recibo aún sin las confirmaciones exigidas.",
                contar_intento=False,
            )
            return "enviada"
        self._repo.marcar_confirmada(
            ancla.id, token, recibo.bloque, tx_hash, ahora_utc()
        )
        return "confirmada"

    def _reprogramar_o_fallar(
        self,
        ancla: AnclaBlockchain,
        token: uuid.UUID,
        exc: BaseException,
        resumen: ResumenReconciliacion,
    ) -> None:
        codigo = getattr(exc, "codigo", "ERROR_ANCLAJE")
        if ancla.intentos + 1 >= self._max_intentos:
            self._repo.marcar_fallida(
                ancla.id,
                token,
                "REINTENTOS_AGOTADOS",
                error_sanitizado(exc),
                self._siguiente_intento(ancla),
            )
            resumen.fallidas += 1
            return
        self._repo.reprogramar(
            ancla.id,
            token,
            self._siguiente_intento(ancla),
            codigo,
            error_sanitizado(exc),
            contar_intento=True,
        )
        resumen.reprogramadas += 1

    def _siguiente_intento(self, ancla: AnclaBlockchain) -> datetime:
        """Backoff exponencial acotado a 1 hora."""
        espera = min(30 * (2**ancla.intentos), 3600)
        return datetime.now(UTC) + timedelta(seconds=espera)

    # ------------------------------------------------------------------ admin

    def reintentar(self, lote_id: uuid.UUID) -> AnclaBlockchain:
        """Reencola un ancla FALLIDA (solo administradores, endpoint admin)."""
        ancla = self._repo.buscar_por_lote(lote_id)
        if ancla is None:
            raise AnclaNoEncontrada("El lote no tiene un ancla registrada.")
        if ancla.estado is not EstadoAncla.FALLIDA:
            raise AnclaNoReintentable("Solo se puede reintentar un ancla FALLIDA.")
        if ancla.codigo_error in CODIGOS_NO_REINTENTABLES:
            raise AnclaNoReintentable(
                "El ancla es definitiva (hash distinto o anclaje previo): requiere auditoría."
            )
        # Antes de limpiar estado, se comprueba que la cadena no la haya anclado.
        if self._gateway.leer_ancla(ancla.lote_id_bytes32) is not None:
            raise AnclaNoReintentable("El lote ya está anclado on-chain.")
        self._repo.marcar_reintento_manual(ancla.id, ahora_utc())
        actualizada = self._repo.buscar_por_lote(lote_id)
        return actualizada or ancla
